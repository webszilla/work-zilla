from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("business_autopilot", "0019_crmcontact"),
    ]

    operations = [
        migrations.AddField(
            model_name="crmsalesorder",
            name="paid_amount",
            field=models.FloatField(default=0),
        ),
        migrations.AddField(
            model_name="crmsalesorder",
            name="payment_date",
            field=models.DateField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="crmsalesorder",
            name="payment_mode",
            field=models.CharField(blank=True, default="", max_length=50),
        ),
        migrations.AddField(
            model_name="crmsalesorder",
            name="payment_status",
            field=models.CharField(choices=[("pending", "Pending"), ("partial", "Partial"), ("paid", "Paid")], default="pending", max_length=20),
        ),
        migrations.AddField(
            model_name="crmsalesorder",
            name="transaction_id",
            field=models.CharField(blank=True, default="", max_length=100),
        ),
    ]
