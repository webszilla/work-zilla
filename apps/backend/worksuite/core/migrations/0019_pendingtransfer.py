from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion
import core.models


class Migration(migrations.Migration):

    dependencies = [
        ("core", "0018_userprofile_phone_number"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="PendingTransfer",
            fields=[
                ("id", models.AutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("request_type", models.CharField(choices=[("new", "New Account"), ("renew", "Renewal"), ("addon", "Addon")], default="new", max_length=10)),
                ("billing_cycle", models.CharField(choices=[("monthly", "Monthly"), ("yearly", "Yearly")], default="monthly", max_length=10)),
                ("retention_days", models.PositiveSmallIntegerField(default=30)),
                ("addon_count", models.PositiveSmallIntegerField(blank=True, null=True)),
                ("currency", models.CharField(default="INR", max_length=10)),
                ("amount", models.FloatField(default=0)),
                ("reference_no", models.CharField(blank=True, max_length=100)),
                ("receipt", models.FileField(blank=True, null=True, upload_to=core.models._receipt_upload_to)),
                ("notes", models.TextField(blank=True)),
                ("status", models.CharField(choices=[("draft", "Draft"), ("pending", "Pending"), ("approved", "Approved"), ("rejected", "Rejected")], default="draft", max_length=10)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("organization", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, to="core.organization")),
                ("plan", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, to="core.plan")),
                ("user", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, to=settings.AUTH_USER_MODEL)),
            ],
        ),
    ]
