from decimal import Decimal

from django.db import transaction
from django.utils import timezone

from django.conf import settings

from core.models import AiUsageMonthly, AiUsageEvent
from .openai_pricing import get_pricing_config


def _period_yyyymm(now=None):
    return (now or timezone.now()).strftime("%Y%m")


def calculate_cost_inr(prompt_tokens, completion_tokens, pricing_cfg=None):
    cfg = pricing_cfg or get_pricing_config()
    input_cost = Decimal(str(cfg.get("input_cost_per_1k_tokens_inr", 0) or 0))
    output_cost = Decimal(str(cfg.get("output_cost_per_1k_tokens_inr", 0) or 0))
    markup = Decimal(str(cfg.get("fixed_markup_percent", 0) or 0))
    prompt_tokens = Decimal(str(prompt_tokens or 0))
    completion_tokens = Decimal(str(completion_tokens or 0))
    cost = (prompt_tokens / Decimal("1000")) * input_cost + (completion_tokens / Decimal("1000")) * output_cost
    if markup:
        cost = cost + (cost * (markup / Decimal("100")))
    return cost


def record_ai_usage(organization, model, usage, conversation_id=None, message_id=None, meta=None):
    if not organization:
        return None
    prompt_tokens = int(usage.get("prompt_tokens") or 0)
    completion_tokens = int(usage.get("completion_tokens") or 0)
    total_tokens = int(usage.get("total_tokens") or (prompt_tokens + completion_tokens))
    cost_inr = calculate_cost_inr(prompt_tokens, completion_tokens)
    period = _period_yyyymm()
    with transaction.atomic():
        row = (
            AiUsageMonthly.objects
            .select_for_update()
            .filter(organization=organization, product_slug="ai-chatbot", period_yyyymm=period)
            .first()
        )
        if row:
            row.ai_replies_used += 1
            row.tokens_total += total_tokens
            row.cost_inr_total += cost_inr
            row.request_count += 1
            row.save(update_fields=["ai_replies_used", "tokens_total", "cost_inr_total", "request_count", "updated_at"])
        else:
            row = AiUsageMonthly.objects.create(
                organization=organization,
                product_slug="ai-chatbot",
                period_yyyymm=period,
                ai_replies_used=1,
                tokens_total=total_tokens,
                cost_inr_total=cost_inr,
                request_count=1,
            )
        if getattr(settings, "AI_USAGE_EVENT_ENABLED", True) and getattr(organization, "id", None):
            AiUsageEvent.objects.create(
                organization=organization,
                product_slug="ai-chatbot",
                period_yyyymm=period,
                model=model or "",
                prompt_tokens=prompt_tokens,
                completion_tokens=completion_tokens,
                total_tokens=total_tokens,
                cost_inr=cost_inr,
                conversation_id=conversation_id,
                message_id=message_id,
                meta=meta or {},
            )
    return row
