from rest_framework import serializers


class GlobalRetentionPolicySerializer(serializers.Serializer):
    grace_days = serializers.IntegerField(min_value=0)
    archive_days = serializers.IntegerField(min_value=0)
    hard_delete_days = serializers.IntegerField(min_value=0)
