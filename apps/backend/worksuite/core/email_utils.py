from django.conf import settings
from django.apps import apps
from django.core.mail import EmailMessage, get_connection, send_mail
from django.template.loader import render_to_string
from django.db.utils import OperationalError, ProgrammingError
import logging
import os
from email.utils import formataddr
import boto3


logger = logging.getLogger(__name__)


def _get_active_ses_mail_configs():
    """
    Resolve runtime SES settings from SaaS admin configuration.
    Returns prioritized transport configs (can include multiple credential combos).
    """
    try:
        ses_model = apps.get_model("saas_admin", "AmazonSESSettings")
        if not ses_model:
            return []
        ses = ses_model.objects.filter(provider="amazon_ses").first()
        if not ses or not bool(ses.is_active):
            return []
        region = str(ses.aws_region or "").strip()
        sender_email = str(ses.sender_email or "").strip()
        smtp_username = str(ses.smtp_username or "").strip()
        smtp_password = str(ses.smtp_password or "").strip()
        access_key_id = str(ses.access_key_id or "").strip()
        secret_access_key = str(ses.secret_access_key or "").strip()
        if not region or not sender_email:
            return []
        reply_to = str(ses.reply_to_email or "").strip()
        sender_name = str(ses.sender_name or "").strip()
        from_email = formataddr((sender_name, sender_email)) if sender_name else sender_email
        timeout = int(getattr(settings, "EMAIL_TIMEOUT", 20) or 20)
        smtp_host = f"email-smtp.{region}.amazonaws.com"
        reply_to_list = [reply_to] if reply_to else []

        configs = []
        seen = set()

        def _append_smtp(username, password, source):
            username = str(username or "").strip()
            password = str(password or "").strip()
            if not username or not password:
                return
            key = ("smtp", username, password)
            if key in seen:
                return
            seen.add(key)
            configs.append(
                {
                    "attempt_source": source,
                    "transport": "smtp",
                    "host": smtp_host,
                    "port": 587,
                    "username": username,
                    "password": password,
                    "use_tls": True,
                    "use_ssl": False,
                    "timeout": timeout,
                    "from_email": from_email,
                    "reply_to": reply_to_list,
                    "source_email": sender_email,
                    "region": region,
                }
            )

        _append_smtp(smtp_username, smtp_password, "ses_db:smtp_username+smtp_password")
        _append_smtp(smtp_username, secret_access_key, "ses_db:smtp_username+secret_access_key")
        _append_smtp(access_key_id, smtp_password, "ses_db:access_key_id+smtp_password")
        _append_smtp(access_key_id, secret_access_key, "ses_db:access_key_id+secret_access_key")

        if access_key_id and secret_access_key:
            configs.append(
                {
                    "attempt_source": "ses_db:api",
                    "transport": "ses_api",
                    "access_key_id": access_key_id,
                    "secret_access_key": secret_access_key,
                    "region": region,
                    "from_email": from_email,
                    "reply_to": reply_to_list,
                    "source_email": sender_email,
                }
            )
        if not configs:
            logger.warning("Amazon SES is active but SMTP/API credentials are missing.")
        return configs
    except (LookupError, OperationalError, ProgrammingError):
        return []
    except Exception:
        logger.exception("Unable to load Amazon SES settings from saas_admin.")
        return []


def _get_env_mail_config():
    """
    Auto-resolve mail transport from environment so local/live can use same code.
    Priority:
    1) SES SMTP env
    2) Generic SMTP env
    3) SES API env
    """
    timeout = int(getattr(settings, "EMAIL_TIMEOUT", 20) or 20)

    ses_region = (
        str(os.environ.get("SES_REGION") or "").strip()
        or str(os.environ.get("AWS_SES_REGION") or "").strip()
        or str(os.environ.get("AWS_REGION") or "").strip()
        or str(os.environ.get("AWS_DEFAULT_REGION") or "").strip()
    )
    ses_sender = (
        str(os.environ.get("SES_SENDER_EMAIL") or "").strip()
        or str(getattr(settings, "DEFAULT_FROM_EMAIL", "") or "").strip()
    )
    ses_sender_name = str(os.environ.get("SES_SENDER_NAME") or "").strip()
    ses_reply_to = str(os.environ.get("SES_REPLY_TO_EMAIL") or "").strip()
    ses_smtp_username = str(os.environ.get("SES_SMTP_USERNAME") or "").strip()
    ses_smtp_password = str(os.environ.get("SES_SMTP_PASSWORD") or "").strip()
    if ses_region and ses_sender and ses_smtp_username and ses_smtp_password:
        from_email = formataddr((ses_sender_name, ses_sender)) if ses_sender_name else ses_sender
        return {
            "transport": "smtp",
            "host": f"email-smtp.{ses_region}.amazonaws.com",
            "port": 587,
            "username": ses_smtp_username,
            "password": ses_smtp_password,
            "use_tls": True,
            "use_ssl": False,
            "timeout": timeout,
            "from_email": from_email,
            "reply_to": [ses_reply_to] if ses_reply_to else [],
            "source_email": ses_sender,
            "region": ses_region,
        }

    email_host = str(getattr(settings, "EMAIL_HOST", "") or "").strip()
    email_port = int(getattr(settings, "EMAIL_PORT", 587) or 587)
    email_host_user = str(getattr(settings, "EMAIL_HOST_USER", "") or "").strip()
    email_host_password = str(getattr(settings, "EMAIL_HOST_PASSWORD", "") or "").strip()
    email_from = str(getattr(settings, "DEFAULT_FROM_EMAIL", "") or "").strip()
    explicit_smtp_env = any(
        key in os.environ
        for key in ("EMAIL_HOST", "EMAIL_PORT", "EMAIL_HOST_USER", "EMAIL_HOST_PASSWORD")
    )
    if explicit_smtp_env and email_host:
        return {
            "transport": "smtp",
            "host": email_host,
            "port": email_port,
            "username": email_host_user,
            "password": email_host_password,
            "use_tls": bool(getattr(settings, "EMAIL_USE_TLS", True)),
            "use_ssl": bool(getattr(settings, "EMAIL_USE_SSL", False)),
            "timeout": timeout,
            "from_email": email_from or "no-reply@workzilla.local",
            "reply_to": [],
            "source_email": email_from or "no-reply@workzilla.local",
            "region": "",
        }

    api_access_key = (
        str(os.environ.get("SES_AWS_ACCESS_KEY_ID") or "").strip()
        or str(os.environ.get("AWS_ACCESS_KEY_ID") or "").strip()
    )
    api_secret_key = (
        str(os.environ.get("SES_AWS_SECRET_ACCESS_KEY") or "").strip()
        or str(os.environ.get("AWS_SECRET_ACCESS_KEY") or "").strip()
    )
    if ses_region and ses_sender and api_access_key and api_secret_key:
        from_email = formataddr((ses_sender_name, ses_sender)) if ses_sender_name else ses_sender
        return {
            "transport": "ses_api",
            "access_key_id": api_access_key,
            "secret_access_key": api_secret_key,
            "region": ses_region,
            "from_email": from_email,
            "reply_to": [ses_reply_to] if ses_reply_to else [],
            "source_email": ses_sender,
        }
    return None


def _send_via_smtp(config, subject, body, recipients):
    connection = get_connection(
        backend="django.core.mail.backends.smtp.EmailBackend",
        host=config["host"],
        port=config["port"],
        username=config["username"],
        password=config["password"],
        use_tls=config["use_tls"],
        use_ssl=config["use_ssl"],
        timeout=config["timeout"],
        fail_silently=False,
    )
    message = EmailMessage(
        subject=subject,
        body=body,
        from_email=config["from_email"],
        to=recipients,
        reply_to=config["reply_to"],
        connection=connection,
    )
    sent_count = message.send(fail_silently=False)
    return bool(sent_count)


def _send_via_ses_api(config, subject, body, recipients):
    client = boto3.client(
        "ses",
        region_name=config["region"],
        aws_access_key_id=config["access_key_id"],
        aws_secret_access_key=config["secret_access_key"],
    )
    result = client.send_email(
        Source=config["source_email"],
        Destination={"ToAddresses": recipients},
        Message={
            "Subject": {"Data": subject, "Charset": "UTF-8"},
            "Body": {"Text": {"Data": body, "Charset": "UTF-8"}},
        },
        ReplyToAddresses=config["reply_to"],
    )
    return bool(result.get("MessageId"))


def send_templated_email(to_email, subject, template_name, context):
    if not to_email:
        return False
    recipients = to_email if isinstance(to_email, (list, tuple)) else [to_email]
    recipients = [item for item in recipients if item]
    if not recipients:
        return False
    body = render_to_string(template_name, context).strip()
    from_email = getattr(settings, "DEFAULT_FROM_EMAIL", "no-reply@workzilla")
    mail_attempts = []
    for cfg in _get_active_ses_mail_configs():
        mail_attempts.append((cfg.get("attempt_source", "ses_db"), cfg))
    env_cfg = _get_env_mail_config()
    if env_cfg:
        mail_attempts.append(("env_auto", env_cfg))
    for source, mail_config in mail_attempts:
        if not mail_config:
            continue
        try:
            if mail_config.get("transport") == "smtp":
                return _send_via_smtp(mail_config, subject, body, recipients)
            if mail_config.get("transport") == "ses_api":
                return _send_via_ses_api(mail_config, subject, body, recipients)
        except Exception:
            logger.exception(
                "Email send failed via %s: subject=%s recipients=%s transport=%s",
                source,
                subject,
                recipients,
                mail_config.get("transport", ""),
            )

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
            "Email send failed via django backend: subject=%s recipients=%s backend=%s",
            subject,
            recipients,
            getattr(settings, "EMAIL_BACKEND", ""),
        )
        return False
