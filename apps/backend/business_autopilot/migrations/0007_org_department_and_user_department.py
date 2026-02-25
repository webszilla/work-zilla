from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("business_autopilot", "0006_accountsworkspace"),
    ]

    operations = [
        migrations.AddField(
            model_name="organizationuser",
            name="department",
            field=models.CharField(blank=True, default="", max_length=120),
        ),
        migrations.CreateModel(
            name="OrganizationDepartment",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("name", models.CharField(max_length=120)),
                ("is_active", models.BooleanField(default=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("organization", models.ForeignKey(on_delete=models.deletion.CASCADE, related_name="business_autopilot_departments", to="core.organization")),
            ],
            options={
                "ordering": ("name",),
                "unique_together": {("organization", "name")},
            },
        ),
    ]
