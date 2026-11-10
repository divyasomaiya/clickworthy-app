from fastapi import APIRouter, HTTPException, Depends
from app.models.schemas import EventCreate, EventResponse
from app.services.storage import storage_manager
from app.services.firebase import firebase_service
from app.core.auth import get_current_user
import uuid
import datetime

router = APIRouter()

@router.get("/me")
def list_my_events(current_user: dict = Depends(get_current_user)):
    db = firebase_service.get_db()
    if not db:
        return []

    events = db.collection('events').where('photographer_id', '==', current_user.get("uid")).get()
    return [{"id": e.id, **e.to_dict()} for e in events]

@router.post("/", response_model=EventResponse)
def create_event(event: EventCreate, current_user: dict = Depends(get_current_user)):
    photographer_id = current_user.get("uid")
    if not photographer_id:
        raise HTTPException(status_code=401, detail="Not authenticated")

    event_id = str(uuid.uuid4())

    # Determine storage provider (local or gdrive based on photographer connection)
    db = firebase_service.get_db()
    storage_provider_name = "local"
    if db:
        photographer_doc = db.collection("photographers").document(photographer_id).get()
        if photographer_doc.exists and photographer_doc.to_dict().get("gdrive_connected") and photographer_doc.to_dict().get("gdrive_token"):
            storage_provider_name = "gdrive"

    storage_provider = storage_manager.get_provider(storage_provider_name)

    # Create the folder structure using the generic storage provider.
    folder_name = f"{event.date}_{event.client_name}_{event.name}"
    event_folder_id = storage_provider.create_folder(folder_name, owner_id=photographer_id)
    folders = {"event_folder_id": event_folder_id}

    # Store event metadata in Firestore
    if db:
        event_ref = db.collection('events').document(event_id)
        event_ref.set({
            "name": event.name,
            "client_name": event.client_name,
            "date": event.date,
            "photographer_id": photographer_id,
            "drive_folders": folders,
            "storage_provider": storage_provider_name,
            "expiry_date": event.expiry_date,
            "is_private": event.is_private,
            "created_at": datetime.datetime.now().isoformat()
        })

    return EventResponse(
        event_id=event_id,
        name=event.name,
        drive_folder_id=folders.get("event_folder_id", ""),
        photographer_id=photographer_id,
        expiry_date=event.expiry_date
    )

@router.get("/{event_id}")
def get_event(event_id: str, current_user: dict = Depends(get_current_user)):
    db = firebase_service.get_db()
    if not db:
        # Return mock event for offline testing
        return {
            "event_id": event_id,
            "name": "Mock Test Event",
            "client_name": "Mock Client",
            "date": "2026-05-27",
            "photographer_id": current_user.get("uid", "mock"),
            "drive_folders": {
                "event_folder_id": "mock_folder_id",
            },
            "created_at": "2026-05-27T00:00:00"
        }

    event = db.collection('events').document(event_id).get()
    if not event.exists:
        raise HTTPException(status_code=404, detail="Event not found")

    event_data = event.to_dict()

    # Enforce tenant isolation
    if event_data.get("photographer_id") != current_user.get("uid"):
        raise HTTPException(status_code=403, detail="Not authorized to view this event")

    return {"id": event.id, **event_data}

@router.get("/{event_id}/photos")
def get_event_photos(event_id: str, current_user: dict = Depends(get_current_user)):
    db = firebase_service.get_db()
    if not db:
        raise HTTPException(status_code=500, detail="Database not connected")

    event = db.collection('events').document(event_id).get()
    if not event.exists:
        raise HTTPException(status_code=404, detail="Event not found")

    event_data = event.to_dict()

    # Enforce tenant isolation for listing all photos
    if event_data.get("photographer_id") != current_user.get("uid"):
        raise HTTPException(status_code=403, detail="Not authorized to list photos for this event")

    images_ref = db.collection("images").where("event_id", "==", event_id).get()

    photos = []
    for doc in images_ref:
        data = doc.to_dict()
        photos.append({
            "photo_id": doc.id,
            "drive_file_id": data.get("drive_file_id"),
        })

    return photos
