from datetime import timedelta

from django.db import transaction
from django.http import HttpResponseForbidden
from django.utils import timezone
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework import status
from rest_framework.exceptions import ValidationError

from apps.backend.backups.permissions import IsSaaSAdmin
from .models import ServerNode, MetricSample, MonitoringSettings, AlertEvent
from .serializers import ServerNodeSerializer, MetricSampleSerializer, MonitoringSettingsSerializer, AlertEventSerializer
from .utils import get_server_from_token, generate_token, hash_token
from django.utils.decorators import method_decorator
from django.views.decorators.csrf import csrf_exempt


def _get_bearer_token(request):
    auth = request.headers.get("Authorization", "")
    if not auth or not auth.startswith("Bearer "):
        return ""
    return auth.split(" ", 1)[1].strip()


def _auth_server(request):
    token = _get_bearer_token(request)
    server = get_server_from_token(token)
    if not server:
        return None
    return server


def _round_to_minute(dt):
    return dt.replace(second=0, microsecond=0)


def _range_to_delta(range_value):
    if range_value == "1h":
        return timedelta(hours=1)
    if range_value == "24h":
        return timedelta(hours=24)
    if range_value == "7d":
        return timedelta(days=7)
    return timedelta(hours=1)


@method_decorator(csrf_exempt, name="dispatch")
class IngestMetricsView(APIView):
    authentication_classes = []
    permission_classes = []

    def post(self, request):
        server = _auth_server(request)
        if not server:
            return HttpResponseForbidden("invalid_token")

        ts = request.data.get("ts")
        if ts:
            try:
                ts = timezone.datetime.fromisoformat(ts)
                if timezone.is_naive(ts):
                    ts = timezone.make_aware(ts)
            except Exception:
                ts = timezone.now()
        else:
            ts = timezone.now()

        ts_minute = _round_to_minute(ts)
        payload = {
            "cpu_percent": float(request.data.get("cpu_percent") or 0),
            "ram_percent": float(request.data.get("ram_percent") or 0),
            "disk_percent": float(request.data.get("disk_percent") or 0),
            "load1": float(request.data.get("load1") or 0),
            "load5": float(request.data.get("load5") or 0),
            "load15": float(request.data.get("load15") or 0),
            "net_in_kbps": float(request.data.get("net_in_kbps") or 0),
            "net_out_kbps": float(request.data.get("net_out_kbps") or 0),
        }

        with transaction.atomic():
            MetricSample.objects.update_or_create(
                server=server,
                ts_minute=ts_minute,
                defaults=payload,
            )
            server.last_seen_at = timezone.now()
            server.save(update_fields=["last_seen_at"])

        return Response({"detail": "ok"}, status=status.HTTP_201_CREATED)


@method_decorator(csrf_exempt, name="dispatch")
class IngestHeartbeatView(APIView):
    authentication_classes = []
    permission_classes = []

    def post(self, request):
        server = _auth_server(request)
        if not server:
            return HttpResponseForbidden("invalid_token")
        server.last_seen_at = timezone.now()
        server.save(update_fields=["last_seen_at"])
        return Response({"detail": "ok"}, status=status.HTTP_200_OK)


class ServerListView(APIView):
    permission_classes = [IsSaaSAdmin]

    def get(self, request):
        servers = ServerNode.objects.all().order_by("name")
        serializer = ServerNodeSerializer(servers, many=True)
        return Response(serializer.data)


class ServerDetailView(APIView):
    permission_classes = [IsSaaSAdmin]

    def get(self, request, server_id):
        server = ServerNode.objects.filter(id=server_id).first()
        if not server:
            raise ValidationError("not_found")
        serializer = ServerNodeSerializer(server)
        return Response(serializer.data)


class ServerMetricsView(APIView):
    permission_classes = [IsSaaSAdmin]

    def get(self, request, server_id):
        server = ServerNode.objects.filter(id=server_id).first()
        if not server:
            raise ValidationError("not_found")
        range_value = request.query_params.get("range", "1h")
        delta = _range_to_delta(range_value)
        since = timezone.now() - delta
        qs = MetricSample.objects.filter(server=server, ts_minute__gte=since).order_by("ts_minute")
        serializer = MetricSampleSerializer(qs, many=True)
        return Response(serializer.data)


class AlertListView(APIView):
    permission_classes = [IsSaaSAdmin]

    def get(self, request):
        status_filter = request.query_params.get("status")
        server_id = request.query_params.get("server_id")
        qs = AlertEvent.objects.select_related("server").all()
        if status_filter == "open":
            qs = qs.filter(is_active=True)
        elif status_filter == "closed":
            qs = qs.filter(is_active=False)
        if server_id:
            qs = qs.filter(server_id=server_id)
        serializer = AlertEventSerializer(qs.order_by("-started_at"), many=True)
        return Response(serializer.data)


class MonitoringSettingsView(APIView):
    permission_classes = [IsSaaSAdmin]

    def get(self, request):
        settings_obj = MonitoringSettings.get_solo()
        serializer = MonitoringSettingsSerializer(settings_obj)
        return Response(serializer.data)

    def post(self, request):
        settings_obj = MonitoringSettings.get_solo()
        serializer = MonitoringSettingsSerializer(settings_obj, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)


class ServerTokenView(APIView):
    permission_classes = [IsSaaSAdmin]

    def post(self, request, server_id):
        server = ServerNode.objects.filter(id=server_id).first()
        if not server:
            raise ValidationError("not_found")
        token = generate_token()
        server.token_hash = hash_token(token)
        server.save(update_fields=["token_hash"])
        return Response({"token": token})
