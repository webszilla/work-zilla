from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("core", "0038_alter_dealeraccount_id_and_more"),
    ]

    operations = [
        migrations.AddField(
            model_name="plan",
            name="allow_hr_view",
            field=models.BooleanField(default=False),
        ),
    ]
