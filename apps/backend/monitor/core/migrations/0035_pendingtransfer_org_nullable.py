from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ("core", "0034_dealer_referrals"),
    ]

    operations = [
        migrations.AlterField(
            model_name="pendingtransfer",
            name="organization",
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE, to="core.organization"),
        ),
    ]
