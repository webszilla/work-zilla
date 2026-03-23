from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ("core", "0035_pendingtransfer_org_nullable"),
    ]

    # NOTE:
    # DealerAccount profile/bank fields are already created in 0034_dealer_referrals.
    # Keeping this migration as a no-op prevents duplicate-column failures on clean PostgreSQL setups.
    operations = []
