import json
import logging
import os
import time
from typing import Any, Dict, Optional

import jwt
from django.conf import settings

logger = logging.getLogger(__name__)

_redis_client = None
_in_memory_cache: Dict[str, Any] = {}
_in_memory_expiry: Dict[str, float] = {}


def get_redis_client():
    global _redis_client
    if _redis_client is not None:
        return _redis_client

    redis_url = getattr(settings, 'REDIS_URL', '') or os.getenv('REDIS_URL', 'redis://127.0.0.1:6379/0')
    try:
        import redis
        client = redis.from_url(redis_url, decode_responses=True, socket_connect_timeout=2)
        client.ping()
        _redis_client = client
        return _redis_client
    except Exception as exc:
        logger.warning(f"Redis not reachable at {redis_url}, using high-speed in-memory cache: {exc}")
        _redis_client = False
        return False


def cache_set(key: str, value: Any, ttl_seconds: int = 3600) -> None:
    client = get_redis_client()
    serialized = json.dumps(value) if not isinstance(value, str) else value
    if client:
        try:
            client.setex(key, ttl_seconds, serialized)
            return
        except Exception:
            pass
    # In-memory fallback
    _in_memory_cache[key] = serialized
    _in_memory_expiry[key] = time.time() + ttl_seconds


def cache_get(key: str, is_json: bool = False) -> Optional[Any]:
    client = get_redis_client()
    raw = None
    if client:
        try:
            raw = client.get(key)
        except Exception:
            raw = None

    if raw is None:
        # Check in-memory
        if key in _in_memory_cache:
            if time.time() <= _in_memory_expiry.get(key, 0):
                raw = _in_memory_cache[key]
            else:
                _in_memory_cache.pop(key, None)
                _in_memory_expiry.pop(key, None)

    if raw is None:
        return None

    if is_json:
        try:
            return json.loads(raw)
        except Exception:
            return raw
    return raw


def cache_delete(key: str) -> None:
    client = get_redis_client()
    if client:
        try:
            client.delete(key)
        except Exception:
            pass
    _in_memory_cache.pop(key, None)
    _in_memory_expiry.pop(key, None)


# ---------------------------------------------------------
# JWT Token Storage against user_id
# ---------------------------------------------------------

JWT_ALGORITHM = 'HS256'
JWT_EXPIRY_SECONDS = 7 * 24 * 3600  # 7 days


def _get_jwt_secret() -> str:
    try:
        return getattr(settings, 'SECRET_KEY', '') or os.getenv('SECRET_KEY', 'repex-jwt-secret-key')
    except Exception:
        return os.getenv('SECRET_KEY', 'repex-jwt-secret-key')


def generate_and_store_jwt(user_id: int, email: str) -> str:
    payload = {
        'user_id': user_id,
        'email': email,
        'iat': int(time.time()),
        'exp': int(time.time()) + JWT_EXPIRY_SECONDS,
    }
    secret = _get_jwt_secret()
    token = jwt.encode(payload, secret, algorithm=JWT_ALGORITHM)
    redis_key = f"jwt:user:{user_id}"
    cache_set(redis_key, token, ttl_seconds=JWT_EXPIRY_SECONDS)
    return token


def get_user_jwt(user_id: int) -> Optional[str]:
    return cache_get(f"jwt:user:{user_id}")


def revoke_user_jwt(user_id: int) -> None:
    cache_delete(f"jwt:user:{user_id}")


def verify_jwt(token: str) -> Optional[Dict[str, Any]]:
    try:
        secret = _get_jwt_secret()
        payload = jwt.decode(token, secret, algorithms=[JWT_ALGORITHM])
        user_id = payload.get('user_id')
        stored_token = get_user_jwt(user_id)
        if stored_token and stored_token != token:
            return None
        return payload
    except Exception:
        return None


# ---------------------------------------------------------
# Repo Tree Cache
# ---------------------------------------------------------

def cache_repo_tree(owner: str, name: str, branch: str, tree_data: Any) -> None:
    key = f"repo_tree:{owner.lower()}:{name.lower()}:{branch}"
    cache_set(key, tree_data, ttl_seconds=7200)  # 2 hours cache


def get_cached_repo_tree(owner: str, name: str, branch: str = 'main') -> Optional[Any]:
    key = f"repo_tree:{owner.lower()}:{name.lower()}:{branch}"
    return cache_get(key, is_json=True)


# ---------------------------------------------------------
# Active Gemini API Key Cache
# ---------------------------------------------------------

def cache_user_active_key(user_id: int, decrypted_key: str) -> None:
    key = f"user_key:{user_id}"
    cache_set(key, decrypted_key, ttl_seconds=1800)  # 30 mins cache


def get_cached_user_active_key(user_id: int) -> Optional[str]:
    return cache_get(f"user_key:{user_id}")


def invalidate_user_key_cache(user_id: int) -> None:
    cache_delete(f"user_key:{user_id}")


# ---------------------------------------------------------
# Guest Session History in Redis
# ---------------------------------------------------------

def store_guest_conversation(guest_id: str, conversation_data: Any) -> None:
    cache_set(f"guest_conv:{guest_id}", conversation_data, ttl_seconds=86400)


def get_guest_conversation(guest_id: str) -> Optional[Any]:
    return cache_get(f"guest_conv:{guest_id}", is_json=True)
