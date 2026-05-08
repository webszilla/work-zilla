from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ("core", "0150_emailnotificationlog"),
    ]

    operations = [
        migrations.AddField(
            model_name="subscription",
            name="scheduled_plan",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="scheduled_subscriptions",
                to="core.plan",
            ),
        ),
        migrations.AddField(
            model_name="subscription",
            name="scheduled_change_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
    ]

