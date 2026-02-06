from decimal import Decimal

from django.conf import settings


def _get_decimal(name, default=0):
    value = getattr(settings, name, default)
    try:
        return Decimal(str(value or 0))
    except Exception:
        return Decimal("0")


def get_pricing_config():
    return {
        "input_cost_per_1k_tokens_inr": _get_decimal("OPENAI_INPUT_COST_PER_1K_TOKENS_INR", 0),
        "output_cost_per_1k_tokens_inr": _get_decimal("OPENAI_OUTPUT_COST_PER_1K_TOKENS_INR", 0),
        "fixed_markup_percent": _get_decimal("OPENAI_FIXED_MARKUP_PERCENT", 0),
    }
