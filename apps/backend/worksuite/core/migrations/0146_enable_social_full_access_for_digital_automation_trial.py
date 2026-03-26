from django.db import migrations


def _set_trial_social_full_access(apps, schema_editor):
    Plan = apps.get_model("core", "Plan")
    trial_plans = Plan.objects.filter(product__slug="digital-automation", name__icontains="free")
    for plan in trial_plans:
        features = dict(plan.features or {})
        if not (features.get("is_trial") or "trial" in str(plan.name or "").lower()):
            continue
        features["trial_features"] = "all"
        features["company_count"] = -1
        features["social_accounts"] = -1
        features["scheduled_posts"] = -1
        features["social_media_enabled"] = True
        features["social_api_connect_enabled"] = True
        features["social_posting_enabled"] = True
        features["social_company_wise_enabled"] = True
        features["trial_unlock_top_features"] = True
        plan.features = features
        plan.save(update_fields=["features"])


def _unset_trial_social_full_access(apps, schema_editor):
    Plan = apps.get_model("core", "Plan")
    trial_plans = Plan.objects.filter(product__slug="digital-automation", name__icontains="free")
    for plan in trial_plans:
        features = dict(plan.features or {})
        features.pop("social_media_enabled", None)
        features.pop("social_api_connect_enabled", None)
        features.pop("social_posting_enabled", None)
        features.pop("social_company_wise_enabled", None)
        features.pop("trial_unlock_top_features", None)
        plan.features = features
        plan.save(update_fields=["features"])


class Migration(migrations.Migration):

    dependencies = [
        ("core", "0145_socialplatformconnection_socialpostjob_and_more"),
    ]

    operations = [
        migrations.RunPython(_set_trial_social_full_access, _unset_trial_social_full_access),
    ]
