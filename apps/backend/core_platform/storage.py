from django.conf import settings
from django.core.files.storage import Storage, FileSystemStorage


def _load_storage_settings():
    try:
        from saas_admin.models import GlobalMediaStorageSettings
    except Exception:
        return None
    try:
        return GlobalMediaStorageSettings.get_solo()
    except Exception:
        return None


def _build_local_storage():
    return FileSystemStorage(location=settings.MEDIA_ROOT, base_url=settings.MEDIA_URL)


def _build_object_storage(config):
    try:
        from storages.backends.s3boto3 import S3Boto3Storage
    except Exception:
        return None

    storage = S3Boto3Storage()
    storage.access_key = config.access_key_id or settings.AWS_ACCESS_KEY_ID
    storage.secret_key = config.secret_access_key or settings.AWS_SECRET_ACCESS_KEY
    storage.bucket_name = config.bucket_name or settings.AWS_STORAGE_BUCKET_NAME
    storage.endpoint_url = config.endpoint_url or settings.AWS_S3_ENDPOINT_URL
    storage.region_name = config.region_name or settings.AWS_S3_REGION_NAME
    storage.signature_version = settings.AWS_S3_SIGNATURE_VERSION
    storage.addressing_style = settings.AWS_S3_ADDRESSING_STYLE
    storage.default_acl = None
    storage.querystring_auth = True
    base_path = (config.base_path or "").strip().strip("/")
    storage.location = base_path
    return storage


class DynamicMediaStorage(Storage):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._backend = None

    def _is_object_mode(self):
        config = _load_storage_settings()
        return bool(config and config.storage_mode == "object" and config.is_object_configured())

    def _fallback_to_local(self):
        self._backend = _build_local_storage()
        return self._backend

    def _get_backend(self):
        config = _load_storage_settings()
        wants_object = bool(config and config.storage_mode == "object" and config.is_object_configured())
        if self._backend is not None:
            is_local = self._backend.__class__.__name__ == "FileSystemStorage"
            if wants_object and is_local:
                storage = _build_object_storage(config)
                if storage:
                    self._backend = storage
                    return self._backend
            elif not wants_object and not is_local:
                return self._fallback_to_local()
            return self._backend
        if wants_object:
            storage = _build_object_storage(config)
            if storage:
                self._backend = storage
                return self._backend
        self._backend = _build_local_storage()
        return self._backend

    def _open(self, name, mode="rb"):
        backend = self._get_backend()
        try:
            return backend.open(name, mode)
        except Exception:
            if backend is not self._backend:
                return backend.open(name, mode)
            if backend and backend.__class__.__name__ != "FileSystemStorage":
                if self._is_object_mode():
                    raise
                return self._fallback_to_local().open(name, mode)
            raise

    def _save(self, name, content):
        backend = self._get_backend()
        try:
            return backend.save(name, content)
        except Exception:
            if backend and backend.__class__.__name__ != "FileSystemStorage":
                if self._is_object_mode():
                    raise
                return self._fallback_to_local().save(name, content)
            raise

    def exists(self, name):
        backend = self._get_backend()
        try:
            return backend.exists(name)
        except Exception:
            if backend and backend.__class__.__name__ != "FileSystemStorage":
                if self._is_object_mode():
                    return False
                return self._fallback_to_local().exists(name)
            return False

    def delete(self, name):
        backend = self._get_backend()
        try:
            return backend.delete(name)
        except Exception:
            if backend and backend.__class__.__name__ != "FileSystemStorage":
                if self._is_object_mode():
                    raise
                return self._fallback_to_local().delete(name)
            raise

    def size(self, name):
        backend = self._get_backend()
        try:
            return backend.size(name)
        except Exception:
            if backend and backend.__class__.__name__ != "FileSystemStorage":
                if self._is_object_mode():
                    return 0
                return self._fallback_to_local().size(name)
            return 0

    def url(self, name):
        backend = self._get_backend()
        try:
            return backend.url(name)
        except Exception:
            if backend and backend.__class__.__name__ != "FileSystemStorage":
                if self._is_object_mode():
                    return ""
                return self._fallback_to_local().url(name)
            return ""

    def listdir(self, path):
        return self._get_backend().listdir(path)

    def get_available_name(self, name, max_length=None):
        return self._get_backend().get_available_name(name, max_length=max_length)

    def path(self, name):
        backend = self._get_backend()
        if hasattr(backend, "path"):
            return backend.path(name)
        return name

    def __getattr__(self, item):
        return getattr(self._get_backend(), item)
