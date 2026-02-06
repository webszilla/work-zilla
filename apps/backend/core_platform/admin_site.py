from django.contrib.admin import AdminSite
from django.urls import path

from apps.backend.monitor.admin_views import monitor_products_hub


class WorkZillaAdminSite(AdminSite):
    site_header = "Work Zilla Administration"

    def get_urls(self):
        urls = super().get_urls()
        custom = [
            path(
                "monitor-products/",
                self.admin_view(monitor_products_hub),
                name="monitor_product_hub",
            ),
        ]
        return custom + urls
