from django.db import migrations, models


def map_lead_statuses(apps, schema_editor):
    ChatEnquiryLead = apps.get_model("core", "ChatEnquiryLead")
    ChatEnquiryLead.objects.filter(status="new").update(status="fresh")
    ChatEnquiryLead.objects.filter(status="open").update(status="following")
    ChatEnquiryLead.objects.filter(status="contacted").update(status="following")
    ChatEnquiryLead.objects.filter(status="closed").update(status="completed")


class Migration(migrations.Migration):

    dependencies = [
        ("core", "0066_chatconversation_source"),
    ]

    operations = [
        migrations.RunPython(map_lead_statuses, migrations.RunPython.noop),
        migrations.AlterField(
            model_name="chatenquirylead",
            name="status",
            field=models.CharField(
                choices=[("fresh", "Fresh"), ("following", "Following"), ("completed", "Completed")],
                default="fresh",
                max_length=20,
            ),
        ),
    ]
