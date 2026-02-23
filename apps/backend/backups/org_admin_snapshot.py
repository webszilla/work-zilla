import json
import os
from collections import defaultdict

from django.apps import apps
from django.conf import settings
from django.core.serializers.json import DjangoJSONEncoder
from django.db import transaction

from apps.backend.products.models import Product
from core.models import Organization, UserProfile

from .registry import register_backup_exporter, register_backup_restorer


SNAPSHOT_FILE = "org_admin_snapshot.json"
EXPORTER_NAME = "org_admin_json_v1"
SKIP_APP_LABELS = {"admin", "auth", "contenttypes", "sessions", "messages", "staticfiles"}
SKIP_MODEL_LABELS = {
    "backups.BackupRecord",
    "backups.BackupAuditLog",
    "backups.OrgDownloadActivity",
    "backups.FeatureToggle",
}
USER_REFERENCE_FIELDS = {
    "user_id",
    "owner_id",
    "requested_by_id",
    "created_by_id",
    "admin_user_id",
    "active_agent_id",
    "from_agent_id",
    "to_agent_id",
    "sender_user_id",
}


def _normalize_slug(slug: str) -> str:
    value = (slug or "").strip().lower()
    aliases = {
        "worksuite": "monitor",
        "work-suite": "monitor",
        "business-autopilot": "business-autopilot-erp",
        "erp": "business-autopilot-erp",
    }
    return aliases.get(value, value)


def _resolve_product_slug(product_id):
    if not product_id:
        return ""
    product = Product.objects.filter(id=product_id).only("slug").first()
    return _normalize_slug(product.slug if product else "")


def _org_filter_field(model):
    for field in model._meta.concrete_fields:
        if getattr(field, "many_to_one", False) and getattr(field, "remote_field", None):
            rel_model = getattr(field.remote_field, "model", None)
            if rel_model is Organization:
                return field.attname
    return None


def _product_filter_field(model):
    for field in model._meta.concrete_fields:
        if getattr(field, "many_to_one", False) and getattr(field, "remote_field", None):
            rel_model = getattr(field.remote_field, "model", None)
            if rel_model is Product:
                return field.attname
    return None


def _product_slug_field(model):
    for field in model._meta.concrete_fields:
        if field.name == "product_slug":
            return field.name
    return None


def _iter_org_scoped_models():
    for model in apps.get_models():
        label = model._meta.label
        if label in SKIP_MODEL_LABELS:
            continue
        if model._meta.app_label in SKIP_APP_LABELS:
            continue
        if not model._meta.managed:
            continue
        org_field = _org_filter_field(model)
        if not org_field:
            continue
        yield model


def _serialize_model_rows(model, org_id, product_id=None, product_slug=""):
    org_field = _org_filter_field(model)
    if not org_field:
        return []
    qs = model._default_manager.filter(**{org_field: org_id})

    product_field = _product_filter_field(model)
    if product_field and product_id:
        qs = qs.filter(**{product_field: product_id})
    else:
        slug_field = _product_slug_field(model)
        if slug_field and product_slug:
            qs = qs.filter(**{slug_field: product_slug})

    attnames = [field.attname for field in model._meta.concrete_fields]
    pk_name = model._meta.pk.attname
    rows = list(qs.order_by(pk_name).values(*attnames))
    return rows


def _collect_user_ids(model_rows):
    user_ids = set()
    for _, rows in model_rows:
        for row in rows:
            for field_name in USER_REFERENCE_FIELDS:
                value = row.get(field_name)
                if value:
                    user_ids.add(value)
    return user_ids


def _serialize_org_users(user_ids):
    if not user_ids:
        return []
    user_model = apps.get_model(settings.AUTH_USER_MODEL)
    field_names = [field.attname for field in user_model._meta.concrete_fields]
    pk_name = user_model._meta.pk.attname
    return list(
        user_model._default_manager.filter(pk__in=list(user_ids))
        .order_by(pk_name)
        .values(*field_names)
    )


def _coerce_value(field, value):
    if value is None:
        return None
    try:
        return field.to_python(value)
    except Exception:
        return value


def export_org_admin_snapshot(org_id, product_id, output_dir):
    product_slug = _resolve_product_slug(product_id)
    models_payload = []
    user_model_label = apps.get_model(settings.AUTH_USER_MODEL)._meta.label
    model_rows = []
    total_rows = 0

    for model in _iter_org_scoped_models():
        rows = _serialize_model_rows(model, org_id, product_id=product_id, product_slug=product_slug)
        if not rows:
            continue
        model_rows.append((model, rows))
        total_rows += len(rows)

    user_ids = _collect_user_ids(model_rows)
    user_rows = _serialize_org_users(user_ids)
    if user_rows:
        model_rows.insert(0, (apps.get_model(settings.AUTH_USER_MODEL), user_rows))
        total_rows += len(user_rows)

    # Keep organization + profile early for FK restoration stability.
    sort_priority = {
        user_model_label: 0,
        "core.Organization": 1,
        "core.UserProfile": 2,
    }
    model_rows.sort(key=lambda item: sort_priority.get(item[0]._meta.label, 10))

    for model, rows in model_rows:
        models_payload.append(
            {
                "model": model._meta.label,
                "pk_field": model._meta.pk.attname,
                "rows": rows,
            }
        )

    payload = {
        "version": 1,
        "exporter": EXPORTER_NAME,
        "organization_id": org_id,
        "product_id": product_id,
        "product_slug": product_slug,
        "models": models_payload,
    }

    os.makedirs(output_dir, exist_ok=True)
    out_path = os.path.join(output_dir, SNAPSHOT_FILE)
    with open(out_path, "w", encoding="utf-8") as handle:
        json.dump(payload, handle, indent=2, cls=DjangoJSONEncoder)

    return {
        "exporter": EXPORTER_NAME,
        "file": f"data/{SNAPSHOT_FILE}",
        "models": len(models_payload),
        "rows": total_rows,
    }


def restore_org_admin_snapshot(org_id, product_id, extracted_dir, manifest):
    _ = manifest  # Not used directly; per-export metadata is read from snapshot file.
    snapshot_path = os.path.join(extracted_dir, "data", SNAPSHOT_FILE)
    if not os.path.exists(snapshot_path):
        return

    with open(snapshot_path, "r", encoding="utf-8") as handle:
        payload = json.load(handle)

    if int(payload.get("organization_id") or 0) != int(org_id):
        raise RuntimeError("snapshot_org_mismatch")
    if int(payload.get("product_id") or 0) != int(product_id):
        raise RuntimeError("snapshot_product_mismatch")

    model_entries = payload.get("models") or []
    with transaction.atomic():
        for entry in model_entries:
            label = entry.get("model")
            if not label:
                continue
            try:
                model = apps.get_model(label)
            except Exception:
                continue
            rows = entry.get("rows") or []
            pk_field = entry.get("pk_field") or model._meta.pk.attname

            concrete_fields = {field.attname: field for field in model._meta.concrete_fields}
            for row in rows:
                if not isinstance(row, dict):
                    continue
                if pk_field not in row:
                    continue
                pk_value = row.get(pk_field)
                if pk_value is None:
                    continue
                defaults = {}
                for field_name, field in concrete_fields.items():
                    if field_name == pk_field or field_name not in row:
                        continue
                    defaults[field_name] = _coerce_value(field, row.get(field_name))

                model._default_manager.update_or_create(
                    **{pk_field: _coerce_value(concrete_fields[pk_field], pk_value)},
                    defaults=defaults,
                )


def register_snapshot_handlers():
    register_backup_exporter(export_org_admin_snapshot)
    register_backup_restorer(restore_org_admin_snapshot)

