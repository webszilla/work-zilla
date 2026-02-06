from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("core", "0013_addons_pricing"),
    ]

    operations = [
        migrations.AddField(
            model_name="plan",
            name="usd_monthly_price",
            field=models.FloatField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="plan",
            name="usd_yearly_price",
            field=models.FloatField(blank=True, null=True),
        ),
    ]
