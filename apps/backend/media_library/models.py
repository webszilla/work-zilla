import uuid

from django.conf import settings
from django.db import models

from core.models import Organization


class MediaLibraryActionLog(models.Model):
    ACTION_CHOICES = (
        ("LIST", "List"),
        ("DELETE", "Delete"),
    )

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    actor_user = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL)
    actor_role = models.CharField(max_length=32, blank=True, default="")
    organization = models.ForeignKey(Organization, null=True, blank=True, on_delete=models.SET_NULL)
    action = models.CharField(max_length=12, choices=ACTION_CHOICES)
    object_key = models.TextField(blank=True, default="")
    ip = models.GenericIPAddressField(null=True, blank=True)
    user_agent = models.TextField(blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ("-created_at",)

    def __str__(self):
        return f"{self.action} {self.object_key}"
