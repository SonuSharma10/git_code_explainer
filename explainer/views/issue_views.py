from django.contrib.auth.decorators import login_required
from django.http import JsonResponse
from django.shortcuts import render
from django.views.decorators.http import require_GET, require_POST

from explainer.views.explorer_views import _json_body, _json_error
from mappers import repo_mapper
from services import gemini_service, github_service
from services.gemini_service import GeminiServiceError
from services.github_service import GitHubServiceError


@require_GET
def issues_page(request):
    user_id = request.user.pk if request.user.is_authenticated else None
    recent = repo_mapper.list_recent_repos(user_id) if user_id else []
    has_key = profile_mapper.has_gemini_key(user_id) if user_id else False
    return render(
        request,
        'explainer/issues.html',
        {
            'recent_repos': recent,
            'has_user_key': has_key,
        },
    )


@require_GET
def list_issues(request):
    owner = request.GET.get('owner') or ''
    name = request.GET.get('name') or ''
    query = request.GET.get('q') or ''
    page = int(request.GET.get('page') or 1)
    per_page = int(request.GET.get('per_page') or 15)
    issue_number = request.GET.get('issue_number')

    if not owner or not name:
        return _json_error('Load a repository first.')
    try:
        if issue_number:
            item = github_service.get_single_issue(owner, name, int(issue_number))
            compact = [{
                'number': item.get('number'),
                'title': item.get('title'),
                'body': item.get('body') or '',
                'html_url': item.get('html_url'),
                'labels': [label.get('name') for label in item.get('labels') or []],
                'user': (item.get('user') or {}).get('login'),
                'comments': item.get('comments', 0),
                'created_at': item.get('created_at'),
            }]
            return JsonResponse({'ok': True, 'issues': compact, 'has_more': False, 'page': 1})

        issues = github_service.get_issues(owner, name, query=query, page=page, per_page=per_page)
        compact = [
            {
                'number': item.get('number'),
                'title': item.get('title'),
                'body': item.get('body') or '',
                'html_url': item.get('html_url'),
                'labels': [label.get('name') for label in item.get('labels') or []],
                'user': (item.get('user') or {}).get('login'),
                'comments': item.get('comments', 0),
                'created_at': item.get('created_at'),
            }
            for item in issues
        ]
        has_more = len(issues) >= per_page
        return JsonResponse({'ok': True, 'issues': compact, 'has_more': has_more, 'page': page})
    except GitHubServiceError as exc:
        return _json_error(str(exc), 400)


@login_required
@require_POST
def fix_issue(request):
    data = _json_body(request)
    provider = (data.get('provider') or 'gemini').strip().lower()
    if provider != 'gemini':
        return _json_error('Select Gemini to run Fix with Gemini.')
    title = data.get('title') or ''
    body = data.get('body') or ''
    number = data.get('number')
    message = (
        f'Mentor and analyze GitHub issue #{number}: {title}\n\n'
        f'Issue Description:\n{body}\n\n'
        'Act as a Super Senior Software Engineer and Mentor. Break down the issue intuitively, explain the architectural root cause, brainstorm multiple approaches with trade-offs, recommend the best solution with code/diff, and provide verification advice.'
    )
    try:
        result = gemini_service.explain_or_chat(
            request.user.pk,
            message,
            provider='gemini',
            prompt_template_id='issue_fix',
            file_path=data.get('file_path') or '',
            file_content=data.get('file_content') or '',
            repo_owner=data.get('repo_owner') or '',
            repo_name=data.get('repo_name') or '',
            extra_context=data.get('extra_context') or '',
        )
        return JsonResponse({'ok': True, 'reply': result['text'], 'mode': result.get('mode')})
    except GeminiServiceError as exc:
        return _json_error(str(exc), 400)
    except Exception as exc:
        return _json_error(str(exc), 502)
