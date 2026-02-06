from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("core", "0008_adminactivity"),
    ]

    operations = [
        migrations.AddField(
            model_name="plan",
            name="monthly_price",
            field=models.FloatField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="plan",
            name="yearly_price",
            field=models.FloatField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="subscription",
            name="billing_cycle",
            field=models.CharField(
                choices=[("monthly", "Monthly"), ("yearly", "Yearly")],
                default="monthly",
                max_length=10,
            ),
        ),
        migrations.AddField(
            model_name="subscription",
            name="retention_months",
            field=models.PositiveSmallIntegerField(default=1),
        ),
    ]
