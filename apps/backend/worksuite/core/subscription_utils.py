from datetime import timedelta
from functools import wraps

from django.utils import timezone

from django.db.models import Q
from django.http import JsonResponse

from .models import PendingTransfer, Subscription, SubscriptionHistory, Organization, UserProfile
from .email_utils import send_templated_email

FREE_TRIAL_DAYS = 7


def normalize_product_slug(value, default="monitor"):
    slug = (value or "").strip().lower()
    if slug == "worksuite":
        return "monitor"
    return slug or default


def is_free_plan(plan):
    if not plan:
        return False
    prices = [
        plan.monthly_price or 0,
        plan.yearly_price or 0,
        plan.usd_monthly_price or 0,
        plan.usd_yearly_price or 0,
    ]
    return all(price <= 0 for price in prices)


def get_free_trial_end_date(start_date, now=None):
    base = start_date or (now or timezone.now())
    return base + timedelta(days=FREE_TRIAL_DAYS)


def get_effective_end_date(subscription, now=None):
    if not subscription:
        return None
    if subscription.status == "trialing":
        return subscription.trial_end
    if not is_free_plan(subscription.plan):
        return subscription.end_date
    trial_end = get_free_trial_end_date(subscription.start_date, now=now)
    if subscription.end_date and subscription.end_date < trial_end:
        return subscription.end_date
    return trial_end


def is_subscription_active(subscription, now=None):
    if not subscription:
        return False
    current = now or timezone.now()
    if subscription.status == "trialing":
        if not subscription.trial_end or subscription.trial_end < current:
            return False
        return True
    effective_end = get_effective_end_date(subscription, now=current)
    if effective_end and effective_end < current:
        return False
    return True


def normalize_subscription_end_date(subscription, now=None):
    if not subscription or not is_free_plan(subscription.plan):
        return False
    effective_end = get_effective_end_date(subscription, now=now)
    if not effective_end or subscription.end_date == effective_end:
        return False
    subscription.end_date = effective_end
    subscription.save(update_fields=["end_date"])
    return True


def maybe_expire_subscription(subscription, now=None):
    if not subscription:
        return False
    current = now or timezone.now()
    normalize_subscription_end_date(subscription, now=current)
    if is_subscription_active(subscription, now=current):
        return False
    status_changed = False
    update_fields = []
    effective_end = get_effective_end_date(subscription, now=current)
    if effective_end and (not subscription.end_date or subscription.end_date > effective_end):
        subscription.end_date = effective_end
        update_fields.append("end_date")
    if subscription.status != "expired":
        subscription.status = "expired"
        update_fields.append("status")
        status_changed = True
    if update_fields:
        subscription.save(update_fields=update_fields)
        org = subscription.organization
        owner = org.owner if org else None
        send_templated_email(
            owner.email if owner else "",
            "Subscription Expired",
            "emails/subscription_expired.txt",
            {
                "name": owner.first_name if owner and owner.first_name else (owner.username if owner else "User"),
                "plan_name": subscription.plan.name if subscription.plan else "-",
                "end_date": subscription.end_date.strftime("%Y-%m-%d") if subscription.end_date else "-"
            }
        )
        if status_changed and is_free_plan(subscription.plan):
            try:
                from .notifications import notify_free_plan_expired
                notify_free_plan_expired(subscription)
            except Exception:
                pass
    return True


def revert_transfer_subscription(transfer, now=None, decision_time=None):
    if not transfer or transfer.request_type not in ("new", "renew"):
        return False
    current = now or timezone.now()
    effective_time = decision_time or transfer.updated_at or transfer.created_at or current
    newer_approved = PendingTransfer.objects.filter(
        organization=transfer.organization,
        status="approved",
        request_type__in=("new", "renew"),
        updated_at__gt=effective_time,
    ).exists()
    if newer_approved:
        return False
    product_filter = _build_product_filter_for_plan(transfer.plan)
    sub = (
        Subscription.objects
        .filter(organization=transfer.organization)
        .filter(product_filter)
        .first()
    )
    if sub and sub.status == "active":
        if transfer.plan_id and sub.plan_id != transfer.plan_id:
            return False
        sub.status = "expired"
        sub.end_date = current
        sub.save()
    if transfer.plan_id:
        history = (
            SubscriptionHistory.objects
            .filter(organization=transfer.organization, plan=transfer.plan)
            .order_by("-start_date")
            .first()
        )
        if history and history.status != "rejected":
            history.status = "rejected"
            history.end_date = current
            history.save()
    return True


def _build_product_filter_for_plan(plan):
    if not plan:
        return Q()
    product = plan.product if plan else None
    slug = normalize_product_slug(product.slug if product and product.slug else "monitor")
    product_filter = Q(plan__product__slug=slug)
    if slug == "monitor":
        product_filter |= Q(plan__product__isnull=True)
    return product_filter


def _resolve_org_for_user(user):
    profile = UserProfile.objects.filter(user=user).select_related("organization").first()
    if profile and profile.organization:
        return profile.organization
    org = Organization.objects.filter(owner=user).first()
    if org and profile and not profile.organization:
        profile.organization = org
        profile.save(update_fields=["organization"])
    return org


def has_active_subscription(user, product_slug, org=None):
    if not user or not user.is_authenticated:
        return False
    target_org = org or _resolve_org_for_user(user)
    if not target_org:
        return False
    product_slug = normalize_product_slug(product_slug)
    product_filter = Q(plan__product__slug=product_slug)
    if product_slug == "monitor":
        product_filter |= Q(plan__product__slug="worksuite")
        product_filter |= Q(plan__product__isnull=True)

    sub = (
        Subscription.objects
        .filter(
            organization=target_org,
            status__in=("active", "trialing"),
        )
        .filter(product_filter)
        .order_by("-start_date")
        .first()
    )
    if not sub:
        return False
    normalize_subscription_end_date(sub)
    if not is_subscription_active(sub):
        maybe_expire_subscription(sub)
        return False
    return True


def has_active_subscription_for_org(org, product_slug):
    if not org:
        return False
    product_slug = normalize_product_slug(product_slug)
    product_filter = Q(plan__product__slug=product_slug)
    if product_slug == "monitor":
        product_filter |= Q(plan__product__slug="worksuite")
        product_filter |= Q(plan__product__isnull=True)

    sub = (
        Subscription.objects
        .filter(
            organization=org,
            status__in=("active", "trialing"),
        )
        .filter(product_filter)
        .order_by("-start_date")
        .first()
    )
    if not sub:
        return False
    normalize_subscription_end_date(sub)
    if not is_subscription_active(sub):
        maybe_expire_subscription(sub)
        return False
    return True


def require_active_monitor_subscription(view_func):
    @wraps(view_func)
    def _wrapped(request, *args, **kwargs):
        user = getattr(request, "user", None)
        if not user or not user.is_authenticated:
            return JsonResponse({"detail": "authentication_required"}, status=401)
        if user.is_superuser:
            return view_func(request, *args, **kwargs)
        try:
            from dashboard import views as dashboard_views
            org = dashboard_views.get_active_org(request)
        except Exception:
            org = None
        if not org:
            org = _resolve_org_for_user(user)
        product_filter = Q(plan__product__slug="monitor") | Q(plan__product__slug="worksuite") | Q(plan__product__isnull=True)
        sub = (
            Subscription.objects
            .filter(
                organization=org,
                status__in=("active", "trialing"),
            )
            .filter(product_filter)
            .order_by("-start_date")
            .first()
        )
        if not sub:
            history = (
                SubscriptionHistory.objects
                .filter(organization=org, plan__isnull=False)
                .filter(product_filter)
                .order_by("-start_date")
                .first()
            )
            if history and history.plan:
                if history.status != "rejected":
                    if is_free_plan(history.plan):
                        trial_end = get_free_trial_end_date(history.start_date)
                        if history.end_date and history.end_date < trial_end:
                            trial_end = history.end_date
                        if trial_end and trial_end >= timezone.now():
                            return view_func(request, *args, **kwargs)
                    else:
                        if history.end_date and history.end_date >= timezone.now():
                            return view_func(request, *args, **kwargs)
            latest_transfer = (
                PendingTransfer.objects
                .filter(organization=org, status="approved", request_type__in=("new", "renew"))
                .filter(product_filter)
                .order_by("-updated_at", "-created_at")
                .first()
            )
            if latest_transfer and latest_transfer.plan:
                start_date = latest_transfer.updated_at or latest_transfer.created_at or timezone.now()
                months = 12 if latest_transfer.billing_cycle == "yearly" else 1
                end_date = start_date + timedelta(days=30 * months)
                if end_date >= timezone.now():
                    return view_func(request, *args, **kwargs)
            return JsonResponse({"detail": "subscription_required"}, status=403)
        if not is_subscription_active(sub):
            maybe_expire_subscription(sub)
            if sub.status == "trialing":
                return JsonResponse({"detail": "Trial ended. Please upgrade your plan."}, status=403)
            return JsonResponse({"detail": "subscription_required"}, status=403)
        return view_func(request, *args, **kwargs)

    return _wrapped


def resolve_plan_limits(subscription):
    if not subscription or not subscription.plan:
        return {}
    plan = subscription.plan
    plan_limits = getattr(plan, "limits", None)
    limits = plan_limits if isinstance(plan_limits, dict) else {}
    plan_features = getattr(plan, "features", None)
    features = plan_features if isinstance(plan_features, dict) else {}
    if subscription.status == "trialing":
        trial_limits = features.get("trial_limits") if isinstance(features, dict) else None
        if isinstance(trial_limits, dict) and trial_limits:
            merged = dict(limits)
            merged.update(trial_limits)
            return merged
    return limits
