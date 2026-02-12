from django.db import models
from django.contrib.auth.models import User
from core.models import Organization


class Plan(models.Model):
    name = models.CharField(max_length=100)
    price = models.IntegerField(help_text="Amount in INR")
    duration_months = models.IntegerField(default=1)

    def __str__(self):
        return self.name


class Subscription(models.Model):
    org = models.OneToOneField(Organization, on_delete=models.CASCADE)
    plan = models.ForeignKey(Plan, on_delete=models.SET_NULL, null=True)
    start_date = models.DateTimeField(auto_now_add=True)
    end_date = models.DateTimeField()
    is_active = models.BooleanField(default=False)

    def __str__(self):
        return f"{self.org.name} - {self.plan.name}"
