from django.db import migrations


def set_product_display_names(apps, schema_editor):
    Product = apps.get_model("products", "Product")
    Product.objects.filter(slug="imposition-software").update(
        name="Print Marks",
        short_description="Digital printing imposition software for ID Card, Business Card, Brochure, and Book layouts.",
    )
    Product.objects.filter(slug="business-autopilot-erp").update(
        name="Business Autopilot",
        short_description="Modular business platform for CRM, HR, Projects, Accounts, Ticketing, and Stocks.",
    )


def rollback_product_display_names(apps, schema_editor):
    Product = apps.get_model("products", "Product")
    Product.objects.filter(slug="imposition-software").update(
        name="Imposition Software",
        short_description="Lightweight imposition desktop module for ID and business card print layouts.",
    )
    Product.objects.filter(slug="business-autopilot-erp").update(
        name="Business Autopilot ERP",
        short_description="Business operations suite for CRM, HR, projects, and accounts.",
    )


class Migration(migrations.Migration):

    dependencies = [
        ("products", "0010_seed_imposition_software"),
    ]

    operations = [
        migrations.RunPython(set_product_display_names, rollback_product_display_names),
    ]
