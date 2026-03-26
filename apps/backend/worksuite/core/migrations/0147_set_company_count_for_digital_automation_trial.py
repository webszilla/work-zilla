from django.db import migrations


def _set_trial_company_count(apps, schema_editor):
    Plan = apps.get_model("core", "Plan")
    trial_plans = Plan.objects.filter(product__slug="digital-automation", name__icontains="free")
    for plan in trial_plans:
        features = dict(plan.features or {})
        if not (features.get("is_trial") or "trial" in str(plan.name or "").lower()):
            continue
        if "company_count" not in features:
            features["company_count"] = -1
        plan.features = features
        plan.save(update_fields=["features"])


def _unset_trial_company_count(apps, schema_editor):
    Plan = apps.get_model("core", "Plan")
    trial_plans = Plan.objects.filter(product__slug="digital-automation", name__icontains="free")
    for plan in trial_plans:
        features = dict(plan.features or {})
        if features.get("company_count") == -1:
            features.pop("company_count", None)
            plan.features = features
            plan.save(update_fields=["features"])


class Migration(migrations.Migration):

    dependencies = [
        ("core", "0146_enable_social_full_access_for_digital_automation_trial"),
    ]

    operations = [
        migrations.RunPython(_set_trial_company_count, _unset_trial_company_count),
    ]
