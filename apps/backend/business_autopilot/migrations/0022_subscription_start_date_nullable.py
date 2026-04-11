from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("business_autopilot", "0021_merge_20260408_1120"),
    ]

    operations = [
        migrations.AlterField(
            model_name="subscription",
            name="start_date",
            field=models.DateField(blank=True, null=True),
        ),
    ]
