from fastapi import APIRouter, File, UploadFile, Form
from app.services.face_recognition import face_service
from app.services.vector_store import faiss_index
from app.services.firebase import firebase_service
import shutil
import os

router = APIRouter()

import uuid

@router.post("/")
async def search_faces(
    event_id: str = Form(...),
    file: UploadFile = File(...)
):
    # Fix path traversal vulnerability
    temp_dir = "temp_search"
    os.makedirs(temp_dir, exist_ok=True)
    temp_path = os.path.join(temp_dir, f"{uuid.uuid4()}.tmp")

    with open(temp_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    # Note: For PR 1 we bypass fake AI search. We just return all images for the event for testing.
    # In a real app we'd get embeddings and search FAISS.

    os.remove(temp_path)

    db = firebase_service.get_db()
    if not db:
        return {"matches": [], "message": "Database not connected"}

    # Return all images for the event (disabling fake AI for PR 1)
    images_ref = db.collection("images").where("event_id", "==", event_id).get()

    matched_photos = []
    for doc in images_ref:
        data = doc.to_dict()
        matched_photos.append({
            "photo_id": doc.id,
            "drive_file_id": data.get("drive_file_id"),
            "distance": 0.0
        })

    return {"matches": matched_photos}

    if not faces:
        return {"matches": [], "message": "No face found in selfie"}

    # Assuming one face in selfie, use the first one with highest confidence
    query_embedding = faces[0]["embedding"]

    # Search vector store
    results = faiss_index.search(query_embedding, k=10)

    # Filter matches by event_id and distance threshold
    db = firebase_service.get_db()
    matched_photos = []
    seen_photos = set()

    if db:
        for res in results:
            # lower distance is better in L2
            if res["distance"] > 1.2: # Tunable threshold
                continue

            face_doc = db.collection("faces").document(res["face_id"]).get()
            if face_doc.exists:
                face_data = face_doc.to_dict()
                if face_data.get("event_id") == event_id:
                    photo_id = face_data.get("photo_id")
                    if photo_id not in seen_photos:
                        seen_photos.add(photo_id)

                        # Get photo metadata
                        photo_doc = db.collection("images").document(photo_id).get()
                        if photo_doc.exists:
                            photo_data = photo_doc.to_dict()
                            matched_photos.append({
                                "photo_id": photo_id,
                                "drive_file_id": photo_data.get("drive_file_id"),
                                "distance": res["distance"]
                            })
    else:
        # Fallback for offline testing when Firebase is not configured
        for res in results:
            if res["distance"] > 1.2:
                continue
            face_id = res["face_id"]
            if "_face_" in face_id:
                photo_id = face_id.split("_face_")[0]
                if photo_id not in seen_photos:
                    seen_photos.add(photo_id)
                    matched_photos.append({
                        "photo_id": photo_id,
                        "drive_file_id": "mock_drive_file_id",
                        "distance": res["distance"]
                    })

    return {"matches": matched_photos}
