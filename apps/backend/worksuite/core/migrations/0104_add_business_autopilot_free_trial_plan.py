from django.db import migrations


def add_erp_free_plan(apps, schema_editor):
    Product = apps.get_model("products", "Product")
    Plan = apps.get_model("core", "Plan")

    product = Product.objects.filter(slug="business-autopilot-erp").first()
    if not product:
        return

    limits = {
        "base_price_inr_month": 0,
        "base_price_inr_year": 0,
        "base_price_usdt_month": 0,
        "base_price_usdt_year": 0,
        "user_price_inr_month": 0,
        "user_price_inr_year": 0,
        "user_price_usdt_month": 0,
        "user_price_usdt_year": 0,
        "trial_features_tier": "pro",
    }

    Plan.objects.update_or_create(
        product=product,
        name="Free",
        defaults={
            "price": 0,
            "monthly_price": 0,
            "yearly_price": 0,
            "usd_monthly_price": 0,
            "usd_yearly_price": 0,
            "employee_limit": 0,
            "device_limit": 1,
            "duration_months": 1,
            "retention_days": 30,
            "allow_addons": False,
            "allow_app_usage": True,
            "allow_gaming_ott_usage": True,
            "allow_hr_view": True,
            "screenshot_min_minutes": 5,
            "limits": limits,
            "addons": {},
            "features": {"tier_order": 0, "trial_features": "pro"},
        },
    )


def remove_erp_free_plan(apps, schema_editor):
    Product = apps.get_model("products", "Product")
    Plan = apps.get_model("core", "Plan")

    product = Product.objects.filter(slug="business-autopilot-erp").first()
    if not product:
        return

    Plan.objects.filter(product=product, name="Free", monthly_price=0, yearly_price=0).delete()


class Migration(migrations.Migration):

    dependencies = [
        ("core", "0103_seed_business_autopilot_erp_plans"),
    ]

    operations = [
        migrations.RunPython(add_erp_free_plan, remove_erp_free_plan),
    ]
