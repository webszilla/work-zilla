from django.db import migrations


def forwards(apps, schema_editor):
    Plan = apps.get_model("core", "Plan")
    Product = apps.get_model("products", "Product")

    product = Product.objects.filter(slug="digital-automation").first()
    if not product:
        return

    trial_plan = Plan.objects.filter(product=product, name="Free Trial").first()
    if not trial_plan:
        return

    features = dict(trial_plan.features or {})
    features["is_trial"] = True
    features["trial_days"] = int(features.get("trial_days") or 7)
    features["scheduled_posts"] = 20
    features["ai_words_limit"] = 10000
    trial_plan.features = features
    trial_plan.save(update_fields=["features"])


def reverse(apps, schema_editor):
    Plan = apps.get_model("core", "Plan")
    Product = apps.get_model("products", "Product")

    product = Product.objects.filter(slug="digital-automation").first()
    if not product:
        return

    trial_plan = Plan.objects.filter(product=product, name="Free Trial").first()
    if not trial_plan:
        return

    features = dict(trial_plan.features or {})
    features["scheduled_posts"] = -1
    features["ai_words_limit"] = -1
    trial_plan.features = features
    trial_plan.save(update_fields=["features"])


class Migration(migrations.Migration):

    dependencies = [
        ("core", "0140_rename_digital_automation_agency_plan"),
    ]

    operations = [
        migrations.RunPython(forwards, reverse),
    ]
