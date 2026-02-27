from django.db import migrations


IMPOSITION_LIMITS = {
    "starter": {"sheet_sizes": ["A4", "A3"], "custom_sheet_size": False},
    "pro": {"sheet_sizes": ["A4", "A3", "custom"], "custom_sheet_size": True},
    "business": {"sheet_sizes": ["A4", "A3", "custom"], "custom_sheet_size": True},
    "enterprise": {"sheet_sizes": ["A4", "A3", "custom"], "custom_sheet_size": True},
    "trial": {"sheet_sizes": ["A4"], "custom_sheet_size": False},
}


IMPOSITION_FEATURES = {
    "starter": {
        "basic_imposition": True,
        "id_card_layout": True,
        "business_card_layout": True,
        "manual_card_upload": True,
        "export_print_pdf": True,
        "advanced_imposition": False,
        "batch_processing": False,
        "print_marks": False,
        "export_hd_print_files": False,
        "excel_data_import": False,
        "id_card_data_update": False,
        "business_card_data_update": False,
        "bulk_card_generation": False,
        "layout_templates": False,
        "serial_number_generator": False,
        "team_users": False,
        "priority_processing": False,
        "advanced_layout_presets": False,
        "bulk_export_engine": False,
        "api_integration_ready": False,
    },
    "pro": {
        "basic_imposition": True,
        "id_card_layout": True,
        "business_card_layout": True,
        "manual_card_upload": True,
        "export_print_pdf": True,
        "advanced_imposition": True,
        "batch_processing": True,
        "print_marks": True,
        "export_hd_print_files": True,
        "excel_data_import": False,
        "id_card_data_update": False,
        "business_card_data_update": False,
        "bulk_card_generation": False,
        "layout_templates": False,
        "serial_number_generator": False,
        "team_users": False,
        "priority_processing": False,
        "advanced_layout_presets": False,
        "bulk_export_engine": False,
        "api_integration_ready": False,
    },
    "business": {
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
        "team_users": False,
        "priority_processing": False,
        "advanced_layout_presets": False,
        "bulk_export_engine": False,
        "api_integration_ready": False,
    },
    "enterprise": {
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
    },
    "trial": {
        "basic_imposition": True,
        "id_card_layout": True,
        "business_card_layout": True,
        "manual_card_upload": True,
        "export_print_pdf": True,
        "watermark_export": True,
        "limited_templates": True,
        "advanced_imposition": False,
        "batch_processing": False,
        "print_marks": False,
        "export_hd_print_files": False,
        "excel_data_import": False,
        "id_card_data_update": False,
        "business_card_data_update": False,
        "bulk_card_generation": False,
        "layout_templates": False,
        "serial_number_generator": False,
        "team_users": False,
        "priority_processing": False,
        "advanced_layout_presets": False,
        "bulk_export_engine": False,
        "api_integration_ready": False,
        "is_trial": True,
        "hidden_public": True,
    },
}


def _upsert_plan(Plan, product, *, name, monthly_inr, monthly_usd, yearly_inr, yearly_usd, device_limit, addon_inr, addon_usd, retention_days, code):
    limits = dict(IMPOSITION_LIMITS.get(code, {}))
    limits.update({
        "product_slug": "imposition-software",
        "device_limit": device_limit,
        "additional_user_price_inr_month": addon_inr,
        "additional_user_price_usd_month": addon_usd,
        "additional_user_price_inr_year": addon_inr * 12,
        "additional_user_price_usd_year": addon_usd * 12,
        "excel_enabled": code in ("business", "enterprise"),
    })

    defaults = {
        "monthly_price": monthly_inr,
        "yearly_price": yearly_inr,
        "usd_monthly_price": monthly_usd,
        "usd_yearly_price": yearly_usd,
        "addon_monthly_price": addon_inr,
        "addon_yearly_price": addon_inr * 12,
        "addon_usd_monthly_price": addon_usd,
        "addon_usd_yearly_price": addon_usd * 12,
        "employee_limit": 1,
        "device_limit": device_limit,
        "retention_days": retention_days,
        "allow_addons": True,
        "screenshot_min_minutes": 5,
        "allow_app_usage": False,
        "allow_gaming_ott_usage": False,
        "allow_hr_view": False,
        "included_agents": 0,
        "limits": limits,
        "features": dict(IMPOSITION_FEATURES.get(code, {})),
        "addons": {
            "additional_user_inr_month": addon_inr,
            "additional_user_usd_month": addon_usd,
            "additional_user_inr_year": addon_inr * 12,
            "additional_user_usd_year": addon_usd * 12,
        },
    }

    obj, _ = Plan.objects.get_or_create(product=product, name=name, defaults=defaults)
    for key, value in defaults.items():
        setattr(obj, key, value)
    obj.price = monthly_inr
    obj.duration_months = 1
    obj.save()


def seed_plans(apps, schema_editor):
    Product = apps.get_model("products", "Product")
    Plan = apps.get_model("core", "Plan")

    product = Product.objects.filter(slug="imposition-software").first()
    if not product:
        return

    rows = [
        {
            "code": "starter",
            "name": "Starter",
            "monthly_inr": 999,
            "monthly_usd": 12,
            "yearly_inr": 9999,
            "yearly_usd": 120,
            "device_limit": 1,
            "retention_days": 30,
        },
        {
            "code": "pro",
            "name": "Pro",
            "monthly_inr": 1999,
            "monthly_usd": 24,
            "yearly_inr": 19999,
            "yearly_usd": 240,
            "device_limit": 3,
            "retention_days": 60,
        },
        {
            "code": "business",
            "name": "Business",
            "monthly_inr": 3999,
            "monthly_usd": 48,
            "yearly_inr": 39999,
            "yearly_usd": 480,
            "device_limit": 5,
            "retention_days": 90,
        },
        {
            "code": "enterprise",
            "name": "Enterprise",
            "monthly_inr": 6999,
            "monthly_usd": 84,
            "yearly_inr": 69999,
            "yearly_usd": 840,
            "device_limit": 10,
            "retention_days": 120,
        },
        {
            "code": "trial",
            "name": "Trial",
            "monthly_inr": 0,
            "monthly_usd": 0,
            "yearly_inr": 0,
            "yearly_usd": 0,
            "device_limit": 1,
            "retention_days": 7,
        },
    ]

    addon_inr = 300
    addon_usd = 4

    for row in rows:
        _upsert_plan(
            Plan,
            product,
            name=row["name"],
            monthly_inr=row["monthly_inr"],
            monthly_usd=row["monthly_usd"],
            yearly_inr=row["yearly_inr"],
            yearly_usd=row["yearly_usd"],
            device_limit=row["device_limit"],
            addon_inr=addon_inr,
            addon_usd=addon_usd,
            retention_days=row["retention_days"],
            code=row["code"],
        )


def reverse_seed(apps, schema_editor):
    Product = apps.get_model("products", "Product")
    Plan = apps.get_model("core", "Plan")
    product = Product.objects.filter(slug="imposition-software").first()
    if not product:
        return
    Plan.objects.filter(product=product, name__in=["Starter", "Pro", "Business", "Enterprise", "Trial"]).delete()


class Migration(migrations.Migration):

    dependencies = [
        ("core", "0115_alter_chatwidget_public_chat_code"),
        ("products", "0010_seed_imposition_software"),
    ]

    operations = [
        migrations.RunPython(seed_plans, reverse_seed),
    ]
