from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("whatsapp_automation", "0009_companyprofile_country_state_postal_code"),
    ]

    operations = [
        migrations.AddField(
            model_name="digitalcardentry",
            name="theme_secondary_color",
            field=models.CharField(blank=True, default="#0f172a", max_length=20),
        ),
    ]
