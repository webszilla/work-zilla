#!/usr/bin/env python
import os
import sys
from pathlib import Path


def main() -> None:
    base_dir = Path(__file__).resolve().parent
    repo_root = base_dir.parent.parent

    if str(repo_root) not in sys.path:
        sys.path.insert(0, str(repo_root))
    if str(base_dir) in sys.path:
        sys.path.remove(str(base_dir))

    os.environ.setdefault(
        "DJANGO_SETTINGS_MODULE", "apps.backend.platform.settings"
    )
    try:
        from django.core.management import execute_from_command_line
    except ImportError as exc:
        raise ImportError(
            "Couldn't import Django. Are you sure it's installed and "
            "available on your PYTHONPATH environment variable? Did you "
            "forget to activate a virtual environment?"
        ) from exc
    execute_from_command_line(sys.argv)


if __name__ == "__main__":
    main()
