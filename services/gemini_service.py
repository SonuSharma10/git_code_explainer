from django.conf import settings

from integrations.gemini.chat import chat as gemini_chat
from integrations.gemini.generate import generate as gemini_generate
from integrations.gemini.prompts import build_user_prompt, get_prompt_template
from mappers import profile_mapper


class GeminiServiceError(Exception):
    pass


def resolve_api_key(user_id):
    user_key = profile_mapper.get_decrypted_gemini_key(user_id)
    if user_key:
        return user_key, 'profile'
    if getattr(settings, 'ALLOW_SYSTEM_GEMINI_FALLBACK', True) and settings.GEMINI_API_KEY:
        return settings.GEMINI_API_KEY, 'system'
    raise GeminiServiceError(
        'No Gemini API key available. Add one in Profile, or set GEMINI_API_KEY in .env.'
    )


def explain_or_chat(
    user_id,
    user_message,
    *,
    provider='gemini',
    prompt_template_id='beginner_code',
    eli5=False,
    file_path='',
    file_content='',
    repo_owner='',
    repo_name='',
    extra_context='',
    previous_interaction_id=None,
    history=None,
):
    if provider != 'gemini':
        raise GeminiServiceError(f'Provider "{provider}" is not configured.')

    api_key, key_source = resolve_api_key(user_id)
    template = get_prompt_template(prompt_template_id)
    prompt = build_user_prompt(
        user_message=user_message,
        template=template,
        eli5=eli5,
        file_path=file_path,
        file_content=file_content,
        repo_owner=repo_owner,
        repo_name=repo_name,
        extra_context=extra_context,
    )
    result = gemini_chat(
        api_key=api_key,
        user_text=prompt,
        previous_interaction_id=previous_interaction_id,
        system_instruction=template['system'],
        history=history or [],
        model=settings.GEMINI_MODEL,
    )
    result['key_source'] = key_source
    result['prompt_template_id'] = template['id']
    return result


def structured_generate(user_id, user_text, previous_interaction_id=None):
    api_key, key_source = resolve_api_key(user_id)
    result = gemini_generate(
        api_key=api_key,
        user_text=user_text,
        model=settings.GEMINI_MODEL,
    )
    result['key_source'] = key_source
    result['interaction_id'] = previous_interaction_id
    return result
