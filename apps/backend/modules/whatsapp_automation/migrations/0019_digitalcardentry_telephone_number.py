from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("whatsapp_automation", "0018_digitalcardvisit"),
    ]

    operations = [
        migrations.AddField(
            model_name="digitalcardentry",
            name="telephone_number",
            field=models.CharField(blank=True, default="", max_length=40),
        ),
    ]
