from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    dependencies = [
        ("core", "0057_chatmessage_ai_fields"),
    ]

    operations = [
        migrations.CreateModel(
            name="AiUsageMonthly",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("product_slug", models.CharField(default="ai-chatbot", max_length=50)),
                ("period_yyyymm", models.CharField(max_length=6)),
                ("ai_replies_used", models.PositiveIntegerField(default=0)),
                ("tokens_total", models.PositiveIntegerField(default=0)),
                ("cost_usd_total", models.DecimalField(decimal_places=6, default=0, max_digits=12)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("organization", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, to="core.organization")),
            ],
            options={
                "indexes": [
                    models.Index(fields=["period_yyyymm"], name="core_aiusag_period__94c4b7_idx"),
                    models.Index(fields=["organization", "period_yyyymm"], name="core_aiusag_organiz_9b9a32_idx"),
                ],
                "unique_together": {("organization", "product_slug", "period_yyyymm")},
            },
        ),
    ]
