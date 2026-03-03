from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("whatsapp_automation", "0008_cataloguecategory_catalogueproduct_item_type"),
    ]

    operations = [
        migrations.AddField(
            model_name="companyprofile",
            name="country",
            field=models.CharField(blank=True, default="", max_length=120),
        ),
        migrations.AddField(
            model_name="companyprofile",
            name="postal_code",
            field=models.CharField(blank=True, default="", max_length=40),
        ),
        migrations.AddField(
            model_name="companyprofile",
            name="state",
            field=models.CharField(blank=True, default="", max_length=120),
        ),
    ]
