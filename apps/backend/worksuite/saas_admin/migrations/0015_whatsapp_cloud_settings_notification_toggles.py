from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("saas_admin", "0014_whatsapp_cloud_settings_notification_flags"),
    ]

    operations = [
        migrations.AddField(
            model_name="whatsappcloudsettings",
            name="notification_toggles",
            field=models.JSONField(blank=True, default=dict),
        ),
    ]

