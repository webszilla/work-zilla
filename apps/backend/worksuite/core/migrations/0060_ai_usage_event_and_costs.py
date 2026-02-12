from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("core", "0059_ai_chatbot_ai_reply_limits"),
    ]

    operations = [
        migrations.AddField(
            model_name="aiusagemonthly",
            name="cost_inr_total",
            field=models.DecimalField(decimal_places=6, default=0, max_digits=12),
        ),
        migrations.AddField(
            model_name="aiusagemonthly",
            name="request_count",
            field=models.PositiveIntegerField(default=0),
        ),
        migrations.CreateModel(
            name="AiUsageEvent",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("product_slug", models.CharField(default="ai-chatbot", max_length=50)),
                ("period_yyyymm", models.CharField(max_length=6)),
                ("model", models.CharField(blank=True, max_length=80)),
                ("prompt_tokens", models.PositiveIntegerField(default=0)),
                ("completion_tokens", models.PositiveIntegerField(default=0)),
                ("total_tokens", models.PositiveIntegerField(default=0)),
                ("cost_inr", models.DecimalField(decimal_places=6, default=0, max_digits=12)),
                ("meta", models.JSONField(blank=True, default=dict)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("conversation", models.ForeignKey(blank=True, null=True, on_delete=models.deletion.SET_NULL, to="core.chatconversation")),
                ("message", models.ForeignKey(blank=True, null=True, on_delete=models.deletion.SET_NULL, to="core.chatmessage")),
                ("organization", models.ForeignKey(on_delete=models.deletion.CASCADE, to="core.organization")),
            ],
            options={
                "indexes": [
                    models.Index(fields=["organization", "period_yyyymm"], name="core_aiusag_organize_94b9a6_idx"),
                    models.Index(fields=["organization", "created_at"], name="core_aiusag_organize_3d7d2a_idx"),
                ],
            },
        ),
    ]
