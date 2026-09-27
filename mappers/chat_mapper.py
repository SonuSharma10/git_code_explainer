import json

from mappers.db_connection import get_connection
from mappers.ids import generate_id


def create_conversation(
    user_id,
    session_type,
    provider='gemini',
    repo_owner=None,
    repo_name=None,
    context_identifier=None,
    prompt_template_id=None,
    previous_conversation_id=None,
    messages=None,
    gemini_interaction_id=None,
):
    conversation_id = generate_id('conv_', 16)
    payload = json.dumps(messages or [])
    uid = int(user_id)
    with get_connection() as conn:
        conn.execute(
            """
            INSERT INTO agentic_conversation (
                conversation_id, user_id, previous_conversation_id, gemini_interaction_id,
                provider, session_type, repo_owner, repo_name, context_identifier,
                prompt_template_id, messages
            )
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s::jsonb)
            """,
            (
                conversation_id,
                uid,
                previous_conversation_id,
                gemini_interaction_id,
                provider,
                session_type,
                repo_owner,
                repo_name,
                context_identifier,
                prompt_template_id,
                payload,
            ),
        )
    return get_conversation(conversation_id)


def get_conversation(conversation_id):
    if not conversation_id:
        return None
    with get_connection() as conn:
        return conn.execute(
            """
            SELECT conversation_id, user_id, previous_conversation_id, gemini_interaction_id,
                   provider, session_type, repo_owner, repo_name, context_identifier,
                   prompt_template_id, messages, created_at, updated_at
            FROM agentic_conversation
            WHERE conversation_id = %s
            """,
            (str(conversation_id),),
        ).fetchone()


def update_conversation(conversation_id, messages, gemini_interaction_id=None):
    payload = json.dumps(messages)
    with get_connection() as conn:
        conn.execute(
            """
            UPDATE agentic_conversation
            SET messages = %s::jsonb,
                gemini_interaction_id = COALESCE(%s, gemini_interaction_id),
                updated_at = CURRENT_TIMESTAMP
            WHERE conversation_id = %s
            """,
            (payload, gemini_interaction_id, str(conversation_id)),
        )
    return get_conversation(conversation_id)


def list_past_conversation_ids(user_id, limit=10, repo_owner=None, repo_name=None):
    if not user_id:
        return []
    query = """
        SELECT conversation_id, session_type, repo_owner, repo_name, context_identifier,
               prompt_template_id, created_at, updated_at
        FROM agentic_conversation
        WHERE user_id = %s
    """
    params = [int(user_id)]
    if repo_owner and repo_name:
        query += ' AND repo_owner = %s AND repo_name = %s'
        params.extend([repo_owner, repo_name])
    query += ' ORDER BY created_at DESC LIMIT %s'
    params.append(limit)
    with get_connection() as conn:
        return conn.execute(query, params).fetchall()
