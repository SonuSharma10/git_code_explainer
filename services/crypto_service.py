from django.conf import settings
from cryptography.fernet import Fernet, InvalidToken


def _fernet():
    key = getattr(settings, 'FERNET_KEY', '') or ''
    if not key:
        raise RuntimeError(
            'FERNET_KEY is not set. Generate one with: '
            'python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())" '
            'and add it to .env.'
        )
    return Fernet(key.encode('utf-8') if isinstance(key, str) else key)


def encrypt_value(plain_text):
    if not plain_text:
        return None
    return _fernet().encrypt(plain_text.encode('utf-8')).decode('utf-8')


def decrypt_value(token):
    if not token:
        return None
    try:
        return _fernet().decrypt(token.encode('utf-8')).decode('utf-8')
    except InvalidToken as exc:
        raise RuntimeError('Could not decrypt stored API key. Check FERNET_KEY.') from exc
