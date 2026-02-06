from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("core", "0069_chatconversation_visitor_fields"),
    ]

    operations = [
        migrations.AddField(
            model_name="organizationsettings",
            name="org_timezone",
            field=models.CharField(default="UTC", max_length=64),
        ),
    ]
