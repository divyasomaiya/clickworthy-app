from pydantic import BaseModel

class EventCreate(BaseModel):
    name: str
    client_name: str
    date: str
    photographer_id: str

class EventResponse(BaseModel):
    event_id: str
    name: str
    drive_folder_id: str

class SearchRequest(BaseModel):
    event_id: str

class PhotoResponse(BaseModel):
    photo_id: str
    url: str
    event_id: str
