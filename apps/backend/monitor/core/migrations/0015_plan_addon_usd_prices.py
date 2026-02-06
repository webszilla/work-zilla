from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("core", "0014_plan_usd_prices"),
    ]

    operations = [
        migrations.AddField(
            model_name="plan",
            name="addon_usd_monthly_price",
            field=models.FloatField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="plan",
            name="addon_usd_yearly_price",
            field=models.FloatField(blank=True, null=True),
        ),
    ]
