from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("core", "0053_subscription_trial_fields"),
    ]

    operations = [
        migrations.AddField(
            model_name="plan",
            name="features",
            field=models.JSONField(blank=True, default=dict),
        ),
    ]
