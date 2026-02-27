import json

from django.http import HttpResponsePermanentRedirect

from apps.backend.brand.models import ProductRouteMapping

from django.http import HttpResponseForbidden, JsonResponse
from django.db import connection


class LegacyMonitorRedirectMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        path = request.path or ""
        query = request.META.get("QUERY_STRING", "")
        suffix_query = f"?{query}" if query else ""

        if path in {"/app", "/app/"}:
            return HttpResponsePermanentRedirect(f"/app/work-suite/{suffix_query}")

        if path.startswith("/app/monitor"):
            suffix = path[len("/app/monitor"):]
            return HttpResponsePermanentRedirect(f"/app/work-suite{suffix}{suffix_query}")

        if path.startswith("/app/worksuite"):
            suffix = path[len("/app/worksuite"):]
            return HttpResponsePermanentRedirect(f"/app/work-suite{suffix}{suffix_query}")

        if path.startswith("/products/monitor"):
            suffix = path[len("/products/monitor"):]
            return HttpResponsePermanentRedirect(f"/products/worksuite{suffix}{suffix_query}")

        if path.startswith("/monitor") and not path.startswith("/monitoring"):
            suffix = path[len("/monitor"):]
            return HttpResponsePermanentRedirect(f"/worksuite{suffix}{suffix_query}")

        return self.get_response(request)


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


class ProductRouteRedirectMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        path = request.path or ""
        if not path.startswith("/products/"):
            return self.get_response(request)

        slug = path[len("/products/"):].strip("/")
        if not slug:
            return self.get_response(request)

        route = None
        if connection.vendor == "sqlite":
            for candidate in (
                ProductRouteMapping.objects
                .select_related("product")
                .filter(redirect_enabled=True)
            ):
                legacy = candidate.legacy_slugs or []
                if slug in legacy:
                    route = candidate
                    break
        else:
            route = (
                ProductRouteMapping.objects.select_related("product")
                .filter(redirect_enabled=True, legacy_slugs__contains=[slug])
                .first()
            )
        if route and route.public_slug and route.public_slug != slug:
            return HttpResponsePermanentRedirect(f"/products/{route.public_slug}/")

        return self.get_response(request)
