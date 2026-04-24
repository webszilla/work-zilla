import json
import re
from datetime import timedelta

from django.conf import settings
from django.http import HttpResponsePermanentRedirect
from django.shortcuts import redirect
from django.core.cache import cache
from django.middleware.csrf import get_token
from django.utils import timezone

from apps.backend.brand.models import ProductRouteMapping
from core.access_control import build_login_redirect, check_product_access, get_request_product_slug, is_exempt_product_path

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


class AppCsrfBootstrapMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        path = request.path or ""
        if path.startswith("/app"):
            get_token(request)
        return self.get_response(request)


class ApiHttpMethodOverrideMiddleware:
    ALLOWED_OVERRIDES = {"PUT", "PATCH", "DELETE"}

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        path = request.path or ""
        request_method = str(request.META.get("REQUEST_METHOD") or "").upper()
        if path.startswith("/api/") and request_method == "POST":
            override = str(request.META.get("HTTP_X_HTTP_METHOD_OVERRIDE") or "").strip().upper()
            if override in self.ALLOWED_OVERRIDES:
                request.META["ORIGINAL_REQUEST_METHOD"] = request_method
                request.META["REQUEST_METHOD"] = override
        return self.get_response(request)


class RequestSecurityShieldMiddleware:
    BLOCK_SECONDS = 15 * 60
    NOT_FOUND_WINDOW_SECONDS = 5 * 60
    MAX_NOT_FOUND_ATTEMPTS = 20
    SUSPICIOUS_WINDOW_SECONDS = 10 * 60
    MAX_SUSPICIOUS_ATTEMPTS = 4
    SUSPICIOUS_RE = re.compile(
        r"(\.\./|%2e%2e|<script|/wp-admin|/wp-login|/xmlrpc\.php|/phpmyadmin|/\.env|/cgi-bin|/vendor/phpunit|/boaform)",
        re.IGNORECASE,
    )
    EXEMPT_PREFIXES = ("/static/", "/media/", "/favicon.ico", "/robots.txt", "/sitemap.xml")

    def __init__(self, get_response):
        self.get_response = get_response

    def _get_ip(self, request):
        return request.META.get("HTTP_X_FORWARDED_FOR", "").split(",")[0].strip() or request.META.get("REMOTE_ADDR", "")

    def _block_key(self, ip):
        return f"security:block:{ip}"

    def _nf_key(self, ip):
        return f"security:404:{ip}"

    def _suspicious_key(self, ip):
        return f"security:suspicious:{ip}"

    def _blocked_response(self, request, minutes):
        payload = {"detail": f"Security protection enabled. Try again after {minutes} minutes."}
        if request.path.startswith("/api/"):
            return JsonResponse(payload, status=429)
        return JsonResponse(payload, status=429)

    def _is_exempt(self, path):
        return any(path.startswith(prefix) for prefix in self.EXEMPT_PREFIXES)

    def _set_block(self, ip, reason):
        until = timezone.now() + timedelta(seconds=self.BLOCK_SECONDS)
        cache.set(self._block_key(ip), {"until": until, "reason": reason}, timeout=self.BLOCK_SECONDS)

    def _increment_and_check(self, key, window_seconds, max_attempts):
        count = int(cache.get(key) or 0) + 1
        cache.set(key, count, timeout=window_seconds)
        return count >= max_attempts

    def __call__(self, request):
        path = request.path or ""
        if self._is_exempt(path):
            return self.get_response(request)

        ip = self._get_ip(request)

        # Do not rate-limit local development traffic.
        # This shield is meant to protect public endpoints from scans/attacks and
        # can be triggered during dev when UI makes repeated 404/invalid calls.
        host = str(getattr(request, "get_host", lambda: "")() or "")
        if getattr(settings, "DEBUG", False) or ip in {"127.0.0.1", "::1"} or host.startswith(("127.0.0.1", "localhost")):
            return self.get_response(request)
        if getattr(request, "user", None) and getattr(request.user, "is_authenticated", False):
            if getattr(request.user, "is_superuser", False) or getattr(request.user, "is_staff", False):
                return self.get_response(request)

        block_state = cache.get(self._block_key(ip)) or {}
        until = block_state.get("until")
        if until and until > timezone.now():
            remaining_seconds = int((until - timezone.now()).total_seconds())
            remaining_minutes = max(1, (remaining_seconds + 59) // 60)
            return self._blocked_response(request, remaining_minutes)
        if until and until <= timezone.now():
            cache.delete(self._block_key(ip))

        response = self.get_response(request)

        raw_target = f"{request.path}?{request.META.get('QUERY_STRING', '')}"
        is_suspicious = bool(self.SUSPICIOUS_RE.search(raw_target))
        if is_suspicious:
            reached = self._increment_and_check(
                self._suspicious_key(ip),
                self.SUSPICIOUS_WINDOW_SECONDS,
                self.MAX_SUSPICIOUS_ATTEMPTS,
            )
            if reached:
                self._set_block(ip, "suspicious_activity")
                return self._blocked_response(request, 15)

        if response.status_code == 404:
            reached = self._increment_and_check(
                self._nf_key(ip),
                self.NOT_FOUND_WINDOW_SECONDS,
                self.MAX_NOT_FOUND_ATTEMPTS,
            )
            if reached:
                self._set_block(ip, "too_many_not_found")
                return self._blocked_response(request, 15)

        return response


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


class ProductAuthorizationMiddleware:
    PUBLIC_AGENT_API_PREFIXES = (
        "/api/activity/upload",
        "/api/screenshot/upload",
        "/api/monitor/",
        "/api/worksuite/stop",
        "/api/org/settings",
        "/api/employee/register",
        "/api/org/register",
    )

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        path = request.path or ""
        if any(path.startswith(prefix) for prefix in self.PUBLIC_AGENT_API_PREFIXES):
            return self.get_response(request)

        product_slug = get_request_product_slug(path)
        if not product_slug or is_exempt_product_path(path):
            return self.get_response(request)

        decision = check_product_access(request.user, product_slug)
        if decision.allowed:
            request.product_access = decision
            return self.get_response(request)

        if decision.status_code == 401:
            if path.startswith("/api/"):
                return JsonResponse({"detail": decision.detail}, status=401)
            return redirect(build_login_redirect(path, request.META.get("QUERY_STRING", "")))

        payload = {
            "detail": decision.detail,
            "product_slug": decision.product_slug,
            "role": decision.role,
        }
        if decision.permission:
            payload["permission"] = decision.permission
        if path.startswith("/api/"):
            return JsonResponse(payload, status=403)
        return HttpResponseForbidden(json.dumps(payload), content_type="application/json")
