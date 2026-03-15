from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("core", "0130_billingprofile_mobile_phone"),
    ]

    operations = [
        migrations.AddField(
            model_name="organizationsettings",
            name="business_autopilot_ai_agent_name",
            field=models.CharField(blank=True, default="Work Zilla AI Assistant", max_length=120),
        ),
        migrations.AddField(
            model_name="organizationsettings",
            name="business_autopilot_openai_api_key",
            field=models.TextField(blank=True, default=""),
        ),
        migrations.AddField(
            model_name="organizationsettings",
            name="business_autopilot_openai_enabled",
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name="organizationsettings",
            name="business_autopilot_openai_model",
            field=models.CharField(blank=True, default="gpt-4o-mini", max_length=120),
        ),
    ]
