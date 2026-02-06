from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("core", "0049_seed_alert_rules"),
    ]

    operations = [
        migrations.AddField(
            model_name="plan",
            name="included_agents",
            field=models.PositiveSmallIntegerField(default=0),
        ),
        migrations.AddField(
            model_name="plan",
            name="addon_agent_monthly_price",
            field=models.FloatField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="plan",
            name="addon_agent_yearly_price",
            field=models.FloatField(blank=True, null=True),
        ),
    ]
