from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("core", "0085_plan_website_page_limit"),
    ]

    operations = [
        migrations.AddConstraint(
            model_name="aimedialibraryitem",
            constraint=models.UniqueConstraint(
                fields=("organization", "type"),
                condition=models.Q(type="word_website_data"),
                name="unique_org_website_data",
            ),
        ),
    ]
