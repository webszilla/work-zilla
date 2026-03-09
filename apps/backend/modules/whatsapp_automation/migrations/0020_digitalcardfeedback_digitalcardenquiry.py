from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ("whatsapp_automation", "0019_digitalcardentry_telephone_number"),
    ]

    operations = [
        migrations.CreateModel(
            name="DigitalCardFeedback",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("public_slug", models.SlugField(blank=True, default="", max_length=220)),
                ("full_name", models.CharField(blank=True, default="", max_length=160)),
                ("rating", models.PositiveSmallIntegerField(default=5)),
                ("message", models.TextField(blank=True, default="")),
                ("is_approved", models.BooleanField(default=True)),
                ("is_deleted", models.BooleanField(default=False)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                (
                    "card_entry",
                    models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="feedbacks", to="whatsapp_automation.digitalcardentry"),
                ),
                (
                    "organization",
                    models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="wa_digital_card_feedbacks", to="core.organization"),
                ),
            ],
            options={"ordering": ("-created_at", "-id")},
        ),
        migrations.CreateModel(
            name="DigitalCardEnquiry",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("public_slug", models.SlugField(blank=True, default="", max_length=220)),
                ("full_name", models.CharField(blank=True, default="", max_length=160)),
                ("phone_number", models.CharField(blank=True, default="", max_length=40)),
                ("email", models.EmailField(blank=True, default="", max_length=254)),
                ("message", models.TextField(blank=True, default="")),
                (
                    "status",
                    models.CharField(
                        choices=[("new", "New"), ("following", "Following"), ("completed", "Completed")],
                        default="new",
                        max_length=20,
                    ),
                ),
                ("is_deleted", models.BooleanField(default=False)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                (
                    "card_entry",
                    models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="enquiries", to="whatsapp_automation.digitalcardentry"),
                ),
                (
                    "organization",
                    models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="wa_digital_card_enquiries", to="core.organization"),
                ),
            ],
            options={"ordering": ("-created_at", "-id")},
        ),
        migrations.AddIndex(
            model_name="digitalcardfeedback",
            index=models.Index(fields=["organization", "created_at"], name="whatsapp_au_organiz_413e7c_idx"),
        ),
        migrations.AddIndex(
            model_name="digitalcardfeedback",
            index=models.Index(fields=["organization", "is_approved", "is_deleted"], name="whatsapp_au_organiz_62f543_idx"),
        ),
        migrations.AddIndex(
            model_name="digitalcardfeedback",
            index=models.Index(fields=["public_slug", "created_at"], name="whatsapp_au_public__89c6cd_idx"),
        ),
        migrations.AddIndex(
            model_name="digitalcardenquiry",
            index=models.Index(fields=["organization", "status", "created_at"], name="whatsapp_au_organiz_01599e_idx"),
        ),
        migrations.AddIndex(
            model_name="digitalcardenquiry",
            index=models.Index(fields=["organization", "is_deleted", "created_at"], name="whatsapp_au_organiz_107aa9_idx"),
        ),
        migrations.AddIndex(
            model_name="digitalcardenquiry",
            index=models.Index(fields=["public_slug", "created_at"], name="whatsapp_au_public__9298e4_idx"),
        ),
    ]
