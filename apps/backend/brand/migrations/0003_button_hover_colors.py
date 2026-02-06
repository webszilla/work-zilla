from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("brand", "0002_secondary_button_color"),
    ]

    operations = [
        migrations.AddField(
            model_name="sitebrandsettings",
            name="primary_button_color",
            field=models.CharField(
                default="#1f6f8b",
                help_text="Primary button color (hex).",
                max_length=20,
                verbose_name="Primary Button",
            ),
        ),
        migrations.AddField(
            model_name="sitebrandsettings",
            name="primary_button_hover_color",
            field=models.CharField(
                default="#145f78",
                help_text="Primary button hover color (hex).",
                max_length=20,
                verbose_name="Primary Button Hover",
            ),
        ),
        migrations.AddField(
            model_name="sitebrandsettings",
            name="secondary_button_hover_color",
            field=models.CharField(
                default="#0f172a",
                help_text="Outline button hover color (hex).",
                max_length=20,
                verbose_name="Secondary Button Hover",
            ),
        ),
    ]
