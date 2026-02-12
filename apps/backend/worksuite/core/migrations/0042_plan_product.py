from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("products", "0001_initial"),
        ("core", "0041_screenshot_employee_name"),
    ]

    operations = [
        migrations.AddField(
            model_name="plan",
            name="product",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=models.SET_NULL,
                related_name="plans",
                to="products.product",
            ),
        ),
    ]
