from django.db import migrations, models
from django.utils import timezone


def backfill_closed_at(apps, schema_editor):
    OrgSupportTicket = apps.get_model("core", "OrgSupportTicket")
    now = timezone.now()
    for ticket in OrgSupportTicket.objects.filter(status="closed", closed_at__isnull=True).only("id", "updated_at"):
        ticket.closed_at = ticket.updated_at or now
        ticket.save(update_fields=["closed_at"])


class Migration(migrations.Migration):

    dependencies = [
        ("core", "0126_rename_org_product_org_status_idx_org_product_organiz_70d807_idx_and_more"),
    ]

    operations = [
        migrations.AddField(
            model_name="orgsupportticket",
            name="closed_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddIndex(
            model_name="orgsupportticket",
            index=models.Index(fields=["status", "closed_at"], name="core_orgsup_status_3000da_idx"),
        ),
        migrations.RunPython(backfill_closed_at, migrations.RunPython.noop),
    ]
