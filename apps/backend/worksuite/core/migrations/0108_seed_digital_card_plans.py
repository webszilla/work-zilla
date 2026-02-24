from django.db import migrations


def _upsert_plan(Plan, Product, name, monthly_inr, yearly_inr, monthly_usd, yearly_usd, addon_inr_m, addon_inr_y, addon_usd_m, addon_usd_y, limits, features):
    product = Product.objects.filter(slug="digital-card").first()
    if not product:
        return
    obj, _ = Plan.objects.get_or_create(product=product, name=name)
    obj.price = monthly_inr
    obj.monthly_price = monthly_inr
    obj.yearly_price = yearly_inr
    obj.usd_monthly_price = monthly_usd
    obj.usd_yearly_price = yearly_usd
    obj.addon_monthly_price = addon_inr_m
    obj.addon_yearly_price = addon_inr_y
    obj.addon_usd_monthly_price = addon_usd_m
    obj.addon_usd_yearly_price = addon_usd_y
    obj.allow_addons = True
    obj.employee_limit = int((limits or {}).get("included_cards", 1) or 1)
    obj.device_limit = 1
    obj.duration_months = 1
    obj.retention_days = 30
    obj.allow_app_usage = False
    obj.allow_gaming_ott_usage = False
    obj.allow_hr_view = False
    obj.included_agents = 0
    obj.limits = limits or {}
    obj.features = features or {}
    obj.addons = {
        "addon_user_label": "Add-on User",
        "addon_available": True,
    }
    obj.save()


def seed_plans(apps, schema_editor):
    Plan = apps.get_model("core", "Plan")
    Product = apps.get_model("products", "Product")
    _upsert_plan(
        Plan, Product,
        name="Starter",
        monthly_inr=99, yearly_inr=999,
        monthly_usd=2, yearly_usd=20,
        addon_inr_m=25, addon_inr_y=250,
        addon_usd_m=1, addon_usd_y=10,
        limits={"included_cards": 1, "card_limit": 1, "customization": "basic"},
        features={
            "basic_customization": True,
            "share_link": True,
            "qr_sharing": False,
            "analytics": False,
            "custom_branding": False,
            "team_management": False,
        },
    )
    _upsert_plan(
        Plan, Product,
        name="Business",
        monthly_inr=149, yearly_inr=1490,
        monthly_usd=3, yearly_usd=30,
        addon_inr_m=20, addon_inr_y=200,
        addon_usd_m=1, addon_usd_y=10,
        limits={"included_cards": 10, "card_limit": 0, "customization": "standard"},
        features={
            "basic_customization": True,
            "share_link": True,
            "qr_sharing": True,
            "analytics": True,
            "custom_branding": False,
            "team_management": True,
            "unlimited_cards": True,
        },
    )
    _upsert_plan(
        Plan, Product,
        name="Enterprise",
        monthly_inr=249, yearly_inr=2490,
        monthly_usd=4, yearly_usd=40,
        addon_inr_m=15, addon_inr_y=150,
        addon_usd_m=1, addon_usd_y=10,
        limits={"included_cards": 25, "card_limit": 0, "customization": "advanced"},
        features={
            "basic_customization": True,
            "share_link": True,
            "qr_sharing": True,
            "analytics": True,
            "custom_branding": True,
            "priority_support": True,
            "team_management": True,
            "unlimited_cards": True,
        },
    )


def reverse_seed(apps, schema_editor):
    Plan = apps.get_model("core", "Plan")
    Product = apps.get_model("products", "Product")
    product = Product.objects.filter(slug="digital-card").first()
    if product:
        Plan.objects.filter(product=product, name__in=["Starter", "Business", "Enterprise"]).delete()


class Migration(migrations.Migration):
    dependencies = [
        ("core", "0107_seed_whatsapp_automation_plans"),
        ("products", "0009_seed_whatsapp_automation"),
    ]

    operations = [
        migrations.RunPython(seed_plans, reverse_seed),
    ]
