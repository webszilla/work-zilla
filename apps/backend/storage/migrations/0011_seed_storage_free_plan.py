from django.db import migrations


def seed_storage_free_plan(apps, schema_editor):
    Product = apps.get_model("storage", "Product")
    Plan = apps.get_model("storage", "Plan")

    product = Product.objects.filter(name__iexact="Online Storage").first()
    if not product:
        return

    existing = Plan.objects.filter(product=product, name__iexact="Free").first()
    if existing:
        return

    Plan.objects.create(
        product=product,
        name="Free",
        monthly_price=0,
        max_users=5,
        storage_limit_gb=250,
        is_active=True,
    )


class Migration(migrations.Migration):
    dependencies = [
        ("storage", "0010_storage_global_security_flags"),
    ]

    operations = [
        migrations.RunPython(seed_storage_free_plan),
    ]
