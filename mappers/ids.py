import secrets
import string

_ALPHANUM = string.ascii_letters + string.digits


def generate_id(prefix: str, length: int = 16) -> str:
    body = ''.join(secrets.choice(_ALPHANUM) for _ in range(length))
    return f'{prefix}{body}'
