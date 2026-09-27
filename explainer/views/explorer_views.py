import json
from datetime import datetime, timezone

from django.conf import settings
from django.contrib.auth.decorators import login_required
from django.http import HttpResponse, JsonResponse
from django.shortcuts import render
from django.views.decorators.http import require_GET, require_POST

from integrations.gemini.prompts import list_prompt_templates
from mappers import chat_mapper, profile_mapper, repo_mapper
from services import gemini_service, github_service
from services.github_service import GitHubServiceError
from services.gemini_service import GeminiServiceError


def _json_body(request):
    if request.content_type and 'application/json' in request.content_type:
        return json.loads(request.body.decode('utf-8') or '{}')
    return request.POST


def _json_error(message, status=400):
    return JsonResponse({'ok': False, 'error': message}, status=status)


@require_GET
def explore_page(request):
    user_id = request.user.pk if request.user.is_authenticated else None
    recent = repo_mapper.list_recent_repos(user_id) if user_id else []
    past = chat_mapper.list_past_conversation_ids(
        user_id,
        limit=settings.PAST_CONVERSATION_LIMIT,
    ) if user_id else []
    profile = profile_mapper.get_profile(user_id) if user_id else None
    return render(
        request,
        'explainer/explorer.html',
        {
            'recent_repos': recent,
            'past_conversations': past,
            'prompt_templates': list_prompt_templates(),
            'theme': 'light' if (profile or {}).get('preferred_theme') in ('light', 'solar_paper') else 'dark',
            'has_user_key': profile_mapper.has_gemini_key(user_id) if user_id else False,
        },
    )


@require_POST
def load_repo(request):
    try:
        data = _json_body(request)
        owner, name = github_service.parse_repo_url(data.get('url') or data.get('repo_url'))
        meta = github_service.get_repository(owner, name)
        requested_branch = (data.get('branch') or '').strip()
        default_branch = meta.get('default_branch') or 'main'
        branch = requested_branch or default_branch
        branches = github_service.get_branches(owner, name)
        if default_branch and default_branch not in branches:
            branches.insert(0, default_branch)
        if branch and branch not in branches:
            branches.append(branch)

        tree = github_service.get_tree(owner, name, branch)
        nested = github_service.nest_tree(tree)
        repo_mapper.upsert_repo_cache(owner, name, branch, nested)
        if request.user.is_authenticated:
            repo_mapper.touch_user_repo(request.user.pk, owner, name)
        
        discovery = github_service.extract_repo_keys_and_setup(owner, name, tree, branch)
        past_conversations = []
        if request.user.is_authenticated:
            past_ids = chat_mapper.list_past_conversation_ids(
                request.user.pk,
                limit=settings.PAST_CONVERSATION_LIMIT,
                repo_owner=owner,
                repo_name=name,
            )
            past_conversations = [
                {
                    'conversation_id': row['conversation_id'],
                    'session_type': row['session_type'],
                    'repo_owner': row.get('repo_owner'),
                    'repo_name': row.get('repo_name'),
                    'created_at': row['created_at'].isoformat() if row['created_at'] else None,
                    'context_identifier': row['context_identifier'],
                }
                for row in past_ids
            ]

        return JsonResponse(
            {
                'ok': True,
                'owner': owner,
                'name': name,
                'default_branch': default_branch,
                'active_branch': branch,
                'branches': branches,
                'description': meta.get('description') or '',
                'tree': nested,
                'discovery': discovery,
                'past_conversations': past_conversations,
            }
        )
    except GitHubServiceError as exc:
        return _json_error(str(exc), 400)
    except Exception as exc:
        return _json_error(str(exc), 500)


@require_GET
def file_content(request):
    owner = request.GET.get('owner') or ''
    name = request.GET.get('name') or ''
    path = request.GET.get('path') or ''
    ref = request.GET.get('ref') or 'main'
    if not owner or not name or not path:
        return _json_error('owner, name, and path are required.')
    try:
        payload = github_service.get_file_content(owner, name, path, ref)
        return JsonResponse({'ok': True, **payload})
    except GitHubServiceError as exc:
        return _json_error(str(exc), 400)


@login_required
@require_POST
def ai_chat(request):
    try:
        data = _json_body(request)
    except json.JSONDecodeError:
        return _json_error('Invalid JSON body.')

    provider = (data.get('provider') or 'gemini').strip().lower()
    if provider != 'gemini':
        return _json_error('Select Gemini in the provider control to run this chat.')

    message = (data.get('message') or '').strip()
    if not message:
        return _json_error('Message is required.')

    conversation_id = data.get('conversation_id') or None
    session_type = data.get('session_type') or 'code_explanation'
    repo_owner = data.get('repo_owner') or None
    repo_name = data.get('repo_name') or None
    context_identifier = data.get('context_identifier') or data.get('file_path') or None
    prompt_template_id = data.get('prompt_template_id') or 'beginner_code'

    existing = chat_mapper.get_conversation(conversation_id) if conversation_id else None
    if existing and existing['user_id'] != request.user.pk:
        return _json_error('Conversation not found.', 404)

    if existing:
        raw_messages = existing['messages']
        if isinstance(raw_messages, str):
            history = json.loads(raw_messages)
        else:
            history = list(raw_messages or [])
    else:
        history = []
    previous_interaction_id = existing['gemini_interaction_id'] if existing else None

    extra_context = data.get('extra_context') or ''
    branch = (data.get('branch') or 'main').strip()

    # If asking about codebase or repo architecture, automatically fetch README & all repo .md files
    if repo_owner and repo_name:
        try:
            repo_docs = github_service.get_all_repo_markdown_and_key_context(repo_owner, repo_name, branch=branch)
            if repo_docs:
                extra_context = (
                    f"=== REPOSITORY DOCUMENTATION & CODE MANIFESTS ===\n"
                    f"{repo_docs}\n\n"
                    f"{extra_context}"
                ).strip()
        except Exception:
            pass

    try:
        result = gemini_service.explain_or_chat(
            request.user.pk,
            message,
            provider=provider,
            prompt_template_id=prompt_template_id,
            eli5=bool(data.get('eli5')),
            file_path=data.get('file_path') or '',
            file_content=data.get('file_content') or '',
            repo_owner=repo_owner or '',
            repo_name=repo_name or '',
            extra_context=extra_context,
            previous_interaction_id=previous_interaction_id,
            history=history,
        )
    except GeminiServiceError as exc:
        return _json_error(str(exc), 400)
    except Exception as exc:
        return _json_error(str(exc), 502)

    now = datetime.now(timezone.utc).isoformat()
    history.append({'role': 'user', 'content': message, 'timestamp': now})
    history.append({'role': 'assistant', 'content': result['text'], 'timestamp': now})

    if existing:
        saved = chat_mapper.update_conversation(
            existing['conversation_id'],
            history,
            gemini_interaction_id=result.get('interaction_id'),
        )
    else:
        saved = chat_mapper.create_conversation(
            user_id=request.user.pk,
            session_type=session_type,
            provider=provider,
            repo_owner=repo_owner,
            repo_name=repo_name,
            context_identifier=context_identifier,
            prompt_template_id=prompt_template_id,
            previous_conversation_id=data.get('previous_conversation_id'),
            messages=history,
            gemini_interaction_id=result.get('interaction_id'),
        )

    past_ids = chat_mapper.list_past_conversation_ids(
        request.user.pk,
        limit=settings.PAST_CONVERSATION_LIMIT,
        repo_owner=repo_owner,
        repo_name=repo_name,
    )
    return JsonResponse(
        {
            'ok': True,
            'conversation_id': saved['conversation_id'],
            'reply': result['text'],
            'provider': provider,
            'mode': result.get('mode'),
            'key_source': result.get('key_source'),
            'prompt_template_id': result.get('prompt_template_id'),
            'past_conversation_ids': [row['conversation_id'] for row in past_ids],
            'past_conversations': [
                {
                    'conversation_id': row['conversation_id'],
                    'session_type': row['session_type'],
                    'repo_owner': row.get('repo_owner'),
                    'repo_name': row.get('repo_name'),
                    'created_at': row['created_at'].isoformat() if row['created_at'] else None,
                    'context_identifier': row['context_identifier'],
                }
                for row in past_ids
            ],
        }
    )


@login_required
@require_GET
def conversation_detail(request, conversation_id):
    row = chat_mapper.get_conversation(conversation_id)
    if not row or row['user_id'] != request.user.pk:
        return _json_error('Conversation not found.', 404)
    raw_messages = row['messages']
    if isinstance(raw_messages, str):
        try:
            parsed_messages = json.loads(raw_messages)
        except Exception:
            parsed_messages = []
    else:
        parsed_messages = list(raw_messages or [])
    return JsonResponse(
        {
            'ok': True,
            'conversation_id': row['conversation_id'],
            'repo_owner': row.get('repo_owner'),
            'repo_name': row.get('repo_name'),
            'messages': parsed_messages,
            'prompt_template_id': row['prompt_template_id'],
            'session_type': row['session_type'],
            'context_identifier': row['context_identifier'],
        }
    )


@login_required
@require_GET
def download_notes(request):
    conversation_id = request.GET.get('conversation_id') or ''
    row = chat_mapper.get_conversation(conversation_id)
    if not row or row['user_id'] != request.user.pk:
        return _json_error('Conversation not found.', 404)
    lines = [
        f'# Study notes — {row.get("repo_owner") or ""}/{row.get("repo_name") or ""}',
        f'File: {row.get("context_identifier") or "(repo)"}',
        '',
    ]
    for item in row['messages'] or []:
        role = item.get('role', 'user').upper()
        lines.append(f'## {role}')
        lines.append(item.get('content') or '')
        lines.append('')
    body = '\n'.join(lines)
    response = HttpResponse(body, content_type='text/markdown; charset=utf-8')
    response['Content-Disposition'] = f'attachment; filename="notes-{conversation_id}.md"'
    return response
