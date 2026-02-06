from django.db import migrations


def rename_indexes(apps, schema_editor):
    try:
        schema_editor.execute("ALTER INDEX storage_sto_organiz_3a2f7d_idx RENAME TO storage_sto_organiz_f49510_idx")
    except Exception:
        pass
    try:
        schema_editor.execute("ALTER INDEX storage_sto_organiz_1c4c20_idx RENAME TO storage_sto_organiz_e192ea_idx")
    except Exception:
        pass


class Migration(migrations.Migration):

    dependencies = [
        ("storage", "0007_noop_state_alignment"),
    ]

    operations = [
        migrations.RunPython(rename_indexes, migrations.RunPython.noop),
    ]
