import secrets
from django.db import migrations, models
import core.models


def backfill_public_chat_code(apps, schema_editor):
    ChatWidget = apps.get_model("core", "ChatWidget")
    seen = set()
    for widget in ChatWidget.objects.all():
        code = widget.public_chat_code or ""
        if not code or code in seen:
            code = secrets.token_hex(8)
            while code in seen:
                code = secrets.token_hex(8)
            widget.public_chat_code = code
            widget.save(update_fields=["public_chat_code"])
        seen.add(widget.public_chat_code)


class Migration(migrations.Migration):

    dependencies = [
        ("core", "0063_chatwidget_theme_fields"),
    ]

    operations = [
        migrations.RunPython(backfill_public_chat_code, migrations.RunPython.noop),
        migrations.AlterField(
            model_name="chatwidget",
            name="public_chat_code",
            field=models.CharField(max_length=32, unique=True, default=core.models._generate_chat_code),
        ),
    ]
