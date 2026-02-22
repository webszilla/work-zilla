from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("core", "0105_alter_chatwidget_public_chat_code"),
    ]

    operations = [
        migrations.AddField(
            model_name="adminnotification",
            name="audience",
            field=models.CharField(
                choices=[("saas_admin", "SaaS Admin"), ("org_admin", "Org Admin")],
                default="saas_admin",
                max_length=20,
            ),
        ),
        migrations.AddField(
            model_name="adminnotification",
            name="channel",
            field=models.CharField(
                choices=[("system", "System"), ("email", "Email"), ("whatsapp", "WhatsApp")],
                default="system",
                max_length=20,
            ),
        ),
        migrations.AddField(
            model_name="adminnotification",
            name="product_slug",
            field=models.CharField(blank=True, default="", max_length=120),
        ),
    ]

