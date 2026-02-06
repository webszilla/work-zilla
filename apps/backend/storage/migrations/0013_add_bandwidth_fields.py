from django.db import migrations, models


def seed_bandwidth_limits(apps, schema_editor):
    Plan = apps.get_model("storage", "Plan")

    storage_map = {
        "free": 50,
        "free trial": 50,
        "basic": 250,
        "standard": 500,
        "pro": 1024,
    }

    for plan in Plan.objects.all():
        key = (plan.name or "").strip().lower()
        if key in storage_map:
            plan.storage_limit_gb = storage_map[key]
        storage_gb = int(plan.storage_limit_gb or 0)
        plan.bandwidth_limit_gb_monthly = max(0, storage_gb * 3)
        plan.is_bandwidth_limited = True
        plan.save(update_fields=[
            "storage_limit_gb",
            "bandwidth_limit_gb_monthly",
            "is_bandwidth_limited",
        ])


class Migration(migrations.Migration):
    dependencies = [
        ("storage", "0012_set_storage_plan_prices"),
    ]

    operations = [
        migrations.AddField(
            model_name="plan",
            name="yearly_price",
            field=models.DecimalField(decimal_places=2, default=0, max_digits=12),
        ),
        migrations.AddField(
            model_name="plan",
            name="usd_monthly_price",
            field=models.DecimalField(decimal_places=2, default=0, max_digits=12),
        ),
        migrations.AddField(
            model_name="plan",
            name="usd_yearly_price",
            field=models.DecimalField(decimal_places=2, default=0, max_digits=12),
        ),
        migrations.AddField(
            model_name="plan",
            name="bandwidth_limit_gb_monthly",
            field=models.PositiveIntegerField(default=0),
        ),
        migrations.AddField(
            model_name="plan",
            name="is_bandwidth_limited",
            field=models.BooleanField(default=True),
        ),
        migrations.CreateModel(
            name="OrgBandwidthUsage",
            fields=[
                ("id", models.AutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("billing_cycle_start", models.DateField()),
                ("used_bandwidth_bytes", models.BigIntegerField(default=0)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("organization", models.ForeignKey(on_delete=models.deletion.CASCADE, related_name="bandwidth_usage", to="core.organization")),
            ],
            options={
                "unique_together": {("organization", "billing_cycle_start")},
            },
        ),
        migrations.RunPython(seed_bandwidth_limits, migrations.RunPython.noop),
    ]
