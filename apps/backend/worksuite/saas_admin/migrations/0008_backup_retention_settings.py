from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ("saas_admin", "0007_global_media_storage_settings"),
    ]

    operations = [
        migrations.CreateModel(
            name="BackupRetentionSettings",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("last_n", models.PositiveIntegerField(default=30)),
                ("daily_days", models.PositiveIntegerField(default=30)),
                ("weekly_weeks", models.PositiveIntegerField(default=12)),
                ("monthly_months", models.PositiveIntegerField(default=12)),
                ("updated_at", models.DateTimeField(auto_now=True)),
            ],
            options={
                "verbose_name": "Backup Retention Settings",
                "verbose_name_plural": "Backup Retention Settings",
            },
        ),
        migrations.CreateModel(
            name="OrganizationBackupRetentionOverride",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("last_n", models.PositiveIntegerField(default=0)),
                ("daily_days", models.PositiveIntegerField(default=0)),
                ("weekly_weeks", models.PositiveIntegerField(default=0)),
                ("monthly_months", models.PositiveIntegerField(default=0)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("organization", models.OneToOneField(on_delete=django.db.models.deletion.CASCADE, to="core.organization")),
            ],
            options={
                "verbose_name": "Organization Backup Retention Override",
                "verbose_name_plural": "Organization Backup Retention Overrides",
            },
        ),
        migrations.CreateModel(
            name="ProductBackupRetentionOverride",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("last_n", models.PositiveIntegerField(default=0)),
                ("daily_days", models.PositiveIntegerField(default=0)),
                ("weekly_weeks", models.PositiveIntegerField(default=0)),
                ("monthly_months", models.PositiveIntegerField(default=0)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("product", models.OneToOneField(on_delete=django.db.models.deletion.CASCADE, to="saas_admin.product")),
            ],
            options={
                "verbose_name": "Product Backup Retention Override",
                "verbose_name_plural": "Product Backup Retention Overrides",
            },
        ),
    ]
