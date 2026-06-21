from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("core", "0156_rename_core_busine_organiz_7bc690_idx_core_busine_organiz_57f367_idx_and_more"),
    ]

    operations = [
        migrations.AddField(
            model_name="plan",
            name="actual_monthly_price",
            field=models.FloatField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="plan",
            name="actual_usd_monthly_price",
            field=models.FloatField(blank=True, null=True, verbose_name="Actual USD monthly price"),
        ),
        migrations.AddField(
            model_name="plan",
            name="actual_usd_yearly_price",
            field=models.FloatField(blank=True, null=True, verbose_name="Actual USD yearly price"),
        ),
        migrations.AddField(
            model_name="plan",
            name="actual_yearly_price",
            field=models.FloatField(blank=True, null=True),
        ),
    ]
