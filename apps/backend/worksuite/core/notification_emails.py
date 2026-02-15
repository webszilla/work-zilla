import secrets
from datetime import timedelta

from django.conf import settings
from django.utils import timezone

from core.email_utils import send_templated_email


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
    return send_templated_email(
        user.email,
        "Password Changed - Work Zilla",
        "emails/password_changed.txt",
        {"name": _recipient_name(user)},
    )


def notify_account_limit_reached(user, limit, current_count, label="employee"):
    if not user or not user.email:
        return False
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
