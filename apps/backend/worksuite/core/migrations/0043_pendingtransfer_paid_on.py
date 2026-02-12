from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("core", "0042_plan_product"),
    ]

    operations = [
        migrations.AddField(
            model_name="pendingtransfer",
            name="paid_on",
            field=models.DateField(blank=True, null=True),
        ),
    ]
