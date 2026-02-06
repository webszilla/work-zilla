from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    dependencies = [
        ("core", "0054_plan_features"),
    ]

    operations = [
        migrations.CreateModel(
            name="ChatLead",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("visitor_id", models.CharField(max_length=120)),
                ("name", models.CharField(max_length=120)),
                ("phone", models.CharField(max_length=40)),
                ("email", models.EmailField(blank=True, max_length=254)),
                ("message", models.TextField(blank=True)),
                ("source_url", models.TextField(blank=True)),
                ("user_agent", models.TextField(blank=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("conversation", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, to="core.chatconversation")),
                ("organization", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, to="core.organization")),
                ("widget", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, to="core.chatwidget")),
            ],
            options={
                "indexes": [
                    models.Index(fields=["organization", "created_at"], name="core_chatle_organiz_6fd6f7_idx"),
                    models.Index(fields=["widget", "created_at"], name="core_chatle_widget__f94e0e_idx"),
                ],
            },
        ),
    ]
