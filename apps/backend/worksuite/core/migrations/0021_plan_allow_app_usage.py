from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("core", "0020_subscriptionhistory"),
    ]

    operations = [
        migrations.AddField(
            model_name="plan",
            name="allow_app_usage",
            field=models.BooleanField(default=False),
        ),
    ]

