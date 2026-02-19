from django.db import models
from django.conf import settings


class Module(models.Model):
    name = models.CharField(max_length=120)
    slug = models.SlugField(max_length=120, unique=True)
    is_active = models.BooleanField(default=True)
    sort_order = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ("sort_order", "name")

    def __str__(self):
        return self.name


class OrganizationModule(models.Model):
    organization = models.ForeignKey("core.Organization", on_delete=models.CASCADE, related_name="business_modules")
    module = models.ForeignKey(Module, on_delete=models.CASCADE, related_name="organization_modules")
    enabled = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ("organization", "module")
        ordering = ("organization_id", "module__sort_order", "module__name")

    def __str__(self):
        return f"{self.organization_id} - {self.module.slug}"


class OrganizationUser(models.Model):
    ROLE_CHOICES = (
        ("company_admin", "Company Admin"),
        ("org_user", "Org User"),
        ("hr_view", "HR View"),
    )

    organization = models.ForeignKey(
        "core.Organization",
        on_delete=models.CASCADE,
        related_name="business_autopilot_users",
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="business_autopilot_memberships",
    )
    role = models.CharField(max_length=20, choices=ROLE_CHOICES, default="org_user")
    employee_role = models.CharField(max_length=120, blank=True, default="")
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ("organization", "user")
        ordering = ("-id",)

    def __str__(self):
        return f"{self.organization_id} - {self.user_id} ({self.role})"


class OrganizationEmployeeRole(models.Model):
    organization = models.ForeignKey(
        "core.Organization",
        on_delete=models.CASCADE,
        related_name="business_autopilot_employee_roles",
    )
    name = models.CharField(max_length=120)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ("organization", "name")
        ordering = ("name",)

    def __str__(self):
        return f"{self.organization_id} - {self.name}"
