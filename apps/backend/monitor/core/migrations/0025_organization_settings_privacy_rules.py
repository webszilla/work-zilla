from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("core", "0024_organization_settings_screenshot_ignore_patterns"),
    ]

    operations = [
        migrations.AddField(
            model_name="organizationsettings",
            name="privacy_keyword_rules",
            field=models.TextField(blank=True, default=""),
        ),
        migrations.AddField(
            model_name="organizationsettings",
            name="auto_blur_password_fields",
            field=models.BooleanField(default=True),
        ),
        migrations.AddField(
            model_name="organizationsettings",
            name="auto_blur_otp_fields",
            field=models.BooleanField(default=True),
        ),
        migrations.AddField(
            model_name="organizationsettings",
            name="auto_blur_card_fields",
            field=models.BooleanField(default=True),
        ),
        migrations.AddField(
            model_name="organizationsettings",
            name="auto_blur_email_inbox",
            field=models.BooleanField(default=True),
        ),
    ]
