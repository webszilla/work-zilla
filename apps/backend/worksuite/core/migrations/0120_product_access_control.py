from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


def seed_org_products(apps, schema_editor):
    OrganizationProduct = apps.get_model("core", "OrganizationProduct")
    CoreSubscription = apps.get_model("core", "Subscription")
    Product = apps.get_model("products", "Product")

    slug_to_status = {}
    for sub in CoreSubscription.objects.select_related("plan__product").all():
        product = getattr(getattr(sub, "plan", None), "product", None)
        if not product:
            continue
        key = (sub.organization_id, product.id)
        current_status = slug_to_status.get(key)
        next_status = sub.status or "inactive"
        priority = {"active": 4, "trialing": 3, "pending": 2, "expired": 1, "inactive": 0}
        if current_status is None or priority.get(next_status, 0) >= priority.get(current_status, 0):
            slug_to_status[key] = next_status

    for (organization_id, product_id), status in slug_to_status.items():
        normalized_status = status if status in {"active", "trialing", "inactive", "expired", "canceled"} else "inactive"
        OrganizationProduct.objects.update_or_create(
            organization_id=organization_id,
            product_id=product_id,
            defaults={
                "subscription_status": normalized_status,
                "source": "core_subscription",
            },
        )

    try:
        StorageOrgSubscription = apps.get_model("storage", "OrgSubscription")
        for row in StorageOrgSubscription.objects.select_related("product").all():
            product = Product.objects.filter(slug="storage").first()
            if not product:
                continue
            OrganizationProduct.objects.update_or_create(
                organization_id=row.organization_id,
                product_id=product.id,
                defaults={
                    "subscription_status": row.status if row.status in {"active", "trialing", "inactive", "expired", "canceled"} else "inactive",
                    "source": "storage_subscription",
                },
            )
    except LookupError:
        pass

    try:
        ImpositionOrgSubscription = apps.get_model("imposition", "ImpositionOrgSubscription")
        for row in ImpositionOrgSubscription.objects.all():
            product = Product.objects.filter(slug="imposition-software").first()
            if not product:
                continue
            OrganizationProduct.objects.update_or_create(
                organization_id=row.organization_id,
                product_id=product.id,
                defaults={
                    "subscription_status": row.status if row.status in {"active", "trialing", "inactive", "expired", "canceled"} else "inactive",
                    "source": "imposition_subscription",
                },
            )
    except LookupError:
        pass


class Migration(migrations.Migration):

    dependencies = [
        ("products", "0010_seed_imposition_software"),
        ("storage", "0018_update_free_device_limit"),
        ("imposition", "0005_imposition_addon_catalog"),
        ("core", "0119_alter_chatwidget_public_chat_code"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.AlterField(
            model_name="userprofile",
            name="role",
            field=models.CharField(
                choices=[
                    ("superadmin", "Super Admin"),
                    ("company_admin", "Company Admin"),
                    ("org_admin", "ORG Admin"),
                    ("org_user", "Org User"),
                    ("employee", "Employee"),
                    ("hr_view", "HR View"),
                    ("ai_chatbot_agent", "AI Chatbot Agent"),
                    ("dealer", "Dealer"),
                ],
                default="company_admin",
                max_length=20,
            ),
        ),
        migrations.CreateModel(
            name="OrganizationProduct",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("subscription_status", models.CharField(choices=[("active", "Active"), ("trialing", "Trialing"), ("inactive", "Inactive"), ("expired", "Expired"), ("canceled", "Canceled")], default="active", max_length=20)),
                ("source", models.CharField(blank=True, default="", max_length=40)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("organization", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="product_subscriptions", to="core.organization")),
                ("product", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="organization_subscriptions", to="products.product")),
            ],
            options={
                "db_table": "org_products",
                "indexes": [
                    models.Index(fields=["organization", "subscription_status"], name="org_product_org_status_idx"),
                    models.Index(fields=["product", "subscription_status"], name="org_product_prod_status_idx"),
                ],
                "unique_together": {("organization", "product")},
            },
        ),
        migrations.CreateModel(
            name="UserProductAccess",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("permission", models.CharField(choices=[("view", "View"), ("edit", "Edit"), ("full", "Full")], default="view", max_length=20)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("granted_by", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="granted_product_access_entries", to=settings.AUTH_USER_MODEL)),
                ("product", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="user_access_entries", to="products.product")),
                ("user", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="product_access_entries", to=settings.AUTH_USER_MODEL)),
            ],
            options={
                "db_table": "user_product_access",
                "indexes": [
                    models.Index(fields=["user", "permission"], name="user_product_access_user_perm_idx"),
                    models.Index(fields=["product", "permission"], name="user_product_access_prod_perm_idx"),
                ],
                "unique_together": {("user", "product")},
            },
        ),
        migrations.RunPython(seed_org_products, migrations.RunPython.noop),
    ]
