from django.contrib import messages
from django.shortcuts import redirect
from django.views.decorators.http import require_POST

from .captcha import set_math_captcha
from .forms import EnquiryForm


def _get_client_ip(request):
    forwarded = request.META.get("HTTP_X_FORWARDED_FOR", "")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.META.get("REMOTE_ADDR", "")


def build_enquiry_context(request):
    question = request.session.get("captcha_question") or set_math_captcha(request)
    form = EnquiryForm(request=request)
    return {"enquiry_form": form, "captcha_question": question}


@require_POST
def submit_enquiry(request):
    form = EnquiryForm(request=request, data=request.POST)
    source_page = (request.POST.get("source_page") or "").strip()
    expected = request.session.get("enquiry_captcha_answer") or request.session.get("captcha_answer")
    given = form.data.get("captcha_answer")
    if form.is_valid():
        try:
            given_int = int(given)
        except (TypeError, ValueError):
            given_int = None
        if expected is None or given_int != expected:
            form.add_error("captcha_answer", "Wrong captcha. Try again.")

    if form.is_valid():
        enquiry = form.save(commit=False)
        enquiry.source_page = source_page or request.META.get("HTTP_REFERER", "")[:200]
        enquiry.ip_address = _get_client_ip(request)[:45]
        enquiry.user_agent = (request.META.get("HTTP_USER_AGENT") or "")[:4000]
        enquiry.save()
        for key in (
            "enquiry_captcha_answer",
            "enquiry_captcha_question",
            "captcha_answer",
            "captcha_question",
        ):
            request.session.pop(key, None)
        messages.success(request, "Thanks! We received your enquiry and will reach out shortly.")
    else:
        set_math_captcha(request)
        messages.error(request, "Please check the form and captcha, then try again.")

    next_url = request.POST.get("next") or request.META.get("HTTP_REFERER") or "/contact/"
    return redirect(next_url)
