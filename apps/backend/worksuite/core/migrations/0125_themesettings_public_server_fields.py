from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("core", "0124_orgsupportticket_orgsupportticketattachment_and_more"),
    ]

    operations = [
        migrations.AddField(
            model_name="themesettings",
            name="public_server_domain",
            field=models.CharField(blank=True, default="", max_length=255),
        ),
        migrations.AddField(
            model_name="themesettings",
            name="public_server_ip",
            field=models.CharField(blank=True, default="", max_length=64),
        ),
    ]
