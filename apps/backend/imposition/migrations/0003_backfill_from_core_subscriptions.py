from django.db import migrations


def backfill(apps, schema_editor):
    Product = apps.get_model("products", "Product")
    Subscription = apps.get_model("core", "Subscription")
    ImpositionPlan = apps.get_model("imposition", "ImpositionPlan")
    ImpositionOrgSubscription = apps.get_model("imposition", "ImpositionOrgSubscription")
    ImpositionLicense = apps.get_model("imposition", "ImpositionLicense")

    product = Product.objects.filter(slug="imposition-software").first()
    if not product:
        return

    plan_map = {
        row.code: row
        for row in ImpositionPlan.objects.filter(code__in=["starter", "pro", "business", "enterprise"])
    }

    def resolve_plan(plan_name):
        value = str(plan_name or "").strip().lower()
        if value == "enterprise" or "enterprise" in value:
            return plan_map.get("enterprise")
        if value == "business" or "business" in value:
            return plan_map.get("business")
        if value == "pro" or "pro" in value:
            return plan_map.get("pro")
        return plan_map.get("starter")

    rows = (
        Subscription.objects
        .filter(plan__product=product, status__in=["active", "trialing"])
        .select_related("plan", "organization")
        .order_by("organization_id", "-start_date")
    )
    seen_org = set()
    for row in rows:
        if row.organization_id in seen_org:
            continue
        seen_org.add(row.organization_id)
        target_plan = resolve_plan(row.plan.name if row.plan else "")
        if not target_plan:
            continue
        sub, _ = ImpositionOrgSubscription.objects.get_or_create(
            organization_id=row.organization_id,
            defaults={
                "plan": target_plan,
                "status": row.status,
                "starts_at": row.start_date,
                "ends_at": row.trial_end if row.status == "trialing" else row.end_date,
            },
        )
        sub.plan = target_plan
        sub.status = row.status
        sub.starts_at = row.start_date
        sub.ends_at = row.trial_end if row.status == "trialing" else row.end_date
        sub.save()

        ImpositionLicense.objects.get_or_create(
            organization_id=row.organization_id,
            subscription=sub,
            defaults={
                "status": "active",
                "offline_grace_days": 3,
            },
        )


class Migration(migrations.Migration):

    dependencies = [
        ("imposition", "0002_seed_plans"),
        ("core", "0116_seed_imposition_software_plans"),
        ("products", "0010_seed_imposition_software"),
    ]

    operations = [
        migrations.RunPython(backfill, migrations.RunPython.noop),
    ]
