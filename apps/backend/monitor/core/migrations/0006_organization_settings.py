from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ("core", "0005_employee_pc_name"),
    ]

    operations = [
        migrations.CreateModel(
            name="OrganizationSettings",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("screenshot_interval_minutes", models.PositiveSmallIntegerField(default=5)),
                ("organization", models.OneToOneField(on_delete=django.db.models.deletion.CASCADE, to="core.organization")),
            ],
        ),
    ]
