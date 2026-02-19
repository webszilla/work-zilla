from datetime import timedelta
import logging

from django.conf import settings
from django.core.mail import send_mail
from django.utils import timezone

from .models import AlertEvent, MetricSample, MonitoringSettings, ServerNode

logger = logging.getLogger(__name__)


def _should_notify(event, now):
    if not event.last_notified_at:
        return True
    return (now - event.last_notified_at) >= timedelta(minutes=60)


def _send_alert_email(event, server, snapshot, settings_obj):
    if not settings_obj.email_enabled:
        return
    recipients = settings_obj.alert_emails or []
    if not recipients:
        return
    subject = f"[SaaS] {event.type} ALERT: {server.name}"
    uptime = server.last_seen_at.isoformat() if server.last_seen_at else "-"
    body = "\n".join(
        [
            f"Server: {server.name}",
            f"Role: {server.role}",
            f"Region: {server.region}",
            f"Hostname: {server.hostname}",
            f"Last seen: {uptime}",
            "",
            f"CPU: {snapshot.get('cpu_percent', 0)}%",
            f"RAM: {snapshot.get('ram_percent', 0)}%",
            f"Disk: {snapshot.get('disk_percent', 0)}%",
            f"Load: {snapshot.get('load1', 0)} / {snapshot.get('load5', 0)} / {snapshot.get('load15', 0)}",
            "",
            "Open SaaS Admin: /app/saas-admin/server-monitoring",
        ]
    )
    try:
        send_mail(
            subject,
            body,
            settings.DEFAULT_FROM_EMAIL,
            recipients,
            fail_silently=False,
        )
    except Exception:
        logger.exception(
            "Monitoring alert email failed: event=%s server=%s recipients=%s",
            event.type,
            server.name,
            recipients,
        )


def _ensure_event(server, event_type, breach, details, snapshot, settings_obj, now):
    event = AlertEvent.objects.filter(server=server, type=event_type, is_active=True).first()
    if breach:
        if not event:
            event = AlertEvent.objects.create(
                server=server,
                type=event_type,
                severity="high",
                started_at=now,
                details=details,
                is_active=True,
            )
        else:
            event.details = details
            event.save(update_fields=["details"])
        if _should_notify(event, now):
            _send_alert_email(event, server, snapshot, settings_obj)
            event.last_notified_at = now
            event.save(update_fields=["last_notified_at"])
    else:
        if event:
            event.is_active = False
            event.ended_at = now
            event.save(update_fields=["is_active", "ended_at"])


def _get_latest_snapshot(server):
    sample = MetricSample.objects.filter(server=server).order_by("-ts_minute").first()
    if not sample:
        return {}
    return {
        "cpu_percent": sample.cpu_percent,
        "ram_percent": sample.ram_percent,
        "disk_percent": sample.disk_percent,
        "load1": sample.load1,
        "load5": sample.load5,
        "load15": sample.load15,
    }


def check_alerts():
    settings_obj = MonitoringSettings.get_solo()
    if not settings_obj.enabled:
        return
    now = timezone.now()
    down_after = timedelta(minutes=settings_obj.down_after_minutes)
    breach_window = timedelta(minutes=settings_obj.breach_minutes)

    for server in ServerNode.objects.filter(is_active=True):
        last_seen = server.last_seen_at
        down = not last_seen or (now - last_seen) > down_after
        snapshot = _get_latest_snapshot(server)
        _ensure_event(
            server,
            "DOWN",
            down,
            {"down_after_minutes": settings_obj.down_after_minutes},
            snapshot,
            settings_obj,
            now,
        )

        since = now - breach_window
        samples = list(
            MetricSample.objects.filter(server=server, ts_minute__gte=since)
            .order_by("ts_minute")
        )
        if len(samples) < settings_obj.breach_minutes:
            _ensure_event(server, "CPU", False, {}, snapshot, settings_obj, now)
            _ensure_event(server, "RAM", False, {}, snapshot, settings_obj, now)
            _ensure_event(server, "DISK", False, {}, snapshot, settings_obj, now)
            continue

        cpu_breach = all(s.cpu_percent >= settings_obj.cpu_threshold for s in samples)
        ram_breach = all(s.ram_percent >= settings_obj.ram_threshold for s in samples)
        disk_breach = all(s.disk_percent >= settings_obj.disk_threshold for s in samples)

        if cpu_breach:
            peak = max(s.cpu_percent for s in samples)
            _ensure_event(
                server,
                "CPU",
                True,
                {"threshold": settings_obj.cpu_threshold, "peak": peak},
                snapshot,
                settings_obj,
                now,
            )
        else:
            _ensure_event(server, "CPU", False, {}, snapshot, settings_obj, now)

        if ram_breach:
            peak = max(s.ram_percent for s in samples)
            _ensure_event(
                server,
                "RAM",
                True,
                {"threshold": settings_obj.ram_threshold, "peak": peak},
                snapshot,
                settings_obj,
                now,
            )
        else:
            _ensure_event(server, "RAM", False, {}, snapshot, settings_obj, now)

        if disk_breach:
            peak = max(s.disk_percent for s in samples)
            _ensure_event(
                server,
                "DISK",
                True,
                {"threshold": settings_obj.disk_threshold, "peak": peak},
                snapshot,
                settings_obj,
                now,
            )
        else:
            _ensure_event(server, "DISK", False, {}, snapshot, settings_obj, now)
