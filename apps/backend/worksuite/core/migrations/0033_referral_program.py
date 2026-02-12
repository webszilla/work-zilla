from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ("core", "0032_theme_settings"),
    ]

    operations = [
        migrations.AddField(
            model_name="organization",
            name="referral_code",
            field=models.CharField(blank=True, max_length=20, null=True, unique=True),
        ),
        migrations.AddField(
            model_name="organization",
            name="referred_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="organization",
            name="referred_by",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="referred_organizations",
                to="core.organization",
            ),
        ),
        migrations.CreateModel(
            name="ReferralSettings",
            fields=[
                ("id", models.AutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("commission_rate", models.DecimalField(decimal_places=2, default=5, max_digits=5)),
                ("updated_at", models.DateTimeField(auto_now=True)),
            ],
            options={
                "verbose_name": "Referral Settings",
                "verbose_name_plural": "Referral Settings",
            },
        ),
        migrations.CreateModel(
            name="ReferralEarning",
            fields=[
                ("id", models.AutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("base_amount", models.DecimalField(decimal_places=2, default=0, max_digits=12)),
                ("commission_rate", models.DecimalField(decimal_places=2, default=0, max_digits=5)),
                ("commission_amount", models.DecimalField(decimal_places=2, default=0, max_digits=12)),
                ("status", models.CharField(choices=[("pending", "Pending"), ("paid", "Paid"), ("rejected", "Rejected")], default="pending", max_length=10)),
                ("payout_reference", models.CharField(blank=True, max_length=120)),
                ("payout_date", models.DateField(blank=True, null=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("referrer_org", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="referral_earnings", to="core.organization")),
                ("referred_org", models.OneToOneField(on_delete=django.db.models.deletion.CASCADE, related_name="referral_source", to="core.organization")),
                ("transfer", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, to="core.pendingtransfer")),
            ],
        ),
    ]
