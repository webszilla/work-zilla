from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ("core", "0154_organizationsettings_ai_office_assistant_fields"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="BusinessAutopilotChatHistory",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("chat_date", models.DateField()),
                ("messages", models.JSONField(blank=True, default=list)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("organization", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="business_autopilot_chat_histories", to="core.organization")),
                ("user", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="business_autopilot_chat_histories", to=settings.AUTH_USER_MODEL)),
            ],
            options={
                "indexes": [
                    models.Index(fields=["organization", "user", "chat_date"], name="core_busine_organiz_7bc690_idx"),
                    models.Index(fields=["organization", "updated_at"], name="core_busine_organiz_dafcdc_idx"),
                ],
                "constraints": [
                    models.UniqueConstraint(fields=("organization", "user", "chat_date"), name="uniq_ba_chat_history_org_user_date"),
                ],
            },
        ),
    ]
