from django.db import migrations, models


def seed_primary_card(apps, schema_editor):
    DigitalCardEntry = apps.get_model("whatsapp_automation", "DigitalCardEntry")
    org_ids = (
        DigitalCardEntry.objects.order_by()
        .values_list("organization_id", flat=True)
        .distinct()
    )
    for org_id in org_ids:
        first_row = (
            DigitalCardEntry.objects
            .filter(organization_id=org_id)
            .order_by("sort_order", "id")
            .first()
        )
        if first_row:
            DigitalCardEntry.objects.filter(id=first_row.id).update(is_primary=True)


class Migration(migrations.Migration):

    dependencies = [
        ("whatsapp_automation", "0011_digitalcardentry_logo_radius_px"),
    ]

    operations = [
        migrations.AddField(
            model_name="digitalcardentry",
            name="is_primary",
            field=models.BooleanField(default=False),
        ),
        migrations.RunPython(seed_primary_card, migrations.RunPython.noop),
    ]
