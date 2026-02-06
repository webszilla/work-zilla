from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("core", "0035_pendingtransfer_org_nullable"),
    ]

    operations = [
        migrations.AddField(
            model_name="dealeraccount",
            name="address_line1",
            field=models.CharField(blank=True, max_length=200),
        ),
        migrations.AddField(
            model_name="dealeraccount",
            name="address_line2",
            field=models.CharField(blank=True, max_length=200),
        ),
        migrations.AddField(
            model_name="dealeraccount",
            name="city",
            field=models.CharField(blank=True, max_length=120),
        ),
        migrations.AddField(
            model_name="dealeraccount",
            name="state",
            field=models.CharField(blank=True, max_length=120),
        ),
        migrations.AddField(
            model_name="dealeraccount",
            name="postal_code",
            field=models.CharField(blank=True, max_length=20),
        ),
        migrations.AddField(
            model_name="dealeraccount",
            name="bank_name",
            field=models.CharField(blank=True, max_length=120),
        ),
        migrations.AddField(
            model_name="dealeraccount",
            name="bank_account_number",
            field=models.CharField(blank=True, max_length=80),
        ),
        migrations.AddField(
            model_name="dealeraccount",
            name="bank_ifsc",
            field=models.CharField(blank=True, max_length=20),
        ),
        migrations.AddField(
            model_name="dealeraccount",
            name="upi_id",
            field=models.CharField(blank=True, max_length=80),
        ),
    ]
