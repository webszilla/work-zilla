from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("business_autopilot", "0004_organizationemployeerole"),
    ]

    operations = [
        migrations.AddField(
            model_name="organizationemployeerole",
            name="page_access",
            field=models.JSONField(blank=True, default=list),
        ),
    ]
