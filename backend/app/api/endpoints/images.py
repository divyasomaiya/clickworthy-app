from fastapi import APIRouter, HTTPException, Depends
from fastapi.responses import FileResponse
from app.services.storage import storage_provider
from app.services.firebase import firebase_service
# Note: For public guest access, we might need a different auth mechanism later.
# For now, we allow access if the event is public or if the user is authorized.
from app.core.auth import get_current_user

router = APIRouter()

from datetime import datetime

from app.core.auth import get_current_user
from fastapi import Depends

@router.get("/{photo_id}")
async def get_image(
    photo_id: str,
    current_user: dict = Depends(get_current_user)
):
    db = firebase_service.get_db()
    if not db:
        raise HTTPException(status_code=500, detail="Database connection failed")

    image_doc = db.collection("images").document(photo_id).get()
    if not image_doc.exists:
        raise HTTPException(status_code=404, detail="Image not found")

    image_data = image_doc.to_dict()
    event_id = image_data.get("event_id")
    file_id = image_data.get("drive_file_id")

    # Check event privacy and expiry
    event_doc = db.collection("events").document(event_id).get()
    if not event_doc.exists:
        raise HTTPException(status_code=404, detail="Event not found")

    event_data = event_doc.to_dict()
    expiry = event_data.get("expiry_date")
    if expiry:
        # Assumes expiry_date is ISO string
        if datetime.fromisoformat(expiry) < datetime.now():
            raise HTTPException(status_code=403, detail="Event has expired")

    is_private = event_data.get("is_private", True)
    if is_private:
        # For PR 1, only the photographer who owns the event can access private photos.
        # Guest grant auth will be handled later.
        if not current_user or event_data.get("photographer_id") != current_user.get("uid"):
            raise HTTPException(status_code=403, detail="Not authorized to view private event photos.")

    file_path = storage_provider.get_file_path(file_id)
    if not file_path:
        raise HTTPException(status_code=404, detail="File not found on storage")

    return FileResponse(file_path)
