from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ("core", "0133_userprofile_profile_photo"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.AddField(
            model_name="organizationsettings",
            name="session_timeout_minutes",
            field=models.PositiveSmallIntegerField(default=30),
        ),
        migrations.CreateModel(
            name="UserLoginActivity",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("username", models.CharField(blank=True, default="", max_length=150)),
                ("email", models.EmailField(blank=True, default="", max_length=254)),
                ("role", models.CharField(blank=True, default="", max_length=30)),
                ("session_key", models.CharField(blank=True, default="", max_length=64)),
                ("ip_address", models.GenericIPAddressField(blank=True, null=True)),
                ("user_agent", models.TextField(blank=True, default="")),
                ("login_at", models.DateTimeField(auto_now_add=True)),
                (
                    "organization",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="login_activities",
                        to="core.organization",
                    ),
                ),
                (
                    "user",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="login_activities",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
        ),
        migrations.AddIndex(
            model_name="userloginactivity",
            index=models.Index(fields=["organization", "login_at"], name="core_userlo_organiz_810661_idx"),
        ),
        migrations.AddIndex(
            model_name="userloginactivity",
            index=models.Index(fields=["user", "login_at"], name="core_userlo_user_id_5c66ce_idx"),
        ),
    ]
