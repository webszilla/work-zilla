from core.models import Subscription
from core.subscription_utils import is_subscription_active


def get_org_plan_limits(org):
    if not org:
        return {
            "ai_enabled": False,
            "ai_replies_per_month": 0,
            "ai_max_messages_per_conversation": 0,
            "ai_max_chars_per_message": 0,
            "plan": None,
            "subscription": None,
        }
    subs = (
        Subscription.objects
        .filter(organization=org, status__in=("active", "trialing"), plan__product__slug="ai-chatbot")
        .select_related("plan")
        .order_by("-start_date")
    )
    subscription = next((sub for sub in subs if is_subscription_active(sub)), None)
    plan = subscription.plan if subscription else None
    limits = plan.limits if plan and isinstance(plan.limits, dict) else {}
    features = plan.features if plan and isinstance(plan.features, dict) else {}
    return {
        "ai_enabled": bool(features.get("ai_enabled", False)),
        "ai_replies_per_month": int(limits.get("ai_replies_per_month") or 0),
        "max_agents": int(
            limits.get("max_ai_chatbot_agents")
            or limits.get("max_agents")
            or limits.get("included_agents")
            or (plan.included_agents if plan else 0)
            or 0
        ),
        "ai_max_messages_per_conversation": int(
            limits.get("ai_max_messages_per_conversation")
            or limits.get("max_messages_per_conversation")
            or 0
        ),
        "ai_max_chars_per_message": int(
            limits.get("ai_max_chars_per_message")
            or limits.get("max_chars_per_message")
            or 0
        ),
        "plan": plan,
        "subscription": subscription,
    }


def get_org_retention_days(org, default_days=30):
    limits = get_org_plan_limits(org)
    plan = limits.get("plan")
    raw_limits = {}
    if plan and isinstance(plan.limits, dict):
        raw_limits = plan.limits
    retention = (
        raw_limits.get("chat_history_days")
        or raw_limits.get("retention_days")
        or (plan.retention_days if plan else None)
        or default_days
    )
    try:
        retention = int(retention)
    except (TypeError, ValueError):
        retention = default_days
    return retention
