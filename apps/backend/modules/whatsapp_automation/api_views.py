import json

from django.contrib.auth.decorators import login_required
from django.http import HttpResponseForbidden, JsonResponse
from django.views.decorators.http import require_http_methods

from dashboard import views as dashboard_views
from core.models import UserProfile

from .models import AutomationRule, CataloguePage, CatalogueProduct, CompanyProfile, DigitalCard, WhatsappSettings


def _get_org(request):
    return dashboard_views.get_active_org(request)


def _is_org_admin_user(user):
    if not user or not user.is_authenticated:
        return False
    if user.is_superuser:
        return True
    profile = UserProfile.objects.filter(user=user).first()
    if not profile:
        return False
    return profile.role in ("company_admin", "superadmin", "super_admin")


def _json_body(request):
    try:
        return json.loads(request.body.decode("utf-8") or "{}")
    except json.JSONDecodeError:
        return None


def _company_payload(obj):
    digital_card = DigitalCard.objects.filter(company_profile=obj).first()
    catalogue_page = CataloguePage.objects.filter(company_profile=obj).first()
    return {
        "company_name": obj.company_name or "",
        "logo_url": obj.logo.url if obj.logo else "",
        "phone": obj.phone or "",
        "whatsapp_number": obj.whatsapp_number or "",
        "email": obj.email or "",
        "website": obj.website or "",
        "address": obj.address or "",
        "description": obj.description or "",
        "social_links": obj.social_links or {},
        "theme_color": obj.theme_color or "#22c55e",
        "product_highlights": obj.product_highlights or [],
        "digital_card_slug": digital_card.public_slug if digital_card else "",
        "catalogue_slug": catalogue_page.public_slug if catalogue_page else "",
        "digital_card_url": f"/card/{digital_card.public_slug}/" if digital_card else "",
        "catalogue_url": f"/catalogue/{catalogue_page.public_slug}/" if catalogue_page else "",
        "updated_at": obj.updated_at.isoformat() if obj.updated_at else "",
    }


def _settings_payload(obj, company_profile=None):
    welcome = (obj.welcome_message or "").strip()
    if not welcome and company_profile and company_profile.company_name:
        welcome = (
            f"Hi 👋 Welcome to {company_profile.company_name}.\n"
            "Reply:\n1 - View Products\n2 - Price Details\n3 - Contact Support"
        )
    return {
        "auto_reply_enabled": bool(obj.auto_reply_enabled),
        "welcome_message": welcome
        or "Hi 👋 Welcome to our business.\nReply:\n1 - View Products\n2 - Price Details\n3 - Contact Support",
    }


def _rule_payload(obj):
    return {
        "id": obj.id,
        "keyword": obj.keyword or "",
        "reply_message": obj.reply_message or "",
        "is_default": bool(obj.is_default),
        "sort_order": obj.sort_order or 0,
        "is_active": bool(obj.is_active),
    }


def _catalogue_payload(obj):
    return {
        "id": obj.id,
        "title": obj.title,
        "image_url": obj.image.url if obj.image else "",
        "price": obj.price or "",
        "description": obj.description or "",
        "category": obj.category or "",
        "order_button_enabled": bool(obj.order_button_enabled),
        "sort_order": obj.sort_order or 0,
        "is_active": bool(obj.is_active),
    }


def _catalogue_page_payload(obj, company_profile=None):
    company_profile = company_profile or getattr(obj, "company_profile", None)
    return {
        "public_slug": obj.public_slug if obj else "",
        "is_active": bool(obj.is_active) if obj else True,
        "about_title": (obj.about_title if obj else "") or "About Us",
        "about_content": (obj.about_content if obj else "") or "",
        "services_title": (obj.services_title if obj else "") or "Services",
        "services_content": (obj.services_content if obj else "") or "",
        "contact_title": (obj.contact_title if obj else "") or "Contact",
        "contact_note": (obj.contact_note if obj else "") or "",
        "contact": {
            "phone": (company_profile.phone if company_profile else "") or "",
            "whatsapp_number": (company_profile.whatsapp_number if company_profile else "") or "",
            "email": (company_profile.email if company_profile else "") or "",
            "website": (company_profile.website if company_profile else "") or "",
            "address": (company_profile.address if company_profile else "") or "",
        },
    }


@login_required
@require_http_methods(["GET", "PUT"])
def company_profile_settings(request):
    org = _get_org(request)
    if not org:
        return JsonResponse({"error": "organization_required", "redirect": "/select-organization/"}, status=403)
    profile, _ = CompanyProfile.objects.get_or_create(organization=org)
    if request.method == "GET":
        return JsonResponse({"company_profile": _company_payload(profile)})
    if not _is_org_admin_user(request.user):
        return HttpResponseForbidden("Access denied.")
    data = _json_body(request)
    if data is None:
        return JsonResponse({"error": "invalid_json"}, status=400)
    for field in ("company_name", "phone", "whatsapp_number", "email", "website", "address", "description", "theme_color"):
        if field in data:
            setattr(profile, field, str(data.get(field) or "").strip())
    if "social_links" in data and isinstance(data.get("social_links"), dict):
        profile.social_links = data.get("social_links") or {}
    if "product_highlights" in data and isinstance(data.get("product_highlights"), list):
        profile.product_highlights = [str(item).strip() for item in data.get("product_highlights") if str(item).strip()]
    profile.updated_by = request.user
    profile.save()
    return JsonResponse({"company_profile": _company_payload(profile)})


@login_required
@require_http_methods(["GET", "PUT"])
def whatsapp_settings_api(request):
    org = _get_org(request)
    if not org:
        return JsonResponse({"error": "organization_required", "redirect": "/select-organization/"}, status=403)
    settings_obj, _ = WhatsappSettings.objects.get_or_create(organization=org)
    company_profile = CompanyProfile.objects.filter(organization=org).first()
    if request.method == "GET":
        return JsonResponse({"settings": _settings_payload(settings_obj, company_profile=company_profile)})
    if not _is_org_admin_user(request.user):
        return HttpResponseForbidden("Access denied.")
    data = _json_body(request)
    if data is None:
        return JsonResponse({"error": "invalid_json"}, status=400)
    if "auto_reply_enabled" in data:
        settings_obj.auto_reply_enabled = bool(data.get("auto_reply_enabled"))
    if "welcome_message" in data:
        settings_obj.welcome_message = str(data.get("welcome_message") or "").strip()
    settings_obj.save()
    return JsonResponse({"settings": _settings_payload(settings_obj, company_profile=company_profile)})


@login_required
@require_http_methods(["GET", "POST"])
def automation_rules_api(request):
    org = _get_org(request)
    if not org:
        return JsonResponse({"error": "organization_required", "redirect": "/select-organization/"}, status=403)
    if request.method == "GET":
        rows = AutomationRule.objects.filter(organization=org)
        return JsonResponse({"rules": [_rule_payload(row) for row in rows]})
    if not _is_org_admin_user(request.user):
        return HttpResponseForbidden("Access denied.")
    data = _json_body(request)
    if data is None:
        return JsonResponse({"error": "invalid_json"}, status=400)
    rule_id = data.get("id")
    if rule_id:
        rule = AutomationRule.objects.filter(id=rule_id, organization=org).first()
        if not rule:
            return JsonResponse({"error": "not_found"}, status=404)
    else:
        rule = AutomationRule(organization=org)
    keyword = str(data.get("keyword") or "").strip()
    reply_message = str(data.get("reply_message") or "").strip()
    if not reply_message:
        return JsonResponse({"reply_message": ["required"]}, status=400)
    rule.keyword = keyword
    rule.reply_message = reply_message
    rule.is_default = bool(data.get("is_default", False))
    rule.sort_order = int(data.get("sort_order") or 0)
    rule.is_active = bool(data.get("is_active", True))
    if rule.is_default:
        AutomationRule.objects.filter(organization=org, is_default=True).exclude(id=rule.id).update(is_default=False)
    rule.save()
    return JsonResponse({"rule": _rule_payload(rule)})


@login_required
@require_http_methods(["DELETE"])
def automation_rule_detail_api(request, rule_id):
    org = _get_org(request)
    if not org:
        return JsonResponse({"error": "organization_required", "redirect": "/select-organization/"}, status=403)
    if not _is_org_admin_user(request.user):
        return HttpResponseForbidden("Access denied.")
    deleted, _ = AutomationRule.objects.filter(id=rule_id, organization=org).delete()
    if not deleted:
        return JsonResponse({"error": "not_found"}, status=404)
    return JsonResponse({"status": "deleted"})


@login_required
@require_http_methods(["POST"])
def automation_preview_reply(request):
    org = _get_org(request)
    if not org:
        return JsonResponse({"error": "organization_required", "redirect": "/select-organization/"}, status=403)
    data = _json_body(request)
    if data is None:
        return JsonResponse({"error": "invalid_json"}, status=400)
    incoming = str(data.get("message") or "").strip()
    is_first_message = bool(data.get("is_first_message", False))
    settings_obj, _ = WhatsappSettings.objects.get_or_create(organization=org)
    company_profile = CompanyProfile.objects.filter(organization=org).first()
    if not settings_obj.auto_reply_enabled:
        return JsonResponse({"reply": "", "matched_rule": None, "auto_reply_enabled": False})
    rules = list(AutomationRule.objects.filter(organization=org, is_active=True))
    matched = None
    lower_incoming = incoming.lower()
    if lower_incoming:
        for rule in rules:
            keyword = (rule.keyword or "").strip().lower()
            if keyword and keyword in lower_incoming:
                matched = rule
                break
    if not matched:
        matched = next((rule for rule in rules if rule.is_default), None)
    if matched:
        return JsonResponse({
            "reply": matched.reply_message or "",
            "matched_rule": _rule_payload(matched),
            "auto_reply_enabled": True,
            "is_first_message": is_first_message,
        })
    default_welcome = _settings_payload(settings_obj, company_profile=company_profile).get("welcome_message", "")
    return JsonResponse({
        "reply": default_welcome,
        "matched_rule": None,
        "auto_reply_enabled": True,
        "is_first_message": is_first_message,
    })


@login_required
@require_http_methods(["GET", "POST"])
def catalogue_products_api(request):
    org = _get_org(request)
    if not org:
        return JsonResponse({"error": "organization_required", "redirect": "/select-organization/"}, status=403)
    if request.method == "GET":
        rows = CatalogueProduct.objects.filter(organization=org)
        return JsonResponse({"products": [_catalogue_payload(row) for row in rows]})
    if not _is_org_admin_user(request.user):
        return HttpResponseForbidden("Access denied.")
    data = _json_body(request)
    if data is None:
        return JsonResponse({"error": "invalid_json"}, status=400)
    row_id = data.get("id")
    if row_id:
        row = CatalogueProduct.objects.filter(id=row_id, organization=org).first()
        if not row:
            return JsonResponse({"error": "not_found"}, status=404)
    else:
        row = CatalogueProduct(organization=org)
    title = str(data.get("title") or "").strip()
    if not title:
        return JsonResponse({"title": ["required"]}, status=400)
    row.title = title
    row.price = str(data.get("price") or "").strip()
    row.description = str(data.get("description") or "").strip()
    row.category = str(data.get("category") or "").strip()
    row.order_button_enabled = bool(data.get("order_button_enabled", True))
    row.sort_order = int(data.get("sort_order") or 0)
    row.is_active = bool(data.get("is_active", True))
    row.save()
    return JsonResponse({"product": _catalogue_payload(row)})


@login_required
@require_http_methods(["DELETE"])
def catalogue_product_detail_api(request, product_id):
    org = _get_org(request)
    if not org:
        return JsonResponse({"error": "organization_required", "redirect": "/select-organization/"}, status=403)
    if not _is_org_admin_user(request.user):
        return HttpResponseForbidden("Access denied.")
    deleted, _ = CatalogueProduct.objects.filter(id=product_id, organization=org).delete()
    if not deleted:
        return JsonResponse({"error": "not_found"}, status=404)
    return JsonResponse({"status": "deleted"})


@login_required
@require_http_methods(["GET", "PUT"])
def catalogue_page_settings_api(request):
    org = _get_org(request)
    if not org:
        return JsonResponse({"error": "organization_required", "redirect": "/select-organization/"}, status=403)
    company_profile, _ = CompanyProfile.objects.get_or_create(organization=org)
    catalogue_page = CataloguePage.objects.filter(company_profile=company_profile).first()
    if not catalogue_page:
        # Auto-create should usually happen from signals, but keep API resilient.
        from .models import build_unique_public_slug
        catalogue_page = CataloguePage.objects.create(
            company_profile=company_profile,
            public_slug=build_unique_public_slug(CataloguePage, company_profile.company_name or org.name, fallback_prefix="catalogue"),
        )
    if request.method == "GET":
        return JsonResponse({"catalogue_page": _catalogue_page_payload(catalogue_page, company_profile=company_profile)})
    if not _is_org_admin_user(request.user):
        return HttpResponseForbidden("Access denied.")
    data = _json_body(request)
    if data is None:
        return JsonResponse({"error": "invalid_json"}, status=400)
    for field in ("about_title", "about_content", "services_title", "services_content", "contact_title", "contact_note"):
        if field in data:
            setattr(catalogue_page, field, str(data.get(field) or "").strip())
    if "is_active" in data:
        catalogue_page.is_active = bool(data.get("is_active"))
    catalogue_page.save()
    return JsonResponse({"catalogue_page": _catalogue_page_payload(catalogue_page, company_profile=company_profile)})
