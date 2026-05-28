from django.db import migrations


USER_TYPES = [
    {
        "key": "hrm_user",
        "label": "HRM User",
        "description": "Employee attendance and payroll user",
        "monthly_price_inr": 50,
        "yearly_price_inr": 500,
        "monthly_price_usd": 1,
        "yearly_price_usd": 10,
        "allowed_modules": ["dashboard", "hr", "users", "profile"],
    },
    {
        "key": "crm_user",
        "label": "CRM User",
        "description": "CRM-focused sales and follow-up user",
        "monthly_price_inr": 450,
        "yearly_price_inr": 4500,
        "monthly_price_usd": 6,
        "yearly_price_usd": 60,
        "allowed_modules": ["dashboard", "inbox", "crm", "users", "profile"],
    },
    {
        "key": "full_access_user",
        "label": "Full Access User",
        "description": "Full Business Autopilot access",
        "monthly_price_inr": 550,
        "yearly_price_inr": 5500,
        "monthly_price_usd": 7,
        "yearly_price_usd": 70,
        "allowed_modules": [
            "dashboard", "inbox", "crm", "hr", "projects", "accounts",
            "subscriptions", "ticketing", "stocks", "users", "billing", "plans", "profile",
        ],
    },
]


def update_business_autopilot_plans(apps, schema_editor):
    Product = apps.get_model("products", "Product")
    Plan = apps.get_model("core", "Plan")

    product = Product.objects.filter(slug="business-autopilot-erp").first()
    if not product:
        return

    plans = {
        "Starter ERP": {
            "monthly_price": 1000,
            "yearly_price": 10000,
            "usd_monthly_price": 12,
            "usd_yearly_price": 120,
            "allow_addons": True,
            "features": {
                "tier_order": 1,
                "role_based_access": True,
                "erp_enabled_modules": ["crm", "subscriptions"],
                "priority_support": False,
                "api_access": False,
                "vendor_management": False,
                "business_autopilot_user_types": USER_TYPES,
            },
            "limits": {
                "base_price_inr_month": 1000,
                "base_price_inr_year": 10000,
                "base_price_usdt_month": 12,
                "base_price_usdt_year": 120,
                "user_price_inr_month": 0,
                "user_price_inr_year": 0,
                "user_price_usdt_month": 0,
                "user_price_usdt_year": 0,
                "included_users": 1,
                "user_limit": 1,
            },
        },
        "Growth ERP": {
            "monthly_price": 2000,
            "yearly_price": 20000,
            "usd_monthly_price": 24,
            "usd_yearly_price": 240,
            "allow_addons": True,
            "features": {
                "tier_order": 2,
                "role_based_access": True,
                "erp_enabled_modules": ["crm", "hrm", "accounts", "subscriptions", "stocks"],
                "invoice_billing": True,
                "gst_ready_india": True,
                "vendor_management": True,
                "priority_support": False,
                "api_access": False,
                "business_autopilot_user_types": USER_TYPES,
            },
            "limits": {
                "base_price_inr_month": 2000,
                "base_price_inr_year": 20000,
                "base_price_usdt_month": 24,
                "base_price_usdt_year": 240,
                "user_price_inr_month": 0,
                "user_price_inr_year": 0,
                "user_price_usdt_month": 0,
                "user_price_usdt_year": 0,
                "included_users": 1,
                "user_limit": 1,
            },
        },
        "Pro ERP": {
            "monthly_price": 3000,
            "yearly_price": 30000,
            "usd_monthly_price": 36,
            "usd_yearly_price": 360,
            "allow_addons": True,
            "features": {
                "tier_order": 3,
                "role_based_access": True,
                "erp_enabled_modules": ["crm", "hrm", "projects", "accounts", "subscriptions", "ticketing", "stocks"],
                "invoice_billing": True,
                "gst_ready_india": True,
                "vendor_management": True,
                "priority_support": True,
                "api_access": True,
                "business_autopilot_user_types": USER_TYPES,
            },
            "limits": {
                "base_price_inr_month": 3000,
                "base_price_inr_year": 30000,
                "base_price_usdt_month": 36,
                "base_price_usdt_year": 360,
                "user_price_inr_month": 0,
                "user_price_inr_year": 0,
                "user_price_usdt_month": 0,
                "user_price_usdt_year": 0,
                "included_users": 1,
                "user_limit": 1,
            },
        },
        "Free": {
            "monthly_price": 0,
            "yearly_price": 0,
            "usd_monthly_price": 0,
            "usd_yearly_price": 0,
            "allow_addons": False,
            "features": {
                "tier_order": 0,
                "trial_features": "pro",
                "is_trial": True,
                "role_based_access": True,
                "erp_enabled_modules": ["crm", "hrm", "projects", "accounts", "subscriptions", "ticketing", "stocks"],
                "invoice_billing": True,
                "gst_ready_india": True,
                "vendor_management": True,
                "priority_support": False,
                "api_access": True,
                "business_autopilot_user_types": USER_TYPES,
            },
            "limits": {
                "base_price_inr_month": 0,
                "base_price_inr_year": 0,
                "base_price_usdt_month": 0,
                "base_price_usdt_year": 0,
                "user_price_inr_month": 0,
                "user_price_inr_year": 0,
                "user_price_usdt_month": 0,
                "user_price_usdt_year": 0,
                "trial_features_tier": "pro",
                "included_users": 1,
                "user_limit": 1,
            },
        },
    }

    for plan in Plan.objects.filter(product=product, name__in=list(plans.keys())):
        payload = plans.get(plan.name)
        if not payload:
            continue
        plan.price = payload["monthly_price"]
        plan.monthly_price = payload["monthly_price"]
        plan.yearly_price = payload["yearly_price"]
        plan.usd_monthly_price = payload["usd_monthly_price"]
        plan.usd_yearly_price = payload["usd_yearly_price"]
        plan.allow_addons = payload["allow_addons"]
        plan.employee_limit = 0
        plan.features = payload["features"]
        plan.limits = payload["limits"]
        plan.save(
            update_fields=[
                "price",
                "monthly_price",
                "yearly_price",
                "usd_monthly_price",
                "usd_yearly_price",
                "allow_addons",
                "employee_limit",
                "features",
                "limits",
            ]
        )


class Migration(migrations.Migration):

    dependencies = [
        ("core", "0152_organizationsettings_business_autopilot_user_type_access_map_and_more"),
    ]

    operations = [
        migrations.RunPython(update_business_autopilot_plans, migrations.RunPython.noop),
    ]
