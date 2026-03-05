from django.db import migrations, models


def backfill_next_cycle_addons(apps, schema_editor):
    Subscription = apps.get_model("core", "Subscription")
    for row in Subscription.objects.all().only("id", "addon_count", "addon_next_cycle_count"):
        if row.addon_next_cycle_count is None:
            row.addon_next_cycle_count = row.addon_count or 0
            row.save(update_fields=["addon_next_cycle_count"])


class Migration(migrations.Migration):

    dependencies = [
        ("core", "0120_product_access_control"),
    ]

    operations = [
        migrations.AddField(
            model_name="subscription",
            name="addon_next_cycle_count",
            field=models.PositiveSmallIntegerField(blank=True, null=True),
        ),
        migrations.RunPython(backfill_next_cycle_addons, migrations.RunPython.noop),
    ]
