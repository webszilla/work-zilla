from django.db import migrations


def update_storage_pricing(apps, schema_editor):
    Product = apps.get_model("products", "Product")
    Plan = apps.get_model("core", "Plan")
    product = Product.objects.filter(slug="storage").first()
    if not product:
        return

    trial_limits = {"max_users": 3, "storage_gb": 50}

    pricing = {
        "Basic": {
            "monthly": 999,
            "yearly": 9999,
            "usd_monthly": 15,
            "usd_yearly": 150,
            "limits": {"storage_gb": 250, "max_users": 5},
        },
        "Standard": {
            "monthly": 1799,
            "yearly": 17999,
            "usd_monthly": 29,
            "usd_yearly": 290,
            "limits": {"storage_gb": 500, "max_users": 10},
        },
        "Pro": {
            "monthly": 3499,
            "yearly": 34999,
            "usd_monthly": 59,
            "usd_yearly": 590,
            "limits": {"storage_gb": 1024, "max_users": 0},
        },
    }

    addon_prices = {
        "monthly": 699,
        "yearly": 6999,
        "usd_monthly": 10,
        "usd_yearly": 100,
    }

    for name, data in pricing.items():
        plan = Plan.objects.filter(product=product, name=name).first()
        if not plan:
            continue
        plan.monthly_price = data["monthly"]
        plan.yearly_price = data["yearly"]
        plan.usd_monthly_price = data["usd_monthly"]
        plan.usd_yearly_price = data["usd_yearly"]
        plan.addon_monthly_price = addon_prices["monthly"]
        plan.addon_yearly_price = addon_prices["yearly"]
        plan.addon_usd_monthly_price = addon_prices["usd_monthly"]
        plan.addon_usd_yearly_price = addon_prices["usd_yearly"]
        limits = plan.limits or {}
        limits.update(data["limits"])
        plan.limits = limits
        features = plan.features or {}
        features["trial_limits"] = trial_limits
        plan.features = features
        addons = plan.addons or {}
        addons.setdefault("extra_storage_slot_gb", 250)
        addons.setdefault("extra_storage_slot_name", "Extra Storage Slot")
        plan.addons = addons
        plan.allow_addons = True
        plan.save(update_fields=[
            "monthly_price",
            "yearly_price",
            "usd_monthly_price",
            "usd_yearly_price",
            "addon_monthly_price",
            "addon_yearly_price",
            "addon_usd_monthly_price",
            "addon_usd_yearly_price",
            "limits",
            "features",
            "addons",
            "allow_addons",
        ])


class Migration(migrations.Migration):
    dependencies = [
        ("core", "0094_seed_storage_plans"),
    ]

    operations = [
        migrations.RunPython(update_storage_pricing, migrations.RunPython.noop),
    ]
