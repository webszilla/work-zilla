from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("business_autopilot", "0023_crmlead_priority"),
    ]

    operations = [
        migrations.AddField(
            model_name="crmdeal",
            name="won_amount_final",
            field=models.DecimalField(decimal_places=2, default=0, max_digits=16),
        ),
    ]
