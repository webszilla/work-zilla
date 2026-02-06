from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("core", "0051_ai_chatbot_models"),
    ]

    operations = [
        migrations.AddField(
            model_name="plan",
            name="limits",
            field=models.JSONField(blank=True, default=dict),
        ),
        migrations.AddField(
            model_name="plan",
            name="addons",
            field=models.JSONField(blank=True, default=dict),
        ),
    ]
