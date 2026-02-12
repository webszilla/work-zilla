from django.db import migrations


def update_free_device_limit(apps, schema_editor):
    StoragePlan = apps.get_model("storage", "Plan")
    plans = StoragePlan.objects.filter(name__iexact="free")
    for plan in plans:
        if (plan.device_limit_per_user or 0) < 3:
            plan.device_limit_per_user = 3
            plan.save(update_fields=["device_limit_per_user"])


def revert_free_device_limit(apps, schema_editor):
    StoragePlan = apps.get_model("storage", "Plan")
    plans = StoragePlan.objects.filter(name__iexact="free")
    for plan in plans:
        if (plan.device_limit_per_user or 0) == 3:
            plan.device_limit_per_user = 1
            plan.save(update_fields=["device_limit_per_user"])


class Migration(migrations.Migration):
    dependencies = [
        ("storage", "0017_alter_orgbandwidthusage_id"),
    ]

    operations = [
        migrations.RunPython(update_free_device_limit, revert_free_device_limit),
    ]
