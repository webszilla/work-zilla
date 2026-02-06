"""
Platform package for the Work Zilla backend.
"""

try:
    from .celery import app as celery_app
    __all__ = ("celery_app",)
except Exception:
    __all__ = ()
