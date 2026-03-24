from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("core", "0143_rename_core_userlo_organiz_810661_idx_core_userlo_organiz_ef4b36_idx_and_more"),
    ]

    operations = [
        migrations.AddField(
            model_name="organizationsettings",
            name="business_autopilot_role_access_map",
            field=models.JSONField(blank=True, default=dict),
        ),
    ]

