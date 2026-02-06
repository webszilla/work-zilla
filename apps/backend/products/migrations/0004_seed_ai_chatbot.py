from django.db import migrations


def seed_ai_chatbot(apps, schema_editor):
    Product = apps.get_model("products", "Product")
    Product.objects.get_or_create(
        slug="ai-chatbot",
        defaults={
            "name": "AI Chatbot",
            "short_description": "AI chatbot widgets for support and lead capture.",
            "is_active": True,
            "sort_order": 2,
        },
    )


class Migration(migrations.Migration):
    dependencies = [
        ("products", "0003_seed_more_products"),
    ]

    operations = [
        migrations.RunPython(seed_ai_chatbot, migrations.RunPython.noop),
    ]
