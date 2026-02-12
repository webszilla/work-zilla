from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    dependencies = [
        ("core", "0060_ai_usage_event_and_costs"),
    ]

    operations = [
        migrations.CreateModel(
            name="ChatEnquiryLead",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("site_domain", models.CharField(blank=True, max_length=200)),
                ("name", models.CharField(max_length=120)),
                ("email", models.EmailField(max_length=254)),
                ("phone", models.CharField(blank=True, max_length=40)),
                ("message", models.TextField(blank=True)),
                ("page_url", models.TextField(blank=True)),
                ("status", models.CharField(choices=[("new", "New"), ("open", "Open"), ("contacted", "Contacted"), ("closed", "Closed")], default="new", max_length=20)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("organization", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, to="core.organization")),
                ("widget", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, to="core.chatwidget")),
            ],
            options={
                "indexes": [
                    models.Index(fields=["organization", "created_at"], name="core_chaten_organize_7e3e43_idx"),
                    models.Index(fields=["widget", "created_at"], name="core_chaten_widget__5f5a76_idx"),
                ],
            },
        ),
    ]
