import json
from decimal import Decimal
import csv
import io
import os
import zipfile
from xml.etree import ElementTree as ET
from urllib.parse import quote_plus

from django.conf import settings
from django.contrib.auth import get_user_model
from django.contrib.auth.decorators import login_required
from django.db import transaction
from django.http import JsonResponse
from django.utils import timezone
from django.views.decorators.http import require_http_methods
from reportlab.pdfgen import canvas
from PIL import Image, ImageDraw

from core.models import Organization, UserProfile
from apps.backend.storage.permissions import resolve_org_for_user

from .models import (
    ImpositionAddonCatalog,
    ImpositionBillingRecord,
    ImpositionDataImport,
    ImpositionDevice,
    ImpositionJob,
    ImpositionLicense,
    ImpositionOrgAddon,
    ImpositionProductUser,
    ImpositionTemplate,
    ImpositionUsageLog,
)
from .services import (
    build_policy_payload,
    get_effective_feature_flags,
    get_active_subscription,
    get_device_limit,
    get_license_with_subscription,
    get_user_limit,
    register_device,
    touch_license_verification,
)

User = get_user_model()
ADDON_LIMIT_MESSAGE = "Upgrade plan or purchase additional user."
QR_BARCODE_TYPES = ("code128", "ean13", "qr_code")


def _json_error(detail, *, status=400, extra=None):
    payload = {"detail": detail}
    if extra:
        payload.update(extra)
    return JsonResponse(payload, status=status)


def _json_body(request):
    if not request.body:
        return {}
    try:
        return json.loads(request.body.decode("utf-8"))
    except Exception:
        return None


def _resolve_org(request):
    org = resolve_org_for_user(request.user, request=request)
    if org:
        return org
    profile = UserProfile.objects.filter(user=request.user).select_related("organization").first()
    if profile and profile.organization:
        return profile.organization
    return Organization.objects.filter(owner=request.user).first()


def _require_imposition_access(request):
    if not request.user.is_authenticated:
        return None, None, _json_error("authentication_required", status=401)
    org = _resolve_org(request)
    if not org:
        return None, None, _json_error("organization_required", status=403)
    sub = get_active_subscription(org)
    if not sub:
        return org, None, _json_error("subscription_required", status=403)
    return org, sub, None


def _string(payload, key, fallback=""):
    return str(payload.get(key) or fallback).strip()


def _is_org_admin_user(user, org=None):
    if not user or not user.is_authenticated:
        return False
    if user.is_superuser:
        return True
    profile = UserProfile.objects.filter(user=user).select_related("organization").first()
    if not profile:
        return False
    if org and profile.organization_id and profile.organization_id != org.id and not user.is_superuser:
        return False
    return profile.role in ("company_admin", "superadmin", "super_admin")


def _active_license_for_org(org, sub=None):
    if not org:
        return None
    row = (
        ImpositionLicense.objects
        .filter(organization=org, status="active")
        .select_related("subscription", "subscription__plan")
        .order_by("-updated_at")
        .first()
    )
    if row:
        return row
    if not sub:
        return None
    return (
        ImpositionLicense.objects
        .filter(subscription=sub)
        .order_by("-updated_at")
        .first()
    )


def _ensure_product_users_seed(org, license_row=None):
    memberships = []
    profiles = list(
        UserProfile.objects
        .filter(organization=org)
        .select_related("user")
    )
    for profile in profiles:
        if not profile.user_id:
            continue
        memberships.append({
            "user_id": profile.user_id,
            "role": profile.role or "org_user",
            "status": "active" if profile.user.is_active else "disabled",
        })
    if org.owner_id and not any(item["user_id"] == org.owner_id for item in memberships):
        memberships.append({
            "user_id": org.owner_id,
            "role": "company_admin",
            "status": "active",
        })

    for item in memberships:
        row, created = ImpositionProductUser.objects.get_or_create(
            organization=org,
            user_id=item["user_id"],
            defaults={
                "role": item["role"],
                "license": license_row,
                "status": item["status"],
            },
        )
        updates = []
        if row.role != item["role"]:
            row.role = item["role"]
            updates.append("role")
        if row.status == "deleted":
            continue
        if row.status != item["status"]:
            row.status = item["status"]
            updates.append("status")
        if not row.license_id and license_row:
            row.license = license_row
            updates.append("license")
        if updates and not created:
            row.save(update_fields=updates + ["updated_at"])


def _active_product_user_count(org):
    return (
        ImpositionProductUser.objects
        .filter(organization=org, status="active")
        .count()
    )


def _trial_days_remaining(sub):
    if not sub or sub.status != "trialing" or not sub.ends_at:
        return 0
    delta = sub.ends_at - timezone.now()
    return max(0, int(delta.total_seconds() // 86400))


def _resolve_addon_catalog():
    addon = (
        ImpositionAddonCatalog.objects
        .filter(addon_code="imposition_user", is_active=True)
        .order_by("-updated_at")
        .first()
    )
    if addon:
        return addon
    return ImpositionAddonCatalog.objects.create(
        addon_code="imposition_user",
        addon_name="Additional User",
        product="Imposition Software",
        price_month_inr=Decimal("300"),
        price_year_inr=Decimal("3000"),
        price_month_usd=Decimal("4"),
        price_year_usd=Decimal("40"),
        is_active=True,
    )


def _addon_totals(addon_catalog, quantity, billing_cycle):
    qty = max(0, int(quantity or 0))
    cycle = "yearly" if str(billing_cycle or "").lower() == "yearly" else "monthly"
    if cycle == "yearly":
        inr_unit = Decimal(str(addon_catalog.price_year_inr or 0))
        usd_unit = Decimal(str(addon_catalog.price_year_usd or 0))
    else:
        inr_unit = Decimal(str(addon_catalog.price_month_inr or 0))
        usd_unit = Decimal(str(addon_catalog.price_month_usd or 0))
    return {
        "quantity": qty,
        "billing_cycle": cycle,
        "unit_inr": float(inr_unit),
        "unit_usd": float(usd_unit),
        "total_inr": float(inr_unit * qty),
        "total_usd": float(usd_unit * qty),
    }


def _is_higher_plan(sub):
    code = (sub.plan.code if sub and sub.plan else "").lower()
    return code in ("business", "enterprise")


def _qr_barcode_feature_enabled(sub):
    if _is_higher_plan(sub):
        return True
    if not sub or not sub.plan:
        return False
    flags = get_effective_feature_flags(sub.plan)
    return bool(flags.get("qr_barcode_generator"))


def _normalize_barcode_type(value):
    raw = str(value or "qr_code").strip().lower().replace("-", "_")
    return raw if raw in QR_BARCODE_TYPES else "qr_code"


def _normalize_qr_options(payload):
    payload = payload if isinstance(payload, dict) else {}
    source_type = _string(payload, "source_type", "id_number").lower()
    if source_type not in ("id_number", "url", "custom_text"):
        source_type = "id_number"
    qr_position = _string(payload, "qr_position", "bottom_right").lower()
    allowed_positions = {
        "top_left", "top_center", "top_right",
        "middle_left", "middle_center", "middle_right",
        "bottom_left", "bottom_center", "bottom_right",
    }
    if qr_position not in allowed_positions:
        qr_position = "bottom_right"
    try:
        qr_size = int(payload.get("qr_size") or 80)
    except (TypeError, ValueError):
        qr_size = 80
    qr_size = max(24, min(400, qr_size))
    try:
        margin = int(payload.get("margin") or 4)
    except (TypeError, ValueError):
        margin = 4
    margin = max(0, min(100, margin))
    return {
        "source_type": source_type,
        "barcode_type": _normalize_barcode_type(payload.get("barcode_type")),
        "qr_size": qr_size,
        "qr_position": qr_position,
        "margin": margin,
    }


def _sanitize_ean13(value):
    digits = "".join(ch for ch in str(value or "") if ch.isdigit())
    if len(digits) < 12:
        digits = digits.ljust(12, "0")
    return digits[:12]


def _build_code_value(*, source_type, payload, record=None):
    record = record if isinstance(record, dict) else {}
    record_id = record.get("ID") or record.get("id") or record.get("Id") or payload.get("id_number") or ""
    if source_type == "url":
        return _string(payload, "url")
    if source_type == "custom_text":
        return _string(payload, "custom_text")
    return str(record_id).strip()


def _build_code_artifact(*, payload, options, record=None):
    code_content = _build_code_value(source_type=options["source_type"], payload=payload, record=record)
    company_base = _string(payload, "company_base_url", "https://company.com/id")
    if not company_base.startswith("http://") and not company_base.startswith("https://"):
        company_base = f"https://{company_base.lstrip('/')}"
    if options["source_type"] == "id_number":
        code_content = f"{company_base.rstrip('/')}/{quote_plus(code_content)}"

    barcode_type = options["barcode_type"]
    if barcode_type == "ean13":
        encoded = _sanitize_ean13(code_content)
        render_url = f"https://quickchart.io/barcode?type=ean13&text={quote_plus(encoded)}&format=png"
    elif barcode_type == "code128":
        encoded = str(code_content)
        render_url = f"https://quickchart.io/barcode?type=code128&text={quote_plus(encoded)}&format=png"
    else:
        encoded = str(code_content)
        render_url = f"https://quickchart.io/qr?size={options['qr_size']}&text={quote_plus(encoded)}"
        barcode_type = "qr_code"

    return {
        "source_type": options["source_type"],
        "barcode_type": barcode_type,
        "content": encoded,
        "render_url": render_url,
        "layout": {
            "size": options["qr_size"],
            "position": options["qr_position"],
            "margin": options["margin"],
            "auto_place_in_card_layout": True,
        },
    }


def _extract_import_records(payload):
    rows = payload.get("records")
    if not isinstance(rows, list):
        return []
    return [row for row in rows if isinstance(row, dict)]


def _parse_csv_bytes(file_bytes):
    text = file_bytes.decode("utf-8-sig", errors="replace")
    reader = csv.DictReader(io.StringIO(text))
    records = []
    for row in reader:
        if not isinstance(row, dict):
            continue
        cleaned = {str(key or "").strip(): str(value or "").strip() for key, value in row.items() if key}
        if any(str(v).strip() for v in cleaned.values()):
            records.append(cleaned)
    return records


def _col_index_from_ref(ref):
    letters = "".join(ch for ch in ref if ch.isalpha()).upper()
    if not letters:
        return 0
    idx = 0
    for ch in letters:
        idx = idx * 26 + (ord(ch) - ord("A") + 1)
    return max(0, idx - 1)


def _parse_xlsx_bytes(file_bytes):
    records = []
    with zipfile.ZipFile(io.BytesIO(file_bytes)) as zf:
        shared_strings = []
        if "xl/sharedStrings.xml" in zf.namelist():
            root = ET.fromstring(zf.read("xl/sharedStrings.xml"))
            ns = {"x": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
            for si in root.findall("x:si", ns):
                text_chunks = []
                for t in si.findall(".//x:t", ns):
                    text_chunks.append(t.text or "")
                shared_strings.append("".join(text_chunks))

        sheet_xml = None
        for candidate in ("xl/worksheets/sheet1.xml",):
            if candidate in zf.namelist():
                sheet_xml = zf.read(candidate)
                break
        if sheet_xml is None:
            sheet_paths = [name for name in zf.namelist() if name.startswith("xl/worksheets/sheet") and name.endswith(".xml")]
            if not sheet_paths:
                return []
            sheet_xml = zf.read(sorted(sheet_paths)[0])

        root = ET.fromstring(sheet_xml)
        ns = {"x": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
        rows = []
        for row in root.findall(".//x:sheetData/x:row", ns):
            values = {}
            for cell in row.findall("x:c", ns):
                ref = cell.attrib.get("r", "")
                col_idx = _col_index_from_ref(ref)
                cell_type = cell.attrib.get("t")
                value_node = cell.find("x:v", ns)
                value = ""
                if value_node is not None and value_node.text is not None:
                    raw = value_node.text
                    if cell_type == "s":
                        try:
                            value = shared_strings[int(raw)]
                        except Exception:
                            value = raw
                    else:
                        value = raw
                else:
                    inline = cell.find("x:is/x:t", ns)
                    if inline is not None and inline.text is not None:
                        value = inline.text
                values[col_idx] = str(value).strip()
            if values:
                rows.append(values)

        if not rows:
            return []
        header_row = rows[0]
        max_col = max(header_row.keys())
        headers = []
        for idx in range(max_col + 1):
            name = str(header_row.get(idx, "")).strip()
            if not name:
                name = f"Column{idx + 1}"
            headers.append(name)
        for row in rows[1:]:
            item = {}
            for idx, header in enumerate(headers):
                item[header] = str(row.get(idx, "")).strip()
            if any(str(v).strip() for v in item.values()):
                records.append(item)
    return records


def _load_bulk_records(upload_name, file_bytes):
    name = str(upload_name or "").lower()
    if name.endswith(".csv"):
        return _parse_csv_bytes(file_bytes)
    if name.endswith(".xlsx"):
        return _parse_xlsx_bytes(file_bytes)
    raise ValueError("unsupported_file_type")


def _normalize_field_mapping(payload):
    if isinstance(payload, dict):
        return {str(k).strip(): str(v).strip() for k, v in payload.items() if str(k).strip() and str(v).strip()}
    return {}


def _apply_field_mapping(records, field_mapping):
    if not field_mapping:
        return records
    mapped = []
    for row in records:
        card = {}
        for excel_field, card_field in field_mapping.items():
            card[card_field] = str(row.get(excel_field, "")).strip()
        mapped.append(card)
    return mapped


def _sheet_mm(sheet_size):
    value = str(sheet_size or "A4").strip().upper()
    if value == "A3":
        return (297, 420)
    return (210, 297)


def _layout_summary(record_count, sheet_size="A4", card_w=54, card_h=86, margin=5, gap=2):
    sheet_w, sheet_h = _sheet_mm(sheet_size)
    usable_w = max(1, sheet_w - (margin * 2))
    usable_h = max(1, sheet_h - (margin * 2))
    per_row = max(1, int((usable_w + gap) // (card_w + gap)))
    per_col = max(1, int((usable_h + gap) // (card_h + gap)))
    cards_per_sheet = max(1, per_row * per_col)
    sheets = (max(0, int(record_count)) + cards_per_sheet - 1) // cards_per_sheet
    return {
        "sheet_size": sheet_size,
        "sheet_width_mm": sheet_w,
        "sheet_height_mm": sheet_h,
        "card_width_mm": card_w,
        "card_height_mm": card_h,
        "margin_mm": margin,
        "gap_mm": gap,
        "cards_per_row": per_row,
        "cards_per_column": per_col,
        "cards_per_sheet": cards_per_sheet,
        "total_records": max(0, int(record_count)),
        "total_sheets": sheets,
    }


def _ensure_export_dir(org_id):
    root = os.path.join(str(settings.MEDIA_ROOT), "imposition_exports", str(org_id))
    os.makedirs(root, exist_ok=True)
    return root


def _create_export_file(*, org_id, job_id, export_format, layout_summary):
    export_format = str(export_format or "").lower()
    if export_format not in ("pdf", "png", "tiff"):
        raise ValueError("unsupported_export_format")
    out_dir = _ensure_export_dir(org_id)
    filename = f"imposition_job_{job_id}.{export_format}"
    abs_path = os.path.join(out_dir, filename)
    title = f"Imposition Job #{job_id}"
    line_1 = f"Records: {layout_summary.get('total_records', 0)}"
    line_2 = f"Sheets ({layout_summary.get('sheet_size', 'A4')}): {layout_summary.get('total_sheets', 0)}"

    if export_format == "pdf":
        c = canvas.Canvas(abs_path)
        c.setTitle(title)
        c.setFont("Helvetica-Bold", 14)
        c.drawString(48, 790, title)
        c.setFont("Helvetica", 11)
        c.drawString(48, 760, line_1)
        c.drawString(48, 742, line_2)
        c.drawString(48, 724, "QR embedded in print PDF layout when enabled.")
        c.save()
    else:
        image = Image.new("RGB", (1600, 1000), color=(248, 250, 252))
        draw = ImageDraw.Draw(image)
        draw.text((60, 80), title, fill=(15, 23, 42))
        draw.text((60, 140), line_1, fill=(51, 65, 85))
        draw.text((60, 180), line_2, fill=(51, 65, 85))
        draw.text((60, 220), "Bulk imposition export preview", fill=(51, 65, 85))
        if export_format == "png":
            image.save(abs_path, format="PNG")
        else:
            image.save(abs_path, format="TIFF")
    media_prefix = str(settings.MEDIA_URL or "/media/")
    relative = f"imposition_exports/{org_id}/{filename}"
    return {
        "absolute_path": abs_path,
        "relative_path": relative,
        "download_url": f"{media_prefix.rstrip('/')}/{relative}",
        "format": export_format,
    }


def _serialize_product_user(row):
    user = row.user
    return {
        "id": row.id,
        "user_id": user.id,
        "user_name": user.first_name or user.username,
        "email": user.email or user.username,
        "role": row.role or "org_user",
        "license_code": row.license.code if row.license_id else "",
        "status": row.status,
        "last_login": (
            row.last_login.isoformat()
            if row.last_login
            else (user.last_login.isoformat() if user.last_login else "")
        ),
    }


@require_http_methods(["POST"])
def license_validate(request):
    payload = _json_body(request)
    if payload is None:
        return _json_error("invalid_json", status=400)
    license_code = _string(payload, "license_code").upper()
    if not license_code:
        return _json_error("license_code_required", status=400)

    license_row, sub = get_license_with_subscription(license_code)
    if not license_row or not sub:
        return _json_error("license_invalid", status=404)

    touch_license_verification(license_row)
    policy = build_policy_payload(license_row=license_row, sub=sub)
    return JsonResponse({
        "ok": True,
        "message": "license_valid",
        "policy": policy,
    })


@require_http_methods(["POST"])
def device_register(request):
    payload = _json_body(request)
    if payload is None:
        return _json_error("invalid_json", status=400)

    license_code = _string(payload, "license_code").upper()
    device_id = _string(payload, "device_id")
    device_name = _string(payload, "device_name")
    os_name = _string(payload, "os")
    app_version = _string(payload, "app_version")

    if not license_code or not device_id:
        return _json_error("license_code_and_device_id_required", status=400)

    license_row, sub = get_license_with_subscription(license_code)
    if not license_row or not sub:
        return _json_error("license_invalid", status=404)

    user = request.user if request.user.is_authenticated else None
    device, limit_exceeded = register_device(
        license_row=license_row,
        sub=sub,
        device_id=device_id,
        device_name=device_name,
        os_name=os_name,
        app_version=app_version,
        user=user,
    )
    if limit_exceeded:
        return _json_error(
            "device_limit_exceeded",
            status=403,
            extra={
                "device_limit": get_device_limit(sub),
                "active_devices": license_row.devices.filter(is_active=True).count(),
            },
        )

    touch_license_verification(license_row)
    ImpositionUsageLog.objects.create(
        organization=license_row.organization,
        user=user,
        device=device,
        event_type="device_registered",
        event_payload={
            "device_id": device_id,
            "device_name": device_name,
            "os": os_name,
            "app_version": app_version,
        },
    )

    return JsonResponse({
        "ok": True,
        "device": {
            "id": str(device.id),
            "device_id": device.device_id,
            "device_name": device.device_name,
            "os": device.os,
            "last_active": device.last_active_at.isoformat() if device.last_active_at else "",
        },
        "policy": build_policy_payload(license_row=license_row, sub=sub),
    })


@require_http_methods(["POST"])
def device_check(request):
    payload = _json_body(request)
    if payload is None:
        return _json_error("invalid_json", status=400)

    license_code = _string(payload, "license_code").upper()
    device_id = _string(payload, "device_id")
    if not license_code or not device_id:
        return _json_error("license_code_and_device_id_required", status=400)

    license_row, sub = get_license_with_subscription(license_code)
    if not license_row or not sub:
        return _json_error("license_invalid", status=404)

    device = (
        ImpositionDevice.objects
        .filter(license=license_row, organization=license_row.organization, device_id=device_id, is_active=True)
        .first()
    )
    if not device:
        return _json_error("device_not_registered", status=404)

    device.save(update_fields=["last_active_at"])
    touch_license_verification(license_row)

    return JsonResponse({
        "ok": True,
        "device_registered": True,
        "policy": build_policy_payload(license_row=license_row, sub=sub),
    })


@require_http_methods(["POST"])
def device_heartbeat(request):
    payload = _json_body(request)
    if payload is None:
        return _json_error("invalid_json", status=400)

    license_code = _string(payload, "license_code").upper()
    device_id = _string(payload, "device_id")
    if not license_code or not device_id:
        return _json_error("license_code_and_device_id_required", status=400)

    license_row, sub = get_license_with_subscription(license_code)
    if not license_row or not sub:
        return _json_error("license_invalid", status=404)

    device = (
        ImpositionDevice.objects
        .filter(license=license_row, organization=license_row.organization, device_id=device_id, is_active=True)
        .first()
    )
    if not device:
        return _json_error("device_not_registered", status=404)

    device.device_name = _string(payload, "device_name", device.device_name)
    device.os = _string(payload, "os", device.os)
    device.app_version = _string(payload, "app_version", device.app_version)
    device.save(update_fields=["device_name", "os", "app_version", "last_active_at"])
    touch_license_verification(license_row)

    return JsonResponse({"ok": True, "last_active": device.last_active_at.isoformat()})


@login_required
@require_http_methods(["GET"])
def policy(request):
    org, sub, error = _require_imposition_access(request)
    if error:
        return error
    license_row = (
        sub.licenses.filter(status="active").order_by("-updated_at").first()
        if sub else None
    )
    if not license_row:
        return _json_error("license_not_generated", status=404)

    payload = build_policy_payload(license_row=license_row, sub=sub)
    payload["users_limit"] = get_user_limit(org, sub=sub)
    payload["active_devices"] = license_row.devices.filter(is_active=True).count()
    return JsonResponse({"ok": True, "policy": payload})


@login_required
@require_http_methods(["GET", "POST"])
def imposition_jobs(request):
    org, sub, error = _require_imposition_access(request)
    if error:
        return error

    if request.method == "GET":
        rows = (
            ImpositionJob.objects
            .filter(organization=org)
            .select_related("created_by")
            .order_by("-updated_at")[:200]
        )
        return JsonResponse({
            "items": [
                {
                    "id": row.id,
                    "job_type": row.job_type,
                    "title": row.title,
                    "sheet_size": row.sheet_size,
                    "status": row.status,
                    "settings": row.settings,
                    "output_meta": row.output_meta,
                    "created_at": row.created_at.isoformat() if row.created_at else "",
                    "updated_at": row.updated_at.isoformat() if row.updated_at else "",
                }
                for row in rows
            ]
        })

    payload = _json_body(request)
    if payload is None:
        return _json_error("invalid_json", status=400)

    job_type = _string(payload, "job_type", "id_card").lower()
    if job_type not in ("id_card", "business_card"):
        return _json_error("invalid_job_type", status=400)

    qr_payload = payload.get("qr_barcode") if isinstance(payload.get("qr_barcode"), dict) else {}
    qr_enabled = bool(qr_payload.get("enabled"))
    qr_options = _normalize_qr_options(qr_payload)
    if qr_enabled and not _qr_barcode_feature_enabled(sub):
        return _json_error("plan_feature_locked_qr_barcode", status=403)

    settings_payload = payload.get("settings") if isinstance(payload.get("settings"), dict) else {}
    settings_payload = dict(settings_payload)
    if qr_enabled:
        settings_payload["qr_barcode"] = {
            "enabled": True,
            **qr_options,
            "auto_place_in_card_layout": True,
        }
    output_meta = {
        "export": {
            "print_pdf": {
                "embed_qr": bool(qr_enabled),
                "status": "ready_for_export",
            },
        },
        "qr_barcode_module": {
            "enabled": bool(qr_enabled),
            "supported_types": list(QR_BARCODE_TYPES),
            "higher_plan_only": True,
        },
    }

    row = ImpositionJob.objects.create(
        organization=org,
        created_by=request.user,
        job_type=job_type,
        title=_string(payload, "title"),
        sheet_size=_string(payload, "sheet_size", "A4"),
        settings=settings_payload,
        status="draft",
        output_meta=output_meta,
    )
    ImpositionUsageLog.objects.create(
        organization=org,
        user=request.user,
        event_type="job_created",
        event_payload={
            "job_id": row.id,
            "job_type": row.job_type,
            "qr_barcode_enabled": bool(qr_enabled),
            "export_print_pdf_embed_qr": bool(qr_enabled),
        },
    )
    return JsonResponse({"ok": True, "id": row.id}, status=201)


@login_required
@require_http_methods(["GET", "POST"])
def imposition_templates(request):
    org, _, error = _require_imposition_access(request)
    if error:
        return error

    if request.method == "GET":
        rows = (
            ImpositionTemplate.objects
            .filter(organization=org)
            .select_related("created_by")
            .order_by("name")
        )
        return JsonResponse({
            "items": [
                {
                    "id": row.id,
                    "name": row.name,
                    "template_type": row.template_type,
                    "layout": row.layout,
                    "is_system": row.is_system,
                    "created_at": row.created_at.isoformat() if row.created_at else "",
                }
                for row in rows
            ]
        })

    payload = _json_body(request)
    if payload is None:
        return _json_error("invalid_json", status=400)

    template_type = _string(payload, "template_type", "id_card").lower()
    if template_type not in ("id_card", "business_card"):
        return _json_error("invalid_template_type", status=400)

    name = _string(payload, "name")
    if not name:
        return _json_error("name_required", status=400)

    with transaction.atomic():
        row = ImpositionTemplate.objects.create(
            organization=org,
            name=name,
            template_type=template_type,
            layout=(payload.get("layout") if isinstance(payload.get("layout"), dict) else {}),
            created_by=request.user,
        )
    return JsonResponse({"ok": True, "id": row.id}, status=201)


@login_required
@require_http_methods(["POST"])
def data_import(request):
    org, sub, error = _require_imposition_access(request)
    if error:
        return error

    if not _is_higher_plan(sub):
        return _json_error("plan_feature_locked", status=403)

    payload = _json_body(request)
    if payload is None:
        return _json_error("invalid_json", status=400)

    import_type = _string(payload, "import_type", "id_card").lower()
    if import_type not in ("id_card", "business_card"):
        return _json_error("invalid_import_type", status=400)

    mapping = payload.get("mapping") if isinstance(payload.get("mapping"), dict) else {}
    qr_payload = payload.get("qr_barcode") if isinstance(payload.get("qr_barcode"), dict) else {}
    qr_enabled = bool(qr_payload.get("enabled", True))
    qr_options = _normalize_qr_options(qr_payload)
    records = _extract_import_records(payload)
    generated_codes = []
    if qr_enabled:
        for record in records:
            generated_codes.append({
                "record": record,
                "qr_barcode": _build_code_artifact(payload=payload, options=qr_options, record=record),
            })
    row_count = payload.get("row_count")
    try:
        row_count = int(row_count or 0)
    except (TypeError, ValueError):
        row_count = 0
    if records:
        row_count = len(records)

    mapping_payload = dict(mapping)
    if qr_enabled:
        mapping_payload["qr_barcode_module"] = {
            "enabled": True,
            **qr_options,
            "auto_place_in_card_layout": True,
            "generated_count": len(generated_codes),
        }
        if generated_codes:
            mapping_payload["generated_qr_barcodes"] = generated_codes

    row = ImpositionDataImport.objects.create(
        organization=org,
        created_by=request.user,
        import_type=import_type,
        source_filename=_string(payload, "source_filename"),
        mapping=mapping_payload,
        row_count=max(0, row_count),
        status="processed",
    )

    ImpositionUsageLog.objects.create(
        organization=org,
        user=request.user,
        event_type="data_import",
        event_payload={
            "import_id": row.id,
            "import_type": row.import_type,
            "row_count": row.row_count,
            "qr_barcode_enabled": bool(qr_enabled),
            "generated_codes": len(generated_codes),
        },
    )

    return JsonResponse({
        "ok": True,
        "id": row.id,
        "generated_qr_barcodes": len(generated_codes),
        "preview": generated_codes[:10],
    }, status=201)


@login_required
@require_http_methods(["POST"])
def qr_barcode_generate(request):
    org, sub, error = _require_imposition_access(request)
    if error:
        return error
    if not _qr_barcode_feature_enabled(sub):
        return _json_error("plan_feature_locked_qr_barcode", status=403)
    payload = _json_body(request)
    if payload is None:
        return _json_error("invalid_json", status=400)
    options = _normalize_qr_options(payload)
    record = payload.get("record") if isinstance(payload.get("record"), dict) else None
    artifact = _build_code_artifact(payload=payload, options=options, record=record)
    ImpositionUsageLog.objects.create(
        organization=org,
        user=request.user,
        event_type="qr_barcode_generated",
        event_payload={
            "barcode_type": artifact["barcode_type"],
            "source_type": artifact["source_type"],
            "content_preview": artifact["content"][:80],
        },
    )
    return JsonResponse({
        "ok": True,
        "artifact": artifact,
        "module": {
            "name": "QR & Barcode Generator",
            "allowed_types": list(QR_BARCODE_TYPES),
            "higher_plans_only": True,
            "allowed_plans": ["business", "enterprise"],
        },
    })


@login_required
@require_http_methods(["POST"])
def bulk_import_upload(request):
    org, sub, error = _require_imposition_access(request)
    if error:
        return error
    if not _is_higher_plan(sub):
        return _json_error("plan_feature_locked", status=403)

    upload = request.FILES.get("file")
    if not upload:
        return _json_error("file_required", status=400)
    filename = str(upload.name or "")
    if not filename.lower().endswith((".csv", ".xlsx")):
        return _json_error("unsupported_file_type", status=400)
    file_bytes = upload.read()
    try:
        records = _load_bulk_records(filename, file_bytes)
    except ValueError as exc:
        return _json_error(str(exc), status=400)
    except Exception:
        return _json_error("file_parse_failed", status=400)
    if not records:
        return _json_error("no_records_found", status=400)

    mapping_raw = request.POST.get("field_mapping") or request.POST.get("mapping") or "{}"
    try:
        mapping_obj = json.loads(mapping_raw) if isinstance(mapping_raw, str) else {}
    except Exception:
        mapping_obj = {}
    field_mapping = _normalize_field_mapping(mapping_obj)
    mapped_cards = _apply_field_mapping(records, field_mapping)
    qr_payload_raw = request.POST.get("qr_barcode") or "{}"
    try:
        qr_payload = json.loads(qr_payload_raw) if isinstance(qr_payload_raw, str) else {}
    except Exception:
        qr_payload = {}
    qr_enabled = bool((qr_payload or {}).get("enabled", True))
    qr_options = _normalize_qr_options(qr_payload)
    qr_preview = []
    if qr_enabled:
        for row in records[:50]:
            qr_preview.append(_build_code_artifact(payload=qr_payload or {}, options=qr_options, record=row))

    import_type = _string({"x": request.POST.get("import_type")}, "x", "id_card").lower()
    if import_type not in ("id_card", "business_card"):
        import_type = "id_card"
    row = ImpositionDataImport.objects.create(
        organization=org,
        created_by=request.user,
        import_type=import_type,
        source_filename=filename,
        mapping={
            "field_mapping": field_mapping,
            "records": records,
            "mapped_cards_preview": mapped_cards[:50],
            "qr_barcode_enabled": qr_enabled,
            "qr_options": qr_options,
            "qr_preview": qr_preview,
        },
        row_count=len(records),
        status="processed",
    )
    ImpositionUsageLog.objects.create(
        organization=org,
        user=request.user,
        event_type="bulk_import_uploaded",
        event_payload={"import_id": row.id, "rows": len(records), "filename": filename},
    )
    return JsonResponse({
        "ok": True,
        "import_id": row.id,
        "row_count": len(records),
        "preview": mapped_cards[:20],
        "qr_preview": qr_preview[:20],
        "module": "Excel Bulk Data Import",
    }, status=201)


@login_required
@require_http_methods(["POST"])
def bulk_layout_generate(request):
    org, sub, error = _require_imposition_access(request)
    if error:
        return error
    if not _is_higher_plan(sub):
        return _json_error("plan_feature_locked", status=403)
    payload = _json_body(request)
    if payload is None:
        return _json_error("invalid_json", status=400)
    import_id = payload.get("import_id")
    try:
        import_id = int(import_id)
    except (TypeError, ValueError):
        return _json_error("import_id_required", status=400)
    import_row = ImpositionDataImport.objects.filter(id=import_id, organization=org).first()
    if not import_row:
        return _json_error("import_not_found", status=404)

    sheet_size = _string(payload, "sheet_size", "A4").upper()
    layout = _layout_summary(
        record_count=import_row.row_count,
        sheet_size=sheet_size,
        card_w=int(payload.get("card_width_mm") or 54),
        card_h=int(payload.get("card_height_mm") or 86),
        margin=int(payload.get("margin_mm") or 5),
        gap=int(payload.get("gap_mm") or 2),
    )
    qr_data = import_row.mapping.get("qr_options") if isinstance(import_row.mapping, dict) else {}
    qr_enabled = bool(import_row.mapping.get("qr_barcode_enabled")) if isinstance(import_row.mapping, dict) else False
    job = ImpositionJob.objects.create(
        organization=org,
        created_by=request.user,
        job_type=import_row.import_type,
        title=f"Bulk Layout #{import_row.id}",
        sheet_size=sheet_size,
        settings={
            "source_import_id": import_row.id,
            "field_mapping": (import_row.mapping or {}).get("field_mapping", {}),
            "layout": layout,
            "qr_barcode": {
                "enabled": qr_enabled,
                **(qr_data if isinstance(qr_data, dict) else {}),
            },
        },
        status="ready",
        output_meta={
            "bulk_layout": layout,
            "export": {"print_pdf": {"embed_qr": qr_enabled}},
        },
    )
    ImpositionUsageLog.objects.create(
        organization=org,
        user=request.user,
        event_type="bulk_layout_generated",
        event_payload={"import_id": import_row.id, "job_id": job.id, "sheets": layout["total_sheets"]},
    )
    return JsonResponse({
        "ok": True,
        "job_id": job.id,
        "layout": layout,
        "example": f"{import_row.row_count} records auto arranged into {layout['total_sheets']} {sheet_size} sheets.",
    }, status=201)


@login_required
@require_http_methods(["POST"])
def bulk_export(request):
    org, sub, error = _require_imposition_access(request)
    if error:
        return error
    if not _is_higher_plan(sub):
        return _json_error("plan_feature_locked", status=403)
    payload = _json_body(request)
    if payload is None:
        return _json_error("invalid_json", status=400)
    try:
        job_id = int(payload.get("job_id"))
    except (TypeError, ValueError):
        return _json_error("job_id_required", status=400)
    export_format = _string(payload, "format", "pdf").lower()
    job = ImpositionJob.objects.filter(id=job_id, organization=org).first()
    if not job:
        return _json_error("job_not_found", status=404)
    layout = job.output_meta.get("bulk_layout") if isinstance(job.output_meta, dict) else None
    if not isinstance(layout, dict):
        layout = _layout_summary(record_count=0, sheet_size=job.sheet_size)
    try:
        file_info = _create_export_file(
            org_id=org.id,
            job_id=job.id,
            export_format=export_format,
            layout_summary=layout,
        )
    except ValueError as exc:
        return _json_error(str(exc), status=400)
    except Exception:
        return _json_error("export_generation_failed", status=500)

    output_meta = dict(job.output_meta or {})
    exports = dict(output_meta.get("exports") or {})
    exports[export_format] = file_info
    output_meta["exports"] = exports
    output_meta.setdefault("export", {}).setdefault("print_pdf", {})["embed_qr"] = bool(
        ((job.settings or {}).get("qr_barcode") or {}).get("enabled")
    )
    job.output_meta = output_meta
    job.save(update_fields=["output_meta", "updated_at"])
    ImpositionUsageLog.objects.create(
        organization=org,
        user=request.user,
        event_type="bulk_export_generated",
        event_payload={"job_id": job.id, "format": export_format, "file": file_info["relative_path"]},
    )
    return JsonResponse({
        "ok": True,
        "job_id": job.id,
        "format": export_format,
        "download_url": file_info["download_url"],
        "supported_formats": ["pdf", "png", "tiff"],
    })


@login_required
@require_http_methods(["GET"])
def product_license(request):
    org, sub, error = _require_imposition_access(request)
    if error:
        return error
    license_row = _active_license_for_org(org, sub=sub)
    if not license_row:
        return _json_error("license_not_generated", status=404)
    return JsonResponse({
        "ok": True,
        "license_code": license_row.code,
        "activation_date": license_row.created_at.isoformat() if license_row.created_at else "",
        "plan_expiry_date": sub.ends_at.isoformat() if sub and sub.ends_at else "",
        "status": sub.status if sub else "inactive",
    })


@login_required
@require_http_methods(["GET", "POST"])
def product_devices(request):
    org, sub, error = _require_imposition_access(request)
    if error:
        return error
    license_row = _active_license_for_org(org, sub=sub)

    if request.method == "GET":
        rows = (
            ImpositionDevice.objects
            .filter(organization=org)
            .order_by("-last_active_at", "-registered_at")
        )
        return JsonResponse({
            "ok": True,
            "items": [
                {
                    "id": row.id,
                    "device_name": row.device_name or "",
                    "device_id": row.device_id,
                    "os": row.os or "",
                    "last_active": row.last_active_at.isoformat() if row.last_active_at else "",
                    "status": "active" if row.is_active else "inactive",
                }
                for row in rows
            ],
            "device_limit": get_device_limit(sub),
            "active_devices": rows.filter(is_active=True).count(),
            "license_code": license_row.code if license_row else "",
        })

    if not _is_org_admin_user(request.user, org):
        return _json_error("forbidden", status=403)
    payload = _json_body(request)
    if payload is None:
        return _json_error("invalid_json", status=400)
    action = _string(payload, "action").lower()
    device_id = _string(payload, "device_id")
    if not device_id:
        return _json_error("device_id_required", status=400)
    row = ImpositionDevice.objects.filter(organization=org, device_id=device_id).first()
    if not row:
        return _json_error("device_not_found", status=404)

    if action == "deactivate":
        row.is_active = False
        row.save(update_fields=["is_active"])
        ImpositionUsageLog.objects.create(
            organization=org,
            user=request.user,
            device=row,
            event_type="device_deactivated",
            event_payload={"device_id": row.device_id},
        )
    elif action == "rename":
        next_name = _string(payload, "device_name")
        if not next_name:
            return _json_error("device_name_required", status=400)
        row.device_name = next_name
        row.save(update_fields=["device_name"])
        ImpositionUsageLog.objects.create(
            organization=org,
            user=request.user,
            device=row,
            event_type="device_renamed",
            event_payload={"device_id": row.device_id, "device_name": next_name},
        )
    else:
        return _json_error("invalid_action", status=400)

    return JsonResponse({"ok": True})


@login_required
@require_http_methods(["GET", "POST"])
def product_users(request):
    org, sub, error = _require_imposition_access(request)
    if error:
        return error
    license_row = _active_license_for_org(org, sub=sub)
    _ensure_product_users_seed(org, license_row=license_row)

    if request.method == "GET":
        if not _is_org_admin_user(request.user, org):
            return _json_error("forbidden", status=403)
        rows = (
            ImpositionProductUser.objects
            .filter(organization=org)
            .select_related("user", "license")
            .order_by("user__first_name", "user__username")
        )
        user_limit = get_user_limit(org, sub=sub)
        active_users = _active_product_user_count(org)
        return JsonResponse({
            "ok": True,
            "items": [_serialize_product_user(row) for row in rows],
            "user_limit": user_limit,
            "active_users": active_users,
            "can_add_user": active_users < user_limit if user_limit else False,
            "limit_message": ADDON_LIMIT_MESSAGE,
        })

    if not _is_org_admin_user(request.user, org):
        return _json_error("forbidden", status=403)
    payload = _json_body(request)
    if payload is None:
        return _json_error("invalid_json", status=400)
    action = _string(payload, "action").lower()

    if action == "add":
        user_limit = get_user_limit(org, sub=sub)
        active_users = _active_product_user_count(org)
        if user_limit and active_users >= user_limit:
            return _json_error("user_limit_reached", status=403, extra={"message": ADDON_LIMIT_MESSAGE})
        email = _string(payload, "email").lower()
        name = _string(payload, "user_name")
        password = _string(payload, "password")
        role = _string(payload, "role", "org_user")
        if not email or not password:
            return _json_error("email_and_password_required", status=400)
        if User.objects.filter(username__iexact=email).exists() or User.objects.filter(email__iexact=email).exists():
            return _json_error("email_already_exists", status=409)
        user = User.objects.create_user(
            username=email,
            email=email,
            first_name=name or email.split("@")[0],
            password=password,
        )
        UserProfile.objects.update_or_create(
            user=user,
            defaults={
                "organization": org,
                "role": role if role in ("org_user", "company_admin") else "org_user",
            },
        )
        row = ImpositionProductUser.objects.create(
            organization=org,
            user=user,
            role=role if role else "org_user",
            license=license_row,
            status="active",
        )
        ImpositionUsageLog.objects.create(
            organization=org,
            user=request.user,
            event_type="product_user_added",
            event_payload={"user_id": user.id, "email": email},
        )
        return JsonResponse({"ok": True, "item": _serialize_product_user(row)}, status=201)

    user_id = payload.get("user_id")
    try:
        user_id = int(user_id)
    except (TypeError, ValueError):
        return _json_error("user_id_required", status=400)
    row = (
        ImpositionProductUser.objects
        .select_related("user")
        .filter(organization=org, user_id=user_id)
        .first()
    )
    if not row:
        return _json_error("user_not_found", status=404)

    if action == "edit":
        email = _string(payload, "email")
        user_name = _string(payload, "user_name")
        role = _string(payload, "role", row.role)
        updates = []
        user_updates = []
        if email and email.lower() != (row.user.email or row.user.username).lower():
            email_lower = email.lower()
            if User.objects.filter(username__iexact=email_lower).exclude(id=row.user_id).exists():
                return _json_error("email_already_exists", status=409)
            row.user.username = email_lower
            row.user.email = email_lower
            user_updates.extend(["username", "email"])
        if user_name:
            row.user.first_name = user_name
            user_updates.append("first_name")
        if user_updates:
            row.user.save(update_fields=list(dict.fromkeys(user_updates)))
        if role and role != row.role:
            row.role = role
            updates.append("role")
            UserProfile.objects.filter(user=row.user).update(role=role)
        if updates:
            row.save(update_fields=updates + ["updated_at"])
        ImpositionUsageLog.objects.create(
            organization=org,
            user=request.user,
            event_type="product_user_edited",
            event_payload={"user_id": row.user_id},
        )
        return JsonResponse({"ok": True, "item": _serialize_product_user(row)})

    if action in ("disable", "enable"):
        if action == "enable":
            user_limit = get_user_limit(org, sub=sub)
            active_users = _active_product_user_count(org)
            if user_limit and active_users >= user_limit and row.status != "active":
                return _json_error("user_limit_reached", status=403, extra={"message": ADDON_LIMIT_MESSAGE})
            row.status = "active"
            row.user.is_active = True
            row.user.save(update_fields=["is_active"])
        else:
            row.status = "disabled"
            row.user.is_active = False
            row.user.save(update_fields=["is_active"])
        row.save(update_fields=["status", "updated_at"])
        ImpositionUsageLog.objects.create(
            organization=org,
            user=request.user,
            event_type=f"product_user_{action}d",
            event_payload={"user_id": row.user_id},
        )
        return JsonResponse({"ok": True, "item": _serialize_product_user(row)})

    if action == "delete":
        row.status = "deleted"
        row.user.is_active = False
        row.user.save(update_fields=["is_active"])
        row.save(update_fields=["status", "updated_at"])
        ImpositionUsageLog.objects.create(
            organization=org,
            user=request.user,
            event_type="product_user_deleted",
            event_payload={"user_id": row.user_id},
        )
        return JsonResponse({"ok": True})

    return _json_error("invalid_action", status=400)


@login_required
@require_http_methods(["GET"])
def product_billing(request):
    org, _, error = _require_imposition_access(request)
    if error:
        return error
    rows = (
        ImpositionBillingRecord.objects
        .filter(organization=org)
        .order_by("-paid_at", "-created_at")
    )
    return JsonResponse({
        "ok": True,
        "items": [
            {
                "invoice_number": row.invoice_number,
                "plan": row.plan_name,
                "amount": float(row.amount),
                "currency": row.currency,
                "payment_method": row.payment_method,
                "status": row.status,
                "date": row.paid_at.isoformat() if row.paid_at else "",
                "invoice_url": row.invoice_url or "",
            }
            for row in rows
        ],
    })


@login_required
@require_http_methods(["GET"])
def product_plan(request):
    org, sub, error = _require_imposition_access(request)
    if error:
        return error
    license_row = _active_license_for_org(org, sub=sub)
    plan = sub.plan if sub else None
    feature_flags = get_effective_feature_flags(plan)
    starts_at = sub.starts_at if sub else None
    ends_at = sub.ends_at if sub else None
    billing_cycle = "monthly"
    if starts_at and ends_at:
        if (ends_at - starts_at).days >= 330:
            billing_cycle = "yearly"
    addon_catalog = _resolve_addon_catalog()
    addon_state = (
        ImpositionOrgAddon.objects
        .filter(organization=org, addon_code__in=("imposition_user", "additional_user"), is_active=True)
        .order_by("-updated_at")
        .first()
    )
    addon_qty = int(addon_state.quantity or 0) if addon_state else 0
    addon_cycle = (addon_state.billing_cycle if addon_state else "monthly") or "monthly"
    return JsonResponse({
        "ok": True,
        "plan_name": plan.name if plan else "",
        "plan_code": plan.code if plan else "",
        "billing_cycle": billing_cycle,
        "status": sub.status if sub else "inactive",
        "device_limit": get_device_limit(sub),
        "user_limit": get_user_limit(org, sub=sub),
        "features": feature_flags,
        "license_code": license_row.code if license_row else "",
        "activation_date": license_row.created_at.isoformat() if license_row and license_row.created_at else "",
        "plan_expiry_date": ends_at.isoformat() if ends_at else "",
        "trial_days_remaining": _trial_days_remaining(sub),
        "addons": [
            {
                "addon_code": addon_catalog.addon_code,
                "addon_name": addon_catalog.addon_name,
                "description": "Add more team members to manage imposition jobs and sync with desktop software.",
                "pricing": {
                    "monthly": {
                        "inr": float(addon_catalog.price_month_inr or 0),
                        "usd": float(addon_catalog.price_month_usd or 0),
                    },
                    "yearly": {
                        "inr": float(addon_catalog.price_year_inr or 0),
                        "usd": float(addon_catalog.price_year_usd or 0),
                    },
                },
                "current_quantity": addon_qty,
                "current_billing_cycle": addon_cycle,
                "base_plan_users": max(0, get_user_limit(org, sub=sub) - addon_qty),
                "total_allowed_users": get_user_limit(org, sub=sub),
            }
        ],
    })


@login_required
@require_http_methods(["GET"])
def product_activity(request):
    org, _, error = _require_imposition_access(request)
    if error:
        return error
    limit = request.GET.get("limit")
    try:
        limit = max(1, min(200, int(limit or 30)))
    except (TypeError, ValueError):
        limit = 30
    rows = (
        ImpositionUsageLog.objects
        .filter(organization=org)
        .select_related("device", "user")
        .order_by("-created_at")[:limit]
    )
    return JsonResponse({
        "ok": True,
        "items": [
            {
                "id": row.id,
                "event_type": row.event_type,
                "event_payload": row.event_payload,
                "user_name": (
                    (row.user.first_name or row.user.username)
                    if row.user_id else ""
                ),
                "device_name": row.device.device_name if row.device_id else "",
                "created_at": row.created_at.isoformat() if row.created_at else "",
            }
            for row in rows
        ],
    })


@login_required
@require_http_methods(["POST"])
def product_addon_purchase(request):
    org, sub, error = _require_imposition_access(request)
    if error:
        return error
    if not _is_org_admin_user(request.user, org):
        return _json_error("forbidden", status=403)
    payload = _json_body(request)
    if payload is None:
        return _json_error("invalid_json", status=400)

    addon_code = _string(payload, "addon_code", "imposition_user")
    if addon_code != "imposition_user":
        return _json_error("unsupported_addon_code", status=400)
    try:
        quantity = int(payload.get("quantity") or 0)
    except (TypeError, ValueError):
        quantity = 0
    quantity = max(0, quantity)
    billing_cycle = _string(payload, "billing_cycle", "monthly").lower()
    if billing_cycle not in ("monthly", "yearly"):
        return _json_error("invalid_billing_cycle", status=400)

    addon_catalog = _resolve_addon_catalog()
    totals = _addon_totals(addon_catalog, quantity, billing_cycle)
    addon, _ = ImpositionOrgAddon.objects.get_or_create(
        organization=org,
        addon_code="imposition_user",
        defaults={
            "quantity": quantity,
            "billing_cycle": billing_cycle,
            "unit_price_monthly_inr": addon_catalog.price_month_inr,
            "unit_price_yearly_inr": addon_catalog.price_year_inr,
            "unit_price_monthly_usd": addon_catalog.price_month_usd,
            "unit_price_yearly_usd": addon_catalog.price_year_usd,
            "is_active": True,
        },
    )
    addon.quantity = quantity
    addon.billing_cycle = billing_cycle
    addon.unit_price_monthly_inr = addon_catalog.price_month_inr
    addon.unit_price_yearly_inr = addon_catalog.price_year_inr
    addon.unit_price_monthly_usd = addon_catalog.price_month_usd
    addon.unit_price_yearly_usd = addon_catalog.price_year_usd
    addon.is_active = quantity > 0
    addon.save(update_fields=[
        "quantity",
        "billing_cycle",
        "unit_price_monthly_inr",
        "unit_price_yearly_inr",
        "unit_price_monthly_usd",
        "unit_price_yearly_usd",
        "is_active",
        "updated_at",
    ])

    ImpositionUsageLog.objects.create(
        organization=org,
        user=request.user,
        event_type="addon_purchase_updated",
        event_payload={
            "addon_code": addon_code,
            "quantity": quantity,
            "billing_cycle": billing_cycle,
            "total_inr": totals["total_inr"],
            "total_usd": totals["total_usd"],
        },
    )

    if quantity > 0:
        invoice_no = f"IMP-ADDON-{org.id}-{timezone.now().strftime('%Y%m%d%H%M%S')}"
        amount = Decimal(str(totals["total_inr"]))
        if billing_cycle == "yearly":
            cycle_label = "Yearly"
        else:
            cycle_label = "Monthly"
        ImpositionBillingRecord.objects.create(
            organization=org,
            subscription=sub,
            invoice_number=invoice_no,
            plan_name=f"Additional User ({cycle_label})",
            amount=amount,
            currency="INR",
            payment_method="addon_purchase",
            status="paid",
            paid_at=timezone.now(),
        )

    current_user_limit = get_user_limit(org, sub=sub)
    return JsonResponse({
        "ok": True,
        "addon_code": addon_code,
        "quantity": quantity,
        "billing_cycle": billing_cycle,
        "pricing": totals,
        "base_plan_users": max(0, current_user_limit - quantity),
        "total_allowed_users": current_user_limit,
    })
