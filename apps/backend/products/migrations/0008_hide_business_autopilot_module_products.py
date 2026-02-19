from django.db import migrations


def hide_module_only_products(apps, schema_editor):
    Product = apps.get_model("products", "Product")
    Product.objects.filter(slug__in=["hrm", "projects", "accounts"]).update(is_active=False)


def show_module_only_products(apps, schema_editor):
    Product = apps.get_model("products", "Product")
    Product.objects.filter(slug__in=["hrm", "projects", "accounts"]).update(is_active=True)


class Migration(migrations.Migration):

    dependencies = [
        ("products", "0007_seed_business_autopilot_erp"),
    ]

    operations = [
        migrations.RunPython(hide_module_only_products, show_module_only_products),
    ]
