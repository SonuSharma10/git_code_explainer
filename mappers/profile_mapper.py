from mappers.db_connection import get_connection
from services.crypto_service import decrypt_value, encrypt_value
from services import redis_service


def get_profile(user_id):
    if not user_id:
        return None
    with get_connection() as conn:
        row = conn.execute(
            """
            SELECT id, user_id, preferred_theme, updated_at
            FROM profiles
            WHERE user_id = %s
            """,
            (int(user_id),),
        ).fetchone()
    return row


def upsert_profile(user_id, preferred_theme=None):
    uid = int(user_id)
    existing = get_profile(uid)
    theme = preferred_theme or (existing['preferred_theme'] if existing else 'dark')

    with get_connection() as conn:
        if existing:
            conn.execute(
                """
                UPDATE profiles
                SET preferred_theme = %s,
                    updated_at = CURRENT_TIMESTAMP
                WHERE user_id = %s
                """,
                (theme, uid),
            )
        else:
            conn.execute(
                """
                INSERT INTO profiles (user_id, preferred_theme)
                VALUES (%s, %s)
                """,
                (uid, theme),
            )
    return get_profile(uid)


# ------------------------------------------------------------------
# Multi-Key Vault: Add, List, Activate, Soft Delete, and Decrypt
# ------------------------------------------------------------------

def _make_key_preview(raw_key: str) -> str:
    cleaned = raw_key.strip()
    if len(cleaned) <= 10:
        return f"{cleaned[:3]}...{cleaned[-2:]}"
    return f"{cleaned[:7]}...{cleaned[-4:]}"


def list_user_keys(user_id):
    if not user_id:
        return []
    with get_connection() as conn:
        return conn.execute(
            """
            SELECT id, user_id, key_name, key_preview, is_active, deleted, created_at, updated_at
            FROM user_api_keys
            WHERE user_id = %s AND deleted = FALSE
            ORDER BY created_at DESC
            """,
            (int(user_id),),
        ).fetchall()


def add_user_key(user_id, raw_key: str, key_name: str = 'Gemini API Key'):
    uid = int(user_id)
    raw_key = (raw_key or '').strip()
    if not raw_key:
        raise ValueError('API key cannot be empty.')

    encrypted = encrypt_value(raw_key)
    preview = _make_key_preview(raw_key)

    with get_connection() as conn:
        # Check if user has any active keys; if none, make this one active
        has_active = conn.execute(
            "SELECT id FROM user_api_keys WHERE user_id = %s AND is_active = TRUE AND deleted = FALSE",
            (uid,),
        ).fetchone()

        is_active = True if not has_active else True
        if is_active:
            # Set other keys to inactive
            conn.execute(
                "UPDATE user_api_keys SET is_active = FALSE WHERE user_id = %s",
                (uid,),
            )

        row = conn.execute(
            """
            INSERT INTO user_api_keys (user_id, key_name, encrypted_key, key_preview, is_active, deleted)
            VALUES (%s, %s, %s, %s, %s, FALSE)
            RETURNING id, user_id, key_name, key_preview, is_active, created_at
            """,
            (uid, key_name or 'Gemini API Key', encrypted, preview, is_active),
        ).fetchone()

    redis_service.invalidate_user_key_cache(uid)
    return row


def set_active_key(user_id, key_id: int):
    uid = int(user_id)
    kid = int(key_id)
    with get_connection() as conn:
        conn.execute(
            "UPDATE user_api_keys SET is_active = FALSE WHERE user_id = %s",
            (uid,),
        )
        conn.execute(
            """
            UPDATE user_api_keys
            SET is_active = TRUE, updated_at = CURRENT_TIMESTAMP
            WHERE id = %s AND user_id = %s AND deleted = FALSE
            """,
            (kid, uid),
        )
    redis_service.invalidate_user_key_cache(uid)
    return list_user_keys(uid)


def delete_user_key(user_id, key_id: int):
    uid = int(user_id)
    kid = int(key_id)
    with get_connection() as conn:
        # Soft delete key
        conn.execute(
            """
            UPDATE user_api_keys
            SET deleted = TRUE, is_active = FALSE, updated_at = CURRENT_TIMESTAMP
            WHERE id = %s AND user_id = %s
            """,
            (kid, uid),
        )
        # If no active keys left, make the most recent non-deleted key active
        remaining = conn.execute(
            """
            SELECT id FROM user_api_keys
            WHERE user_id = %s AND deleted = FALSE
            ORDER BY created_at DESC LIMIT 1
            """,
            (uid,),
        ).fetchone()
        if remaining:
            conn.execute(
                "UPDATE user_api_keys SET is_active = TRUE WHERE id = %s",
                (remaining['id'],),
            )

    redis_service.invalidate_user_key_cache(uid)
    return list_user_keys(uid)


def get_decrypted_gemini_key(user_id):
    if not user_id:
        return None
    uid = int(user_id)

    # 1. Check Redis cache first (avoid DB query)
    cached = redis_service.get_cached_user_active_key(uid)
    if cached:
        return cached

    # 2. Query PostgreSQL for active key
    with get_connection() as conn:
        row = conn.execute(
            """
            SELECT encrypted_key
            FROM user_api_keys
            WHERE user_id = %s AND is_active = TRUE AND deleted = FALSE
            LIMIT 1
            """,
            (uid,),
        ).fetchone()

    if not row or not row.get('encrypted_key'):
        return None

    decrypted = decrypt_value(row['encrypted_key'])
    if decrypted:
        redis_service.cache_user_active_key(uid, decrypted)
    return decrypted


def has_gemini_key(user_id):
    if not user_id:
        return False
    return get_decrypted_gemini_key(user_id) is not None
