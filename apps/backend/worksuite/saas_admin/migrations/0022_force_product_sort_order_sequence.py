from django.db import migrations


ORDER_MAP = {
    "business-autopilot-erp": 1,
    "whatsapp-automation": 2,
    "digital-automation": 3,
    "work-suite": 4,
    "monitor": 4,
    "ai-chatbot": 5,
    "storage": 6,
    "online-storage": 6,
}


def forwards(apps, schema_editor):
    Product = apps.get_model("saas_admin", "Product")

    for slug, order in ORDER_MAP.items():
        Product.objects.filter(slug=slug).update(sort_order=order)


def reverse(apps, schema_editor):
    # No-op reverse for content ordering
    return


class Migration(migrations.Migration):

    dependencies = [
        ("saas_admin", "0021_reorder_active_products_for_admin"),
    ]

    operations = [
        migrations.RunPython(forwards, reverse),
    ]
