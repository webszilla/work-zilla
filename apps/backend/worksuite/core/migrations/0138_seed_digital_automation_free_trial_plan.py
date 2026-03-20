from django.db import migrations


def forwards(apps, schema_editor):
    Plan = apps.get_model("core", "Plan")
    Product = apps.get_model("products", "Product")

    product = Product.objects.filter(slug="digital-automation").first()
    if not product:
        return

    plan, _ = Plan.objects.get_or_create(product=product, name="Free Trial")
    plan.price = 0
    plan.monthly_price = 0
    plan.yearly_price = 0
    plan.usd_monthly_price = 0
    plan.usd_yearly_price = 0
    plan.addon_monthly_price = 0
    plan.addon_yearly_price = 0
    plan.addon_usd_monthly_price = 0
    plan.addon_usd_yearly_price = 0
    plan.duration_months = 1
    plan.employee_limit = 0
    plan.retention_days = 30
    plan.allow_addons = False
    plan.allow_app_usage = False
    plan.allow_gaming_ott_usage = False
    plan.allow_hr_view = False
    plan.limits = {}
    plan.addons = {}
    plan.features = {
        "social_accounts": -1,
        "scheduled_posts": -1,
        "ai_words_limit": -1,
        "wp_sites": -1,
        "hosting_accounts": -1,
        "support": "dedicated",
        "white_label": True,
        "fair_usage": True,
        "is_trial": True,
        "trial_days": 7,
        "trial_features": "all",
        "is_popular": False,
    }
    plan.save()


def reverse(apps, schema_editor):
    Plan = apps.get_model("core", "Plan")
    Product = apps.get_model("products", "Product")

    product = Product.objects.filter(slug="digital-automation").first()
    if not product:
        return

    Plan.objects.filter(product=product, name="Free Trial").delete()


class Migration(migrations.Migration):

    dependencies = [
        ("core", "0137_update_digital_automation_support_labels"),
    ]

    operations = [
        migrations.RunPython(forwards, reverse),
    ]
