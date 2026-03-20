from django.db import migrations


def seed_saas_product(apps, schema_editor):
    Product = apps.get_model("saas_admin", "Product")
    obj, _ = Product.objects.get_or_create(slug="digital-automation")
    obj.name = "Digital Automation"
    obj.description = "Automation suite for social posting, AI writing, WordPress publishing, and hosting billing operations."
    obj.icon = "bi-gear-wide-connected"
    obj.status = "active"
    obj.features = "Social Automation\nAI Content Writer\nWordPress Auto Post\nHosting Billing"
    obj.sort_order = 70
    obj.save()


def reverse_seed(apps, schema_editor):
    Product = apps.get_model("saas_admin", "Product")
    Product.objects.filter(slug="digital-automation").delete()


class Migration(migrations.Migration):

    dependencies = [
        ("saas_admin", "0019_amazon_ses_settings"),
    ]

    operations = [
        migrations.RunPython(seed_saas_product, reverse_seed),
    ]
