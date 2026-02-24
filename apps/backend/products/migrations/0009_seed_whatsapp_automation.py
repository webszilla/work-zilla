from django.db import migrations


def seed_product(apps, schema_editor):
    Product = apps.get_model("products", "Product")
    obj, _ = Product.objects.get_or_create(slug="whatsapp-automation")
    obj.name = "Whatsapp Automation"
    obj.short_description = "WhatsApp automation with digital card and website catalogue."
    obj.is_active = True
    obj.sort_order = 45
    obj.save()


def reverse_seed(apps, schema_editor):
    Product = apps.get_model("products", "Product")
    Product.objects.filter(slug="whatsapp-automation").delete()


class Migration(migrations.Migration):

    dependencies = [
        ("products", "0008_hide_business_autopilot_module_products"),
    ]

    operations = [
        migrations.RunPython(seed_product, reverse_seed),
    ]

