from django.conf import settings
from django.apps import apps
from django.core.mail import EmailMessage, get_connection, send_mail
from django.template.loader import render_to_string
from django.db.utils import OperationalError, ProgrammingError
import logging
from email.utils import formataddr


logger = logging.getLogger(__name__)


def _get_active_ses_mail_config():
    """
    Resolve runtime SES settings from SaaS admin configuration.
    Returns None when SES is not configured/active so caller can fallback.
    """
    try:
        ses_model = apps.get_model("saas_admin", "AmazonSESSettings")
        if not ses_model:
            return None
        ses = ses_model.objects.filter(provider="amazon_ses").first()
        if not ses or not bool(ses.is_active):
            return None
        region = str(ses.aws_region or "").strip()
        sender_email = str(ses.sender_email or "").strip()
        smtp_username = str(ses.smtp_username or ses.access_key_id or "").strip()
        smtp_password = str(ses.smtp_password or ses.secret_access_key or "").strip()
        if not region or not sender_email or not smtp_username or not smtp_password:
            return None
        reply_to = str(ses.reply_to_email or "").strip()
        sender_name = str(ses.sender_name or "").strip()
        from_email = formataddr((sender_name, sender_email)) if sender_name else sender_email
        return {
            "host": f"email-smtp.{region}.amazonaws.com",
            "port": 587,
            "username": smtp_username,
            "password": smtp_password,
            "use_tls": True,
            "use_ssl": False,
            "timeout": int(getattr(settings, "EMAIL_TIMEOUT", 20) or 20),
            "from_email": from_email,
            "reply_to": [reply_to] if reply_to else [],
        }
    except (LookupError, OperationalError, ProgrammingError):
        return None
    except Exception:
        logger.exception("Unable to load Amazon SES settings from saas_admin.")
        return None


def send_templated_email(to_email, subject, template_name, context):
    if not to_email:
        return False
    recipients = to_email if isinstance(to_email, (list, tuple)) else [to_email]
    recipients = [item for item in recipients if item]
    if not recipients:
        return False
    body = render_to_string(template_name, context).strip()
    from_email = getattr(settings, "DEFAULT_FROM_EMAIL", "no-reply@workzilla")
    ses_config = _get_active_ses_mail_config()
    try:
        if ses_config:
            connection = get_connection(
                backend="django.core.mail.backends.smtp.EmailBackend",
                host=ses_config["host"],
                port=ses_config["port"],
                username=ses_config["username"],
                password=ses_config["password"],
                use_tls=ses_config["use_tls"],
                use_ssl=ses_config["use_ssl"],
                timeout=ses_config["timeout"],
                fail_silently=False,
            )
            message = EmailMessage(
                subject=subject,
                body=body,
                from_email=ses_config["from_email"],
                to=recipients,
                reply_to=ses_config["reply_to"],
                connection=connection,
            )
            sent_count = message.send(fail_silently=False)
            return bool(sent_count)

        sent_count = send_mail(
            subject,
            body,
            from_email,
            recipients,
            fail_silently=False,
        )
        return bool(sent_count)
    except Exception:
        logger.exception(
            "Email send failed: subject=%s recipients=%s backend=%s",
            subject,
            recipients,
            getattr(settings, "EMAIL_BACKEND", ""),
        )
        return False
