from django.db import migrations, models


def seed_modules(apps, schema_editor):
    Module = apps.get_model("business_autopilot", "Module")
    defaults = [
        {"name": "CRM", "slug": "crm", "is_active": True, "sort_order": 1},
        {"name": "HR Management", "slug": "hrm", "is_active": True, "sort_order": 2},
        {"name": "Project Management", "slug": "projects", "is_active": True, "sort_order": 3},
        {"name": "Accounts / ERP", "slug": "accounts", "is_active": True, "sort_order": 4},
    ]
    for row in defaults:
        Module.objects.get_or_create(slug=row["slug"], defaults=row)


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        ("core", "0102_alter_chatwidget_public_chat_code"),
    ]

    operations = [
        migrations.CreateModel(
            name="Module",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("name", models.CharField(max_length=120)),
                ("slug", models.SlugField(max_length=120, unique=True)),
                ("is_active", models.BooleanField(default=True)),
                ("sort_order", models.PositiveIntegerField(default=0)),
            ],
            options={"ordering": ("sort_order", "name")},
        ),
        migrations.CreateModel(
            name="OrganizationModule",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("enabled", models.BooleanField(default=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                (
                    "module",
                    models.ForeignKey(on_delete=models.deletion.CASCADE, related_name="organization_modules", to="business_autopilot.module"),
                ),
                (
                    "organization",
                    models.ForeignKey(on_delete=models.deletion.CASCADE, related_name="business_modules", to="core.organization"),
                ),
            ],
            options={
                "ordering": ("organization_id", "module__sort_order", "module__name"),
                "unique_together": {("organization", "module")},
            },
        ),
        migrations.RunPython(seed_modules, migrations.RunPython.noop),
    ]
