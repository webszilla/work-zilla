from django.db import migrations, models
import django.utils.timezone


def backfill_description_and_seed_product(apps, schema_editor):
    Product = apps.get_model("products", "Product")

    Product.objects.filter(description="").exclude(short_description="").update(
        description=models.F("short_description")
    )

    obj, _ = Product.objects.get_or_create(slug="digital-automation")
    obj.name = "Digital Automation"
    obj.description = "Automation suite for social media posting, AI content generation, WordPress publishing, and hosting operations."
    obj.short_description = "Automation suite for social media posting, AI content generation, WordPress publishing, and hosting operations."
    obj.is_active = True
    obj.sort_order = 70
    obj.save()


def reverse_seed_product(apps, schema_editor):
    Product = apps.get_model("products", "Product")
    Product.objects.filter(slug="digital-automation").delete()


class Migration(migrations.Migration):

    dependencies = [
        ("products", "0011_update_product_display_names"),
    ]

    operations = [
        migrations.AddField(
            model_name="product",
            name="description",
            field=models.TextField(blank=True),
        ),
        migrations.AddField(
            model_name="product",
            name="created_at",
            field=models.DateTimeField(auto_now_add=True, default=django.utils.timezone.now),
            preserve_default=False,
        ),
        migrations.RunPython(backfill_description_and_seed_product, reverse_seed_product),
    ]
