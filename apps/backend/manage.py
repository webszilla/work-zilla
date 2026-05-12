#!/usr/bin/env python
import os
import sys
from pathlib import Path


def _load_dotenv(dotenv_path: Path) -> None:
    """
    Minimal `.env` loader (no external dependency).
    - Does not override already-set environment variables.
    - Supports simple KEY=VALUE lines (optionally quoted).
    """
    try:
        if not dotenv_path.exists():
            return
        for raw_line in dotenv_path.read_text(encoding="utf-8").splitlines():
            line = raw_line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, value = line.split("=", 1)
            key = key.strip()
            if not key or key in os.environ:
                continue
            value = value.strip()
            if (value.startswith('"') and value.endswith('"')) or (value.startswith("'") and value.endswith("'")):
                value = value[1:-1]
            os.environ[key] = value
    except Exception:
        # Never block dev/prod startup due to .env parsing issues.
        return


def main() -> None:
    base_dir = Path(__file__).resolve().parent
    repo_root = base_dir.parent.parent

    _load_dotenv(base_dir / ".env")

    if str(repo_root) not in sys.path:
        sys.path.insert(0, str(repo_root))
    if str(base_dir) in sys.path:
        sys.path.remove(str(base_dir))

    os.environ.setdefault(
        "DJANGO_SETTINGS_MODULE", "apps.backend.core_platform.settings"
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
