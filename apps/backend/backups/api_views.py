import uuid
import json

from django.conf import settings
from django.core.cache import cache
from django.core.files.storage import default_storage
from django.http import JsonResponse, HttpResponseForbidden, FileResponse, Http404
from django.utils import timezone
from django.views.decorators.http import require_http_methods

from core.models import Organization, Subscription
from apps.backend.products.models import Product
from .permissions import is_org_admin, IsSaaSAdmin, IsOrgAdmin, IsFeatureEnabled
from .services import request_backup, log_backup_event
from .tasks import restore_backup_task
from .models import BackupRecord, OrgDownloadActivity
from .serializers import OrgDownloadActivitySerializer, BackupRecordSerializer, BackupRequestResponseSerializer
from dashboard.views import get_active_org
from rest_framework.views import APIView
from rest_framework.pagination import PageNumberPagination
from rest_framework.response import Response
from rest_framework import status
from rest_framework.exceptions import ValidationError


RATE_LIMIT_SECONDS = getattr(settings, "BACKUP_RATE_LIMIT_SECONDS", 3600)


def _rate_limit_key(user_id, organization_id, product_id):
    return f"backup:request:{user_id}:{organization_id}:{product_id}"


def _is_subscription_active(organization, product):
    if not organization or not product:
        return False
    sub = (
        Subscription.objects.filter(organization=organization, status__in=("active", "trialing"))
        .select_related("plan__product")
        .order_by("-start_date")
        .first()
    )
    if not sub or not sub.plan or not sub.plan.product:
        return False
    return sub.plan.product_id == product.id


@require_http_methods(["POST"])
def backup_request(request):
    if not request.user.is_authenticated:
        return HttpResponseForbidden("Access denied.")

    payload = {}
    if request.body:
        try:
            payload = json.loads(request.body.decode("utf-8") or "{}")
        except json.JSONDecodeError:
            payload = {}

    try:
        organization_id = int(
            payload.get("organization_id")
            or request.POST.get("organization_id")
            or request.GET.get("organization_id")
            or 0
        )
    except (TypeError, ValueError):
        return JsonResponse({"detail": "invalid_parameters"}, status=400)

    product_id = payload.get("product_id") or request.POST.get("product_id") or request.GET.get("product_id")
    product_slug = (payload.get("product_slug") or request.POST.get("product_slug") or request.GET.get("product_slug") or "").strip()
    if product_id:
        try:
            product_id = int(product_id)
        except (TypeError, ValueError):
            product_id = 0
    if not product_id and product_slug:
        product = Product.objects.filter(slug=product_slug, is_active=True).first()
        product_id = product.id if product else 0

    if not organization_id or not product_id:
        return JsonResponse({"detail": "organization_id and product required"}, status=400)

    if not is_org_admin(request.user, organization_id):
        return HttpResponseForbidden("Access denied.")

    organization = Organization.objects.filter(id=organization_id).first()
    product = Product.objects.filter(id=product_id, is_active=True).first()
    if not organization or not product:
        return JsonResponse({"detail": "not_found"}, status=404)

    if not _is_subscription_active(organization, product):
        return JsonResponse({"detail": "subscription_required"}, status=403)

    key = _rate_limit_key(request.user.id, organization_id, product_id)
    if cache.get(key):
        return JsonResponse({"detail": "rate_limited"}, status=429)
    cache.set(key, True, timeout=RATE_LIMIT_SECONDS)

    request_id = uuid.uuid4()
    trace_id = request.headers.get("X-Request-Id", "") or request.headers.get("X-Trace-Id", "")
    backup = request_backup(
        organization=organization,
        product=product,
        user=request.user,
        request_id=request_id,
        trace_id=trace_id,
        ip_address=request.META.get("REMOTE_ADDR"),
        user_agent=request.META.get("HTTP_USER_AGENT", ""),
    )

    return JsonResponse(
        {
            "detail": "backup_queued",
            "backup_id": str(backup.id),
            "request_id": str(request_id),
        },
        status=202,
    )


@require_http_methods(["GET"])
def backup_list(request):
    if not request.user.is_authenticated:
        return HttpResponseForbidden("Access denied.")

    org = get_active_org(request)
    if not org:
        return JsonResponse({"detail": "organization_required"}, status=400)

    if not is_org_admin(request.user, org.id):
        return HttpResponseForbidden("Access denied.")

    try:
        product_id = int(request.GET.get("product_id") or 0)
    except (TypeError, ValueError):
        product_id = 0
    product_slug = (request.GET.get("product_slug") or "").strip()
    if not product_id and product_slug:
        product = Product.objects.filter(slug=product_slug, is_active=True).first()
        product_id = product.id if product else 0

    qs = BackupRecord.objects.filter(organization=org).select_related("product", "requested_by")
    if product_id:
        qs = qs.filter(product_id=product_id)

    limit = int(request.GET.get("limit") or 10)
    offset = int(request.GET.get("offset") or 0)
    limit = max(1, min(limit, 50))
    offset = max(offset, 0)

    items = []
    now = timezone.now()
    total = qs.count()
    for rec in qs.order_by("-requested_at")[offset : offset + limit]:
        expired = bool(rec.expires_at and rec.expires_at < now)
        can_download = bool(rec.storage_path) and rec.status in ("completed", "expired") and not expired
        items.append(
            {
                "id": str(rec.id),
                "product_id": rec.product_id,
                "product_name": rec.product.name if rec.product else "-",
                "status": rec.status,
                "size_bytes": rec.size_bytes,
                "requested_at": rec.requested_at.isoformat() if rec.requested_at else "",
                "completed_at": rec.completed_at.isoformat() if rec.completed_at else "",
                "expires_at": rec.expires_at.isoformat() if rec.expires_at else "",
                "download_url": rec.download_url if can_download else "",
                "can_download": can_download,
            }
        )

    return JsonResponse({"items": items, "total": total, "limit": limit, "offset": offset})


class OrgDownloadsPagination(PageNumberPagination):
    page_size = 25
    page_size_query_param = "page_size"
    max_page_size = 100


class OrgDownloadsListView(APIView):
    permission_classes = [IsSaaSAdmin]
    pagination_class = OrgDownloadsPagination

    def get(self, request):
        qs = OrgDownloadActivity.objects.all()
        org_id = request.query_params.get("org_id")
        product_id = request.query_params.get("product_id")
        status = request.query_params.get("status")
        date_from = request.query_params.get("date_from")
        date_to = request.query_params.get("date_to")

        if org_id:
            qs = qs.filter(organization_id=org_id)
        if product_id:
            qs = qs.filter(product_id=product_id)
        if status:
            qs = qs.filter(status=status)
        if date_from:
            qs = qs.filter(generated_at__date__gte=date_from)
        if date_to:
            qs = qs.filter(generated_at__date__lte=date_to)

        qs = qs.order_by("-generated_at")
        paginator = self.pagination_class()
        page = paginator.paginate_queryset(qs, request, view=self)
        serializer = OrgDownloadActivitySerializer(page, many=True)
        return paginator.get_paginated_response(serializer.data)


class OrgGenerateBackupView(APIView):
    permission_classes = [IsOrgAdmin]

    def post(self, request):
        payload = {}
        if request.body:
            try:
                payload = json.loads(request.body.decode("utf-8") or "{}")
            except json.JSONDecodeError:
                payload = {}

        organization_id = (
            payload.get("organization_id")
            or request.data.get("organization_id")
            or request.query_params.get("organization_id")
        )
        product_id = (
            payload.get("product_id")
            or request.data.get("product_id")
            or request.query_params.get("product_id")
        )
        if not organization_id:
            return JsonResponse({"detail": "organization_id required"}, status=400)

        backup_id = uuid.uuid4().hex
        generated_at = timezone.now()
        expires_at = generated_at + timezone.timedelta(hours=24)

        activity = OrgDownloadActivity.objects.create(
            organization_id=organization_id,
            product_id=product_id or None,
            admin_user_id=request.user.id,
            backup_id=backup_id,
            backup_size_mb=0,
            status="generated",
            generated_at=generated_at,
            expires_at=expires_at,
            created_ip=request.META.get("REMOTE_ADDR"),
        )
        return JsonResponse({"backup_id": activity.backup_id})


@require_http_methods(["GET"])
def backup_download(request, backup_id):
    backup = BackupRecord.objects.filter(id=backup_id).select_related("organization", "product").first()
    if not backup:
        raise Http404

    token = request.GET.get("token") or ""
    now = timezone.now()
    if backup.expires_at and backup.expires_at < now:
        return JsonResponse({"detail": "backup_expired"}, status=410)

    if token and backup.download_token and token == backup.download_token:
        pass
    else:
        if not request.user.is_authenticated:
            return HttpResponseForbidden("Access denied.")
        if not is_org_admin(request.user, backup.organization_id):
            return HttpResponseForbidden("Access denied.")

    if not backup.storage_path:
        raise Http404

    try:
        file_handle = default_storage.open(backup.storage_path, "rb")
    except Exception:
        raise Http404

    log_backup_event(
        organization=backup.organization,
        product=backup.product,
        user=request.user if request.user.is_authenticated else None,
        action="backup_downloaded",
        status="ok",
        backup_id=backup.id,
        actor_type="user",
        event_meta={"download_via_token": bool(token)},
    )

    response = FileResponse(file_handle, content_type="application/zip")
    response["Content-Disposition"] = f'attachment; filename="backup_{backup.id}.zip"'
    return response


@require_http_methods(["POST"])
def backup_restore(request, backup_id):
    if not request.user.is_authenticated:
        return HttpResponseForbidden("Access denied.")

    backup = BackupRecord.objects.filter(id=backup_id).select_related("organization", "product").first()
    if not backup:
        raise Http404

    if not is_org_admin(request.user, backup.organization_id):
        return HttpResponseForbidden("Access denied.")

    # Must have active subscription for product
    if not _is_subscription_active(backup.organization, backup.product):
        return JsonResponse({"detail": "subscription_required"}, status=403)

    log_backup_event(
        organization=backup.organization,
        product=backup.product,
        user=request.user,
        action="restore_requested",
        status="ok",
        backup_id=backup.id,
        actor_type="user",
    )

    if hasattr(restore_backup_task, "delay"):
        async_result = restore_backup_task.delay(str(backup.id), request.user.id)
        return JsonResponse({"detail": "restore_queued", "task_id": async_result.id}, status=202)
    restore_backup_task(str(backup.id), request.user.id)
    return JsonResponse({"detail": "restore_completed"})


class OrgAdminBackupPagination(PageNumberPagination):
    page_size = 10
    page_size_query_param = "page_size"
    max_page_size = 50


class BackupRequestResponse:
    def __init__(self, backup_id, backups):
        self.backup_id = backup_id
        self.backups = backups


class OrgAdminBackupAccessView(APIView):
    permission_classes = [IsOrgAdmin, IsFeatureEnabled]
    feature_key = "org_admin_backups"
    pagination_class = OrgAdminBackupPagination

    def get(self, request):
        org = get_active_org(request)
        if not org:
            raise ValidationError("organization_required")

        qs = BackupRecord.objects.filter(organization=org).select_related("product")
        product_id = request.query_params.get("product_id")
        product_slug = request.query_params.get("product_slug")
        if product_id:
            qs = qs.filter(product_id=product_id)
        elif product_slug:
            product = Product.objects.filter(slug=product_slug, is_active=True).first()
            if product:
                qs = qs.filter(product_id=product.id)

        qs = qs.order_by("-requested_at")
        paginator = self.pagination_class()
        page = paginator.paginate_queryset(qs, request, view=self)
        serializer = BackupRecordSerializer(page, many=True)
        return paginator.get_paginated_response(serializer.data)

    def post(self, request):
        org = get_active_org(request)
        if not org:
            raise ValidationError("organization_required")

        product_id = request.data.get("product_id") or request.query_params.get("product_id")
        product_slug = request.data.get("product_slug") or request.query_params.get("product_slug")
        product = None
        if product_id:
            product = Product.objects.filter(id=product_id, is_active=True).first()
        elif product_slug:
            product = Product.objects.filter(slug=product_slug, is_active=True).first()

        if not product:
            raise ValidationError("product_required")

        if not _is_subscription_active(org, product):
            raise ValidationError("subscription_required")

        backup = request_backup(
            organization=org,
            product=product,
            user=request.user,
            request_id=uuid.uuid4(),
            trace_id=request.headers.get("X-Request-Id", "") or request.headers.get("X-Trace-Id", ""),
            ip_address=request.META.get("REMOTE_ADDR"),
            user_agent=request.META.get("HTTP_USER_AGENT", ""),
        )

        qs = BackupRecord.objects.filter(organization=org).select_related("product").order_by("-requested_at")
        backups = qs[:5]
        response_obj = BackupRequestResponse(str(backup.id), backups)
        serializer = BackupRequestResponseSerializer(response_obj)
        return Response(serializer.data, status=status.HTTP_202_ACCEPTED)


class SaasAdminDownloadListView(APIView):
    permission_classes = [IsSaaSAdmin, IsFeatureEnabled]
    feature_key = "saas_admin_downloads"
    pagination_class = OrgDownloadsPagination

    def get(self, request):
        qs = OrgDownloadActivity.objects.all()
        org_id = request.query_params.get("org_id")
        product_id = request.query_params.get("product_id")
        status_value = request.query_params.get("status")
        date_from = request.query_params.get("date_from")
        date_to = request.query_params.get("date_to")

        if org_id:
            qs = qs.filter(organization_id=org_id)
        if product_id:
            qs = qs.filter(product_id=product_id)
        if status_value:
            qs = qs.filter(status=status_value)
        if date_from:
            qs = qs.filter(generated_at__date__gte=date_from)
        if date_to:
            qs = qs.filter(generated_at__date__lte=date_to)

        qs = qs.order_by("-generated_at")
        paginator = self.pagination_class()
        page = paginator.paginate_queryset(qs, request, view=self)
        serializer = OrgDownloadActivitySerializer(page, many=True)
        return paginator.get_paginated_response(serializer.data)
