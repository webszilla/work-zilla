from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ("core", "0047_billingprofile_org_company_key_and_more"),
    ]

    operations = [
        migrations.CreateModel(
            name="EventMetric",
            fields=[
                ("id", models.AutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("date", models.DateField()),
                ("event_type", models.CharField(max_length=120)),
                ("product_slug", models.CharField(blank=True, max_length=60)),
                ("count", models.PositiveIntegerField(default=0)),
                ("last_seen_at", models.DateTimeField(blank=True, null=True)),
                ("organization", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, to="core.organization")),
            ],
            options={},
        ),
        migrations.CreateModel(
            name="AlertRule",
            fields=[
                ("id", models.AutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("name", models.CharField(max_length=160)),
                ("is_enabled", models.BooleanField(default=True)),
                ("event_type", models.CharField(max_length=120)),
                ("product_slug", models.CharField(blank=True, max_length=60)),
                ("threshold_count", models.PositiveIntegerField(default=1)),
                ("window_minutes", models.PositiveIntegerField(default=60)),
                ("cooldown_minutes", models.PositiveIntegerField(default=60)),
                ("last_alerted_at", models.DateTimeField(blank=True, null=True)),
                ("emails", models.TextField(blank=True)),
                ("organization", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE, to="core.organization")),
            ],
            options={
                "ordering": ["-is_enabled", "event_type", "product_slug", "id"],
            },
        ),
        migrations.AddConstraint(
            model_name="eventmetric",
            constraint=models.UniqueConstraint(fields=("date", "organization", "product_slug", "event_type"), name="eventmetric_unique_daily_org_product_event"),
        ),
        migrations.AddIndex(
            model_name="eventmetric",
            index=models.Index(fields=["date", "event_type"], name="core_eventm_date_9f1515_idx"),
        ),
        migrations.AddIndex(
            model_name="eventmetric",
            index=models.Index(fields=["organization", "product_slug"], name="core_eventm_organiza_996b53_idx"),
        ),
    ]
