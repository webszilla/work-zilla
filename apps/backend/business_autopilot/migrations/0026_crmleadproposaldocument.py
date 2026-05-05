from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion
import apps.backend.business_autopilot.models


class Migration(migrations.Migration):

    dependencies = [
        ("business_autopilot", "0025_user_crm_reassignment_snapshot"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="CrmLeadProposalDocument",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("base_name", models.CharField(max_length=180)),
                ("version_index", models.PositiveIntegerField(default=0)),
                ("display_name", models.CharField(max_length=220)),
                ("original_filename", models.CharField(blank=True, default="", max_length=255)),
                ("file", models.FileField(upload_to=apps.backend.business_autopilot.models._crm_lead_proposal_upload_to)),
                ("file_type", models.CharField(blank=True, default="", max_length=80)),
                ("file_size", models.PositiveIntegerField(default=0)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                (
                    "lead",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="proposal_documents",
                        to="business_autopilot.crmlead",
                    ),
                ),
                (
                    "organization",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="business_autopilot_crm_lead_proposals",
                        to="core.organization",
                    ),
                ),
                (
                    "uploaded_by",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="business_autopilot_uploaded_crm_lead_proposals",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
            options={
                "ordering": ("-created_at", "-id"),
            },
        ),
        migrations.AddIndex(
            model_name="crmleadproposaldocument",
            index=models.Index(fields=["organization", "lead", "base_name", "version_index"], name="business_aut_organiz_2b7ee1_idx"),
        ),
    ]
