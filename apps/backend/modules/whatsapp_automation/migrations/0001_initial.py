from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion

import apps.backend.modules.whatsapp_automation.models


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ("core", "0106_adminnotification_audience_channel_product_slug"),
    ]

    operations = [
        migrations.CreateModel(
            name="CompanyProfile",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("company_name", models.CharField(blank=True, default="", max_length=200)),
                ("logo", models.ImageField(blank=True, null=True, upload_to=apps.backend.modules.whatsapp_automation.models._company_logo_upload_to)),
                ("phone", models.CharField(blank=True, default="", max_length=40)),
                ("whatsapp_number", models.CharField(blank=True, default="", max_length=40)),
                ("email", models.EmailField(blank=True, default="", max_length=254)),
                ("website", models.URLField(blank=True, default="")),
                ("address", models.TextField(blank=True, default="")),
                ("description", models.TextField(blank=True, default="")),
                ("social_links", models.JSONField(blank=True, default=dict)),
                ("theme_color", models.CharField(blank=True, default="#22c55e", max_length=20)),
                ("product_highlights", models.JSONField(blank=True, default=list)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("organization", models.OneToOneField(on_delete=django.db.models.deletion.CASCADE, related_name="wa_company_profile", to="core.organization")),
                ("updated_by", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="wa_company_profile_updates", to=settings.AUTH_USER_MODEL)),
            ],
            options={"ordering": ("organization_id",)},
        ),
        migrations.CreateModel(
            name="WhatsappSettings",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("welcome_message", models.TextField(blank=True, default="Hi 👋 Welcome to our business.\nReply:\n1 - View Products\n2 - Price Details\n3 - Contact Support")),
                ("auto_reply_enabled", models.BooleanField(default=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("organization", models.OneToOneField(on_delete=django.db.models.deletion.CASCADE, related_name="wa_settings", to="core.organization")),
            ],
        ),
        migrations.CreateModel(
            name="CatalogueProduct",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("title", models.CharField(max_length=200)),
                ("image", models.ImageField(blank=True, null=True, upload_to=apps.backend.modules.whatsapp_automation.models._catalogue_image_upload_to)),
                ("price", models.CharField(blank=True, default="", max_length=80)),
                ("description", models.TextField(blank=True, default="")),
                ("category", models.CharField(blank=True, default="", max_length=120)),
                ("order_button_enabled", models.BooleanField(default=True)),
                ("sort_order", models.PositiveIntegerField(default=0)),
                ("is_active", models.BooleanField(default=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("organization", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="wa_catalogue_products", to="core.organization")),
            ],
            options={"ordering": ("sort_order", "id")},
        ),
        migrations.CreateModel(
            name="AutomationRule",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("keyword", models.CharField(blank=True, default="", max_length=120)),
                ("reply_message", models.TextField(blank=True, default="")),
                ("is_default", models.BooleanField(default=False)),
                ("sort_order", models.PositiveIntegerField(default=0)),
                ("is_active", models.BooleanField(default=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("organization", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="wa_automation_rules", to="core.organization")),
            ],
            options={"ordering": ("sort_order", "id")},
        ),
    ]

