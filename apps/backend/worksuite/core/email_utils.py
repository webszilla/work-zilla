from django.conf import settings
from django.core.mail import send_mail
from django.template.loader import render_to_string
import logging


logger = logging.getLogger(__name__)


def send_templated_email(to_email, subject, template_name, context):
    if not to_email:
        return False
    recipients = to_email if isinstance(to_email, (list, tuple)) else [to_email]
    recipients = [item for item in recipients if item]
    if not recipients:
        return False
    body = render_to_string(template_name, context).strip()
    from_email = getattr(settings, "DEFAULT_FROM_EMAIL", "no-reply@workzilla")
    try:
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
