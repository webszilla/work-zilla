import json
import os

from django.apps import apps as django_apps
from django.core import serializers
from django.core.files.base import File
from django.core.files.storage import default_storage
from django.db import models

from apps.backend.products.models import Product
from core.models import Organization

from .registry import register_backup_exporter, register_backup_restorer

EXCLUDED_MODEL_LABELS = {
    "admin.logentry",
    "contenttypes.contenttype",
    "sessions.session",
    "auth.permission",
    "auth.group",
    "backups.backuprecord",
    "backups.backupauditlog",
    "backups.orgdownloadactivity",
    "backups.featuretoggle",
    "backups.orggoogledrivebackupsettings",
}


def _org_export_models():
    models_list = []
    for model in django_apps.get_models():
        opts = model._meta
        if opts.proxy or opts.auto_created:
            continue
        if not getattr(opts, "managed", True):
            continue
        label = opts.label_lower
        if label in EXCLUDED_MODEL_LABELS:
            continue
        org_field = next(
            (
                f
                for f in opts.fields
                if getattr(f, "name", "") == "organization" and getattr(f, "is_relation", False)
            ),
            None,
        )
        if not org_field or not isinstance(org_field, models.ForeignKey):
            continue
        remote_model = getattr(getattr(org_field, "remote_field", None), "model", None)
        if remote_model is not Organization:
            continue
        models_list.append(model)
    models_list.sort(key=lambda m: m._meta.label_lower)
    return models_list


def export_org_data(org_id, product_id, output_dir):
    export_path = os.path.join(output_dir, "org_data.json")
    bundle = {
        "schema": "workzilla.org_data_backup.v1",
        "organization_id": org_id,
        "product_id": product_id,
        "models": [],
        "records": [],
    }

    total_records = 0
    per_model_count = {}
    for model in _org_export_models():
        qs = model.objects.filter(organization_id=org_id).order_by("pk")

        product_field = next(
            (
                f
                for f in model._meta.fields
                if getattr(f, "name", "") == "product" and getattr(f, "is_relation", False)
            ),
            None,
        )
        if (
            product_field
            and isinstance(product_field, models.ForeignKey)
            and getattr(getattr(product_field, "remote_field", None), "model", None) is Product
            and product_id
        ):
            qs = qs.filter(product_id=product_id)

        count = qs.count()
        if count <= 0:
            continue

        serialized_json = serializers.serialize("json", qs)
        rows = json.loads(serialized_json)
        model_label = model._meta.label_lower
        bundle["models"].append(model_label)
        bundle["records"].extend(rows)
        per_model_count[model_label] = len(rows)
        total_records += len(rows)

    bundle["record_count"] = total_records
    bundle["model_count"] = len(bundle["models"])

    with open(export_path, "w", encoding="utf-8") as handle:
        json.dump(bundle, handle, ensure_ascii=False)

    return {
        "name": "org_data",
        "schema": bundle["schema"],
        "record_count": total_records,
        "model_count": bundle["model_count"],
        "per_model": per_model_count,
        "path": "data/org_data.json",
    }


def restore_org_data(org_id, product_id, extract_dir, manifest):
    data_path = os.path.join(extract_dir, "data", "org_data.json")
    if not os.path.exists(data_path):
        return

    with open(data_path, "r", encoding="utf-8") as handle:
        bundle = json.load(handle)

    if str(bundle.get("organization_id")) != str(org_id):
        raise RuntimeError("org_data_org_mismatch")

    records = bundle.get("records") or []
    errors = []

    for row in records:
        fields = row.get("fields") or {}
        if str(fields.get("organization")) != str(org_id):
            continue
        if fields.get("product") and product_id and str(fields.get("product")) != str(product_id):
            continue

        try:
            for obj in serializers.deserialize("json", json.dumps([row])):
                obj.save()
        except Exception as exc:
            if len(errors) < 50:
                errors.append(str(exc))

    if errors:
        raise RuntimeError(f"org_data_restore_errors: {errors[0]}")


def _iter_local_files(root_dir):
    for base, _, files in os.walk(root_dir):
        for name in files:
            full_path = os.path.join(base, name)
            rel_path = os.path.relpath(full_path, root_dir).replace("\\", "/")
            if rel_path.startswith("../") or rel_path.startswith("/"):
                continue
            yield full_path, rel_path


def restore_media_files(org_id, product_id, extract_dir, manifest):
    media_root = os.path.join(extract_dir, "media")
    if not os.path.isdir(media_root):
        return

    # backup media paths are stored as original storage keys under /media
    for full_path, storage_key in _iter_local_files(media_root):
        try:
            if default_storage.exists(storage_key):
                default_storage.delete(storage_key)
            with open(full_path, "rb") as local_file:
                default_storage.save(storage_key, File(local_file))
        except Exception:
            continue


def register_defaults():
    register_backup_exporter(export_org_data)
    register_backup_restorer(restore_org_data)
    register_backup_restorer(restore_media_files)
