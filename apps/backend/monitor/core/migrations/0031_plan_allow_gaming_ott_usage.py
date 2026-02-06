from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("core", "0030_alter_subscriptionhistory_status"),
    ]

    operations = [
        migrations.AddField(
            model_name="plan",
            name="allow_gaming_ott_usage",
            field=models.BooleanField(default=False),
        ),
    ]
