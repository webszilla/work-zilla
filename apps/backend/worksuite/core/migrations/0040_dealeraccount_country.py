from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("core", "0039_plan_allow_hr_view"),
    ]

    operations = [
        migrations.AddField(
            model_name="dealeraccount",
            name="country",
            field=models.CharField(blank=True, max_length=120),
        ),
    ]
