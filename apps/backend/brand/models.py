from django.db import models


class SiteBrandSettings(models.Model):
    site_name = models.CharField(max_length=120, default="Work Zilla")
    primary_color = models.CharField(max_length=20, default="#1f6f8b")
    primary_button_color = models.CharField(
        max_length=20,
        default="#1f6f8b",
        verbose_name="Primary Button",
        help_text="Primary button color (hex).",
    )
    primary_button_hover_color = models.CharField(
        max_length=20,
        default="#145f78",
        verbose_name="Primary Button Hover",
        help_text="Primary button hover color (hex).",
    )
    secondary_color = models.CharField(max_length=20, default="#0f172a")
    secondary_button_color = models.CharField(
        max_length=20,
        default="#1f6f8b",
        verbose_name="Secondary Button",
        help_text="Outline button color (hex).",
    )
    secondary_button_hover_color = models.CharField(
        max_length=20,
        default="#0f172a",
        verbose_name="Secondary Button Hover",
        help_text="Outline button hover color (hex).",
    )
    accent_color = models.CharField(max_length=20, blank=True)
    logo = models.ImageField(upload_to="brand/", blank=True, null=True)
    favicon = models.ImageField(upload_to="brand/", blank=True, null=True)
    support_email = models.EmailField(blank=True)
    support_phone = models.CharField(max_length=30, blank=True)
    default_meta_title = models.CharField(max_length=160, blank=True)
    default_meta_description = models.TextField(blank=True)
    og_image = models.ImageField(upload_to="brand/", blank=True, null=True)

    class Meta:
        verbose_name = "Site Brand Settings"
        verbose_name_plural = "Site Brand Settings"

    def __str__(self) -> str:
        return self.site_name or "Site Brand Settings"

    def save(self, *args, **kwargs):
        if not self.pk:
            self.pk = 1
        super().save(*args, **kwargs)

    @classmethod
    def get_active(cls):
        obj, _ = cls.objects.get_or_create(
            id=1,
            defaults={
                "site_name": "Work Zilla",
                "primary_color": "#1f6f8b",
                "primary_button_color": "#1f6f8b",
                "primary_button_hover_color": "#145f78",
                "secondary_color": "#0f172a",
                "secondary_button_color": "#1f6f8b",
                "secondary_button_hover_color": "#0f172a",
            },
        )
        return obj


class Product(models.Model):
    key = models.SlugField(max_length=80, unique=True)
    internal_code_name = models.SlugField(max_length=120, unique=True)
    display_name = models.CharField(max_length=160)
    tagline = models.CharField(max_length=240, blank=True)
    description = models.TextField(blank=True)
    logo = models.ImageField(upload_to="brand/products/", blank=True, null=True)
    primary_color = models.CharField(max_length=20, blank=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ("display_name",)

    def __str__(self) -> str:
        return self.display_name or self.key

    @classmethod
    def get_default(cls):
        product = cls.objects.filter(is_active=True).order_by("id").first()
        if product:
            return product
        return cls(
            key="worksuite",
            internal_code_name="monitor",
            display_name="Work Suite",
        )


class ProductAlias(models.Model):
    CONTEXT_UI = "ui"
    CONTEXT_MARKETING = "marketing"
    CONTEXT_EMAIL = "email"
    CONTEXT_CHOICES = (
        (CONTEXT_UI, "UI"),
        (CONTEXT_MARKETING, "Marketing"),
        (CONTEXT_EMAIL, "Email"),
    )

    product = models.ForeignKey(Product, on_delete=models.CASCADE, related_name="aliases")
    alias_key = models.SlugField(max_length=80, default="default")
    alias_text = models.CharField(max_length=240)
    context = models.CharField(max_length=20, choices=CONTEXT_CHOICES, default=CONTEXT_UI)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ("context", "alias_key", "alias_text")

    def __str__(self) -> str:
        return f"{self.product.display_name} ({self.context}:{self.alias_key})"


class ProductRouteMapping(models.Model):
    product = models.ForeignKey(Product, on_delete=models.CASCADE, related_name="routes")
    public_slug = models.SlugField(max_length=120, unique=True)
    legacy_slugs = models.JSONField(default=list, blank=True)
    redirect_enabled = models.BooleanField(default=True)

    class Meta:
        ordering = ("public_slug",)

    def __str__(self) -> str:
        return f"{self.public_slug} -> {self.product.key}"
