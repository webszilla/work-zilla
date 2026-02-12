from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("core", "0009_plan_subscription_billing"),
    ]

    operations = [
        migrations.CreateModel(
            name="DeletedAccount",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("organization_name", models.CharField(max_length=200)),
                ("owner_username", models.CharField(max_length=150)),
                ("owner_email", models.EmailField(blank=True, max_length=254)),
                ("deleted_at", models.DateTimeField(auto_now_add=True)),
                ("reason", models.CharField(default="Plan expired", max_length=200)),
            ],
        ),
    ]
