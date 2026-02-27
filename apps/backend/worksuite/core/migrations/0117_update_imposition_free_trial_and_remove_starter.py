from django.db import migrations


def forwards(apps, schema_editor):
    Product = apps.get_model("products", "Product")
    Plan = apps.get_model("core", "Plan")

    product = Product.objects.filter(slug="imposition-software").first()
    if not product:
        return

    # Remove starter plan from public pricing lineup.
    Plan.objects.filter(product=product, name__iexact="starter").delete()

    trial_features = {
        "basic_imposition": True,
        "id_card_layout": True,
        "business_card_layout": True,
        "manual_card_upload": True,
        "export_print_pdf": True,
        "advanced_imposition": True,
        "batch_processing": True,
        "print_marks": True,
        "export_hd_print_files": True,
        "excel_data_import": True,
        "id_card_data_update": True,
        "business_card_data_update": True,
        "bulk_card_generation": True,
        "layout_templates": True,
        "serial_number_generator": True,
        "team_users": True,
        "priority_processing": True,
        "advanced_layout_presets": True,
        "bulk_export_engine": True,
        "api_integration_ready": True,
        "is_trial": True,
        "hidden_public": False,
    }

    trial_limits = {
        "product_slug": "imposition-software",
        "sheet_sizes": ["A4", "A3", "custom"],
        "custom_sheet_size": True,
        "device_limit": 2,
        "user_limit": 2,
        "included_users": 2,
        "trial_days": 7,
        "excel_enabled": True,
        "all_features_enabled": True,
        "additional_user_price_inr_month": 300,
        "additional_user_price_usd_month": 4,
        "additional_user_price_inr_year": 3000,
        "additional_user_price_usd_year": 40,
    }

    defaults = {
        "price": 0,
        "monthly_price": 0,
        "yearly_price": 0,
        "usd_monthly_price": 0,
        "usd_yearly_price": 0,
        "addon_monthly_price": 300,
        "addon_yearly_price": 3000,
        "addon_usd_monthly_price": 4,
        "addon_usd_yearly_price": 40,
        "employee_limit": 2,
        "device_limit": 2,
        "retention_days": 7,
        "allow_addons": True,
        "screenshot_min_minutes": 5,
        "allow_app_usage": False,
        "allow_gaming_ott_usage": False,
        "allow_hr_view": False,
        "included_agents": 0,
        "limits": trial_limits,
        "features": trial_features,
        "addons": {
            "additional_user_inr_month": 300,
            "additional_user_usd_month": 4,
            "additional_user_inr_year": 3000,
            "additional_user_usd_year": 40,
        },
        "duration_months": 1,
    }

    plan, _ = Plan.objects.get_or_create(product=product, name="Free Trial", defaults=defaults)
    for key, value in defaults.items():
        setattr(plan, key, value)
    plan.save()

    # Cleanup old trial naming variants if present.
    Plan.objects.filter(product=product, name__iexact="trial").exclude(id=plan.id).delete()
    Plan.objects.filter(product=product, name__iexact="free").exclude(id=plan.id).delete()


def backwards(apps, schema_editor):
    # Keep data in place on rollback to avoid accidental plan deletion.
    return


class Migration(migrations.Migration):
    dependencies = [
        ("core", "0116_seed_imposition_software_plans"),
    ]

    operations = [
        migrations.RunPython(forwards, backwards),
    ]

