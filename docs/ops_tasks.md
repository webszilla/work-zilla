# Ops Tasks (Windows)

This file documents recommended scheduled tasks for Work Zilla.

## Billing automation (daily)

Run daily at 02:00.

```bat
cd /d E:\my-project\work-zilla\apps\backend
python manage.py billing_automation
```

## Alert checks (every 10 minutes)

Run every 10 minutes.

```bat
cd /d E:\my-project\work-zilla\apps\backend
python manage.py check_alerts
```

## Dry run

Use `--dry-run` to validate alert rules without sending emails.

```bat
cd /d E:\my-project\work-zilla\apps\backend
python manage.py check_alerts --dry-run
```
