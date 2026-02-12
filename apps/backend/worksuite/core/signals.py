from django.db.models.signals import pre_delete
from django.dispatch import receiver
from .models import Screenshot


@receiver(pre_delete, sender=Screenshot)
def delete_screenshot_file(sender, instance, **kwargs):
    if instance.image:
        instance.image.delete(save=False)
