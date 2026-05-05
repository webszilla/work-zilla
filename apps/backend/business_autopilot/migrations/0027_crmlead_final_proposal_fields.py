from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ("business_autopilot", "0026_crmleadproposaldocument"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.AddField(
            model_name="crmlead",
            name="final_proposal_amount",
            field=models.DecimalField(decimal_places=2, default=0, max_digits=16),
        ),
        migrations.AddField(
            model_name="crmlead",
            name="proposal_finalized_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="crmlead",
            name="proposal_finalized_by",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="business_autopilot_crm_proposal_finalized_leads",
                to=settings.AUTH_USER_MODEL,
            ),
        ),
    ]

