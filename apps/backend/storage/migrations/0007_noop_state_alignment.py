from django.db import migrations, models


def noop(apps, schema_editor):
    return


class Migration(migrations.Migration):

    dependencies = [
        ("storage", "0006_storage_engine_adjustments"),
    ]

    operations = [
        migrations.RunPython(noop, migrations.RunPython.noop),
    ]
