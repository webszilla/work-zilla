from django.db import migrations


def seed_saas_product(apps, schema_editor):
    Product = apps.get_model("saas_admin", "Product")
    obj, _ = Product.objects.get_or_create(slug="whatsapp-automation")
    obj.name = "Whatsapp Automation"
    obj.description = "WhatsApp automation with Website Catalogue and Digital Business Card."
    obj.icon = "bi-whatsapp"
    obj.status = "active"
    obj.features = "Automation Rules\nWebsite Catalogue\nDigital Business Card"
    obj.sort_order = 65
    obj.save()


def reverse_seed(apps, schema_editor):
    Product = apps.get_model("saas_admin", "Product")
    Product.objects.filter(slug="whatsapp-automation").delete()


class Migration(migrations.Migration):

    dependencies = [
        ("saas_admin", "0015_whatsapp_cloud_settings_notification_toggles"),
    ]

    operations = [
        migrations.RunPython(seed_saas_product, reverse_seed),
    ]

