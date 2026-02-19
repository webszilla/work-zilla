from django.db import migrations


def seed_business_autopilot_saas_product(apps, schema_editor):
    Product = apps.get_model("saas_admin", "Product")
    Product.objects.get_or_create(
        slug="business-autopilot-erp",
        defaults={
            "name": "Business Autopilot ERP",
            "description": "All-in-one suite with CRM, HR Management, Projects, and Accounts.",
            "icon": "bi-briefcase",
            "status": "active",
            "features": "CRM\nHR Management\nProject Management\nAccounts / ERP",
            "sort_order": 8,
        },
    )


class Migration(migrations.Migration):

    dependencies = [
        ("saas_admin", "0011_seed_storage_product"),
    ]

    operations = [
        migrations.RunPython(seed_business_autopilot_saas_product, migrations.RunPython.noop),
    ]
