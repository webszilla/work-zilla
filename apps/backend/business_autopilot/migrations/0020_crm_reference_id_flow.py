import re

from django.db import migrations, models, transaction
from django.utils import timezone


CRM_REFERENCE_RE = re.compile(r"^CRM-(\d{2})-(\d{2})-(\d{4})-(\d+)$")


def _created_local_date(row):
    created_at = getattr(row, "created_at", None)
    if created_at is None:
        return timezone.localdate()
    if timezone.is_aware(created_at):
        return timezone.localtime(created_at).date()
    return created_at.date()


def _format_reference(for_date, sequence):
    return f"CRM-{for_date.strftime('%d-%m-%Y')}-{int(sequence):02d}"


def _register_lookup(lookup, raw_value, crm_reference_id):
    value = str(raw_value or "").strip().lower()
    ref = str(crm_reference_id or "").strip()
    if not value or not ref:
        return
    if value not in lookup:
        lookup[value] = ref


def backfill_crm_reference_ids(apps, schema_editor):
    CrmLead = apps.get_model("business_autopilot", "CrmLead")
    CrmDeal = apps.get_model("business_autopilot", "CrmDeal")
    CrmSalesOrder = apps.get_model("business_autopilot", "CrmSalesOrder")
    CrmMeeting = apps.get_model("business_autopilot", "CrmMeeting")

    with transaction.atomic():
        leads = list(CrmLead.objects.all().order_by("created_at", "id"))
        daily_max_sequence = {}
        used_ids = set()

        for lead in leads:
            existing_ref = str(getattr(lead, "crm_reference_id", "") or "").strip()
            match = CRM_REFERENCE_RE.match(existing_ref)
            if match and existing_ref not in used_ids:
                day_key = f"{match.group(1)}-{match.group(2)}-{match.group(3)}"
                try:
                    seq_value = int(match.group(4))
                except (TypeError, ValueError):
                    seq_value = 0
                if seq_value > daily_max_sequence.get(day_key, 0):
                    daily_max_sequence[day_key] = seq_value
                used_ids.add(existing_ref)
                continue

            created_day = _created_local_date(lead)
            day_key = created_day.strftime("%d-%m-%Y")
            next_sequence = daily_max_sequence.get(day_key, 0) + 1
            next_reference = _format_reference(created_day, next_sequence)
            while next_reference in used_ids:
                next_sequence += 1
                next_reference = _format_reference(created_day, next_sequence)

            lead.crm_reference_id = next_reference
            lead.save(update_fields=["crm_reference_id"])
            daily_max_sequence[day_key] = next_sequence
            used_ids.add(next_reference)

        lead_ref_by_id = {
            row["id"]: str(row["crm_reference_id"] or "").strip()
            for row in CrmLead.objects.values("id", "crm_reference_id")
        }

        for deal in CrmDeal.objects.all().iterator():
            if str(getattr(deal, "crm_reference_id", "") or "").strip():
                continue
            lead_ref = lead_ref_by_id.get(getattr(deal, "lead_id", None), "")
            if not lead_ref:
                continue
            deal.crm_reference_id = lead_ref
            deal.save(update_fields=["crm_reference_id"])

        deal_ref_by_id = {
            row["id"]: str(row["crm_reference_id"] or "").strip()
            for row in CrmDeal.objects.values("id", "crm_reference_id")
        }
        deal_lead_by_id = {
            row["id"]: row["lead_id"]
            for row in CrmDeal.objects.values("id", "lead_id")
        }

        for order in CrmSalesOrder.objects.all().iterator():
            if str(getattr(order, "crm_reference_id", "") or "").strip():
                continue
            deal_id = getattr(order, "deal_id", None)
            deal_ref = deal_ref_by_id.get(deal_id, "") if deal_id else ""
            lead_ref = lead_ref_by_id.get(deal_lead_by_id.get(deal_id), "") if deal_id else ""
            crm_ref = deal_ref or lead_ref
            if not crm_ref:
                continue
            order.crm_reference_id = crm_ref
            order.save(update_fields=["crm_reference_id"])

        related_to_lookup = {}
        for lead in CrmLead.objects.values("lead_name", "company", "crm_reference_id"):
            crm_ref = str(lead.get("crm_reference_id") or "").strip()
            _register_lookup(related_to_lookup, lead.get("lead_name"), crm_ref)
            _register_lookup(related_to_lookup, lead.get("company"), crm_ref)
        for deal in CrmDeal.objects.values("deal_name", "company", "crm_reference_id"):
            crm_ref = str(deal.get("crm_reference_id") or "").strip()
            _register_lookup(related_to_lookup, deal.get("deal_name"), crm_ref)
            _register_lookup(related_to_lookup, deal.get("company"), crm_ref)

        for meeting in CrmMeeting.objects.all().iterator():
            if str(getattr(meeting, "crm_reference_id", "") or "").strip():
                continue
            related_key = str(getattr(meeting, "related_to", "") or "").strip().lower()
            if not related_key:
                continue
            crm_ref = related_to_lookup.get(related_key, "")
            if not crm_ref:
                continue
            meeting.crm_reference_id = crm_ref
            meeting.save(update_fields=["crm_reference_id"])


def reverse_backfill_crm_reference_ids(apps, schema_editor):
    CrmLead = apps.get_model("business_autopilot", "CrmLead")
    CrmDeal = apps.get_model("business_autopilot", "CrmDeal")
    CrmSalesOrder = apps.get_model("business_autopilot", "CrmSalesOrder")
    CrmMeeting = apps.get_model("business_autopilot", "CrmMeeting")

    CrmDeal.objects.all().update(crm_reference_id="")
    CrmSalesOrder.objects.all().update(crm_reference_id="")
    CrmMeeting.objects.all().update(crm_reference_id="")
    CrmLead.objects.all().update(crm_reference_id=None)


class Migration(migrations.Migration):

    dependencies = [
        ("business_autopilot", "0019_crmcontact"),
    ]

    operations = [
        migrations.AddField(
            model_name="crmdeal",
            name="crm_reference_id",
            field=models.CharField(blank=True, db_index=True, default="", max_length=32),
        ),
        migrations.AddField(
            model_name="crmlead",
            name="crm_reference_id",
            field=models.CharField(blank=True, max_length=32, null=True),
        ),
        migrations.AddField(
            model_name="crmmeeting",
            name="crm_reference_id",
            field=models.CharField(blank=True, db_index=True, default="", max_length=32),
        ),
        migrations.AddField(
            model_name="crmsalesorder",
            name="crm_reference_id",
            field=models.CharField(blank=True, db_index=True, default="", max_length=32),
        ),
        migrations.RunPython(backfill_crm_reference_ids, reverse_backfill_crm_reference_ids),
        migrations.AlterField(
            model_name="crmlead",
            name="crm_reference_id",
            field=models.CharField(db_index=True, editable=False, max_length=32, unique=True),
        ),
    ]
