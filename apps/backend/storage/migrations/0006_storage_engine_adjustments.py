from django.db import migrations


def drop_storage_file_legacy_fields(apps, schema_editor):
    table = "storage_storagefile"
    columns = ["file", "name", "updated_at"]
    for col in columns:
        try:
            schema_editor.execute(f"ALTER TABLE {table} DROP COLUMN {col}")
        except Exception:
            pass


def drop_storage_folder_legacy_fields(apps, schema_editor):
    table = "storage_storagefolder"
    columns = ["updated_at"]
    for col in columns:
        try:
            schema_editor.execute(f"ALTER TABLE {table} DROP COLUMN {col}")
        except Exception:
            pass


def add_index_safe(schema_editor, name, sql):
    try:
        schema_editor.execute(sql)
    except Exception:
        return


class Migration(migrations.Migration):

    dependencies = [
        ("storage", "0005_orguser"),
    ]

    # NOTE:
    # These schema fields/indexes are already present in 0001_initial for fresh installs.
    # Keep this migration as a no-op to avoid duplicate-column failures during PostgreSQL bootstrap.
    operations = []
