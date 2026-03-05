from django.db import migrations


TRIAL_FEATURE_FLAGS = {
    "trial_features": "pro",
    "digital_card": True,
    "catalogue": True,
    "basic_automation": True,
    "team_management": True,
    "advanced_automation": True,
    "priority_support": True,
}


def _apply_flags(plan, enabled):
    features = dict(plan.features or {})
    if enabled:
        features.update(TRIAL_FEATURE_FLAGS)
    else:
        for key in TRIAL_FEATURE_FLAGS.keys():
            features.pop(key, None)
        features.update({
            "digital_card": True,
            "catalogue": True,
            "basic_automation": True,
            "team_management": False,
            "advanced_automation": False,
            "priority_support": False,
        })
    plan.features = features
    plan.allow_addons = bool(enabled)
    plan.save(update_fields=["features", "allow_addons"])


def forward(apps, schema_editor):
    Plan = apps.get_model("core", "Plan")
    Product = apps.get_model("products", "Product")
    product = Product.objects.filter(slug="whatsapp-automation").first()
    if not product:
        return
    for plan in Plan.objects.filter(product=product):
        if (plan.name or "").strip().lower() != "free":
            continue
        _apply_flags(plan, True)


def reverse(apps, schema_editor):
    Plan = apps.get_model("core", "Plan")
    Product = apps.get_model("products", "Product")
    product = Product.objects.filter(slug="whatsapp-automation").first()
    if not product:
        return
    for plan in Plan.objects.filter(product=product):
        if (plan.name or "").strip().lower() != "free":
            continue
        _apply_flags(plan, False)


class Migration(migrations.Migration):
    dependencies = [
        ("core", "0121_subscription_addon_next_cycle_count"),
    ]

    operations = [
        migrations.RunPython(forward, reverse),
    ]
