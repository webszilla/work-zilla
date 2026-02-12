from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0004_userprofile_organization'),
    ]

    operations = [
        migrations.AddField(
            model_name='employee',
            name='pc_name',
            field=models.CharField(blank=True, max_length=200, null=True),
        ),
    ]
