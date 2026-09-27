from django.contrib.auth.hashers import check_password, make_password

from mappers.db_connection import get_connection


def create_user(username, email, raw_password):
    password_hash = make_password(raw_password)
    with get_connection() as conn:
        row = conn.execute(
            """
            INSERT INTO users (username, email, password_hash)
            VALUES (%s, %s, %s)
            RETURNING id, username, email, password_hash, created_at
            """,
            (username.strip(), email.strip().lower(), password_hash),
        ).fetchone()
    return row


def get_by_id(user_id):
    with get_connection() as conn:
        row = conn.execute(
            "SELECT id, username, email, password_hash, created_at FROM users WHERE id = %s",
            (int(user_id),),
        ).fetchone()
    return row


def get_by_username(username):
    with get_connection() as conn:
        row = conn.execute(
            """
            SELECT id, username, email, password_hash, created_at
            FROM users
            WHERE username = %s
            """,
            (username.strip(),),
        ).fetchone()
    return row


def get_by_email(email):
    with get_connection() as conn:
        row = conn.execute(
            """
            SELECT id, username, email, password_hash, created_at
            FROM users
            WHERE email = %s
            """,
            (email.strip().lower(),),
        ).fetchone()
    return row


def authenticate_credentials(username, raw_password):
    row = get_by_username(username)
    if row is None:
        row = get_by_email(username)
    if row is None:
        return None
    if not check_password(raw_password, row['password_hash']):
        return None
    return row
