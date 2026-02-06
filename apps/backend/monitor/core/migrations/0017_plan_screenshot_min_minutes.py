from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("core", "0016_plan_price_default"),
    ]

    operations = [
        migrations.AddField(
            model_name="plan",
            name="screenshot_min_minutes",
            field=models.PositiveSmallIntegerField(default=5),
        ),
    ]
