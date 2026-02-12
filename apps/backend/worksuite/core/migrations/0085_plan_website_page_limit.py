from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("core", "0084_invoicesellerprofile_upi_id"),
    ]

    operations = [
        migrations.AddField(
            model_name="plan",
            name="website_page_limit",
            field=models.PositiveIntegerField(
                blank=True,
                null=True,
                help_text="Maximum website pages allowed for AI import. Leave empty for unlimited."
            ),
        ),
    ]
