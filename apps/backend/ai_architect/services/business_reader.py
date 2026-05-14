from __future__ import annotations

import re
from decimal import Decimal

from django.contrib.auth import get_user_model

try:
    from core.models import OrganizationProduct, Subscription, UserProfile
except Exception:  # pragma: no cover
    OrganizationProduct = None
    Subscription = None
    UserProfile = None


_EMAIL_RE = re.compile(r"\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b", re.I)


def extract_emails(text: str, max_items: int = 3) -> list[str]:
    found = []
    seen = set()
    for match in _EMAIL_RE.findall(str(text or "")):
        email = match.strip().lower()
        if email and email not in seen:
            seen.add(email)
            found.append(email)
        if len(found) >= max_items:
            break
    return found


def get_business_lookup_for_emails(text: str) -> dict:
    """
    Returns aggregate-safe business context for specific user emails mentioned in the query.
    """
    emails = extract_emails(text)
    if not emails or UserProfile is None or Subscription is None or OrganizationProduct is None:
        return {"available": False, "items": []}

    User = get_user_model()
    items = []
    for email in emails:
        user = User.objects.filter(email__iexact=email).first()
        if not user:
            items.append({"email": email, "found": False})
            continue

        profile = UserProfile.objects.select_related("organization").filter(user=user).first()
        organization = getattr(profile, "organization", None)
        if not organization:
            items.append(
                {
                    "email": email,
                    "found": True,
                    "organization_found": False,
                    "username": getattr(user, "username", ""),
                }
            )
            continue

        member_count = UserProfile.objects.filter(organization=organization).count()
        org_products = list(
            OrganizationProduct.objects.select_related("product")
            .filter(organization=organization, subscription_status__in=["active", "trialing"])
            .order_by("product__sort_order", "product__name")
        )
        products = [
            {
                "name": getattr(row.product, "name", ""),
                "slug": getattr(row.product, "slug", ""),
                "status": row.subscription_status,
            }
            for row in org_products
            if getattr(row, "product", None)
        ]

        subscription = (
            Subscription.objects.select_related("plan", "plan__product")
            .filter(organization=organization)
            .order_by("-end_date", "-start_date")
            .first()
        )
        items.append(
            {
                "email": email,
                "found": True,
                "username": getattr(user, "username", ""),
                "organization_found": True,
                "organization_name": getattr(organization, "name", ""),
                "member_count": member_count,
                "products": products,
                "subscription": {
                    "status": getattr(subscription, "status", "") if subscription else "",
                    "plan_name": getattr(getattr(subscription, "plan", None), "name", "") if subscription else "",
                    "billing_cycle": getattr(subscription, "billing_cycle", "") if subscription else "",
                    "next_payment_date": subscription.end_date.date().isoformat() if subscription and subscription.end_date else "",
                    "addon_count": int(getattr(subscription, "addon_count", 0) or 0) if subscription else 0,
                },
            }
        )
    return {"available": True, "items": items}


def _format_money_map(values: dict) -> str:
    if not isinstance(values, dict) or not values:
        return "0"
    parts = []
    for currency, amount in values.items():
        try:
            normalized = Decimal(str(amount or 0)).quantize(Decimal("0.01"))
        except Exception:
            normalized = Decimal("0.00")
        parts.append(f"{currency} {normalized}")
    return ", ".join(parts)


def build_direct_business_answer(user_message: str, context: dict | None = None) -> str:
    text = str(user_message or "").strip()
    lowered = text.lower()
    ctx = context or {}

    lookup = ctx.get("saas_admin_business_lookup") or {}
    lookup_items = lookup.get("items") if isinstance(lookup, dict) else []
    if lookup_items:
        item = lookup_items[0]
        email = str(item.get("email") or "").strip()
        if email:
            if not item.get("found"):
                return f"{email} என்ற email local database-la user-aa கிடைக்கலை."

            if not item.get("organization_found"):
                username = str(item.get("username") or "").strip() or "-"
                return (
                    f"{email} user கிடைத்தார். Username: {username}. "
                    "ஆனா organization mapping local DB-la கிடைக்கலை."
                )

            products = item.get("products") if isinstance(item.get("products"), list) else []
            product_names = ", ".join(
                str(row.get("name") or "").strip()
                for row in products
                if str(row.get("name") or "").strip()
            ) or "No active product"
            subscription = item.get("subscription") if isinstance(item.get("subscription"), dict) else {}
            plan_name = str(subscription.get("plan_name") or "").strip() or "-"
            billing_cycle = str(subscription.get("billing_cycle") or "").strip() or "-"
            next_payment_date = str(subscription.get("next_payment_date") or "").strip() or "-"
            status = str(subscription.get("status") or "").strip() or "-"
            addon_count = int(subscription.get("addon_count") or 0)
            username = str(item.get("username") or "").strip() or "-"
            org_name = str(item.get("organization_name") or "").strip() or "-"
            member_count = int(item.get("member_count") or 0)
            return (
                f"{email} user details:\n"
                f"- Username: {username}\n"
                f"- Organization: {org_name}\n"
                f"- Active products: {product_names}\n"
                f"- Plan: {plan_name}\n"
                f"- Billing cycle: {billing_cycle}\n"
                f"- Subscription status: {status}\n"
                f"- Org users count: {member_count}\n"
                f"- Add-on users: {addon_count}\n"
                f"- Next payment date: {next_payment_date}"
            )

    metrics = ctx.get("saas_admin_metrics") or {}
    if isinstance(metrics, dict) and metrics.get("available"):
        month_keywords = [
            "this month sales",
            "month sales",
            "intha month sales",
            "indha month sales",
            "இந்த மாத sales",
            "இந்த மாத sale",
            "monthly sales",
        ]
        today_keywords = ["today sales", "innaiku sales", "indru sales", "இன்று sales"]
        if any(keyword in lowered for keyword in month_keywords):
            totals = _format_money_map(metrics.get("this_month_sales_by_currency") or {})
            date_range = metrics.get("range") or {}
            return (
                f"This month sales: {totals}\n"
                f"Range: {date_range.get('month_start', '-')} to {date_range.get('month_end', '-')}\n"
                "Source: approved payment requests (PendingTransfer)."
            )
        if any(keyword in lowered for keyword in today_keywords):
            totals = _format_money_map(metrics.get("today_sales_by_currency") or {})
            date_range = metrics.get("range") or {}
            return (
                f"Today sales: {totals}\n"
                f"Date: {date_range.get('today', '-')}\n"
                "Source: approved payment requests (PendingTransfer)."
            )

    return ""
