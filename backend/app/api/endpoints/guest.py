from fastapi import APIRouter, File, UploadFile, Form, HTTPException, Depends, Request, Query
from fastapi.responses import FileResponse
from datetime import datetime, timedelta
from typing import Optional
from jose import JWTError, jwt
import secrets
import os
import time
import uuid
from collections import defaultdict
from PIL import Image, UnidentifiedImageError

from app.core.config import settings
from app.core.auth import get_current_user
from app.services.firebase import firebase_service
from app.services.storage import storage_manager
from app.services.face_recognition import face_service
from app.services.vector_store import faiss_index

router = APIRouter()

SECRET_KEY = settings.JWT_SECRET_KEY
ALGORITHM = "HS256"
GUEST_TOKEN_EXPIRE_HOURS = 72 # 3 days default short-lived grant
MAX_GUEST_SELFIE_SIZE_MB = 10

# In-memory sliding window rate limiter: max 10 searches per minute per (IP + token)
_guest_rate_limits = defaultdict(list)

def check_guest_rate_limit(client_key: str, limit: int = 10, window_seconds: int = 60):
    now = time.time()
    history = _guest_rate_limits[client_key]
    valid_history = [t for t in history if now - t < window_seconds]
    if len(valid_history) >= limit:
        raise HTTPException(
            status_code=429,
            detail=f"Rate limit exceeded. Please wait a moment before trying another search."
        )
    valid_history.append(now)
    _guest_rate_limits[client_key] = valid_history


def create_guest_token(event_id: str, token_id: str, expires_delta: Optional[timedelta] = None) -> str:
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(hours=GUEST_TOKEN_EXPIRE_HOURS)
    payload = {
        "sub": "guest",
        "scope": "guest_access",
        "event_id": event_id,
        "token_id": token_id,
        "exp": expire
    }
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


def verify_and_get_guest_event(event_id: str, token: str) -> dict:
    """
    Validates token cryptographically AND against Firestore state for real-time revocation and event scoping.
    """
    if not token:
        raise HTTPException(status_code=401, detail="Guest access token is missing.")

    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Guest access link has expired.")
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid guest access token.")

    if payload.get("scope") != "guest_access":
        raise HTTPException(status_code=403, detail="Invalid token scope.")

    if payload.get("event_id") != event_id:
        raise HTTPException(status_code=403, detail="Guest token does not match this event.")

    token_id = payload.get("token_id")
    db = firebase_service.get_db()
    if not db:
        raise HTTPException(status_code=500, detail="Database service unavailable.")

    event_doc = db.collection("events").document(event_id).get()
    if not event_doc.exists:
        raise HTTPException(status_code=404, detail="Event not found.")

    event_data = event_doc.to_dict()

    if event_data.get("guest_access_revoked", False):
        raise HTTPException(status_code=403, detail="This guest access link has been revoked by the photographer.")

    if not event_data.get("guest_access_enabled", False):
        raise HTTPException(status_code=403, detail="Guest access is currently disabled for this event.")

    if event_data.get("guest_access_token_id") != token_id:
        raise HTTPException(status_code=403, detail="This guest link is no longer active.")

    return event_data


# ---------------------------------------------------------------------------
# Photographer Management Endpoints (Requires Photographer Authentication)
# ---------------------------------------------------------------------------

@router.get("/events/{event_id}/guest-access")
async def get_guest_access_status(
    event_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Retrieve current guest access status and link for the event."""
    db = firebase_service.get_db()
    if not db:
        raise HTTPException(status_code=500, detail="Database unavailable.")

    event_doc = db.collection("events").document(event_id).get()
    if not event_doc.exists:
        raise HTTPException(status_code=404, detail="Event not found.")

    event_data = event_doc.to_dict()
    if event_data.get("photographer_id") != current_user.get("uid"):
        raise HTTPException(status_code=403, detail="Not authorized to manage this event.")

    enabled = event_data.get("guest_access_enabled", False)
    revoked = event_data.get("guest_access_revoked", False)
    jwt_token = event_data.get("guest_access_jwt")
    expires_at = event_data.get("guest_access_expires_at")

    # If enabled and active, return current token
    is_active = enabled and not revoked
    return {
        "event_id": event_id,
        "guest_access_enabled": is_active,
        "token": jwt_token if is_active else None,
        "expires_at": expires_at if is_active else None,
    }


@router.post("/events/{event_id}/guest-access/generate")
async def generate_guest_access(
    event_id: str,
    duration_hours: int = Query(72, ge=1, le=720), # 1 hour to 30 days
    current_user: dict = Depends(get_current_user)
):
    """Generate or refresh short-lived, event-scoped guest access grant."""
    db = firebase_service.get_db()
    if not db:
        raise HTTPException(status_code=500, detail="Database unavailable.")

    event_doc = db.collection("events").document(event_id).get()
    if not event_doc.exists:
        raise HTTPException(status_code=404, detail="Event not found.")

    event_data = event_doc.to_dict()
    if event_data.get("photographer_id") != current_user.get("uid"):
        raise HTTPException(status_code=403, detail="Not authorized to manage this event.")

    token_id = secrets.token_urlsafe(24)
    expires_delta = timedelta(hours=duration_hours)
    expires_at = datetime.utcnow() + expires_delta

    guest_jwt = create_guest_token(event_id, token_id, expires_delta=expires_delta)

    db.collection("events").document(event_id).update({
        "guest_access_enabled": True,
        "guest_access_revoked": False,
        "guest_access_token_id": token_id,
        "guest_access_expires_at": expires_at.isoformat(),
        "guest_access_jwt": guest_jwt
    })

    return {
        "message": "Guest QR access generated successfully.",
        "event_id": event_id,
        "token": guest_jwt,
        "expires_at": expires_at.isoformat(),
        "guest_access_enabled": True
    }


@router.post("/events/{event_id}/guest-access/revoke")
async def revoke_guest_access(
    event_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Immediately revoke all active guest access links and QR codes for this event."""
    db = firebase_service.get_db()
    if not db:
        raise HTTPException(status_code=500, detail="Database unavailable.")

    event_doc = db.collection("events").document(event_id).get()
    if not event_doc.exists:
        raise HTTPException(status_code=404, detail="Event not found.")

    event_data = event_doc.to_dict()
    if event_data.get("photographer_id") != current_user.get("uid"):
        raise HTTPException(status_code=403, detail="Not authorized to manage this event.")

    # Invalidate token_id so any existing issued JWTs fail DB verification immediately
    new_invalidation_token = secrets.token_urlsafe(24)
    db.collection("events").document(event_id).update({
        "guest_access_enabled": False,
        "guest_access_revoked": True,
        "guest_access_token_id": new_invalidation_token,
        "guest_access_jwt": None
    })

    return {
        "message": "Guest access successfully revoked. Previous links and QR codes are now inactive.",
        "event_id": event_id,
        "guest_access_enabled": False
    }


# ---------------------------------------------------------------------------
# Guest-Facing Endpoints (NO Photographer Account Required, Token Gated)
# ---------------------------------------------------------------------------

@router.get("/guest/{event_id}/info")
async def get_guest_event_info(
    event_id: str,
    token: str = Query(...)
):
    """
    Returns public event metadata for authorized guests.
    Does NOT leak private gallery photos or photographer details.
    """
    event_data = verify_and_get_guest_event(event_id, token)

    return {
        "event_id": event_id,
        "event_name": event_data.get("name") or event_data.get("event_name") or "Event",
        "client_name": event_data.get("client_name"),
        "date": event_data.get("date"),
        "expires_at": event_data.get("guest_access_expires_at")
    }


@router.post("/guest/{event_id}/search")
async def guest_biometric_search(
    request: Request,
    event_id: str,
    token: str = Form(...),
    consent: bool = Form(...),
    file: UploadFile = File(...)
):
    """
    Consented facial recognition photo search for guests.
    - Requires explicit user consent before processing.
    - Reference selfie is discarded immediately in memory (zero persistent storage).
    - Results are strictly scoped to photos belonging to this specific event_id.
    """
    # 1. Verify guest authorization grant
    verify_and_get_guest_event(event_id, token)

    # 2. Strict biometric consent check
    if not consent:
        raise HTTPException(
            status_code=400,
            detail="Biometric consent is required before analyzing your selfie."
        )

    # 3. Rate limiting by IP and guest token
    client_ip = request.client.host if request.client else "unknown"
    rate_key = f"{client_ip}_{token[:16]}"
    check_guest_rate_limit(rate_key, limit=10, window_seconds=60)

    # 4. Validate file format and size
    filename = file.filename or "selfie.jpg"
    ext_lower = os.path.splitext(filename)[1].lower()
    allowed_types = ["image/jpeg", "image/png", "image/jpg", "image/pjpeg"]
    content_type = file.content_type.lower() if file.content_type else ""

    if content_type not in allowed_types and ext_lower not in [".jpg", ".jpeg", ".png"]:
        raise HTTPException(status_code=400, detail="Only JPEG and PNG selfies are supported.")

    temp_dir = getattr(settings, "TEMP_UPLOAD_PATH", "temp_uploads")
    if not os.path.isabs(temp_dir):
        backend_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
        temp_dir = os.path.join(backend_dir, temp_dir)
    os.makedirs(temp_dir, exist_ok=True)

    temp_path = os.path.join(temp_dir, f"guest_selfie_{uuid.uuid4()}.tmp")
    max_bytes = MAX_GUEST_SELFIE_SIZE_MB * 1024 * 1024
    total_bytes = 0

    try:
        with open(temp_path, "wb") as buffer:
            chunk_size = 1024 * 1024
            while True:
                chunk = await file.read(chunk_size)
                if not chunk:
                    break
                total_bytes += len(chunk)
                if total_bytes > max_bytes:
                    buffer.close()
                    raise HTTPException(
                        status_code=413,
                        detail=f"Selfie exceeds maximum allowed size of {MAX_GUEST_SELFIE_SIZE_MB} MB."
                    )
                buffer.write(chunk)

        if total_bytes == 0:
            raise HTTPException(status_code=400, detail="Uploaded selfie file is empty.")

        # Validate image integrity
        try:
            with Image.open(temp_path) as img:
                img.verify()
        except Exception:
            raise HTTPException(status_code=400, detail="Invalid image file structure.")

        # 5. Extract facial embedding using OpenCV YuNet + SFace
        faces = face_service.process_image(temp_path)
        if not faces:
            raise HTTPException(
                status_code=400,
                detail="No face detected in your selfie. Please ensure good lighting and face the camera directly."
            )

        query_embedding = faces[0]["embedding"]

        # 6. Scoped FAISS search: strictly filter for this event
        raw_matches = faiss_index.search(query_embedding, k=50)

        db = firebase_service.get_db()
        matched_photos = []
        seen_photo_ids = set()

        if db and raw_matches:
            for match in raw_matches:
                face_uid = match["face_id"]
                dist = match.get("distance", 0.0)
                if dist > 1.2:
                    continue

                face_doc = db.collection("faces").document(face_uid).get()
                if not face_doc.exists:
                    continue

                face_data = face_doc.to_dict()
                # Strict event scoping check: discard any face not in this event!
                if face_data.get("event_id") != event_id:
                    continue

                photo_id = face_data.get("photo_id")
                if not photo_id or photo_id in seen_photo_ids:
                    continue

                seen_photo_ids.add(photo_id)

                photo_doc = db.collection("images").document(photo_id).get()
                photo_name = photo_doc.to_dict().get("filename", "Photo") if photo_doc.exists else "Photo"

                matched_photos.append({
                    "photo_id": photo_id,
                    "filename": photo_name,
                    "match_score": round(max(0.0, 1.0 - (dist / 2.0)), 3),
                    "photo_url": f"/api/guest/{event_id}/photo/{photo_id}?token={token}"
                })

        return {
            "status": "success",
            "message": f"Found {len(matched_photos)} matching photo(s).",
            "count": len(matched_photos),
            "results": matched_photos
        }

    finally:
        # Guarantee immediate deletion of the reference selfie from local disk
        if os.path.exists(temp_path):
            try:
                os.remove(temp_path)
            except Exception:
                pass


@router.get("/guest/{event_id}/photo/{photo_id}")
async def get_guest_authorized_photo(
    event_id: str,
    photo_id: str,
    token: str = Query(...)
):
    """
    Streams an event photo to an authorized guest.
    Verifies that the photo belongs to the event before streaming.
    """
    # 1. Verify guest token for this event
    verify_and_get_guest_event(event_id, token)

    # 2. Verify photo belongs to this event
    db = firebase_service.get_db()
    if not db:
        raise HTTPException(status_code=500, detail="Database unavailable.")

    photo_doc = db.collection("images").document(photo_id).get()
    if not photo_doc.exists:
        raise HTTPException(status_code=404, detail="Photo not found.")

    photo_data = photo_doc.to_dict()
    if photo_data.get("event_id") != event_id:
        raise HTTPException(status_code=403, detail="Photo does not belong to this event.")

    # 3. Retrieve photo from storage
    provider_name = photo_data.get("storage_provider", "local")
    drive_file_id = photo_data.get("drive_file_id")

    provider = storage_manager.get_provider(provider_name)
    file_path = provider.get_file_path(drive_file_id)

    if not file_path or not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="Photo file not found on storage server.")

    # Determine media type
    ext = os.path.splitext(file_path)[1].lower()
    media_type = "image/png" if ext == ".png" else "image/jpeg"

    return FileResponse(file_path, media_type=media_type)
