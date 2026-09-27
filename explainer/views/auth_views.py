from django.contrib import messages
from django.contrib.auth import login, logout
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError
from django.shortcuts import redirect, render
from django.views.decorators.http import require_http_methods

from explainer.backends.raw_sql_backend import RawSQLAuthBackend, RawSQLUser
from mappers import profile_mapper, user_mapper
from services import redis_service


@require_http_methods(['GET', 'POST'])
def signup_view(request):
    if request.user.is_authenticated:
        return redirect('explore')
    if request.method == 'POST':
        username = (request.POST.get('username') or '').strip()
        email = (request.POST.get('email') or '').strip()
        password = request.POST.get('password') or ''
        confirm = request.POST.get('password_confirm') or ''
        if not username or not email or not password:
            messages.error(request, 'Username, email, and password are required.')
        elif password != confirm:
            messages.error(request, 'Passwords do not match.')
        elif user_mapper.get_by_username(username):
            messages.error(request, 'That username is already taken.')
        elif user_mapper.get_by_email(email):
            messages.error(request, 'That email is already registered.')
        else:
            try:
                validate_password(password)
                row = user_mapper.create_user(username, email, password)
                profile_mapper.upsert_profile(row['id'])
                # Maintain JWT token in Redis unique for user_id and email
                jwt_token = redis_service.generate_and_store_jwt(row['id'], row['email'])
                request.session['jwt_token'] = jwt_token

                login(request, RawSQLUser(row), backend=RawSQLAuthBackend.__module__ + '.RawSQLAuthBackend')
                messages.success(request, 'Account created. Welcome aboard.')
                return redirect('explore')
            except ValidationError as exc:
                messages.error(request, ' '.join(exc.messages))
            except Exception as exc:
                messages.error(request, f'Could not create account: {exc}')
    return render(request, 'explainer/auth/signup.html')


@require_http_methods(['GET', 'POST'])
def login_view(request):
    if request.user.is_authenticated:
        return redirect('explore')
    if request.method == 'POST':
        username = (request.POST.get('username') or '').strip()
        password = request.POST.get('password') or ''
        backend = RawSQLAuthBackend()
        user = backend.authenticate(request, username=username, password=password)
        if user is None:
            messages.error(request, 'Invalid username/email or password.')
        else:
            # Maintain unique JWT token in Redis for user_id and email
            jwt_token = redis_service.generate_and_store_jwt(user.pk, user.email)
            request.session['jwt_token'] = jwt_token

            login(request, user, backend='explainer.backends.raw_sql_backend.RawSQLAuthBackend')
            return redirect(request.GET.get('next') or 'explore')
    return render(request, 'explainer/auth/login.html')


@require_http_methods(['POST', 'GET'])
def logout_view(request):
    if request.user.is_authenticated:
        redis_service.revoke_user_jwt(request.user.pk)
    request.session.pop('jwt_token', None)
    logout(request)
    messages.success(request, 'Signed out.')
    return redirect('login')
