from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("business_autopilot", "0041_quickestimate_proof_and_verifiers"),
    ]

    operations = [
        migrations.AddField(
            model_name="quickestimate",
            name="payment_mode",
            field=models.CharField(blank=True, default="", max_length=20),
        ),
    ]
