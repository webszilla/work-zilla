try:
    from celery import shared_task
except Exception:  # pragma: no cover
    def shared_task(*_args, **_kwargs):
        def wrapper(func):
            return func
        return wrapper

from .alerts import check_alerts


@shared_task
def monitoring_check_alerts():
    check_alerts()
