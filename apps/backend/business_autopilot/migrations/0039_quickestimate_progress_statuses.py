from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("business_autopilot", "0038_quickestimatehistory"),
    ]

    operations = [
        migrations.AddField(
            model_name="quickestimate",
            name="delivery_status",
            field=models.CharField(
                choices=[("completed", "Completed"), ("non_completed", "Non Completed")],
                default="non_completed",
                max_length=20,
            ),
        ),
        migrations.AddField(
            model_name="quickestimate",
            name="job_status",
            field=models.CharField(
                choices=[("completed", "Completed"), ("non_completed", "Non Completed")],
                default="non_completed",
                max_length=20,
            ),
        ),
        migrations.AddField(
            model_name="quickestimate",
            name="payment_status",
            field=models.CharField(
                choices=[("completed", "Completed"), ("non_completed", "Non Completed")],
                default="non_completed",
                max_length=20,
            ),
        ),
    ]
