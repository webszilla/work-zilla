from django.db import migrations


PLAN_FEATURES = {
    "starter": {
        "manual_card_upload": True,
        "export_print_pdf": True,
        "advanced_layouts": False,
        "batch_processing": False,
        "print_marks": False,
        "export_hd": False,
        "batch_auto_imposition": False,
        "layout_templates": False,
        "bulk_export": False,
        "team_users": False,
        "layout_presets": False,
        "priority_processing": False,
        "id_card_data_update": False,
        "business_card_data_update": False,
        "serial_number_generator": False,
        "sheet_custom_size": False,
    },
    "pro": {
        "manual_card_upload": True,
        "export_print_pdf": True,
        "advanced_layouts": True,
        "batch_processing": True,
        "print_marks": True,
        "export_hd": True,
        "batch_auto_imposition": False,
        "layout_templates": False,
        "bulk_export": False,
        "team_users": False,
        "layout_presets": False,
        "priority_processing": False,
        "id_card_data_update": False,
        "business_card_data_update": False,
        "serial_number_generator": False,
        "sheet_custom_size": True,
    },
    "business": {
        "manual_card_upload": True,
        "export_print_pdf": True,
        "advanced_layouts": True,
        "batch_processing": True,
        "print_marks": True,
        "export_hd": True,
        "batch_auto_imposition": True,
        "layout_templates": True,
        "bulk_export": True,
        "team_users": True,
        "layout_presets": True,
        "priority_processing": False,
        "id_card_data_update": True,
        "business_card_data_update": True,
        "serial_number_generator": True,
        "sheet_custom_size": True,
    },
    "enterprise": {
        "manual_card_upload": True,
        "export_print_pdf": True,
        "advanced_layouts": True,
        "batch_processing": True,
        "print_marks": True,
        "export_hd": True,
        "batch_auto_imposition": True,
        "layout_templates": True,
        "bulk_export": True,
        "team_users": True,
        "layout_presets": True,
        "priority_processing": True,
        "id_card_data_update": True,
        "business_card_data_update": True,
        "serial_number_generator": True,
        "sheet_custom_size": True,
    },
}


def seed_plans(apps, schema_editor):
    Plan = apps.get_model("imposition", "ImpositionPlan")
    rows = [
        ("starter", "Starter", 1),
        ("pro", "Pro", 3),
        ("business", "Business", 5),
        ("enterprise", "Enterprise", 10),
    ]
    for code, name, device_limit in rows:
        obj, _ = Plan.objects.get_or_create(
            code=code,
            defaults={
                "name": name,
                "device_limit": device_limit,
                "additional_user_price_monthly_inr": 300,
                "feature_flags": PLAN_FEATURES.get(code, {}),
                "is_active": True,
            },
        )
        obj.name = name
        obj.device_limit = device_limit
        obj.additional_user_price_monthly_inr = 300
        obj.feature_flags = PLAN_FEATURES.get(code, {})
        obj.is_active = True
        obj.save()


def reverse_seed(apps, schema_editor):
    Plan = apps.get_model("imposition", "ImpositionPlan")
    Plan.objects.filter(code__in=["starter", "pro", "business", "enterprise"]).delete()


class Migration(migrations.Migration):

    dependencies = [
        ("imposition", "0001_initial"),
    ]

    operations = [
        migrations.RunPython(seed_plans, reverse_seed),
    ]
