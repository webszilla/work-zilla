from django.db import migrations


def seed_business_autopilot(apps, schema_editor):
    Product = apps.get_model("products", "Product")
    defaults = [
        {
            "name": "Business Autopilot ERP",
            "slug": "business-autopilot-erp",
            "short_description": "Unified CRM, HRM, Projects, and Accounts for organizations.",
            "is_active": True,
            "sort_order": 45,
        },
        {
            "name": "HR Management",
            "slug": "hrm",
            "short_description": "HR workflows, attendance, and employee lifecycle.",
            "is_active": True,
            "sort_order": 46,
        },
        {
            "name": "Project Management",
            "slug": "projects",
            "short_description": "Project planning, execution, and team collaboration.",
            "is_active": True,
            "sort_order": 47,
        },
        {
            "name": "Accounts ERP",
            "slug": "accounts",
            "short_description": "Accounting, receivables, payables, and ERP controls.",
            "is_active": True,
            "sort_order": 48,
        },
    ]
    for row in defaults:
        Product.objects.get_or_create(slug=row["slug"], defaults=row)


class Migration(migrations.Migration):

    dependencies = [
        ("products", "0006_update_storage_name"),
    ]

    operations = [
        migrations.RunPython(seed_business_autopilot, migrations.RunPython.noop),
    ]
