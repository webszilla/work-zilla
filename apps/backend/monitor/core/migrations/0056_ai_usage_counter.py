from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    dependencies = [
        ("core", "0055_chat_leads"),
    ]

    operations = [
        migrations.CreateModel(
            name="AiUsageCounter",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("product_slug", models.CharField(default="ai-chatbot", max_length=50)),
                ("period_yyyymm", models.CharField(max_length=6)),
                ("ai_replies_used", models.PositiveIntegerField(default=0)),
                ("organization", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, to="core.organization")),
            ],
            options={
                "unique_together": {("organization", "product_slug", "period_yyyymm")},
            },
        ),
    ]
