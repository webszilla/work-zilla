from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("core", "0153_update_business_autopilot_plan_pricing"),
    ]

    operations = [
        migrations.AddField(
            model_name="organizationsettings",
            name="business_autopilot_ai_voice_gender",
            field=models.CharField(blank=True, default="female", max_length=20),
        ),
        migrations.AddField(
            model_name="organizationsettings",
            name="business_autopilot_ai_wake_phrase",
            field=models.CharField(blank=True, default="", max_length=120),
        ),
        migrations.AddField(
            model_name="organizationsettings",
            name="business_autopilot_ai_wake_word_enabled",
            field=models.BooleanField(default=False),
        ),
    ]
