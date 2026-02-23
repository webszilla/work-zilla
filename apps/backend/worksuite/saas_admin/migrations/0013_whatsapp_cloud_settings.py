from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("saas_admin", "0012_seed_business_autopilot_erp"),
    ]

    operations = [
        migrations.CreateModel(
            name="WhatsAppCloudSettings",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("provider", models.CharField(default="meta_whatsapp_cloud", max_length=40, unique=True)),
                ("is_active", models.BooleanField(default=False)),
                ("phone_number_id", models.CharField(blank=True, default="", max_length=64)),
                ("access_token", models.TextField(blank=True, default="")),
                ("admin_phone", models.CharField(blank=True, default="", max_length=32)),
                ("admin_template_name", models.CharField(blank=True, default="new_user_admin_alert", max_length=100)),
                ("user_welcome_template_name", models.CharField(blank=True, default="welcome_user_signup", max_length=100)),
                ("template_language", models.CharField(blank=True, default="en_US", max_length=20)),
                ("graph_api_version", models.CharField(blank=True, default="v21.0", max_length=20)),
                ("timeout_seconds", models.PositiveIntegerField(default=15)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
            ],
            options={
                "verbose_name": "WhatsApp Cloud Settings",
                "verbose_name_plural": "WhatsApp Cloud Settings",
            },
        ),
    ]
