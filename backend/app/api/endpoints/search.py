from fastapi import APIRouter, File, UploadFile, Form, Depends, HTTPException
from app.services.face_recognition import face_service
from app.services.vector_store import faiss_index
from app.services.firebase import firebase_service
from app.core.auth import get_current_user
from datetime import datetime
from typing import Optional
import os
import uuid
import shutil

router = APIRouter()

DISTANCE_THRESHOLD = 1.05  # SFace normalized L2 equivalent to cosine similarity ~0.45-0.50

@router.post("/")
async def search_faces(
    event_id: str = Form(...),
    file: UploadFile = File(...),
    file_b: Optional[UploadFile] = File(None),
    mode: str = Form("single"),  # "single" | "together" | "either"
    current_user: dict = Depends(get_current_user)
):
    """
    Search event photos by face embeddings.
    Supports:
    - 'single': Matches single person from 'file'.
    - 'together': Requires two DISTINCT detected faces in the event photo to match Person A and Person B.
    - 'either': Matches photos containing either Person A OR Person B.
    Reference faces can be supplied via a single photo with >=2 faces, or via 'file' (Person A) and 'file_b' (Person B).
    """
    db = firebase_service.get_db()
    if not db:
        raise HTTPException(status_code=500, detail="Database not connected")

    # 1. Authorize event access and check expiry
    event_doc = db.collection("events").document(event_id).get()
    if not event_doc.exists:
        raise HTTPException(status_code=404, detail="Event not found")

    event_data = event_doc.to_dict()
    expiry = event_data.get("expiry_date")
    if expiry and datetime.fromisoformat(expiry) < datetime.now():
        raise HTTPException(status_code=403, detail="Event has expired")

    is_private = event_data.get("is_private", True)
    if is_private:
        if not current_user or event_data.get("photographer_id") != current_user.get("uid"):
            raise HTTPException(status_code=403, detail="Not authorized to search this private event.")

    temp_dir = os.path.abspath(os.environ.get("TEMP_UPLOAD_PATH", "temp_search"))
    os.makedirs(temp_dir, exist_ok=True)

    temp_paths = []

    try:
        # Save primary file
        temp_path_a = os.path.join(temp_dir, f"{uuid.uuid4()}_a.tmp")
        with open(temp_path_a, "wb") as buf:
            shutil.copyfileobj(file.file, buf)
        temp_paths.append(temp_path_a)

        faces_a = face_service.process_image(temp_path_a)

        # Handle reference extraction based on mode and inputs
        person_a_embedding = None
        person_b_embedding = None

        if mode in ["together", "either"]:
            if file_b:
                # Two separate reference photos provided
                temp_path_b = os.path.join(temp_dir, f"{uuid.uuid4()}_b.tmp")
                with open(temp_path_b, "wb") as buf:
                    shutil.copyfileobj(file_b.file, buf)
                temp_paths.append(temp_path_b)

                faces_b = face_service.process_image(temp_path_b)

                if not faces_a:
                    return {"matches": [], "message": "No face found in Person A's photo."}
                if not faces_b:
                    return {"matches": [], "message": "No face found in Person B's photo."}

                # Sort by detection score
                faces_a = sorted(faces_a, key=lambda x: x["det_score"], reverse=True)
                faces_b = sorted(faces_b, key=lambda x: x["det_score"], reverse=True)
                person_a_embedding = faces_a[0]["embedding"]
                person_b_embedding = faces_b[0]["embedding"]
            else:
                # Single photo provided containing both people
                if not faces_a:
                    return {"matches": [], "message": "No face detected in reference photo."}
                if len(faces_a) < 2:
                    return {
                        "matches": [],
                        "message": (
                            "Only 1 face was detected in this photo. For duo search ('Find Us Together'), "
                            "please upload a photo clearly showing both people, or use the 'Two Photos' option."
                        )
                    }

                # Sort by detection score and pick the two highest confidence distinct faces
                faces_sorted = sorted(faces_a, key=lambda x: x["det_score"], reverse=True)
                person_a_embedding = faces_sorted[0]["embedding"]
                person_b_embedding = faces_sorted[1]["embedding"]
        else:
            # Single person mode
            if not faces_a:
                return {"matches": [], "message": "No face found in selfie."}
            faces_sorted = sorted(faces_a, key=lambda x: x["det_score"], reverse=True)
            person_a_embedding = faces_sorted[0]["embedding"]

    finally:
        # Strictly clean up reference selfie files — never retain biometric reference photos
        for p in temp_paths:
            if os.path.exists(p):
                try:
                    os.remove(p)
                except Exception:
                    pass

    # 2. Query FAISS index
    if mode in ["together", "either"] and person_b_embedding is not None:
        raw_results_a = faiss_index.search(person_a_embedding, k=100)
        raw_results_b = faiss_index.search(person_b_embedding, k=100)

        results_a_filtered = [r for r in raw_results_a if r["distance"] <= DISTANCE_THRESHOLD]
        results_b_filtered = [r for r in raw_results_b if r["distance"] <= DISTANCE_THRESHOLD]

        # Map event photos
        photo_matches = {}  # photo_id -> { "faces_a": {face_id: dist}, "faces_b": {face_id: dist} }

        for r in results_a_filtered:
            face_doc = db.collection("faces").document(r["face_id"]).get()
            if face_doc.exists:
                data = face_doc.to_dict()
                if data.get("event_id") == event_id:
                    pid = data.get("photo_id")
                    if pid not in photo_matches:
                        photo_matches[pid] = {"faces_a": {}, "faces_b": {}}
                    photo_matches[pid]["faces_a"][r["face_id"]] = r["distance"]

        for r in results_b_filtered:
            face_doc = db.collection("faces").document(r["face_id"]).get()
            if face_doc.exists:
                data = face_doc.to_dict()
                if data.get("event_id") == event_id:
                    pid = data.get("photo_id")
                    if pid not in photo_matches:
                        photo_matches[pid] = {"faces_a": {}, "faces_b": {}}
                    photo_matches[pid]["faces_b"][r["face_id"]] = r["distance"]

        matched_photos = []

        for pid, match_info in photo_matches.items():
            faces_a_dict = match_info["faces_a"]
            faces_b_dict = match_info["faces_b"]

            if mode == "together":
                # For "Together", both people must appear in the photo AND match DISTINCT detected faces
                if not faces_a_dict or not faces_b_dict:
                    continue

                # Ensure there exists at least one pair (fa, fb) where fa != fb
                distinct_match_found = False
                best_combined_dist = 999.0

                for fa, dist_a in faces_a_dict.items():
                    for fb, dist_b in faces_b_dict.items():
                        if fa != fb:  # Two distinct detected faces in this event photo!
                            distinct_match_found = True
                            comb = (dist_a + dist_b) / 2.0
                            if comb < best_combined_dist:
                                best_combined_dist = comb

                if distinct_match_found:
                    photo_doc = db.collection("images").document(pid).get()
                    if photo_doc.exists:
                        pdata = photo_doc.to_dict()
                        matched_photos.append({
                            "photo_id": pid,
                            "drive_file_id": pdata.get("drive_file_id"),
                            "distance": best_combined_dist,
                            "match_type": "together"
                        })

            elif mode == "either":
                # For "Either", match if Person A or Person B is present
                min_dist = 999.0
                for d in list(faces_a_dict.values()) + list(faces_b_dict.values()):
                    if d < min_dist:
                        min_dist = d

                if faces_a_dict or faces_b_dict:
                    photo_doc = db.collection("images").document(pid).get()
                    if photo_doc.exists:
                        pdata = photo_doc.to_dict()
                        matched_photos.append({
                            "photo_id": pid,
                            "drive_file_id": pdata.get("drive_file_id"),
                            "distance": min_dist,
                            "match_type": "either"
                        })

        matched_photos.sort(key=lambda x: x["distance"])
        return {"matches": matched_photos, "mode": mode}

    else:
        # Standard single-person search
        raw_results = faiss_index.search(person_a_embedding, k=100)
        matched_photos = []
        seen_photos = set()

        for res in raw_results:
            if res["distance"] > DISTANCE_THRESHOLD:
                continue

            face_doc = db.collection("faces").document(res["face_id"]).get()
            if face_doc.exists:
                face_data = face_doc.to_dict()
                if face_data.get("event_id") == event_id:
                    photo_id = face_data.get("photo_id")
                    if photo_id not in seen_photos:
                        seen_photos.add(photo_id)
                        photo_doc = db.collection("images").document(photo_id).get()
                        if photo_doc.exists:
                            photo_data = photo_doc.to_dict()
                            matched_photos.append({
                                "photo_id": photo_id,
                                "drive_file_id": photo_data.get("drive_file_id"),
                                "distance": res["distance"],
                                "match_type": "single"
                            })

        matched_photos.sort(key=lambda x: x["distance"])
        return {"matches": matched_photos, "mode": "single"}
