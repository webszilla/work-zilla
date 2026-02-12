from pathlib import Path

from django.conf import settings
from django.contrib.auth.decorators import login_required
from django.http import FileResponse, Http404
from django.shortcuts import redirect
from django.utils._os import safe_join


DIST_DIR = Path(settings.BASE_DIR) / "frontend_dist"


@login_required(login_url="/auth/login/")
def spa_serve(request, path=""):
    profile = UserProfile.objects.filter(user=request.user).first()
    if profile and profile.role == "ai_chatbot_agent":
        if not path or path.startswith("worksuite") or path.startswith("monitor"):
            return redirect("/app/ai-chatbot/")
    if path and not path.endswith("/"):
        try:
            fullpath = safe_join(str(DIST_DIR), path)
        except Exception:
            raise Http404()
        file_path = Path(fullpath)
        if file_path.exists() and file_path.is_file():
            return FileResponse(open(file_path, "rb"))

    index_file = DIST_DIR / "index.html"
    if not index_file.exists():
        raise Http404(f"Missing SPA build: {index_file}")
    return FileResponse(open(index_file, "rb"), content_type="text/html")
from core.models import UserProfile
