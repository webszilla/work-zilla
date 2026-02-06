from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("core", "0017_plan_screenshot_min_minutes"),
    ]

    operations = [
        migrations.AddField(
            model_name="userprofile",
            name="phone_number",
            field=models.CharField(blank=True, max_length=30),
        ),
    ]
