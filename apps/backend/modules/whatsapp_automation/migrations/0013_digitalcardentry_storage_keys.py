from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("whatsapp_automation", "0012_digitalcardentry_is_primary"),
    ]

    operations = [
        migrations.AddField(
            model_name="digitalcardentry",
            name="hero_banner_storage_key",
            field=models.TextField(blank=True, default=""),
        ),
        migrations.AddField(
            model_name="digitalcardentry",
            name="logo_storage_key",
            field=models.TextField(blank=True, default=""),
        ),
    ]
