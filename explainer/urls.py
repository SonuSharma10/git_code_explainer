from django.urls import path

from explainer.views.auth_views import login_view, logout_view, signup_view
from explainer.views.explorer_views import (
    ai_chat,
    conversation_detail,
    download_notes,
    explore_page,
    file_content,
    load_repo,
)
from explainer.views.issue_views import fix_issue, issues_page, list_issues
from explainer.views.profile_views import (
    activate_key_api,
    add_key_api,
    delete_key_api,
    profile_view,
    vault_data,
)

urlpatterns = [
    # Auth
    path('signup/', signup_view, name='signup'),
    path('login/', login_view, name='login'),
    path('logout/', logout_view, name='logout'),

    # Profile Vault (page + popup JSON APIs)
    path('profile/', profile_view, name='profile'),
    path('api/vault/', vault_data, name='vault_data'),
    path('api/vault/add-key/', add_key_api, name='vault_add_key'),
    path('api/vault/activate/<int:key_id>/', activate_key_api, name='vault_activate_key'),
    path('api/vault/delete/<int:key_id>/', delete_key_api, name='vault_delete_key'),

    # Explorer
    path('explore/', explore_page, name='explore'),
    path('explore/load/', load_repo, name='explore_load'),
    path('explore/file/', file_content, name='explore_file'),

    # AI Chat / Explain
    path('ai/explain/', ai_chat, name='ai_explain'),
    path('ai/chat/', ai_chat, name='ai_chat'),
    path('ai/conversations/<str:conversation_id>/', conversation_detail, name='ai_conversation'),
    path('ai/notes/', download_notes, name='ai_notes'),

    # Issues Hub
    path('issues/', issues_page, name='issues'),
    path('issues/list/', list_issues, name='issues_list'),
    path('issues/fix/', fix_issue, name='issues_fix'),
]
