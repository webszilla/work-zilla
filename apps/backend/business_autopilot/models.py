import re

from django.conf import settings
from django.db import IntegrityError, models, transaction
from django.utils import timezone


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
    is_deleted = models.BooleanField(default=False)
    deleted_at = models.DateTimeField(null=True, blank=True)
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
    start_date = models.DateField(null=True, blank=True)
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


class CrmLead(models.Model):
    STAGE_CHOICES = (
        ("New", "New"),
        ("Qualified", "Qualified"),
        ("Proposal", "Proposal"),
    )
    PRIORITY_CHOICES = (
        ("High", "High"),
        ("Medium", "Medium"),
        ("Low", "Low"),
    )
    STATUS_CHOICES = (
        ("Open", "Open"),
        ("Closed", "Closed"),
        ("Converted", "Converted"),
    )
    ASSIGN_TYPE_CHOICES = (
        ("Users", "Users"),
        ("Team", "Team"),
    )

    CRM_REFERENCE_PREFIX = "CRM"
    CRM_REFERENCE_RE = re.compile(r"^CRM-(\d{2})-(\d{2})-(\d{4})-(\d+)$")

    organization = models.ForeignKey(
        "core.Organization",
        on_delete=models.CASCADE,
        related_name="business_autopilot_crm_leads",
    )
    crm_reference_id = models.CharField(max_length=32, unique=True, editable=False, db_index=True)
    lead_name = models.CharField(max_length=180)
    company = models.CharField(max_length=180, blank=True, default="")
    phone = models.CharField(max_length=40, blank=True, default="")
    lead_amount = models.DecimalField(max_digits=16, decimal_places=2, default=0)
    lead_source = models.CharField(max_length=120, blank=True, default="")
    assign_type = models.CharField(max_length=20, choices=ASSIGN_TYPE_CHOICES, default="Users")
    assigned_user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="business_autopilot_crm_assigned_leads",
    )
    assigned_user_ids = models.JSONField(default=list, blank=True)
    assigned_team = models.CharField(max_length=180, blank=True, default="")
    stage = models.CharField(max_length=30, choices=STAGE_CHOICES, default="New")
    priority = models.CharField(max_length=30, choices=PRIORITY_CHOICES, default="Medium")
    status = models.CharField(max_length=30, choices=STATUS_CHOICES, default="Open")
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="business_autopilot_crm_created_leads",
    )
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="business_autopilot_crm_updated_leads",
    )
    is_deleted = models.BooleanField(default=False)
    deleted_at = models.DateTimeField(null=True, blank=True)
    deleted_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="business_autopilot_crm_deleted_leads",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("-created_at", "-id")

    @classmethod
    def _build_crm_reference_prefix(cls, for_date):
        return f"{cls.CRM_REFERENCE_PREFIX}-{for_date.strftime('%d-%m-%Y')}-"

    @classmethod
    def _next_crm_reference_id(cls, for_date):
        prefix = cls._build_crm_reference_prefix(for_date)
        max_seq = 0
        existing_ids = cls.objects.select_for_update().filter(crm_reference_id__startswith=prefix).values_list("crm_reference_id", flat=True)
        for raw_id in existing_ids:
            match = cls.CRM_REFERENCE_RE.match(str(raw_id or "").strip())
            if not match:
                continue
            try:
                seq = int(match.group(4))
            except (TypeError, ValueError):
                continue
            if seq > max_seq:
                max_seq = seq
        return f"{prefix}{max_seq + 1:02d}"

    def save(self, *args, **kwargs):
        if self.pk or self.crm_reference_id:
            return super().save(*args, **kwargs)

        for _ in range(8):
            try:
                with transaction.atomic():
                    self.crm_reference_id = self._next_crm_reference_id(timezone.localdate())
                    return super().save(*args, **kwargs)
            except IntegrityError:
                # Retry with next sequence if another request created the same id concurrently.
                self.crm_reference_id = ""
                continue
        raise IntegrityError("Unable to generate unique crm_reference_id after multiple attempts.")

    def __str__(self):
        return f"Lead({self.organization_id} - {self.lead_name})"


class CrmContact(models.Model):
    TAG_CHOICES = (
        ("Client", "Client"),
        ("Prospect", "Prospect"),
        ("Vendor", "Vendor"),
    )

    organization = models.ForeignKey(
        "core.Organization",
        on_delete=models.CASCADE,
        related_name="business_autopilot_crm_contacts",
    )
    name = models.CharField(max_length=180)
    company = models.CharField(max_length=180, blank=True, default="")
    email = models.CharField(max_length=180, blank=True, default="")
    phone_country_code = models.CharField(max_length=10, blank=True, default="+91")
    phone = models.CharField(max_length=40, blank=True, default="")
    tag = models.CharField(max_length=30, choices=TAG_CHOICES, default="Client")
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="business_autopilot_crm_created_contacts",
    )
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="business_autopilot_crm_updated_contacts",
    )
    is_deleted = models.BooleanField(default=False)
    deleted_at = models.DateTimeField(null=True, blank=True)
    deleted_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="business_autopilot_crm_deleted_contacts",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("-created_at", "-id")

    def __str__(self):
        return f"Contact({self.organization_id} - {self.name})"


class CrmDeal(models.Model):
    STAGE_CHOICES = (
        ("Qualified", "Qualified"),
        ("Proposal", "Proposal"),
        ("Won", "Won"),
        ("Lost", "Lost"),
    )
    STATUS_CHOICES = (
        ("Open", "Open"),
        ("Won", "Won"),
        ("Lost", "Lost"),
    )

    organization = models.ForeignKey(
        "core.Organization",
        on_delete=models.CASCADE,
        related_name="business_autopilot_crm_deals",
    )
    crm_reference_id = models.CharField(max_length=32, blank=True, default="", db_index=True)
    lead = models.ForeignKey(
        CrmLead,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="deals",
    )
    deal_name = models.CharField(max_length=180)
    company = models.CharField(max_length=180, blank=True, default="")
    phone = models.CharField(max_length=40, blank=True, default="")
    deal_value = models.DecimalField(max_digits=16, decimal_places=2, default=0)
    won_amount_final = models.DecimalField(max_digits=16, decimal_places=2, default=0)
    stage = models.CharField(max_length=30, choices=STAGE_CHOICES, default="Qualified")
    status = models.CharField(max_length=30, choices=STATUS_CHOICES, default="Open")
    assigned_user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="business_autopilot_crm_assigned_deals",
    )
    assigned_user_ids = models.JSONField(default=list, blank=True)
    assigned_team = models.CharField(max_length=180, blank=True, default="")
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="business_autopilot_crm_created_deals",
    )
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="business_autopilot_crm_updated_deals",
    )
    is_deleted = models.BooleanField(default=False)
    deleted_at = models.DateTimeField(null=True, blank=True)
    deleted_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="business_autopilot_crm_deleted_deals",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("-created_at", "-id")

    def __str__(self):
        return f"Deal({self.organization_id} - {self.deal_name})"


class CrmSalesOrder(models.Model):
    STATUS_CHOICES = (
        ("Pending", "Pending"),
        ("Completed", "Completed"),
    )

    organization = models.ForeignKey(
        "core.Organization",
        on_delete=models.CASCADE,
        related_name="business_autopilot_crm_sales_orders",
    )
    crm_reference_id = models.CharField(max_length=32, blank=True, default="", db_index=True)
    deal = models.OneToOneField(
        CrmDeal,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="sales_order",
    )
    order_id = models.CharField(max_length=30)
    customer_name = models.CharField(max_length=180)
    company = models.CharField(max_length=180, blank=True, default="")
    phone = models.CharField(max_length=40, blank=True, default="")
    amount = models.DecimalField(max_digits=16, decimal_places=2, default=0)
    products = models.JSONField(default=list, blank=True)
    quantity = models.PositiveIntegerField(default=1)
    price = models.DecimalField(max_digits=16, decimal_places=2, default=0)
    tax = models.DecimalField(max_digits=16, decimal_places=2, default=0)
    total_amount = models.DecimalField(max_digits=16, decimal_places=2, default=0)
    payment_status = models.CharField(
        max_length=20,
        choices=(("pending", "Pending"), ("partial", "Partial"), ("paid", "Paid")),
        default="pending",
    )
    paid_amount = models.FloatField(default=0)
    payment_mode = models.CharField(max_length=50, blank=True, default="")
    payment_date = models.DateField(null=True, blank=True)
    transaction_id = models.CharField(max_length=100, blank=True, default="")
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="Pending")
    assigned_user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="business_autopilot_crm_sales_orders",
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="business_autopilot_crm_created_sales_orders",
    )
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="business_autopilot_crm_updated_sales_orders",
    )
    is_deleted = models.BooleanField(default=False)
    deleted_at = models.DateTimeField(null=True, blank=True)
    deleted_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="business_autopilot_crm_deleted_sales_orders",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("-created_at", "-id")
        unique_together = ("organization", "order_id")

    def __str__(self):
        return f"SalesOrder({self.organization_id} - {self.order_id})"


class CrmMeeting(models.Model):
    STATUS_CHOICES = (
        ("Scheduled", "Scheduled"),
        ("Completed", "Completed"),
        ("Rescheduled", "Rescheduled"),
        ("Cancelled", "Cancelled"),
        ("Missed", "Missed"),
    )

    organization = models.ForeignKey(
        "core.Organization",
        on_delete=models.CASCADE,
        related_name="business_autopilot_crm_meetings",
    )
    crm_reference_id = models.CharField(max_length=32, blank=True, default="", db_index=True)
    title = models.CharField(max_length=180)
    company_or_client_name = models.CharField(max_length=180, blank=True, default="")
    related_to = models.CharField(max_length=180, blank=True, default="")
    meeting_date = models.DateField(null=True, blank=True)
    meeting_time = models.TimeField(null=True, blank=True)
    owner_names = models.TextField(blank=True, default="")
    owner_user_ids = models.JSONField(default=list, blank=True)
    meeting_mode = models.CharField(max_length=30, blank=True, default="")
    reminder_channels = models.JSONField(default=list, blank=True)
    reminder_days = models.JSONField(default=list, blank=True)
    reminder_minutes = models.JSONField(default=list, blank=True)
    reminder_summary = models.CharField(max_length=255, blank=True, default="")
    reminder_email_sent_map = models.JSONField(default=dict, blank=True)
    status = models.CharField(max_length=30, choices=STATUS_CHOICES, default="Scheduled")
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="business_autopilot_crm_created_meetings",
    )
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="business_autopilot_crm_updated_meetings",
    )
    is_deleted = models.BooleanField(default=False)
    deleted_at = models.DateTimeField(null=True, blank=True)
    deleted_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="business_autopilot_crm_deleted_meetings",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("-created_at", "-id")

    def __str__(self):
        return f"Meeting({self.organization_id} - {self.title})"


class BusinessAutopilotUserCrmReassignmentSnapshot(models.Model):
    """
    Stores a snapshot of CRM assignments before a Business Autopilot user is deleted.
    Used to optionally restore the previous CRM assignments when the user is restored.
    """

    organization = models.ForeignKey(
        "core.Organization",
        on_delete=models.CASCADE,
        related_name="business_autopilot_user_crm_reassignment_snapshots",
    )
    membership = models.ForeignKey(
        "business_autopilot.OrganizationUser",
        on_delete=models.CASCADE,
        related_name="business_autopilot_crm_reassignment_snapshots",
    )
    source_user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="business_autopilot_crm_reassignment_snapshots_source",
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="business_autopilot_crm_reassignment_snapshots_created",
    )
    reassigned_to_user_ids = models.JSONField(default=list, blank=True)
    snapshot = models.JSONField(default=dict, blank=True)
    reverted_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("-created_at", "-id")

    def __str__(self):
        return f"UserCrmSnapshot({self.organization_id} - membership={self.membership_id} - source_user={self.source_user_id})"
