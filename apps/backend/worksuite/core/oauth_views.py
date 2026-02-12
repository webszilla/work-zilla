from django.http import JsonResponse
from oauth2_provider.decorators import protected_resource


@protected_resource()
def userinfo(request):
    user = request.user
    return JsonResponse(
        {
            "id": user.id,
            "username": user.username,
            "email": user.email,
            "first_name": user.first_name,
            "last_name": user.last_name,
        }
    )
