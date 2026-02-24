from django.db import migrations


def apply_whatsapp_automation_addons(apps, schema_editor):
    Plan = apps.get_model("core", "Plan")
    Product = apps.get_model("products", "Product")
    product = Product.objects.filter(slug="whatsapp-automation").first()
    if not product:
        return

    # Add-on users apply only to the Digital Card feature inside WhatsApp Automation.
    mapping = {
        "BASIC": {
            "allow_addons": True,
            "addon_monthly_price": 25,
            "addon_yearly_price": 250,
            "addon_usd_monthly_price": 0.29,
            "addon_usd_yearly_price": 3,
        },
        "PLUS": {
            "allow_addons": True,
            "addon_monthly_price": 20,
            "addon_yearly_price": 200,
            "addon_usd_monthly_price": 0.24,
            "addon_usd_yearly_price": 2.5,
        },
        "PROFESSIONAL": {
            "allow_addons": True,
            "addon_monthly_price": 15,
            "addon_yearly_price": 150,
            "addon_usd_monthly_price": 0.19,
            "addon_usd_yearly_price": 2,
        },
        "FREE": {
            "allow_addons": False,
            "addon_monthly_price": 0,
            "addon_yearly_price": 0,
            "addon_usd_monthly_price": 0,
            "addon_usd_yearly_price": 0,
        },
    }

    for plan in Plan.objects.filter(product=product):
        cfg = mapping.get((plan.name or "").upper())
        if not cfg:
            continue
        for key, value in cfg.items():
            setattr(plan, key, value)
        addons = dict(plan.addons or {})
        addons["addon_scope"] = "digital_card_feature"
        addons["addon_user_label"] = "Digital Card Add-on User"
        plan.addons = addons
        plan.save()


def reverse_whatsapp_automation_addons(apps, schema_editor):
    Plan = apps.get_model("core", "Plan")
    Product = apps.get_model("products", "Product")
    product = Product.objects.filter(slug="whatsapp-automation").first()
    if not product:
        return
    for plan in Plan.objects.filter(product=product):
        if (plan.name or "").upper() == "FREE":
            plan.allow_addons = False
        else:
            plan.allow_addons = False
        plan.addon_monthly_price = 0
        plan.addon_yearly_price = 0
        plan.addon_usd_monthly_price = 0
        plan.addon_usd_yearly_price = 0
        addons = dict(plan.addons or {})
        addons.pop("addon_scope", None)
        addons.pop("addon_user_label", None)
        plan.addons = addons
        plan.save()


class Migration(migrations.Migration):
    dependencies = [
        ("core", "0108_seed_digital_card_plans"),
    ]

    operations = [
        migrations.RunPython(apply_whatsapp_automation_addons, reverse_whatsapp_automation_addons),
    ]
