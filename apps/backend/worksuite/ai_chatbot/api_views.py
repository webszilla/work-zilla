import json
import os
import secrets
import io
import zipfile
from html.parser import HTMLParser
from html import escape as html_escape
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError
from decimal import Decimal, ROUND_HALF_UP
from datetime import timedelta
from urllib.parse import urlparse, urljoin

from django.contrib.auth.decorators import login_required
from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError
from django.core.cache import cache
from django.core.files.base import ContentFile
from django.http import JsonResponse, HttpResponse
from django.db import models, transaction
from django.db.models import Q
from django.utils.text import slugify
from django.utils import timezone
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_http_methods

from core.models import Subscription, UserProfile, OrganizationSettings, ChatWidget, ChatConversation, ChatMessage, ChatTransferLog, ChatLead, ChatEnquiryLead, AiUsageCounter, AiUsageMonthly, AiMediaLibraryItem, AiFaq
from core.serializers import AiMediaLibraryItemSerializer, AiFaqSerializer
from core.observability import log_event
from core.subscription_utils import is_subscription_active
from apps.backend.ai_chatbot.services.ai_limits import can_use_ai
from apps.backend.ai_chatbot.services.plan_limits import get_org_plan_limits, get_org_retention_days
from apps.backend.ai_chatbot.services.ai_usage import record_ai_usage


def _money(value):
    return Decimal(value or 0).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def _resolve_org_for_user(user):
    profile = UserProfile.objects.filter(user=user).select_related("organization").first()
    if profile and profile.organization:
        return profile.organization
    if user:
        return getattr(user, "owned_organization", None)
    return None


def _is_org_admin(user):
    if not user or not user.is_authenticated:
        return False
    if user.is_superuser or user.is_staff:
        return True
    profile = UserProfile.objects.filter(user=user).first()
    return bool(profile and profile.role in {"company_admin", "superadmin"})


def _is_saas_admin(user):
    if not user or not user.is_authenticated:
        return False
    return bool(user.is_superuser or user.is_staff)


def _is_agent_or_admin(user):
    if _is_org_admin(user):
        return True
    profile = UserProfile.objects.filter(user=user).first()
    return bool(profile and profile.role == "ai_chatbot_agent")


def _is_agent(user):
    if not user or not user.is_authenticated:
        return False
    profile = UserProfile.objects.filter(user=user).first()
    return bool(profile and profile.role == "ai_chatbot_agent")


def _require_active_subscription(org):
    subscription = (
        Subscription.objects
        .filter(organization=org, status__in=("active", "trialing"), plan__product__slug="ai-chatbot")
        .select_related("plan")
        .order_by("-start_date")
        .first()
    )
    if not subscription:
        return None, "subscription_required"
    if not is_subscription_active(subscription):
        return None, "trial_ended" if subscription.status == "trialing" else "subscription_required"
    return subscription, None


def _get_org_timezone(org):
    if not org:
        return "UTC"
    settings_obj = OrganizationSettings.objects.filter(organization=org).first()
    if settings_obj and settings_obj.org_timezone:
        return settings_obj.org_timezone
    return "UTC"

def _get_chat_settings(org):
    settings_obj, _ = OrganizationSettings.objects.get_or_create(organization=org)
    replies = [line.strip() for line in settings_obj.ai_chatbot_premade_replies.splitlines() if line.strip()]
    return settings_obj, replies


def _get_client_domain(request):
    origin = request.META.get("HTTP_ORIGIN", "")
    referer = request.META.get("HTTP_REFERER", "")
    for value in (origin, referer):
        if not value:
            continue
        try:
            parsed = urlparse(value)
        except ValueError:
            continue
        if parsed.hostname:
            return parsed.hostname.lower()
    return ""


def _get_client_ip(request):
    forwarded = request.META.get("HTTP_X_FORWARDED_FOR", "")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.META.get("REMOTE_ADDR", "") or ""


def _get_source_url(request, payload=None):
    if payload and payload.get("source_url"):
        return str(payload.get("source_url", "")).strip()
    return request.META.get("HTTP_REFERER", "")[:500]


def _current_period():
    return timezone.now().strftime("%Y%m")


def get_period_yyyymm(now=None):
    return (now or timezone.now()).strftime("%Y%m")


def _get_ai_usage(org):
    period = _current_period()
    usage, _ = AiUsageMonthly.objects.get_or_create(
        organization=org,
        product_slug="ai-chatbot",
        period_yyyymm=period,
        defaults={"ai_replies_used": 0},
    )
    return usage


def _prune_chat_history(org):
    retention_days = get_org_retention_days(org, default_days=30)
    if not retention_days or retention_days <= 0:
        return retention_days
    cutoff = timezone.now() - timedelta(days=retention_days)
    stale_conversations = ChatConversation.objects.filter(
        organization=org
    ).filter(
        Q(last_message_at__lt=cutoff) | Q(last_message_at__isnull=True, created_at__lt=cutoff)
    )
    if stale_conversations.exists():
        ChatMessage.objects.filter(conversation__in=stale_conversations).delete()
        stale_conversations.delete()
    return retention_days


def _delete_messages_with_attachments(messages):
    for message in list(messages):
        if message.attachment:
            message.attachment.delete(save=False)
        message.delete()


def _prune_chat_attachments(org):
    retention_days = get_org_retention_days(org, default_days=30)
    if not retention_days or retention_days <= 0:
        return retention_days
    cutoff = timezone.now() - timedelta(days=retention_days)
    stale_messages = (
        ChatMessage.objects
        .filter(conversation__organization=org, attachment__isnull=False, created_at__lt=cutoff)
        .select_related("conversation")
    )
    if stale_messages.exists():
        _delete_messages_with_attachments(stale_messages)
    return retention_days

def increment_ai_usage(org, tokens_total=0, cost_usd=0):
    period = _current_period()
    obj, created = AiUsageMonthly.objects.get_or_create(
        organization=org,
        product_slug="ai-chatbot",
        period_yyyymm=period,
        defaults={
            "ai_replies_used": 1,
            "tokens_total": int(tokens_total or 0),
            "cost_usd_total": cost_usd or 0,
        },
    )
    if not created:
        AiUsageMonthly.objects.filter(pk=obj.pk).update(
            ai_replies_used=models.F("ai_replies_used") + 1,
            tokens_total=models.F("tokens_total") + int(tokens_total or 0),
            cost_usd_total=models.F("cost_usd_total") + (cost_usd or 0),
        )
    return obj


def _split_allowed_domains(raw_value):
    if not raw_value:
        return []
    if isinstance(raw_value, (list, tuple)):
        items = [str(item).strip() for item in raw_value if str(item).strip()]
    else:
        cleaned = raw_value.replace(",", "\n")
        items = [item.strip() for item in cleaned.splitlines() if item.strip()]
    normalized = []
    for item in items:
        value = item.lower()
        if "://" in value:
            try:
                parsed = urlparse(value)
                if parsed.hostname:
                    value = parsed.hostname.lower()
            except ValueError:
                pass
        normalized.append(value)
    return normalized


ALLOWED_ATTACHMENT_EXTENSIONS = {
    ".png",
    ".jpg",
    ".jpeg",
    ".gif",
    ".webp",
    ".pdf",
    ".doc",
    ".docx",
    ".xls",
    ".xlsx",
    ".txt",
    ".csv",
}
MAX_ATTACHMENT_SIZE = 5 * 1024 * 1024
MAX_FAQS_PER_ORG = 50
AI_MEDIA_ALLOWED_EXTENSIONS = {
    ".pdf": "pdf",
    ".doc": "word",
    ".docx": "word",
    ".txt": "text",
}


def _is_domain_allowed(widget, request):
    allowed = _split_allowed_domains(widget.allowed_domains)
    if not allowed:
        return True
    referer = request.META.get("HTTP_REFERER", "")
    if referer:
        try:
            parsed = urlparse(referer)
            if parsed.path and parsed.path.startswith("/ai-chatbox/"):
                return True
        except ValueError:
            pass
    host = _get_client_domain(request)
    if not host:
        return False
    for domain in allowed:
        if host == domain or host.endswith(f".{domain}"):
            return True
    return False


def _rate_limit(request, key_prefix, limit=60, window_seconds=60, key_suffix=None):
    client_ip = _get_client_ip(request)
    suffix = key_suffix or client_ip
    cache_key = f"ai_chatbot_rl:{key_prefix}:{suffix}"
    try:
        current = cache.get(cache_key)
        if current is None:
            cache.set(cache_key, 1, timeout=window_seconds)
            return False
        if int(current) >= limit:
            return True
        cache.incr(cache_key)
        return False
    except Exception:
        return False


def _serialize_message(message):
    sender_name = ""
    if message.sender_type == "agent":
        if message.sender_user:
            sender_name = f"{message.sender_user.first_name} {message.sender_user.last_name}".strip() or message.sender_user.username
        else:
            sender_name = "Agent"
    elif message.sender_type == "bot":
        sender_name = "Work Zilla"
    elif message.sender_type == "visitor":
        sender_name = (message.conversation.visitor_name or "").strip()
        if not sender_name:
            sender_name = "Visitor"
    return {
        "id": message.id,
        "sender_type": message.sender_type,
        "sender_name": sender_name,
        "text": message.text,
        "attachment_url": message.attachment.url if message.attachment else "",
        "attachment_name": message.attachment_name or "",
        "attachment_type": message.attachment_type or "",
        "attachment_size": message.attachment_size or 0,
        "created_at": message.created_at.isoformat(),
    }


def _fetch_last_messages(conversation, limit=50):
    qs = ChatMessage.objects.filter(conversation=conversation)
    if limit:
        rows = list(qs.order_by("-created_at")[:limit])
        rows.reverse()
        return [_serialize_message(item) for item in rows]
    return [_serialize_message(item) for item in qs.order_by("created_at")]


def _visitor_presence(last_seen, now=None):
    if not last_seen:
        return "offline"
    delta = (now or timezone.now()) - last_seen
    if delta <= timedelta(minutes=2):
        return "online"
    if delta <= timedelta(minutes=10):
        return "idle"
    return "offline"


def _parse_json_body(request):
    try:
        raw = request.body.decode("utf-8")
        if not raw:
            return {}
        return json.loads(raw)
    except (ValueError, TypeError):
        return {}


def _is_valid_http_url(value):
    if not value:
        return False
    try:
        parsed = urlparse(value)
    except ValueError:
        return False
    return parsed.scheme in {"http", "https"} and bool(parsed.netloc)


def _fetch_website_html(source_url, timeout_seconds=12):
    request = Request(
        source_url,
        headers={
            "User-Agent": "WorkZillaBot/1.0 (+https://workzilla.local)",
            "Accept": "text/html,application/xhtml+xml",
        },
    )
    with urlopen(request, timeout=timeout_seconds) as response:
        content_type = response.headers.get("Content-Type", "")
        if "text/html" not in content_type and "application/xhtml+xml" not in content_type:
            raise ValueError("unsupported_content_type")
        raw = response.read()
        return raw.decode("utf-8", errors="replace")


def _log_import_failure(org, user, url, error_code, detected_reason=""):
    log_event(
        "website_import_failed",
        status="failed",
        org=org,
        user=user,
        product_slug="ai-chatbot",
        meta={
            "url": url,
            "error_code": error_code,
            "detected_reason": detected_reason,
        },
    )


def _failure_response(error_code, reason, suggestion, status=400, info_note=""):
    payload = {
        "status": "failed",
        "error_code": error_code,
        "reason": reason,
        "suggestion": suggestion,
    }
    if info_note:
        payload["info_note"] = info_note
    return JsonResponse(payload, status=status)


def _create_website_placeholder(org, user, source_url, name):
    if not org:
        return None
    existing = AiMediaLibraryItem.objects.filter(
        organization=org,
        type="word_website_data",
    ).first()
    if existing:
        return existing
    safe_name = name or (urlparse(source_url).netloc if source_url else "") or "Website data"
    return AiMediaLibraryItem.objects.create(
        organization=org,
        name=safe_name,
        type="word_website_data",
        source_url=source_url or "",
        file_size=0,
        is_auto_generated=False,
        created_by=user,
    )


def _detect_blocked_or_login(html, readable_length=0):
    text = (html or "").lower()
    if "cloudflare" in text or "cf-browser-verification" in text or "attention required" in text or "just a moment" in text:
        return "ACCESS_BLOCKED"
    if "captcha" in text or "bot protection" in text:
        return "ACCESS_BLOCKED"
    if "checking your browser" in text or "access denied" in text or "request blocked" in text:
        return "ACCESS_BLOCKED"
    if "login" in text and ("password" in text or "sign in" in text):
        return "LOGIN_REQUIRED"
    if "enable javascript" in text or "please enable javascript" in text:
        return "JS_RENDER_REQUIRED"
    if "javascript required" in text or "requires javascript" in text:
        return "JS_RENDER_REQUIRED"
    if ("wp-content" in text or "wp-includes" in text) and readable_length < 300:
        return "ACCESS_BLOCKED"
    return ""


class _ReadableTextExtractor(HTMLParser):
    IGNORE_TAGS = {
        "script",
        "style",
        "noscript",
        "svg",
        "canvas",
        "iframe",
        "nav",
        "footer",
        "header",
        "aside",
        "form",
    }
    BLOCK_TAGS = {"p", "div", "section", "article", "li"}
    HEADING_TAGS = {"h1", "h2", "h3", "h4", "h5", "h6"}
    BAD_ATTR_HINTS = {"ad", "ads", "promo", "banner", "cookie", "subscribe", "signup"}

    def __init__(self):
        super().__init__()
        self.title = ""
        self._current_tag = ""
        self._ignore_depth = 0
        self._text_chunks = []
        self._entries = []

    def handle_starttag(self, tag, attrs):
        if tag == "title":
            self._current_tag = "title"
            return
        if self._ignore_depth:
            self._ignore_depth += 1
            return
        if tag in self.IGNORE_TAGS:
            self._ignore_depth = 1
            return
        if attrs:
            for key, value in attrs:
                if key in {"id", "class"} and value:
                    hint = str(value).lower()
                    if any(token in hint for token in self.BAD_ATTR_HINTS):
                        self._ignore_depth = 1
                        return
        if tag in self.BLOCK_TAGS or tag in self.HEADING_TAGS:
            self._flush_text()
            self._current_tag = tag

    def handle_endtag(self, tag):
        if tag == "title":
            self._current_tag = ""
            return
        if self._ignore_depth:
            self._ignore_depth -= 1
            return
        if tag in self.BLOCK_TAGS or tag in self.HEADING_TAGS:
            self._flush_text()
            self._current_tag = ""

    def handle_data(self, data):
        if self._ignore_depth:
            return
        text = (data or "").strip()
        if not text:
            return
        if self._current_tag == "title" and not self.title:
            self.title = text
            return
        self._text_chunks.append(text)

    def _flush_text(self):
        if not self._text_chunks:
            return
        text = " ".join(self._text_chunks).strip()
        self._text_chunks = []
        if not text:
            return
        self._entries.append((self._current_tag, text))

    def extract(self):
        self._flush_text()
        return self.title, self._entries


class _FallbackTextExtractor(HTMLParser):
    def __init__(self):
        super().__init__()
        self._ignore_depth = 0
        self._chunks = []

    def handle_starttag(self, tag, attrs):
        if tag in {"script", "style", "noscript"}:
            self._ignore_depth += 1

    def handle_endtag(self, tag):
        if self._ignore_depth and tag in {"script", "style", "noscript"}:
            self._ignore_depth -= 1

    def handle_data(self, data):
        if self._ignore_depth:
            return
        text = (data or "").strip()
        if text:
            self._chunks.append(text)

    def extract(self):
        if not self._chunks:
            return ""
        text = " ".join(self._chunks).strip()
        return text


class _MetaExtractor(HTMLParser):
    def __init__(self):
        super().__init__()
        self.title = ""
        self._current_tag = ""
        self.meta = {}

    def handle_starttag(self, tag, attrs):
        if tag == "title":
            self._current_tag = "title"
            return
        if tag != "meta":
            return
        attrs_dict = {key.lower(): value for key, value in attrs if key and value}
        name = (attrs_dict.get("name") or attrs_dict.get("property") or "").lower()
        content = attrs_dict.get("content") or ""
        if name and content:
            self.meta[name] = content.strip()

    def handle_endtag(self, tag):
        if tag == "title":
            self._current_tag = ""

    def handle_data(self, data):
        if self._current_tag == "title" and not self.title:
            text = (data or "").strip()
            if text:
                self.title = text

    def extract(self):
        return self.title, self.meta


class _TagTextExtractor(HTMLParser):
    BLOCK_TAGS = {"p", "div", "section", "article", "li"}
    HEADING_TAGS = {"h1", "h2", "h3", "h4", "h5", "h6"}

    def __init__(self, include_tags=None, exclude_tags=None):
        super().__init__()
        self.include_tags = set(include_tags or [])
        self.exclude_tags = set(exclude_tags or [])
        self.title = ""
        self._current_tag = ""
        self._ignore_depth = 0
        self._include_depth = 0
        self._text_chunks = []
        self._entries = []

    def handle_starttag(self, tag, attrs):
        if tag == "title":
            self._current_tag = "title"
            return
        if tag in self.exclude_tags:
            self._ignore_depth += 1
            return
        if self._ignore_depth:
            return
        if self.include_tags:
            if tag in self.include_tags:
                self._include_depth += 1
            if self._include_depth == 0:
                return
        if tag in self.BLOCK_TAGS or tag in self.HEADING_TAGS:
            self._flush_text()
            self._current_tag = tag

    def handle_endtag(self, tag):
        if tag == "title":
            self._current_tag = ""
            return
        if tag in self.exclude_tags and self._ignore_depth:
            self._ignore_depth -= 1
            return
        if self._ignore_depth:
            return
        if self.include_tags and tag in self.include_tags and self._include_depth:
            self._include_depth -= 1
        if tag in self.BLOCK_TAGS or tag in self.HEADING_TAGS:
            self._flush_text()
            self._current_tag = ""

    def handle_data(self, data):
        if self._ignore_depth:
            return
        if self.include_tags and self._include_depth == 0:
            return
        text = (data or "").strip()
        if not text:
            return
        if self._current_tag == "title" and not self.title:
            self.title = text
            return
        self._text_chunks.append(text)

    def _flush_text(self):
        if not self._text_chunks:
            return
        text = " ".join(self._text_chunks).strip()
        self._text_chunks = []
        if not text:
            return
        self._entries.append((self._current_tag or "p", text))

    def extract(self):
        self._flush_text()
        return self.title, self._entries


class _DensityExtractor(HTMLParser):
    CONTAINER_TAGS = {"div", "section", "article", "main"}
    EXCLUDE_TAGS = {"header", "footer", "nav", "script", "style", "aside", "form"}

    def __init__(self):
        super().__init__()
        self._ignore_depth = 0
        self._containers = {}
        self._stack = []
        self._link_depth = 0
        self._counter = 0

    def handle_starttag(self, tag, attrs):
        if tag in self.EXCLUDE_TAGS:
            self._ignore_depth += 1
            return
        if self._ignore_depth:
            return
        if tag in self.CONTAINER_TAGS:
            self._counter += 1
            container_id = self._counter
            self._containers[container_id] = {"text_len": 0, "link_text_len": 0, "chunks": []}
            self._stack.append(container_id)
        if tag == "a":
            self._link_depth += 1

    def handle_endtag(self, tag):
        if tag in self.EXCLUDE_TAGS and self._ignore_depth:
            self._ignore_depth -= 1
            return
        if self._ignore_depth:
            return
        if tag in self.CONTAINER_TAGS and self._stack:
            self._stack.pop()
        if tag == "a" and self._link_depth:
            self._link_depth -= 1

    def handle_data(self, data):
        if self._ignore_depth:
            return
        text = (data or "").strip()
        if not text or not self._stack:
            return
        text_len = len(text)
        for container_id in self._stack:
            container = self._containers.get(container_id)
            if not container:
                continue
            container["text_len"] += text_len
            container["chunks"].append(text)
            if self._link_depth:
                container["link_text_len"] += text_len

    def best_text(self):
        best_score = 0
        best_text = ""
        for container in self._containers.values():
            text_len = container["text_len"]
            if text_len <= 0:
                continue
            score = text_len - (container["link_text_len"] * 0.7)
            if score > best_score:
                best_score = score
                best_text = " ".join(container["chunks"]).strip()
        return best_text


def _count_words(entries):
    return sum(len(text.split()) for _, text in entries if text)


def _extract_multi_pass_content(html):
    exclude = {"header", "footer", "nav", "script", "style", "aside", "form"}
    meta_parser = _MetaExtractor()
    meta_parser.feed(html or "")
    meta_title, _ = meta_parser.extract()

    best_entries = []
    best_title = meta_title or ""
    best_words = 0

    pass1_parser = _TagTextExtractor(include_tags={"main", "article", "section"}, exclude_tags=exclude)
    pass1_parser.feed(html or "")
    title1, entries1 = pass1_parser.extract()
    words1 = _count_words(entries1)
    if words1 > best_words:
        best_entries = entries1
        best_words = words1
        best_title = title1 or best_title

    density_parser = _DensityExtractor()
    density_parser.feed(html or "")
    dense_text = density_parser.best_text()
    if dense_text:
        entries2 = [("p", dense_text)]
        words2 = _count_words(entries2)
        if words2 > best_words:
            best_entries = entries2
            best_words = words2

    pass3_parser = _TagTextExtractor(include_tags={"body"}, exclude_tags=exclude)
    pass3_parser.feed(html or "")
    title3, entries3 = pass3_parser.extract()
    words3 = _count_words(entries3)
    if words3 > best_words:
        best_entries = entries3
        best_words = words3
        best_title = title3 or best_title

    return best_title, best_entries, best_words


class _LinkExtractor(HTMLParser):
    def __init__(self):
        super().__init__()
        self.links = []

    def handle_starttag(self, tag, attrs):
        if tag != "a":
            return
        for key, value in attrs:
            if key == "href" and value:
                self.links.append(value)


class _MenuLinkExtractor(HTMLParser):
    def __init__(self):
        super().__init__()
        self.links = []
        self._include_depth = 0
        self._tag_stack = []
        self._current_href = ""
        self._current_text = []

    def handle_starttag(self, tag, attrs):
        attrs_dict = {key.lower(): value for key, value in attrs if key}
        class_hint = (attrs_dict.get("class") or "").lower()
        id_hint = (attrs_dict.get("id") or "").lower()
        if tag in {"nav", "header"} or "menu" in class_hint or "nav" in class_hint or "menu" in id_hint or "nav" in id_hint:
            self._include_depth += 1
        self._tag_stack.append(tag)
        if tag == "a" and self._include_depth:
            self._current_href = attrs_dict.get("href") or ""
            self._current_text = []

    def handle_endtag(self, tag):
        if tag == "a" and self._include_depth and self._current_href:
            text = " ".join(self._current_text).strip()
            self.links.append({"href": self._current_href, "text": text})
            self._current_href = ""
            self._current_text = []
        if self._tag_stack:
            self._tag_stack.pop()
        if tag in {"nav", "header"} or (self._include_depth and not self._tag_stack):
            self._include_depth = max(0, self._include_depth - 1)

    def handle_data(self, data):
        if self._current_href:
            text = (data or "").strip()
            if text:
                self._current_text.append(text)


def _normalize_url(url):
    if not url:
        return ""
    try:
        parsed = urlparse(url)
    except ValueError:
        return ""
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        return ""
    cleaned = parsed._replace(fragment="")
    return cleaned.geturl()


def _is_same_domain(base_netloc, candidate_netloc):
    if not base_netloc or not candidate_netloc:
        return False
    base = base_netloc.lower()
    cand = candidate_netloc.lower()
    if cand == base:
        return True
    if cand == f"www.{base}":
        return True
    if base == f"www.{cand}":
        return True
    return cand.endswith(f".{base}")


def _classify_page_type(url):
    if not url:
        return "other"
    path = urlparse(url).path.lower()
    if path in {"", "/"}:
        return "home"
    tokens = ("/" + path.strip("/")).split("/")
    text = "/".join(tokens)
    if "about" in text or "company" in text:
        return "about"
    if "service" in text or "services" in text:
        return "services"
    if "printing" in text or "print" in text:
        return "services"
    if "pricing" in text or "price" in text:
        return "pricing"
    if "contact" in text:
        return "contact"
    if "faq" in text:
        return "faq"
    if "privacy" in text or "policy" in text or "policies" in text or "terms" in text or "legal" in text:
        return "policies"
    if "support" in text or "help" in text:
        return "support"
    if "feature" in text:
        return "features"
    if "solution" in text or "solutions" in text:
        return "solutions"
    if "product" in text or "products" in text or "shop" in text or "store" in text:
        return "product"
    if "gallery" in text:
        return "gallery"
    if "blog" in text or "news" in text or "article" in text or "post" in text:
        return "blog"
    return "other"


def _is_excluded_internal_url(url):
    if not url:
        return True
    parsed = urlparse(url)
    path = parsed.path.lower()
    if parsed.query:
        return True
    if "#" in url:
        return True
    if path.endswith((".pdf", ".png", ".jpg", ".jpeg", ".webp", ".svg", ".zip", ".doc", ".docx")):
        return True
    if "/blog/" in path or "/blogs/" in path or "/news/" in path or "/article/" in path or "/post/" in path:
        return True
    if "/product/" in path or "/products/" in path or "/shop/" in path or "/store/" in path or "/item/" in path:
        return True
    if "/category/" in path or "/categories/" in path or "/collection/" in path or "/collections/" in path:
        return True
    if "/tag/" in path or "/tags/" in path or "/author/" in path:
        return True
    if "/gallery/" in path or "/galleries/" in path:
        return True
    if "/page/" in path or "page-" in path:
        return True
    if "?" in url or "&" in url:
        return True
    if path.rstrip("/").endswith(("/page", "/pages")):
        return True
    return False


def _scan_website_pages(source_url, html):
    base = urlparse(source_url)
    extractor = _LinkExtractor()
    extractor.feed(html or "")
    candidates = set()
    for href in extractor.links:
        if not href:
            continue
        if href.startswith(("mailto:", "tel:", "javascript:")):
            continue
        absolute = urljoin(source_url, href)
        normalized = _normalize_url(absolute)
        if not normalized:
            continue
        parsed = urlparse(normalized)
        if not _is_same_domain(base.netloc, parsed.netloc):
            continue
        if _is_excluded_internal_url(normalized):
            continue
        candidates.add(normalized)

    if not _is_excluded_internal_url(source_url):
        candidates.add(_normalize_url(source_url) or source_url)

    pages = sorted(candidates)
    page_types = {}
    page_entries = []
    for url in pages:
        page_type = _classify_page_type(url)
        page_types[page_type] = page_types.get(page_type, 0) + 1
        page_entries.append({"url": url, "type": page_type})
    return {
        "total_pages_found": len(pages),
        "page_types": page_types,
        "pages": page_entries,
    }


def _menu_pages_from_homepage(source_url, html):
    base = urlparse(source_url)
    extractor = _MenuLinkExtractor()
    extractor.feed(html or "")
    allowed_keywords = ("about", "service", "services", "printing", "pricing", "contact", "support")
    filtered = set()
    for link in extractor.links:
        href = link.get("href") or ""
        if not href:
            continue
        if href.startswith(("mailto:", "tel:", "javascript:")):
            continue
        absolute = urljoin(source_url, href)
        normalized = _normalize_url(absolute)
        if not normalized:
            continue
        parsed = urlparse(normalized)
        if not _is_same_domain(base.netloc, parsed.netloc):
            continue
        if _is_excluded_internal_url(normalized):
            continue
        text = f"{parsed.path} {link.get('text', '')}".lower()
        if not any(token in text for token in allowed_keywords):
            continue
        filtered.add(normalized)

    homepage_url = _normalize_url(source_url) or source_url
    pages = [{"url": homepage_url, "type": "home"}]
    for url in sorted(filtered):
        page_type = _classify_page_type(url)
        if page_type in {"blog", "product", "gallery"}:
            continue
        pages.append({"url": url, "type": page_type})
    return pages


def _limit_entries_by_words(title, entries, max_words=1800):
    words_used = 0
    limited = []
    for tag, text in entries:
        if not text:
            continue
        words = text.split()
        if not words:
            continue
        if words_used >= max_words:
            break
        remaining = max_words - words_used
        if len(words) > remaining:
            text = " ".join(words[:remaining])
            limited.append((tag, text))
            words_used += remaining
            break
        limited.append((tag, text))
        words_used += len(words)
    return title, limited


def _extract_page_content(url, max_words=1800):
    html = _fetch_website_html(url)
    title, entries, word_count = _extract_multi_pass_content(html)
    if not entries:
        fallback = _FallbackTextExtractor()
        fallback.feed(html)
        text = fallback.extract()
        if text:
            entries = [("p", text)]
            word_count = _count_words(entries)
    if not entries or word_count < 40:
        meta_parser = _MetaExtractor()
        meta_parser.feed(html)
        meta_title, meta = meta_parser.extract()
        description = (
            meta.get("description")
            or meta.get("og:description")
            or meta.get("twitter:description")
            or ""
        ).strip()
        if meta_title and not title:
            title = meta_title
        if description:
            entries = entries + [("p", description)] if entries else [("p", description)]
            word_count = _count_words(entries)
    title, limited_entries = _limit_entries_by_words(title, entries, max_words=max_words)
    limited_word_count = _count_words(limited_entries)
    return title, limited_entries, limited_word_count


def _normalize_text_signature(text):
    raw = " ".join(str(text or "").split()).strip().lower()
    return raw


def _add_horizontal_rule(body_parts):
    body_parts.append(
        "<w:p><w:pPr>"
        "<w:pBdr><w:bottom w:val=\"single\" w:sz=\"6\" w:space=\"4\" w:color=\"9CA3AF\"/></w:pBdr>"
        "</w:pPr><w:r><w:t xml:space=\"preserve\"></w:t></w:r></w:p>"
    )


def _append_paragraph(body_parts, text, style=None, bold=False, font_size=None, uppercase=False):
    if not text:
        return
    output_text = text.upper() if uppercase else text
    safe_text = _docx_escape(output_text)
    run_props = ""
    if bold:
        run_props += "<w:b/>"
    if font_size:
        size_value = int(font_size) * 2
        run_props += f"<w:sz w:val=\"{size_value}\"/>"
    run_props = f"<w:rPr>{run_props}</w:rPr>" if run_props else ""
    if style:
        body_parts.append(
            f"<w:p><w:pPr><w:pStyle w:val=\"{style}\"/></w:pPr>"
            f"<w:r>{run_props}<w:t xml:space=\"preserve\">{safe_text}</w:t></w:r></w:p>"
        )
    else:
        body_parts.append(
            f"<w:p><w:r>{run_props}<w:t xml:space=\"preserve\">{safe_text}</w:t></w:r></w:p>"
        )


def _build_docx_from_paragraphs(paragraphs):
    body_parts = []
    seen = set()
    for style, text, opts in paragraphs:
        allow_dedupe = not (opts and opts.get("dedupe") is False)
        signature = _normalize_text_signature(text) if allow_dedupe else ""
        if signature and signature in seen:
            continue
        if signature:
            seen.add(signature)
        if opts and opts.get("divider"):
            _add_horizontal_rule(body_parts)
            continue
        _append_paragraph(
            body_parts,
            text,
            style=style,
            bold=bool(opts.get("bold")) if opts else False,
            font_size=opts.get("font_size") if opts else None,
            uppercase=bool(opts.get("uppercase")) if opts else False,
        )

    document_xml = (
        "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>"
        "<w:document xmlns:w=\"http://schemas.openxmlformats.org/wordprocessingml/2006/main\">"
        "<w:body>"
        f"{''.join(body_parts)}"
        "<w:sectPr>"
        "<w:pgSz w:w=\"12240\" w:h=\"15840\"/>"
        "<w:pgMar w:top=\"1440\" w:right=\"1440\" w:bottom=\"1440\" w:left=\"1440\" "
        "w:header=\"708\" w:footer=\"708\" w:gutter=\"0\"/>"
        "</w:sectPr>"
        "</w:body></w:document>"
    )

    content_types_xml = (
        "<?xml version=\"1.0\" encoding=\"UTF-8\"?>"
        "<Types xmlns=\"http://schemas.openxmlformats.org/package/2006/content-types\">"
        "<Default Extension=\"rels\" ContentType=\"application/vnd.openxmlformats-package.relationships+xml\"/>"
        "<Default Extension=\"xml\" ContentType=\"application/xml\"/>"
        "<Override PartName=\"/word/document.xml\" "
        "ContentType=\"application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml\"/>"
        "</Types>"
    )

    rels_xml = (
        "<?xml version=\"1.0\" encoding=\"UTF-8\"?>"
        "<Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\">"
        "<Relationship Id=\"rId1\" "
        "Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument\" "
        "Target=\"word/document.xml\"/>"
        "</Relationships>"
    )

    doc_rels_xml = (
        "<?xml version=\"1.0\" encoding=\"UTF-8\"?>"
        "<Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\"/>"
    )

    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as docx:
        docx.writestr("[Content_Types].xml", content_types_xml)
        docx.writestr("_rels/.rels", rels_xml)
        docx.writestr("word/document.xml", document_xml)
        docx.writestr("word/_rels/document.xml.rels", doc_rels_xml)
    return buffer.getvalue()


def _docx_escape(text):
    return html_escape(text, quote=False)


def _build_docx_bytes(title, entries):
    paragraphs = []
    if title:
        paragraphs.append(("Heading1", title, {"bold": True, "dedupe": False}))
    for tag, text in entries:
        if not text:
            continue
        style = None
        if tag in {"h1", "h2"}:
            style = "Heading1"
        elif tag in {"h3", "h4"}:
            style = "Heading2"
        elif tag in {"h5", "h6"}:
            style = "Heading3"
        paragraphs.append((style, text, {}))
    return _build_docx_from_paragraphs(paragraphs)


def _serialize_media_item(item):
    return AiMediaLibraryItemSerializer(item).data


def _serialize_faq(item):
    return AiFaqSerializer(item).data


def _get_ai_library_usage_bytes(org):
    total = (
        AiMediaLibraryItem.objects
        .filter(organization=org)
        .aggregate(total=models.Sum("file_size"))
        .get("total")
    )
    return int(total or 0)


def _get_ai_library_limit_bytes(subscription):
    if not subscription or not subscription.plan:
        return None
    limit_mb = subscription.plan.ai_library_limit_mb
    if not limit_mb or limit_mb <= 0:
        return None
    return int(limit_mb) * 1024 * 1024


def _check_ai_library_storage(org, subscription, extra_bytes):
    limit_bytes = _get_ai_library_limit_bytes(subscription)
    if not limit_bytes:
        return True, 0, None
    usage_bytes = _get_ai_library_usage_bytes(org)
    return usage_bytes + int(extra_bytes or 0) <= limit_bytes, usage_bytes, limit_bytes


def _check_ai_library_storage_replace(org, subscription, old_bytes, new_bytes):
    limit_bytes = _get_ai_library_limit_bytes(subscription)
    if not limit_bytes:
        return True, 0, None
    usage_bytes = _get_ai_library_usage_bytes(org)
    projected = usage_bytes - int(old_bytes or 0) + int(new_bytes or 0)
    return projected <= limit_bytes, usage_bytes, limit_bytes


@login_required
@require_http_methods(["POST"])
def media_library_website_import(request):
    user = request.user
    org = _resolve_org_for_user(user)
    if not org or not _is_org_admin(user):
        return JsonResponse({"detail": "forbidden"}, status=403)
    subscription, error_detail = _require_active_subscription(org)
    if not subscription:
        detail = "Trial ended. Please upgrade your plan." if error_detail == "trial_ended" else "subscription_required"
        return JsonResponse({"detail": detail}, status=403)

    payload = _parse_json_body(request)
    source_url = str(payload.get("source_url") or payload.get("url") or "").strip()
    name = str(payload.get("name") or "").strip()
    selected_pages = payload.get("selected_pages") if isinstance(payload, dict) else None
    existing_website = AiMediaLibraryItem.objects.filter(
        organization=org,
        type="word_website_data",
    ).first()
    if existing_website:
        return JsonResponse({
            "status": "blocked",
            "message": "Website data already exists. Delete it before resubmitting.",
        }, status=409)

    if not _is_valid_http_url(source_url):
        _log_import_failure(org, user, source_url, "INVALID_URL")
        return _failure_response(
            "INVALID_URL",
            "The website address is not valid.",
            "Check the URL and try again.",
            status=400
        )

    try:
        html = _fetch_website_html(source_url)
    except HTTPError as error:
        code = error.code or 0
        if code in (401, 403, 429):
            _log_import_failure(org, user, source_url, "ACCESS_BLOCKED", f"http_status_{code}")
            item = _create_website_placeholder(org, user, source_url, name)
            response = _failure_response(
                "ACCESS_BLOCKED",
                "The website is blocking automated access.",
                "Download the page as Word and upload it manually.",
                status=403
            )
            if item:
                response_data = json.loads(response.content.decode("utf-8"))
                response_data["item"] = _serialize_media_item(item)
                return JsonResponse(response_data, status=403)
            return response
        if code in (404, 410):
            _log_import_failure(org, user, source_url, "WEBSITE_NOT_REACHABLE")
            return _failure_response(
                "WEBSITE_NOT_REACHABLE",
                "The website page was not found.",
                "Check the URL or try another page.",
                status=404
            )
        _log_import_failure(org, user, source_url, "WEBSITE_NOT_REACHABLE", "http_error")
        return _failure_response(
            "WEBSITE_NOT_REACHABLE",
            "The website could not be reached.",
            "Try again later or use a different URL.",
            status=502
        )
    except URLError:
        _log_import_failure(org, user, source_url, "WEBSITE_NOT_REACHABLE", "url_error")
        return _failure_response(
            "WEBSITE_NOT_REACHABLE",
            "The website could not be reached.",
            "Check your URL or try again later.",
            status=502
        )
    except ValueError:
        _log_import_failure(org, user, source_url, "NO_READABLE_CONTENT", "unsupported_content_type")
        item = _create_website_placeholder(org, user, source_url, name)
        response = _failure_response(
            "NO_READABLE_CONTENT",
            "This page does not provide readable text.",
            "Try another page or paste the content manually.",
            status=400
        )
        if item:
            response_data = json.loads(response.content.decode("utf-8"))
            response_data["item"] = _serialize_media_item(item)
            return JsonResponse(response_data, status=400)
        return response
    except Exception:
        _log_import_failure(org, user, source_url, "WEBSITE_NOT_REACHABLE", "fetch_exception")
        return _failure_response(
            "WEBSITE_NOT_REACHABLE",
            "The website could not be reached.",
            "Try again later or use a different URL.",
            status=502
        )

    readable_title, readable_entries, _ = _extract_multi_pass_content(html)
    readable_length = sum(len(text) for _, text in readable_entries)
    issue = _detect_blocked_or_login(html, readable_length=readable_length)
    if issue == "ACCESS_BLOCKED":
        info_note = ""
        if "wp-content" in (html or "").lower() or "wp-includes" in (html or "").lower():
            info_note = (
                "This appears to be a WordPress website with security protection enabled. "
                "Manual Word upload is the recommended method."
            )
        _log_import_failure(org, user, source_url, "ACCESS_BLOCKED", "blocked_html_or_wp")
        item = _create_website_placeholder(org, user, source_url, name)
        response = _failure_response(
            "ACCESS_BLOCKED",
            "The website is blocking automated access.",
            "Download the page as Word and upload it manually.",
            status=403,
            info_note=info_note
        )
        if item:
            response_data = json.loads(response.content.decode("utf-8"))
            response_data["item"] = _serialize_media_item(item)
            return JsonResponse(response_data, status=403)
        return response
    if issue == "LOGIN_REQUIRED":
        _log_import_failure(org, user, source_url, "LOGIN_REQUIRED", "login_required")
        item = _create_website_placeholder(org, user, source_url, name)
        response = _failure_response(
            "LOGIN_REQUIRED",
            "This page needs a login to access content.",
            "Login and download the page as Word, then upload it.",
            status=403
        )
        if item:
            response_data = json.loads(response.content.decode("utf-8"))
            response_data["item"] = _serialize_media_item(item)
            return JsonResponse(response_data, status=403)
        return response
    if issue == "JS_RENDER_REQUIRED":
        _log_import_failure(org, user, source_url, "JS_RENDER_REQUIRED", "js_required")
        item = _create_website_placeholder(org, user, source_url, name)
        response = _failure_response(
            "JS_RENDER_REQUIRED",
            "This website needs JavaScript to show content.",
            "Download the page as Word or paste the content manually.",
            status=400
        )
        if item:
            response_data = json.loads(response.content.decode("utf-8"))
            response_data["item"] = _serialize_media_item(item)
            return JsonResponse(response_data, status=400)
        return response

    menu_pages = _menu_pages_from_homepage(source_url, html)
    scan = {
        "total_pages_found": len(menu_pages),
        "page_types": {},
        "pages": menu_pages,
    }
    for page in menu_pages:
        page_type = page.get("type") or "other"
        scan["page_types"][page_type] = scan["page_types"].get(page_type, 0) + 1
    plan = subscription.plan if subscription else None
    page_limit = int(plan.website_page_limit or 0) if plan else 0

    allowed_pages = scan["pages"]
    allowed_urls = {row["url"] for row in allowed_pages}
    if selected_pages is not None and not isinstance(selected_pages, list):
        return JsonResponse({"detail": "invalid_selected_pages"}, status=400)

    if page_limit > 0 and selected_pages is None and scan["total_pages_found"] > page_limit:
        return JsonResponse({
            "detail": "website_page_limit_exceeded",
            "total_pages_found": scan["total_pages_found"],
            "allowed_pages": page_limit,
            "page_types": scan["page_types"],
            "pages": scan["pages"],
            "message": "Website has more pages than your plan allows. Please select pages manually.",
        }, status=409)

    pages_to_import = []
    if selected_pages is not None:
        for url in selected_pages:
            normalized = _normalize_url(url)
            if normalized and normalized in allowed_urls:
                pages_to_import.append(normalized)
        if not pages_to_import:
            return JsonResponse({"detail": "no_valid_pages_selected"}, status=400)
        if page_limit > 0 and len(pages_to_import) > page_limit:
            return JsonResponse({
                "detail": "selected_pages_exceed_limit",
                "total_pages_found": scan["total_pages_found"],
                "allowed_pages": page_limit,
                "selected_pages": len(pages_to_import),
                "message": "Selected pages exceed your plan limit.",
            }, status=400)
    else:
        normalized_source = _normalize_url(source_url) or source_url
        if normalized_source in allowed_urls:
            pages_to_import = [normalized_source]
        else:
            pages_to_import = [source_url]

    unique_pages = []
    seen_pages = set()
    for url in pages_to_import:
        if url in seen_pages:
            continue
        seen_pages.add(url)
        unique_pages.append(url)
    pages_to_import = unique_pages

    page_sections = []
    total_words = 0
    for url in pages_to_import:
        try:
            page_title, page_entries, page_words = _extract_page_content(url, max_words=1800)
        except (HTTPError, URLError, ValueError):
            continue
        except Exception:
            continue
        if not page_entries:
            continue
        total_words += page_words
        page_sections.append({
            "url": url,
            "title": page_title or url,
            "entries": page_entries,
        })

    if not page_sections:
        _log_import_failure(org, user, source_url, "NO_READABLE_CONTENT", "no_page_sections")
        item = _create_website_placeholder(org, user, source_url, name)
        response = _failure_response(
            "NO_READABLE_CONTENT",
            "We couldn't find readable text on this page.",
            "Try another URL or upload a Word file.",
            status=400
        )
        if item:
            response_data = json.loads(response.content.decode("utf-8"))
            response_data["item"] = _serialize_media_item(item)
            return JsonResponse(response_data, status=400)
        return response

    if not name:
        name = urlparse(source_url).netloc or "Website content"

    paragraphs = []
    paragraphs.append(("Heading1", "Website Overview", {"bold": True, "font_size": 16, "dedupe": False}))
    paragraphs.append((None, f"Source URL: {source_url}", {}))
    paragraphs.append((None, "", {}))
    sections = {
        "home": "HOME PAGE",
        "about": "ABOUT US",
        "services": "SERVICES",
        "pricing": "PRICING",
        "contact": "CONTACT",
        "support": "SUPPORT",
        "other": "OTHER MENU PAGES",
    }
    ordered_sections = ["home", "about", "services", "pricing", "contact", "support", "other"]
    grouped = {key: [] for key in sections}
    for section in page_sections:
        page_type = _classify_page_type(section["url"])
        key = page_type if page_type in grouped else "other"
        grouped[key].append(section)
    section_keywords = {
        "overview": ("overview", "about", "intro", "introduction"),
        "services": ("service", "services", "offer", "offering", "solution"),
        "products": ("product", "products", "package", "packages", "catalog"),
        "contact": ("contact", "reach", "call", "email", "phone", "address", "location"),
    }
    for key in ordered_sections:
        items = grouped.get(key) or []
        if not items:
            continue
        paragraphs.append(("Heading1", sections[key], {"bold": True, "font_size": 18, "uppercase": True, "dedupe": False}))
        for section in items:
            paragraphs.append(("Heading2", section["title"], {"bold": True, "dedupe": False}))
            paragraphs.append((None, f"Source: {section['url']}", {}))
            subsections = {key: [] for key in section_keywords}
            other_entries = []
            for tag, text in section["entries"]:
                normalized = " ".join(text.lower().split())
                matched = False
                for subkey, tokens in section_keywords.items():
                    if any(token in normalized for token in tokens):
                        subsections[subkey].append((tag, text))
                        matched = True
                        break
                if not matched:
                    other_entries.append((tag, text))
            for subkey, entries in subsections.items():
                if not entries:
                    continue
                paragraphs.append(("Heading3", subkey.upper(), {"bold": True, "dedupe": False}))
                for tag, text in entries:
                    paragraphs.append((None, text, {}))
            if other_entries:
                paragraphs.append(("Heading3", "OTHER", {"bold": True, "dedupe": False}))
                for tag, text in other_entries:
                    paragraphs.append((None, text, {}))
            paragraphs.append((None, f"[END OF {sections[key]}]", {"bold": True, "dedupe": False}))
            paragraphs.append((None, "", {"divider": True}))
    for section in page_sections:
        paragraphs.append(("Heading1", section["title"]))
        paragraphs.append((None, f"Source: {section['url']}"))
        for tag, text in section["entries"]:
            style = None
            if tag in {"h1", "h2"}:
                style = "Heading1"
            elif tag in {"h3", "h4"}:
                style = "Heading2"
            elif tag in {"h5", "h6"}:
                style = "Heading3"
            paragraphs.append((style, text))
    docx_bytes = _build_docx_from_paragraphs(paragraphs)
    allowed, usage_bytes, limit_bytes = _check_ai_library_storage(org, subscription, len(docx_bytes))
    if not allowed:
        return JsonResponse({
            "detail": "storage_limit_exceeded",
            "usage_bytes": usage_bytes,
            "limit_bytes": limit_bytes,
        }, status=413)
    safe_base = slugify(name) or "website-content"
    filename = f"{safe_base}-{secrets.token_hex(4)}.docx"
    item = AiMediaLibraryItem.objects.create(
        organization=org,
        name=name,
        type="word_website_data",
        source_url=source_url,
        file_path=ContentFile(docx_bytes, name=filename),
        file_size=len(docx_bytes),
        is_auto_generated=True,
        created_by=user,
    )
    response_payload = {"item": _serialize_media_item(item)}
    warning_payload = {}
    if total_words < 300:
        log_event(
            "website_import_limited_content",
            status="warning",
            org=org,
            user=user,
            product_slug="ai-chatbot",
            meta={
                "url": source_url,
                "word_count": total_words,
            },
        )
        warning_payload = {
            "status": "warning",
            "code": "LIMITED_CONTENT",
            "message": "Only limited readable content was detected on this website.",
            "suggestion": "Please review the downloaded Word file and re-upload an edited version for better AI results.",
        }
    elif len(page_sections) <= 1:
        warning_payload = {
            "status": "warning",
            "code": "ONLY_HOMEPAGE_IMPORTED",
            "message": "Only the homepage content was imported.",
            "suggestion": "Please review the Word file and re-upload an edited version that includes menu pages.",
        }
    if warning_payload:
        response_payload.update(warning_payload)
    return JsonResponse(response_payload, status=201)


def _lock_conversation_for_update(org, conversation_id):
    return (
        ChatConversation.objects
        .select_for_update()
        .select_related("active_agent")
        .filter(id=conversation_id, organization=org)
        .first()
    )


@login_required
@require_http_methods(["GET"])
def dashboard_summary(request):
    user = request.user
    if not user or not user.is_authenticated:
        return JsonResponse({"detail": "authentication_required"}, status=401)
    if not user.is_superuser:
        org = _resolve_org_for_user(user)
        if not org:
            return JsonResponse({"detail": "organization_required"}, status=403)
        subscription = (
            Subscription.objects
            .filter(organization=org, status__in=("active", "trialing"), plan__product__slug="ai-chatbot")
            .select_related("plan")
            .order_by("-start_date")
            .first()
        )
        if not subscription or not is_subscription_active(subscription):
            return JsonResponse({"detail": "subscription_required"}, status=403)
    else:
        org = _resolve_org_for_user(user)
        subscription = (
            Subscription.objects
            .filter(organization=org, status__in=("active", "trialing"), plan__product__slug="ai-chatbot")
            .select_related("plan")
            .order_by("-start_date")
            .first()
        ) if org else None

    plan = subscription.plan if subscription else None
    billing_cycle = subscription.billing_cycle if subscription else ""
    agents_total = 0
    agents_included = 0
    if org:
        agents_total = UserProfile.objects.filter(
            organization=org,
            role="ai_chatbot_agent",
        ).count()
    if plan:
        agents_included = int(plan.included_agents or 0)
    agents_extra = max(0, agents_total - agents_included)

    base_amount = Decimal("0.00")
    addon_amount = Decimal("0.00")
    if plan:
        if billing_cycle == "yearly":
            base_amount = _money(plan.yearly_price or 0)
            addon_price = _money(plan.addon_agent_yearly_price or 0)
        else:
            base_amount = _money(plan.monthly_price or 0)
            addon_price = _money(plan.addon_agent_monthly_price or 0)
        addon_amount = _money(addon_price * Decimal(agents_extra))
    total_amount = _money(base_amount + addon_amount)
    limits = plan.limits if plan and isinstance(plan.limits, dict) else {}
    features = plan.features if plan and isinstance(plan.features, dict) else {}
    ai_enabled = bool(features.get("ai_enabled", True))
    ai_limit = limits.get("ai_replies_per_month")
    if ai_limit is None:
        ai_limit = limits.get("conversations_per_month", 0)
    ai_limit = int(ai_limit or 0)
    usage = _get_ai_usage(org) if org and ai_limit else None
    ai_used = usage.ai_replies_used if usage else 0
    usage_percent = int((ai_used / ai_limit) * 100) if ai_limit else 0

    return JsonResponse({
        "org_id": org.id if org else None,
        "plan_name": plan.name if plan else "",
        "billing_cycle": billing_cycle,
        "agents_total": agents_total,
        "agents_included": agents_included,
        "agents_extra": agents_extra,
        "billing_preview": {
            "base_amount": float(base_amount),
            "addon_amount": float(addon_amount),
            "total_amount": float(total_amount),
        },
        "ai_replies_used_this_month": ai_used,
        "ai_replies_limit": ai_limit,
        "ai_usage_percent": usage_percent if ai_enabled else 0,
    })


@require_http_methods(["GET"])
def widget_config(request):
    key = request.GET.get("key", "").strip()
    if not key:
        return JsonResponse({"detail": "key_required"}, status=400)
    widget = ChatWidget.objects.filter(widget_key=key, is_active=True).select_related("organization").first()
    if not widget:
        return JsonResponse({"detail": "not_found"}, status=404)
    if not _is_domain_allowed(widget, request):
        return JsonResponse({"detail": "domain_not_allowed"}, status=403)
    rl_suffix = f"{_get_client_ip(request)}:{widget.public_chat_code}"
    if _rate_limit(request, "widget_message", limit=40, window_seconds=60, key_suffix=rl_suffix):
        return JsonResponse({"detail": "rate_limited"}, status=429)
    settings_obj, _ = OrganizationSettings.objects.get_or_create(organization=widget.organization)
    return JsonResponse({
        "id": widget.id,
        "name": widget.name,
        "widget_key": widget.widget_key,
        "theme": {
            "preset": widget.theme_preset,
            "primary": widget.theme_primary,
            "accent": widget.theme_accent,
            "background": widget.theme_background,
        },
        "allowed_domains": _split_allowed_domains(widget.allowed_domains),
        "is_active": widget.is_active,
        "allow_visitor_attachments": bool(settings_obj.ai_chatbot_user_attachments_enabled),
    })


@csrf_exempt
@require_http_methods(["POST"])
def widget_message(request):
    if _rate_limit(request, "widget_message", limit=30, window_seconds=60):
        return JsonResponse({"detail": "rate_limited"}, status=429)
    payload = _parse_json_body(request)
    key = str(payload.get("key", "")).strip()
    visitor_id = str(payload.get("visitor_id", "")).strip()
    text = str(payload.get("text", "")).strip()
    visitor_name = str(payload.get("name", "")).strip()
    visitor_email = str(payload.get("email", "")).strip()
    visitor_phone = str(payload.get("phone", "")).strip()
    category = str(payload.get("category", "")).strip().lower()
    source = str(payload.get("source", "")).strip().lower()
    if category not in ("sales", "support"):
        category = ""
    if source not in ("public_page", "widget_embed"):
        source = "widget_embed"
    if not key or not visitor_id or not text:
        return JsonResponse({"detail": "invalid_payload"}, status=400)
    if not visitor_name or not visitor_email or not visitor_phone or "@" not in visitor_email:
        return JsonResponse({
            "detail": "visitor_details_required",
            "message": "Please enter your name, email, and mobile number to start the chat.",
        }, status=400)
    widget = ChatWidget.objects.filter(widget_key=key, is_active=True).select_related("organization").first()
    if not widget:
        return JsonResponse({"detail": "not_found"}, status=404)
    if not _is_domain_allowed(widget, request):
        return JsonResponse({"detail": "domain_not_allowed"}, status=403)
    subscription, error_detail = _require_active_subscription(widget.organization)
    plan_limits = get_org_plan_limits(widget.organization)
    ai_enabled = plan_limits.get("ai_enabled")
    ai_limit = plan_limits.get("ai_replies_per_month")
    ai_conv_limit = plan_limits.get("ai_max_messages_per_conversation")
    ai_char_limit = plan_limits.get("ai_max_chars_per_message")
    usage_info = can_use_ai(widget.organization)
    ai_used = usage_info.get("used", 0)
    ai_meta = None
    conversation = None
    created = False
    if category:
        conversation = (
            ChatConversation.objects
            .filter(
                widget=widget,
                visitor_id=visitor_id,
                status__in=("open", "in-progress"),
                category=category,
            )
            .first()
        )
    if not conversation:
        conversation = (
            ChatConversation.objects
            .filter(widget=widget, visitor_id=visitor_id, status__in=("open", "in-progress"))
            .order_by("-created_at")
            .first()
        )
    if not conversation and not category:
        return JsonResponse({
            "error": "NEED_CATEGORY",
            "message": "Please choose Sales or Support to start the chat.",
            "ai_used_this_month": ai_used,
            "ai_limit_this_month": ai_limit,
            "ai_conv_used": 0,
            "ai_conv_limit": ai_conv_limit,
        }, status=400)
    if not conversation:
        conversation = ChatConversation.objects.create(
            widget=widget,
            visitor_id=visitor_id,
            status="open",
            organization=widget.organization,
            visitor_name=visitor_name,
            visitor_email=visitor_email,
            visitor_phone=visitor_phone,
            category=category or "sales",
            source=source,
            last_message_at=timezone.now(),
        )
        created = True
    else:
        if category and conversation.category != category:
            conversation = ChatConversation.objects.create(
                widget=widget,
                visitor_id=visitor_id,
                status="open",
                organization=widget.organization,
                category=category,
                source=source,
                last_message_at=timezone.now(),
            )
        else:
            update_fields = ["last_message_at"]
            if category and conversation.category != category:
                conversation.category = category
                update_fields.append("category")
            if source and conversation.source != source:
                conversation.source = source
                update_fields.append("source")
            if visitor_name and not conversation.visitor_name:
                conversation.visitor_name = visitor_name
                update_fields.append("visitor_name")
            if visitor_email and not conversation.visitor_email:
                conversation.visitor_email = visitor_email
                update_fields.append("visitor_email")
            if visitor_phone and not conversation.visitor_phone:
                conversation.visitor_phone = visitor_phone
                update_fields.append("visitor_phone")
            conversation.last_message_at = timezone.now()
            conversation.save(update_fields=update_fields)
    if not created:
        ChatConversation.objects.filter(id=conversation.id).update(last_message_at=timezone.now())
    ai_conv_used = ChatMessage.objects.filter(
        conversation=conversation,
        sender_type="bot",
        ai_model__isnull=False,
    ).count()
    allow_ai = bool(ai_enabled) and usage_info.get("allowed", True)
    if allow_ai and ai_char_limit and len(text) > ai_char_limit:
        return JsonResponse({
            "error": "AI_MESSAGE_TOO_LONG",
            "message": "Message is too long. Please shorten it and try again.",
            "used": ai_used,
            "limit": ai_limit,
        }, status=400)
    if allow_ai and ai_conv_limit and ai_conv_used >= ai_conv_limit:
        return JsonResponse({
            "error": "AI_CONV_LIMIT_REACHED",
            "message": "AI limit reached for this conversation. Please upgrade or contact support.",
            "used": ai_used,
            "limit": ai_limit,
            "ai_conv_used": ai_conv_used,
            "ai_conv_limit": ai_conv_limit,
        }, status=429)

    ChatMessage.objects.create(
        conversation=conversation,
        sender_type="visitor",
        text=text,
    )
    bot_text = "Thanks for reaching out! We'll reply shortly."
    has_auto_reply = ChatMessage.objects.filter(
        conversation=conversation,
        sender_type="bot",
        text=bot_text,
    ).exists()
    if not has_auto_reply:
        ChatMessage.objects.create(
            conversation=conversation,
            sender_type="bot",
            text=bot_text,
        )

    messages = _fetch_last_messages(conversation, limit=50)
    ai_used_next = ai_used + (1 if allow_ai else 0)
    ai_conv_used_next = ai_conv_used + (1 if allow_ai else 0)
    return JsonResponse({
        "conversation_id": conversation.id,
        "messages": messages,
        "ai_used_this_month": ai_used_next,
        "ai_limit_this_month": ai_limit,
        "ai_limit": ai_limit,
        "ai_conv_used": ai_conv_used_next,
        "ai_conv_limit": ai_conv_limit,
    })


@csrf_exempt
@require_http_methods(["POST"])
def widget_attachment(request):
    if _rate_limit(request, "widget_attachment", limit=20, window_seconds=60):
        return JsonResponse({"detail": "rate_limited"}, status=429)
    key = str(request.POST.get("key", "")).strip()
    visitor_id = str(request.POST.get("visitor_id", "")).strip()
    category = str(request.POST.get("category", "")).strip().lower()
    source = str(request.POST.get("source", "")).strip().lower()
    visitor_name = str(request.POST.get("name", "")).strip()
    visitor_email = str(request.POST.get("email", "")).strip()
    visitor_phone = str(request.POST.get("phone", "")).strip()
    if category not in ("sales", "support"):
        category = ""
    if source not in ("public_page", "widget_embed"):
        source = "widget_embed"
    upload = request.FILES.get("file")
    if not key or not visitor_id or not upload:
        return JsonResponse({"detail": "invalid_payload"}, status=400)
    filename = str(upload.name or "attachment")
    ext = os.path.splitext(filename)[1].lower()
    if ext not in ALLOWED_ATTACHMENT_EXTENSIONS:
        return JsonResponse({"detail": "unsupported_file_type"}, status=400)
    if upload.size and upload.size > MAX_ATTACHMENT_SIZE:
        return JsonResponse({"detail": "file_too_large"}, status=400)

    widget = ChatWidget.objects.filter(widget_key=key, is_active=True).select_related("organization").first()
    if not widget:
        return JsonResponse({"detail": "not_found"}, status=404)
    if not _is_domain_allowed(widget, request):
        return JsonResponse({"detail": "domain_not_allowed"}, status=403)
    settings_obj, _ = OrganizationSettings.objects.get_or_create(organization=widget.organization)
    if not settings_obj.ai_chatbot_user_attachments_enabled:
        return JsonResponse({"detail": "attachments_disabled"}, status=403)

    conversation = None
    if category:
        conversation = (
            ChatConversation.objects
            .filter(
                widget=widget,
                visitor_id=visitor_id,
                status__in=("open", "in-progress"),
                category=category,
            )
            .first()
        )
    if not conversation:
        conversation = (
            ChatConversation.objects
            .filter(widget=widget, visitor_id=visitor_id, status__in=("open", "in-progress"))
            .order_by("-created_at")
            .first()
        )
    if not conversation:
        if not visitor_name or not visitor_email or not visitor_phone or "@" not in visitor_email:
            return JsonResponse({
                "detail": "visitor_details_required",
                "message": "Please enter your name, email, and mobile number to start the chat.",
            }, status=400)
        conversation = ChatConversation.objects.create(
            widget=widget,
            visitor_id=visitor_id,
            status="open",
            organization=widget.organization,
            visitor_name=visitor_name,
            visitor_email=visitor_email,
            visitor_phone=visitor_phone,
            category=category or "sales",
            source=source,
            last_message_at=timezone.now(),
        )

    ChatMessage.objects.create(
        conversation=conversation,
        sender_type="visitor",
        text=filename,
        attachment=upload,
        attachment_name=filename,
        attachment_type=getattr(upload, "content_type", "") or "",
        attachment_size=getattr(upload, "size", 0) or 0,
    )
    ChatConversation.objects.filter(id=conversation.id).update(last_message_at=timezone.now())
    bot_text = "Thanks for reaching out! We'll reply shortly."
    has_auto_reply = ChatMessage.objects.filter(
        conversation=conversation,
        sender_type="bot",
        text=bot_text,
    ).exists()
    if not has_auto_reply:
        ChatMessage.objects.create(
            conversation=conversation,
            sender_type="bot",
            text=bot_text,
        )

    messages = _fetch_last_messages(conversation, limit=50)
    return JsonResponse({
        "conversation_id": conversation.id,
        "messages": messages,
    })


@require_http_methods(["GET"])
def widget_thread(request):
    if _rate_limit(request, "widget_thread", limit=60, window_seconds=60):
        return JsonResponse({"detail": "rate_limited"}, status=429)
    key = request.GET.get("key", "").strip()
    visitor_id = request.GET.get("visitor_id", "").strip()
    category = str(request.GET.get("category", "")).strip().lower()
    if category not in ("sales", "support"):
        category = ""
    if not key or not visitor_id:
        return JsonResponse({"detail": "invalid_params"}, status=400)
    widget = ChatWidget.objects.filter(widget_key=key, is_active=True).select_related("organization").first()
    if not widget:
        return JsonResponse({"detail": "not_found"}, status=404)
    if not _is_domain_allowed(widget, request):
        return JsonResponse({"detail": "domain_not_allowed"}, status=403)
    qs = ChatConversation.objects.filter(
        widget=widget,
        visitor_id=visitor_id,
        status__in=("open", "in-progress"),
    )
    if category:
        qs = qs.filter(category=category)
    conversation = qs.order_by("-created_at").first()
    settings_obj, _ = OrganizationSettings.objects.get_or_create(organization=widget.organization)
    if not conversation:
        return JsonResponse({
            "conversation_id": None,
            "messages": [],
            "allow_visitor_attachments": bool(settings_obj.ai_chatbot_user_attachments_enabled),
        })
    messages = _fetch_last_messages(conversation, limit=50)
    return JsonResponse({
        "conversation_id": conversation.id,
        "category": conversation.category,
        "messages": messages,
        "allow_visitor_attachments": bool(settings_obj.ai_chatbot_user_attachments_enabled),
    })


@login_required
@require_http_methods(["GET", "PATCH"])
def chat_settings(request):
    user = request.user
    org = _resolve_org_for_user(user)
    if not org or not _is_agent_or_admin(user):
        return JsonResponse({"detail": "forbidden"}, status=403)
    settings_obj, replies = _get_chat_settings(org)
    if request.method == "PATCH":
        payload = _parse_json_body(request)
        if "premade_replies" in payload:
            raw = payload.get("premade_replies")
            if isinstance(raw, (list, tuple)):
                cleaned = [str(item).strip() for item in raw if str(item).strip()]
                settings_obj.ai_chatbot_premade_replies = "\n".join(cleaned)
            else:
                settings_obj.ai_chatbot_premade_replies = str(raw or "").strip()
        if "allow_visitor_attachments" in payload:
            settings_obj.ai_chatbot_user_attachments_enabled = bool(payload.get("allow_visitor_attachments"))
        settings_obj.save(update_fields=["ai_chatbot_premade_replies", "ai_chatbot_user_attachments_enabled"])
        replies = [line.strip() for line in settings_obj.ai_chatbot_premade_replies.splitlines() if line.strip()]
    return JsonResponse({
        "premade_replies": replies,
        "allow_visitor_attachments": bool(settings_obj.ai_chatbot_user_attachments_enabled),
    })


@csrf_exempt
@require_http_methods(["POST"])
def widget_lead(request):
    payload = _parse_json_body(request)
    key = str(payload.get("key", "")).strip()
    visitor_id = str(payload.get("visitor_id", "")).strip()
    name = str(payload.get("name", "")).strip()
    phone = str(payload.get("phone", "")).strip()
    email = str(payload.get("email", "")).strip()
    message = str(payload.get("message", "")).strip()
    conversation_id = payload.get("conversation_id")
    if not key or not visitor_id or not name or not phone:
        return JsonResponse({"detail": "invalid_payload"}, status=400)
    if _rate_limit(request, "widget_lead", limit=20, window_seconds=300, key_suffix=key):
        return JsonResponse({"detail": "rate_limited"}, status=429)
    if len(phone) < 8:
        return JsonResponse({"detail": "invalid_phone"}, status=400)
    widget = ChatWidget.objects.filter(widget_key=key, is_active=True).select_related("organization").first()
    if not widget:
        return JsonResponse({"detail": "not_found"}, status=404)
    if not _is_domain_allowed(widget, request):
        return JsonResponse({"detail": "domain_not_allowed"}, status=403)
    conversation = None
    if conversation_id:
        conversation = ChatConversation.objects.filter(
            id=conversation_id,
            widget=widget,
            organization=widget.organization,
        ).first()
    lead = ChatLead.objects.create(
        organization=widget.organization,
        widget=widget,
        conversation=conversation,
        visitor_id=visitor_id,
        name=name,
        phone=phone,
        email=email,
        message=message,
        source_url=_get_source_url(request, payload),
        user_agent=request.META.get("HTTP_USER_AGENT", "")[:4000],
    )
    log_event(
        "ai_chatbot_lead_created",
        org=widget.organization,
        product_slug="ai-chatbot",
        meta={"widget_id": widget.id, "lead_id": lead.id},
        request=request,
    )
    return JsonResponse({"ok": True, "lead_id": lead.id})


@csrf_exempt
@require_http_methods(["POST"])
def enquiry_submit(request):
    payload = _parse_json_body(request)
    name = str(payload.get("name", "")).strip()
    email = str(payload.get("email", "")).strip()
    phone = str(payload.get("phone", "")).strip()
    message = str(payload.get("message", "")).strip()
    page_url = str(payload.get("page_url", "")).strip()
    widget_id = payload.get("widget_id")
    widget_key = str(payload.get("widget_key", "") or payload.get("key", "")).strip()
    if not name:
        return JsonResponse({"detail": "name_required", "message": "Name is required."}, status=400)
    if not email or "@" not in email:
        return JsonResponse({"detail": "email_invalid", "message": "Valid email is required."}, status=400)
    if message and len(message) > 2000:
        return JsonResponse({"detail": "message_too_long", "message": "Message is too long."}, status=400)
    widget = None
    if widget_id:
        widget = ChatWidget.objects.filter(id=widget_id).select_related("organization").first()
    if not widget and widget_key:
        widget = ChatWidget.objects.filter(widget_key=widget_key).select_related("organization").first()
    if widget:
        rl_suffix = f"{_get_client_ip(request)}:{widget.public_chat_code}"
        if _rate_limit(request, "enquiry", limit=10, window_seconds=60, key_suffix=rl_suffix):
            return JsonResponse({"detail": "rate_limited", "message": "Too many requests. Try again soon."}, status=429)
    else:
        if _rate_limit(request, "enquiry", limit=10, window_seconds=60):
            return JsonResponse({"detail": "rate_limited", "message": "Too many requests. Try again soon."}, status=429)
    org = widget.organization if widget else None
    site_domain = _get_client_domain(request)
    lead = ChatEnquiryLead.objects.create(
        organization=org,
        widget=widget,
        site_domain=site_domain,
        name=name,
        email=email,
        phone=phone,
        message=message,
        page_url=page_url,
        status="fresh",
    )
    log_event("ai_chatbot_enquiry_created", {
        "org_id": org.id if org else None,
        "widget_id": widget.id if widget else None,
        "lead_id": lead.id,
        "site_domain": site_domain,
    })
    return JsonResponse({"ok": True, "lead_id": lead.id})


@login_required
@require_http_methods(["GET"])
def leads_list(request):
    user = request.user
    org = _resolve_org_for_user(user)
    if not org or not _is_org_admin(user):
        return JsonResponse({"detail": "forbidden"}, status=403)
    subscription, error_detail = _require_active_subscription(org)
    if not subscription:
        detail = "Trial ended. Please upgrade your plan." if error_detail == "trial_ended" else "subscription_required"
        return JsonResponse({"detail": detail}, status=403)
    days = int(request.GET.get("days") or 7)
    if days < 1:
        days = 1
    if days > 60:
        days = 60
    widget_id = request.GET.get("widget_id")
    since = timezone.now() - timedelta(days=days)
    leads = ChatEnquiryLead.objects.filter(
        organization=org,
        created_at__gte=since,
    ).select_related("widget")
    if widget_id:
        leads = leads.filter(widget_id=widget_id)
    leads = leads.order_by("-created_at")[:500]
    retention_days = get_org_retention_days(org, default_days=30)
    return JsonResponse({
        "retention_days": retention_days,
        "leads": [
            {
                "id": lead.id,
                "name": lead.name,
                "phone": lead.phone,
                "email": lead.email,
                "message": lead.message,
                "status": lead.status,
                "created_at": lead.created_at.isoformat(),
                "source_url": lead.page_url or "",
                "widget_id": lead.widget_id,
                "widget_name": lead.widget.name if lead.widget else "",
            }
            for lead in leads
        ]
    })


@login_required
@require_http_methods(["PATCH"])
def lead_update(request, lead_id):
    user = request.user
    if _is_saas_admin(user):
        lead = ChatEnquiryLead.objects.filter(id=lead_id).first()
    else:
        org = _resolve_org_for_user(user)
        if not org or not _is_org_admin(user):
            return JsonResponse({"detail": "forbidden"}, status=403)
        subscription, error_detail = _require_active_subscription(org)
        if not subscription:
            detail = "Trial ended. Please upgrade your plan." if error_detail == "trial_ended" else "subscription_required"
            return JsonResponse({"detail": detail}, status=403)
        lead = ChatEnquiryLead.objects.filter(id=lead_id, organization=org).first()
    if not lead:
        return JsonResponse({"detail": "not_found"}, status=404)
    payload = _parse_json_body(request)
    status = str(payload.get("status", "")).strip().lower()
    if status not in {"fresh", "following", "completed"}:
        return JsonResponse({"detail": "invalid_status"}, status=400)
    lead.status = status
    lead.save(update_fields=["status"])
    return JsonResponse({
        "id": lead.id,
        "name": lead.name,
        "phone": lead.phone,
        "email": lead.email,
        "message": lead.message,
        "status": lead.status,
        "created_at": lead.created_at.isoformat(),
        "widget_id": lead.widget_id,
        "widget_name": lead.widget.name if lead.widget else "",
    })


@login_required
@require_http_methods(["DELETE"])
def lead_delete(request, lead_id):
    user = request.user
    if _is_saas_admin(user):
        lead = ChatEnquiryLead.objects.filter(id=lead_id).first()
    else:
        org = _resolve_org_for_user(user)
        if not org or not _is_org_admin(user):
            return JsonResponse({"detail": "forbidden"}, status=403)
        lead = ChatEnquiryLead.objects.filter(id=lead_id, organization=org).first()
    if not lead:
        return JsonResponse({"detail": "not_found"}, status=404)
    lead.delete()
    return HttpResponse(status=204)


@login_required
@require_http_methods(["GET", "POST"])
def org_agents(request):
    user = request.user
    org = _resolve_org_for_user(user)
    if not org or not _is_org_admin(user):
        return JsonResponse({"detail": "forbidden"}, status=403)
    subscription, error_detail = _require_active_subscription(org)
    if not subscription:
        detail = "Trial ended. Please upgrade your plan." if error_detail == "trial_ended" else "subscription_required"
        return JsonResponse({"detail": detail}, status=403)

    if request.method == "GET":
        agents = (
            UserProfile.objects
            .filter(organization=org, role="ai_chatbot_agent")
            .select_related("user")
            .order_by("-id")
        )
        return JsonResponse({
            "agents": [
                {
                    "id": profile.id,
                    "user_id": profile.user_id,
                    "name": f"{profile.user.first_name} {profile.user.last_name}".strip() or profile.user.username,
                    "email": profile.user.email or "",
                    "phone": profile.phone_number or "",
                    "agent_role": profile.agent_role or "support",
                    "is_active": bool(profile.user.is_active),
                    "created_at": profile.user.date_joined.isoformat() if profile.user else "",
                }
                for profile in agents
            ]
        })

    payload = _parse_json_body(request)
    name = str(payload.get("name", "")).strip()
    email = str(payload.get("email", "")).strip().lower()
    phone = str(payload.get("phone", "")).strip()
    agent_role = payload.get("agent_role", "support")
    if not email:
        return JsonResponse({"detail": "email_required"}, status=400)
    User = get_user_model()
    user_obj = User.objects.filter(email__iexact=email).first()
    temp_password = ""
    if user_obj:
        profile = UserProfile.objects.filter(user=user_obj).first()
        if profile and profile.organization and profile.organization_id != org.id:
            return JsonResponse({"detail": "user_in_other_org"}, status=400)
        if profile and profile.role not in ("ai_chatbot_agent",):
            return JsonResponse({"detail": "role_conflict"}, status=400)
        if not profile:
            profile = UserProfile.objects.create(
                user=user_obj,
                organization=org,
                role="ai_chatbot_agent",
                phone_number=phone,
                agent_role=agent_role,
            )
        else:
            profile.organization = org
            profile.role = "ai_chatbot_agent"
            if phone:
                profile.phone_number = phone
            profile.agent_role = agent_role
            profile.save()
        if not user_obj.is_active:
            user_obj.is_active = True
            user_obj.save(update_fields=["is_active"])
    else:
        username = email
        user_obj = User.objects.create_user(username=username, email=email)
        if name:
            parts = name.split()
            user_obj.first_name = parts[0]
            user_obj.last_name = " ".join(parts[1:]) if len(parts) > 1 else ""
        temp_password = secrets.token_urlsafe(8)
        user_obj.set_password(temp_password)
        user_obj.is_active = True
        user_obj.save()
        UserProfile.objects.create(
            user=user_obj,
            organization=org,
            role="ai_chatbot_agent",
            phone_number=phone,
            agent_role=agent_role,
        )
    return JsonResponse({
        "agent": {
            "id": user_obj.userprofile.id,
            "user_id": user_obj.id,
            "name": f"{user_obj.first_name} {user_obj.last_name}".strip() or user_obj.username,
            "email": user_obj.email or "",
            "phone": user_obj.userprofile.phone_number or "",
            "is_active": bool(user_obj.is_active),
            "created_at": user_obj.date_joined.isoformat(),
        },
        "temp_password": temp_password,
    }, status=201)


@login_required
@require_http_methods(["GET", "POST"])
def org_agents_manage(request):
    user = request.user
    org = _resolve_org_for_user(user)
    if not org or not _is_org_admin(user):
        return JsonResponse({"detail": "forbidden"}, status=403)
    subscription, error_detail = _require_active_subscription(org)
    if not subscription:
        detail = "Trial ended. Please upgrade your plan." if error_detail == "trial_ended" else "subscription_required"
        return JsonResponse({"detail": detail}, status=403)

    if request.method == "GET":
        agents = (
            UserProfile.objects
            .filter(organization=org, role="ai_chatbot_agent")
            .select_related("user")
            .order_by("-id")
        )
        results = [
            {
                "id": profile.id,
                "name": f"{profile.user.first_name} {profile.user.last_name}".strip() or profile.user.username,
                "email": profile.user.email or "",
                "role": "agent",
                "is_active": bool(profile.user.is_active),
                "created_at": profile.user.date_joined.isoformat() if profile.user else "",
            }
            for profile in agents
        ]
        return JsonResponse({"count": len(results), "results": results})

    payload = _parse_json_body(request)
    name = str(payload.get("name", "")).strip()
    email = str(payload.get("email", "")).strip().lower()
    password = str(payload.get("password", "")).strip()
    if not email:
        return JsonResponse({"detail": "email_required"}, status=400)
    if not password:
        return JsonResponse({"detail": "password_required"}, status=400)
    limits = get_org_plan_limits(org)
    plan = limits.get("plan")
    max_agents = limits.get("max_agents")
    if max_agents is None:
        max_agents = plan.included_agents if plan else 0
    try:
        max_agents = int(max_agents or 0)
    except (TypeError, ValueError):
        max_agents = 0
    used_agents = UserProfile.objects.filter(
        organization=org,
        role="ai_chatbot_agent",
        user__is_active=True,
    ).count()
    if max_agents and used_agents >= max_agents:
        return JsonResponse({
            "error": "AGENT_LIMIT_REACHED",
            "limit": max_agents,
            "used": used_agents,
        }, status=403)
    User = get_user_model()
    if User.objects.filter(email__iexact=email).exists():
        return JsonResponse({"detail": "email_in_use"}, status=400)
    username = email
    user_obj = User.objects.create_user(username=username, email=email)
    if name:
        parts = name.split()
        user_obj.first_name = parts[0]
        user_obj.last_name = " ".join(parts[1:]) if len(parts) > 1 else ""
    user_obj.set_password(password)
    user_obj.is_active = True
    user_obj.save()
    profile = UserProfile.objects.create(
        user=user_obj,
        organization=org,
        role="ai_chatbot_agent",
    )
    return JsonResponse({
        "id": profile.id,
        "name": f"{user_obj.first_name} {user_obj.last_name}".strip() or user_obj.username,
        "email": user_obj.email or "",
        "role": "agent",
        "is_active": True,
        "created_at": user_obj.date_joined.isoformat(),
    }, status=201)


@login_required
@require_http_methods(["PATCH", "DELETE"])
def org_agents_detail(request, agent_id):
    user = request.user
    org = _resolve_org_for_user(user)
    if not org or not _is_org_admin(user):
        return JsonResponse({"detail": "forbidden"}, status=403)
    subscription, error_detail = _require_active_subscription(org)
    if not subscription:
        detail = "Trial ended. Please upgrade your plan." if error_detail == "trial_ended" else "subscription_required"
        return JsonResponse({"detail": detail}, status=403)
    profile = (
        UserProfile.objects
        .filter(id=agent_id, organization=org, role="ai_chatbot_agent")
        .select_related("user")
        .first()
    )
    if not profile:
        return JsonResponse({"detail": "not_found"}, status=404)
    if profile.user_id == user.id:
        return JsonResponse({"detail": "cannot_modify_self"}, status=400)

    if request.method == "DELETE":
        profile.user.is_active = False
        profile.user.save(update_fields=["is_active"])
        return HttpResponse(status=204)

    payload = _parse_json_body(request)
    is_active = payload.get("is_active")
    name = str(payload.get("name", "")).strip()
    updates = []
    if is_active is not None:
        profile.user.is_active = bool(is_active)
        updates.append("is_active")
    if name:
        parts = name.split()
        profile.user.first_name = parts[0]
        profile.user.last_name = " ".join(parts[1:]) if len(parts) > 1 else ""
        updates.extend(["first_name", "last_name"])
    if not updates:
        return JsonResponse({"detail": "no_updates"}, status=400)
    profile.user.save(update_fields=updates)
    return JsonResponse({
        "id": profile.id,
        "name": f"{profile.user.first_name} {profile.user.last_name}".strip() or profile.user.username,
        "email": profile.user.email or "",
        "role": "agent",
        "is_active": bool(profile.user.is_active),
        "created_at": profile.user.date_joined.isoformat(),
    })


@login_required
@require_http_methods(["PATCH", "DELETE"])
def org_agent_detail(request, agent_id):
    user = request.user
    org = _resolve_org_for_user(user)
    if not org or not _is_org_admin(user):
        return JsonResponse({"detail": "forbidden"}, status=403)
    subscription, error_detail = _require_active_subscription(org)
    if not subscription:
        detail = "Trial ended. Please upgrade your plan." if error_detail == "trial_ended" else "subscription_required"
        return JsonResponse({"detail": detail}, status=403)
    profile = (
        UserProfile.objects
        .filter(id=agent_id, organization=org, role="ai_chatbot_agent")
        .select_related("user")
        .first()
    )
    if not profile:
        return JsonResponse({"detail": "not_found"}, status=404)

    if request.method == "DELETE":
        profile.user.delete()
        return HttpResponse(status=204)

    payload = _parse_json_body(request)
    is_active = payload.get("is_active")
    agent_role = payload.get("agent_role")

    if is_active is None and agent_role is None:
        return JsonResponse({"detail": "is_active or agent_role is required"}, status=400)
    
    if is_active is not None:
        profile.user.is_active = bool(is_active)
        profile.user.save(update_fields=["is_active"])

    if agent_role is not None:
        profile.agent_role = agent_role
        profile.save(update_fields=["agent_role"])

    return JsonResponse({
        "id": profile.id,
        "user_id": profile.user_id,
        "name": f"{profile.user.first_name} {profile.user.last_name}".strip() or profile.user.username,
        "email": profile.user.email or "",
        "phone": profile.phone_number or "",
        "is_active": bool(profile.user.is_active),
        "agent_role": profile.agent_role or "support",
        "created_at": profile.user.date_joined.isoformat(),
    })


@login_required
@require_http_methods(["POST"])
def org_agent_password(request, agent_id):
    user = request.user
    org = _resolve_org_for_user(user)
    if not org or not _is_org_admin(user):
        return JsonResponse({"detail": "forbidden"}, status=403)
    subscription, error_detail = _require_active_subscription(org)
    if not subscription:
        detail = "Trial ended. Please upgrade your plan." if error_detail == "trial_ended" else "subscription_required"
        return JsonResponse({"detail": detail}, status=403)
    profile = (
        UserProfile.objects
        .filter(id=agent_id, organization=org, role="ai_chatbot_agent")
        .select_related("user")
        .first()
    )
    if not profile:
        return JsonResponse({"detail": "not_found"}, status=404)
    payload = _parse_json_body(request)
    old_password = str(payload.get("old_password", "")).strip()
    new_password = str(payload.get("new_password", "")).strip()
    confirm_password = str(payload.get("confirm_password", "")).strip()
    if not new_password or not confirm_password:
        return JsonResponse({"detail": "password_required"}, status=400)
    if new_password != confirm_password:
        return JsonResponse({"detail": "password_mismatch"}, status=400)
    if old_password and not profile.user.check_password(old_password):
        return JsonResponse({"detail": "old_password_invalid"}, status=400)
    try:
        validate_password(new_password, user=profile.user)
    except ValidationError as exc:
        return JsonResponse({"detail": " ".join(exc.messages)}, status=400)
    profile.user.set_password(new_password)
    profile.user.save(update_fields=["password"])
    return JsonResponse({"updated": True})


@login_required
@require_http_methods(["GET", "POST"])
def widgets_collection(request):
    user = request.user
    org = _resolve_org_for_user(user)
    if not org or not _is_org_admin(user):
        return JsonResponse({"detail": "forbidden"}, status=403)
    subscription, error_detail = _require_active_subscription(org)
    if not subscription:
        detail = "Trial ended. Please upgrade your plan." if error_detail == "trial_ended" else "subscription_required"
        return JsonResponse({"detail": detail}, status=403)

    if request.method == "GET":
        widgets = ChatWidget.objects.filter(organization=org).order_by("-created_at")
        org_slug = slugify(org.name)
        return JsonResponse({
            "widgets": [
                {
                    "id": widget.id,
                    "name": widget.name,
                    "widget_key": widget.widget_key,
                    "public_chat_code": widget.public_chat_code,
                    "public_chat_url": request.build_absolute_uri(
                        f"/ai-chatbox/{org_slug}-{widget.public_chat_code}/"
                    ),
                    "theme": {
                        "preset": widget.theme_preset,
                        "primary": widget.theme_primary,
                        "accent": widget.theme_accent,
                        "background": widget.theme_background,
                    },
                    "allowed_domains": _split_allowed_domains(widget.allowed_domains),
                    "is_active": widget.is_active,
                    "created_at": widget.created_at.isoformat(),
                }
                for widget in widgets
            ]
        })

    payload = _parse_json_body(request)
    name = str(payload.get("name", "")).strip()
    allowed_domains = payload.get("allowed_domains", "")
    theme = payload.get("theme", {}) or {}
    theme_preset = str(theme.get("preset", "") or payload.get("theme_preset", "") or "emerald").strip()
    theme_primary = str(theme.get("primary", "") or payload.get("theme_primary", "") or "").strip()
    theme_accent = str(theme.get("accent", "") or payload.get("theme_accent", "") or "").strip()
    theme_background = str(theme.get("background", "") or payload.get("theme_background", "") or "").strip()
    if not name:
        return JsonResponse({"detail": "name_required"}, status=400)
    widget_key = secrets.token_hex(16)
    widget = ChatWidget.objects.create(
        organization=org,
        name=name,
        widget_key=widget_key,
        allowed_domains="\n".join(_split_allowed_domains(allowed_domains)),
        is_active=True,
        theme_preset=theme_preset or "emerald",
        theme_primary=theme_primary,
        theme_accent=theme_accent,
        theme_background=theme_background,
    )
    org_slug = slugify(org.name)
    return JsonResponse({
        "id": widget.id,
        "name": widget.name,
        "widget_key": widget.widget_key,
        "public_chat_code": widget.public_chat_code,
        "public_chat_url": request.build_absolute_uri(
            f"/ai-chatbox/{org_slug}-{widget.public_chat_code}/"
        ),
        "theme": {
            "preset": widget.theme_preset,
            "primary": widget.theme_primary,
            "accent": widget.theme_accent,
            "background": widget.theme_background,
        },
        "allowed_domains": _split_allowed_domains(widget.allowed_domains),
        "is_active": widget.is_active,
        "created_at": widget.created_at.isoformat(),
    }, status=201)


@login_required
@require_http_methods(["PATCH"])
def widget_update(request, widget_id):
    user = request.user
    org = _resolve_org_for_user(user)
    if not org or not _is_org_admin(user):
        return JsonResponse({"detail": "forbidden"}, status=403)
    subscription, error_detail = _require_active_subscription(org)
    if not subscription:
        detail = "Trial ended. Please upgrade your plan." if error_detail == "trial_ended" else "subscription_required"
        return JsonResponse({"detail": detail}, status=403)
    widget = ChatWidget.objects.filter(id=widget_id, organization=org).first()
    if not widget:
        return JsonResponse({"detail": "not_found"}, status=404)
    payload = _parse_json_body(request)
    if "name" in payload:
        widget.name = str(payload.get("name", "")).strip() or widget.name
    if "allowed_domains" in payload:
        widget.allowed_domains = "\n".join(_split_allowed_domains(payload.get("allowed_domains")))
    if "theme" in payload or "theme_preset" in payload:
        theme = payload.get("theme", {}) or {}
        widget.theme_preset = str(theme.get("preset", "") or payload.get("theme_preset", "") or widget.theme_preset)
        widget.theme_primary = str(theme.get("primary", "") or payload.get("theme_primary", "") or widget.theme_primary)
        widget.theme_accent = str(theme.get("accent", "") or payload.get("theme_accent", "") or widget.theme_accent)
        widget.theme_background = str(theme.get("background", "") or payload.get("theme_background", "") or widget.theme_background)
    if "is_active" in payload:
        widget.is_active = bool(payload.get("is_active"))
    widget.save()
    org_slug = slugify(org.name)
    return JsonResponse({
        "id": widget.id,
        "name": widget.name,
        "widget_key": widget.widget_key,
        "public_chat_code": widget.public_chat_code,
        "public_chat_url": request.build_absolute_uri(
            f"/ai-chatbox/{org_slug}-{widget.public_chat_code}/"
        ),
        "theme": {
            "preset": widget.theme_preset,
            "primary": widget.theme_primary,
            "accent": widget.theme_accent,
            "background": widget.theme_background,
        },
        "allowed_domains": _split_allowed_domains(widget.allowed_domains),
        "is_active": widget.is_active,
        "created_at": widget.created_at.isoformat(),
    })


def _select_widget_for_org(org, widget_id=None):
    qs = ChatWidget.objects.filter(organization=org)
    if widget_id:
        return qs.filter(id=widget_id).first()
    widget = qs.filter(is_active=True).order_by("-created_at").first()
    if widget:
        return widget
    return qs.order_by("-created_at").first()


def _build_public_chat_url(request, org, widget):
    org_slug = slugify(org.name)
    return request.build_absolute_uri(
        f"/ai-chatbox/{org_slug}-{widget.public_chat_code}/"
    )


def _qr_response(content_bytes, content_type, filename):
    response = HttpResponse(content_bytes, content_type=content_type)
    response["Content-Disposition"] = f'attachment; filename="{filename}"'
    return response


def _qr_library_error():
    return JsonResponse({"detail": "qr_library_missing"}, status=501)


@login_required
@require_http_methods(["GET"])
def org_public_chat_link(request):
    user = request.user
    org = _resolve_org_for_user(user)
    if not org or not _is_org_admin(user):
        return JsonResponse({"detail": "forbidden"}, status=403)
    subscription, error_detail = _require_active_subscription(org)
    if not subscription:
        detail = "Trial ended. Please upgrade your plan." if error_detail == "trial_ended" else "subscription_required"
        return JsonResponse({"detail": detail}, status=403)
    widget_id = request.GET.get("widget_id")
    widget = _select_widget_for_org(org, widget_id)
    if not widget:
        return JsonResponse({"detail": "widget_not_found"}, status=404)
    public_url = _build_public_chat_url(request, org, widget)
    return JsonResponse({
        "public_url": public_url,
        "widget_id": widget.id,
        "widget_name": widget.name,
    })


@login_required
@require_http_methods(["GET"])
def org_public_chat_qr_png(request):
    user = request.user
    org = _resolve_org_for_user(user)
    if not org or not _is_org_admin(user):
        return JsonResponse({"detail": "forbidden"}, status=403)
    subscription, error_detail = _require_active_subscription(org)
    if not subscription:
        detail = "Trial ended. Please upgrade your plan." if error_detail == "trial_ended" else "subscription_required"
        return JsonResponse({"detail": detail}, status=403)
    widget_id = request.GET.get("widget_id")
    widget = _select_widget_for_org(org, widget_id)
    if not widget:
        return JsonResponse({"detail": "widget_not_found"}, status=404)
    try:
        import qrcode
    except ImportError:
        return _qr_library_error()
    from io import BytesIO
    public_url = _build_public_chat_url(request, org, widget)
    img = qrcode.make(public_url)
    buffer = BytesIO()
    img.save(buffer, format="PNG")
    filename = f"workzilla-chat-{slugify(org.name)}.png"
    return _qr_response(buffer.getvalue(), "image/png", filename)


@login_required
@require_http_methods(["GET"])
def org_public_chat_qr_svg(request):
    user = request.user
    org = _resolve_org_for_user(user)
    if not org or not _is_org_admin(user):
        return JsonResponse({"detail": "forbidden"}, status=403)
    subscription, error_detail = _require_active_subscription(org)
    if not subscription:
        detail = "Trial ended. Please upgrade your plan." if error_detail == "trial_ended" else "subscription_required"
        return JsonResponse({"detail": detail}, status=403)
    widget_id = request.GET.get("widget_id")
    widget = _select_widget_for_org(org, widget_id)
    if not widget:
        return JsonResponse({"detail": "widget_not_found"}, status=404)
    try:
        import qrcode
        from qrcode.image.svg import SvgImage
    except ImportError:
        return _qr_library_error()
    from io import BytesIO
    public_url = _build_public_chat_url(request, org, widget)
    img = qrcode.make(public_url, image_factory=SvgImage)
    buffer = BytesIO()
    img.save(buffer)
    filename = f"workzilla-chat-{slugify(org.name)}.svg"
    return _qr_response(buffer.getvalue(), "image/svg+xml", filename)


@login_required
@require_http_methods(["GET"])
def inbox_conversations(request):
    user = request.user
    org = _resolve_org_for_user(user)
    if not org or not _is_agent_or_admin(user):
        return JsonResponse({"detail": "forbidden"}, status=403)
    subscription, error_detail = _require_active_subscription(org)
    if not subscription:
        detail = "Trial ended. Please upgrade your plan." if error_detail == "trial_ended" else "subscription_required"
        return JsonResponse({"detail": detail}, status=403)
    status = request.GET.get("status", "open")
    category = request.GET.get("category", "all")
    qs = (
        ChatConversation.objects
        .filter(organization=org)
        .select_related("widget", "active_agent")
    )
    if category in ("sales", "support"):
        qs = qs.filter(category=category)
    if status and status != "all":
        if status == "open":
            qs = qs.filter(status__in=("open", "in-progress"))
        else:
            qs = qs.filter(status=status)
    
    is_admin = _is_org_admin(user)
    if not is_admin:
        qs = qs.filter(Q(active_agent__isnull=True) | Q(active_agent=user))

    qs = qs.order_by("-last_message_at", "-created_at")[:100]
    conversation_ids = [row.id for row in qs]
    last_messages = (
        ChatMessage.objects
        .filter(conversation_id__in=conversation_ids)
        .order_by("conversation_id", "-created_at")
    )
    last_text_by_conversation = {}
    for message in last_messages:
        if message.conversation_id not in last_text_by_conversation:
            last_text_by_conversation[message.conversation_id] = message.text
    last_visitor_by_conversation = {}
    visitor_messages = (
        ChatMessage.objects
        .filter(conversation_id__in=conversation_ids, sender_type="visitor")
        .order_by("conversation_id", "-created_at")
    )
    for message in visitor_messages:
        if message.conversation_id not in last_visitor_by_conversation:
            last_visitor_by_conversation[message.conversation_id] = message.created_at
    now = timezone.now()
    
    conversations_data = []
    for row in qs:
        data = {
            "id": row.id,
            "widget_id": row.widget_id,
            "widget_name": row.widget.name,
            "visitor_id": row.visitor_id,
            "visitor_name": row.visitor_name or "",
            "visitor_email": row.visitor_email or "",
            "visitor_phone": row.visitor_phone or "",
            "visitor_status": _visitor_presence(last_visitor_by_conversation.get(row.id), now=now),
            "status": row.status,
            "category": row.category or "",
            "source": row.source or "",
            "last_message_at": row.last_message_at.isoformat() if row.last_message_at else "",
            "last_message": last_text_by_conversation.get(row.id, ""),
            "created_at": row.created_at.isoformat(),
            "active_agent_id": row.active_agent_id,
            "active_agent_name": "",
        }
        if row.active_agent:
            data["active_agent_name"] = f"{row.active_agent.first_name} {row.active_agent.last_name}".strip() or row.active_agent.username
        
        if is_admin and row.active_agent_id and row.active_agent_id != user.id:
            data["last_message"] = ""

        conversations_data.append(data)

    return JsonResponse({
        "conversations": conversations_data
    })


@login_required
@require_http_methods(["GET"])
def inbox_messages(request, conversation_id):
    user = request.user
    org = _resolve_org_for_user(user)
    if not org or not _is_agent_or_admin(user):
        return JsonResponse({"detail": "forbidden"}, status=403)
    subscription, error_detail = _require_active_subscription(org)
    if not subscription:
        detail = "Trial ended. Please upgrade your plan." if error_detail == "trial_ended" else "subscription_required"
        return JsonResponse({"detail": detail}, status=403)
    conversation = ChatConversation.objects.filter(id=conversation_id, organization=org).select_related("active_agent").first()
    if not conversation:
        return JsonResponse({"detail": "not_found"}, status=404)

    if not conversation.active_agent_id:
        return JsonResponse({"detail": "conversation_unassigned"}, status=409)
    if conversation.active_agent_id != user.id:
        return JsonResponse({"detail": "conversation_taken"}, status=403)

    messages = _fetch_last_messages(conversation, limit=None)
    return JsonResponse({
        "conversation_id": conversation.id,
        "messages": messages,
        "org_timezone": _get_org_timezone(org),
    })


@login_required
@require_http_methods(["POST"])
def inbox_reply(request, conversation_id):
    user = request.user
    org = _resolve_org_for_user(user)
    if not org or not _is_agent_or_admin(user):
        return JsonResponse({"detail": "forbidden"}, status=403)
    subscription, error_detail = _require_active_subscription(org)
    if not subscription:
        detail = "Trial ended. Please upgrade your plan." if error_detail == "trial_ended" else "subscription_required"
        return JsonResponse({"detail": detail}, status=403)
    if _rate_limit(request, "agent_reply", limit=60, window_seconds=60, key_suffix=str(user.id or "")):
        return JsonResponse({"detail": "rate_limited"}, status=429)
    payload = _parse_json_body(request)
    text = str(payload.get("text", "")).strip()
    if not text:
        return JsonResponse({"detail": "text_required"}, status=400)
    with transaction.atomic():
        conversation = _lock_conversation_for_update(org, conversation_id)
        if not conversation:
            return JsonResponse({"detail": "not_found"}, status=404)
        if conversation.active_agent_id and conversation.active_agent_id != user.id:
            return JsonResponse({"detail": "conversation_taken"}, status=403)
        if not conversation.active_agent_id:
            conversation.active_agent = user
            conversation.status = "in-progress"
            conversation.save(update_fields=["active_agent", "status"])

        message = ChatMessage.objects.create(
            conversation=conversation,
            sender_type="agent",
            sender_user=user,
            text=text,
        )
        ChatConversation.objects.filter(id=conversation.id).update(last_message_at=timezone.now())
    return JsonResponse({
        "message": _serialize_message(message),
    })


@login_required
@require_http_methods(["POST"])
def inbox_attachment(request, conversation_id):
    user = request.user
    org = _resolve_org_for_user(user)
    if not org or not _is_agent_or_admin(user):
        return JsonResponse({"detail": "forbidden"}, status=403)
    subscription, error_detail = _require_active_subscription(org)
    if not subscription:
        detail = "Trial ended. Please upgrade your plan." if error_detail == "trial_ended" else "subscription_required"
        return JsonResponse({"detail": detail}, status=403)

    upload = request.FILES.get("file")
    if not upload:
        return JsonResponse({"detail": "file_required"}, status=400)
    filename = str(upload.name or "attachment")
    ext = os.path.splitext(filename)[1].lower()
    if ext not in ALLOWED_ATTACHMENT_EXTENSIONS:
        return JsonResponse({"detail": "unsupported_file_type"}, status=400)
    if upload.size and upload.size > MAX_ATTACHMENT_SIZE:
        return JsonResponse({"detail": "file_too_large"}, status=400)

    with transaction.atomic():
        conversation = _lock_conversation_for_update(org, conversation_id)
        if not conversation:
            return JsonResponse({"detail": "not_found"}, status=404)
        if conversation.active_agent_id and conversation.active_agent_id != user.id:
            return JsonResponse({"detail": "conversation_taken"}, status=403)
        if not conversation.active_agent_id:
            conversation.active_agent = user
            conversation.status = "in-progress"
            conversation.save(update_fields=["active_agent", "status"])

        message = ChatMessage.objects.create(
            conversation=conversation,
            sender_type="agent",
            sender_user=user,
            text=filename,
            attachment=upload,
            attachment_name=filename,
            attachment_type=getattr(upload, "content_type", "") or "",
            attachment_size=getattr(upload, "size", 0) or 0,
        )
        ChatConversation.objects.filter(id=conversation.id).update(last_message_at=timezone.now())

    return JsonResponse({
        "message": _serialize_message(message),
    })


@login_required
@require_http_methods(["POST"])
def inbox_close(request, conversation_id):
    user = request.user
    org = _resolve_org_for_user(user)
    if not org or not _is_agent_or_admin(user):
        return JsonResponse({"detail": "forbidden"}, status=403)
    subscription, error_detail = _require_active_subscription(org)
    if not subscription:
        detail = "Trial ended. Please upgrade your plan." if error_detail == "trial_ended" else "subscription_required"
        return JsonResponse({"detail": detail}, status=403)
    with transaction.atomic():
        conversation = _lock_conversation_for_update(org, conversation_id)
        if not conversation:
            return JsonResponse({"detail": "not_found"}, status=404)
        if not conversation.active_agent_id:
            return JsonResponse({"detail": "conversation_unassigned"}, status=409)
        if conversation.active_agent_id != user.id:
            return JsonResponse({"detail": "conversation_taken"}, status=403)

        conversation.status = "closed"
        conversation.active_agent = None
        conversation.last_message_at = timezone.now()
        conversation.save(update_fields=["status", "active_agent", "last_message_at"])
    return JsonResponse({
        "id": conversation.id,
        "status": conversation.status,
    })


@login_required
@require_http_methods(["POST"])
def inbox_reopen(request, conversation_id):
    user = request.user
    org = _resolve_org_for_user(user)
    if not org or not _is_agent_or_admin(user):
        return JsonResponse({"detail": "forbidden"}, status=403)
    subscription, error_detail = _require_active_subscription(org)
    if not subscription:
        detail = "Trial ended. Please upgrade your plan." if error_detail == "trial_ended" else "subscription_required"
        return JsonResponse({"detail": detail}, status=403)
    with transaction.atomic():
        conversation = _lock_conversation_for_update(org, conversation_id)
        if not conversation:
            return JsonResponse({"detail": "not_found"}, status=404)
        if conversation.active_agent_id and conversation.active_agent_id != user.id:
            return JsonResponse({"detail": "conversation_taken"}, status=403)
        if not conversation.active_agent_id:
            conversation.active_agent = user
        conversation.status = "open"
        conversation.last_message_at = timezone.now()
        conversation.save(update_fields=["status", "last_message_at", "active_agent"])
    return JsonResponse({
        "id": conversation.id,
        "status": conversation.status,
    })


@login_required
@require_http_methods(["POST"])
def inbox_take_conversation(request, conversation_id):
    user = request.user
    org = _resolve_org_for_user(user)
    if not org or not _is_agent_or_admin(user):
        return JsonResponse({"detail": "forbidden"}, status=403)
    subscription, error_detail = _require_active_subscription(org)
    if not subscription:
        detail = "Trial ended. Please upgrade your plan." if error_detail == "trial_ended" else "subscription_required"
        return JsonResponse({"detail": detail}, status=403)
    with transaction.atomic():
        conversation = _lock_conversation_for_update(org, conversation_id)
        if not conversation:
            return JsonResponse({"detail": "not_found"}, status=404)
        if conversation.active_agent_id and conversation.active_agent_id != user.id:
            return JsonResponse({"detail": "conversation_taken"}, status=409)
        conversation.active_agent = user
        conversation.status = "in-progress"
        conversation.save(update_fields=["active_agent", "status"])

    return JsonResponse({
        "id": conversation.id,
        "status": conversation.status,
        "active_agent_id": user.id,
    })


@login_required
@require_http_methods(["POST"])
def inbox_transfer_conversation(request, conversation_id):
    user = request.user
    org = _resolve_org_for_user(user)
    if not org or not _is_agent_or_admin(user):
        return JsonResponse({"detail": "forbidden"}, status=403)

    subscription, error_detail = _require_active_subscription(org)
    if not subscription:
        detail = "Trial ended. Please upgrade your plan." if error_detail == "trial_ended" else "subscription_required"
        return JsonResponse({"detail": detail}, status=403)

    payload = _parse_json_body(request)
    new_agent_id = payload.get("new_agent_id")
    if not new_agent_id:
        return JsonResponse({"detail": "new_agent_id_required"}, status=400)

    NewAgentUser = get_user_model()
    new_agent = NewAgentUser.objects.filter(id=new_agent_id).first()
    if not new_agent:
        return JsonResponse({"detail": "new_agent_not_found"}, status=404)

    # Check if the new agent belongs to the same organization and is an agent role
    new_agent_profile = UserProfile.objects.filter(user=new_agent, organization=org).first()
    if not new_agent_profile:
        return JsonResponse({"detail": "agent_not_in_org"}, status=400)
    if new_agent_profile.role != "ai_chatbot_agent":
        return JsonResponse({"detail": "agent_role_required"}, status=400)

    with transaction.atomic():
        conversation = _lock_conversation_for_update(org, conversation_id)
        if not conversation:
            return JsonResponse({"detail": "not_found"}, status=404)
        is_admin = _is_org_admin(user)
        if not is_admin and conversation.active_agent_id and conversation.active_agent_id != user.id:
            return JsonResponse({"detail": "not_your_conversation"}, status=403)

        old_agent = conversation.active_agent
        conversation.active_agent = new_agent
        conversation.save(update_fields=["active_agent"])

        ChatTransferLog.objects.create(
            conversation=conversation,
            organization=org,
            from_agent=old_agent,
            to_agent=new_agent,
        )

    log_event(
        "ai_chatbot_conversation_transferred",
        org=org,
        user=user,
        product_slug="ai-chatbot",
        meta={
            "conversation_id": conversation.id,
            "from_agent_id": old_agent.id if old_agent else None,
            "to_agent_id": new_agent.id,
        },
        request=request,
    )

    return JsonResponse({
        "id": conversation.id,
        "status": conversation.status,
        "active_agent_id": new_agent.id,
    })


@login_required
@require_http_methods(["GET"])
def history_list(request):
    user = request.user
    org = _resolve_org_for_user(user)
    if not org or not _is_org_admin(user):
        return JsonResponse({"detail": "forbidden"}, status=403)
    subscription, error_detail = _require_active_subscription(org)
    if not subscription:
        detail = "Trial ended. Please upgrade your plan." if error_detail == "trial_ended" else "subscription_required"
        return JsonResponse({"detail": detail}, status=403)

    retention_days = _prune_chat_history(org)
    status = request.GET.get("status", "all")
    category = request.GET.get("category", "all")
    qs = (
        ChatConversation.objects
        .filter(organization=org)
        .select_related("widget")
    )
    if category in ("sales", "support"):
        qs = qs.filter(category=category)
    if status and status != "all":
        qs = qs.filter(status=status)
    qs = qs.order_by("-last_message_at", "-created_at")[:200]
    conversation_ids = [row.id for row in qs]
    last_messages = (
        ChatMessage.objects
        .filter(conversation_id__in=conversation_ids)
        .order_by("conversation_id", "-created_at")
    )
    last_text_by_conversation = {}
    for message in last_messages:
        if message.conversation_id not in last_text_by_conversation:
            last_text_by_conversation[message.conversation_id] = message.text
    return JsonResponse({
        "retention_days": retention_days,
        "conversations": [
            {
                "id": row.id,
                "widget_id": row.widget_id,
                "widget_name": row.widget.name,
                "visitor_id": row.visitor_id,
                "visitor_name": row.visitor_name or "",
                "visitor_email": row.visitor_email or "",
                "visitor_phone": row.visitor_phone or "",
                "status": row.status,
                "category": row.category or "",
                "source": row.source or "",
                "last_message_at": row.last_message_at.isoformat() if row.last_message_at else "",
                "last_message": last_text_by_conversation.get(row.id, ""),
                "created_at": row.created_at.isoformat(),
            }
            for row in qs
        ],
    })


@login_required
@require_http_methods(["GET"])
def history_messages(request, conversation_id):
    user = request.user
    org = _resolve_org_for_user(user)
    if not org or not _is_org_admin(user):
        return JsonResponse({"detail": "forbidden"}, status=403)
    subscription, error_detail = _require_active_subscription(org)
    if not subscription:
        detail = "Trial ended. Please upgrade your plan." if error_detail == "trial_ended" else "subscription_required"
        return JsonResponse({"detail": detail}, status=403)
    conversation = ChatConversation.objects.filter(id=conversation_id, organization=org).first()
    if not conversation:
        return JsonResponse({"detail": "not_found"}, status=404)
    messages = (
        ChatMessage.objects
        .filter(conversation=conversation)
        .order_by("created_at")[:200]
    )
    return JsonResponse({
        "conversation": {
            "id": conversation.id,
            "visitor_id": conversation.visitor_id,
            "visitor_name": conversation.visitor_name or "",
            "visitor_email": conversation.visitor_email or "",
            "visitor_phone": conversation.visitor_phone or "",
            "status": conversation.status,
            "category": conversation.category or "",
            "source": conversation.source or "",
            "created_at": conversation.created_at.isoformat(),
        },
        "messages": [_serialize_message(item) for item in messages],
        "org_timezone": _get_org_timezone(org),
    })


@login_required
@require_http_methods(["DELETE"])
def history_delete(request, conversation_id):
    user = request.user
    org = _resolve_org_for_user(user)
    if not org or not _is_org_admin(user):
        return JsonResponse({"detail": "forbidden"}, status=403)
    subscription, error_detail = _require_active_subscription(org)
    if not subscription:
        detail = "Trial ended. Please upgrade your plan." if error_detail == "trial_ended" else "subscription_required"
        return JsonResponse({"detail": detail}, status=403)
    conversation = ChatConversation.objects.filter(id=conversation_id, organization=org).first()
    if not conversation:
        return JsonResponse({"detail": "not_found"}, status=404)
    ChatMessage.objects.filter(conversation=conversation).delete()
    conversation.delete()
    return HttpResponse(status=204)


@login_required
@require_http_methods(["GET", "POST"])
def media_library_list(request):
    user = request.user
    org = _resolve_org_for_user(user)
    if not org or not _is_org_admin(user):
        return JsonResponse({"detail": "forbidden"}, status=403)
    subscription, error_detail = _require_active_subscription(org)
    if not subscription:
        detail = "Trial ended. Please upgrade your plan." if error_detail == "trial_ended" else "subscription_required"
        return JsonResponse({"detail": detail}, status=403)

    if request.method == "POST":
        upload = request.FILES.get("file")
        if upload:
            filename = str(upload.name or "document")
            ext = os.path.splitext(filename)[1].lower()
            media_type = AI_MEDIA_ALLOWED_EXTENSIONS.get(ext)
            if not media_type:
                return JsonResponse({"detail": "unsupported_file_type"}, status=400)
            if upload.size and upload.size > (2 * 1024 * 1024):
                return JsonResponse({"detail": "file_too_large", "max_mb": 2}, status=413)
            allowed, usage_bytes, limit_bytes = _check_ai_library_storage(org, subscription, upload.size or 0)
            if not allowed:
                return JsonResponse({
                    "detail": "storage_limit_exceeded",
                    "usage_bytes": usage_bytes,
                    "limit_bytes": limit_bytes,
                }, status=413)
            name = (request.POST.get("name") or filename).strip()
            item = AiMediaLibraryItem.objects.create(
                organization=org,
                name=name or filename,
                type=media_type,
                file_path=upload,
                file_size=getattr(upload, "size", 0) or 0,
                created_by=user,
            )
            return JsonResponse({"item": _serialize_media_item(item)}, status=201)

        payload = _parse_json_body(request)
        entry_type = str(payload.get("type", "")).strip().lower()
        name = str(payload.get("name", "")).strip()
        if entry_type == "extra_text":
            content = str(payload.get("content") or payload.get("text") or "").strip()
            if not content:
                return JsonResponse({"detail": "content_required"}, status=400)
            if not name:
                name = "Extra text"
            content_bytes = content.encode("utf-8")
            allowed, usage_bytes, limit_bytes = _check_ai_library_storage(org, subscription, len(content_bytes))
            if not allowed:
                return JsonResponse({
                    "detail": "storage_limit_exceeded",
                    "usage_bytes": usage_bytes,
                    "limit_bytes": limit_bytes,
                }, status=413)
            item = AiMediaLibraryItem.objects.create(
                organization=org,
                name=name,
                type="extra_text",
                text_content=content,
                file_size=len(content_bytes),
                created_by=user,
            )
            return JsonResponse({"item": _serialize_media_item(item)}, status=201)

        if entry_type in ("word_website_data", "website", "url"):
            source_url = str(payload.get("source_url") or payload.get("url") or "").strip()
            existing = AiMediaLibraryItem.objects.filter(
                organization=org,
                type="word_website_data",
            ).first()
            if existing:
                return JsonResponse({
                    "status": "blocked",
                    "message": "Website data already exists. Delete it before resubmitting.",
                }, status=409)
            if not source_url:
                return JsonResponse({"detail": "source_url_required"}, status=400)
            if not name:
                parsed = urlparse(source_url)
                name = parsed.netloc or source_url
            allowed, usage_bytes, limit_bytes = _check_ai_library_storage(org, subscription, 0)
            if not allowed:
                return JsonResponse({
                    "detail": "storage_limit_exceeded",
                    "usage_bytes": usage_bytes,
                    "limit_bytes": limit_bytes,
                }, status=413)
            item = AiMediaLibraryItem.objects.create(
                organization=org,
                name=name,
                type="word_website_data",
                source_url=source_url,
                file_size=0,
                is_auto_generated=True,
                created_by=user,
            )
            return JsonResponse({"item": _serialize_media_item(item)}, status=201)

        return JsonResponse({"detail": "invalid_payload"}, status=400)

    items = (
        AiMediaLibraryItem.objects
        .filter(organization=org)
        .select_related("created_by")
        .order_by("-created_at")[:500]
    )
    usage_bytes = _get_ai_library_usage_bytes(org)
    limit_bytes = _get_ai_library_limit_bytes(subscription)
    return JsonResponse({
        "items": [_serialize_media_item(item) for item in items],
        "usage_bytes": usage_bytes,
        "limit_bytes": limit_bytes,
    })


@login_required
@require_http_methods(["POST"])
def media_library_delete(request):
    user = request.user
    org = _resolve_org_for_user(user)
    if not org or not _is_org_admin(user):
        return JsonResponse({"detail": "forbidden"}, status=403)
    subscription, error_detail = _require_active_subscription(org)
    if not subscription:
        detail = "Trial ended. Please upgrade your plan." if error_detail == "trial_ended" else "subscription_required"
        return JsonResponse({"detail": detail}, status=403)

    payload = _parse_json_body(request)
    ids = payload.get("ids") if isinstance(payload, dict) else None
    if not ids or not isinstance(ids, list):
        return JsonResponse({"detail": "ids_required"}, status=400)
    ids = [int(item) for item in ids if str(item).isdigit()]
    if not ids:
        return JsonResponse({"detail": "ids_required"}, status=400)
    items = AiMediaLibraryItem.objects.filter(id__in=ids, organization=org)
    count = items.count()
    if count:
        items.delete()
    return JsonResponse({"deleted": count})


@login_required
@require_http_methods(["POST"])
def media_library_reupload(request, item_id):
    user = request.user
    org = _resolve_org_for_user(user)
    if not org or not _is_org_admin(user):
        return JsonResponse({"detail": "forbidden"}, status=403)
    subscription, error_detail = _require_active_subscription(org)
    if not subscription:
        detail = "Trial ended. Please upgrade your plan." if error_detail == "trial_ended" else "subscription_required"
        return JsonResponse({"detail": detail}, status=403)

    item = AiMediaLibraryItem.objects.filter(id=item_id, organization=org).first()
    if not item:
        return JsonResponse({"detail": "not_found"}, status=404)
    if item.type != "word_website_data":
        return JsonResponse({"detail": "reupload_not_allowed"}, status=400)

    upload = request.FILES.get("file")
    if not upload:
        return JsonResponse({"detail": "file_required"}, status=400)
    filename = str(upload.name or "website-data.docx")
    ext = os.path.splitext(filename)[1].lower()
    if ext != ".docx":
        return JsonResponse({"detail": "unsupported_file_type"}, status=400)

    allowed, usage_bytes, limit_bytes = _check_ai_library_storage_replace(
        org,
        subscription,
        item.file_size,
        upload.size or 0,
    )
    if not allowed:
        return JsonResponse({
            "detail": "storage_limit_exceeded",
            "usage_bytes": usage_bytes,
            "limit_bytes": limit_bytes,
        }, status=413)

    item.file_path = upload
    item.file_size = getattr(upload, "size", 0) or 0
    item.save(update_fields=["file_path", "file_size", "updated_at"])
    return JsonResponse({"item": _serialize_media_item(item)})


@login_required
@require_http_methods(["GET", "POST"])
def faq_list(request):
    user = request.user
    org = _resolve_org_for_user(user)
    if not org or not _is_org_admin(user):
        return JsonResponse({"detail": "forbidden"}, status=403)
    subscription, error_detail = _require_active_subscription(org)
    if not subscription:
        detail = "Trial ended. Please upgrade your plan." if error_detail == "trial_ended" else "subscription_required"
        return JsonResponse({"detail": detail}, status=403)

    if request.method == "POST":
        payload = _parse_json_body(request)
        question = str(payload.get("question") or "").strip()
        answer = str(payload.get("answer") or "").strip()
        if not question or not answer:
            return JsonResponse({"detail": "question_answer_required"}, status=400)
        if len(question) > 75:
            return JsonResponse({"detail": "question_too_long", "max_chars": 75}, status=400)
        if len(answer) > 250:
            return JsonResponse({"detail": "answer_too_long", "max_chars": 250}, status=400)
        with transaction.atomic():
            current_count = AiFaq.objects.select_for_update().filter(organization=org).count()
            if current_count >= MAX_FAQS_PER_ORG:
                return JsonResponse({"detail": "faq_limit_reached"}, status=409)
            faq = AiFaq.objects.create(
                organization=org,
                question=question,
                answer=answer,
            )
        remaining = MAX_FAQS_PER_ORG - AiFaq.objects.filter(organization=org).count()
        return JsonResponse({
            "item": _serialize_faq(faq),
            "remaining": remaining,
            "limit": MAX_FAQS_PER_ORG,
        }, status=201)

    items = (
        AiFaq.objects
        .filter(organization=org)
        .order_by("-created_at")[:MAX_FAQS_PER_ORG]
    )
    count = AiFaq.objects.filter(organization=org).count()
    remaining = max(0, MAX_FAQS_PER_ORG - count)
    return JsonResponse({
        "items": [_serialize_faq(item) for item in items],
        "count": count,
        "remaining": remaining,
        "limit": MAX_FAQS_PER_ORG,
    })


@login_required
@require_http_methods(["PATCH", "DELETE"])
def faq_detail(request, faq_id):
    user = request.user
    org = _resolve_org_for_user(user)
    if not org or not _is_org_admin(user):
        return JsonResponse({"detail": "forbidden"}, status=403)
    subscription, error_detail = _require_active_subscription(org)
    if not subscription:
        detail = "Trial ended. Please upgrade your plan." if error_detail == "trial_ended" else "subscription_required"
        return JsonResponse({"detail": detail}, status=403)

    faq = AiFaq.objects.filter(id=faq_id, organization=org).first()
    if not faq:
        return JsonResponse({"detail": "not_found"}, status=404)

    if request.method == "DELETE":
        faq.delete()
        remaining = MAX_FAQS_PER_ORG - AiFaq.objects.filter(organization=org).count()
        return JsonResponse({
            "deleted": True,
            "remaining": remaining,
            "limit": MAX_FAQS_PER_ORG,
        })

    payload = _parse_json_body(request)
    question = str(payload.get("question") or "").strip()
    answer = str(payload.get("answer") or "").strip()
    if not question or not answer:
        return JsonResponse({"detail": "question_answer_required"}, status=400)
    if len(question) > 75:
        return JsonResponse({"detail": "question_too_long", "max_chars": 75}, status=400)
    if len(answer) > 250:
        return JsonResponse({"detail": "answer_too_long", "max_chars": 250}, status=400)
    faq.question = question
    faq.answer = answer
    faq.save(update_fields=["question", "answer"])
    remaining = MAX_FAQS_PER_ORG - AiFaq.objects.filter(organization=org).count()
    return JsonResponse({
        "item": _serialize_faq(faq),
        "remaining": remaining,
        "limit": MAX_FAQS_PER_ORG,
    })
