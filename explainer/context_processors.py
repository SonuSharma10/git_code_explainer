from mappers import profile_mapper


def retro_theme(request):
    theme = 'dark'
    user = getattr(request, 'user', None)
    if user is not None and getattr(user, 'is_authenticated', False):
        try:
            profile = profile_mapper.get_profile(user.pk)
            if profile and profile.get('preferred_theme'):
                val = profile['preferred_theme']
                theme = 'light' if val in ('light', 'solar_paper') else 'dark'
        except Exception:
            pass
    return {'theme': theme}
