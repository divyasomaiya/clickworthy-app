import os
from google.oauth2 import service_account
from googleapiclient.discovery import build
from googleapiclient.http import MediaFileUpload
from app.core.config import settings

class GoogleDriveService:
    def __init__(self):
        self.scopes = ['https://www.googleapis.com/auth/drive.file']
        self.credentials = None
        self.service = None

        # In a real scenario, this file must exist or be passed via env vars.
        # We'll initialize if it exists.
        if os.path.exists(settings.GOOGLE_APPLICATION_CREDENTIALS):
            self.credentials = service_account.Credentials.from_service_account_file(
                settings.GOOGLE_APPLICATION_CREDENTIALS, scopes=self.scopes)
            self.service = build('drive', 'v3', credentials=self.credentials)

    def create_folder(self, folder_name: str, parent_id: str = None) -> str:
        """Create a folder and return its ID."""
        if not self.service: return "mock_folder_id"

        file_metadata = {
            'name': folder_name,
            'mimeType': 'application/vnd.google-apps.folder'
        }
        if parent_id:
            file_metadata['parents'] = [parent_id]

        folder = self.service.files().create(body=file_metadata, fields='id').execute()
        return folder.get('id')

    def upload_file(self, file_path: str, mime_type: str, parent_id: str) -> str:
        """Upload a file to a specific folder and return its ID."""
        if not self.service: return "mock_file_id"

        file_name = os.path.basename(file_path)
        file_metadata = {
            'name': file_name,
            'parents': [parent_id]
        }
        media = MediaFileUpload(file_path, mimetype=mime_type, resumable=True)
        file = self.service.files().create(body=file_metadata, media_body=media, fields='id').execute()
        return file.get('id')

    def setup_event_folders(self, event_name: str) -> dict:
        """Sets up the required folder structure for an event."""
        root_id = settings.DRIVE_ROOT_FOLDER_ID
        event_folder_id = self.create_folder(event_name, root_id)

        return {
            "event_folder_id": event_folder_id,
            "raw_id": self.create_folder("RAW", event_folder_id),
            "edited_id": self.create_folder("Edited", event_folder_id),
            "compressed_id": self.create_folder("Compressed", event_folder_id),
            "ai_processed_id": self.create_folder("AI_Processed", event_folder_id),
        }

drive_service = GoogleDriveService()
