from pathlib import Path
import sqlite3
from django.db import IntegrityError

from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand
from django.utils import timezone
from django.utils.dateparse import parse_datetime


class Command(BaseCommand):
    help = "Import legacy auth_user rows from monitor/db.sqlite3 into common_auth_user."

    def add_arguments(self, parser):
        default_source = (settings.BASE_DIR.parent.parent / "monitor" / "db.sqlite3")
        parser.add_argument(
            "--source",
            default=str(default_source),
            help="Path to legacy monitor db.sqlite3",
        )
        parser.add_argument(
            "--skip-existing",
            action="store_true",
            help="Skip users that already exist by id.",
        )
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Show what would be imported without writing.",
        )

    def handle(self, *args, **options):
        source = Path(options["source"])
        if not source.exists():
            self.stderr.write(f"Source database not found: {source}")
            return

        conn = sqlite3.connect(source)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        rows = cursor.execute(
            """
            SELECT id, username, email, password, first_name, last_name,
                   is_staff, is_superuser, is_active, last_login, date_joined
            FROM auth_user
            ORDER BY id
            """
        ).fetchall()
        conn.close()

        User = get_user_model()
        created = 0
        updated = 0
        skipped = 0
        seen_emails = set()

        for row in rows:
            user_id = row["id"]
            email = (row["email"] or "").strip().lower()
            username = (row["username"] or "").strip() or email
            if not email:
                if username and "@" in username:
                    email = username.lower()
                else:
                    email = f"user{user_id}@legacy.local"
            base_email = email
            suffix = 1
            while email in seen_emails:
                email = f"{base_email.split('@')[0]}_{suffix}@{base_email.split('@')[1]}"
                suffix += 1

            if email in seen_emails:
                skipped += 1
                continue
            seen_emails.add(email)

            last_login = parse_datetime(row["last_login"]) if row["last_login"] else None
            if last_login and timezone.is_naive(last_login):
                last_login = timezone.make_aware(last_login, timezone.get_current_timezone())
            date_joined = parse_datetime(row["date_joined"]) if row["date_joined"] else None
            if date_joined and timezone.is_naive(date_joined):
                date_joined = timezone.make_aware(date_joined, timezone.get_current_timezone())

            existing = None
            if email:
                existing = User.objects.filter(email__iexact=email).first()
            if not existing and username:
                existing = User.objects.filter(username__iexact=username).first()

            if existing:
                if options["skip_existing"]:
                    skipped += 1
                    continue
                if options["dry_run"]:
                    self.stdout.write(
                        f"[dry-run] Would update user id={existing.id} {existing.username}"
                    )
                    continue
                updates = {
                    "first_name": row["first_name"],
                    "last_name": row["last_name"],
                    "is_staff": bool(row["is_staff"]),
                    "is_superuser": bool(row["is_superuser"]),
                    "is_active": bool(row["is_active"]),
                    "last_login": last_login,
                    "date_joined": date_joined,
                    "password": row["password"],
                }
                if email and (not existing.email or existing.email.lower() != email):
                    updates["email"] = email
                if username and (not existing.username or existing.username != username):
                    updates["username"] = username
                for key, value in updates.items():
                    setattr(existing, key, value)
                existing.save(update_fields=list(updates.keys()))
                updated += 1
                continue

            if options["dry_run"]:
                self.stdout.write(f"[dry-run] Would import user {username}")
                continue

            create_kwargs = {
                "username": username,
                "email": email,
                "password": row["password"],
                "first_name": row["first_name"],
                "last_name": row["last_name"],
                "is_staff": bool(row["is_staff"]),
                "is_superuser": bool(row["is_superuser"]),
                "is_active": bool(row["is_active"]),
                "last_login": last_login,
                "date_joined": date_joined,
            }
            if user_id and not User.objects.filter(id=user_id).exists():
                create_kwargs["id"] = user_id

            try:
                User.objects.create(**create_kwargs)
                created += 1
            except IntegrityError:
                skipped += 1
                continue

        self.stdout.write(
            f"Imported {created} users from {source} (updated {updated}, skipped {skipped})."
        )
