from django.db import migrations


def seed_alert_rules(apps, schema_editor):
    AlertRule = apps.get_model("core", "AlertRule")

    rules = [
        {
            "name": "Agent rate limited spike",
            "event_type": "agent_rate_limited",
            "threshold_count": 50,
            "window_minutes": 5,
            "cooldown_minutes": 30,
        },
        {
            "name": "Agent screenshot upload failures",
            "event_type": "agent_screenshot_upload:error",
            "threshold_count": 20,
            "window_minutes": 10,
            "cooldown_minutes": 30,
        },
        {
            "name": "Renew submissions spike",
            "event_type": "renew_submitted",
            "threshold_count": 30,
            "window_minutes": 60,
            "cooldown_minutes": 60,
        },
    ]

    for data in rules:
        AlertRule.objects.get_or_create(
            name=data["name"],
            defaults={
                "is_enabled": True,
                "event_type": data["event_type"],
                "product_slug": "",
                "threshold_count": data["threshold_count"],
                "window_minutes": data["window_minutes"],
                "cooldown_minutes": data["cooldown_minutes"],
                "emails": "",
            },
        )


def unseed_alert_rules(apps, schema_editor):
    AlertRule = apps.get_model("core", "AlertRule")
    AlertRule.objects.filter(name__in=[
        "Agent rate limited spike",
        "Agent screenshot upload failures",
        "Renew submissions spike",
    ]).delete()


class Migration(migrations.Migration):

    dependencies = [
        ("core", "0048_eventmetric_alertrule"),
    ]

    operations = [
        migrations.RunPython(seed_alert_rules, unseed_alert_rules),
    ]
