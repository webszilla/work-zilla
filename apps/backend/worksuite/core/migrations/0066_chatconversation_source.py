from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("core", "0065_chatconversation_category"),
    ]

    operations = [
        migrations.AddField(
            model_name="chatconversation",
            name="source",
            field=models.CharField(
                choices=[("widget_embed", "Widget Embed"), ("public_page", "Public Page")],
                default="widget_embed",
                max_length=20,
            ),
        ),
    ]
