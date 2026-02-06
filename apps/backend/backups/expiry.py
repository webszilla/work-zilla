from django.utils import timezone

from .models import OrgDownloadActivity


def expire_old_backups():
    now = timezone.now()
    return (
        OrgDownloadActivity.objects
        .filter(expires_at__lt=now)
        .exclude(status="expired")
        .update(status="expired")
    )
