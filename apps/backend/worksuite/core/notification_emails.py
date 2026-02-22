import secrets
from datetime import timedelta

from django.conf import settings
from django.utils import timezone

from core.email_utils import send_templated_email
from core.notifications import create_org_admin_inbox_notification


def _absolute_url(path, request=None):
    safe_path = path if str(path).startswith("/") else f"/{path}"
    if request is not None:
        return request.build_absolute_uri(safe_path)
    base_url = getattr(settings, "SITE_BASE_URL", "").strip() or "https://getworkzilla.com"
    return f"{base_url.rstrip('/')}{safe_path}"


def _recipient_name(user):
    if not user:
        return "User"
    return user.first_name or user.username or "User"


def _resolve_org_for_user(user):
    if not user:
        return None
    org = getattr(user, "organization", None)
    if org:
        return org
    try:
        from core.models import UserProfile
        profile = UserProfile.objects.select_related("organization").filter(user=user).first()
        return profile.organization if profile else None
    except Exception:
        return None


def _store_email_inbox(user, title, message, product_slug="", event_type="system"):
    org = _resolve_org_for_user(user)
    if not org:
        return None
    return create_org_admin_inbox_notification(
        title=title,
        message=message or "",
        organization=org,
        event_type=event_type or "system",
        product_slug=product_slug or "",
        channel="email",
    )


def send_email_verification(user, request=None, force=False):
    if not user or not user.email:
        return False
    if user.email_verified and not force:
        return False

    token = secrets.token_urlsafe(32)
    user.email_verification_token = token
    user.email_verification_sent_at = timezone.now()
    if force:
        user.email_verified = False
        user.email_verified_at = None
        user.save(update_fields=[
            "email_verification_token",
            "email_verification_sent_at",
            "email_verified",
            "email_verified_at",
        ])
    else:
        user.save(update_fields=["email_verification_token", "email_verification_sent_at"])

    verify_url = _absolute_url(f"/auth/verify-email/{user.id}/{token}/", request=request)
    _store_email_inbox(
        user,
        "Email Verification",
        f"Email verification link generated for {user.email}.",
        product_slug="monitor",
        event_type="system",
    )
    return send_templated_email(
        user.email,
        "Verify Your Email - Work Zilla",
        "emails/email_verification.txt",
        {
            "name": _recipient_name(user),
            "verify_url": verify_url,
        },
    )


def is_verification_token_valid(user, token):
    if not user or not token or not user.email_verification_token:
        return False
    if token != user.email_verification_token:
        return False
    if not user.email_verification_sent_at:
        return False
    return timezone.now() - user.email_verification_sent_at <= timedelta(days=7)


def mark_email_verified(user):
    if not user:
        return
    user.email_verified = True
    user.email_verified_at = timezone.now()
    user.email_verification_token = ""
    user.save(update_fields=["email_verified", "email_verified_at", "email_verification_token"])


def notify_password_changed(user):
    if not user or not user.email:
        return False
    _store_email_inbox(
        user,
        "Password Changed",
        "Your account password was changed successfully.",
        product_slug="monitor",
        event_type="system",
    )
    return send_templated_email(
        user.email,
        "Password Changed - Work Zilla",
        "emails/password_changed.txt",
        {"name": _recipient_name(user)},
    )


def notify_account_limit_reached(user, limit, current_count, label="employee"):
    if not user or not user.email:
        return False
    _store_email_inbox(
        user,
        "Account Limit Reached",
        f"{label.title()} limit reached. Limit: {limit}, Current: {current_count}.",
        product_slug="monitor",
        event_type="system",
    )
    return send_templated_email(
        user.email,
        "Account Limit Reached - Work Zilla",
        "emails/account_limit_reached.txt",
        {
            "name": _recipient_name(user),
            "limit_label": label,
            "limit_value": limit,
            "current_count": current_count,
        },
    )


def notify_payment_proof_submitted(user, plan_name, billing_cycle, currency, amount):
    if not user or not user.email:
        return False
    _store_email_inbox(
        user,
        "Payment Proof Submitted",
        f"Payment proof submitted for {plan_name} ({billing_cycle or '-'}) amount {currency or 'INR'} {amount or 0}.",
        product_slug="monitor",
        event_type="payment_pending",
    )
    return send_templated_email(
        user.email,
        "Payment Proof Submitted - Work Zilla",
        "emails/payment_proof_submitted.txt",
        {
            "name": _recipient_name(user),
            "plan_name": plan_name,
            "billing_cycle": billing_cycle or "-",
            "currency": currency or "INR",
            "amount": amount or 0,
        },
    )


def notify_payment_proof_approved(user, plan_name, billing_cycle, currency, amount):
    if not user or not user.email:
        return False
    _store_email_inbox(
        user,
        "Payment Proof Approved",
        f"Payment proof approved for {plan_name} ({billing_cycle or '-'}) amount {currency or 'INR'} {amount or 0}.",
        product_slug="monitor",
        event_type="payment_success",
    )
    return send_templated_email(
        user.email,
        "Payment Proof Approved - Work Zilla",
        "emails/payment_proof_approved.txt",
        {
            "name": _recipient_name(user),
            "plan_name": plan_name,
            "billing_cycle": billing_cycle or "-",
            "currency": currency or "INR",
            "amount": amount or 0,
        },
    )


def notify_payment_proof_rejected(user, plan_name, billing_cycle, currency, amount):
    if not user or not user.email:
        return False
    _store_email_inbox(
        user,
        "Payment Proof Rejected",
        f"Payment proof rejected for {plan_name} ({billing_cycle or '-'}) amount {currency or 'INR'} {amount or 0}.",
        product_slug="monitor",
        event_type="payment_failed",
    )
    return send_templated_email(
        user.email,
        "Payment Proof Rejected - Work Zilla",
        "emails/payment_proof_rejected.txt",
        {
            "name": _recipient_name(user),
            "plan_name": plan_name,
            "billing_cycle": billing_cycle or "-",
            "currency": currency or "INR",
            "amount": amount or 0,
        },
    )


def notify_product_activated(user, product_name, plan_name):
    if not user or not user.email:
        return False
    normalized_name = str(product_name or "Work Zilla Product").strip()
    product_slug = "monitor"
    lower_name = normalized_name.lower()
    if "storage" in lower_name:
        product_slug = "storage"
    elif "autopilot" in lower_name or "erp" in lower_name:
        product_slug = "business-autopilot-erp"
    elif "chat" in lower_name:
        product_slug = "ai-chatbot"
    _store_email_inbox(
        user,
        "Product Activated",
        f"{normalized_name} activated on plan {plan_name or '-'}.",
        product_slug=product_slug,
        event_type="product_activation",
    )
    return send_templated_email(
        user.email,
        "Product Activated - Work Zilla",
        "emails/product_activated.txt",
        {
            "name": _recipient_name(user),
            "product_name": product_name or "Work Zilla Product",
            "plan_name": plan_name or "-",
        },
    )
