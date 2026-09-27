import json

from mappers.db_connection import get_connection


def upsert_repo_cache(repo_owner, repo_name, default_branch, tree_data):
    payload = json.dumps(tree_data)
    with get_connection() as conn:
        row = conn.execute(
            """
            INSERT INTO repo_cache (repo_owner, repo_name, default_branch, tree_data, last_fetched)
            VALUES (%s, %s, %s, %s::jsonb, CURRENT_TIMESTAMP)
            ON CONFLICT (repo_owner, repo_name)
            DO UPDATE SET
                default_branch = EXCLUDED.default_branch,
                tree_data = EXCLUDED.tree_data,
                last_fetched = CURRENT_TIMESTAMP
            RETURNING id
            """,
            (repo_owner, repo_name, default_branch, payload),
        ).fetchone()
        return row['id'] if row else None


def get_repo_cache(repo_owner, repo_name):
    with get_connection() as conn:
        return conn.execute(
            """
            SELECT id, repo_owner, repo_name, default_branch, tree_data, last_fetched
            FROM repo_cache
            WHERE repo_owner = %s AND repo_name = %s
            """,
            (repo_owner, repo_name),
        ).fetchone()


def touch_user_repo(user_id, repo_owner, repo_name):
    if not user_id:
        return
    uid = int(user_id)
    with get_connection() as conn:
        conn.execute(
            """
            INSERT INTO user_repo_history (user_id, repo_owner, repo_name, last_opened)
            VALUES (%s, %s, %s, CURRENT_TIMESTAMP)
            ON CONFLICT (user_id, repo_owner, repo_name)
            DO UPDATE SET last_opened = CURRENT_TIMESTAMP
            """,
            (uid, repo_owner, repo_name),
        )


def list_recent_repos(user_id, limit=12):
    if not user_id:
        return []
    with get_connection() as conn:
        return conn.execute(
            """
            SELECT repo_owner, repo_name, last_opened
            FROM user_repo_history
            WHERE user_id = %s
            ORDER BY last_opened DESC
            LIMIT %s
            """,
            (int(user_id), limit),
        ).fetchall()
