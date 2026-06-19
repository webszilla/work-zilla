from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ("business_autopilot", "0037_quickestimate_assignment_fields"),
    ]

    operations = [
        migrations.CreateModel(
            name="QuickEstimateHistory",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("action", models.CharField(choices=[("updated", "Updated"), ("assigned", "Assigned")], default="updated", max_length=24)),
                ("note", models.TextField(blank=True, default="")),
                ("snapshot", models.JSONField(blank=True, default=dict)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("actor", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="business_autopilot_quick_estimate_history_entries", to=settings.AUTH_USER_MODEL)),
                ("quick_estimate", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="history_entries", to="business_autopilot.quickestimate")),
            ],
            options={"ordering": ("-created_at", "-id")},
        ),
    ]
