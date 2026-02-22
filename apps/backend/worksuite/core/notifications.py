from .models import AdminNotification, Organization


ORG_ADMIN_INBOX_MAX_ITEMS = 100


def create_admin_notification(
    title,
    message="",
    event_type="system",
    organization=None,
):
    if isinstance(organization, int):
        organization = Organization.objects.filter(id=organization).first()
    elif organization is not None and not isinstance(organization, Organization):
        org_id = getattr(organization, "id", None) or getattr(organization, "pk", None)
        organization = Organization.objects.filter(id=org_id).first() if org_id else None
    return AdminNotification.objects.create(
        title=title,
        message=message or "",
        event_type=event_type or "system",
        audience="saas_admin",
        channel="system",
        organization=organization,
    )


def create_org_admin_inbox_notification(
    title,
    message="",
    organization=None,
    event_type="system",
    product_slug="",
    channel="email",
):
    if isinstance(organization, int):
        organization = Organization.objects.filter(id=organization).first()
    elif organization is not None and not isinstance(organization, Organization):
        org_id = getattr(organization, "id", None) or getattr(organization, "pk", None)
        organization = Organization.objects.filter(id=org_id).first() if org_id else None
    if not organization:
        return None
    item = AdminNotification.objects.create(
        title=title,
        message=message or "",
        event_type=event_type or "system",
        audience="org_admin",
        channel=channel or "email",
        product_slug=(product_slug or "").strip(),
        organization=organization,
    )
    old_ids = list(
        AdminNotification.objects
        .filter(audience="org_admin", organization=organization)
        .order_by("-created_at", "-id")
        .values_list("id", flat=True)[ORG_ADMIN_INBOX_MAX_ITEMS:]
    )
    if old_ids:
        AdminNotification.objects.filter(id__in=old_ids).delete()
    return item


def notify_org_expired(org, message=""):
    return create_admin_notification(
        title="Org Account Expired",
        message=message or f"{org.name} account expired.",
        event_type="org_expired",
        organization=org,
    )


def notify_org_renewed(org, message=""):
    return create_admin_notification(
        title="Org Account Renewed",
        message=message or f"{org.name} account renewed.",
        event_type="org_renewed",
        organization=org,
    )


def notify_org_created(org, message=""):
    return create_admin_notification(
        title="New Account Created",
        message=message or f"{org.name} account created.",
        event_type="org_created",
        organization=org,
    )


def notify_payment_pending(transfer, message=""):
    org = transfer.organization if transfer else None
    plan = transfer.plan if transfer else None
    product = plan.product if plan else None
    org_name = org.name if org else (transfer.user.username if transfer and transfer.user else "Unknown org")
    plan_name = plan.name if plan else "Plan"
    product_name = product.name if product else "Work Suite"
    currency = transfer.currency if transfer and transfer.currency else "INR"
    amount = transfer.amount if transfer and transfer.amount is not None else 0
    reference = transfer.reference_no if transfer else ""
    details = f"{org_name} submitted a bank transfer for {product_name} ({plan_name}). Amount {currency} {amount}."
    if reference:
        details = f"{details} Reference: {reference}."
    return create_admin_notification(
        title="Pending Payment",
        message=message or details,
        event_type="payment_pending",
        organization=org,
    )


def notify_free_plan_expired(subscription, message=""):
    if not subscription:
        return None
    org = subscription.organization
    plan = subscription.plan
    product = plan.product if plan else None
    org_name = org.name if org else "Unknown org"
    plan_name = plan.name if plan else "Free Plan"
    product_name = product.name if product else "Work Suite"
    details = f"{org_name} free plan expired for {product_name} ({plan_name})."
    return create_admin_notification(
        title="Free Plan Expired",
        message=message or details,
        event_type="org_expired",
        organization=org,
    )
