from django.db import migrations


def seed_storage_product(apps, schema_editor):
    Product = apps.get_model("saas_admin", "Product")
    Product.objects.get_or_create(
        slug="storage",
        defaults={
            "name": "Online Storage",
            "description": "Secure online cloud file storage with org-based controls.",
            "icon": "bi-cloud",
            "status": "active",
            "features": "Online Access\nAdmin Controls\nFree System Sync",
            "sort_order": 5,
        },
    )


class Migration(migrations.Migration):

    dependencies = [
        ("saas_admin", "0010_media_storage_pull_job_file_type_counts"),
    ]

    operations = [
        migrations.RunPython(seed_storage_product, migrations.RunPython.noop),
    ]
