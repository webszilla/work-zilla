from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("core", "0064_chatwidget_public_chat_code_backfill"),
    ]

    operations = [
        migrations.AddField(
            model_name="chatconversation",
            name="category",
            field=models.CharField(blank=True, choices=[("sales", "Sales"), ("support", "Support")], max_length=20, null=True),
        ),
    ]
