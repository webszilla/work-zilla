from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("core", "0074_chatmessage_attachments"),
    ]

    operations = [
        migrations.AddField(
            model_name="organizationsettings",
            name="ai_chatbot_premade_replies",
            field=models.TextField(blank=True, default=""),
        ),
        migrations.AddField(
            model_name="organizationsettings",
            name="ai_chatbot_user_attachments_enabled",
            field=models.BooleanField(default=False),
        ),
    ]
