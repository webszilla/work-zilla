from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("core", "0056_ai_usage_counter"),
    ]

    operations = [
        migrations.AddField(
            model_name="chatmessage",
            name="ai_model",
            field=models.CharField(blank=True, max_length=80, null=True),
        ),
        migrations.AddField(
            model_name="chatmessage",
            name="tokens_in",
            field=models.PositiveIntegerField(default=0),
        ),
        migrations.AddField(
            model_name="chatmessage",
            name="tokens_out",
            field=models.PositiveIntegerField(default=0),
        ),
        migrations.AddField(
            model_name="chatmessage",
            name="tokens_total",
            field=models.PositiveIntegerField(default=0),
        ),
        migrations.AddField(
            model_name="chatmessage",
            name="cost_usd",
            field=models.DecimalField(blank=True, decimal_places=6, max_digits=10, null=True),
        ),
    ]
