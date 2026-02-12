from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ("core", "0036_dealer_account_profile_fields"),
    ]

    operations = [
        migrations.AlterField(
            model_name="pendingtransfer",
            name="request_type",
            field=models.CharField(
                choices=[
                    ("new", "New Account"),
                    ("renew", "Renewal"),
                    ("addon", "Addon"),
                    ("dealer", "Dealer Subscription"),
                ],
                default="new",
                max_length=10,
            ),
        ),
        migrations.AlterField(
            model_name="subscriptionhistory",
            name="organization",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.CASCADE,
                to="core.organization",
            ),
        ),
        migrations.AlterField(
            model_name="userprofile",
            name="role",
            field=models.CharField(
                choices=[
                    ("superadmin", "Super Admin"),
                    ("company_admin", "Company Admin"),
                    ("hr_view", "HR View"),
                    ("dealer", "Dealer"),
                ],
                default="company_admin",
                max_length=20,
            ),
        ),
    ]
