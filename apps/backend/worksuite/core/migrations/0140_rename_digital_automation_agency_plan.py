from django.db import migrations


OLD_NAME = "Agency / Unlimited"
NEW_NAME = "Agency"


def forwards(apps, schema_editor):
    Plan = apps.get_model("core", "Plan")
    Product = apps.get_model("products", "Product")

    product = Product.objects.filter(slug="digital-automation").first()
    if not product:
        return

    old_plan = Plan.objects.filter(product=product, name=OLD_NAME).first()
    new_plan = Plan.objects.filter(product=product, name=NEW_NAME).first()

    if old_plan and not new_plan:
        old_plan.name = NEW_NAME
        old_plan.save(update_fields=["name"])
        return

    if old_plan and new_plan:
        # Keep NEW_NAME row as canonical; drop legacy duplicate row.
        old_plan.delete()


def reverse(apps, schema_editor):
    Plan = apps.get_model("core", "Plan")
    Product = apps.get_model("products", "Product")

    product = Product.objects.filter(slug="digital-automation").first()
    if not product:
        return

    new_plan = Plan.objects.filter(product=product, name=NEW_NAME).first()
    old_plan = Plan.objects.filter(product=product, name=OLD_NAME).first()

    if new_plan and not old_plan:
        new_plan.name = OLD_NAME
        new_plan.save(update_fields=["name"])


class Migration(migrations.Migration):

    dependencies = [
        ("core", "0139_rework_digital_automation_paid_plans"),
    ]

    operations = [
        migrations.RunPython(forwards, reverse),
    ]
