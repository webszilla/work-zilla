from django.db import migrations


TARGET_ORDER = [
    "business-autopilot-erp",
    "whatsapp-automation",
    "digital-automation",
    "work-suite",
    "monitor",
    "ai-chatbot",
    "storage",
    "online-storage",
]


def forwards(apps, schema_editor):
    Product = apps.get_model("saas_admin", "Product")

    rank = 1
    seen_ids = set()
    for slug in TARGET_ORDER:
        for row in Product.objects.filter(slug=slug).order_by("id"):
            if row.id in seen_ids:
                continue
            seen_ids.add(row.id)
            if row.sort_order != rank:
                row.sort_order = rank
                row.save(update_fields=["sort_order"])
            rank += 1

    # Keep remaining rows stable after prioritized products.
    remaining = Product.objects.exclude(id__in=seen_ids).order_by("sort_order", "name", "id")
    for row in remaining:
        if row.sort_order != rank:
            row.sort_order = rank
            row.save(update_fields=["sort_order"])
        rank += 1


def reverse(apps, schema_editor):
    # No-op: order changes are content decisions.
    return


class Migration(migrations.Migration):

    dependencies = [
        ("saas_admin", "0020_seed_digital_automation_product"),
    ]

    operations = [
        migrations.RunPython(forwards, reverse),
    ]
