import uuid

from django.conf import settings
from django.db import models


class AiArchitectSettings(models.Model):
    provider = models.CharField(max_length=40, default="openai")
    enabled = models.BooleanField(default=False)
    response_mode = models.CharField(max_length=40, default="standard")
    model_name = models.CharField(max_length=120, default="gpt-4o-mini")
    max_tokens = models.PositiveIntegerField(default=900)
    monthly_budget_inr = models.PositiveIntegerField(default=5000)
    warning_threshold_percent = models.PositiveIntegerField(default=80)
    hard_stop_enabled = models.BooleanField(default=True)
    allow_error_logs_read = models.BooleanField(default=False)
    allowed_scopes = models.JSONField(default=dict, blank=True)
    encrypted_api_key = models.TextField(blank=True, default="")
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "AI Architect Settings"
        verbose_name_plural = "AI Architect Settings"

    def __str__(self):
        return f"AI Architect Settings ({self.provider})"


class AiArchitectChatMessage(models.Model):
    ROLE_CHOICES = (
        ("user", "User"),
        ("assistant", "Assistant"),
        ("system", "System"),
    )

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    session_id = models.UUIDField(default=uuid.uuid4, db_index=True)
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="ai_architect_messages"
    )
    role = models.CharField(max_length=20, choices=ROLE_CHOICES)
    content = models.TextField()
    meta = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        indexes = [
            models.Index(fields=["user", "created_at"]),
            models.Index(fields=["session_id", "created_at"]),
        ]

    def __str__(self):
        return f"{self.role} {self.created_at:%Y-%m-%d %H:%M}"


class AiArchitectUsageEvent(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="ai_architect_usage_events"
    )
    session_id = models.UUIDField(default=uuid.uuid4, db_index=True)
    total_tokens = models.PositiveIntegerField(default=0)
    cost_inr = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        indexes = [
            models.Index(fields=["user", "created_at"]),
            models.Index(fields=["created_at"]),
        ]

    def __str__(self):
        return f"AI usage {self.created_at:%Y-%m-%d} ({self.total_tokens} tokens)"
