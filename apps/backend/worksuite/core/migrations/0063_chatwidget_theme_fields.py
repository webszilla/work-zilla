from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("core", "0062_chatwidget_public_chat_code"),
    ]

    operations = [
        migrations.AddField(
            model_name="chatwidget",
            name="theme_preset",
            field=models.CharField(default="emerald", max_length=40),
        ),
        migrations.AddField(
            model_name="chatwidget",
            name="theme_primary",
            field=models.CharField(blank=True, default="", max_length=20),
        ),
        migrations.AddField(
            model_name="chatwidget",
            name="theme_accent",
            field=models.CharField(blank=True, default="", max_length=20),
        ),
        migrations.AddField(
            model_name="chatwidget",
            name="theme_background",
            field=models.CharField(blank=True, default="", max_length=20),
        ),
    ]
