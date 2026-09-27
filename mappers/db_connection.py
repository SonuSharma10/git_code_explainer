from contextlib import contextmanager

import psycopg
from django.conf import settings
from psycopg.rows import dict_row
from psycopg_pool import ConnectionPool

_pool = None


def get_pool():
    global _pool
    if _pool is None:
        dsn = getattr(settings, 'DATABASE_URL', '') or ''
        if not dsn:
            raise RuntimeError(
                'DATABASE_URL is not set in your .env file.\n'
                'Please set DATABASE_URL=postgresql://<user>:<password>@<host>:<port>/<dbname> in .env.'
            )
        _pool = ConnectionPool(
            conninfo=dsn,
            min_size=1,
            max_size=10,
            timeout=10,
            kwargs={'row_factory': dict_row, 'autocommit': False},
        )
    return _pool


@contextmanager
def get_connection():
    pool = get_pool()
    with pool.connection() as conn:
        try:
            yield conn
            conn.commit()
        except Exception:
            conn.rollback()
            raise


def apply_schema(schema_path):
    dsn = getattr(settings, 'DATABASE_URL', '') or ''
    if not dsn:
        raise RuntimeError(
            'DATABASE_URL is not set in your .env file.\n'
            'Please add DATABASE_URL=postgresql://<user>:<password>@<host>:<port>/<dbname> into your .env file.'
        )
    sql = schema_path.read_text(encoding='utf-8')
    try:
        with psycopg.connect(dsn, connect_timeout=10) as conn:
            conn.execute(sql)
            conn.commit()
    except psycopg.OperationalError as exc:
        raise RuntimeError(
            f'Failed to connect to PostgreSQL at: {dsn}\n'
            f'Underlying error: {exc}\n'
            'Please verify your PostgreSQL host, port, username, password, and database name in .env.'
        ) from exc
