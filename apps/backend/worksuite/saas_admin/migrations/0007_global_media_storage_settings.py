from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("saas_admin", "0006_rename_orgproductentitlement_monitororgproductentitlement"),
    ]

    operations = [
        migrations.CreateModel(
            name="GlobalMediaStorageSettings",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("storage_mode", models.CharField(choices=[("local", "Local storage"), ("object", "Object storage")], default="local", max_length=20)),
                ("endpoint_url", models.URLField(blank=True, default="")),
                ("bucket_name", models.CharField(blank=True, default="", max_length=128)),
                ("access_key_id", models.CharField(blank=True, default="", max_length=256)),
                ("secret_access_key", models.TextField(blank=True, default="")),
                ("region_name", models.CharField(blank=True, default="", max_length=64)),
                ("base_path", models.CharField(blank=True, default="", max_length=128)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
            ],
            options={
                "verbose_name": "Media Storage Settings",
                "verbose_name_plural": "Media Storage Settings",
            },
        ),
    ]
