from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("core", "0012_plan_retention_days"),
    ]

    operations = [
        migrations.AddField(
            model_name="plan",
            name="addon_monthly_price",
            field=models.FloatField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="plan",
            name="addon_yearly_price",
            field=models.FloatField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="plan",
            name="allow_addons",
            field=models.BooleanField(default=True),
        ),
        migrations.AddField(
            model_name="subscription",
            name="addon_count",
            field=models.PositiveSmallIntegerField(default=0),
        ),
        migrations.AddField(
            model_name="subscription",
            name="addon_proration_amount",
            field=models.FloatField(default=0),
        ),
        migrations.AddField(
            model_name="subscription",
            name="addon_last_proration_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
    ]
