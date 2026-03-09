from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ("whatsapp_automation", "0017_rename_whatsapp_aut_organiz_456cb0_idx_whatsapp_au_organiz_29b007_idx_and_more"),
    ]

    operations = [
        migrations.CreateModel(
            name="DigitalCardVisit",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("public_slug", models.SlugField(blank=True, default="", max_length=220)),
                ("visitor_ip", models.CharField(blank=True, default="", max_length=80)),
                ("visitor_country", models.CharField(blank=True, default="Unknown", max_length=120)),
                ("visitor_key", models.CharField(blank=True, default="", max_length=120)),
                ("user_agent", models.CharField(blank=True, default="", max_length=400)),
                ("page_path", models.CharField(blank=True, default="", max_length=300)),
                ("page_url", models.TextField(blank=True, default="")),
                ("visited_at", models.DateTimeField(auto_now_add=True)),
                (
                    "card_entry",
                    models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="visits", to="whatsapp_automation.digitalcardentry"),
                ),
                (
                    "organization",
                    models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="wa_digital_card_visits", to="core.organization"),
                ),
            ],
            options={
                "ordering": ("-visited_at", "-id"),
            },
        ),
        migrations.AddIndex(
            model_name="digitalcardvisit",
            index=models.Index(fields=["organization", "visited_at"], name="whatsapp_au_organiz_2306ea_idx"),
        ),
        migrations.AddIndex(
            model_name="digitalcardvisit",
            index=models.Index(fields=["organization", "visitor_key", "visited_at"], name="whatsapp_au_organiz_120fda_idx"),
        ),
        migrations.AddIndex(
            model_name="digitalcardvisit",
            index=models.Index(fields=["card_entry", "visited_at"], name="whatsapp_au_card_en_e1b097_idx"),
        ),
    ]
