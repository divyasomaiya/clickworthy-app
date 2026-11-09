import os
import uuid
import shutil
from abc import ABC, abstractmethod
from typing import Optional
from app.services.firebase import firebase_service
from app.core.config import settings
from cryptography.fernet import Fernet
import json
import base64
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build
from googleapiclient.http import MediaFileUpload

class StorageProvider(ABC):
    @abstractmethod
    def save_file(self, temp_file_path: str, content_type: str, folder_id: str, owner_id: str = None) -> str:
        pass

    @abstractmethod
    def get_file_path(self, file_id: str, owner_id: str = None) -> Optional[str]:
        pass

    @abstractmethod
    def create_folder(self, folder_name: str, owner_id: str = None) -> str:
        pass

class LocalStorageProvider(StorageProvider):
    def __init__(self, base_path: str = "backend_uploads"):
        self.base_path = base_path
        os.makedirs(self.base_path, exist_ok=True)

    def save_file(self, temp_file_path: str, content_type: str, folder_id: str, owner_id: str = None) -> str:
        file_id = str(uuid.uuid4())
        # Use simple extension based on content_type or default to .jpg
        ext = ".jpg"
        if content_type == "image/png":
            ext = ".png"
        elif content_type == "image/jpeg":
            ext = ".jpg"

        final_path = os.path.join(self.base_path, f"{file_id}{ext}")
        shutil.copy(temp_file_path, final_path)
        return file_id

    def get_file_path(self, file_id: str, owner_id: str = None) -> Optional[str]:
        # Search for file_id with any supported extension
        for ext in [".jpg", ".png", ".jpeg"]:
            potential_path = os.path.join(self.base_path, f"{file_id}{ext}")
            if os.path.exists(potential_path):
                return potential_path
        return None

    def create_folder(self, folder_name: str, owner_id: str = None) -> str:
        # For local, just generate a logical ID. Real dir structure is flat for simplicity.
        return f"local_folder_{uuid.uuid4()}"

class GoogleDriveProvider(StorageProvider):
    def __init__(self):
        self.local_fallback = LocalStorageProvider()

    def _get_credentials(self, owner_id: str) -> Optional[Credentials]:
        if not owner_id:
            return None

        db = firebase_service.get_db()
        if not db:
            return None

        doc = db.collection("photographers").document(owner_id).get()
        if not doc.exists:
            return None

        data = doc.to_dict()
        encrypted_token = data.get("gdrive_token")

        if not encrypted_token:
            return None

        key = settings.ENCRYPTION_KEY
        if not key:
            key = base64.urlsafe_b64encode(b"0" * 32).decode()

        fernet = Fernet(key)
        try:
            decrypted = fernet.decrypt(encrypted_token.encode()).decode()
            token_data = json.loads(decrypted)
            return Credentials(**token_data)
        except Exception:
            return None

    def _get_service(self, owner_id: str):
        creds = self._get_credentials(owner_id)
        if not creds:
            return None
        return build('drive', 'v3', credentials=creds)

    def create_folder(self, folder_name: str, owner_id: str = None) -> str:
        service = self._get_service(owner_id)
        if not service:
            return self.local_fallback.create_folder(folder_name, owner_id)

        file_metadata = {
            'name': folder_name,
            'mimeType': 'application/vnd.google-apps.folder'
        }
        folder = service.files().create(body=file_metadata, fields='id').execute()
        return folder.get('id')

    def save_file(self, temp_file_path: str, content_type: str, folder_id: str, owner_id: str = None) -> str:
        service = self._get_service(owner_id)
        if not service or "local_folder_" in folder_id:
            return self.local_fallback.save_file(temp_file_path, content_type, folder_id, owner_id)

        file_name = os.path.basename(temp_file_path)
        file_metadata = {
            'name': file_name,
            'parents': [folder_id]
        }
        media = MediaFileUpload(temp_file_path, mimetype=content_type, resumable=True)
        file = service.files().create(body=file_metadata, media_body=media, fields='id').execute()
        return file.get('id')

    def get_file_path(self, file_id: str, owner_id: str = None) -> Optional[str]:
        # Google Drive files don't have a "local path". We need to download it or proxy it.
        # For simplicity in this architecture, we will download it to a temp dir and return that path.
        if not file_id or "local_folder_" in file_id or len(file_id) > 50:
            return self.local_fallback.get_file_path(file_id, owner_id)

        service = self._get_service(owner_id)
        if not service:
            return self.local_fallback.get_file_path(file_id, owner_id)

        import io
        from googleapiclient.http import MediaIoBaseDownload

        request = service.files().get_media(fileId=file_id)
        temp_path = os.path.join("temp_uploads", f"gdrive_{file_id}.jpg")
        os.makedirs("temp_uploads", exist_ok=True)

        with open(temp_path, "wb") as fh:
            downloader = MediaIoBaseDownload(fh, request)
            done = False
            while done is False:
                status, done = downloader.next_chunk()

        return temp_path

storage_provider = GoogleDriveProvider()
