from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("core", "0006_organization_settings"),
    ]

    operations = [
        migrations.AddField(
            model_name="screenshot",
            name="pc_captured_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
    ]
