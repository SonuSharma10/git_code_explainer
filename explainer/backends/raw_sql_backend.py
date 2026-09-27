from django.utils.crypto import salted_hmac

from mappers import user_mapper


class _MockPK:
    def value_to_string(self, obj):
        return str(obj.pk)


class _MockMeta:
    pk = _MockPK()


class RawSQLUser:
    _meta = _MockMeta()

    def __init__(self, row):
        self.id = int(row['id'])
        self.pk = int(row['id'])
        self.username = row['username']
        self.email = row['email']
        self.password = row['password_hash']
        self.last_login = None
        self.backend = 'explainer.backends.raw_sql_backend.RawSQLAuthBackend'

    def __str__(self):
        return self.username

    def __eq__(self, other):
        if not isinstance(other, RawSQLUser):
            return False
        return self.pk == other.pk

    def __hash__(self):
        return hash(self.pk)

    def save(self, *args, **kwargs):
        # Raw SQL User compatibility with Django signals (e.g. update_last_login)
        pass

    @property
    def is_authenticated(self):
        return True

    @property
    def is_anonymous(self):
        return False

    @property
    def is_active(self):
        return True

    @property
    def is_staff(self):
        return False

    @property
    def is_superuser(self):
        return False

    def get_username(self):
        return self.username

    def get_session_auth_hash(self):
        key_salt = 'explainer.backends.raw_sql_backend.RawSQLUser'
        return salted_hmac(key_salt, self.password, algorithm='sha256').hexdigest()


class RawSQLAuthBackend:
    def authenticate(self, request, username=None, password=None, **kwargs):
        if not username or not password:
            return None
        row = user_mapper.authenticate_credentials(username, password)
        if row is None:
            return None
        return RawSQLUser(row)

    def get_user(self, user_id):
        try:
            uid = int(user_id)
        except (TypeError, ValueError):
            return None
        row = user_mapper.get_by_id(uid)
        if row is None:
            return None
        return RawSQLUser(row)
