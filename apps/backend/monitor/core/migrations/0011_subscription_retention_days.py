from django.db import migrations, models


def copy_retention_months_to_days(apps, schema_editor):
    Subscription = apps.get_model("core", "Subscription")
    for sub in Subscription.objects.all():
        months = getattr(sub, "retention_months", 1) or 1
        try:
            months = int(months)
        except (TypeError, ValueError):
            months = 1
        sub.retention_days = months * 30
        sub.save(update_fields=["retention_days"])


class Migration(migrations.Migration):

    dependencies = [
        ("core", "0010_deletedaccount"),
    ]

    operations = [
        migrations.AddField(
            model_name="subscription",
            name="retention_days",
            field=models.PositiveSmallIntegerField(default=30),
        ),
        migrations.RunPython(copy_retention_months_to_days, migrations.RunPython.noop),
    ]
