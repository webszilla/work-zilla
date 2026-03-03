from django.db import migrations, models
import django.db.models.deletion


def seed_catalogue_categories(apps, schema_editor):
    CatalogueCategory = apps.get_model("whatsapp_automation", "CatalogueCategory")
    CatalogueProduct = apps.get_model("whatsapp_automation", "CatalogueProduct")

    seen = set()
    for row in CatalogueProduct.objects.exclude(category="").values("organization_id", "category").distinct():
      organization_id = row.get("organization_id")
      name = (row.get("category") or "").strip()
      if not organization_id or not name:
          continue
      key = (organization_id, name.lower())
      if key in seen:
          continue
      seen.add(key)
      CatalogueCategory.objects.get_or_create(
          organization_id=organization_id,
          name=name,
          defaults={"sort_order": 0, "is_active": True},
      )


class Migration(migrations.Migration):

    dependencies = [
        ("whatsapp_automation", "0007_digitalcardentry_icon_size_pt_and_more"),
        ("core", "0118_alter_chatwidget_public_chat_code"),
    ]

    operations = [
        migrations.CreateModel(
            name="CatalogueCategory",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("name", models.CharField(max_length=120)),
                ("sort_order", models.PositiveIntegerField(default=0)),
                ("is_active", models.BooleanField(default=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("organization", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="wa_catalogue_categories", to="core.organization")),
            ],
            options={
                "ordering": ("sort_order", "name", "id"),
                "unique_together": {("organization", "name")},
            },
        ),
        migrations.AddField(
            model_name="catalogueproduct",
            name="item_type",
            field=models.CharField(
                choices=[("product", "Product"), ("service", "Service")],
                default="product",
                max_length=20,
            ),
        ),
        migrations.RunPython(seed_catalogue_categories, migrations.RunPython.noop),
    ]
