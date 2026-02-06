from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("core", "0011_subscription_retention_days"),
    ]

    operations = [
        migrations.AddField(
            model_name="plan",
            name="retention_days",
            field=models.PositiveSmallIntegerField(
                choices=[(30, "30 Days"), (60, "60 Days"), (90, "90 Days")],
                default=30,
            ),
        ),
    ]
