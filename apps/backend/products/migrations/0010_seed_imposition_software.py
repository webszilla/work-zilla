from django.db import migrations


def seed_product(apps, schema_editor):
    Product = apps.get_model("products", "Product")
    obj, _ = Product.objects.get_or_create(slug="imposition-software")
    obj.name = "Imposition Software"
    obj.short_description = "Lightweight imposition desktop module for ID and business card print layouts."
    obj.is_active = True
    obj.sort_order = 50
    obj.save()


def reverse_seed(apps, schema_editor):
    Product = apps.get_model("products", "Product")
    Product.objects.filter(slug="imposition-software").delete()


class Migration(migrations.Migration):

    dependencies = [
        ("products", "0009_seed_whatsapp_automation"),
    ]

    operations = [
        migrations.RunPython(seed_product, reverse_seed),
    ]
