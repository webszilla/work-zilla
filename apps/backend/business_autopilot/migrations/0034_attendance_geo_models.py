from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ("business_autopilot", "0033_organizationuser_user_type"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="AttendanceGeoSetting",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("location_name", models.CharField(blank=True, default="", max_length=160)),
                ("latitude", models.DecimalField(blank=True, decimal_places=7, max_digits=10, null=True)),
                ("longitude", models.DecimalField(blank=True, decimal_places=7, max_digits=10, null=True)),
                ("radius_meters", models.PositiveIntegerField(default=100)),
                ("enabled", models.BooleanField(default=False)),
                ("allow_outside_fence", models.BooleanField(default=False)),
                ("require_gps", models.BooleanField(default=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("organization", models.OneToOneField(on_delete=django.db.models.deletion.CASCADE, related_name="business_autopilot_attendance_geo_setting", to="core.organization")),
            ],
            options={"ordering": ("-updated_at",)},
        ),
        migrations.CreateModel(
            name="AttendanceEntry",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("employee_name", models.CharField(max_length=160)),
                ("attendance_date", models.DateField(db_index=True)),
                ("checkin_time", models.DateTimeField(blank=True, null=True)),
                ("checkout_time", models.DateTimeField(blank=True, null=True)),
                ("checkin_latitude", models.DecimalField(blank=True, decimal_places=7, max_digits=10, null=True)),
                ("checkin_longitude", models.DecimalField(blank=True, decimal_places=7, max_digits=10, null=True)),
                ("checkin_accuracy", models.DecimalField(blank=True, decimal_places=2, max_digits=8, null=True)),
                ("checkout_latitude", models.DecimalField(blank=True, decimal_places=7, max_digits=10, null=True)),
                ("checkout_longitude", models.DecimalField(blank=True, decimal_places=7, max_digits=10, null=True)),
                ("checkout_accuracy", models.DecimalField(blank=True, decimal_places=2, max_digits=8, null=True)),
                ("checkin_distance_meters", models.DecimalField(blank=True, decimal_places=2, max_digits=10, null=True)),
                ("checkout_distance_meters", models.DecimalField(blank=True, decimal_places=2, max_digits=10, null=True)),
                ("checkin_inside_geofence", models.BooleanField(blank=True, null=True)),
                ("checkout_inside_geofence", models.BooleanField(blank=True, null=True)),
                ("geo_status", models.CharField(choices=[("INSIDE", "Inside"), ("OUTSIDE", "Outside"), ("GPS_NOT_AVAILABLE", "GPS Not Available"), ("MANUAL", "Manual")], default="MANUAL", max_length=24)),
                ("outside_reason", models.CharField(blank=True, default="", max_length=255)),
                ("device_info", models.TextField(blank=True, default="")),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("employee_membership", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="attendance_entries", to="business_autopilot.organizationuser")),
                ("organization", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="business_autopilot_attendance_entries", to="core.organization")),
            ],
            options={
                "ordering": ("-attendance_date", "-updated_at", "-id"),
                "unique_together": {("organization", "employee_membership", "attendance_date")},
            },
        ),
    ]
