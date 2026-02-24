from django import forms
from django.contrib import admin, messages
from django.template.response import TemplateResponse
from django.urls import path, reverse
from django.shortcuts import get_object_or_404, redirect, render
from django.utils.html import format_html
from django.db import models
from django.contrib.admin import SimpleListFilter
from .models import Organization, Employee, Activity, Screenshot, Plan, Device, OrganizationSettings, CompanyPrivacySettings, SupportAccessAuditLog, Subscription, SubscriptionHistory, DeletedAccount, AdminNotification, PendingTransfer, UserProfile, BillingProfile, InvoiceSellerProfile, ThemeSettings, ReferralSettings, ReferralEarning, DealerAccount, DealerReferralEarning, EventMetric, AlertRule, ChatWidget, ChatConversation, ChatMessage, ChatLead, ChatEnquiryLead, AiUsageCounter, AiUsageMonthly
from django.utils import timezone
from django.db.models import Q
from decimal import Decimal
from datetime import timedelta

from .subscription_utils import revert_transfer_subscription
from .referral_utils import record_referral_earning, record_dealer_org_referral_earning
from .email_utils import send_templated_email
from core.observability import log_event
from apps.backend.worksuite.admin_views import monitor_products_hub


class PlanFilter(SimpleListFilter):
    title = "Plan"
    parameter_name = "plan_id"

    def lookups(self, request, model_admin):
        return [(p.id, p.name) for p in Plan.objects.all().order_by("name")]

    def queryset(self, request, queryset):
        plan_id = self.value()
        if not plan_id:
            return queryset
        org_ids = (
            Subscription.objects.filter(plan_id=plan_id, status="active")
            .values_list("organization_id", flat=True)
            .distinct()
        )
        if queryset.model == Organization:
            return queryset.filter(id__in=org_ids)
        if queryset.model == Employee:
            return queryset.filter(org_id__in=org_ids)
        return queryset

@admin.register(Plan)
class PlanAdmin(admin.ModelAdmin):
    exclude = ("price", "duration_months")
    change_form_template = "admin/core/plan/change_form.html"
    list_display = ("name", "monthly_price", "yearly_price", "usd_monthly_price", "usd_yearly_price", "addon_monthly_price", "addon_yearly_price", "addon_usd_monthly_price", "addon_usd_yearly_price", "employee_limit", "retention_days", "screenshot_min_minutes", "allow_addons", "allow_app_usage", "allow_gaming_ott_usage", "allow_hr_view")

    def log_addition(self, request, object, message):
        return

    def log_change(self, request, object, message):
        return

    def log_deletion(self, request, object, message):
        return


@admin.register(Device)
class DeviceAdmin(admin.ModelAdmin):
    list_display = ("device_id", "user", "org", "device_name", "os_info", "app_version", "last_seen", "is_active")
    list_filter = ("is_active",)
    search_fields = ("device_id", "device_name", "user__username", "user__email", "org__name")


@admin.register(Organization)
class OrganizationAdmin(admin.ModelAdmin):
    list_display = ("name", "company_key", "referral_code", "referred_by", "referred_by_dealer", "owner", "view_details")
    search_fields = ("name", "company_key", "owner__username", "owner__email")
    list_per_page = 25
    list_filter = (PlanFilter,)

    def get_urls(self):
        urls = super().get_urls()
        custom = [
            path(
                "<int:org_id>/details/",
                self.admin_site.admin_view(self.org_details_view),
                name="org-details",
            )
        ]
        return custom + urls

    def view_details(self, obj):
        return format_html(
            '<a href="{}" onclick="var w=1100,h=700;var l=(window.screen.width-w)/2;var t=(window.screen.height-h)/2;window.open(this.href, \'orgDetails\', \'width=\' + w + \',height=\' + h + \',left=\' + l + \',top=\' + t); return false;">View</a>',
            f"{obj.id}/details/",
        )
    view_details.short_description = "Details"

    def org_details_view(self, request, org_id):
        org = get_object_or_404(Organization, id=org_id)
        query = request.GET.get("q", "").strip()
        subs = Subscription.objects.filter(organization=org)
        if query:
            subs = subs.filter(
                models.Q(plan__name__icontains=query) |
                models.Q(status__icontains=query) |
                models.Q(billing_cycle__icontains=query)
            )
        subs = subs.order_by("-start_date")
        from django.core.paginator import Paginator
        paginator = Paginator(subs, 10)
        page = request.GET.get("page")
        subs_page = paginator.get_page(page)
        employees_count = Employee.objects.filter(org=org).count()
        return render(request, "admin/core/organization/details_popup.html", {
            "org": org,
            "subs": subs_page,
            "employees_count": employees_count,
            "search_query": query,
        })

    def delete_model(self, request, obj):
        owner = obj.owner
        DeletedAccount.objects.create(
            organization_name=obj.name,
            owner_username=owner.username if owner else "-",
            owner_email=owner.email if owner else "",
            reason="Admin deleted organization"
        )
        if owner:
            owner.delete()
        else:
            obj.delete()

    def delete_queryset(self, request, queryset):
        for org in queryset:
            owner = org.owner
            DeletedAccount.objects.create(
                organization_name=org.name,
                owner_username=owner.username if owner else "-",
                owner_email=owner.email if owner else "",
                reason="Admin deleted organization"
            )
            if owner:
                owner.delete()
            else:
                org.delete()


@admin.register(Subscription)
class SubscriptionAdmin(admin.ModelAdmin):
    list_display = ("organization", "plan", "status", "billing_cycle", "retention_days", "start_date", "end_date")
    list_filter = ("status", "billing_cycle")


@admin.register(EventMetric)
class EventMetricAdmin(admin.ModelAdmin):
    list_display = ("date", "organization", "product_slug", "event_type", "count", "last_seen_at")
    list_filter = ("date", "product_slug", "event_type", "organization")
    search_fields = ("organization__name", "product_slug", "event_type")
    list_per_page = 50


@admin.register(AlertRule)
class AlertRuleAdmin(admin.ModelAdmin):
    list_display = ("name", "is_enabled", "event_type", "product_slug", "organization", "threshold_count", "window_minutes", "cooldown_minutes", "last_alerted_at")
    list_filter = ("is_enabled", "event_type", "product_slug", "organization")
    search_fields = ("name", "event_type", "product_slug")
    list_editable = ("is_enabled",)
    list_per_page = 50


@admin.register(BillingProfile)
class BillingProfileAdmin(admin.ModelAdmin):
    list_display = ("organization", "contact_name", "company_name", "email", "gstin", "updated_at")
    search_fields = ("organization__name", "contact_name", "company_name", "email", "gstin")
    list_filter = ("country", "state")


@admin.register(InvoiceSellerProfile)
class InvoiceSellerProfileAdmin(admin.ModelAdmin):
    class InvoiceSellerProfileForm(forms.ModelForm):
        COUNTRY_CHOICES = [
            ("India", "India"),
            ("United States", "United States"),
            ("United Kingdom", "United Kingdom"),
            ("United Arab Emirates", "United Arab Emirates"),
            ("Singapore", "Singapore"),
            ("Malaysia", "Malaysia"),
            ("Australia", "Australia"),
            ("Canada", "Canada"),
            ("Saudi Arabia", "Saudi Arabia"),
            ("Qatar", "Qatar"),
            ("Kuwait", "Kuwait"),
            ("Germany", "Germany"),
            ("France", "France"),
        ]
        STATE_CHOICES = [
            ("", "Select a state"),
            ("Andhra Pradesh", "Andhra Pradesh"),
            ("Arunachal Pradesh", "Arunachal Pradesh"),
            ("Assam", "Assam"),
            ("Bihar", "Bihar"),
            ("Chhattisgarh", "Chhattisgarh"),
            ("Goa", "Goa"),
            ("Gujarat", "Gujarat"),
            ("Haryana", "Haryana"),
            ("Himachal Pradesh", "Himachal Pradesh"),
            ("Jharkhand", "Jharkhand"),
            ("Karnataka", "Karnataka"),
            ("Kerala", "Kerala"),
            ("Madhya Pradesh", "Madhya Pradesh"),
            ("Maharashtra", "Maharashtra"),
            ("Manipur", "Manipur"),
            ("Meghalaya", "Meghalaya"),
            ("Mizoram", "Mizoram"),
            ("Nagaland", "Nagaland"),
            ("Odisha", "Odisha"),
            ("Punjab", "Punjab"),
            ("Rajasthan", "Rajasthan"),
            ("Sikkim", "Sikkim"),
            ("Tamil Nadu", "Tamil Nadu"),
            ("Telangana", "Telangana"),
            ("Tripura", "Tripura"),
            ("Uttar Pradesh", "Uttar Pradesh"),
            ("Uttarakhand", "Uttarakhand"),
            ("West Bengal", "West Bengal"),
            ("Andaman and Nicobar Islands", "Andaman and Nicobar Islands"),
            ("Chandigarh", "Chandigarh"),
            ("Dadra and Nagar Haveli and Daman and Diu", "Dadra and Nagar Haveli and Daman and Diu"),
            ("Delhi", "Delhi"),
            ("Jammu and Kashmir", "Jammu and Kashmir"),
            ("Ladakh", "Ladakh"),
            ("Lakshadweep", "Lakshadweep"),
            ("Puducherry", "Puducherry"),
        ]

        country = forms.ChoiceField(choices=COUNTRY_CHOICES, required=True)
        state = forms.ChoiceField(choices=STATE_CHOICES, required=False)
        bank_account_details = forms.CharField(
            required=False,
            widget=forms.Textarea(attrs={"rows": 4}),
            help_text="Paste bank account details shown on the bank transfer page."
        )
        upi_id = forms.CharField(
            required=False,
            help_text="UPI ID shown below bank account details on the checkout page."
        )

        class Meta:
            model = InvoiceSellerProfile
            fields = "__all__"

    form = InvoiceSellerProfileForm
    list_display = ("name", "gstin", "state", "state_code", "support_email", "updated_at")
    search_fields = ("name", "gstin", "state", "support_email")


@admin.register(Employee)
class EmployeeAdmin(admin.ModelAdmin):
    search_fields = ("name", "email", "device_id", "pc_name", "org__name")
    list_per_page = 25
    list_filter = (PlanFilter,)
    list_display = ("name", "org", "pc_name", "device_id")


class OrgFilter(SimpleListFilter):
    title = "By org"
    parameter_name = "org_id"

    def lookups(self, request, model_admin):
        org_ids = (
            Screenshot.objects.values_list("employee__org_id", flat=True)
            .distinct()
        )
        orgs = Organization.objects.filter(id__in=list(org_ids)).order_by("name")
        return [(o.id, o.name) for o in orgs]

    def queryset(self, request, queryset):
        org_id = self.value()
        if not org_id:
            return queryset
        return queryset.filter(employee__org_id=org_id)


class EmployeeFilter(SimpleListFilter):
    title = "By employee"
    parameter_name = "employee_id"

    def lookups(self, request, model_admin):
        org_id = request.GET.get("org_id")
        employees = Employee.objects.all()
        if org_id:
            employees = employees.filter(org_id=org_id)
        employees = employees.order_by("name")
        return [(e.id, f"{e.name} ({e.org.name})") for e in employees]

    def queryset(self, request, queryset):
        emp_id = self.value()
        if not emp_id:
            return queryset
        return queryset.filter(employee_id=emp_id)


@admin.register(Screenshot)
class ScreenshotAdmin(admin.ModelAdmin):
    search_fields = ("employee__name", "employee__org__name")
    list_filter = (OrgFilter, EmployeeFilter)
    list_per_page = 25

    def get_queryset(self, request):
        queryset = super().get_queryset(request)
        locked_org_ids = _privacy_locked_org_ids()
        return queryset.exclude(employee__org_id__in=locked_org_ids)


@admin.register(Activity)
class ActivityAdmin(admin.ModelAdmin):
    def get_queryset(self, request):
        queryset = super().get_queryset(request)
        locked_org_ids = _privacy_locked_org_ids()
        return queryset.exclude(employee__org_id__in=locked_org_ids)

admin.site.register(OrganizationSettings)
admin.site.register(DeletedAccount)
admin.site.register(AdminNotification)


def referral_program_view(request):
    if not _is_super_admin_user(request.user):
        messages.error(request, "Access denied.")
        return redirect("/admin/")

    settings_obj = ReferralSettings.get_active()
    if request.method == "POST":
        def parse_decimal(key, default_value):
            try:
                value = Decimal(str(request.POST.get(key, default_value)))
            except (TypeError, ValueError):
                value = Decimal(str(default_value))
            if value < 0:
                value = Decimal("0")
            return value

        settings_obj.commission_rate = parse_decimal("commission_rate", settings_obj.commission_rate or 0)
        settings_obj.dealer_commission_rate = parse_decimal("dealer_commission_rate", settings_obj.dealer_commission_rate or 0)
        settings_obj.dealer_subscription_amount = parse_decimal(
            "dealer_subscription_amount",
            settings_obj.dealer_subscription_amount or 0,
        )
        settings_obj.dealer_referral_flat_amount = parse_decimal(
            "dealer_referral_flat_amount",
            settings_obj.dealer_referral_flat_amount or 0,
        )
        settings_obj.save()
        messages.success(request, "Referral settings updated.")
        return redirect("/admin/referral-program/")

    org_earnings = ReferralEarning.objects.select_related("referrer_org", "referred_org", "transfer").order_by("-created_at")[:200]
    dealer_earnings = DealerReferralEarning.objects.select_related("referrer_dealer", "referred_org", "referred_dealer", "transfer").order_by("-created_at")[:200]
    dealers = DealerAccount.objects.select_related("user", "referred_by").order_by("user__username")

    return TemplateResponse(request, "admin/core/referral_program.html", {
        "settings": settings_obj,
        "org_earnings": org_earnings,
        "dealer_earnings": dealer_earnings,
        "dealers": dealers,
    })


def _inject_referral_urls():
    custom = [
        path(
            "referral-program/",
            admin.site.admin_view(referral_program_view),
            name="referral-program",
        )
    ]
    return custom + admin.sites.AdminSite.get_urls(admin.site)


admin.site.get_urls = _inject_referral_urls


@admin.register(ThemeSettings)
class ThemeSettingsAdmin(admin.ModelAdmin):
    list_display = ("primary_color", "secondary_color")
    formfield_overrides = {
        models.CharField: {"widget": forms.TextInput(attrs={"type": "color"})},
    }

    def has_add_permission(self, request):
        return not ThemeSettings.objects.exists()


@admin.register(ReferralSettings)
class ReferralSettingsAdmin(admin.ModelAdmin):
    list_display = ("commission_rate", "updated_at")

    def has_add_permission(self, request):
        return not ReferralSettings.objects.exists()


@admin.register(ReferralEarning)
class ReferralEarningAdmin(admin.ModelAdmin):
    list_display = (
        "referrer_org",
        "referred_org",
        "commission_amount",
        "status",
        "payout_reference",
        "payout_date",
        "created_at",
    )
    list_editable = ("status", "payout_reference", "payout_date")
    list_filter = ("status",)
    search_fields = ("referrer_org__name", "referred_org__name", "payout_reference")


@admin.register(DealerAccount)
class DealerAccountAdmin(admin.ModelAdmin):
    list_display = (
        "user",
        "referral_code",
        "referred_by",
        "subscription_status",
        "subscription_start",
        "subscription_end",
        "subscription_amount",
    )
    list_filter = ("subscription_status",)
    search_fields = ("user__username", "user__email", "referral_code")

    def save_model(self, request, obj, form, change):
        previous_status = None
        if obj.pk:
            previous_status = DealerAccount.objects.filter(pk=obj.pk).values_list("subscription_status", flat=True).first()
        super().save_model(request, obj, form, change)
        if obj.subscription_status == "active" and previous_status != "active":
            from .referral_utils import record_dealer_referral_flat_earning
            record_dealer_referral_flat_earning(obj)


@admin.register(DealerReferralEarning)
class DealerReferralEarningAdmin(admin.ModelAdmin):
    list_display = (
        "referrer_dealer",
        "referred_org",
        "referred_dealer",
        "commission_amount",
        "flat_amount",
        "status",
        "payout_reference",
        "payout_date",
        "created_at",
    )
    list_editable = ("status", "payout_reference", "payout_date")
    list_filter = ("status",)
    search_fields = (
        "referrer_dealer__user__username",
        "referred_org__name",
        "referred_dealer__user__username",
        "payout_reference",
    )


@admin.register(SupportAccessAuditLog)
class SupportAccessAuditLogAdmin(admin.ModelAdmin):
    list_display = ("organization", "user", "action", "created_at")
    list_filter = ("user",)
    search_fields = ("organization__name", "user__username", "user__email", "action")
    list_per_page = 25

    def get_queryset(self, request):
        SupportAccessAuditLog.prune_old_logs()
        return super().get_queryset(request)


@admin.register(PendingTransfer)
class PendingTransferAdmin(admin.ModelAdmin):
    class TransferCategoryFilter(admin.SimpleListFilter):
        title = "Transfer Category"
        parameter_name = "transfer_category"

        def lookups(self, request, model_admin):
            return (
                ("org", "ORG Transfers"),
                ("dealer", "Dealer Transfers"),
            )

        def queryset(self, request, queryset):
            value = self.value()
            if value == "dealer":
                return queryset.filter(request_type="dealer")
            if value == "org":
                return queryset.exclude(request_type="dealer")
            return queryset

    list_display = (
        "organization_or_user",
        "user",
        "plan",
        "request_type",
        "billing_cycle",
        "amount",
        "reference_no",
        "status",
        "created_at",
    )
    list_filter = ("status", TransferCategoryFilter, "request_type", "billing_cycle")
    search_fields = ("organization__name", "user__username", "user__email", "reference_no")
    actions = ("approve_transfers", "reject_transfers")
    change_list_template = "admin/core/pendingtransfer/change_list.html"

    def organization_or_user(self, obj):
        if obj.organization:
            return obj.organization.name
        if obj.user:
            return obj.user.username
        return "-"

    organization_or_user.short_description = "Organization / Dealer"

    def get_queryset(self, request):
        PendingTransfer.objects.filter(status="draft").delete()
        return super().get_queryset(request).exclude(status="draft")

    def _record_history(self, org, user, plan, status, start_date, end_date, billing_cycle):
        if not plan or not start_date:
            return
        existing = SubscriptionHistory.objects.filter(
            organization=org,
            plan=plan,
            start_date=start_date,
        ).first()
        if existing:
            existing.end_date = end_date
            existing.status = status
            existing.billing_cycle = billing_cycle
            if user:
                existing.user = user
            existing.save()
            return
        SubscriptionHistory.objects.create(
            organization=org,
            user=user,
            plan=plan,
            status=status,
            start_date=start_date,
            end_date=end_date,
            billing_cycle=billing_cycle,
        )

    def _apply_transfer(self, transfer):
        now = timezone.now()
        org = transfer.organization
        submitted_at = transfer.created_at or now

        if transfer.request_type in ("new", "renew") and transfer.plan:
            sub = Subscription.objects.filter(organization=org).first()
            if not sub:
                sub = Subscription(organization=org, user=transfer.user, plan=transfer.plan)
            elif sub.status == "active":
                history_end = now
                if sub.plan_id == transfer.plan_id and sub.end_date:
                    history_end = sub.end_date
                self._record_history(
                    org=org,
                    user=sub.user,
                    plan=sub.plan,
                    status="active",
                    start_date=sub.start_date,
                    end_date=history_end,
                    billing_cycle=sub.billing_cycle,
                )

            start_date = submitted_at
            if (
                transfer.request_type == "renew"
                and sub.plan_id == transfer.plan_id
                and sub.end_date
                and sub.end_date > now
            ):
                start_date = sub.end_date

            duration_months = 12 if transfer.billing_cycle == "yearly" else 1
            end_date = start_date + timedelta(days=30 * duration_months)

            sub.user = transfer.user
            sub.plan = transfer.plan
            sub.status = "active"
            sub.start_date = start_date
            sub.end_date = end_date
            sub.billing_cycle = transfer.billing_cycle
            sub.retention_days = transfer.retention_days or (transfer.plan.retention_days if transfer.plan else 30)
            if transfer.plan and transfer.plan.allow_addons and transfer.addon_count is not None:
                sub.addon_count = transfer.addon_count
            sub.save()

            log_event(
                "subscription_activated",
                status="success",
                org=org,
                user=transfer.user,
                product_slug=getattr(getattr(transfer.plan, "product", None), "slug", ""),
                meta={
                    "subscription_id": sub.id,
                    "plan_id": transfer.plan_id,
                    "billing_cycle": transfer.billing_cycle,
                    "addon_count": transfer.addon_count,
                    "request_type": transfer.request_type,
                    "pendingtransfer_id": transfer.id,
                },
            )

            self._record_history(
                org=org,
                user=transfer.user,
                plan=transfer.plan,
                status="active",
                start_date=start_date,
                end_date=end_date,
                billing_cycle=transfer.billing_cycle,
            )

            settings_obj, _ = OrganizationSettings.objects.get_or_create(organization=org)
            min_interval = transfer.plan.screenshot_min_minutes or 5
            if settings_obj.screenshot_interval_minutes < min_interval:
                settings_obj.screenshot_interval_minutes = min_interval
                settings_obj.save()

        if transfer.request_type == "addon":
            product_slug = getattr(getattr(transfer.plan, "product", None), "slug", "monitor")
            sub_qs = Subscription.objects.filter(organization=org, status__in=("active", "trialing"))
            if product_slug == "monitor":
                sub_qs = sub_qs.filter(Q(plan__product__slug="monitor") | Q(plan__product__isnull=True))
            else:
                sub_qs = sub_qs.filter(plan__product__slug=product_slug)
            sub = sub_qs.order_by("-start_date", "-id").first()
            if sub:
                addon_delta = max(0, transfer.addon_count or 0)
                sub.addon_count = (sub.addon_count or 0) + addon_delta
                sub.addon_proration_amount = transfer.amount or 0
                sub.addon_last_proration_at = transfer.updated_at or now
                sub.save()

        if transfer.request_type == "dealer":
            dealer = DealerAccount.objects.filter(user=transfer.user).first()
            if dealer:
                dealer.subscription_status = "active"
                dealer.subscription_start = submitted_at
                dealer.subscription_end = submitted_at + timedelta(days=365)
                dealer.subscription_amount = transfer.amount or dealer.subscription_amount
                dealer.save()
                from .referral_utils import record_dealer_referral_flat_earning
                record_dealer_referral_flat_earning(dealer)

        if transfer.request_type in ("new", "renew"):
            record_referral_earning(transfer)
            record_dealer_org_referral_earning(transfer)

    def _send_approval_email(self, transfer):
        recipient = ""
        recipient_name = ""
        if transfer.request_type == "dealer":
            recipient = transfer.user.email if transfer.user else ""
            recipient_name = transfer.user.first_name if transfer.user else ""
        else:
            owner = transfer.organization.owner if transfer.organization else None
            recipient = owner.email if owner else (transfer.user.email if transfer.user else "")
            recipient_name = owner.first_name if owner else (transfer.user.first_name if transfer.user else "")
        if not recipient:
            return
        send_templated_email(
            recipient,
            "Bank Transfer Approved",
            "emails/bank_transfer_approved.txt",
            {
                "name": recipient_name or "User",
                "plan_name": transfer.plan.name if transfer.plan else ("Dealer Subscription" if transfer.request_type == "dealer" else "-"),
                "billing_cycle": transfer.billing_cycle or "yearly",
                "currency": transfer.currency or "INR",
                "amount": transfer.amount or 0,
                "reference_no": transfer.reference_no or "-",
            },
        )

    def save_model(self, request, obj, form, change):
        prev_status = None
        if change and obj.pk:
            prev_status = PendingTransfer.objects.filter(pk=obj.pk).values_list("status", flat=True).first()
        super().save_model(request, obj, form, change)
        if prev_status != "approved" and obj.status == "approved":
            self._apply_transfer(obj)
            self._send_approval_email(obj)

    def _revert_transfer(self, transfer, decision_time=None):
        revert_transfer_subscription(transfer, decision_time=decision_time)

    def approve_transfers(self, request, queryset):
        for transfer in queryset:
            if transfer.status == "approved":
                continue
            self._apply_transfer(transfer)
            transfer.status = "approved"
            transfer.save()
            self._send_approval_email(transfer)
            log_event(
                "transfer_approved",
                status="approved",
                org=transfer.organization,
                user=transfer.user,
                product_slug=getattr(getattr(transfer.plan, "product", None), "slug", ""),
                meta={
                    "pendingtransfer_id": transfer.id,
                    "amount": transfer.amount,
                    "billing_cycle": transfer.billing_cycle,
                    "addon_count": transfer.addon_count,
                    "request_type": transfer.request_type,
                },
            )

        self.message_user(request, "Selected transfers approved.")

    def reject_transfers(self, request, queryset):
        for transfer in queryset:
            if transfer.status == "approved":
                self._revert_transfer(transfer)
            transfer.status = "rejected"
            transfer.save()
            log_event(
                "transfer_rejected",
                status="rejected",
                org=transfer.organization,
                user=transfer.user,
                product_slug=getattr(getattr(transfer.plan, "product", None), "slug", ""),
                meta={
                    "pendingtransfer_id": transfer.id,
                    "amount": transfer.amount,
                    "billing_cycle": transfer.billing_cycle,
                    "addon_count": transfer.addon_count,
                    "request_type": transfer.request_type,
                },
            )
        self.message_user(request, "Selected transfers rejected.")

    def save_model(self, request, obj, form, change):
        previous_status = None
        previous_updated_at = None
        if obj.pk:
            previous_row = PendingTransfer.objects.filter(pk=obj.pk).values_list("status", "updated_at").first()
            if previous_row:
                previous_status, previous_updated_at = previous_row
        super().save_model(request, obj, form, change)
        if obj.status == "approved" and previous_status != "approved":
            self._apply_transfer(obj)
            log_event(
                "transfer_approved",
                status="approved",
                org=obj.organization,
                user=obj.user,
                product_slug=getattr(getattr(obj.plan, "product", None), "slug", ""),
                meta={
                    "pendingtransfer_id": obj.id,
                    "amount": obj.amount,
                    "billing_cycle": obj.billing_cycle,
                    "addon_count": obj.addon_count,
                    "request_type": obj.request_type,
                },
                request=request,
            )
        if obj.status == "rejected" and previous_status == "approved":
            self._revert_transfer(obj, decision_time=previous_updated_at)
        if obj.status == "rejected" and previous_status != "rejected":
            log_event(
                "transfer_rejected",
                status="rejected",
                org=obj.organization,
                user=obj.user,
                product_slug=getattr(getattr(obj.plan, "product", None), "slug", ""),
                meta={
                    "pendingtransfer_id": obj.id,
                    "amount": obj.amount,
                    "billing_cycle": obj.billing_cycle,
                    "addon_count": obj.addon_count,
                    "request_type": obj.request_type,
                },
                request=request,
            )

    approve_transfers.short_description = "Activate selected transfers"
    reject_transfers.short_description = "Reject selected transfers"


def _is_super_admin_user(user):
    if not user or not getattr(user, "is_authenticated", False):
        return False
    if user.is_superuser:
        return True
    profile = UserProfile.objects.filter(user=user).first()
    return bool(profile and profile.role in ("superadmin", "super_admin"))


def _format_duration_compact(seconds):
    seconds = int(max(0, seconds or 0))
    hours = seconds // 3600
    minutes = (seconds % 3600) // 60
    if hours:
        return f"{hours}h {minutes}m"
    return f"{minutes}m"


@admin.register(ChatWidget)
class ChatWidgetAdmin(admin.ModelAdmin):
    list_display = ("name", "organization", "widget_key", "public_chat_code", "theme_preset", "is_active", "created_at")
    search_fields = ("name", "organization__name", "widget_key", "public_chat_code")
    list_filter = ("is_active", "product_slug")


@admin.register(ChatConversation)
class ChatConversationAdmin(admin.ModelAdmin):
    list_display = ("widget", "organization", "visitor_id", "status", "last_message_at", "created_at")
    search_fields = ("visitor_id", "organization__name", "widget__name")
    list_filter = ("status", "widget")


@admin.register(ChatMessage)
class ChatMessageAdmin(admin.ModelAdmin):
    list_display = ("conversation", "sender_type", "sender_user", "created_at")
    search_fields = ("conversation__visitor_id", "text")
    list_filter = ("sender_type",)


@admin.register(ChatLead)
class ChatLeadAdmin(admin.ModelAdmin):
    list_display = ("name", "phone", "email", "organization", "widget", "created_at")
    search_fields = ("name", "phone", "email", "visitor_id")
    list_filter = ("organization", "widget")


@admin.register(ChatEnquiryLead)
class ChatEnquiryLeadAdmin(admin.ModelAdmin):
    list_display = ("name", "email", "phone", "organization", "widget", "status", "created_at")
    search_fields = ("name", "email", "phone", "site_domain")
    list_filter = ("status", "organization", "widget")


@admin.register(AiUsageCounter)
class AiUsageCounterAdmin(admin.ModelAdmin):
    list_display = ("organization", "product_slug", "period_yyyymm", "ai_replies_used")
    search_fields = ("organization__name", "period_yyyymm")
    list_filter = ("product_slug",)


@admin.register(AiUsageMonthly)
class AiUsageMonthlyAdmin(admin.ModelAdmin):
    list_display = ("organization", "product_slug", "period_yyyymm", "ai_replies_used", "tokens_total", "cost_usd_total", "updated_at")
    search_fields = ("organization__name", "period_yyyymm")
    list_filter = ("product_slug", "period_yyyymm")


def _privacy_locked_org_ids():
    return CompanyPrivacySettings.objects.filter(
        monitoring_mode="privacy_lock"
    ).values_list("organization_id", flat=True)


def support_access_view(request):
    if not _is_super_admin_user(request.user):
        messages.error(request, "Access denied.")
        return redirect("/admin/")

    now = timezone.now()
    privacy_settings = (
        CompanyPrivacySettings.objects
        .select_related("organization", "organization__owner")
        .filter(monitoring_mode="privacy_lock", support_access_enabled_until__gt=now)
    )

    rows = []
    for setting in privacy_settings:
        org = setting.organization
        owner = org.owner
        admin_name = "-"
        admin_email = ""
        if owner:
            admin_name = owner.get_full_name() or owner.username
            admin_email = owner.email or ""
        approved_seconds = None
        if setting.support_access_duration_hours:
            approved_seconds = setting.support_access_duration_hours * 3600
        elif setting.support_access_enabled_until and setting.updated_at:
            approved_seconds = (setting.support_access_enabled_until - setting.updated_at).total_seconds()
        rows.append({
            "org_id": org.id,
            "company_name": org.name,
            "admin_name": admin_name,
            "admin_email": admin_email,
            "monitoring_mode": setting.get_monitoring_mode_display(),
            "support_access_until": setting.support_access_enabled_until,
            "approved_duration": _format_duration_compact(approved_seconds) if approved_seconds else "-",
        })

    rows.sort(key=lambda item: item["company_name"].lower())

    context = {
        **admin.site.each_context(request),
        "title": "Support Access",
        "rows": rows,
    }
    return TemplateResponse(request, "admin/support_access.html", context)


def _inject_support_access_link(app_list):
    for app in app_list:
        if app.get("app_label") == "core":
            app["models"].append({
                "name": "Support Access",
                "object_name": "SupportAccess",
                "admin_url": "/admin/support-access/",
                "add_url": None,
                "view_only": True,
            })
            return app_list
    app_list.append({
        "name": "Support Access",
        "app_label": "support_access",
        "app_url": "/admin/support-access/",
        "has_module_perms": True,
        "models": [
            {
                "name": "Support Access",
                "object_name": "SupportAccess",
                "admin_url": "/admin/support-access/",
                "add_url": None,
                "view_only": True,
            }
        ],
    })
    return app_list


_original_get_urls = admin.site.get_urls


def _get_admin_urls():
    urls = _original_get_urls()
    custom = [
        path("support-access/", admin.site.admin_view(support_access_view), name="support_access"),
        path("monitor-products/", monitor_products_hub, name="monitor_product_hub"),
        path("worksuite-products/", monitor_products_hub, name="worksuite_product_hub"),
    ]
    return custom + urls


admin.site.get_urls = _get_admin_urls

_original_get_app_list = admin.site.get_app_list


_PRODUCT_ADMIN_APP_LABELS = {
    "monitor": {"core", "common_auth"},
}
_ALL_PRODUCTS_APP_LABELS = {"auth", "common_auth", "core", "saas_admin"}


def _get_selected_admin_product(request):
    selected = request.GET.get("product")
    if selected:
        if selected == "all":
            request.session.pop("admin_product", None)
            selected = None
        else:
            request.session["admin_product"] = selected
    else:
        selected = request.session.get("admin_product")
    setattr(request, "admin_product", selected)
    return selected


def _filter_app_list_by_product(app_list, product_slug):
    if not product_slug:
        return [app for app in app_list if app.get("app_label") in _ALL_PRODUCTS_APP_LABELS]
    allowed = _PRODUCT_ADMIN_APP_LABELS.get(product_slug)
    if not allowed:
        return []
    return [app for app in app_list if app.get("app_label") in allowed]


def _get_app_list(request, app_label=None):
    app_list = _original_get_app_list(request, app_label)
    if app_label:
        return app_list
    if _is_super_admin_user(request.user):
        app_list = _inject_support_access_link(app_list)
    from apps.backend.core_platform.admin_grouping import build_grouped_admin_app_list
    return build_grouped_admin_app_list(app_list)


admin.site.get_app_list = _get_app_list
