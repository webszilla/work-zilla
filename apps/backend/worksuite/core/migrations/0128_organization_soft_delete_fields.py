from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("core", "0127_orgsupportticket_closed_at"),
    ]

    operations = [
        migrations.AddField(
            model_name="organization",
            name="deleted_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="organization",
            name="deleted_reason",
            field=models.CharField(blank=True, default="", max_length=200),
        ),
        migrations.AddField(
            model_name="organization",
            name="is_deleted",
            field=models.BooleanField(default=False),
        ),
    ]
