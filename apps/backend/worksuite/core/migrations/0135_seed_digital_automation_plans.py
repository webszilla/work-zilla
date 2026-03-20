from django.db import migrations


def _upsert_plan(Plan, Product, *, name, monthly_inr, yearly_inr, social_post_limit, ai_words_limit, wp_sites_limit, whm_accounts_limit):
    product = Product.objects.filter(slug="digital-automation").first()
    if not product:
        return
    plan, _ = Plan.objects.get_or_create(product=product, name=name)
    plan.price = monthly_inr
    plan.monthly_price = monthly_inr
    plan.yearly_price = yearly_inr
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
    plan.features = {
        "social_post_limit": social_post_limit,
        "ai_words_limit": ai_words_limit,
        "wp_sites_limit": wp_sites_limit,
        "whm_accounts_limit": whm_accounts_limit,
    }
    plan.addons = {}
    plan.save()


def seed_plans(apps, schema_editor):
    Plan = apps.get_model("core", "Plan")
    Product = apps.get_model("products", "Product")

    _upsert_plan(
        Plan,
        Product,
        name="DA Starter",
        monthly_inr=999,
        yearly_inr=9990,
        social_post_limit=300,
        ai_words_limit=50000,
        wp_sites_limit=3,
        whm_accounts_limit=2,
    )
    _upsert_plan(
        Plan,
        Product,
        name="DA Growth",
        monthly_inr=2499,
        yearly_inr=24990,
        social_post_limit=2000,
        ai_words_limit=200000,
        wp_sites_limit=15,
        whm_accounts_limit=10,
    )
    _upsert_plan(
        Plan,
        Product,
        name="DA Scale",
        monthly_inr=4999,
        yearly_inr=49990,
        social_post_limit=10000,
        ai_words_limit=1000000,
        wp_sites_limit=50,
        whm_accounts_limit=30,
    )


def reverse_seed(apps, schema_editor):
    Plan = apps.get_model("core", "Plan")
    Product = apps.get_model("products", "Product")
    product = Product.objects.filter(slug="digital-automation").first()
    if not product:
        return
    Plan.objects.filter(product=product, name__in=["DA Starter", "DA Growth", "DA Scale"]).delete()


class Migration(migrations.Migration):

    dependencies = [
        ("products", "0012_product_description_created_at_seed_digital_automation"),
        ("core", "0134_adminnotification_created_by_and_more"),
    ]

    operations = [
        migrations.RunPython(seed_plans, reverse_seed),
    ]
