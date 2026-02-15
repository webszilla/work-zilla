from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("common_auth", "0001_initial"),
    ]

    operations = [
        migrations.AddField(
            model_name="user",
            name="email_verified",
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name="user",
            name="email_verified_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="user",
            name="email_verification_token",
            field=models.CharField(blank=True, default="", max_length=128),
        ),
        migrations.AddField(
            model_name="user",
            name="email_verification_sent_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
    ]
