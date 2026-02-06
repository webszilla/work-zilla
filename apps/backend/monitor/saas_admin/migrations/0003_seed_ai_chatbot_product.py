from django.db import migrations


def seed_ai_chatbot(apps, schema_editor):
    Product = apps.get_model("saas_admin", "Product")
    Product.objects.get_or_create(
        slug="ai-chatbot",
        defaults={
            "name": "AI Chatbot",
            "description": "AI chatbot widgets for support and lead capture.",
            "icon": "bi-chat-dots",
            "status": "active",
            "features": "Widgets\nAgents\nConversations",
            "sort_order": 2,
        },
    )


class Migration(migrations.Migration):
    dependencies = [
        ("saas_admin", "0002_seed_products"),
    ]

    operations = [
        migrations.RunPython(seed_ai_chatbot, migrations.RunPython.noop),
    ]
