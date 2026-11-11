from fastapi import APIRouter, File, UploadFile, Form
from app.services.face_recognition import face_service
from app.services.vector_store import faiss_index
from app.services.firebase import firebase_service
import shutil
import os

router = APIRouter()

import uuid

from app.core.auth import get_current_user
from fastapi import Depends, HTTPException

from datetime import datetime
from app.core.auth import get_current_user
from fastapi import Depends

@router.post("/")
async def search_faces(
    event_id: str = Form(...),
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user)
):
    db = firebase_service.get_db()
    if not db:
        raise HTTPException(status_code=500, detail="Database not connected")

    event_doc = db.collection("events").document(event_id).get()
    if not event_doc.exists:
        raise HTTPException(status_code=404, detail="Event not found")

    event_data = event_doc.to_dict()

    # Event authorization and expiry check
    expiry = event_data.get("expiry_date")
    if expiry and datetime.fromisoformat(expiry) < datetime.now():
        raise HTTPException(status_code=403, detail="Event has expired")

    is_private = event_data.get("is_private", True)
    if is_private:
        if not current_user or event_data.get("photographer_id") != current_user.get("uid"):
            raise HTTPException(status_code=403, detail="Not authorized to search this private event.")

    temp_dir = "temp_search"
    os.makedirs(temp_dir, exist_ok=True)
    temp_path = os.path.join(temp_dir, f"{uuid.uuid4()}.tmp")

    with open(temp_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    # Get embedding for the uploaded selfie using OpenCV YuNet + SFace
    try:
        faces = face_service.process_image(temp_path)
    finally:
        if os.path.exists(temp_path):
            os.remove(temp_path)

    if not faces:
        return {"matches": [], "message": "No face found in selfie"}

    # Use the highest confidence face if multiple exist
    # sort by det_score descending
    faces = sorted(faces, key=lambda x: x["det_score"], reverse=True)
    query_embedding = faces[0]["embedding"]

    # Search vector store for nearest neighbors
    results = faiss_index.search(query_embedding, k=100)

    # Filter matches by event_id and distance threshold
    db = firebase_service.get_db()
    matched_photos = []
    seen_photos = set()

    if db:
        for res in results:
            # Tunable threshold. For SFace cosine distance equivalent, we want matches close to each other.
            # We normalized earlier, L2 squared dist on unit vectors = 2 - 2*cosine_sim.
            # A threshold of 1.0 means cosine sim of 0.5. Let's use 1.0 for now.
            if res["distance"] > 1.0:
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

    return {"matches": matched_photos}
