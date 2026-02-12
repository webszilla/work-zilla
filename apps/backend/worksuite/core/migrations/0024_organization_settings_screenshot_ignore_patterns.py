from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("core", "0023_company_privacy_support_duration"),
    ]

    operations = [
        migrations.AddField(
            model_name="organizationsettings",
            name="screenshot_ignore_patterns",
            field=models.TextField(blank=True, default=""),
        ),
    ]
