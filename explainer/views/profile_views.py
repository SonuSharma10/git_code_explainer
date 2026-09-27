import json
from django.contrib import messages
from django.contrib.auth.decorators import login_required
from django.http import JsonResponse
from django.shortcuts import redirect, render
from django.views.decorators.http import require_http_methods, require_POST, require_GET

from mappers import profile_mapper


def _json_body(request):
    if request.content_type and 'application/json' in request.content_type:
        return json.loads(request.body.decode('utf-8') or '{}')
    return request.POST


@require_http_methods(['GET', 'POST'])
def profile_view(request):
    if not request.user.is_authenticated:
        return redirect('login')

    user_id = request.user.pk
    profile = profile_mapper.get_profile(user_id)
    keys = profile_mapper.list_user_keys(user_id)

    if request.method == 'POST':
        data = _json_body(request)
        theme = data.get('preferred_theme') or 'dark'
        new_key = (data.get('gemini_api_key') or '').strip()
        key_name = (data.get('key_name') or 'Gemini Key').strip()
        is_json_req = request.content_type and 'application/json' in request.content_type
        try:
            profile_mapper.upsert_profile(user_id, preferred_theme=theme)
            if new_key:
                profile_mapper.add_user_key(user_id, new_key, key_name=key_name)
            if is_json_req:
                return JsonResponse({'ok': True, 'theme': theme})
            messages.success(request, 'Vault settings updated.')
            return redirect('profile')
        except Exception as exc:
            if is_json_req:
                return JsonResponse({'ok': False, 'error': str(exc)}, status=400)
            messages.error(request, str(exc))

    return render(
        request,
        'explainer/profile.html',
        {
            'profile': profile,
            'keys': keys,
            'has_key': bool(keys),
        },
    )


# ------------------------------------------------------------------
# Profile Vault Popup JSON APIs
# ------------------------------------------------------------------

@login_required
@require_GET
def vault_data(request):
    user_id = request.user.pk
    profile = profile_mapper.get_profile(user_id)
    keys = profile_mapper.list_user_keys(user_id)
    return JsonResponse({
        'ok': True,
        'theme': (profile or {}).get('preferred_theme') or 'dark',
        'keys': [
            {
                'id': k['id'],
                'key_name': k['key_name'],
                'key_preview': k['key_preview'],
                'is_active': k['is_active'],
                'created_at': k['created_at'].strftime('%b %d, %Y %H:%M') if k.get('created_at') else '',
            }
            for k in keys
        ],
    })


@login_required
@require_POST
def add_key_api(request):
    data = _json_body(request)
    raw_key = (data.get('gemini_api_key') or '').strip()
    key_name = (data.get('key_name') or 'Personal Gemini Key').strip()
    if not raw_key:
        return JsonResponse({'ok': False, 'error': 'API Key cannot be empty.'}, status=400)

    try:
        profile_mapper.add_user_key(request.user.pk, raw_key, key_name=key_name)
        keys = profile_mapper.list_user_keys(request.user.pk)
        return JsonResponse({
            'ok': True,
            'message': 'API Key encrypted and added to Vault.',
            'keys': [
                {
                    'id': k['id'],
                    'key_name': k['key_name'],
                    'key_preview': k['key_preview'],
                    'is_active': k['is_active'],
                    'created_at': k['created_at'].strftime('%b %d, %Y %H:%M') if k.get('created_at') else '',
                }
                for k in keys
            ],
        })
    except Exception as exc:
        return JsonResponse({'ok': False, 'error': str(exc)}, status=400)


@login_required
@require_POST
def activate_key_api(request, key_id):
    try:
        keys = profile_mapper.set_active_key(request.user.pk, key_id)
        return JsonResponse({
            'ok': True,
            'message': 'Active Gemini key updated.',
            'keys': [
                {
                    'id': k['id'],
                    'key_name': k['key_name'],
                    'key_preview': k['key_preview'],
                    'is_active': k['is_active'],
                    'created_at': k['created_at'].strftime('%b %d, %Y %H:%M') if k.get('created_at') else '',
                }
                for k in keys
            ],
        })
    except Exception as exc:
        return JsonResponse({'ok': False, 'error': str(exc)}, status=400)


@login_required
@require_POST
def delete_key_api(request, key_id):
    try:
        keys = profile_mapper.delete_user_key(request.user.pk, key_id)
        return JsonResponse({
            'ok': True,
            'message': 'Key removed from Vault.',
            'keys': [
                {
                    'id': k['id'],
                    'key_name': k['key_name'],
                    'key_preview': k['key_preview'],
                    'is_active': k['is_active'],
                    'created_at': k['created_at'].strftime('%b %d, %Y %H:%M') if k.get('created_at') else '',
                }
                for k in keys
            ],
        })
    except Exception as exc:
        return JsonResponse({'ok': False, 'error': str(exc)}, status=400)
