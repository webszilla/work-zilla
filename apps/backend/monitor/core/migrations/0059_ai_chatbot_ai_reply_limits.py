from django.db import migrations


def set_ai_chatbot_ai_reply_limits(apps, schema_editor):
    Plan = apps.get_model("core", "Plan")
    Product = apps.get_model("products", "Product")
    product = Product.objects.filter(slug="ai-chatbot").first()
    if not product:
        return
    limits_by_name = {
        "free": 100,
        "starter": 1000,
        "growth": 5000,
        "pro": 15000,
    }
    plans = Plan.objects.filter(product=product)
    for plan in plans:
        key = (plan.name or "").strip().lower()
        if key not in limits_by_name:
            continue
        limits = plan.limits or {}
        limits["ai_replies_per_month"] = limits_by_name[key]
        plan.limits = limits
        plan.save(update_fields=["limits"])


class Migration(migrations.Migration):
    dependencies = [
        ("core", "0058_ai_usage_monthly"),
        ("products", "0001_initial"),
    ]

    operations = [
        migrations.RunPython(set_ai_chatbot_ai_reply_limits, migrations.RunPython.noop),
    ]
