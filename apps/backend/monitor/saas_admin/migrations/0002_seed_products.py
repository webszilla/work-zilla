from django.db import migrations


def seed_products(apps, schema_editor):
    Product = apps.get_model("saas_admin", "Product")
    defaults = [
        {
            "name": "Monitor",
            "slug": "monitor",
            "description": "Workforce monitoring and productivity insights.",
            "icon": "bi-display",
            "status": "active",
            "features": "Live activity\nScreenshots\nApp usage",
            "sort_order": 1,
        },
        {
            "name": "CRM",
            "slug": "crm",
            "description": "Customer pipeline and follow-up management.",
            "icon": "bi-people",
            "status": "coming_soon",
            "features": "Leads\nDeals\nTasks",
            "sort_order": 2,
        },
        {
            "name": "ERP",
            "slug": "erp",
            "description": "Operations, inventory, and finance control.",
            "icon": "bi-box-seam",
            "status": "coming_soon",
            "features": "Inventory\nPurchasing\nAccounting",
            "sort_order": 3,
        },
        {
            "name": "HRAPP",
            "slug": "hrapp",
            "description": "HR workflows, payroll, and attendance.",
            "icon": "bi-person-badge",
            "status": "coming_soon",
            "features": "Attendance\nPayroll\nRecruiting",
            "sort_order": 4,
        },
    ]
    for row in defaults:
        Product.objects.get_or_create(slug=row["slug"], defaults=row)


class Migration(migrations.Migration):

    dependencies = [
        ("saas_admin", "0001_initial"),
    ]

    operations = [
        migrations.RunPython(seed_products, migrations.RunPython.noop),
    ]
