from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ("business_autopilot", "0036_quickestimate_quickestimatesequence_and_more"),
    ]

    operations = [
        migrations.AddField(
            model_name="quickestimate",
            name="assigned_by",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="business_autopilot_quick_estimates_assignments_made",
                to=settings.AUTH_USER_MODEL,
            ),
        ),
        migrations.AddField(
            model_name="quickestimate",
            name="assigned_user",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="business_autopilot_quick_estimates_assigned",
                to=settings.AUTH_USER_MODEL,
            ),
        ),
    ]
