from django.db import migrations, models

import core.models


class Migration(migrations.Migration):

    dependencies = [
        ("core", "0132_organizationsettings_business_autopilot_openai_account_email"),
    ]

    operations = [
        migrations.AddField(
            model_name="userprofile",
            name="profile_photo",
            field=models.ImageField(blank=True, null=True, upload_to=core.models._user_profile_photo_upload_to),
        ),
    ]
