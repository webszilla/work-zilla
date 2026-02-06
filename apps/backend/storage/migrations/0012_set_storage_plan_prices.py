from django.db import migrations


def set_storage_plan_prices(apps, schema_editor):
    Product = apps.get_model("storage", "Product")
    Plan = apps.get_model("storage", "Plan")

    product = Product.objects.filter(name__iexact="Online Storage").first()
    if not product:
        return

    price_map = {
        "basic": 999,
        "standard": 1799,
        "pro": 3499,
        "free": 0,
    }
    for plan in Plan.objects.filter(product=product):
        key = (plan.name or "").strip().lower()
        if key not in price_map:
            continue
        if plan.monthly_price and plan.monthly_price != 0:
            continue
        plan.monthly_price = price_map[key]
        plan.save(update_fields=["monthly_price"])


class Migration(migrations.Migration):
    dependencies = [
        ("storage", "0011_seed_storage_free_plan"),
    ]

    operations = [
        migrations.RunPython(set_storage_plan_prices),
    ]
