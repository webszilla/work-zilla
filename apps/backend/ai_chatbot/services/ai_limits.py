from django.utils import timezone

from core.models import AiUsageMonthly
from .plan_limits import get_org_plan_limits


def get_period_yyyymm(now=None):
    return (now or timezone.now()).strftime("%Y%m")


def can_use_ai(org, needed_replies=1):
    limits = get_org_plan_limits(org)
    if not limits.get("ai_enabled"):
        return {
            "allowed": False,
            "reason": "AI_DISABLED",
            "used": 0,
            "limit": limits.get("ai_replies_per_month", 0),
        }
    limit = int(limits.get("ai_replies_per_month") or 0)
    if not limit:
        return {"allowed": True, "reason": "", "used": 0, "limit": 0}
    period = get_period_yyyymm()
    usage = AiUsageMonthly.objects.filter(
        organization=org,
        product_slug="ai-chatbot",
        period_yyyymm=period,
    ).first()
    used = int(usage.ai_replies_used or 0) if usage else 0
    allowed = (used + int(needed_replies or 0)) <= limit
    return {
        "allowed": allowed,
        "reason": "" if allowed else "AI_LIMIT_REACHED",
        "used": used,
        "limit": limit,
    }
