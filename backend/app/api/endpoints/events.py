from fastapi import APIRouter, HTTPException, Depends
from app.models.schemas import EventCreate, EventResponse
from app.services.google_drive import drive_service
from app.services.firebase import firebase_service
import uuid
import datetime

router = APIRouter()

@router.post("/", response_model=EventResponse)
def create_event(event: EventCreate):
    # Setup google drive folders
    folder_name = f"{event.date}_{event.client_name}_{event.name}"
    folders = drive_service.setup_event_folders(folder_name)

    event_id = str(uuid.uuid4())

    # Store event metadata in Firestore
    db = firebase_service.get_db()
    if db:
        event_ref = db.collection('events').document(event_id)
        event_ref.set({
            "name": event.name,
            "client_name": event.client_name,
            "date": event.date,
            "photographer_id": event.photographer_id,
            "drive_folders": folders,
            "created_at": datetime.datetime.now().isoformat()
        })

    return EventResponse(
        event_id=event_id,
        name=event.name,
        drive_folder_id=folders.get("event_folder_id", "")
    )

@router.get("/{event_id}")
def get_event(event_id: str):
    db = firebase_service.get_db()
    if not db:
        raise HTTPException(status_code=500, detail="Database not initialized")

    event = db.collection('events').document(event_id).get()
    if not event.exists:
        raise HTTPException(status_code=404, detail="Event not found")

    return event.to_dict()
