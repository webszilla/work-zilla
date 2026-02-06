import json

from django.http import HttpResponseForbidden, JsonResponse


class ApiV2ErrorNormalizeMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        response = self.get_response(request)
        if not request.path.startswith("/api/v2/"):
            return response

        content_type = response.get("Content-Type", "")

        if isinstance(response, HttpResponseForbidden) and "application/json" not in content_type:
            return JsonResponse({"detail": "forbidden"}, status=response.status_code)

        if "application/json" not in content_type:
            return response

        try:
            payload = json.loads(response.content)
        except (TypeError, ValueError):
            return response

        if isinstance(payload, dict) and "detail" not in payload and "error" in payload:
            payload = dict(payload)
            payload["detail"] = payload.pop("error")
            return JsonResponse(payload, status=response.status_code)

        return response
