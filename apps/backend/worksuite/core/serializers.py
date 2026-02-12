from rest_framework import serializers
from .models import Organization, Employee, Activity, Screenshot, AiMediaLibraryItem, AiFaq

class OrgSerializer(serializers.ModelSerializer):
    class Meta:
        model = Organization
        fields = '__all__'

class EmployeeSerializer(serializers.ModelSerializer):
    class Meta:
        model = Employee
        fields = '__all__'

class ActivitySerializer(serializers.ModelSerializer):
    class Meta:
        model = Activity
        fields = '__all__'

class ScreenshotSerializer(serializers.ModelSerializer):
    class Meta:
        model = Screenshot
        fields = '__all__'


class AiMediaLibraryItemSerializer(serializers.ModelSerializer):
    file_url = serializers.SerializerMethodField()
    created_by = serializers.SerializerMethodField()
    created_by_id = serializers.IntegerField(read_only=True)
    text_content = serializers.SerializerMethodField()

    class Meta:
        model = AiMediaLibraryItem
        fields = [
            "id",
            "name",
            "type",
            "source_url",
            "file_url",
            "file_size",
            "text_content",
            "is_auto_generated",
            "created_by",
            "created_by_id",
            "created_at",
            "updated_at",
        ]

    def get_file_url(self, obj):
        return obj.file_path.url if obj.file_path else ""

    def get_created_by(self, obj):
        if not obj.created_by:
            return ""
        return (
            f"{obj.created_by.first_name} {obj.created_by.last_name}".strip()
            or obj.created_by.username
        )

    def get_text_content(self, obj):
        return obj.text_content if obj.type == "extra_text" else ""


class AiFaqSerializer(serializers.ModelSerializer):
    class Meta:
        model = AiFaq
        fields = ["id", "question", "answer", "created_at"]
