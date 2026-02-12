from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("core", "0061_chat_enquiry_lead"),
    ]

    operations = [
        migrations.AddField(
            model_name="chatwidget",
            name="public_chat_code",
            field=models.CharField(blank=True, null=True, max_length=32),
        ),
    ]
