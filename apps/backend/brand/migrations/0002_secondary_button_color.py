from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("brand", "0001_initial"),
    ]

    operations = [
        migrations.AddField(
            model_name="sitebrandsettings",
            name="secondary_button_color",
            field=models.CharField(
                default="#1f6f8b",
                help_text="Outline button color (hex).",
                max_length=20,
                verbose_name="Secondary Button",
            ),
        ),
    ]
