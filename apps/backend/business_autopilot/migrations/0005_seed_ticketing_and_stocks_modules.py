from django.db import migrations


def seed_new_modules(apps, schema_editor):
    Module = apps.get_model("business_autopilot", "Module")
    rows = [
        {"name": "Ticketing System", "slug": "ticketing", "is_active": True, "sort_order": 5},
        {"name": "Stocks Management", "slug": "stocks", "is_active": True, "sort_order": 6},
    ]
    for row in rows:
        Module.objects.update_or_create(slug=row["slug"], defaults=row)


class Migration(migrations.Migration):

    dependencies = [
        ("business_autopilot", "0004_organizationemployeerole"),
    ]

    operations = [
        migrations.RunPython(seed_new_modules, migrations.RunPython.noop),
    ]
