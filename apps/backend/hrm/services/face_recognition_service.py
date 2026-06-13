import base64
import hashlib
import io
import json
import math
import threading
from dataclasses import dataclass
from typing import Iterable, List

from cryptography.fernet import Fernet, InvalidToken
from django.conf import settings
from PIL import Image, ImageOps

try:
    import cv2
    import numpy as np
    import onnxruntime as ort
    from insightface.app import FaceAnalysis
except Exception:  # pragma: no cover - optional runtime dependency
    cv2 = None
    np = None
    ort = None
    FaceAnalysis = None


class FaceRecognitionUnavailable(RuntimeError):
    pass


class FaceRecognitionValidationError(ValueError):
    pass


@dataclass
class FaceVerificationResult:
    matched: bool
    score: float
    threshold: float
    embedding: List[float]


_FACE_APP = None
_FACE_APP_ERROR = None
_FACE_APP_LOCK = threading.Lock()
_MAX_IMAGE_DIMENSION = 1024


def _get_fernet() -> Fernet:
    digest = hashlib.sha256(str(settings.SECRET_KEY).encode("utf-8")).digest()
    return Fernet(base64.urlsafe_b64encode(digest))


def _ensure_libraries():
    if FaceAnalysis is None or np is None or cv2 is None or ort is None:
        raise FaceRecognitionUnavailable("insightface_runtime_unavailable")


def _get_face_app():
    global _FACE_APP, _FACE_APP_ERROR
    if _FACE_APP is not None:
        return _FACE_APP
    if _FACE_APP_ERROR is not None:
        raise FaceRecognitionUnavailable(_FACE_APP_ERROR)
    with _FACE_APP_LOCK:
        if _FACE_APP is not None:
            return _FACE_APP
        if _FACE_APP_ERROR is not None:
            raise FaceRecognitionUnavailable(_FACE_APP_ERROR)
        try:
            _ensure_libraries()
            # Load once and keep shared for all requests.
            app = FaceAnalysis(
                name="buffalo_l",
                providers=["CPUExecutionProvider"],
                provider_options=[{}],
            )
            app.prepare(ctx_id=0, det_size=(640, 640))
            _FACE_APP = app
            return _FACE_APP
        except Exception as exc:  # pragma: no cover - environment specific
            _FACE_APP_ERROR = f"insightface_init_failed: {exc}"
            raise FaceRecognitionUnavailable(_FACE_APP_ERROR) from exc


def _normalize_vector(vector: Iterable[float]) -> List[float]:
    return [float(value) for value in vector]


def _normalize_embedding(vector: Iterable[float]) -> List[float]:
    values = _normalize_vector(vector)
    norm = math.sqrt(sum(value * value for value in values))
    if norm <= 0:
        raise FaceRecognitionValidationError("no_face_detected")
    return [value / norm for value in values]


def _load_image(image_file):
    try:
        image_file.seek(0)
        image = Image.open(image_file)
        image = ImageOps.exif_transpose(image).convert("RGB")
        image.thumbnail((_MAX_IMAGE_DIMENSION, _MAX_IMAGE_DIMENSION))
        return image
    except Exception as exc:  # pragma: no cover - invalid user upload
        raise FaceRecognitionValidationError("invalid_image_file") from exc


def _pil_to_bgr(image) -> "np.ndarray":
    rgb_array = np.array(image, dtype=np.uint8)
    return cv2.cvtColor(rgb_array, cv2.COLOR_RGB2BGR)


def _face_area(face) -> float:
    bbox = getattr(face, "bbox", None)
    if bbox is None or len(bbox) < 4:
        return 0.0
    width = max(0.0, float(bbox[2]) - float(bbox[0]))
    height = max(0.0, float(bbox[3]) - float(bbox[1]))
    return width * height


def detect_face(image_file) -> dict:
    app = _get_face_app()
    image = _load_image(image_file)
    bgr_image = _pil_to_bgr(image)
    faces = app.get(bgr_image) or []
    if not faces:
        return {
            "face_detected": False,
            "face_count": 0,
            "warning": "",
            "selected_face": None,
            "image_array": bgr_image,
        }
    selected_face = max(faces, key=_face_area)
    warning = "multiple_faces_detected_largest_used" if len(faces) > 1 else ""
    return {
        "face_detected": True,
        "face_count": len(faces),
        "warning": warning,
        "selected_face": selected_face,
        "image_array": bgr_image,
    }


def generate_embedding(image_file) -> List[float]:
    detected = detect_face(image_file)
    if not detected["face_detected"] or detected["selected_face"] is None:
        raise FaceRecognitionValidationError("no_face_detected")
    embedding = getattr(detected["selected_face"], "embedding", None)
    if embedding is None:
        raise FaceRecognitionValidationError("no_face_detected")
    return _normalize_embedding(embedding)


def encrypt_embeddings(embeddings: Iterable[Iterable[float]]) -> str:
    payload = json.dumps([_normalize_vector(row) for row in embeddings], separators=(",", ":")).encode("utf-8")
    return _get_fernet().encrypt(payload).decode("utf-8")


def decrypt_embeddings(payload: str) -> List[List[float]]:
    if not payload:
        return []
    try:
        raw = _get_fernet().decrypt(str(payload).encode("utf-8"))
    except InvalidToken as exc:
        raise FaceRecognitionValidationError("stored_face_embedding_invalid") from exc
    decoded = json.loads(raw.decode("utf-8"))
    return [_normalize_vector(row) for row in decoded if isinstance(row, (list, tuple))]


def compare_embeddings(saved_embedding, new_embedding) -> float:
    saved = list(saved_embedding or [])
    new = [float(value) for value in (new_embedding or [])]
    if saved and isinstance(saved[0], (list, tuple)):
        length = len(saved[0])
        if not length:
            return 0.0
        saved = [
            sum(float(row[index]) for row in saved) / float(len(saved))
            for index in range(length)
        ]
    else:
        saved = [float(value) for value in saved]
    if not saved or not new or len(saved) != len(new):
        return 0.0
    saved = _normalize_embedding(saved)
    new = _normalize_embedding(new)
    cosine_similarity = float(sum(left * right for left, right in zip(saved, new)))
    return max(0.0, min(1.0, cosine_similarity))


def verify_employee_face(employee_face_profile, image_file, *, min_score: float = 0.90) -> FaceVerificationResult:
    embeddings = decrypt_embeddings(getattr(employee_face_profile, "face_embedding", ""))
    if not embeddings:
        raise FaceRecognitionValidationError("employee_face_enrollment_missing")
    new_embedding = generate_embedding(image_file)
    score = compare_embeddings(embeddings, new_embedding)
    return FaceVerificationResult(
        matched=score >= float(min_score or 0.90),
        score=score,
        threshold=float(min_score or 0.90),
        embedding=new_embedding,
    )


def compress_uploaded_photo(uploaded_file, *, quality: int = 82):
    uploaded_file.seek(0)
    image = Image.open(uploaded_file)
    image = ImageOps.exif_transpose(image).convert("RGB")
    image.thumbnail((1600, 1600))
    buffer = io.BytesIO()
    image.save(buffer, format="JPEG", quality=quality, optimize=True)
    buffer.seek(0)
    return buffer
