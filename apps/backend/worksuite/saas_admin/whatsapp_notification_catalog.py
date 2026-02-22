ADMIN_NEW_USER_NOTIFICATION_KEY = "admin_new_user_registration_alert"
USER_WELCOME_NOTIFICATION_KEY = "user_welcome_message"


WHATSAPP_NOTIFICATION_CATALOG = {
    "admin": [
        {
            "key": ADMIN_NEW_USER_NOTIFICATION_KEY,
            "title": "New User Registration Alert",
        },
    ],
    "user": [
        {
            "key": USER_WELCOME_NOTIFICATION_KEY,
            "title": "Welcome Message",
        },
        {
            "key": "email_verification",
            "title": "Email Verification",
        },
        {
            "key": "password_changed",
            "title": "Password Changed",
        },
        {
            "key": "account_limit_reached",
            "title": "Account Limit Reached",
        },
        {
            "key": "payment_proof_submitted",
            "title": "Payment Proof Submitted",
        },
        {
            "key": "payment_proof_approved",
            "title": "Payment Proof Approved",
        },
        {
            "key": "payment_proof_rejected",
            "title": "Payment Proof Rejected",
        },
        {
            "key": "product_activated",
            "title": "Product Activated",
        },
    ],
}


def default_whatsapp_notification_toggles():
    return {
        "admin": {
            ADMIN_NEW_USER_NOTIFICATION_KEY: True,
        },
        "user": {
            USER_WELCOME_NOTIFICATION_KEY: True,
            "email_verification": False,
            "password_changed": False,
            "account_limit_reached": False,
            "payment_proof_submitted": False,
            "payment_proof_approved": False,
            "payment_proof_rejected": False,
            "product_activated": False,
        },
    }


def normalize_whatsapp_notification_toggles(value):
    defaults = default_whatsapp_notification_toggles()
    source = value if isinstance(value, dict) else {}
    normalized = {"admin": {}, "user": {}}
    for section in ("admin", "user"):
        section_src = source.get(section) if isinstance(source.get(section), dict) else {}
        for key, default_val in defaults[section].items():
            normalized[section][key] = bool(section_src.get(key, default_val))
    return normalized

