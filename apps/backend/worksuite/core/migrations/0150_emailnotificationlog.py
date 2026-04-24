from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ("core", "0149_normalize_business_autopilot_plan_product"),
    ]

    operations = [
        migrations.CreateModel(
            name="EmailNotificationLog",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("to_email", models.EmailField(blank=True, default="", max_length=254)),
                ("category", models.CharField(db_index=True, default="", max_length=64)),
                ("event_key", models.CharField(db_index=True, default="", max_length=64)),
                ("scheduled_for", models.DateField(blank=True, db_index=True, null=True)),
                (
                    "status",
                    models.CharField(
                        choices=[("queued", "Queued"), ("sent", "Sent"), ("skipped", "Skipped"), ("failed", "Failed")],
                        db_index=True,
                        default="queued",
                        max_length=16,
                    ),
                ),
                ("subject", models.CharField(blank=True, default="", max_length=200)),
                ("template_name", models.CharField(blank=True, default="", max_length=180)),
                ("error_message", models.TextField(blank=True, default="")),
                ("meta", models.JSONField(blank=True, default=dict)),
                ("sent_at", models.DateTimeField(blank=True, null=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                (
                    "organization",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="email_notification_logs",
                        to="core.organization",
                    ),
                ),
                (
                    "subscription",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="email_notification_logs",
                        to="core.subscription",
                    ),
                ),
                (
                    "user",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="email_notification_logs",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
            options={
                "ordering": ("-created_at", "-id"),
            },
        ),
        migrations.AddConstraint(
            model_name="emailnotificationlog",
            constraint=models.UniqueConstraint(
                fields=("organization", "category", "event_key", "scheduled_for"),
                name="core_email_notification_dedupe_key",
            ),
        ),
    ]

