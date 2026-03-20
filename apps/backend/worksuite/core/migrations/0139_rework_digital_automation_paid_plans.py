from django.db import migrations


PAID_PLAN_NAMES = ["Starter", "Pro", "Agency / Unlimited"]
REMOVE_PLAN_NAMES = ["Growth"]


def _apply_common_paid_fields(plan, *, monthly_inr, yearly_inr, monthly_usd, yearly_usd):
    plan.price = monthly_inr
    plan.monthly_price = monthly_inr
    plan.yearly_price = yearly_inr
    plan.usd_monthly_price = monthly_usd
    plan.usd_yearly_price = yearly_usd
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


def _upsert(Plan, product, *, name, monthly_inr, yearly_inr, monthly_usd, yearly_usd, features):
    plan, _ = Plan.objects.get_or_create(product=product, name=name)
    _apply_common_paid_fields(
        plan,
        monthly_inr=monthly_inr,
        yearly_inr=yearly_inr,
        monthly_usd=monthly_usd,
        yearly_usd=yearly_usd,
    )
    plan.features = features
    plan.save()


def forwards(apps, schema_editor):
    Plan = apps.get_model("core", "Plan")
    Product = apps.get_model("products", "Product")

    product = Product.objects.filter(slug="digital-automation").first()
    if not product:
        return

    Plan.objects.filter(product=product, name__in=REMOVE_PLAN_NAMES).delete()

    _upsert(
        Plan,
        product,
        name="Starter",
        monthly_inr=999,
        yearly_inr=9999,
        monthly_usd=12,
        yearly_usd=120,
        features={
            "social_accounts": 3,
            "scheduled_posts": 50,
            "ai_words_limit": 10000,
            "wp_sites": 1,
            "hosting_accounts": 0,
            "whm_billing_access": False,
            "support": "email",
            "is_popular": False,
        },
    )

    _upsert(
        Plan,
        product,
        name="Pro",
        monthly_inr=5999,
        yearly_inr=59999,
        monthly_usd=69,
        yearly_usd=690,
        features={
            "social_accounts": 25,
            "scheduled_posts": 1000,
            "ai_words_limit": 200000,
            "wp_sites": 15,
            "hosting_accounts": 0,
            "whm_billing_access": False,
            "support": "priority + whatsapp",
            "is_popular": False,
        },
    )

    _upsert(
        Plan,
        product,
        name="Agency / Unlimited",
        monthly_inr=12999,
        yearly_inr=129999,
        monthly_usd=149,
        yearly_usd=1490,
        features={
            "social_accounts": -1,
            "scheduled_posts": -1,
            "ai_words_limit": -1,
            "wp_sites": -1,
            "hosting_accounts": -1,
            "whm_billing_access": True,
            "support": "dedicated",
            "white_label": True,
            "fair_usage": True,
            "is_popular": False,
        },
    )

    free_trial = Plan.objects.filter(product=product, name="Free Trial").first()
    if free_trial:
        features = dict(free_trial.features or {})
        features.setdefault("social_accounts", -1)
        features.setdefault("scheduled_posts", -1)
        features.setdefault("ai_words_limit", -1)
        features.setdefault("wp_sites", -1)
        features.setdefault("hosting_accounts", -1)
        features["whm_billing_access"] = True
        features.setdefault("white_label", True)
        features.setdefault("fair_usage", True)
        features.setdefault("is_trial", True)
        features.setdefault("trial_days", 7)
        free_trial.features = features
        free_trial.save(update_fields=["features"])


def reverse(apps, schema_editor):
    Plan = apps.get_model("core", "Plan")
    Product = apps.get_model("products", "Product")

    product = Product.objects.filter(slug="digital-automation").first()
    if not product:
        return

    # Restore Growth plan (previous paid tier) on reverse.
    growth, _ = Plan.objects.get_or_create(product=product, name="Growth")
    _apply_common_paid_fields(
        growth,
        monthly_inr=2499,
        yearly_inr=24999,
        monthly_usd=29,
        yearly_usd=290,
    )
    growth.features = {
        "social_accounts": 10,
        "scheduled_posts": 300,
        "ai_words_limit": 50000,
        "wp_sites": 5,
        "hosting_accounts": 5,
        "support": "priority",
        "is_popular": True,
    }
    growth.save()


class Migration(migrations.Migration):

    dependencies = [
        ("core", "0138_seed_digital_automation_free_trial_plan"),
    ]

    operations = [
        migrations.RunPython(forwards, reverse),
    ]
