from django.db import models
from django.utils.text import slugify


class Product(models.Model):
    name = models.CharField(max_length=120)
    slug = models.SlugField(max_length=120, unique=True)
    description = models.TextField(blank=True)
    short_description = models.TextField(blank=True)
    is_active = models.BooleanField(default=True)
    sort_order = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ("sort_order", "name")

    def _build_unique_slug(self):
        base = slugify(self.name or "")[:110] or "product"
        candidate = base
        index = 2
        while Product.objects.exclude(pk=self.pk).filter(slug=candidate).exists():
            suffix = f"-{index}"
            candidate = f"{base[: max(1, 120 - len(suffix))]}{suffix}"
            index += 1
        return candidate

    def save(self, *args, **kwargs):
        self.slug = self._build_unique_slug()
        super().save(*args, **kwargs)

    def __str__(self) -> str:
        return self.name
