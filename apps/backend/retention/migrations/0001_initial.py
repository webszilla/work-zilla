from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        ("core", "0087_alter_chatwidget_public_chat_code"),
    ]

    operations = [
        migrations.CreateModel(
            name="GlobalRetentionPolicy",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("grace_days", models.PositiveIntegerField(default=30)),
                ("archive_days", models.PositiveIntegerField(default=60)),
                ("hard_delete_days", models.PositiveIntegerField(default=0)),
                ("allowed_actions_during_grace", models.JSONField(default=["view", "export"])),
                ("updated_at", models.DateTimeField(auto_now=True)),
            ],
            options={
                "verbose_name": "Global Retention Policy",
                "verbose_name_plural": "Global Retention Policy",
            },
        ),
        migrations.CreateModel(
            name="TenantRetentionOverride",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("grace_days", models.PositiveIntegerField(blank=True, null=True)),
                ("archive_days", models.PositiveIntegerField(blank=True, null=True)),
                ("hard_delete_days", models.PositiveIntegerField(blank=True, null=True)),
                ("allowed_actions_during_grace", models.JSONField(blank=True, null=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("organization", models.OneToOneField(on_delete=django.db.models.deletion.CASCADE, related_name="retention_override", to="core.organization")),
            ],
            options={
                "verbose_name": "Tenant Retention Override",
                "verbose_name_plural": "Tenant Retention Overrides",
            },
        ),
        migrations.CreateModel(
            name="TenantRetentionStatus",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("status", models.CharField(choices=[("active", "Active"), ("grace_readonly", "Grace (Read-only)"), ("archived", "Archived"), ("pending_delete", "Pending Delete"), ("deleted", "Deleted")], default="active", max_length=20)),
                ("subscription_expires_at", models.DateTimeField(blank=True, null=True)),
                ("grace_until", models.DateTimeField(blank=True, null=True)),
                ("archive_until", models.DateTimeField(blank=True, null=True)),
                ("deleted_at", models.DateTimeField(blank=True, null=True)),
                ("last_evaluated_at", models.DateTimeField(blank=True, null=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("organization", models.OneToOneField(on_delete=django.db.models.deletion.CASCADE, related_name="retention_status", to="core.organization")),
            ],
        ),
        migrations.AddIndex(
            model_name="tenantretentionstatus",
            index=models.Index(fields=["status"], name="retention_t_status_idx"),
        ),
    ]
