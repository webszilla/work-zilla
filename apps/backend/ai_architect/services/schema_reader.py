from __future__ import annotations

from django.apps import apps as django_apps
from django.db import connection
from django.db import models


def summarize_models(app_labels: list[str] | None = None, max_models: int = 120) -> list[dict]:
    summary: list[dict] = []
    for model_cls in django_apps.get_models():
        if app_labels and model_cls._meta.app_label not in set(app_labels):
            continue
        fields = []
        for field in model_cls._meta.fields:
            field_type = field.__class__.__name__
            rel = None
            if isinstance(field, (models.ForeignKey, models.OneToOneField)):
                rel = getattr(getattr(field, "related_model", None), "__name__", None)
            fields.append(
                {
                    "name": field.name,
                    "type": field_type,
                    "null": bool(getattr(field, "null", False)),
                    "rel": rel,
                }
            )
        summary.append(
            {
                "app": model_cls._meta.app_label,
                "model": model_cls.__name__,
                "db_table": model_cls._meta.db_table,
                "fields": fields,
            }
        )
        if len(summary) >= max_models:
            break
    return summary


def summarize_db_tables(max_tables: int = 200) -> list[dict]:
    tables = connection.introspection.table_names()
    rows: list[dict] = []
    for name in tables[:max_tables]:
        rows.append({"table": name})
    return rows

