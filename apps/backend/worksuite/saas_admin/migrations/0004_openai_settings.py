from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("saas_admin", "0003_seed_ai_chatbot_product"),
    ]

    operations = [
        migrations.CreateModel(
            name="OpenAISettings",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("provider", models.CharField(default="openai", max_length=40, unique=True)),
                ("api_key", models.TextField(blank=True, default="")),
                ("model", models.CharField(default="gpt-4o-mini", max_length=80)),
                ("input_cost_per_1k_tokens_inr", models.DecimalField(decimal_places=4, default=0, max_digits=12)),
                ("output_cost_per_1k_tokens_inr", models.DecimalField(decimal_places=4, default=0, max_digits=12)),
                ("fixed_markup_percent", models.DecimalField(decimal_places=2, default=0, max_digits=6)),
                ("is_active", models.BooleanField(default=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
            ],
            options={
                "ordering": ("provider",),
            },
        ),
    ]
