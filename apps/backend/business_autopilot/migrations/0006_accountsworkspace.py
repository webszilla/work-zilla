from django.db import migrations, models
from django.conf import settings


class Migration(migrations.Migration):

    dependencies = [
        ("core", "0110_fix_whatsapp_automation_addon_pricing_data"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ("business_autopilot", "0005_seed_ticketing_and_stocks_modules"),
    ]

    operations = [
        migrations.CreateModel(
            name="AccountsWorkspace",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("data", models.JSONField(blank=True, default=dict)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                (
                    "organization",
                    models.OneToOneField(
                        on_delete=models.deletion.CASCADE,
                        related_name="business_autopilot_accounts_workspace",
                        to="core.organization",
                    ),
                ),
                (
                    "updated_by",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=models.deletion.SET_NULL,
                        related_name="business_autopilot_accounts_workspace_updates",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
            options={"ordering": ("-updated_at",)},
        ),
    ]
