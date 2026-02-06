from django.db import migrations, models

import core.models


class Migration(migrations.Migration):

    dependencies = [
        ("core", "0091_alter_chatwidget_public_chat_code"),
    ]

    operations = [
        migrations.AlterField(
            model_name="screenshot",
            name="image",
            field=models.ImageField(upload_to=core.models._screenshot_upload_to),
        ),
    ]
