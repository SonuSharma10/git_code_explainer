import json

from google import genai
from google.genai import types


RESPONSE_SCHEMA = types.Schema(
    type=types.Type.OBJECT,
    properties={
        'response': types.Schema(
            type=types.Type.OBJECT,
            required=['data', 'status'],
            properties={
                'data': types.Schema(type=types.Type.STRING),
                'status': types.Schema(type=types.Type.NUMBER),
            },
        ),
    },
)


def generate(*, api_key, user_text, model='gemini-3.1-flash-lite'):
    client = genai.Client(api_key=api_key)
    contents = [
        types.Content(
            role='user',
            parts=[types.Part.from_text(text=user_text)],
        ),
    ]
    generate_content_config = types.GenerateContentConfig(
        response_mime_type='application/json',
        response_schema=RESPONSE_SCHEMA,
    )
    try:
        generate_content_config = types.GenerateContentConfig(
            thinking_config=types.ThinkingConfig(thinking_level='LOW'),
            response_mime_type='application/json',
            response_schema=RESPONSE_SCHEMA,
        )
    except Exception:
        pass

    chunks = []
    for chunk in client.models.generate_content_stream(
        model=model,
        contents=contents,
        config=generate_content_config,
    ):
        if text := chunk.text:
            chunks.append(text)

    raw = ''.join(chunks).strip()
    parsed = _parse_structured(raw)
    return {
        'text': parsed.get('data') or raw,
        'status': parsed.get('status', 200),
        'raw': raw,
        'interaction_id': None,
        'mode': 'generate_content_stream',
    }


def _parse_structured(raw):
    if not raw:
        return {}
    try:
        payload = json.loads(raw)
    except json.JSONDecodeError:
        return {'data': raw, 'status': 200}
    inner = payload.get('response') if isinstance(payload, dict) else None
    if isinstance(inner, dict):
        return inner
    if isinstance(payload, dict) and 'data' in payload:
        return payload
    return {'data': raw, 'status': 200}
