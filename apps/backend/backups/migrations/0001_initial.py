from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion
import uuid


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        ("core", "0088_merge_20260128_1736"),
        ("products", "0001_initial"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="BackupRecord",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("status", models.CharField(choices=[("queued", "Queued"), ("running", "Running"), ("completed", "Completed"), ("expired", "Expired"), ("purged", "Purged"), ("failed", "Failed")], default="queued", max_length=16)),
                ("request_id", models.UUIDField(blank=True, null=True)),
                ("storage_path", models.TextField(blank=True, default="")),
                ("manifest_path", models.TextField(blank=True, default="")),
                ("checksum_path", models.TextField(blank=True, default="")),
                ("checksum_sha256", models.CharField(blank=True, default="", max_length=128)),
                ("size_bytes", models.BigIntegerField(default=0)),
                ("error_message", models.TextField(blank=True, default="")),
                ("download_url", models.TextField(blank=True, default="")),
                ("download_token", models.CharField(blank=True, default="", max_length=64)),
                ("download_url_expires_at", models.DateTimeField(blank=True, null=True)),
                ("expires_at", models.DateTimeField(blank=True, null=True)),
                ("purged_at", models.DateTimeField(blank=True, null=True)),
                ("requested_at", models.DateTimeField(auto_now_add=True)),
                ("started_at", models.DateTimeField(blank=True, null=True)),
                ("completed_at", models.DateTimeField(blank=True, null=True)),
                ("organization", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="backup_records", to="core.organization")),
                ("product", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="backup_records", to="products.product")),
                ("requested_by", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="requested_backups", to=settings.AUTH_USER_MODEL)),
            ],
            options={
                "ordering": ["-requested_at"],
            },
        ),
        migrations.CreateModel(
            name="BackupAuditLog",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("action", models.CharField(choices=[("backup_requested", "Backup Requested"), ("backup_started", "Backup Started"), ("backup_completed", "Backup Completed"), ("backup_failed", "Backup Failed"), ("backup_downloaded", "Backup Downloaded"), ("restore_requested", "Restore Requested"), ("restore_started", "Restore Started"), ("restore_completed", "Restore Completed"), ("restore_failed", "Restore Failed"), ("backup_deleted", "Backup Deleted")], max_length=32)),
                ("status", models.CharField(choices=[("ok", "OK"), ("warning", "Warning"), ("error", "Error")], default="ok", max_length=16)),
                ("actor_type", models.CharField(choices=[("user", "User"), ("admin", "Admin"), ("system", "System")], default="system", max_length=16)),
                ("message", models.TextField(blank=True, default="")),
                ("backup_id", models.UUIDField(blank=True, null=True)),
                ("request_id", models.UUIDField(blank=True, null=True)),
                ("trace_id", models.CharField(blank=True, default="", max_length=64)),
                ("event_meta", models.JSONField(blank=True, default=dict)),
                ("ip_address", models.GenericIPAddressField(blank=True, null=True)),
                ("user_agent", models.TextField(blank=True, default="")),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("organization", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="backup_audit_logs", to="core.organization")),
                ("product", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="backup_audit_logs", to="products.product")),
                ("user", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="backup_audit_logs", to=settings.AUTH_USER_MODEL)),
            ],
            options={
                "ordering": ["-created_at"],
            },
        ),
        migrations.CreateModel(
            name="OrgDownloadActivity",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("organization_id", models.UUIDField()),
                ("product_id", models.UUIDField(blank=True, null=True)),
                ("admin_user_id", models.UUIDField()),
                ("backup_id", models.CharField(max_length=100)),
                ("backup_size_mb", models.IntegerField()),
                ("status", models.CharField(choices=[("generated", "Generated"), ("downloaded", "Downloaded"), ("expired", "Expired"), ("failed", "Failed")], max_length=20)),
                ("generated_at", models.DateTimeField()),
                ("expires_at", models.DateTimeField()),
                ("created_ip", models.GenericIPAddressField(blank=True, null=True)),
            ],
        ),
        migrations.AddIndex(
            model_name="backuprecord",
            index=models.Index(fields=["organization", "product", "requested_at"], name="backups_bac_organiz_184e52_idx"),
        ),
        migrations.AddIndex(
            model_name="backuprecord",
            index=models.Index(fields=["status", "requested_at"], name="backups_bac_status_1a32f4_idx"),
        ),
        migrations.AddIndex(
            model_name="backuprecord",
            index=models.Index(fields=["request_id"], name="backups_bac_request_9d1b89_idx"),
        ),
        migrations.AddIndex(
            model_name="backupauditlog",
            index=models.Index(fields=["organization", "product", "created_at"], name="backups_bac_organiz_9d644b_idx"),
        ),
        migrations.AddIndex(
            model_name="backupauditlog",
            index=models.Index(fields=["action", "status"], name="backups_bac_action_9b705b_idx"),
        ),
        migrations.AddIndex(
            model_name="backupauditlog",
            index=models.Index(fields=["backup_id"], name="backups_bac_backup__e8d54e_idx"),
        ),
        migrations.AddIndex(
            model_name="backupauditlog",
            index=models.Index(fields=["request_id"], name="backups_bac_request_12f2c3_idx"),
        ),
    ]
