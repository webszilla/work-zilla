from django.db import migrations, models
import core.models


class Migration(migrations.Migration):

    dependencies = [
        ("core", "0073_chattransferlog"),
    ]

    operations = [
        migrations.AddField(
            model_name="chatmessage",
            name="attachment",
            field=models.FileField(blank=True, null=True, upload_to=core.models._chat_attachment_upload_to),
        ),
        migrations.AddField(
            model_name="chatmessage",
            name="attachment_name",
            field=models.CharField(blank=True, default="", max_length=255),
        ),
        migrations.AddField(
            model_name="chatmessage",
            name="attachment_type",
            field=models.CharField(blank=True, default="", max_length=120),
        ),
        migrations.AddField(
            model_name="chatmessage",
            name="attachment_size",
            field=models.PositiveIntegerField(default=0),
        ),
    ]
