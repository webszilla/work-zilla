from django.db import migrations


def forward(apps, schema_editor):
    Plan = apps.get_model("core", "Plan")
    mapping = {
        "FREE": (False, None, None, None, None),
        "BASIC": (True, 25, 250, 0.29, 3),
        "PLUS": (True, 20, 200, 0.24, 2.5),
        "PROFESSIONAL": (True, 15, 150, 0.19, 2),
    }
    for plan in Plan.objects.filter(product__slug="whatsapp-automation"):
        cfg = mapping.get((plan.name or "").upper())
        if not cfg:
            continue
        allow_addons, inr_m, inr_y, usd_m, usd_y = cfg
        plan.allow_addons = allow_addons
        plan.addon_monthly_price = inr_m
        plan.addon_yearly_price = inr_y
        plan.addon_usd_monthly_price = usd_m
        plan.addon_usd_yearly_price = usd_y
        addons = dict(plan.addons or {})
        addons["addon_scope"] = "digital_card_feature"
        addons["addon_user_label"] = "Digital Card Add-on User"
        plan.addons = addons
        plan.save(update_fields=[
            "allow_addons",
            "addon_monthly_price",
            "addon_yearly_price",
            "addon_usd_monthly_price",
            "addon_usd_yearly_price",
            "addons",
        ])


def reverse(apps, schema_editor):
    Plan = apps.get_model("core", "Plan")
    for plan in Plan.objects.filter(product__slug="whatsapp-automation"):
        plan.allow_addons = False
        plan.addon_monthly_price = None
        plan.addon_yearly_price = None
        plan.addon_usd_monthly_price = None
        plan.addon_usd_yearly_price = None
        addons = dict(plan.addons or {})
        addons.pop("addon_scope", None)
        addons.pop("addon_user_label", None)
        plan.addons = addons
        plan.save(update_fields=[
            "allow_addons",
            "addon_monthly_price",
            "addon_yearly_price",
            "addon_usd_monthly_price",
            "addon_usd_yearly_price",
            "addons",
        ])


class Migration(migrations.Migration):
    dependencies = [
        ("core", "0109_update_whatsapp_automation_addon_pricing"),
    ]

    operations = [
        migrations.RunPython(forward, reverse),
    ]
