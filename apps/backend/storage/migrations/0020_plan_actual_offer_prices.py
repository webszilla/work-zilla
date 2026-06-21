from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("storage", "0019_alter_storagefile_original_filename_and_more"),
    ]

    operations = [
        migrations.AddField(
            model_name="plan",
            name="actual_monthly_price",
            field=models.DecimalField(decimal_places=2, default=0, max_digits=12),
        ),
        migrations.AddField(
            model_name="plan",
            name="actual_usd_monthly_price",
            field=models.DecimalField(decimal_places=2, default=0, max_digits=12),
        ),
        migrations.AddField(
            model_name="plan",
            name="actual_usd_yearly_price",
            field=models.DecimalField(decimal_places=2, default=0, max_digits=12),
        ),
        migrations.AddField(
            model_name="plan",
            name="actual_yearly_price",
            field=models.DecimalField(decimal_places=2, default=0, max_digits=12),
        ),
    ]
