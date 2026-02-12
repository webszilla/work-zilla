from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("core", "0098_rename_core_device_org_use_b0db7b_idx_core_device_org_id_e4b0ac_idx_and_more"),
    ]

    operations = [
        migrations.CreateModel(
            name="MonitorStopEvent",
            fields=[
                ("id", models.AutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("reason", models.CharField(blank=True, default="", max_length=255)),
                ("stopped_at", models.DateTimeField()),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("employee", models.ForeignKey(on_delete=models.deletion.CASCADE, related_name="monitor_stop_events", to="core.employee")),
            ],
        ),
        migrations.AddIndex(
            model_name="monitorstopevent",
            index=models.Index(fields=["employee", "stopped_at"], name="core_monito_employee_0f0a2f_idx"),
        ),
    ]
