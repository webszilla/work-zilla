from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("core", "0031_plan_allow_gaming_ott_usage"),
    ]

    operations = [
        migrations.CreateModel(
            name="ThemeSettings",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("primary_color", models.CharField(default="#e11d48", max_length=20)),
                ("secondary_color", models.CharField(default="#f59e0b", max_length=20)),
            ],
            options={
                "verbose_name": "Theme Settings",
                "verbose_name_plural": "Theme Settings",
            },
        ),
    ]
