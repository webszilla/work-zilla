from django.db import migrations


def forwards(apps, schema_editor):
    Plan = apps.get_model("core", "Plan")
    Product = apps.get_model("products", "Product")

    product = Product.objects.filter(slug="digital-automation").first()
    if not product:
        return

    pro = Plan.objects.filter(product=product, name="Pro").first()
    if not pro:
        return

    features = dict(pro.features or {})
    features["support"] = "priority + whatsapp"
    pro.features = features
    pro.save(update_fields=["features"])


def reverse(apps, schema_editor):
    Plan = apps.get_model("core", "Plan")
    Product = apps.get_model("products", "Product")

    product = Product.objects.filter(slug="digital-automation").first()
    if not product:
        return

    pro = Plan.objects.filter(product=product, name="Pro").first()
    if not pro:
        return

    features = dict(pro.features or {})
    if features.get("support") == "priority + whatsapp":
        features["support"] = "priority_whatsapp"
        pro.features = features
        pro.save(update_fields=["features"])


class Migration(migrations.Migration):

    dependencies = [
        ("core", "0136_update_digital_automation_pricing_plans"),
    ]

    operations = [
        migrations.RunPython(forwards, reverse),
    ]
