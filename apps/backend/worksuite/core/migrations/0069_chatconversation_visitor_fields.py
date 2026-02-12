from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("core", "0068_rename_core_aiusag_organize_94b9a6_idx_core_aiusag_organiz_19a702_idx_and_more"),
    ]

    operations = [
        migrations.AddField(
            model_name="chatconversation",
            name="visitor_email",
            field=models.EmailField(blank=True, default="", max_length=254),
        ),
        migrations.AddField(
            model_name="chatconversation",
            name="visitor_name",
            field=models.CharField(blank=True, default="", max_length=120),
        ),
        migrations.AddField(
            model_name="chatconversation",
            name="visitor_phone",
            field=models.CharField(blank=True, default="", max_length=40),
        ),
    ]
