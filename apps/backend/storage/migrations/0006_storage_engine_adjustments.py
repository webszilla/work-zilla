from django.db import migrations, models
import django.db.models.deletion


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

    operations = [
        migrations.AddField(
            model_name="storagefolder",
            name="is_deleted",
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name="storagefile",
            name="is_deleted",
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name="storagefile",
            name="original_filename",
            field=models.CharField(default="", max_length=255),
        ),
        migrations.AddField(
            model_name="storagefile",
            name="storage_key",
            field=models.TextField(default=""),
        ),
        migrations.AlterField(
            model_name="storagefile",
            name="folder",
            field=models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="files", to="storage.storagefolder"),
        ),
        migrations.RunPython(drop_storage_file_legacy_fields, migrations.RunPython.noop),
        migrations.RunPython(drop_storage_folder_legacy_fields, migrations.RunPython.noop),
        migrations.RunPython(
            lambda apps, schema_editor: add_index_safe(
                schema_editor,
                "storage_sto_organiz_1c4c20_idx",
                "CREATE INDEX IF NOT EXISTS storage_sto_organiz_1c4c20_idx ON storage_storagefolder (organization_id, owner_id, parent_id)",
            ),
            migrations.RunPython.noop,
        ),
        migrations.RunPython(
            lambda apps, schema_editor: add_index_safe(
                schema_editor,
                "storage_sto_organiz_3a2f7d_idx",
                "CREATE INDEX IF NOT EXISTS storage_sto_organiz_3a2f7d_idx ON storage_storagefile (organization_id, is_deleted)",
            ),
            migrations.RunPython.noop,
        ),
    ]
