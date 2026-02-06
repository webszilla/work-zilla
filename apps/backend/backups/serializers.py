from django.contrib.auth import get_user_model
from rest_framework import serializers

from core.models import Organization
from apps.backend.products.models import Product
from .models import OrgDownloadActivity, BackupRecord


class OrgDownloadActivitySerializer(serializers.ModelSerializer):
    org_name = serializers.SerializerMethodField()
    product_name = serializers.SerializerMethodField()
    admin_email = serializers.SerializerMethodField()

    class Meta:
        model = OrgDownloadActivity
        fields = [
            "org_name",
            "product_name",
            "admin_email",
            "backup_size_mb",
            "status",
            "generated_at",
            "expires_at",
        ]

    def get_org_name(self, obj):
        org = Organization.objects.filter(id=obj.organization_id).first()
        return org.name if org else ""

    def get_product_name(self, obj):
        if not obj.product_id:
            return ""
        product = Product.objects.filter(id=obj.product_id).first()
        return product.name if product else ""

    def get_admin_email(self, obj):
        user = get_user_model().objects.filter(id=obj.admin_user_id).first()
        return user.email if user else ""


class BackupRecordSerializer(serializers.ModelSerializer):
    product_name = serializers.CharField(source="product.name", read_only=True)

    class Meta:
        model = BackupRecord
        fields = [
            "id",
            "product_name",
            "status",
            "size_bytes",
            "requested_at",
            "completed_at",
            "expires_at",
        ]


class BackupRequestResponseSerializer(serializers.Serializer):
    backup_id = serializers.CharField()
    backups = BackupRecordSerializer(many=True)
