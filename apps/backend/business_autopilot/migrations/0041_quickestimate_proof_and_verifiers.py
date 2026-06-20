from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ("business_autopilot", "0040_alter_quickestimatehistory_action"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.AddField(
            model_name="quickestimate",
            name="delivery_verified_by",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="business_autopilot_quick_estimates_delivery_verified",
                to=settings.AUTH_USER_MODEL,
            ),
        ),
        migrations.AddField(
            model_name="quickestimate",
            name="job_verified_by",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="business_autopilot_quick_estimates_job_verified",
                to=settings.AUTH_USER_MODEL,
            ),
        ),
        migrations.AddField(
            model_name="quickestimate",
            name="payment_proof_image",
            field=models.TextField(blank=True, default=""),
        ),
        migrations.AddField(
            model_name="quickestimate",
            name="payment_verified_by",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="business_autopilot_quick_estimates_payment_verified",
                to=settings.AUTH_USER_MODEL,
            ),
        ),
    ]
