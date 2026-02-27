from django.db import migrations, models


def seed_addon_catalog(apps, schema_editor):
    ImpositionAddonCatalog = apps.get_model("imposition", "ImpositionAddonCatalog")
    ImpositionOrgAddon = apps.get_model("imposition", "ImpositionOrgAddon")

    ImpositionAddonCatalog.objects.update_or_create(
        addon_code="imposition_user",
        defaults={
            "addon_name": "Additional User",
            "product": "Imposition Software",
            "price_month_inr": 300,
            "price_year_inr": 3000,
            "price_month_usd": 4,
            "price_year_usd": 40,
            "is_active": True,
        },
    )

    ImpositionOrgAddon.objects.filter(addon_code="additional_user").update(addon_code="imposition_user")


class Migration(migrations.Migration):

    dependencies = [
        ("imposition", "0004_product_dashboard_tables"),
    ]

    operations = [
        migrations.AddField(
            model_name="impositionorgaddon",
            name="billing_cycle",
            field=models.CharField(default="monthly", max_length=20),
        ),
        migrations.AddField(
            model_name="impositionorgaddon",
            name="unit_price_monthly_usd",
            field=models.DecimalField(decimal_places=2, default=4, max_digits=10),
        ),
        migrations.AddField(
            model_name="impositionorgaddon",
            name="unit_price_yearly_inr",
            field=models.DecimalField(decimal_places=2, default=3000, max_digits=10),
        ),
        migrations.AddField(
            model_name="impositionorgaddon",
            name="unit_price_yearly_usd",
            field=models.DecimalField(decimal_places=2, default=40, max_digits=10),
        ),
        migrations.AlterField(
            model_name="impositionorgaddon",
            name="addon_code",
            field=models.CharField(
                choices=[("imposition_user", "Additional User"), ("additional_user", "Additional User")],
                default="imposition_user",
                max_length=40,
            ),
        ),
        migrations.CreateModel(
            name="ImpositionAddonCatalog",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("addon_code", models.CharField(max_length=50, unique=True)),
                ("addon_name", models.CharField(max_length=120)),
                ("product", models.CharField(default="Imposition Software", max_length=120)),
                ("price_month_inr", models.DecimalField(decimal_places=2, default=300, max_digits=12)),
                ("price_year_inr", models.DecimalField(decimal_places=2, default=3000, max_digits=12)),
                ("price_month_usd", models.DecimalField(decimal_places=2, default=4, max_digits=12)),
                ("price_year_usd", models.DecimalField(decimal_places=2, default=40, max_digits=12)),
                ("is_active", models.BooleanField(default=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
            ],
            options={
                "db_table": "addons",
                "ordering": ("addon_name",),
            },
        ),
        migrations.RunPython(seed_addon_catalog, migrations.RunPython.noop),
    ]
