from collections import defaultdict
from datetime import datetime
from typing import Iterable, List

from django.utils import timezone

from .models import BackupRecord


DEFAULT_RETENTION = {
    "last_n": 30,
    "daily_days": 30,
    "weekly_weeks": 12,
    "monthly_months": 12,
}


def _group_key(value, mode):
    if mode == "day":
        return value.date().isoformat()
    if mode == "week":
        iso_year, iso_week, _ = value.isocalendar()
        return f"{iso_year}-W{iso_week:02d}"
    if mode == "month":
        return f"{value.year}-{value.month:02d}"
    return ""


def _pick_recent_per_group(records: Iterable[BackupRecord], mode: str) -> List[BackupRecord]:
    grouped = {}
    for rec in records:
        if not rec.completed_at:
            continue
        key = _group_key(rec.completed_at, mode)
        if not key:
            continue
        if key not in grouped or rec.completed_at > grouped[key].completed_at:
            grouped[key] = rec
    return list(grouped.values())


def retention_candidates(records: Iterable[BackupRecord], policy: dict) -> dict:
    """
    Returns dict with keys: keep_ids, purge_ids.
    """
    policy = {**DEFAULT_RETENTION, **(policy or {})}
    completed = [r for r in records if r.status == "completed" and r.completed_at]
    completed.sort(key=lambda r: r.completed_at, reverse=True)

    keep_ids = set()
    # 1) keep last N
    for rec in completed[: max(policy["last_n"], 1)]:
        keep_ids.add(rec.id)

    # 2) keep daily/weekly/monthly
    now = timezone.now()
    daily_cutoff = now - timezone.timedelta(days=policy["daily_days"])
    weekly_cutoff = now - timezone.timedelta(weeks=policy["weekly_weeks"])
    monthly_cutoff = now - timezone.timedelta(days=policy["monthly_months"] * 30)

    keep_ids.update(
        r.id for r in _pick_recent_per_group(
            (r for r in completed if r.completed_at >= daily_cutoff),
            "day",
        )
    )
    keep_ids.update(
        r.id for r in _pick_recent_per_group(
            (r for r in completed if r.completed_at >= weekly_cutoff),
            "week",
        )
    )
    keep_ids.update(
        r.id for r in _pick_recent_per_group(
            (r for r in completed if r.completed_at >= monthly_cutoff),
            "month",
        )
    )

    all_ids = {r.id for r in completed}
    purge_ids = all_ids - keep_ids
    return {"keep_ids": keep_ids, "purge_ids": purge_ids}
