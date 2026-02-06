from django import template
from core.models import Plan, Subscription, Employee
from saas_admin.models import Product

register = template.Library()


@register.simple_tag
def plan_dashboard_stats():
    plans = Plan.objects.all().order_by("id")
    stats = []
    for p in plans:
        org_ids = (
            Subscription.objects.filter(plan=p, status="active")
            .values_list("organization_id", flat=True)
            .distinct()
        )
        org_count = len(org_ids)
        emp_count = Employee.objects.filter(org_id__in=org_ids).count() if org_ids else 0
        stats.append({
            "id": p.id,
            "name": p.name,
            "org_count": org_count,
            "emp_count": emp_count,
        })
    return stats


@register.simple_tag(takes_context=True)
def admin_product_cards(context):
    request = context.get("request")
    selected = getattr(request, "_admin_product", None)
    cards = [
        {
            "slug": "all",
            "name": "All Products",
            "status": "active",
            "selected": selected is None,
        }
    ]
    for product in Product.objects.all():
        cards.append(
            {
                "slug": product.slug,
                "name": product.name,
                "status": product.status,
                "selected": selected == product.slug,
            }
        )
    return cards
