from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("core", "0052_plan_limits_addons"),
    ]

    operations = [
        migrations.AddField(
            model_name="subscription",
            name="trial_end",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AlterField(
            model_name="subscription",
            name="status",
            field=models.CharField(
                choices=[
                    ("pending", "Pending"),
                    ("active", "Active"),
                    ("trialing", "Trialing"),
                    ("expired", "Expired"),
                ],
                default="pending",
                max_length=20,
            ),
        ),
    ]
