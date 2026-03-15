from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("core", "0131_organizationsettings_business_autopilot_openai_fields"),
    ]

    operations = [
        migrations.AddField(
            model_name="organizationsettings",
            name="business_autopilot_openai_account_email",
            field=models.EmailField(blank=True, default="", max_length=254),
        ),
    ]
