from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("core", "0083_aimedialibraryitem_flags"),
    ]

    operations = [
        migrations.AddField(
            model_name="invoicesellerprofile",
            name="upi_id",
            field=models.CharField(blank=True, max_length=120),
        ),
    ]
