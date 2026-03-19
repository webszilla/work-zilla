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
    department = models.CharField(max_length=120, blank=True, default="")
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


class OrganizationDepartment(models.Model):
    organization = models.ForeignKey(
        "core.Organization",
        on_delete=models.CASCADE,
        related_name="business_autopilot_departments",
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


class AccountsWorkspace(models.Model):
    organization = models.OneToOneField(
        "core.Organization",
        on_delete=models.CASCADE,
        related_name="business_autopilot_accounts_workspace",
    )
    data = models.JSONField(default=dict, blank=True)
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="business_autopilot_accounts_workspace_updates",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("-updated_at",)

    def __str__(self):
        return f"AccountsWorkspace(org={self.organization_id})"


class SubscriptionCategory(models.Model):
    organization = models.ForeignKey(
        "core.Organization",
        on_delete=models.CASCADE,
        related_name="business_autopilot_subscription_categories",
    )
    name = models.CharField(max_length=160)
    description = models.CharField(max_length=255, blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ("organization", "name")
        ordering = ("name",)

    def __str__(self):
        return f"{self.organization_id} - {self.name}"


class SubscriptionSubCategory(models.Model):
    organization = models.ForeignKey(
        "core.Organization",
        on_delete=models.CASCADE,
        related_name="business_autopilot_subscription_sub_categories",
    )
    category = models.ForeignKey(
        SubscriptionCategory,
        on_delete=models.CASCADE,
        related_name="subscription_sub_categories",
    )
    name = models.CharField(max_length=160)
    description = models.CharField(max_length=255, blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ("organization", "category", "name")
        ordering = ("category_id", "name")

    def __str__(self):
        return f"{self.organization_id} - {self.category_id} - {self.name}"


class Subscription(models.Model):
    STATUS_CHOICES = (
        ("Active", "Active"),
        ("Expired", "Expired"),
        ("Cancelled", "Cancelled"),
    )

    organization = models.ForeignKey(
        "core.Organization",
        on_delete=models.CASCADE,
        related_name="business_autopilot_subscriptions",
    )
    category = models.ForeignKey(
        SubscriptionCategory,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="subscriptions",
    )
    sub_category = models.ForeignKey(
        SubscriptionSubCategory,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="subscriptions",
    )
    subscription_title = models.CharField(max_length=255)
    customer_id = models.BigIntegerField(null=True, blank=True)
    email_alert_days = models.JSONField(null=True, blank=True, default=list)
    whatsapp_alert_days = models.JSONField(null=True, blank=True, default=list)
    plan_duration_days = models.PositiveIntegerField(null=True, blank=True)
    payment_description = models.TextField(blank=True, default="")
    amount = models.DecimalField(max_digits=16, decimal_places=2, default=0)
    currency = models.CharField(max_length=10, default="INR")
    start_date = models.DateField()
    end_date = models.DateField(null=True, blank=True)
    next_billing_date = models.DateField(null=True, blank=True)
    email_alert_assign_to = models.JSONField(null=True, blank=True, default=list)
    whatsapp_alert_assign_to = models.JSONField(null=True, blank=True, default=list)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="Active")
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="business_autopilot_created_subscriptions",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("-created_at",)

    def __str__(self):
        return f"{self.organization_id} - {self.subscription_title}"


class PayrollSettings(models.Model):
    organization = models.OneToOneField(
        "core.Organization",
        on_delete=models.CASCADE,
        related_name="business_autopilot_payroll_settings",
    )
    enable_pf = models.BooleanField(default=True)
    enable_esi = models.BooleanField(default=True)
    pf_employee_percent = models.DecimalField(max_digits=5, decimal_places=2, default=12)
    pf_employer_percent = models.DecimalField(max_digits=5, decimal_places=2, default=12)
    esi_employee_percent = models.DecimalField(max_digits=5, decimal_places=2, default=0.75)
    esi_employer_percent = models.DecimalField(max_digits=5, decimal_places=2, default=3.25)
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="business_autopilot_payroll_settings_updates",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("-updated_at",)

    def __str__(self):
        return f"PayrollSettings(org={self.organization_id})"


class SalaryStructure(models.Model):
    organization = models.ForeignKey(
        "core.Organization",
        on_delete=models.CASCADE,
        related_name="business_autopilot_salary_structures",
    )
    name = models.CharField(max_length=120)
    is_default = models.BooleanField(default=False)
    basic_salary_percent = models.DecimalField(max_digits=5, decimal_places=2, default=40)
    hra_percent = models.DecimalField(max_digits=5, decimal_places=2, default=20)
    conveyance_fixed = models.DecimalField(max_digits=12, decimal_places=2, default=1600)
    auto_special_allowance = models.BooleanField(default=True)
    basic_salary = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    hra = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    conveyance = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    special_allowance = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    bonus = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    other_allowances = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    apply_pf = models.BooleanField(default=True)
    apply_esi = models.BooleanField(default=True)
    professional_tax = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    other_deduction = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    notes = models.CharField(max_length=255, blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("name", "id")
        unique_together = ("organization", "name")

    def __str__(self):
        return f"{self.organization_id} - {self.name}"


class EmployeeSalaryHistory(models.Model):
    INCREMENT_TYPE_CHOICES = (
        ("percentage", "Percentage"),
        ("fixed", "Fixed Amount"),
    )

    organization = models.ForeignKey(
        "core.Organization",
        on_delete=models.CASCADE,
        related_name="business_autopilot_salary_history",
    )
    employee_name = models.CharField(max_length=160)
    source_user_id = models.PositiveIntegerField(null=True, blank=True)
    salary_structure = models.ForeignKey(
        SalaryStructure,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="salary_history_entries",
    )
    current_salary = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    monthly_salary_amount = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    increment_type = models.CharField(max_length=20, choices=INCREMENT_TYPE_CHOICES, default="percentage")
    increment_value = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    effective_from = models.DateField()
    increment_amount = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    new_salary = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    notes = models.CharField(max_length=255, blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("-effective_from", "-id")

    def __str__(self):
        return f"{self.organization_id} - {self.employee_name} ({self.effective_from})"


class PayrollEntry(models.Model):
    STATUS_CHOICES = (
        ("draft", "Draft"),
        ("processed", "Processed"),
        ("paid", "Paid"),
    )

    organization = models.ForeignKey(
        "core.Organization",
        on_delete=models.CASCADE,
        related_name="business_autopilot_payroll_entries",
    )
    employee_name = models.CharField(max_length=160)
    source_user_id = models.PositiveIntegerField(null=True, blank=True)
    payroll_month = models.CharField(max_length=7)
    currency = models.CharField(max_length=10, default="INR")
    salary_structure = models.ForeignKey(
        SalaryStructure,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="payroll_entries",
    )
    salary_history = models.ForeignKey(
        EmployeeSalaryHistory,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="payroll_entries",
    )
    gross_salary = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    pf_employee_amount = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    pf_employer_amount = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    esi_employee_amount = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    esi_employer_amount = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    professional_tax_amount = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    other_deduction_amount = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    total_deductions = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    net_salary = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    earnings = models.JSONField(default=dict, blank=True)
    deductions = models.JSONField(default=dict, blank=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="processed")
    processed_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("-payroll_month", "employee_name", "-id")

    def __str__(self):
        return f"{self.organization_id} - {self.employee_name} ({self.payroll_month})"


class Payslip(models.Model):
    organization = models.ForeignKey(
        "core.Organization",
        on_delete=models.CASCADE,
        related_name="business_autopilot_payslips",
    )
    payroll_entry = models.OneToOneField(
        PayrollEntry,
        on_delete=models.CASCADE,
        related_name="payslip",
    )
    slip_number = models.CharField(max_length=80)
    generated_for_month = models.CharField(max_length=7)
    employee_name = models.CharField(max_length=160)
    source_user_id = models.PositiveIntegerField(null=True, blank=True)
    currency = models.CharField(max_length=10, default="INR")
    generated_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("-generated_at", "-id")
        unique_together = ("organization", "slip_number")

    def __str__(self):
        return f"{self.organization_id} - {self.slip_number}"
