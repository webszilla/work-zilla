from datetime import timedelta

from django.utils import timezone

from core.models import ChatEnquiryLead


def purge_old_leads_for_org(org, retention_days):
    retention_days = int(retention_days or 0)
    if retention_days <= 0:
        return 0
    cutoff = timezone.now() - timedelta(days=retention_days)
    qs = ChatEnquiryLead.objects.filter(organization=org, created_at__lt=cutoff)
    deleted, _ = qs.delete()
    return deleted
