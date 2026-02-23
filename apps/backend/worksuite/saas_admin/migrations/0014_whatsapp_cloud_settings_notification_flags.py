from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("saas_admin", "0013_whatsapp_cloud_settings"),
    ]

    operations = [
        migrations.AddField(
            model_name="whatsappcloudsettings",
            name="notify_admin_new_user",
            field=models.BooleanField(default=True),
        ),
        migrations.AddField(
            model_name="whatsappcloudsettings",
            name="notify_user_welcome",
            field=models.BooleanField(default=True),
        ),
    ]
