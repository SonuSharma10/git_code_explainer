from google import genai
from google.genai import types

from integrations.gemini.generate import generate as structured_generate


def chat(
    *,
    api_key,
    user_text,
    previous_interaction_id=None,
    system_instruction=None,
    history=None,
    model='gemini-3.1-flash-lite',
):
    client = genai.Client(api_key=api_key)
    if previous_interaction_id or hasattr(client, 'interactions'):
        try:
            return _chat_via_interactions(
                client=client,
                model=model,
                user_text=user_text,
                previous_interaction_id=previous_interaction_id,
                system_instruction=system_instruction,
            )
        except (AttributeError, TypeError, Exception):
            pass
    return _chat_via_contents(
        client=client,
        model=model,
        user_text=user_text,
        system_instruction=system_instruction,
        history=history or [],
        api_key=api_key,
    )


def _chat_via_interactions(client, model, user_text, previous_interaction_id, system_instruction):
    kwargs = {
        'model': model,
        'input': user_text,
    }
    if previous_interaction_id:
        kwargs['previous_interaction_id'] = previous_interaction_id
    if system_instruction:
        kwargs['system_instruction'] = system_instruction
    interaction = client.interactions.create(**kwargs)
    text = getattr(interaction, 'output_text', None) or str(interaction)
    interaction_id = getattr(interaction, 'id', None)
    return {
        'text': text,
        'status': 200,
        'interaction_id': interaction_id,
        'mode': 'interactions',
        'raw': text,
    }


def _chat_via_contents(client, model, user_text, system_instruction, history, api_key):
    contents = []
    for item in history:
        role = 'user' if item.get('role') == 'user' else 'model'
        text = item.get('content') or ''
        if not text:
            continue
        contents.append(
            types.Content(role=role, parts=[types.Part.from_text(text=text)])
        )
    contents.append(
        types.Content(role='user', parts=[types.Part.from_text(text=user_text)])
    )
    config_kwargs = {}
    if system_instruction:
        config_kwargs['system_instruction'] = system_instruction
    try:
        config_kwargs['thinking_config'] = types.ThinkingConfig(thinking_level='LOW')
    except Exception:
        pass
    try:
        response = client.models.generate_content(
            model=model,
            contents=contents,
            config=types.GenerateContentConfig(**config_kwargs),
        )
        text = getattr(response, 'text', None) or ''
        if text:
            return {
                'text': text,
                'status': 200,
                'interaction_id': None,
                'mode': 'generate_content',
                'raw': text,
            }
    except Exception:
        pass
    fallback = structured_generate(api_key=api_key, user_text=user_text, model=model)
    fallback['mode'] = 'generate_content_stream'
    return fallback
