from pathlib import Path
import sqlite3

from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand
from django.utils import timezone
from django.utils.dateparse import parse_datetime

from core.models import (
    DealerAccount,
    Organization,
    OrganizationSettings,
    Plan,
    Subscription,
    UserProfile,
)


def _parse_dt(value):
    if not value:
        return None
    parsed = parse_datetime(value)
    if parsed and timezone.is_naive(parsed):
        parsed = timezone.make_aware(parsed, timezone.get_current_timezone())
    return parsed


class Command(BaseCommand):
    help = "Import legacy core tables from monitor/db.sqlite3 into the platform DB."

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
            help="Skip rows that already exist by id.",
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

        User = get_user_model()

        # Map legacy auth_user.id -> common_auth.User
        user_rows = cursor.execute(
            "SELECT id, username, email FROM auth_user ORDER BY id"
        ).fetchall()
        user_map = {}
        for row in user_rows:
            legacy_id = row["id"]
            email = (row["email"] or "").strip()
            username = (row["username"] or "").strip()
            user = User.objects.filter(id=legacy_id).first()
            if not user and email:
                user = User.objects.filter(email__iexact=email).first()
            if not user and username:
                user = User.objects.filter(username__iexact=username).first()
            if user:
                user_map[legacy_id] = user

        created = {"org": 0, "plan": 0, "sub": 0, "profile": 0, "settings": 0}
        updated = {"org": 0, "plan": 0, "sub": 0, "profile": 0, "settings": 0}
        skipped = {"org": 0, "plan": 0, "sub": 0, "profile": 0, "settings": 0}

        # Organizations (first pass)
        org_rows = cursor.execute("SELECT * FROM core_organization ORDER BY id").fetchall()
        org_map = {}
        pending_referrals = []
        for row in org_rows:
            legacy_id = row["id"]
            owner = user_map.get(row["owner_id"])
            defaults = {
                "name": row["name"],
                "company_key": row["company_key"],
                "owner": owner,
                "referral_code": row["referral_code"],
                "referred_at": _parse_dt(row["referred_at"]),
            }

            existing = Organization.objects.filter(id=legacy_id).first()
            if existing and options["skip_existing"]:
                skipped["org"] += 1
                org_map[legacy_id] = existing
                continue

            if options["dry_run"]:
                action = "update" if existing else "create"
                self.stdout.write(f"[dry-run] Would {action} Organization {row['name']}")
                if existing:
                    org_map[legacy_id] = existing
                continue

            if not existing:
                org = Organization.objects.create(id=legacy_id, **defaults)
                created["org"] += 1
            else:
                for key, value in defaults.items():
                    setattr(existing, key, value)
                existing.save(update_fields=list(defaults.keys()))
                org = existing
                updated["org"] += 1

            org_map[legacy_id] = org
            pending_referrals.append(
                (org, row["referred_by_id"], row["referred_by_dealer_id"])
            )

        # Organizations (second pass: referral links)
        if not options["dry_run"]:
            for org, referred_org_id, dealer_id in pending_referrals:
                updates = {}
                if referred_org_id:
                    referred_org = org_map.get(referred_org_id)
                    if referred_org and org.referred_by_id != referred_org.id:
                        updates["referred_by"] = referred_org
                if dealer_id:
                    dealer = DealerAccount.objects.filter(id=dealer_id).first()
                    if dealer and org.referred_by_dealer_id != dealer.id:
                        updates["referred_by_dealer"] = dealer
                if updates:
                    for key, value in updates.items():
                        setattr(org, key, value)
                    org.save(update_fields=list(updates.keys()))

        # Plans
        plan_rows = cursor.execute("SELECT * FROM core_plan ORDER BY id").fetchall()
        for row in plan_rows:
            legacy_id = row["id"]
            defaults = {
                "name": row["name"],
                "price": row["price"],
                "employee_limit": row["employee_limit"],
                "duration_months": row["duration_months"],
                "monthly_price": row["monthly_price"],
                "yearly_price": row["yearly_price"],
                "retention_days": row["retention_days"],
                "addon_monthly_price": row["addon_monthly_price"],
                "addon_yearly_price": row["addon_yearly_price"],
                "allow_addons": bool(row["allow_addons"]),
                "usd_monthly_price": row["usd_monthly_price"],
                "usd_yearly_price": row["usd_yearly_price"],
                "addon_usd_monthly_price": row["addon_usd_monthly_price"],
                "addon_usd_yearly_price": row["addon_usd_yearly_price"],
                "screenshot_min_minutes": row["screenshot_min_minutes"],
                "allow_app_usage": bool(row["allow_app_usage"]),
                "allow_gaming_ott_usage": bool(row["allow_gaming_ott_usage"]),
                "allow_hr_view": bool(row["allow_hr_view"]),
            }

            existing = Plan.objects.filter(id=legacy_id).first()
            if existing and options["skip_existing"]:
                skipped["plan"] += 1
                continue

            if options["dry_run"]:
                action = "update" if existing else "create"
                self.stdout.write(f"[dry-run] Would {action} Plan {row['name']}")
                continue

            if not existing:
                Plan.objects.create(id=legacy_id, **defaults)
                created["plan"] += 1
            else:
                for key, value in defaults.items():
                    setattr(existing, key, value)
                existing.save(update_fields=list(defaults.keys()))
                updated["plan"] += 1

        # Organization settings
        settings_rows = cursor.execute(
            "SELECT * FROM core_organizationsettings ORDER BY id"
        ).fetchall()
        for row in settings_rows:
            legacy_id = row["id"]
            org = org_map.get(row["organization_id"])
            if not org:
                skipped["settings"] += 1
                continue

            defaults = {
                "organization": org,
                "screenshot_interval_minutes": row["screenshot_interval_minutes"],
                "screenshot_ignore_patterns": row["screenshot_ignore_patterns"] or "",
                "privacy_keyword_rules": row["privacy_keyword_rules"] or "",
                "auto_blur_password_fields": bool(row["auto_blur_password_fields"]),
                "auto_blur_otp_fields": bool(row["auto_blur_otp_fields"]),
                "auto_blur_card_fields": bool(row["auto_blur_card_fields"]),
                "auto_blur_email_inbox": bool(row["auto_blur_email_inbox"]),
            }

            existing = OrganizationSettings.objects.filter(id=legacy_id).first()
            if existing and options["skip_existing"]:
                skipped["settings"] += 1
                continue

            if options["dry_run"]:
                action = "update" if existing else "create"
                self.stdout.write(f"[dry-run] Would {action} OrganizationSettings {legacy_id}")
                continue

            if not existing:
                OrganizationSettings.objects.create(id=legacy_id, **defaults)
                created["settings"] += 1
            else:
                for key, value in defaults.items():
                    setattr(existing, key, value)
                existing.save(update_fields=list(defaults.keys()))
                updated["settings"] += 1

        # User profiles
        profile_rows = cursor.execute("SELECT * FROM core_userprofile ORDER BY id").fetchall()
        for row in profile_rows:
            legacy_id = row["id"]
            user = user_map.get(row["user_id"])
            org = org_map.get(row["organization_id"])
            if not user:
                skipped["profile"] += 1
                continue

            defaults = {
                "role": row["role"] or "company_admin",
                "user": user,
                "organization": org,
                "phone_number": row["phone_number"] or "",
            }

            existing = UserProfile.objects.filter(user=user).first()
            if existing and options["skip_existing"]:
                skipped["profile"] += 1
                continue

            if options["dry_run"]:
                action = "update" if existing else "create"
                self.stdout.write(f"[dry-run] Would {action} UserProfile {user.username}")
                continue

            if not existing:
                if not UserProfile.objects.filter(id=legacy_id).exists():
                    defaults["id"] = legacy_id
                UserProfile.objects.create(**defaults)
                created["profile"] += 1
            else:
                for key, value in defaults.items():
                    setattr(existing, key, value)
                existing.save(update_fields=list(defaults.keys()))
                updated["profile"] += 1

        # Subscriptions (after plans/orgs)
        sub_rows = cursor.execute("SELECT * FROM core_subscription ORDER BY id").fetchall()
        for row in sub_rows:
            legacy_id = row["id"]
            org = org_map.get(row["organization_id"])
            plan = Plan.objects.filter(id=row["plan_id"]).first() if row["plan_id"] else None
            user = user_map.get(row["user_id"])
            if not org or not plan:
                skipped["sub"] += 1
                continue

            defaults = {
                "organization": org,
                "plan": plan,
                "user": user,
                "status": row["status"] or "active",
                "start_date": _parse_dt(row["start_date"]),
                "end_date": _parse_dt(row["end_date"]),
                "billing_cycle": row["billing_cycle"] or "monthly",
                "retention_months": row["retention_months"] or 0,
                "retention_days": row["retention_days"] or 0,
                "addon_count": row["addon_count"] or 0,
                "addon_proration_amount": row["addon_proration_amount"] or 0,
                "addon_last_proration_at": _parse_dt(row["addon_last_proration_at"]),
                "razorpay_order_id": row["razorpay_order_id"] or "",
                "razorpay_payment_id": row["razorpay_payment_id"] or "",
                "razorpay_signature": row["razorpay_signature"] or "",
            }

            existing = Subscription.objects.filter(id=legacy_id).first()
            if existing and options["skip_existing"]:
                skipped["sub"] += 1
                continue

            if options["dry_run"]:
                action = "update" if existing else "create"
                self.stdout.write(f"[dry-run] Would {action} Subscription {legacy_id}")
                continue

            if not existing:
                Subscription.objects.create(id=legacy_id, **defaults)
                created["sub"] += 1
            else:
                for key, value in defaults.items():
                    setattr(existing, key, value)
                existing.save(update_fields=list(defaults.keys()))
                updated["sub"] += 1

        conn.close()

        self.stdout.write(
            "Imported legacy core data: "
            f"org +{created['org']}/~{updated['org']}/-{skipped['org']}, "
            f"plan +{created['plan']}/~{updated['plan']}/-{skipped['plan']}, "
            f"profile +{created['profile']}/~{updated['profile']}/-{skipped['profile']}, "
            f"settings +{created['settings']}/~{updated['settings']}/-{skipped['settings']}, "
            f"sub +{created['sub']}/~{updated['sub']}/-{skipped['sub']}."
        )
