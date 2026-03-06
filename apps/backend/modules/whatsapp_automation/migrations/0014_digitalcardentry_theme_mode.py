from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("whatsapp_automation", "0013_digitalcardentry_storage_keys"),
    ]

    operations = [
        migrations.AddField(
            model_name="digitalcardentry",
            name="theme_mode",
            field=models.CharField(
                blank=True,
                choices=[("gradient", "Gradient"), ("flat", "Flat")],
                default="gradient",
                max_length=16,
            ),
        ),
    ]
