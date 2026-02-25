from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("whatsapp_automation", "0006_digitalcardentry_template_style"),
    ]

    operations = [
        migrations.AddField(
            model_name="digitalcardentry",
            name="font_size_pt",
            field=models.PositiveSmallIntegerField(default=16),
        ),
        migrations.AddField(
            model_name="digitalcardentry",
            name="icon_size_pt",
            field=models.PositiveSmallIntegerField(default=14),
        ),
    ]

