from django.db import migrations, models

import core.models


class Migration(migrations.Migration):

    dependencies = [
        ("core", "0092_alter_screenshot_image_upload_to"),
    ]

    operations = [
        migrations.AlterField(
            model_name="pendingtransfer",
            name="receipt",
            field=models.FileField(blank=True, null=True, upload_to=core.models._receipt_upload_to),
        ),
    ]
