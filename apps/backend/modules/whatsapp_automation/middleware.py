from django.utils.deprecation import MiddlewareMixin

from .models import DigitalCardEntry
from .views import public_digital_card


class CustomDigitalCardDomainMiddleware(MiddlewareMixin):
    """Serve digital card page when request host matches a mapped custom domain."""

    LOCAL_HOSTS = {"127.0.0.1", "localhost", "0.0.0.0"}

    def process_request(self, request):
        if request.method != "GET":
            return None
        if request.path not in ("/", ""):
            return None
        host = (request.get_host() or "").split(":")[0].strip().lower()
        if not host or host in self.LOCAL_HOSTS:
            return None
        card = (
            DigitalCardEntry.objects
            .filter(custom_domain=host, custom_domain_active=True, is_active=True)
            .only("public_slug")
            .first()
        )
        if not card:
            return None
        return public_digital_card(request, card.public_slug)
