from fastapi import APIRouter, File, UploadFile, Form
from app.services.face_recognition import face_service
from app.services.vector_store import faiss_index
from app.services.firebase import firebase_service
import shutil
import os

router = APIRouter()

@router.post("/")
async def search_faces(
    event_id: str = Form(...),
    file: UploadFile = File(...)
):
    temp_path = f"temp_{file.filename}"
    with open(temp_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    # Get embedding for the uploaded selfie
    faces = face_service.process_image(temp_path)
    os.remove(temp_path)

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

    return {"matches": matched_photos}
