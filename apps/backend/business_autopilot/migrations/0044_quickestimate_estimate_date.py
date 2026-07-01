from django.db import migrations, models
from django.utils import timezone


def backfill_quick_estimate_estimate_date(apps, schema_editor):
    QuickEstimate = apps.get_model("business_autopilot", "QuickEstimate")
    for row in QuickEstimate.objects.all().only("id", "estimate_date", "created_at"):
        if row.estimate_date:
            continue
        created_at = getattr(row, "created_at", None)
        if created_at is None:
            continue
        local_date = timezone.localtime(created_at).date() if timezone.is_aware(created_at) else created_at.date()
        QuickEstimate.objects.filter(id=row.id, estimate_date__isnull=True).update(estimate_date=local_date)


class Migration(migrations.Migration):

    dependencies = [
        ("business_autopilot", "0043_quickestimate_notes"),
    ]

    operations = [
        migrations.AddField(
            model_name="quickestimate",
            name="estimate_date",
            field=models.DateField(blank=True, db_index=True, null=True),
        ),
        migrations.RunPython(backfill_quick_estimate_estimate_date, migrations.RunPython.noop),
    ]
