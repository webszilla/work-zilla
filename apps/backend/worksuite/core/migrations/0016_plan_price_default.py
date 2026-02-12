from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("core", "0015_plan_addon_usd_prices"),
    ]

    operations = [
        migrations.AlterField(
            model_name="plan",
            name="price",
            field=models.FloatField(default=0),
        ),
    ]
