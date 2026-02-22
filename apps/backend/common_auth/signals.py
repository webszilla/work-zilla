import logging

from django.dispatch import Signal, receiver

from core.models import UserProfile

from .utils.whatsapp import send_whatsapp_message, _get_setting, _db_whatsapp_cloud_settings


logger = logging.getLogger(__name__)


user_registration_success = Signal()

@receiver(user_registration_success, dispatch_uid="common_auth.user_registration_success.whatsapp")
def send_registration_whatsapp_notifications(sender, user, request=None, phone_number="", **kwargs):
    admin_phone = _get_setting("WHATSAPP_ADMIN_PHONE")
    admin_template = _get_setting("WHATSAPP_TEMPLATE_ADMIN_NEW_USER", "new_user_admin_alert")
    welcome_template = _get_setting("WHATSAPP_TEMPLATE_USER_WELCOME", "welcome_user_signup")
    db_settings = _db_whatsapp_cloud_settings()
    use_db_flags = bool(db_settings and getattr(db_settings, "is_active", False))
    notify_admin_new_user = bool(getattr(db_settings, "notify_admin_new_user", True)) if use_db_flags else True
    notify_user_welcome = bool(getattr(db_settings, "notify_user_welcome", True)) if use_db_flags else True

    resolved_phone = (phone_number or "").strip()
    if not resolved_phone:
        try:
            profile = UserProfile.objects.filter(user=user).only("phone_number").first()
            resolved_phone = (profile.phone_number or "").strip() if profile else ""
        except Exception:
            logger.exception("Failed to read user phone for WhatsApp signup notification user_id=%s", getattr(user, "id", None))

    user_name = (getattr(user, "first_name", "") or getattr(user, "username", "") or "User").strip()
    user_email = (getattr(user, "email", "") or "").strip()
    org_name = ""
    try:
        org = getattr(user, "organization", None)
        org_name = (getattr(org, "name", "") or "").strip() if org else ""
    except Exception:
        org_name = ""

    if notify_admin_new_user and admin_phone:
        send_whatsapp_message(
            admin_phone,
            admin_template,
            [
                user_name,
                user_email or "-",
                resolved_phone or "-",
                org_name or "-",
            ],
        )
    elif not admin_phone:
        logger.info("WHATSAPP_ADMIN_PHONE not set; admin signup alert skipped")
    else:
        logger.info("Admin signup WhatsApp alert disabled in SaaS settings")

    if notify_user_welcome and resolved_phone:
        send_whatsapp_message(
            resolved_phone,
            welcome_template,
            [
                user_name,
            ],
        )
    elif not resolved_phone:
        logger.info("User signup WhatsApp welcome skipped: phone missing user_id=%s", getattr(user, "id", None))
    else:
        logger.info("User signup WhatsApp welcome disabled in SaaS settings")
