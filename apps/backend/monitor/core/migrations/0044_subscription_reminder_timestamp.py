from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("core", "0043_pendingtransfer_paid_on"),
    ]

    operations = [
        migrations.AddField(
            model_name="subscription",
            name="last_renewal_reminder_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
    ]
