from __future__ import annotations

from datetime import date, timedelta
from decimal import Decimal

from django.conf import settings
from django.utils import timezone

from ..models import AiArchitectUsageEvent


def _decimal(value, default="0"):
    try:
        return Decimal(str(value))
    except Exception:
        return Decimal(default)


def estimate_cost_inr_from_tokens(total_tokens: int) -> Decimal:
    """
    Minimal safe estimator. Configure `AI_ARCHITECT_COST_INR_PER_1K_TOKENS` for real values.
    Default is 0 so billing stays placeholder until explicitly enabled.
    """
    rate = _decimal(getattr(settings, "AI_ARCHITECT_COST_INR_PER_1K_TOKENS", "0"))
    tokens = max(0, int(total_tokens or 0))
    return (Decimal(tokens) / Decimal(1000)) * rate


def _month_range(today: date):
    start = today.replace(day=1)
    if start.month == 12:
        next_month = start.replace(year=start.year + 1, month=1)
    else:
        next_month = start.replace(month=start.month + 1)
    end = next_month
    return start, end


def get_usage_summary(user, budget_inr: int, warning_percent: int, hard_stop_enabled: bool) -> dict:
    now = timezone.now()
    today = now.date()
    month_start, month_end = _month_range(today)

    month_qs = AiArchitectUsageEvent.objects.filter(
        user=user,
        created_at__date__gte=month_start,
        created_at__date__lt=month_end,
    )
    today_qs = AiArchitectUsageEvent.objects.filter(user=user, created_at__date=today)

    month_cost = month_qs.aggregate(total=models_sum("cost_inr"))["total"] or Decimal("0")
    today_cost = today_qs.aggregate(total=models_sum("cost_inr"))["total"] or Decimal("0")

    budget = Decimal(max(0, int(budget_inr or 0)))
    remaining = budget - month_cost
    if remaining < 0:
        remaining = Decimal("0")

    threshold = max(0, min(100, int(warning_percent or 80)))
    warning_at = (budget * Decimal(threshold) / Decimal(100)) if budget else Decimal("0")

    exceeded = bool(budget and month_cost >= budget)
    warning = bool(budget and month_cost >= warning_at and not exceeded)

    reset_date = (month_end - timedelta(days=1)).isoformat()

    return {
        "today_cost_inr": float(today_cost),
        "month_cost_inr": float(month_cost),
        "monthly_budget_inr": int(budget),
        "remaining_inr": float(remaining),
        "warning_threshold_percent": threshold,
        "hard_stop_enabled": bool(hard_stop_enabled),
        "warning": warning,
        "exceeded": exceeded,
        "billing_cycle_reset_date": reset_date,
    }


def models_sum(field_name: str):
    from django.db.models import Sum

    return Sum(field_name)
