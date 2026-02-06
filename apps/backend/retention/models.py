from __future__ import annotations

from dataclasses import dataclass
from datetime import timedelta
from typing import Iterable, List, Optional

from django.db import models
from django.utils import timezone

from core.models import Organization


def _default_allowed_actions():
    return ["view", "export"]


class RetentionStatus(models.TextChoices):
    ACTIVE = "active", "Active"
    GRACE_READONLY = "grace_readonly", "Grace (Read-only)"
    ARCHIVED = "archived", "Archived"
    PENDING_DELETE = "pending_delete", "Pending Delete"
    DELETED = "deleted", "Deleted"


class GlobalRetentionPolicy(models.Model):
    grace_days = models.PositiveIntegerField(default=30)
    archive_days = models.PositiveIntegerField(default=60)
    hard_delete_days = models.PositiveIntegerField(default=0)
    allowed_actions_during_grace = models.JSONField(default=_default_allowed_actions)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Global Retention Policy"
        verbose_name_plural = "Global Retention Policy"

    def __str__(self):
        return "Global Retention Policy"

    @classmethod
    def get_active(cls) -> "GlobalRetentionPolicy":
        obj, _ = cls.objects.get_or_create(
            id=1,
            defaults={
                "grace_days": 30,
                "archive_days": 60,
                "hard_delete_days": 0,
                "allowed_actions_during_grace": _default_allowed_actions(),
            },
        )
        return obj

    @classmethod
    def get_solo(cls) -> "GlobalRetentionPolicy":
        return cls.get_active()


class TenantRetentionOverride(models.Model):
    organization = models.OneToOneField(
        Organization,
        on_delete=models.CASCADE,
        related_name="retention_override",
    )
    grace_days = models.PositiveIntegerField(null=True, blank=True)
    archive_days = models.PositiveIntegerField(null=True, blank=True)
    hard_delete_days = models.PositiveIntegerField(null=True, blank=True)
    allowed_actions_during_grace = models.JSONField(null=True, blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Tenant Retention Override"
        verbose_name_plural = "Tenant Retention Overrides"

    def __str__(self):
        return f"Retention Override - {self.organization.name}"


class TenantRetentionStatus(models.Model):
    organization = models.OneToOneField(
        Organization,
        on_delete=models.CASCADE,
        related_name="retention_status",
    )
    status = models.CharField(
        max_length=20,
        choices=RetentionStatus.choices,
        default=RetentionStatus.ACTIVE,
    )
    subscription_expires_at = models.DateTimeField(null=True, blank=True)
    grace_until = models.DateTimeField(null=True, blank=True)
    archive_until = models.DateTimeField(null=True, blank=True)
    deleted_at = models.DateTimeField(null=True, blank=True)
    last_evaluated_at = models.DateTimeField(null=True, blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        indexes = [
            models.Index(fields=["status"]),
        ]

    def __str__(self):
        return f"{self.organization.name} - {self.status}"


@dataclass(frozen=True)
class EffectiveRetentionPolicy:
    grace_days: int
    archive_days: int
    hard_delete_days: int
    allowed_actions_during_grace: List[str]


def resolve_effective_policy(
    organization: Optional[Organization],
) -> EffectiveRetentionPolicy:
    global_policy = GlobalRetentionPolicy.get_active()
    override = None
    if organization:
        override = TenantRetentionOverride.objects.filter(organization=organization).first()

    def pick(value, fallback):
        return fallback if value is None else value

    allowed_actions = (
        override.allowed_actions_during_grace
        if override and override.allowed_actions_during_grace
        else global_policy.allowed_actions_during_grace
    )
    return EffectiveRetentionPolicy(
        grace_days=pick(getattr(override, "grace_days", None), global_policy.grace_days),
        archive_days=pick(getattr(override, "archive_days", None), global_policy.archive_days),
        hard_delete_days=pick(getattr(override, "hard_delete_days", None), global_policy.hard_delete_days),
        allowed_actions_during_grace=list(allowed_actions or _default_allowed_actions()),
    )


def compute_retention_windows(
    subscription_expires_at,
    policy: EffectiveRetentionPolicy,
):
    if not subscription_expires_at:
        return None, None, None
    grace_until = subscription_expires_at + timedelta(days=policy.grace_days)
    archive_until = grace_until + timedelta(days=policy.archive_days)
    delete_at = None
    if policy.hard_delete_days and policy.hard_delete_days > 0:
        delete_at = archive_until + timedelta(days=policy.hard_delete_days)
    return grace_until, archive_until, delete_at


def compute_retention_status(
    subscription_expires_at,
    policy: EffectiveRetentionPolicy,
    now=None,
):
    current = now or timezone.now()
    if not subscription_expires_at:
        return RetentionStatus.ACTIVE, None, None, None

    grace_until, archive_until, delete_at = compute_retention_windows(
        subscription_expires_at, policy
    )
    if subscription_expires_at >= current:
        return RetentionStatus.ACTIVE, grace_until, archive_until, delete_at
    if grace_until and current <= grace_until:
        return RetentionStatus.GRACE_READONLY, grace_until, archive_until, delete_at
    if archive_until and current <= archive_until:
        return RetentionStatus.ARCHIVED, grace_until, archive_until, delete_at
    if delete_at:
        if current >= delete_at:
            return RetentionStatus.PENDING_DELETE, grace_until, archive_until, delete_at
        return RetentionStatus.ARCHIVED, grace_until, archive_until, delete_at
    return RetentionStatus.ARCHIVED, grace_until, archive_until, delete_at
