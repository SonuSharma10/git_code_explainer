from django.contrib import admin
from django.shortcuts import redirect
from django.urls import include, path

urlpatterns = [
    path('admin/', admin.site.urls),
    path('', lambda request: redirect('explore'), name='home'),
    path('', include('explainer.urls')),
]
