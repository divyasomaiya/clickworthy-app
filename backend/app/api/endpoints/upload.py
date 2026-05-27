from fastapi import APIRouter, File, UploadFile, Form, BackgroundTasks
from app.services.google_drive import drive_service
from app.services.firebase import firebase_service
from app.services.face_recognition import face_service
from app.services.vector_store import faiss_index
import shutil
import os
import uuid

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
    folder_id: str = Form(...),
    file: UploadFile = File(...)
):
    # Save file temporarily
    temp_dir = "temp_uploads"
    os.makedirs(temp_dir, exist_ok=True)
    temp_path = os.path.join(temp_dir, file.filename)

    with open(temp_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    # Upload to Google Drive
    drive_file_id = drive_service.upload_file(temp_path, file.content_type, folder_id)
    photo_id = str(uuid.uuid4())

    # Save image metadata to Firestore
    db = firebase_service.get_db()
    if db:
        db.collection("images").document(photo_id).set({
            "event_id": event_id,
            "drive_file_id": drive_file_id,
            "filename": file.filename
        })

    # Trigger background AI processing
    background_tasks.add_task(process_and_index_image, temp_path, event_id, photo_id)

    return {"message": "Upload started", "photo_id": photo_id, "drive_file_id": drive_file_id}
