from django.db import migrations


def _upsert_plan(Plan, Product, slug, name, monthly_inr, monthly_usd, limits):
    product = Product.objects.filter(slug=slug).first()
    if not product:
        return
    yearly_inr = monthly_inr * 10
    yearly_usd = monthly_usd * 10
    obj, _ = Plan.objects.get_or_create(product=product, name=name)
    obj.price = monthly_inr
    obj.monthly_price = monthly_inr
    obj.yearly_price = yearly_inr
    obj.usd_monthly_price = monthly_usd
    obj.usd_yearly_price = yearly_usd
    obj.employee_limit = 1
    obj.device_limit = 1
    obj.duration_months = 1
    obj.retention_days = 30
    obj.allow_addons = False
    obj.allow_app_usage = False
    obj.allow_gaming_ott_usage = False
    obj.allow_hr_view = False
    obj.included_agents = 0
    obj.limits = limits or {}
    obj.features = {
        "digital_card": True,
        "website_catalogue": bool(limits.get("catalogue_enabled", True)),
        "whatsapp_automation": True,
    }
    obj.addons = {}
    obj.save()


def seed_plans(apps, schema_editor):
    Plan = apps.get_model("core", "Plan")
    Product = apps.get_model("products", "Product")
    slug = "whatsapp-automation"
    _upsert_plan(Plan, Product, slug, "FREE", 0, 0, {
        "digital_card_enabled": True,
        "catalogue_enabled": False,
        "catalogue_product_limit": 5,
        "automation_rule_limit": 3,
        "automation_tier": "limited",
    })
    _upsert_plan(Plan, Product, slug, "BASIC", 149, 2, {
        "digital_card_enabled": True,
        "catalogue_enabled": True,
        "catalogue_product_limit": 25,
        "automation_rule_limit": 10,
        "automation_tier": "basic",
    })
    _upsert_plan(Plan, Product, slug, "PLUS", 199, 3, {
        "digital_card_enabled": True,
        "catalogue_enabled": True,
        "catalogue_product_limit": 100,
        "automation_rule_limit": 50,
        "automation_tier": "advanced",
    })
    _upsert_plan(Plan, Product, slug, "PROFESSIONAL", 249, 4, {
        "digital_card_enabled": True,
        "catalogue_enabled": True,
        "catalogue_product_limit": 0,
        "automation_rule_limit": 0,
        "automation_tier": "full",
    })


def reverse_seed(apps, schema_editor):
    Plan = apps.get_model("core", "Plan")
    Product = apps.get_model("products", "Product")
    product = Product.objects.filter(slug="whatsapp-automation").first()
    if product:
        Plan.objects.filter(product=product, name__in=["FREE", "BASIC", "PLUS", "PROFESSIONAL"]).delete()


class Migration(migrations.Migration):

    dependencies = [
        ("products", "0009_seed_whatsapp_automation"),
        ("core", "0106_adminnotification_audience_channel_product_slug"),
    ]

    operations = [
        migrations.RunPython(seed_plans, reverse_seed),
    ]

