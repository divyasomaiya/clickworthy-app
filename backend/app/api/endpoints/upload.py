from fastapi import APIRouter, File, UploadFile, Form, BackgroundTasks, HTTPException, Depends
from app.services.storage import storage_provider
from app.services.firebase import firebase_service
from app.services.face_recognition import face_service
from app.services.vector_store import faiss_index
from app.core.auth import get_current_user
import shutil
import os
import uuid
from PIL import Image, UnidentifiedImageError

router = APIRouter()

def process_and_index_image(file_path: str, event_id: str, photo_id: str):
    # 1. Detect faces and get embeddings
    try:
        faces = face_service.process_image(file_path)
    except Exception as e:
        print(f"Error processing image {photo_id}: {e}")
        return

    # 2. Add embeddings to FAISS and metadata to Firestore
    db = firebase_service.get_db()
    for i, face in enumerate(faces):
        face_uid = f"{photo_id}_face_{i}"

        # Add to vector store
        faiss_index.add_embedding(face["embedding"], face_uid)

        # Save metadata
        if db:
            db.collection("faces").document(face_uid).set({
                "photo_id": photo_id,
                "event_id": event_id,
                "bbox": face["bbox"],
                "det_score": face["det_score"]
            })

    # Cleanup temp file
    if os.path.exists(file_path):
        os.remove(file_path)


@router.post("/")
async def upload_photos(
    background_tasks: BackgroundTasks,
    event_id: str = Form(...),
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user)
):
    # Check authorization for the event
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

    # Validate file type
    if file.content_type not in ["image/jpeg", "image/png"]:
        raise HTTPException(status_code=400, detail="Invalid file type")

    # Save file temporarily using a secure UUID instead of filename to prevent path traversal
    temp_dir = "temp_uploads"
    os.makedirs(temp_dir, exist_ok=True)
    temp_filename = f"{uuid.uuid4()}.tmp"
    temp_path = os.path.join(temp_dir, temp_filename)

    with open(temp_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    # Check file size (e.g. max 10MB)
    if os.path.getsize(temp_path) > 10 * 1024 * 1024:
        os.remove(temp_path)
        raise HTTPException(status_code=400, detail="File too large")

    # Validate actual image contents using Pillow
    try:
        with Image.open(temp_path) as img:
            img.verify() # Verify that it is, in fact, an image
    except UnidentifiedImageError:
        os.remove(temp_path)
        raise HTTPException(status_code=400, detail="Uploaded file is not a valid image")

    # Upload using storage provider (Google Drive or Local)
    drive_file_id = storage_provider.save_file(temp_path, file.content_type, folder_id, owner_id=current_user.get("uid"))
    photo_id = str(uuid.uuid4())

    # Save image metadata to Firestore
    if db:
        db.collection("images").document(photo_id).set({
            "event_id": event_id,
            "drive_file_id": drive_file_id, # Can rename to file_id later
            "filename": file.filename
        })

    # Trigger background AI processing disabled until real model is integrated
    # background_tasks.add_task(process_and_index_image, temp_path, event_id, photo_id)

    # Cleanup temp path here since background task is disabled
    if os.path.exists(temp_path):
        os.remove(temp_path)

    return {"message": "Upload started", "photo_id": photo_id, "drive_file_id": drive_file_id}
