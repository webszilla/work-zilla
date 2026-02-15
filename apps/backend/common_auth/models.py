from django.contrib.auth.models import AbstractUser
from django.db import models


class Organization(models.Model):
    name = models.CharField(max_length=200, unique=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self) -> str:
        return self.name


class Subscription(models.Model):
    class Status(models.TextChoices):
        ACTIVE = "active", "Active"
        CANCELED = "canceled", "Canceled"
        TRIALING = "trialing", "Trialing"

    organization = models.ForeignKey(
        Organization, on_delete=models.CASCADE, related_name="subscriptions"
    )
    product_code = models.CharField(max_length=50)
    status = models.CharField(
        max_length=20, choices=Status.choices, default=Status.ACTIVE
    )
    started_at = models.DateTimeField(auto_now_add=True)
    ends_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["organization", "product_code"],
                name="unique_org_product_subscription",
            )
        ]

    def __str__(self) -> str:
        return f"{self.organization} - {self.product_code}"


class User(AbstractUser):
    organization = models.ForeignKey(
        Organization, on_delete=models.SET_NULL, null=True, blank=True, related_name="users"
    )
    email = models.EmailField(unique=True)
    email_verified = models.BooleanField(default=False)
    email_verified_at = models.DateTimeField(null=True, blank=True)
    email_verification_token = models.CharField(max_length=128, blank=True, default="")
    email_verification_sent_at = models.DateTimeField(null=True, blank=True)

    def save(self, *args, **kwargs) -> None:
        if self.email and not self.username:
            self.username = self.email
        super().save(*args, **kwargs)
