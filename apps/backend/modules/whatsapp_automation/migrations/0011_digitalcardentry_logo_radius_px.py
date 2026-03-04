from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("whatsapp_automation", "0010_digitalcardentry_theme_secondary_color"),
    ]

    operations = [
        migrations.AddField(
            model_name="digitalcardentry",
            name="logo_radius_px",
            field=models.PositiveSmallIntegerField(default=28),
        ),
    ]
