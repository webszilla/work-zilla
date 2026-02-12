from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("core", "0022_company_privacy_support_access"),
    ]

    operations = [
        migrations.AddField(
            model_name="companyprivacysettings",
            name="support_access_duration_hours",
            field=models.PositiveSmallIntegerField(blank=True, null=True),
        ),
    ]
