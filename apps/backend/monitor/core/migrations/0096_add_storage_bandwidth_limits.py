from django.db import migrations


def add_storage_bandwidth_limits(apps, schema_editor):
    Plan = apps.get_model("core", "Plan")
    Product = apps.get_model("products", "Product")
    product = Product.objects.filter(slug="storage").first()
    if not product:
        return
    for plan in Plan.objects.filter(product=product):
        limits = dict(plan.limits or {})
        storage_gb = limits.get("storage_gb") or limits.get("storage_limit_gb") or 0
        try:
            storage_gb = int(storage_gb or 0)
        except (TypeError, ValueError):
            storage_gb = 0
        limits["bandwidth_limit_gb_monthly"] = max(0, storage_gb * 3)
        limits["is_bandwidth_limited"] = True
        plan.limits = limits
        plan.save(update_fields=["limits"])


class Migration(migrations.Migration):
    dependencies = [
        ("core", "0095_update_storage_pricing"),
    ]

    operations = [
        migrations.RunPython(add_storage_bandwidth_limits, migrations.RunPython.noop),
    ]
