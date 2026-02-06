from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ("core", "0033_referral_program"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="DealerAccount",
            fields=[
                ("id", models.AutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("referral_code", models.CharField(blank=True, max_length=20, null=True, unique=True)),
                ("referred_at", models.DateTimeField(blank=True, null=True)),
                ("subscription_status", models.CharField(choices=[("pending", "Pending"), ("active", "Active"), ("expired", "Expired")], default="pending", max_length=10)),
                ("subscription_start", models.DateTimeField(blank=True, null=True)),
                ("subscription_end", models.DateTimeField(blank=True, null=True)),
                ("subscription_amount", models.DecimalField(decimal_places=2, default=0, max_digits=12)),
                ("address_line1", models.CharField(blank=True, max_length=200)),
                ("address_line2", models.CharField(blank=True, max_length=200)),
                ("city", models.CharField(blank=True, max_length=120)),
                ("state", models.CharField(blank=True, max_length=120)),
                ("postal_code", models.CharField(blank=True, max_length=20)),
                ("bank_name", models.CharField(blank=True, max_length=120)),
                ("bank_account_number", models.CharField(blank=True, max_length=80)),
                ("bank_ifsc", models.CharField(blank=True, max_length=20)),
                ("upi_id", models.CharField(blank=True, max_length=80)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("referred_by", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="referred_dealers", to="core.dealeraccount")),
                ("user", models.OneToOneField(on_delete=django.db.models.deletion.CASCADE, to=settings.AUTH_USER_MODEL)),
            ],
        ),
        migrations.AddField(
            model_name="organization",
            name="referred_by_dealer",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="referred_organizations",
                to="core.dealeraccount",
            ),
        ),
        migrations.AddField(
            model_name="referralsettings",
            name="dealer_commission_rate",
            field=models.DecimalField(decimal_places=2, default=5, max_digits=5),
        ),
        migrations.AddField(
            model_name="referralsettings",
            name="dealer_referral_flat_amount",
            field=models.DecimalField(decimal_places=2, default=0, max_digits=12),
        ),
        migrations.AddField(
            model_name="referralsettings",
            name="dealer_subscription_amount",
            field=models.DecimalField(decimal_places=2, default=750, max_digits=12),
        ),
        migrations.CreateModel(
            name="DealerReferralEarning",
            fields=[
                ("id", models.AutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("base_amount", models.DecimalField(decimal_places=2, default=0, max_digits=12)),
                ("commission_rate", models.DecimalField(decimal_places=2, default=0, max_digits=5)),
                ("commission_amount", models.DecimalField(decimal_places=2, default=0, max_digits=12)),
                ("flat_amount", models.DecimalField(decimal_places=2, default=0, max_digits=12)),
                ("status", models.CharField(choices=[("pending", "Pending"), ("paid", "Paid"), ("rejected", "Rejected")], default="pending", max_length=10)),
                ("payout_reference", models.CharField(blank=True, max_length=120)),
                ("payout_date", models.DateField(blank=True, null=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("referrer_dealer", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="referral_earnings", to="core.dealeraccount")),
                ("referred_dealer", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE, related_name="dealer_referrals", to="core.dealeraccount")),
                ("referred_org", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE, related_name="dealer_referral_sources", to="core.organization")),
                ("transfer", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, to="core.pendingtransfer")),
            ],
        ),
    ]
