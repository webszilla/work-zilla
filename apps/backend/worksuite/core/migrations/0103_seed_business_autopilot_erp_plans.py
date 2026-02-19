from django.db import migrations


def seed_business_autopilot_erp_plans(apps, schema_editor):
    Product = apps.get_model("products", "Product")
    Plan = apps.get_model("core", "Plan")

    product = Product.objects.filter(slug="business-autopilot-erp").first()
    if not product:
        return

    plans = [
        {
            "name": "Starter ERP",
            "monthly_price": 999,
            "yearly_price": 9590,
            "usd_monthly_price": 12,
            "usd_yearly_price": 115,
            "limits": {
                "base_price_inr_month": 999,
                "base_price_inr_year": 9590,
                "base_price_usdt_month": 12,
                "base_price_usdt_year": 115,
                "user_price_inr_month": 199,
                "user_price_inr_year": 1910,
                "user_price_usdt_month": 2.5,
                "user_price_usdt_year": 24,
            },
        },
        {
            "name": "Growth ERP",
            "monthly_price": 2999,
            "yearly_price": 28790,
            "usd_monthly_price": 35,
            "usd_yearly_price": 335,
            "limits": {
                "base_price_inr_month": 2999,
                "base_price_inr_year": 28790,
                "base_price_usdt_month": 35,
                "base_price_usdt_year": 335,
                "user_price_inr_month": 299,
                "user_price_inr_year": 2870,
                "user_price_usdt_month": 4,
                "user_price_usdt_year": 38,
            },
        },
        {
            "name": "Pro ERP",
            "monthly_price": 7999,
            "yearly_price": 76790,
            "usd_monthly_price": 95,
            "usd_yearly_price": 910,
            "limits": {
                "base_price_inr_month": 7999,
                "base_price_inr_year": 76790,
                "base_price_usdt_month": 95,
                "base_price_usdt_year": 910,
                "user_price_inr_month": 499,
                "user_price_inr_year": 4790,
                "user_price_usdt_month": 6,
                "user_price_usdt_year": 58,
            },
        },
    ]

    for index, item in enumerate(plans, start=1):
        plan, _ = Plan.objects.update_or_create(
            product=product,
            name=item["name"],
            defaults={
                "price": item["monthly_price"],
                "monthly_price": item["monthly_price"],
                "yearly_price": item["yearly_price"],
                "usd_monthly_price": item["usd_monthly_price"],
                "usd_yearly_price": item["usd_yearly_price"],
                "employee_limit": 0,
                "device_limit": 1,
                "duration_months": 1,
                "retention_days": 30,
                "allow_addons": True,
                "allow_app_usage": True,
                "allow_gaming_ott_usage": True,
                "allow_hr_view": True,
                "screenshot_min_minutes": 5,
                "limits": item["limits"],
                "addons": {},
                "features": {"tier_order": index},
            },
        )
        if plan.product_id != product.id:
            plan.product = product
            plan.save(update_fields=["product"])


def unseed_business_autopilot_erp_plans(apps, schema_editor):
    Product = apps.get_model("products", "Product")
    Plan = apps.get_model("core", "Plan")
    product = Product.objects.filter(slug="business-autopilot-erp").first()
    if not product:
        return
    Plan.objects.filter(product=product, name__in=["Starter ERP", "Growth ERP", "Pro ERP"]).delete()


class Migration(migrations.Migration):

    dependencies = [
        ("core", "0102_alter_chatwidget_public_chat_code"),
        ("products", "0008_hide_business_autopilot_module_products"),
    ]

    operations = [
        migrations.RunPython(seed_business_autopilot_erp_plans, unseed_business_autopilot_erp_plans),
    ]
