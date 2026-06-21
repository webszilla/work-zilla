from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("business_autopilot", "0042_quickestimate_payment_mode"),
    ]

    operations = [
        migrations.AddField(
            model_name="quickestimate",
            name="notes",
            field=models.TextField(blank=True, default=""),
        ),
    ]
