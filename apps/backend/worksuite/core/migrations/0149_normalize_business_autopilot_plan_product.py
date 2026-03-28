from django.db import migrations


def _target_slug(SaasProduct, CatalogProduct):
    preferred = ["business-autopilot", "business-autopilot-erp"]
    active_saas_slugs = set(
        SaasProduct.objects.filter(slug__in=preferred, status="active").values_list("slug", flat=True)
    )
    for slug in preferred:
        if slug in active_saas_slugs:
            return slug
    existing_catalog_slugs = set(CatalogProduct.objects.filter(slug__in=preferred).values_list("slug", flat=True))
    for slug in preferred:
        if slug in existing_catalog_slugs:
            return slug
    return ""


def normalize_business_autopilot_plan_product(apps, schema_editor):
    Plan = apps.get_model("core", "Plan")
    CatalogProduct = apps.get_model("products", "Product")
    SaasProduct = apps.get_model("saas_admin", "Product")

    desired_slug = _target_slug(SaasProduct, CatalogProduct)
    if not desired_slug:
        return

    target_product = CatalogProduct.objects.filter(slug=desired_slug).first()
    if not target_product:
        return

    alias_slugs = ["business-autopilot", "business-autopilot-erp"]
    Plan.objects.filter(product__slug__in=alias_slugs).exclude(product_id=target_product.id).update(product=target_product)


def noop_reverse(apps, schema_editor):
    return


class Migration(migrations.Migration):

    dependencies = [
        ("core", "0148_socialmediacompany_and_more"),
        ("products", "0012_product_description_created_at_seed_digital_automation"),
        ("saas_admin", "0023_blackblazebackupsettings_blackblazebackupartifact"),
    ]

    operations = [
        migrations.RunPython(normalize_business_autopilot_plan_product, noop_reverse),
    ]
