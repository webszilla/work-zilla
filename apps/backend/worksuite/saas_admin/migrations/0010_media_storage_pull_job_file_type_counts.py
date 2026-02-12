from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("saas_admin", "0009_media_storage_pull_job"),
    ]

    operations = [
        migrations.AddField(
            model_name="mediastoragepulljob",
            name="file_type_counts",
            field=models.JSONField(blank=True, default=dict),
        ),
    ]

