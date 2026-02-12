from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ("brand", "0003_button_hover_colors"),
    ]

    operations = [
        migrations.CreateModel(
            name="Product",
            fields=[
                ("id", models.AutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("key", models.SlugField(max_length=80, unique=True)),
                ("internal_code_name", models.SlugField(max_length=120, unique=True)),
                ("display_name", models.CharField(max_length=160)),
                ("tagline", models.CharField(blank=True, max_length=240)),
                ("description", models.TextField(blank=True)),
                ("logo", models.ImageField(blank=True, null=True, upload_to="brand/products/")),
                ("primary_color", models.CharField(blank=True, max_length=20)),
                ("is_active", models.BooleanField(default=True)),
            ],
            options={
                "ordering": ("display_name",),
            },
        ),
        migrations.CreateModel(
            name="ProductRouteMapping",
            fields=[
                ("id", models.AutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("public_slug", models.SlugField(max_length=120, unique=True)),
                ("legacy_slugs", models.JSONField(blank=True, default=list)),
                ("redirect_enabled", models.BooleanField(default=True)),
                (
                    "product",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="routes",
                        to="brand.product",
                    ),
                ),
            ],
            options={
                "ordering": ("public_slug",),
            },
        ),
        migrations.CreateModel(
            name="ProductAlias",
            fields=[
                ("id", models.AutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("alias_key", models.SlugField(default="default", max_length=80)),
                ("alias_text", models.CharField(max_length=240)),
                (
                    "context",
                    models.CharField(
                        choices=[("ui", "UI"), ("marketing", "Marketing"), ("email", "Email")],
                        default="ui",
                        max_length=20,
                    ),
                ),
                ("is_active", models.BooleanField(default=True)),
                (
                    "product",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="aliases",
                        to="brand.product",
                    ),
                ),
            ],
            options={
                "ordering": ("context", "alias_key", "alias_text"),
            },
        ),
    ]
