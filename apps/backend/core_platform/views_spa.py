from pathlib import Path

from django.conf import settings
from django.http import FileResponse, Http404
from django.shortcuts import redirect
from django.utils._os import safe_join

from core.models import UserProfile


DIST_DIR = Path(settings.BASE_DIR) / "frontend_dist"


def _open_dist_file(path):
    if not path:
        return None
    candidates = [path]
    marker = "app/assets/"
    if marker in path and not path.startswith(marker):
        candidates.append(path[path.index(marker):])

    for candidate in candidates:
        try:
            fullpath = safe_join(str(DIST_DIR), candidate)
        except Exception:
            continue
        file_path = Path(fullpath)
        if file_path.exists() and file_path.is_file():
            return FileResponse(open(file_path, "rb"))
    return None


def spa_serve(request, path=""):
    if path and not path.endswith("/"):
        file_response = _open_dist_file(path)
        if file_response is not None:
            return file_response

    if not request.user.is_authenticated:
        return redirect(f"/auth/login/?next={request.get_full_path()}")

    profile = UserProfile.objects.filter(user=request.user).first()
    if profile and profile.role == "ai_chatbot_agent":
        if not path or path.startswith("worksuite") or path.startswith("monitor"):
            return redirect("/app/ai-chatbot/")

    index_file = DIST_DIR / "index.html"
    if not index_file.exists():
        raise Http404(f"Missing SPA build: {index_file}")
    return FileResponse(open(index_file, "rb"), content_type="text/html")
