from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        ("core", "0029_invoicesellerprofile_bank_account_details"),
    ]

    operations = [
        migrations.CreateModel(
            name="Product",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("name", models.CharField(max_length=120)),
                ("slug", models.SlugField(max_length=120, unique=True)),
                ("description", models.TextField(blank=True)),
                ("icon", models.CharField(blank=True, max_length=80)),
                ("status", models.CharField(choices=[("active", "Active"), ("coming_soon", "Coming Soon"), ("disabled", "Disabled")], default="coming_soon", max_length=20)),
                ("features", models.TextField(blank=True)),
                ("sort_order", models.PositiveIntegerField(default=0)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
            ],
            options={
                "ordering": ("sort_order", "name"),
            },
        ),
        migrations.CreateModel(
            name="OrgProductEntitlement",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("status", models.CharField(choices=[("active", "Active"), ("inactive", "Inactive"), ("trial", "Trial")], default="active", max_length=20)),
                ("enabled_at", models.DateTimeField(auto_now_add=True)),
                ("notes", models.TextField(blank=True)),
                ("organization", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, to="core.organization")),
                ("product", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, to="saas_admin.product")),
            ],
            options={
                "unique_together": {("organization", "product")},
            },
        ),
    ]
