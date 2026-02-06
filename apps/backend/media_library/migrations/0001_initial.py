from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion
import uuid


class Migration(migrations.Migration):
    initial = True

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ("core", "0001_initial"),
    ]

    operations = [
        migrations.CreateModel(
            name="MediaLibraryActionLog",
            fields=[
                ("id", models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False, serialize=False)),
                ("actor_role", models.CharField(max_length=32, blank=True, default="")),
                ("action", models.CharField(max_length=12, choices=[("LIST", "List"), ("DELETE", "Delete")])),
                ("object_key", models.TextField(blank=True, default="")),
                ("ip", models.GenericIPAddressField(null=True, blank=True)),
                ("user_agent", models.TextField(blank=True, default="")),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("actor_user", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, to=settings.AUTH_USER_MODEL)),
                ("organization", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, to="core.organization")),
            ],
            options={
                "ordering": ("-created_at",),
            },
        ),
    ]
