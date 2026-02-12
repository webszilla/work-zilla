from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion
import uuid


class Migration(migrations.Migration):
    dependencies = [
        ("saas_admin", "0008_backup_retention_settings"),
    ]

    operations = [
        migrations.CreateModel(
            name="MediaStoragePullJob",
            fields=[
                ("id", models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False, serialize=False)),
                ("status", models.CharField(choices=[("pending", "Pending"), ("running", "Running"), ("completed", "Completed"), ("failed", "Failed")], default="pending", max_length=20)),
                ("total_files", models.PositiveIntegerField(default=0)),
                ("existing_files", models.PositiveIntegerField(default=0)),
                ("copied_files", models.PositiveIntegerField(default=0)),
                ("skipped_files", models.PositiveIntegerField(default=0)),
                ("delete_local", models.BooleanField(default=False)),
                ("overwrite", models.BooleanField(default=False)),
                ("current_path", models.TextField(blank=True, default="")),
                ("error_message", models.TextField(blank=True, default="")),
                ("started_at", models.DateTimeField(blank=True, null=True)),
                ("finished_at", models.DateTimeField(blank=True, null=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("requested_by", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, to=settings.AUTH_USER_MODEL)),
            ],
            options={
                "ordering": ("-created_at",),
            },
        ),
    ]
