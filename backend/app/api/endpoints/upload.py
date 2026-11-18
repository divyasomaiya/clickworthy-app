from fastapi import APIRouter, File, UploadFile, Form, BackgroundTasks, HTTPException, Depends
from app.services.storage import storage_manager
from app.services.firebase import firebase_service
from app.services.face_recognition import face_service
from app.services.vector_store import faiss_index
from app.core.auth import get_current_user
from app.core.config import settings
import os
import uuid
from PIL import Image, UnidentifiedImageError

router = APIRouter()

# Allow large DSLR images up to 150 megapixels without decompression bomb error
Image.MAX_IMAGE_PIXELS = 150_000_000

def process_and_index_image(file_path: str, event_id: str, photo_id: str):
    """Background task to detect faces and store embeddings in FAISS."""
    db = firebase_service.get_db()
    try:
        faces = face_service.process_image(file_path)
        for i, face in enumerate(faces):
            face_uid = f"{photo_id}_face_{i}"
            faiss_index.add_embedding(face["embedding"], face_uid)
            if db:
                db.collection("faces").document(face_uid).set({
                    "photo_id": photo_id,
                    "event_id": event_id,
                    "bbox": face["bbox"],
                    "det_score": face["det_score"]
                })
        if db:
            try:
                db.collection("images").document(photo_id).update({
                    "indexing_status": "completed",
                    "faces_detected": len(faces)
                })
            except Exception:
                pass
    except Exception as e:
        print(f"Background AI indexing warning for photo {photo_id}: {e}")
        if db:
            try:
                db.collection("images").document(photo_id).update({
                    "indexing_status": "failed",
                    "indexing_error": str(e)
                })
            except Exception:
                pass
    finally:
        # Guarantee cleanup of temporary working file
        if os.path.exists(file_path):
            try:
                os.remove(file_path)
            except Exception:
                pass


@router.post("/")
async def upload_photos(
    background_tasks: BackgroundTasks,
    event_id: str = Form(...),
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user)
):
    # 1. Check authorization for the event
    db = firebase_service.get_db()
    event_data = None
    if db:
        event = db.collection('events').document(event_id).get()
        if not event.exists:
            raise HTTPException(status_code=404, detail="Event not found")
        event_data = event.to_dict()
        if event_data.get("photographer_id") != current_user.get("uid"):
            raise HTTPException(status_code=403, detail="Not authorized to upload to this event")

    folder_id = event_data.get("drive_folders", {}).get("event_folder_id", f"local_folder_{event_id}") if event_data else f"local_folder_{event_id}"

    # 2. Validate declared MIME type or file extension
    allowed_content_types = ["image/jpeg", "image/png", "image/jpg", "image/pjpeg"]
    content_type = file.content_type.lower() if file.content_type else ""
    filename = file.filename or "unknown.jpg"
    ext_lower = os.path.splitext(filename)[1].lower()

    if content_type not in allowed_content_types and ext_lower not in [".jpg", ".jpeg", ".png"]:
        raise HTTPException(
            status_code=400,
            detail="Invalid file format. Only JPEG and PNG images are supported."
        )

    # Standardize content type
    if ext_lower == ".png" or content_type == "image/png":
        normalized_content_type = "image/png"
    else:
        normalized_content_type = "image/jpeg"

    # 3. Setup temporary storage path anchored to absolute directory
    max_mb = getattr(settings, "MAX_UPLOAD_SIZE_MB", 50)
    max_bytes = max_mb * 1024 * 1024

    temp_dir = getattr(settings, "TEMP_UPLOAD_PATH", "temp_uploads")
    if not os.path.isabs(temp_dir):
        backend_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
        temp_dir = os.path.join(backend_dir, temp_dir)
    os.makedirs(temp_dir, exist_ok=True)

    temp_filename = f"{uuid.uuid4()}.tmp"
    temp_path = os.path.join(temp_dir, temp_filename)

    # 4. Stream upload with bounded chunking to prevent memory bloat and reject oversized files early
    total_bytes = 0
    try:
        with open(temp_path, "wb") as buffer:
            chunk_size = 1024 * 1024  # 1 MB chunk
            while True:
                chunk = await file.read(chunk_size)
                if not chunk:
                    break
                total_bytes += len(chunk)
                if total_bytes > max_bytes:
                    buffer.close()
                    if os.path.exists(temp_path):
                        os.remove(temp_path)
                    raise HTTPException(
                        status_code=413,
                        detail=f"File exceeds maximum allowed size of {max_mb} MB"
                    )
                buffer.write(chunk)
    except HTTPException:
        raise
    except Exception as stream_err:
        if os.path.exists(temp_path):
            os.remove(temp_path)
        raise HTTPException(status_code=500, detail=f"Failed to stream upload: {stream_err}")

    if total_bytes == 0:
        if os.path.exists(temp_path):
            os.remove(temp_path)
        raise HTTPException(status_code=400, detail="Uploaded file is empty.")

    # 5. Validate actual image integrity using Pillow (reads header/structure)
    try:
        with Image.open(temp_path) as img:
            img.verify()
            if img.format not in ["JPEG", "PNG"]:
                if os.path.exists(temp_path):
                    os.remove(temp_path)
                raise HTTPException(
                    status_code=400,
                    detail=f"Uploaded file claims to be an image but is format '{img.format}'. Only JPEG and PNG are supported."
                )
    except UnidentifiedImageError:
        if os.path.exists(temp_path):
            os.remove(temp_path)
        raise HTTPException(status_code=400, detail="Uploaded file is corrupted or not a valid image.")
    except Exception as verify_err:
        if isinstance(verify_err, HTTPException):
            raise
        if os.path.exists(temp_path):
            os.remove(temp_path)
        raise HTTPException(status_code=400, detail=f"Image validation failed: {verify_err}")

    # 6. Save original untouched, uncompressed photo via storage provider
    storage_provider_name = event_data.get("storage_provider", "local") if event_data else "local"
    try:
        storage_provider = storage_manager.get_provider(storage_provider_name)
        drive_file_id = storage_provider.save_file(
            temp_path,
            normalized_content_type,
            folder_id,
            owner_id=current_user.get("uid")
        )
    except Exception as store_err:
        if os.path.exists(temp_path):
            os.remove(temp_path)
        raise HTTPException(status_code=500, detail=f"Failed to store photo: {store_err}")

    photo_id = str(uuid.uuid4())

    # 7. Save photo record in Firestore
    if db:
        try:
            db.collection("images").document(photo_id).set({
                "event_id": event_id,
                "drive_file_id": drive_file_id,
                "storage_provider": storage_provider_name,
                "filename": filename,
                "size_bytes": total_bytes,
                "indexing_status": "processing",
                "faces_detected": 0
            })
        except Exception as db_err:
            try:
                storage_provider.delete_file(drive_file_id, owner_id=current_user.get("uid"))
            except Exception:
                pass
            if os.path.exists(temp_path):
                os.remove(temp_path)
            raise HTTPException(
                status_code=500,
                detail=f"Failed to record photo metadata in database: {db_err}"
            )

    # 8. Trigger background AI face indexing on the temp file (process_and_index_image cleans it up)
    background_tasks.add_task(process_and_index_image, temp_path, event_id, photo_id)

    return {
        "status": "success",
        "message": "Upload successful. Photo stored and queued for AI indexing.",
        "photo_id": photo_id,
        "drive_file_id": drive_file_id,
        "size_bytes": total_bytes,
        "indexing_status": "processing"
    }
