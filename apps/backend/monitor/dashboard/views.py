from django.shortcuts import render, redirect, get_object_or_404
from django.contrib.auth.decorators import login_required
from django.http import JsonResponse, HttpResponse, FileResponse, HttpResponseForbidden, Http404
from django.utils.decorators import method_decorator
from django.views import View
import json
import mimetypes
import os
from core.models import Organization, Employee, Activity, Screenshot, UserProfile, Plan, Subscription, SubscriptionHistory, OrganizationSettings, CompanyPrivacySettings, SupportAccessAuditLog, AdminActivity, PendingTransfer, InvoiceSellerProfile, log_admin_activity, DealerAccount
from core.subscription_utils import (
    get_free_trial_end_date,
    is_free_plan as is_free_plan_util,
    is_subscription_active as is_subscription_active_util,
    maybe_expire_subscription,
    normalize_subscription_end_date,
    revert_transfer_subscription,
)
from core.referral_utils import record_referral_earning, record_dealer_org_referral_earning
from core.email_utils import send_templated_email
import csv
from reportlab.pdfgen import canvas
from django.contrib import messages
from django.db import models
from django.db.models.functions import Coalesce, TruncDate
from django.utils import timezone
from django.utils.dateparse import parse_date
from django.contrib.auth import update_session_auth_hash
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError
from datetime import timedelta
import datetime
from collections import defaultdict
from types import SimpleNamespace


GAMING_OTT_URL_KEYWORDS = [
    "netflix.com", "primevideo.com", "hotstar.com", "disneyplus.com",
    "zee5.com", "sonyliv.com", "voot.com", "aha.video",
    "jiocinema.com", "mxplayer.in", "hulu.com", "hbomax.com",
    "paramountplus.com", "peacocktv.com",
    "youtube.com", "youtu.be", "twitch.tv",
    "crazygames.com", "poki.com", "miniclip.com", "y8.com",
    "kongregate.com", "addictinggames.com", "coolmathgames.com",
    "friv.com", "armorgames.com", "newgrounds.com", "kizi.com",
    "itch.io", "roblox.com", "steamcommunity.com", "store.steampowered.com",
    "epicgames.com", "battle.net",
]
GAMING_OTT_TITLE_KEYWORDS = [
    "netflix", "prime video", "hotstar", "disney+",
    "zee5", "sonyliv", "voot", "aha", "jiocinema", "mx player",
    "hulu", "hbo max", "paramount+", "paramount plus", "peacock",
    "youtube", "twitch",
    "crazygames", "poki", "miniclip", "y8", "kongregate",
    "addicting games", "coolmath games", "friv", "armor games",
    "newgrounds", "kizi", "itch.io", "roblox",
]


def build_gaming_ott_query():
    keyword_q = models.Q()
    for keyword in GAMING_OTT_URL_KEYWORDS:
        keyword_q |= models.Q(url__icontains=keyword)
    for keyword in GAMING_OTT_TITLE_KEYWORDS:
        keyword_q |= models.Q(window_title__icontains=keyword)
    return keyword_q


# =====================================================
#  SAFE PROFILE GETTER (AUTO CREATES IF MISSING)
# =====================================================
def get_profile(user):
    profile, created = UserProfile.objects.get_or_create(
        user=user,
        defaults={"role": "company_admin"}   # default role
    )
    return profile


def is_super_admin_user(user):
    profile = get_profile(user)
    return user.is_superuser or profile.role in ("superadmin", "super_admin")


def get_company_privacy_settings(org):
    if not org:
        return None
    return CompanyPrivacySettings.objects.filter(organization=org).first()


def has_active_support_access(privacy_settings, now=None):
    if not privacy_settings or not privacy_settings.support_access_enabled_until:
        return False
    current = now or timezone.now()
    return current < privacy_settings.support_access_enabled_until


def can_super_admin_access_company(user, org):
    if not is_super_admin_user(user):
        return False
    privacy_settings = get_company_privacy_settings(org)
    if privacy_settings and privacy_settings.monitoring_mode == "privacy_lock":
        return has_active_support_access(privacy_settings)
    return True


def format_duration_compact(seconds):
    seconds = int(max(0, seconds or 0))
    hours = seconds // 3600
    minutes = (seconds % 3600) // 60
    if hours:
        return f"{hours}h {minutes}m"
    return f"{minutes}m"


def _can_view_screenshot(request, screenshot):
    if is_super_admin_user(request.user):
        return False
    org = get_active_org(request)
    return bool(org and screenshot.employee.org_id == org.id)


def _serve_screenshot_file(screenshot):
    if not screenshot.image:
        raise Http404
    try:
        image_file = screenshot.image.open("rb")
    except OSError:
        raise Http404
    content_type, _ = mimetypes.guess_type(screenshot.image.name or "")
    return FileResponse(image_file, content_type=content_type or "application/octet-stream")


# =====================================================
#  GET ACTIVE ORGANIZATION (SESSION + ROLE LOGIC)
# =====================================================
def get_active_org(request):
    profile = get_profile(request.user)

    # SUPER ADMIN ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¾ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ Uses session selection
    if is_super_admin_user(request.user):
        org_id = request.session.get("active_org_id")
        if not org_id:
            return None
        org = Organization.objects.filter(id=org_id).first()
        if not org:
            return None
        if not can_super_admin_access_company(request.user, org):
            return None
        return org

    # COMPANY ADMIN ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¾ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ Always locked to own org
    if profile.role == "hr_view":
        return profile.organization

    if profile.role == "company_admin":
        if profile.organization_id:
            return profile.organization
        return Organization.objects.filter(owner=request.user).first()

    if profile.organization_id:
        return profile.organization

    owned_org = Organization.objects.filter(owner=request.user).first()
    if owned_org:
        return owned_org

    sub = Subscription.objects.filter(user=request.user).order_by("-start_date").first()
    if sub and sub.organization:
        return sub.organization

    return None


def get_active_subscription(org):
    sub = (
        Subscription.objects.filter(organization=org, status__in=("active", "trialing"))
        .order_by("-start_date")
        .first()
    )
    if not sub:
        return None
    normalize_subscription_end_date(sub)
    if not is_subscription_active(sub):
        maybe_expire_subscription(sub)
        return None
    return sub


def record_subscription_history(org, user, plan, status, start_date, end_date, billing_cycle):
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
        return existing
    return SubscriptionHistory.objects.create(
        organization=org,
        user=user,
        plan=plan,
        status=status,
        start_date=start_date,
        end_date=end_date,
        billing_cycle=billing_cycle,
    )


def ensure_active_subscription(org):
    sub = Subscription.objects.filter(organization=org).first()
    if sub and sub.status == "active":
        normalize_subscription_end_date(sub)
        if is_subscription_active(sub):
            return sub
        maybe_expire_subscription(sub)
    latest_decision = PendingTransfer.objects.filter(
        organization=org,
        status__in=("approved", "rejected"),
        request_type__in=("new", "renew"),
    ).order_by("-updated_at").first()
    if latest_decision and latest_decision.status != "approved":
        return sub
    latest_approved = PendingTransfer.objects.filter(
        organization=org,
        status="approved",
        request_type__in=("new", "renew"),
    ).order_by("-updated_at").first()
    if not latest_approved or not latest_approved.plan:
        return sub
    start_date = latest_approved.updated_at or timezone.now()
    duration_months = 12 if latest_approved.billing_cycle == "yearly" else 1
    end_date = start_date + timedelta(days=30 * duration_months)
    retention_days = latest_approved.retention_days or (latest_approved.plan.retention_days if latest_approved.plan else 30)
    if sub:
        sub.user = latest_approved.user
        sub.plan = latest_approved.plan
        sub.status = "active"
        sub.start_date = start_date
        sub.end_date = end_date
        sub.billing_cycle = latest_approved.billing_cycle
        sub.retention_days = retention_days
        if latest_approved.plan and latest_approved.plan.allow_addons and latest_approved.addon_count is not None:
            sub.addon_count = latest_approved.addon_count
        sub.save()
    else:
        sub = Subscription.objects.create(
            user=latest_approved.user,
            organization=org,
            plan=latest_approved.plan,
            status="active",
            start_date=start_date,
            end_date=end_date,
            billing_cycle=latest_approved.billing_cycle,
            retention_days=retention_days,
            addon_count=latest_approved.addon_count or 0,
        )
    record_subscription_history(
        org=org,
        user=latest_approved.user,
        plan=latest_approved.plan,
        status="active",
        start_date=start_date,
        end_date=end_date,
        billing_cycle=latest_approved.billing_cycle,
    )
    return sub


def is_subscription_active(sub):
    return is_subscription_active_util(sub)


def get_plan_amount(plan, billing_cycle, currency="INR"):
    if not plan:
        return 0
    if currency == "USD":
        return plan.usd_yearly_price if billing_cycle == "yearly" else plan.usd_monthly_price
    return plan.yearly_price if billing_cycle == "yearly" else plan.monthly_price


def is_free_plan(plan):
    return is_free_plan_util(plan)


# =====================================================
#  SELECT ORGANIZATION (VERY IMPORTANT)
# =====================================================
@login_required
def select_organization(request):
    return redirect("/app/")


# =====================================================
#  DASHBOARD HOME
# =====================================================
@login_required
def dashboard_home(request):
    org = get_active_org(request)
    if not org:
        return redirect("/select-organization/")

    employees = Employee.objects.filter(org=org)
    activities = Activity.objects.filter(employee__org=org)
    screenshots = Screenshot.objects.filter(employee__org=org)
    active_sub = get_active_subscription(org)
    settings_obj, _ = OrganizationSettings.objects.get_or_create(organization=org)

    # Stats
    total_employees = employees.count()
    total_screenshots = screenshots.count()
    total_activities = activities.count()

    # Online employees (last 2 mins)
    from django.utils import timezone
    from datetime import timedelta

    online_employees = 0
    for e in employees:
        if e.last_seen and timezone.now() - e.last_seen < timedelta(minutes=2):
            online_employees += 1

    # Chart Data - Last 7 days activity count
    chart_labels = []
    chart_values = []

    from datetime import datetime, timedelta
    today = timezone.now()

    for i in range(7):
        day = today - timedelta(days=i)
        count = Activity.objects.filter(
            employee__org=org,
            start_time__date=day.date()
        ).count()

        chart_labels.append(day.strftime("%d %b"))
        chart_values.append(count)

    chart_labels.reverse()
    chart_values.reverse()

    # Top applications
    top_apps = (
        Activity.objects
        .filter(employee__org=org)
        .values("app_name")
        .order_by()
        .annotate(count=models.Count("app_name"))
        .order_by("-count")[:5]
    )

    # Alert on gaming/OTT usage during work hours.
    alert_rows = []
    now_local = timezone.localtime(timezone.now())
    work_start = now_local.replace(hour=9, minute=0, second=0, microsecond=0)
    work_end = now_local.replace(hour=18, minute=0, second=0, microsecond=0)
    keyword_q = build_gaming_ott_query()
    alert_activities = (
        Activity.objects
        .filter(employee__org=org)
        .annotate(activity_time=Coalesce("end_time", "start_time"))
        .filter(activity_time__range=(work_start, work_end))
        .filter(keyword_q)
        .select_related("employee")
        .order_by("-activity_time")[:10]
    )
    for act in alert_activities:
        activity_time = getattr(act, "activity_time", None) or act.end_time or act.start_time
        label = (act.url or act.window_title or act.app_name or "").strip() or act.app_name
        alert_rows.append({
            "employee": act.employee.name,
            "app": label,
            "time": timezone.localtime(activity_time).strftime("%H:%M:%S") if activity_time else "-",
        })

    return render(request, "dashboard/home.html", {
        "org": org,
        "employees": total_employees,
        "screenshots": total_screenshots,
        "activities": total_activities,
        "online": online_employees,
        "chart_labels": chart_labels,
        "chart_values": chart_values,
        "top_apps": top_apps,
        "active_sub": active_sub,
        "settings_obj": settings_obj,
        "recent_admin_actions": AdminActivity.objects.filter(user=request.user).order_by("-created_at")[:100],
        "usage_alerts": alert_rows,
        "work_hours_label": "09:00 - 18:00",
    })


class SuperAdminUserDashboardAccessView(View):
    @method_decorator(login_required)
    def get(self, request):
        if not is_super_admin_user(request.user):
            messages.error(request, "Access denied.")
            return redirect("/dashboard/")

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
                "approved_duration": format_duration_compact(approved_seconds) if approved_seconds else "-",
            })

        rows.sort(key=lambda item: item["company_name"].lower())

        return render(request, "super_admin/user_dashboard_access.html", {
            "rows": rows,
        })


@login_required
def super_admin_open_company_dashboard(request, org_id):
    if not is_super_admin_user(request.user):
        messages.error(request, "Access denied.")
        return redirect("/dashboard/")

    org = get_object_or_404(Organization, id=org_id)
    SupportAccessAuditLog.prune_old_logs()
    next_url = request.GET.get("next")
    if not next_url or not next_url.startswith("/"):
        next_url = request.META.get("HTTP_REFERER") or "/super-admin/user-dashboard-access/"
    privacy_settings = get_company_privacy_settings(org)
    is_active = has_active_support_access(privacy_settings)
    if not (privacy_settings and privacy_settings.monitoring_mode == "privacy_lock"):
        is_active = False

    details = {
        "company_id": org.id,
        "company_name": org.name,
        "accessed_at": timezone.now().isoformat(),
        "super_admin_user_id": request.user.id,
    }
    if not is_active:
        SupportAccessAuditLog.objects.create(
            organization=org,
            user=request.user,
            action="SUPER_ADMIN_ACCESS_DENIED_EXPIRED_SUPPORT",
            details=json.dumps(details),
        )
        messages.error(request, "Access denied. Temporary support access has expired for this company.")
        return redirect(next_url)

    SupportAccessAuditLog.objects.create(
        organization=org,
        user=request.user,
        action="SUPER_ADMIN_ENTERED_COMPANY_DASHBOARD",
        details=json.dumps(details),
    )
    request.session["active_org_id"] = org.id
    return redirect("/dashboard/")



# =====================================================
#  EMPLOYEE LIST
# =====================================================
@login_required
def employee_list(request):
    org = get_active_org(request)
    if not org:
        return redirect("/select-organization/")

    query = request.GET.get("q", "").strip()
    employees = Employee.objects.filter(org=org)
    if query:
        employees = employees.filter(
            models.Q(name__icontains=query) |
            models.Q(email__icontains=query) |
            models.Q(device_id__icontains=query) |
            models.Q(pc_name__icontains=query)
        )
    employees = employees.order_by("id")
    sub = get_active_subscription(org)
    settings_obj, _ = OrganizationSettings.objects.get_or_create(organization=org)
    allowed_intervals = [1, 2, 3, 5, 10, 15, 20, 30]
    min_interval = sub.plan.screenshot_min_minutes if sub and sub.plan else None
    if min_interval:
        allowed_intervals = [i for i in allowed_intervals if i >= min_interval]
    employee_limit = sub.plan.employee_limit if sub and sub.plan else 0
    addon_count = sub.addon_count if sub else 0
    if employee_limit != 0:
        employee_limit = employee_limit + addon_count
    employee_count = Employee.objects.filter(org=org).count()
    if employee_limit == 0:
        can_add = is_subscription_active(sub)
    else:
        can_add = is_subscription_active(sub) and employee_count < employee_limit

    if request.method == "POST":
        action = request.POST.get("action")
        if action == "update_interval":
            interval = request.POST.get("screenshot_interval_minutes")
            try:
                interval_val = int(interval)
            except (TypeError, ValueError):
                interval_val = None

            if interval_val in allowed_intervals:
                settings_obj.screenshot_interval_minutes = interval_val
                settings_obj.save()
                messages.success(request, "Screenshot interval updated.")
            else:
                messages.error(request, "Invalid interval selected.")
            return redirect("/dashboard/employees/")

    return render(request, "dashboard/employees.html", {
        "employees": employees,
        "employee_limit": employee_limit,
        "employee_count": employee_count,
        "can_add": can_add,
        "sub": sub,
        "org": org,
        "search_query": query,
        "settings_obj": settings_obj,
        "allowed_intervals": allowed_intervals,
    })


# =====================================================
#  LIVE ACTIVITY PAGE
# =====================================================
@login_required
def activity_view(request):
    org = get_active_org(request)
    if not org:
        return redirect("/select-organization/")

    employees = Employee.objects.filter(org=org).order_by("name")
    selected_employee = None
    selected_employee_id = request.GET.get("employee_id")
    if selected_employee_id:
        selected_employee = Employee.objects.filter(
            id=selected_employee_id,
            org=org
        ).first()

    logs = Activity.objects.filter(employee__org=org).order_by('-start_time')

    return render(request, "dashboard/activity.html", {
        "logs": logs,
        "employees": employees,
        "selected_employee": selected_employee,
        "org": org
    })


# =====================================================
#  SCREENSHOT VIEW
# =====================================================
@login_required
def screenshot_view(request):
    org = get_active_org(request)
    if not org:
        return redirect("/select-organization/")

    employees = Employee.objects.filter(org=org).order_by("name")
    selected_employee = None
    selected_employee_id = request.GET.get("employee_id")

    if selected_employee_id:
        selected_employee = Employee.objects.filter(
            id=selected_employee_id,
            org=org
        ).first()

    available_shots = Screenshot.objects.filter(employee__org=org)
    if selected_employee:
        available_shots = available_shots.filter(employee=selected_employee)
    available_dates = list(
        available_shots
        .annotate(display_time=Coalesce("pc_captured_at", "captured_at"))
        .annotate(day=TruncDate("display_time", tzinfo=timezone.get_current_timezone()))
        .values_list("day", flat=True)
        .distinct()
        .order_by("day")
    )
    available_dates = [d.isoformat() for d in available_dates if d]

    shots = Screenshot.objects.filter(employee__org=org)
    if selected_employee:
        shots = shots.filter(employee=selected_employee)
    date_from_raw = request.GET.get("date_from")
    date_to_raw = request.GET.get("date_to")
    preset = request.GET.get("preset")
    allowed_presets = {"today", "yesterday", "all"}
    if preset not in allowed_presets:
        preset = None

    if not preset and not date_from_raw and not date_to_raw:
        preset = "today"

    if preset == "today":
        today = timezone.localdate()
        iso_day = today.isoformat()
        date_from_raw = iso_day
        date_to_raw = iso_day
    elif preset == "yesterday":
        day = timezone.localdate() - timedelta(days=1)
        iso_day = day.isoformat()
        date_from_raw = iso_day
        date_to_raw = iso_day
    elif preset == "all":
        date_from_raw = None
        date_to_raw = None

    active_preset = preset

    def parse_date_flexible(value):
        if not value:
            return None, ""
        parsed = parse_date(value)
        if parsed:
            return parsed, parsed.isoformat()
        for fmt in ("%d-%m-%Y", "%d/%m/%Y"):
            try:
                parsed = datetime.datetime.strptime(value, fmt).date()
                return parsed, parsed.isoformat()
            except ValueError:
                continue
        return None, ""


    shots = shots.annotate(display_time=Coalesce("pc_captured_at", "captured_at"))

    date_from, date_from_value = parse_date_flexible(date_from_raw)
    date_to, date_to_value = parse_date_flexible(date_to_raw)
    if date_from or date_to:
        if not date_from:
            date_from = date_to
        if not date_to:
            date_to = date_from
        if date_from and not date_from_value:
            date_from_value = date_from.isoformat()
        if date_to and not date_to_value:
            date_to_value = date_to.isoformat()
        start_dt = timezone.make_aware(
            datetime.datetime.combine(date_from, datetime.time.min),
            timezone.get_current_timezone(),
        )
        end_dt = timezone.make_aware(
            datetime.datetime.combine(date_to, datetime.time.max),
            timezone.get_current_timezone(),
        )
        date_window = (start_dt, end_dt)
        shots = shots.filter(display_time__range=date_window)
    shots = shots.order_by('-display_time')

    from django.core.paginator import Paginator
    paginator = Paginator(shots, 20)
    page = request.GET.get("page")
    shots = paginator.get_page(page)

    now = timezone.now()
    for e in employees:
        if not e.last_seen:
            e.status = "Offline"
        else:
            delta = now - e.last_seen
            if delta <= timedelta(minutes=2):
                e.status = "Online"
            elif delta <= timedelta(minutes=10):
                e.status = "Ideal"
            else:
                e.status = "Offline"

    return render(request, "dashboard/screenshots.html", {
        "shots": shots,
        "org": org,
        "employees": employees,
        "selected_employee": selected_employee,
        "date_from": date_from_value,
        "date_to": date_to_value,
        "active_preset": active_preset or "",
        "available_dates": available_dates,
    })


@login_required
def screenshot_image_view(request, shot_id):
    shot = get_object_or_404(
        Screenshot.objects.select_related("employee__org"),
        id=shot_id
    )
    if not _can_view_screenshot(request, shot):
        return HttpResponseForbidden("Access denied.")
    return _serve_screenshot_file(shot)


@login_required
def protected_screenshot_media(request, file_path):
    normalized = os.path.normpath(file_path).replace("\\", "/")
    if normalized.startswith("../") or normalized.startswith("..") or normalized.startswith("/"):
        return HttpResponseForbidden("Access denied.")
    if normalized in (".", ""):
        raise Http404
    image_name = f"screenshots/{normalized}"
    shot = (
        Screenshot.objects
        .select_related("employee__org")
        .filter(image=image_name)
        .first()
    )
    if not shot:
        raise Http404
    if not _can_view_screenshot(request, shot):
        return HttpResponseForbidden("Access denied.")
    return _serve_screenshot_file(shot)


@login_required
def app_usage_view(request):
    org = get_active_org(request)
    if not org:
        return redirect("/select-organization/")

    sub = get_active_subscription(org)
    if not (sub and sub.plan and sub.plan.allow_gaming_ott_usage):
        messages.error(request, "Gaming / OTT Usage is not enabled for your current plan.")
        return redirect("/dashboard/")

    now = timezone.now()
    cutoff = now - timedelta(days=30)
    Activity.objects.filter(employee__org=org, end_time__lt=cutoff).delete()

    employees = Employee.objects.filter(org=org).order_by("name")
    selected_employee = None
    selected_employee_id = request.GET.get("employee_id")
    if selected_employee_id:
        selected_employee = Employee.objects.filter(
            id=selected_employee_id,
            org=org
        ).first()

    available_activities = Activity.objects.filter(employee__org=org)
    if selected_employee:
        available_activities = available_activities.filter(employee=selected_employee)
    available_dates = list(
        available_activities
        .annotate(activity_time=Coalesce("end_time", "start_time"))
        .annotate(day=TruncDate("activity_time", tzinfo=timezone.get_current_timezone()))
        .values_list("day", flat=True)
        .distinct()
        .order_by("day")
    )
    available_dates = [d.isoformat() for d in available_dates if d]

    date_from_raw = request.GET.get("date_from")
    date_to_raw = request.GET.get("date_to")
    preset = request.GET.get("preset")
    allowed_presets = {"today", "yesterday", "all"}
    if preset not in allowed_presets:
        preset = None

    if not preset and not date_from_raw and not date_to_raw:
        preset = "today"

    if preset == "today":
        today = timezone.localdate()
        iso_day = today.isoformat()
        date_from_raw = iso_day
        date_to_raw = iso_day
    elif preset == "yesterday":
        day = timezone.localdate() - timedelta(days=1)
        iso_day = day.isoformat()
        date_from_raw = iso_day
        date_to_raw = iso_day
    elif preset == "all":
        date_from_raw = None
        date_to_raw = None

    active_preset = preset

    def parse_date_flexible(value):
        if not value:
            return None, ""
        parsed = parse_date(value)
        if parsed:
            return parsed, parsed.isoformat()
        for fmt in ("%d-%m-%Y", "%d/%m/%Y"):
            try:
                parsed = datetime.datetime.strptime(value, fmt).date()
                return parsed, parsed.isoformat()
            except ValueError:
                continue
        return None, ""

    date_from, date_from_value = parse_date_flexible(date_from_raw)
    date_to, date_to_value = parse_date_flexible(date_to_raw)

    activities = Activity.objects.filter(employee__org=org)
    if selected_employee:
        activities = activities.filter(employee=selected_employee)
    if date_from or date_to:
        if not date_from:
            date_from = date_to
        if not date_to:
            date_to = date_from
        if date_from and not date_from_value:
            date_from_value = date_from.isoformat()
        if date_to and not date_to_value:
            date_to_value = date_to.isoformat()
        start_dt = timezone.make_aware(
            datetime.datetime.combine(date_from, datetime.time.min),
            timezone.get_current_timezone(),
        )
        end_dt = timezone.make_aware(
            datetime.datetime.combine(date_to, datetime.time.max),
            timezone.get_current_timezone(),
        )
        date_window = (start_dt, end_dt)
        activities = activities.filter(
            models.Q(end_time__range=date_window) |
            models.Q(start_time__range=date_window)
        )

    app_stats = {}
    total_seconds = 0
    app_urls = {}
    app_url_time = {}
    default_interval = 10
    browser_apps = {"chrome.exe", "msedge.exe", "brave.exe"}
    def simplify_title(title):
        if not title:
            return ""
        return title.split(" - ")[0].strip()
    for act in activities:
        start = act.start_time or act.end_time
        end = act.end_time or act.start_time
        if not start or not end:
            continue
        delta = (end - start).total_seconds()
        if delta <= 0:
            delta = default_interval
        key = act.app_name or "Unknown"
        if key.lower() in ("system idle process", "system idle process.exe"):
            continue
        total_seconds += delta
        app_stats[key] = app_stats.get(key, 0) + delta
        if act.url:
            last_time = app_url_time.get(key)
            if not last_time or end > last_time:
                app_urls[key] = act.url
                app_url_time[key] = end
        elif key.lower() in browser_apps and act.window_title:
            last_time = app_url_time.get(key)
            if not last_time or end > last_time:
                app_urls[key] = simplify_title(act.window_title)
                app_url_time[key] = end

    def format_seconds(seconds):
        seconds = int(seconds or 0)
        hours = seconds // 3600
        minutes = (seconds % 3600) // 60
        secs = seconds % 60
        if hours:
            return f"{hours}h {minutes}m"
        if minutes:
            return f"{minutes}m {secs}s"
        return f"{secs}s"

    app_rows = []
    for name, secs in sorted(app_stats.items(), key=lambda x: x[1], reverse=True):
        percent = round((secs / total_seconds) * 100, 1) if total_seconds else 0
        app_rows.append({
            "name": name,
            "seconds": secs,
            "duration": format_seconds(secs),
            "percent": percent,
            "url": app_urls.get(name, "-"),
        })

    for e in employees:
        if not e.last_seen:
            e.status = "Offline"
        else:
            delta = now - e.last_seen
            if delta <= timedelta(minutes=2):
                e.status = "Online"
            elif delta <= timedelta(minutes=10):
                e.status = "Ideal"
            else:
                e.status = "Offline"

    return render(request, "dashboard/app_usage.html", {
        "org": org,
        "employees": employees,
        "selected_employee": selected_employee,
        "app_rows": app_rows,
        "total_time": format_seconds(total_seconds),
        "date_from": date_from_value,
        "date_to": date_to_value,
        "active_preset": active_preset or "",
        "available_dates": available_dates,
    })


@login_required
def app_url_list_view(request):
    org = get_active_org(request)
    if not org:
        return redirect("/select-organization/")

    sub = get_active_subscription(org)
    if not (sub and sub.plan and sub.plan.allow_app_usage):
        messages.error(request, "App Usage is not enabled for your current plan.")
        return redirect("/dashboard/")

    now = timezone.now()

    employees = Employee.objects.filter(org=org).order_by("name")
    selected_employee = None
    selected_employee_id = request.GET.get("employee_id")
    if selected_employee_id:
        selected_employee = Employee.objects.filter(
            id=selected_employee_id,
            org=org
        ).first()

    app_name = request.GET.get("app", "").strip()
    query = request.GET.get("q", "").strip()

    available_activities = Activity.objects.filter(employee__org=org)
    if selected_employee:
        available_activities = available_activities.filter(employee=selected_employee)
    if app_name:
        available_activities = available_activities.filter(app_name=app_name)
    available_dates = list(
        available_activities
        .annotate(activity_time=Coalesce("end_time", "start_time"))
        .annotate(day=TruncDate("activity_time", tzinfo=timezone.get_current_timezone()))
        .values_list("day", flat=True)
        .distinct()
        .order_by("day")
    )
    available_dates = [d.isoformat() for d in available_dates if d]

    date_from_raw = request.GET.get("date_from")
    date_to_raw = request.GET.get("date_to")
    preset = request.GET.get("preset")
    allowed_presets = {"today", "yesterday", "all"}
    if preset not in allowed_presets:
        preset = None

    if not preset and not date_from_raw and not date_to_raw:
        preset = "today"

    if preset == "today":
        today = timezone.localdate()
        iso_day = today.isoformat()
        date_from_raw = iso_day
        date_to_raw = iso_day
    elif preset == "yesterday":
        day = timezone.localdate() - timedelta(days=1)
        iso_day = day.isoformat()
        date_from_raw = iso_day
        date_to_raw = iso_day
    elif preset == "all":
        date_from_raw = None
        date_to_raw = None

    active_preset = preset

    def parse_date_flexible(value):
        if not value:
            return None, ""
        parsed = parse_date(value)
        if parsed:
            return parsed, parsed.isoformat()
        for fmt in ("%d-%m-%Y", "%d/%m/%Y"):
            try:
                parsed = datetime.datetime.strptime(value, fmt).date()
                return parsed, parsed.isoformat()
            except ValueError:
                continue
        return None, ""

    date_from, date_from_value = parse_date_flexible(date_from_raw)
    date_to, date_to_value = parse_date_flexible(date_to_raw)

    activities = Activity.objects.filter(employee__org=org)
    if selected_employee:
        activities = activities.filter(employee=selected_employee)
    if app_name:
        activities = activities.filter(app_name=app_name)
    if date_from or date_to:
        if not date_from:
            date_from = date_to
        if not date_to:
            date_to = date_from
        if date_from and not date_from_value:
            date_from_value = date_from.isoformat()
        if date_to and not date_to_value:
            date_to_value = date_to.isoformat()
        start_dt = timezone.make_aware(
            datetime.datetime.combine(date_from, datetime.time.min),
            timezone.get_current_timezone(),
        )
        end_dt = timezone.make_aware(
            datetime.datetime.combine(date_to, datetime.time.max),
            timezone.get_current_timezone(),
        )
        date_window = (start_dt, end_dt)
        activities = activities.filter(
            models.Q(end_time__range=date_window) |
            models.Q(start_time__range=date_window)
        )

    def simplify_title(title):
        if not title:
            return ""
        return title.split(" - ")[0].strip()

    url_stats = {}
    url_last = {}
    total_seconds = 0
    default_interval = 10
    for act in activities:
        start = act.start_time or act.end_time
        end = act.end_time or act.start_time
        if not start or not end:
            continue
        delta = (end - start).total_seconds()
        if delta <= 0:
            delta = default_interval
        key = act.url or ""
        if not key and act.app_name and act.app_name.lower() in ("chrome.exe", "msedge.exe", "brave.exe"):
            key = simplify_title(act.window_title)
        key = key.strip()
        if not key:
            continue
        if query and query.lower() not in key.lower():
            continue
        total_seconds += delta
        url_stats[key] = url_stats.get(key, 0) + delta
        last_time = url_last.get(key)
        if not last_time or end > last_time:
            url_last[key] = end

    def format_seconds(seconds):
        seconds = int(seconds or 0)
        hours = seconds // 3600
        minutes = (seconds % 3600) // 60
        secs = seconds % 60
        if hours:
            return f"{hours}h {minutes}m"
        if minutes:
            return f"{minutes}m {secs}s"
        return f"{secs}s"

    url_rows = []
    for url_value, secs in sorted(url_stats.items(), key=lambda x: x[1], reverse=True):
        url_rows.append({
            "url": url_value,
            "duration": format_seconds(secs),
            "last_seen": url_last.get(url_value),
        })

    for e in employees:
        if not e.last_seen:
            e.status = "Offline"
        else:
            delta = now - e.last_seen
            if delta <= timedelta(minutes=2):
                e.status = "Online"
            elif delta <= timedelta(minutes=10):
                e.status = "Ideal"
            else:
                e.status = "Offline"

    return render(request, "dashboard/app_urls.html", {
        "org": org,
        "employees": employees,
        "selected_employee": selected_employee,
        "app_name": app_name,
        "search_query": query,
        "url_rows": url_rows,
        "date_from": date_from_value,
        "date_to": date_to_value,
        "active_preset": active_preset or "",
        "available_dates": available_dates,
    })


@login_required
def gaming_ott_usage_view(request):
    org = get_active_org(request)
    if not org:
        return redirect("/select-organization/")

    sub = get_active_subscription(org)
    if not (sub and sub.plan and sub.plan.allow_app_usage):
        messages.error(request, "App Usage is not enabled for your current plan.")
        return redirect("/dashboard/")

    now = timezone.now()
    employees = Employee.objects.filter(org=org).order_by("name")
    selected_employee = None
    selected_employee_id = request.GET.get("employee_id")
    if selected_employee_id:
        selected_employee = Employee.objects.filter(
            id=selected_employee_id,
            org=org
        ).first()

    keyword_q = build_gaming_ott_query()

    available_activities = Activity.objects.filter(employee__org=org).filter(keyword_q)
    if selected_employee:
        available_activities = available_activities.filter(employee=selected_employee)
    available_dates = list(
        available_activities
        .annotate(activity_time=Coalesce("end_time", "start_time"))
        .annotate(day=TruncDate("activity_time", tzinfo=timezone.get_current_timezone()))
        .values_list("day", flat=True)
        .distinct()
        .order_by("day")
    )
    available_dates = [d.isoformat() for d in available_dates if d]

    date_from_raw = request.GET.get("date_from")
    date_to_raw = request.GET.get("date_to")
    preset = request.GET.get("preset")
    allowed_presets = {"today", "yesterday", "all"}
    if preset not in allowed_presets:
        preset = None

    if not preset and not date_from_raw and not date_to_raw:
        preset = "today"

    if preset == "today":
        today = timezone.localdate()
        iso_day = today.isoformat()
        date_from_raw = iso_day
        date_to_raw = iso_day
    elif preset == "yesterday":
        day = timezone.localdate() - timedelta(days=1)
        iso_day = day.isoformat()
        date_from_raw = iso_day
        date_to_raw = iso_day
    elif preset == "all":
        date_from_raw = None
        date_to_raw = None

    active_preset = preset

    def parse_date_flexible(value):
        if not value:
            return None, ""
        parsed = parse_date(value)
        if parsed:
            return parsed, parsed.isoformat()
        for fmt in ("%d-%m-%Y", "%d/%m/%Y"):
            try:
                parsed = datetime.datetime.strptime(value, fmt).date()
                return parsed, parsed.isoformat()
            except ValueError:
                continue
        return None, ""

    date_from, date_from_value = parse_date_flexible(date_from_raw)
    date_to, date_to_value = parse_date_flexible(date_to_raw)

    activities = Activity.objects.filter(employee__org=org).filter(keyword_q)
    if selected_employee:
        activities = activities.filter(employee=selected_employee)
    if date_from or date_to:
        if not date_from:
            date_from = date_to
        if not date_to:
            date_to = date_from
        if date_from and not date_from_value:
            date_from_value = date_from.isoformat()
        if date_to and not date_to_value:
            date_to_value = date_to.isoformat()
        start_dt = timezone.make_aware(
            datetime.datetime.combine(date_from, datetime.time.min),
            timezone.get_current_timezone(),
        )
        end_dt = timezone.make_aware(
            datetime.datetime.combine(date_to, datetime.time.max),
            timezone.get_current_timezone(),
        )
        date_window = (start_dt, end_dt)
        activities = activities.filter(
            models.Q(end_time__range=date_window) |
            models.Q(start_time__range=date_window)
        )

    activities = activities.select_related("employee").order_by("-end_time", "-start_time")

    def format_duration(seconds):
        seconds = int(seconds or 0)
        hours = seconds // 3600
        minutes = (seconds % 3600) // 60
        secs = seconds % 60
        if hours:
            return f"{hours}h {minutes}m"
        if minutes:
            return f"{minutes}m {secs}s"
        return f"{secs}s"

    def format_time(value):
        if not value:
            return "-"
        return timezone.localtime(value).strftime("%H:%M:%S")

    def format_date(value):
        if not value:
            return "-"
        return timezone.localtime(value).date().isoformat()

    rows = []
    for act in activities:
        start = act.start_time or act.end_time
        end = act.end_time or act.start_time
        if not start or not end:
            continue
        duration_seconds = max(0, (end - start).total_seconds())
        detail = (act.url or act.window_title or "-").strip() or "-"
        rows.append({
            "employee": act.employee.name,
            "date": format_date(end or start),
            "app": act.app_name or "Unknown",
            "detail": detail,
            "start": format_time(start),
            "end": format_time(end),
            "duration": format_duration(duration_seconds),
        })

    for e in employees:
        if not e.last_seen:
            e.status = "Offline"
        else:
            delta = now - e.last_seen
            if delta <= timedelta(minutes=2):
                e.status = "Online"
            elif delta <= timedelta(minutes=10):
                e.status = "Ideal"
            else:
                e.status = "Offline"

    return render(request, "dashboard/gaming_ott_usage.html", {
        "org": org,
        "employees": employees,
        "selected_employee": selected_employee,
        "rows": rows,
        "date_from": date_from_value,
        "date_to": date_to_value,
        "active_preset": active_preset or "",
        "available_dates": available_dates,
    })


@login_required
def work_activity_log_view(request):
    org = get_active_org(request)
    if not org:
        return redirect("/select-organization/")

    now = timezone.now()
    settings_obj, _ = OrganizationSettings.objects.get_or_create(organization=org)
    gap_minutes = settings_obj.screenshot_interval_minutes or 5
    if gap_minutes < 1:
        gap_minutes = 1
    gap_threshold = timedelta(minutes=gap_minutes)

    employees = Employee.objects.filter(org=org).order_by("name")
    selected_employee = None
    selected_employee_id = request.GET.get("employee_id")
    if selected_employee_id:
        selected_employee = Employee.objects.filter(
            id=selected_employee_id,
            org=org
        ).first()

    available_activities = Activity.objects.filter(employee__org=org)
    if selected_employee:
        available_activities = available_activities.filter(employee=selected_employee)
    available_dates = list(
        available_activities
        .annotate(activity_time=Coalesce("end_time", "start_time"))
        .annotate(day=TruncDate("activity_time", tzinfo=timezone.get_current_timezone()))
        .values_list("day", flat=True)
        .distinct()
        .order_by("day")
    )
    available_dates = [d.isoformat() for d in available_dates if d]

    date_from_raw = request.GET.get("date_from")
    date_to_raw = request.GET.get("date_to")
    preset = request.GET.get("preset")
    allowed_presets = {"today", "yesterday", "all"}
    if preset not in allowed_presets:
        preset = None

    if not preset and not date_from_raw and not date_to_raw:
        preset = "today"

    if preset == "today":
        today = timezone.localdate()
        iso_day = today.isoformat()
        date_from_raw = iso_day
        date_to_raw = iso_day
    elif preset == "yesterday":
        day = timezone.localdate() - timedelta(days=1)
        iso_day = day.isoformat()
        date_from_raw = iso_day
        date_to_raw = iso_day
    elif preset == "all":
        date_from_raw = None
        date_to_raw = None

    active_preset = preset

    def parse_date_flexible(value):
        if not value:
            return None, ""
        parsed = parse_date(value)
        if parsed:
            return parsed, parsed.isoformat()
        for fmt in ("%d-%m-%Y", "%d/%m/%Y"):
            try:
                parsed = datetime.datetime.strptime(value, fmt).date()
                return parsed, parsed.isoformat()
            except ValueError:
                continue
        return None, ""

    date_from, date_from_value = parse_date_flexible(date_from_raw)
    date_to, date_to_value = parse_date_flexible(date_to_raw)

    activities = Activity.objects.filter(employee__org=org)
    if selected_employee:
        activities = activities.filter(employee=selected_employee)
    if date_from or date_to:
        if not date_from:
            date_from = date_to
        if not date_to:
            date_to = date_from
        if date_from and not date_from_value:
            date_from_value = date_from.isoformat()
        if date_to and not date_to_value:
            date_to_value = date_to.isoformat()
        start_dt = timezone.make_aware(
            datetime.datetime.combine(date_from, datetime.time.min),
            timezone.get_current_timezone(),
        )
        end_dt = timezone.make_aware(
            datetime.datetime.combine(date_to, datetime.time.max),
            timezone.get_current_timezone(),
        )
        date_window = (start_dt, end_dt)
        activities = activities.filter(
            models.Q(end_time__range=date_window) |
            models.Q(start_time__range=date_window)
        )
    activities = activities.select_related("employee").order_by("employee_id", "start_time")

    def format_duration(seconds):
        seconds = int(seconds or 0)
        hours = seconds // 3600
        minutes = (seconds % 3600) // 60
        secs = seconds % 60
        if hours:
            return f"{hours}h {minutes}m"
        if minutes:
            return f"{minutes}m {secs}s"
        return f"{secs}s"

    def format_time(value):
        if not value:
            return "-"
        return timezone.localtime(value).strftime("%H:%M:%S")

    def build_sessions(times):
        if not times:
            return []
        ordered = sorted(times)
        sessions = []
        start = ordered[0]
        prev = ordered[0]
        for current in ordered[1:]:
            if current - prev > gap_threshold:
                sessions.append((start, prev))
                start = current
            prev = current
        sessions.append((start, prev))
        return sessions

    employee_map = {e.id: e.name for e in employees}
    daily_times = defaultdict(list)
    for act in activities:
        activity_time = act.end_time or act.start_time
        if not activity_time:
            continue
        local_time = timezone.localtime(activity_time)
        key = (act.employee_id, local_time.date())
        daily_times[key].append(local_time)

    rows = []
    for (employee_id, day), times in daily_times.items():
        sessions = build_sessions(times)
        if not sessions:
            continue
        first_on = sessions[0][0]
        last_off = sessions[-1][1]
        total_seconds = 0
        history_entries = []
        for start, end in sessions:
            duration_seconds = max(0, (end - start).total_seconds())
            total_seconds += duration_seconds
            history_entries.append({
                "on": format_time(start),
                "off": format_time(end),
                "duration": format_duration(duration_seconds),
            })
        count = len(sessions)
        label = f"{count} time" if count == 1 else f"{count} times"
        rows.append({
            "employee": employee_map.get(employee_id, "Unknown"),
            "date": day.isoformat(),
            "on_time": format_time(first_on),
            "off_time": format_time(last_off),
            "history_label": label,
            "history_json": json.dumps(history_entries),
            "duration": format_duration(total_seconds),
            "_date": day,
        })

    rows.sort(key=lambda item: (item["_date"], item["employee"]), reverse=True)
    for row in rows:
        row.pop("_date", None)

    for e in employees:
        if not e.last_seen:
            e.status = "Offline"
        else:
            delta = now - e.last_seen
            if delta <= timedelta(minutes=2):
                e.status = "Online"
            elif delta <= timedelta(minutes=10):
                e.status = "Ideal"
            else:
                e.status = "Offline"

    return render(request, "dashboard/work_activity_log.html", {
        "org": org,
        "employees": employees,
        "selected_employee": selected_employee,
        "rows": rows,
        "date_from": date_from_value,
        "date_to": date_to_value,
        "active_preset": active_preset or "",
        "available_dates": available_dates,
    })


@login_required
def delete_screenshot(request, shot_id):
    org = get_active_org(request)
    if not org:
        return redirect("/select-organization/")

    shot = get_object_or_404(Screenshot, id=shot_id, employee__org=org)

    if shot.image:
        shot.image.delete(save=False)
    shot.delete()

    log_admin_activity(request.user, "Delete Screenshot", f"Screenshot ID {shot_id}")
    messages.success(request, "Screenshot deleted successfully.")
    return redirect(request.META.get("HTTP_REFERER", "/dashboard/screenshots/"))


@login_required
def delete_employee_screenshots(request, emp_id):
    org = get_active_org(request)
    if not org:
        return redirect("/select-organization/")

    employee = get_object_or_404(Employee, id=emp_id, org=org)
    shots = Screenshot.objects.filter(employee=employee)

    deleted_count = 0
    for s in shots:
        try:
            if s.image:
                s.image.delete(save=False)
                deleted_count += 1
        except Exception:
            pass

    shots.delete()

    log_admin_activity(request.user, "Delete Employee Screenshots", f"{deleted_count} screenshots deleted for {employee.name}")
    messages.success(request, f"Deleted {deleted_count} screenshots for {employee.name}.")
    return redirect(f"/dashboard/screenshots/?employee_id={employee.id}")


# =====================================================
#  LIVE ACTIVITY API
# =====================================================
@login_required
def activity_live_api(request):
    org = get_active_org(request)
    if not org:
        return JsonResponse({"logs": []})

    employee_id = request.GET.get("employee_id")
    logs = Activity.objects.filter(employee__org=org)
    if employee_id:
        logs = logs.filter(employee_id=employee_id)
    logs = logs.order_by('-start_time')[:20]

    def format_time(value):
        if not value:
            return ""
        return timezone.localtime(value).strftime("%Y-%m-%d %H:%M:%S")

    return JsonResponse({
        "logs": [
            {
                "employee": log.employee.name,
                "app": log.app_name,
                "window": log.window_title,
                "url": log.url,
                "start": format_time(log.start_time),
            }
            for log in logs
        ]
    })


# =====================================================
#  EMPLOYEE DETAIL
# =====================================================
@login_required
def employee_detail(request, emp_id):
    org = get_active_org(request)
    if not org:
        return redirect("/select-organization/")

    employee = get_object_or_404(Employee, id=emp_id, org=org)

    logs = Activity.objects.filter(employee=employee).order_by('-start_time')[:50]
    shots = Screenshot.objects.filter(employee=employee).order_by('-captured_at')[:20]

    return render(request, "dashboard/employee_detail.html", {
        "employee": employee,
        "logs": logs,
        "shots": shots
    })


# =====================================================
#  EMPLOYEE CRUD
# =====================================================
@login_required
def employee_create(request):
    org = get_active_org(request)
    if not org:
        return redirect("/select-organization/")

    sub = get_active_subscription(org)
    if not is_subscription_active(sub):
        messages.error(request, "Please activate a plan first.")
        return redirect("/dashboard/plans/")

    employee_limit = sub.plan.employee_limit if sub and sub.plan else 0
    addon_count = sub.addon_count if sub else 0
    if employee_limit == 0:
        employee_limit = 0
    else:
        employee_limit = employee_limit + addon_count
    if employee_limit and Employee.objects.filter(org=org).count() >= employee_limit:
        messages.error(request, "Employee limit reached for your plan.")
        return redirect("/dashboard/employees/")

    if request.method == "POST":
        name = request.POST.get("name")
        email = request.POST.get("email")
        device_id = request.POST.get("device_id")

        if not name or not device_id:
            messages.error(request, "Name and device ID are required.")
            return redirect("/dashboard/employees/add/")

        if Employee.objects.filter(device_id=device_id).exists():
            messages.error(request, "Device ID already exists.")
            return redirect("/dashboard/employees/add/")

        Employee.objects.create(
            org=org,
            name=name,
            email=email,
            device_id=device_id,
        )
        messages.success(request, "Employee added successfully.")
        return redirect("/dashboard/employees/")

    return render(request, "dashboard/employee_form.html", {
        "mode": "create",
    })


@login_required
def employee_edit(request, emp_id):
    org = get_active_org(request)
    if not org:
        return redirect("/select-organization/")

    employee = get_object_or_404(Employee, id=emp_id, org=org)

    if request.method == "POST":
        name = request.POST.get("name")
        email = request.POST.get("email")
        device_id = request.POST.get("device_id")

        if not name or not device_id:
            messages.error(request, "Name and device ID are required.")
            return redirect(f"/dashboard/employees/{emp_id}/edit/")

        if Employee.objects.filter(device_id=device_id).exclude(id=employee.id).exists():
            messages.error(request, "Device ID already exists.")
            return redirect(f"/dashboard/employees/{emp_id}/edit/")

        employee.name = name
        employee.email = email
        employee.device_id = device_id
        employee.save()

        messages.success(request, "Employee updated successfully.")
        return redirect("/dashboard/employees/")

    return render(request, "dashboard/employee_form.html", {
        "mode": "edit",
        "employee": employee,
    })


@login_required
def employee_delete(request, emp_id):
    org = get_active_org(request)
    if not org:
        return redirect("/select-organization/")

    employee = get_object_or_404(Employee, id=emp_id, org=org)

    if request.method == "POST":
        employee.delete()
        messages.success(request, "Employee deleted successfully.")
        return redirect("/dashboard/employees/")

    return redirect("/dashboard/employees/")


# =====================================================
#  EXPORT CSV
# =====================================================
@login_required
def export_employees_csv(request):
    org = get_active_org(request)
    if not org:
        return redirect("/select-organization/")

    employees = Employee.objects.filter(org=org)

    response = HttpResponse(content_type="text/csv")
    response["Content-Disposition"] = 'attachment; filename="employees.csv"'

    writer = csv.writer(response)
    writer.writerow(["ID", "Name", "Device", "Last Seen", "Status"])

    for e in employees:
        writer.writerow([
            e.id,
            e.name,
            e.device_id,
            e.last_seen,
            "Online" if e.is_online else "Offline"
        ])

    return response


# =====================================================
#  EXPORT PDF
# =====================================================
@login_required
def export_employees_pdf(request):
    org = get_active_org(request)
    if not org:
        return redirect("/select-organization/")

    employees = Employee.objects.filter(org=org)

    response = HttpResponse(content_type="application/pdf")
    response["Content-Disposition"] = 'attachment; filename="employees.pdf"'

    from reportlab.lib import colors
    from reportlab.lib.pagesizes import landscape, LETTER
    from reportlab.platypus import Table, TableStyle

    page_size = landscape(LETTER)
    p = canvas.Canvas(response, pagesize=page_size)
    page_width, page_height = page_size
    title = f"Employee Report - {org.name}"
    rows = []
    for e in employees:
        rows.append([
            str(e.id),
            e.name,
            e.device_id or "-",
            _format_datetime(e.last_seen),
            "Online" if e.is_online else "Offline",
        ])

    header = ["ID", "Name", "Device", "Last Seen", "Status"]
    rows_per_page = 22
    for page_index in range(0, len(rows), rows_per_page):
        page_rows = rows[page_index:page_index + rows_per_page]
        table_data = [header] + page_rows

        table = Table(
            table_data,
            colWidths=[50, 170, 160, 160, 90],
        )
        table.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#0b1222")),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.whitesmoke),
            ("ALIGN", (0, 0), (-1, -1), "LEFT"),
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ("FONTSIZE", (0, 0), (-1, -1), 9),
            ("FONTSIZE", (0, 0), (-1, 0), 10),
            ("BACKGROUND", (0, 1), (-1, -1), colors.HexColor("#1f2937")),
            ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#4b5563")),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [
                colors.HexColor("#1f2937"),
                colors.HexColor("#111827"),
            ]),
        ]))

        if page_index > 0:
            p.showPage()

        p.setFont("Helvetica-Bold", 14)
        p.drawString(40, page_height - 40, title)
        p.setFont("Helvetica", 9)

        table_width, table_height = table.wrap(page_width - 80, page_height - 80)
        y_position = page_height - 80 - table_height
        table.drawOn(p, 40, y_position)

    p.save()
    return response

@login_required
def company_profile(request):
    org = get_active_org(request)
    if not org:
        return redirect("/select-organization/")

    employee_count = Employee.objects.filter(org=org).count()
    activity_count = Activity.objects.filter(employee__org=org).count()
    screenshot_count = Screenshot.objects.filter(employee__org=org).count()
    sub = Subscription.objects.filter(organization=org).first()
    settings_obj, _ = OrganizationSettings.objects.get_or_create(organization=org)
    privacy_settings, _ = CompanyPrivacySettings.objects.get_or_create(organization=org)
    show_privacy_settings = not is_super_admin_user(request.user)
    allowed_intervals = [1, 2, 3, 5, 10, 15, 20, 30]
    min_interval = sub.plan.screenshot_min_minutes if sub and sub.plan else None
    if min_interval:
        allowed_intervals = [i for i in allowed_intervals if i >= min_interval]

    if request.method == "POST":
        action = request.POST.get("action") or "screenshot_interval"
        if action == "screenshot_interval":
            interval = request.POST.get("screenshot_interval_minutes")
            try:
                interval_val = int(interval)
            except (TypeError, ValueError):
                interval_val = None

            if interval_val in allowed_intervals:
                settings_obj.screenshot_interval_minutes = interval_val
                settings_obj.save()
                messages.success(request, "Screenshot interval updated.")
            else:
                messages.error(request, "Invalid interval selected.")
            return redirect("/dashboard/company/")
        if action == "privacy_settings":
            if not show_privacy_settings:
                messages.error(request, "Access denied.")
                return redirect("/dashboard/company/")
            monitoring_mode = request.POST.get("monitoring_mode", "").strip()
            valid_modes = {choice[0] for choice in CompanyPrivacySettings.MONITORING_MODES}
            if monitoring_mode not in valid_modes:
                messages.error(request, "Invalid monitoring mode selected.")
                return redirect("/dashboard/company/")

            privacy_settings.monitoring_mode = monitoring_mode
            if monitoring_mode != "privacy_lock":
                privacy_settings.support_access_enabled_until = None
                privacy_settings.support_access_duration_hours = None
            privacy_settings.save()
            messages.success(request, "Company privacy settings updated.")
            return redirect("/dashboard/company/")

        if action == "support_access":
            if not show_privacy_settings:
                messages.error(request, "Access denied.")
                return redirect("/dashboard/company/")
            support_enabled = request.POST.get("support_access_enabled") == "on"
            try:
                support_hours = int(request.POST.get("support_access_hours") or 2)
            except (TypeError, ValueError):
                support_hours = 2
            if support_hours not in (1, 2, 4, 8, 12, 24, 48):
                support_hours = 2

            if privacy_settings.monitoring_mode != "privacy_lock":
                privacy_settings.support_access_enabled_until = None
                privacy_settings.support_access_duration_hours = None
                privacy_settings.save()
                messages.error(request, "Support access is available only in Privacy Lock mode.")
                return redirect("/dashboard/company/")

            privacy_settings.support_access_duration_hours = support_hours
            if support_enabled:
                privacy_settings.support_access_enabled_until = timezone.now() + timedelta(hours=support_hours)
            else:
                privacy_settings.support_access_enabled_until = None
            privacy_settings.save()
            messages.success(request, "Support access settings updated.")
            return redirect("/dashboard/company/")

    support_active = has_active_support_access(privacy_settings)
    support_until = privacy_settings.support_access_enabled_until
    support_remaining = ""
    support_duration_selected = privacy_settings.support_access_duration_hours or 2
    if support_active and support_until:
        remaining_seconds = (support_until - timezone.now()).total_seconds()
        support_remaining = format_duration_compact(remaining_seconds)
    if (
        not privacy_settings.support_access_duration_hours
        and support_until
        and privacy_settings.updated_at
    ):
        duration_seconds = (support_until - privacy_settings.updated_at).total_seconds()
        duration_hours = int(round(duration_seconds / 3600))
        if duration_hours in (1, 2, 4, 8, 12, 24, 48):
            support_duration_selected = duration_hours

    return render(request, "dashboard/company_profile.html", {
        "org": org,
        "sub": sub,
        "employee_count": employee_count,
        "activity_count": activity_count,
        "screenshot_count": screenshot_count,
        "settings": settings_obj,
        "allowed_intervals": allowed_intervals,
        "privacy_settings": privacy_settings,
        "support_active": support_active,
        "support_until": support_until,
        "support_remaining": support_remaining,
        "support_duration_options": [1, 2, 4, 8, 12, 24, 48],
        "support_duration_selected": support_duration_selected,
        "show_privacy_settings": show_privacy_settings,
    })


@login_required
def billing_page(request):
    org = get_active_org(request)
    if not org:
        return redirect("/select-organization/")

    sub = get_active_subscription(org)
    if not sub:
        sub = ensure_active_subscription(org)
    PendingTransfer.objects.filter(organization=org, status="draft").delete()
    history_entries = SubscriptionHistory.objects.filter(
        organization=org
    ).order_by("-start_date")
    if sub and not history_entries.exists():
        record_subscription_history(
            org=org,
            user=sub.user,
            plan=sub.plan,
            status=sub.status,
            start_date=sub.start_date,
            end_date=sub.end_date,
            billing_cycle=sub.billing_cycle,
        )
        history_entries = SubscriptionHistory.objects.filter(
            organization=org
        ).order_by("-start_date")
    free_plan = Plan.objects.filter(name__iexact="free").first()
    if free_plan and not history_entries.filter(plan=free_plan).exists():
        oldest = SubscriptionHistory.objects.filter(organization=org).order_by("start_date").first()
        free_start = org.created_at or timezone.now()
        free_end = get_free_trial_end_date(free_start)
        if oldest and oldest.start_date and oldest.start_date < free_end:
            free_end = oldest.start_date
        free_status = "expired" if free_end and free_end < timezone.now() else "active"
        record_subscription_history(
            org=org,
            user=sub.user if sub else request.user,
            plan=free_plan,
            status=free_status,
            start_date=free_start,
            end_date=free_end,
            billing_cycle="monthly",
        )
        history_entries = SubscriptionHistory.objects.filter(
            organization=org
        ).order_by("-start_date")
    pending_transfers = PendingTransfer.objects.filter(
        status="pending",
        organization=org
    ).order_by("-created_at")
    approved_transfers = PendingTransfer.objects.filter(
        status="approved",
        organization=org
    ).order_by("-updated_at")
    if sub:
        base_transfer = approved_transfers.filter(request_type__in=("new", "renew")).first()
        base_addons = 0
        base_time = None
        if base_transfer and base_transfer.plan and base_transfer.plan.allow_addons:
            base_addons = base_transfer.addon_count or 0
            base_time = base_transfer.updated_at or base_transfer.created_at
        addon_transfers = approved_transfers.filter(request_type="addon")
        if base_time:
            addon_transfers = addon_transfers.filter(updated_at__gt=base_time)
        addon_total = base_addons + sum(t.addon_count or 0 for t in addon_transfers)
        last_addon_approved = approved_transfers.filter(request_type="addon").first()
        update_fields = []
        if addon_total != (sub.addon_count or 0):
            sub.addon_count = addon_total
            update_fields.append("addon_count")
        if last_addon_approved:
            approved_at = last_addon_approved.updated_at or last_addon_approved.created_at
            if approved_at and (not sub.addon_last_proration_at or approved_at > sub.addon_last_proration_at):
                sub.addon_last_proration_at = approved_at
                sub.addon_proration_amount = last_addon_approved.amount or sub.addon_proration_amount
                update_fields.extend(["addon_last_proration_at", "addon_proration_amount"])
        if update_fields:
            sub.save(update_fields=list(dict.fromkeys(update_fields)))
    if request.method == "POST" and sub:
        action = request.POST.get("action")
        if action == "addons":
            plan = sub.plan
            if not plan.allow_addons:
                messages.error(request, "Add-ons are disabled for this plan.")
                return redirect("/dashboard/billing/")

            add_more = request.POST.get("addon_count")
            try:
                add_more = int(add_more)
            except (TypeError, ValueError):
                add_more = 0
            if add_more <= 0:
                messages.info(request, "Please enter add-on count greater than 0.")
                return redirect("/dashboard/billing/")

            delta = add_more

            if sub.billing_cycle == "monthly":
                addon_price = plan.addon_monthly_price or 0
            else:
                addon_price = plan.addon_yearly_price or 0

            billing_cycle = sub.billing_cycle or "monthly"
            expected_end = sub.end_date
            if not expected_end and sub.start_date:
                months = 12 if billing_cycle == "yearly" else 1
                expected_end = sub.start_date + timedelta(days=30 * months)
            duration_seconds = (
                (expected_end - sub.start_date).total_seconds()
                if expected_end and sub.start_date
                else (30 * (12 if billing_cycle == "yearly" else 1) * 86400)
            )
            if duration_seconds <= 0:
                duration_seconds = 30 * 86400
            remaining_seconds = (
                (expected_end - timezone.now()).total_seconds()
                if expected_end
                else duration_seconds
            )
            if remaining_seconds < 0:
                remaining_seconds = 0
            if remaining_seconds > duration_seconds:
                remaining_seconds = duration_seconds

            proration_amount = (addon_price * delta) * (remaining_seconds / duration_seconds) if duration_seconds else 0
            request.session["pending_transfer_data"] = {
                "plan_id": plan.id,
                "request_type": "addon",
                "billing_cycle": sub.billing_cycle,
                "retention_days": sub.retention_days,
                "addon_count": add_more,
                "currency": "INR",
                "amount": round(proration_amount, 2),
            }
            messages.info(request, "Addon request created. Proceed to bank transfer.")
            return redirect("/my-account/bank-transfer/")

    show_currency = "INR"
    currency_source = approved_transfers.filter(
        request_type__in=("new", "renew")
    ).order_by("-updated_at").first()
    if not currency_source:
        currency_source = pending_transfers.filter(
            request_type__in=("new", "renew")
        ).order_by("-created_at").first()
    if currency_source and currency_source.currency:
        show_currency = currency_source.currency
    return render(request, "dashboard/billing.html", {
        "org": org,
        "sub": sub,
        "history_entries": history_entries,
        "pending_transfers": pending_transfers,
        "approved_transfers": approved_transfers,
        "show_currency": show_currency,
    })


@login_required
def user_profile(request):
    org = get_active_org(request)
    if not org:
        return redirect("/select-organization/")

    user = request.user
    profile = get_profile(request.user)
    phone_country = "+91"
    phone_number = ""
    if profile.phone_number:
        parts = profile.phone_number.strip().split(" ", 1)
        if parts and parts[0].startswith("+"):
            phone_country = parts[0]
            if len(parts) > 1:
                phone_number = parts[1]
        else:
            phone_number = profile.phone_number.strip()

    if request.method == "POST":
        action = request.POST.get("action")
        if action == "email":
            email = request.POST.get("email", "").strip()
            form_phone_country = request.POST.get("phone_country", "").strip()
            form_phone_number = request.POST.get("phone_number", "").strip()
            if not email:
                messages.error(request, "Email is required.")
            else:
                user.email = email
                user.save()
                phone_value = ""
                if form_phone_number:
                    phone_value = f"{form_phone_country} {form_phone_number}".strip()
                profile.phone_number = phone_value
                profile.save()
                log_admin_activity(request.user, "Update Email", f"Updated email to {email}")
                messages.success(request, "Email updated successfully.")
            return redirect("/dashboard/profile/")

        if action == "password":
            current_password = request.POST.get("current_password", "")
            new_password = request.POST.get("new_password", "")
            confirm_password = request.POST.get("confirm_password", "")

            if not user.check_password(current_password):
                messages.error(request, "Current password is incorrect.")
                return redirect("/dashboard/profile/")

            if new_password != confirm_password:
                messages.error(request, "New passwords do not match.")
                return redirect("/dashboard/profile/")

            try:
                validate_password(new_password, user=user)
            except ValidationError as e:
                messages.error(request, " ".join(e.messages))
                return redirect("/dashboard/profile/")

            user.set_password(new_password)
            user.save()
            update_session_auth_hash(request, user)
            log_admin_activity(request.user, "Update Password", "Password updated")
            messages.success(request, "Password updated successfully.")
            return redirect("/dashboard/profile/")

    recent_actions_qs = AdminActivity.objects.filter(user=user).order_by("-created_at")[:500]
    from django.core.paginator import Paginator
    paginator = Paginator(recent_actions_qs, 50)
    page = request.GET.get("admin_page")
    recent_actions = paginator.get_page(page)

    return render(request, "dashboard/user_profile.html", {
        "org": org,
        "user_obj": user,
        "profile": profile,
        "phone_country": phone_country,
        "phone_number": phone_number,
        "recent_actions": recent_actions,
    })

@login_required
def company_edit(request):
    org = get_active_org(request)
    if not org:
        return redirect("/select-organization/")

    if request.method == "POST":
        org.name = request.POST.get("name")
        org.save()
        messages.success(request, "Organization updated successfully!")
        return redirect("/dashboard/company/")

    return render(request, "dashboard/company_edit.html", {
        "org": org
    })


# =====================================================
#  PLAN SELECTION (NO PAYMENT)
# =====================================================
@login_required
def choose_plan(request):
    org = get_active_org(request)
    if not org:
        return redirect("/select-organization/")

    plans = Plan.objects.all().order_by("price")
    active_sub = get_active_subscription(org)

    return render(request, "payments/choose_plan.html", {
        "plans": plans,
        "active_sub": active_sub
    })


@login_required
def deleted_accounts(request):
    if not request.user.is_superuser:
        return redirect("/dashboard/")

    from core.models import DeletedAccount
    query = request.GET.get("q", "").strip()
    accounts = DeletedAccount.objects.all()
    if query:
        accounts = accounts.filter(
            models.Q(organization_name__icontains=query) |
            models.Q(owner_username__icontains=query) |
            models.Q(owner_email__icontains=query)
        )
    accounts = accounts.order_by("-deleted_at")
    from django.core.paginator import Paginator
    paginator = Paginator(accounts, 20)
    return render(request, "dashboard/deleted_accounts.html", {
        "accounts": accounts_page,
        "search_query": query,
    })


@login_required
def delete_deleted_account(request, account_id):
    if not request.user.is_superuser:
        return redirect("/dashboard/")
    from core.models import DeletedAccount
    if request.method == "POST":
        DeletedAccount.objects.filter(id=account_id).delete()
    return redirect("/dashboard/deleted-accounts/")


@login_required
def subscribe_plan(request, plan_id):
    org = get_active_org(request)
    if not org:
        return redirect("/select-organization/")

    plan = get_object_or_404(Plan, id=plan_id)

    from django.utils import timezone
    from datetime import timedelta

    billing_cycle = request.POST.get("billing_cycle") if request.method == "POST" else request.GET.get("billing_cycle")
    if billing_cycle not in ("monthly", "yearly"):
        billing_cycle = "monthly"

    retention_days = plan.retention_days or 30

    free_plan = is_free_plan(plan)
    if free_plan:
        billing_cycle = "monthly"

    duration_months = 12 if billing_cycle == "yearly" else 1

    now = timezone.now()
    start_date = now
    end_date = start_date + timedelta(days=30 * duration_months)
    if free_plan:
        free_history = (
            SubscriptionHistory.objects.filter(organization=org, plan=plan)
            .order_by("start_date")
            .first()
        )
        trial_start = free_history.start_date if free_history else start_date
        trial_end = get_free_trial_end_date(trial_start, now=now)
        if trial_end < now:
            messages.error(request, "Free plan expired. Please choose a paid plan.")
            return redirect("/dashboard/plans/")
        start_date = trial_start
        end_date = trial_end

    active_sub = get_active_subscription(org)
    same_plan_active = (
        active_sub
        and is_subscription_active(active_sub)
        and active_sub.plan_id == plan.id
        and not is_free_plan(active_sub.plan)
    )
    request_type = "renew" if same_plan_active else "new"

    sub = Subscription.objects.filter(organization=org).first()
    if free_plan:
        if sub:
            sub.plan = plan
            sub.user = request.user
            sub.status = "active"
            sub.start_date = start_date
            sub.end_date = end_date
            sub.billing_cycle = billing_cycle
            sub.retention_days = retention_days
            sub.razorpay_order_id = None
            sub.razorpay_payment_id = None
            sub.razorpay_signature = None
            sub.save()
        else:
            sub = Subscription.objects.create(
                user=request.user,
                organization=org,
                plan=plan,
                status="active",
                start_date=start_date,
                end_date=end_date,
                billing_cycle=billing_cycle,
                retention_days=retention_days
            )
        record_subscription_history(
            org=org,
            user=request.user,
            plan=plan,
            status="active",
            start_date=start_date,
            end_date=end_date,
            billing_cycle=billing_cycle,
        )

    if free_plan:
        if (
            active_sub
            and is_subscription_active(active_sub)
            and not is_free_plan(active_sub.plan)
            and active_sub.plan_id != plan.id
        ):
            messages.info(request, "Downgrade selected. No refund will be issued.")
        messages.success(request, f"Plan {plan.name} activated successfully.")
        return redirect("/dashboard/company/")

    amount = get_plan_amount(plan, billing_cycle, currency="INR") or 0
    auto_apply_change = False
    auto_apply_message = ""
    active_cycle_end = None
    if (
        active_sub
        and is_subscription_active(active_sub)
        and not is_free_plan(active_sub.plan)
        and active_sub.plan_id != plan.id
        and active_sub.billing_cycle == billing_cycle
        and active_sub.end_date
        and active_sub.end_date > start_date
    ):
        current_amount = get_plan_amount(active_sub.plan, billing_cycle, currency="INR") or 0
        duration_days = (active_sub.end_date - active_sub.start_date).days
        if duration_days <= 0:
            duration_days = 30 * duration_months
        remaining_days = (active_sub.end_date - start_date).total_seconds() / 86400
        if remaining_days < 0:
            remaining_days = 0
        active_cycle_end = active_sub.end_date
        if remaining_days > 0 and duration_days > 0:
            price_delta = amount - current_amount
            if price_delta > 0:
                amount = round(price_delta * (remaining_days / duration_days), 2)
            elif price_delta < 0:
                amount = 0
                auto_apply_change = True
                auto_apply_message = "Downgrade selected. No refund will be issued."
            else:
                amount = 0
                auto_apply_change = True
                auto_apply_message = "Plan change selected. No additional charge."
    PendingTransfer.objects.filter(organization=org, status="draft").delete()
    if auto_apply_change:
        sub = sub or active_sub
        if sub and sub.status == "active":
            history_end = start_date
            if sub.plan_id == plan.id and sub.end_date:
                history_end = sub.end_date
            record_subscription_history(
                org=org,
                user=sub.user,
                plan=sub.plan,
                status="active",
                start_date=sub.start_date,
                end_date=history_end,
                billing_cycle=sub.billing_cycle,
            )
        if not sub:
            sub = Subscription(organization=org, user=request.user)
        if not active_cycle_end:
            active_cycle_end = end_date
        sub.user = request.user
        sub.plan = plan
        sub.status = "active"
        sub.start_date = start_date
        sub.end_date = active_cycle_end
        sub.billing_cycle = billing_cycle
        sub.retention_days = retention_days
        sub.save()
        record_subscription_history(
            org=org,
            user=request.user,
            plan=plan,
            status="active",
            start_date=start_date,
            end_date=active_cycle_end,
            billing_cycle=billing_cycle,
        )
        if plan:
            settings_obj, _ = OrganizationSettings.objects.get_or_create(organization=org)
            min_interval = plan.screenshot_min_minutes or 5
            if settings_obj.screenshot_interval_minutes < min_interval:
                settings_obj.screenshot_interval_minutes = min_interval
                settings_obj.save()
        if auto_apply_message:
            messages.info(request, auto_apply_message)
        messages.success(request, f"Plan {plan.name} updated successfully.")
        request.session.pop("pending_transfer_data", None)
        return redirect("/dashboard/billing/")
    existing_transfer = PendingTransfer.objects.filter(
        organization=org,
        status="pending",
        request_type__in=("new", "renew"),
    ).order_by("-created_at").first()
    if existing_transfer:
        messages.info(request, "Payment already pending. Please complete the existing request.")
        return redirect(f"/my-account/bank-transfer/{existing_transfer.id}/")

    request.session["pending_transfer_data"] = {
        "plan_id": plan.id,
        "request_type": request_type,
        "billing_cycle": billing_cycle,
        "retention_days": retention_days,
        "currency": "INR",
        "amount": amount,
        "created_at": timezone.now().isoformat(),
    }
    return redirect("/my-account/bank-transfer/")


@login_required
def bank_transfer(request, transfer_id=None):
    org = get_active_org(request)
    if not org:
        return redirect("/select-organization/")

    transfer = None
    if transfer_id is not None:
        transfer = get_object_or_404(PendingTransfer, id=transfer_id, organization=org)
    else:
        data = request.session.get("pending_transfer_data")
        if not data:
            messages.error(request, "No pending payment request found.")
            return redirect("/app/plans/")
        plan = get_object_or_404(Plan, id=data.get("plan_id"))
        transfer = SimpleNamespace(
            plan=plan,
            request_type=data.get("request_type"),
            billing_cycle=data.get("billing_cycle"),
            retention_days=data.get("retention_days"),
            currency=data.get("currency", "INR"),
            amount=data.get("amount", 0),
            addon_count=data.get("addon_count"),
        )

    if request.method == "POST":
        reference_no = request.POST.get("reference_no", "").strip()
        receipt = request.FILES.get("receipt")
        if transfer_id is not None:
            transfer.reference_no = reference_no
            if receipt:
                transfer.receipt = receipt
            transfer.status = "pending"
            transfer.save()
        else:
            data = request.session.get("pending_transfer_data") or {}
            plan = get_object_or_404(Plan, id=data.get("plan_id"))
            PendingTransfer.objects.create(
                organization=org,
                user=request.user,
                plan=plan,
                request_type=data.get("request_type"),
                billing_cycle=data.get("billing_cycle", "monthly"),
                retention_days=data.get("retention_days") or (plan.retention_days if plan else 30),
                addon_count=data.get("addon_count"),
                currency=data.get("currency", "INR"),
                amount=data.get("amount") or 0,
                reference_no=reference_no,
                receipt=receipt,
                status="pending",
            )
            request.session.pop("pending_transfer_data", None)
        messages.success(request, "Payment submitted. We will verify and activate your account.")
        return redirect("/dashboard/billing/")

    seller = InvoiceSellerProfile.objects.order_by("-updated_at").first()
    bank_account_details = seller.bank_account_details if seller else ""
    seller_upi_id = (seller.upi_id or "").strip() if seller else ""
    return render(request, "payments/bank_transfer.html", {
        "org": org,
        "transfer": transfer,
        "bank_account_details": bank_account_details,
        "seller_upi_id": seller_upi_id,
    })


@login_required
def pending_transfers(request):
    if not request.user.is_superuser:
        return redirect("/dashboard/")

    PendingTransfer.objects.filter(status="draft").delete()
    new_transfers = PendingTransfer.objects.filter(status="pending", request_type="new").order_by("-created_at")
    renew_addon_transfers = PendingTransfer.objects.filter(
        status="pending",
        request_type__in=("renew", "addon")
    ).order_by("-created_at")

    return render(request, "dashboard/pending_transfers.html", {
        "new_transfers": new_transfers,
        "renew_addon_transfers": renew_addon_transfers,
    })


@login_required
def approve_transfer(request, transfer_id):
    if not request.user.is_superuser:
        return redirect("/dashboard/")

    transfer = get_object_or_404(PendingTransfer, id=transfer_id)
    if request.method == "POST":
        org = transfer.organization
        now = timezone.now()
        submitted_at = transfer.created_at or now
        if transfer.request_type in ("new", "renew"):
            sub = Subscription.objects.filter(organization=org).first()
            if not sub:
                sub = Subscription(organization=org, user=transfer.user, plan=transfer.plan)
            elif sub.status == "active":
                history_end = now
                if sub.plan_id == transfer.plan_id and sub.end_date:
                    history_end = sub.end_date
                record_subscription_history(
                    org=org,
                    user=sub.user,
                    plan=sub.plan,
                    status="active",
                    start_date=sub.start_date,
                    end_date=history_end,
                    billing_cycle=sub.billing_cycle,
                )

            start_date = submitted_at
            active_cycle_end = None
            if (
                sub
                and sub.status == "active"
                and sub.end_date
                and sub.end_date > now
                and sub.billing_cycle == transfer.billing_cycle
            ):
                active_cycle_end = sub.end_date
            if (
                transfer.request_type == "renew"
                and sub.plan_id == transfer.plan_id
                and sub.end_date
                and sub.end_date > now
            ):
                start_date = sub.end_date

            duration_months = 12 if transfer.billing_cycle == "yearly" else 1
            end_date = start_date + timedelta(days=30 * duration_months)
            if active_cycle_end and sub.plan_id != transfer.plan_id:
                end_date = active_cycle_end

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
            record_subscription_history(
                org=org,
                user=transfer.user,
                plan=transfer.plan,
                status="active",
                start_date=start_date,
                end_date=end_date,
                billing_cycle=transfer.billing_cycle,
            )
            if transfer.plan:
                settings_obj, _ = OrganizationSettings.objects.get_or_create(organization=org)
                min_interval = transfer.plan.screenshot_min_minutes or 5
                if settings_obj.screenshot_interval_minutes < min_interval:
                    settings_obj.screenshot_interval_minutes = min_interval
                    settings_obj.save()

        if transfer.request_type == "dealer":
            dealer = DealerAccount.objects.filter(user=transfer.user).first()
            if dealer:
                dealer.subscription_status = "active"
                dealer.subscription_start = submitted_at
                dealer.subscription_end = submitted_at + timedelta(days=365)
                dealer.subscription_amount = transfer.amount or dealer.subscription_amount
                dealer.save()
                from core.referral_utils import record_dealer_referral_flat_earning
                record_dealer_referral_flat_earning(dealer)

        if transfer.request_type in ("new", "renew"):
            record_referral_earning(transfer)
            record_dealer_org_referral_earning(transfer)

        transfer.status = "approved"
        transfer.save()
        if transfer.request_type == "addon":
            sub = get_active_subscription(org)
            if sub:
                addon_delta = max(0, transfer.addon_count or 0)
                sub.addon_count = (sub.addon_count or 0) + addon_delta
                sub.addon_proration_amount = transfer.amount or 0
                sub.addon_last_proration_at = transfer.updated_at or now
                sub.save()
        recipient = ""
        recipient_name = ""
        if transfer.request_type == "dealer":
            recipient = transfer.user.email if transfer.user else ""
            recipient_name = transfer.user.first_name if transfer.user else ""
        else:
            owner = org.owner if org else None
            recipient = owner.email if owner else (transfer.user.email if transfer.user else "")
            recipient_name = owner.first_name if owner else (transfer.user.first_name if transfer.user else "")
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
                "reference_no": transfer.reference_no or "-"
            }
        )
        messages.success(request, "Transfer approved.")

    return redirect("/dashboard/pending-transfers/")


@login_required
def reject_transfer(request, transfer_id):
    if not request.user.is_superuser:
        return redirect("/dashboard/")

    transfer = get_object_or_404(PendingTransfer, id=transfer_id)
    if request.method == "POST":
        if transfer.status == "approved":
            revert_transfer_subscription(transfer)
        transfer.status = "rejected"
        transfer.save()
        messages.success(request, "Transfer rejected.")

    return redirect("/dashboard/pending-transfers/")





