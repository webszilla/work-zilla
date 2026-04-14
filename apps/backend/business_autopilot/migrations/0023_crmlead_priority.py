from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("business_autopilot", "0022_subscription_start_date_nullable"),
    ]

    operations = [
        migrations.AddField(
            model_name="crmlead",
            name="priority",
            field=models.CharField(
                choices=[("High", "High"), ("Medium", "Medium"), ("Low", "Low")],
                default="Medium",
                max_length=30,
            ),
        ),
    ]
