from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion
import django.utils.timezone


class Migration(migrations.Migration):

    dependencies = [
        ("imposition", "0003_backfill_from_core_subscriptions"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.AlterModelTable(
            name="impositionorgsubscription",
            table="product_subscriptions",
        ),
        migrations.AlterModelTable(
            name="impositionlicense",
            table="product_license_codes",
        ),
        migrations.AlterModelTable(
            name="impositiondevice",
            table="product_devices",
        ),
        migrations.AlterModelTable(
            name="impositionusagelog",
            table="product_activity_logs",
        ),
        migrations.CreateModel(
            name="ImpositionBillingRecord",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("invoice_number", models.CharField(max_length=80)),
                ("plan_name", models.CharField(blank=True, default="", max_length=120)),
                ("amount", models.DecimalField(decimal_places=2, default=0, max_digits=12)),
                ("currency", models.CharField(default="INR", max_length=10)),
                ("payment_method", models.CharField(blank=True, default="", max_length=40)),
                ("status", models.CharField(choices=[("paid", "Paid"), ("pending", "Pending"), ("failed", "Failed"), ("refunded", "Refunded")], default="paid", max_length=20)),
                ("paid_at", models.DateTimeField(default=django.utils.timezone.now)),
                ("invoice_url", models.CharField(blank=True, default="", max_length=500)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("organization", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="imposition_billing_records", to="core.organization")),
                ("subscription", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="billing_records", to="imposition.impositionorgsubscription")),
            ],
            options={
                "db_table": "product_billing",
                "ordering": ("-paid_at", "-created_at"),
                "unique_together": {("organization", "invoice_number")},
            },
        ),
        migrations.CreateModel(
            name="ImpositionProductUser",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("role", models.CharField(default="org_user", max_length=30)),
                ("status", models.CharField(choices=[("active", "Active"), ("disabled", "Disabled"), ("deleted", "Deleted")], default="active", max_length=20)),
                ("last_login", models.DateTimeField(blank=True, null=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("license", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="product_users", to="imposition.impositionlicense")),
                ("organization", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="imposition_product_users", to="core.organization")),
                ("user", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="imposition_product_memberships", to=settings.AUTH_USER_MODEL)),
            ],
            options={
                "db_table": "product_users",
                "ordering": ("user__username",),
                "unique_together": {("organization", "user")},
            },
        ),
        migrations.AddIndex(
            model_name="impositionbillingrecord",
            index=models.Index(fields=["organization", "paid_at"], name="imposition_bill_org_paid_idx"),
        ),
        migrations.AddIndex(
            model_name="impositionbillingrecord",
            index=models.Index(fields=["organization", "status"], name="imposition_bill_org_status_idx"),
        ),
        migrations.AddIndex(
            model_name="impositionproductuser",
            index=models.Index(fields=["organization", "status"], name="imposition_pu_org_status_idx"),
        ),
    ]
