from .views import build_enquiry_context


def enquiry_widget(request):
    return build_enquiry_context(request)
