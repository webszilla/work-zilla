from decimal import Decimal, ROUND_HALF_UP
import uuid

from django.conf import settings
from django.utils import timezone

from .models import (
    DealerAccount,
    DealerReferralEarning,
    Organization,
    PendingTransfer,
    ReferralEarning,
    ReferralSettings,
)


def _money(value):
    return Decimal(value or 0).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def _gst_rate(currency):
    if currency != "INR":
        return Decimal("0.00")
    return Decimal(str(getattr(settings, "INVOICE_TAX_RATE", 18))) / Decimal("100")


def ensure_referral_code(org):
    if not org or org.referral_code:
        return org.referral_code or ""
    while True:
        code = uuid.uuid4().hex[:8].upper()
        if not Organization.objects.filter(referral_code=code).exists():
            org.referral_code = code
            org.save(update_fields=["referral_code"])
            return code


def ensure_dealer_referral_code(dealer):
    if not dealer or dealer.referral_code:
        return dealer.referral_code or ""
    while True:
        code = uuid.uuid4().hex[:8].upper()
        if not DealerAccount.objects.filter(referral_code=code).exists():
            dealer.referral_code = code
            dealer.save(update_fields=["referral_code"])
            return code


def _commission_base_amount(transfer):
    amount = _money(transfer.amount or 0)
    tax_rate = _gst_rate(transfer.currency or "INR")
    if tax_rate <= 0:
        return amount
    return _money(amount / (Decimal("1.00") + tax_rate))


def _has_prior_paid_invoice(org, transfer_id):
    return PendingTransfer.objects.filter(
        organization=org,
        status="approved",
        request_type__in=("new", "renew"),
    ).exclude(id=transfer_id).exists()


def record_referral_earning(transfer):
    if not transfer or transfer.request_type not in ("new", "renew"):
        return None
    org = transfer.organization
    if not org or not org.referred_by:
        return None
    if ReferralEarning.objects.filter(referred_org=org).exists():
        return None
    if _has_prior_paid_invoice(org, transfer.id):
        return None

    settings_obj = ReferralSettings.get_active()
    rate = Decimal(str(settings_obj.commission_rate or 0))
    if rate <= 0:
        return None

    base_amount = _commission_base_amount(transfer)
    if base_amount <= 0:
        return None

    commission_amount = _money(base_amount * rate / Decimal("100"))
    return ReferralEarning.objects.create(
        referrer_org=org.referred_by,
        referred_org=org,
        transfer=transfer,
        base_amount=base_amount,
        commission_rate=rate,
        commission_amount=commission_amount,
        status="pending",
        payout_reference="",
        payout_date=None,
    )


def is_dealer_subscription_active(dealer, now=None):
    if not dealer:
        return False
    if dealer.subscription_status != "active":
        return False
    current = now or timezone.now()
    if dealer.subscription_end and dealer.subscription_end < current:
        return False
    return True


def record_dealer_org_referral_earning(transfer):
    if not transfer or transfer.request_type not in ("new", "renew"):
        return None
    org = transfer.organization
    if not org or not org.referred_by_dealer:
        return None
    if DealerReferralEarning.objects.filter(referred_org=org).exists():
        return None
    if _has_prior_paid_invoice(org, transfer.id):
        return None
    dealer = org.referred_by_dealer
    if not is_dealer_subscription_active(dealer):
        return None

    settings_obj = ReferralSettings.get_active()
    rate = Decimal(str(settings_obj.dealer_commission_rate or 0))
    if rate <= 0:
        return None

    base_amount = _commission_base_amount(transfer)
    if base_amount <= 0:
        return None

    commission_amount = _money(base_amount * rate / Decimal("100"))
    return DealerReferralEarning.objects.create(
        referrer_dealer=dealer,
        referred_org=org,
        transfer=transfer,
        base_amount=base_amount,
        commission_rate=rate,
        commission_amount=commission_amount,
        flat_amount=Decimal("0.00"),
        status="pending",
        payout_reference="",
        payout_date=None,
    )


def record_dealer_referral_flat_earning(referred_dealer):
    if not referred_dealer or not referred_dealer.referred_by:
        return None
    if referred_dealer.subscription_status != "active":
        return None
    if DealerReferralEarning.objects.filter(referred_dealer=referred_dealer).exists():
        return None
    referrer = referred_dealer.referred_by
    if not is_dealer_subscription_active(referrer):
        return None

    settings_obj = ReferralSettings.get_active()
    flat_amount = _money(settings_obj.dealer_referral_flat_amount or 0)
    if flat_amount <= 0:
        return None

    return DealerReferralEarning.objects.create(
        referrer_dealer=referrer,
        referred_dealer=referred_dealer,
        base_amount=Decimal("0.00"),
        commission_rate=Decimal("0.00"),
        commission_amount=Decimal("0.00"),
        flat_amount=flat_amount,
        status="pending",
        payout_reference="",
        payout_date=None,
    )
