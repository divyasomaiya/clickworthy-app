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

    @abstractmethod
    def delete_file(self, file_id: str, owner_id: str = None) -> bool:
        pass

class LocalStorageProvider(StorageProvider):
    def __init__(self, base_path: str = None):
        if base_path is None:
            base_path = getattr(settings, "LOCAL_STORAGE_PATH", "backend_uploads")
        if not os.path.isabs(base_path):
            backend_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
            self.base_path = os.path.join(backend_dir, base_path)
        else:
            self.base_path = base_path
        os.makedirs(self.base_path, exist_ok=True)

    def save_file(self, temp_file_path: str, content_type: str, folder_id: str, owner_id: str = None) -> str:
        os.makedirs(self.base_path, exist_ok=True)
        file_id = str(uuid.uuid4())
        ext = ".jpg"
        if content_type == "image/png":
            ext = ".png"
        elif content_type in ["image/jpeg", "image/jpg", "image/pjpeg"]:
            ext = ".jpg"

        final_path = os.path.join(self.base_path, f"{file_id}{ext}")
        shutil.copy(temp_file_path, final_path)
        return file_id

    def get_file_path(self, file_id: str, owner_id: str = None) -> Optional[str]:
        os.makedirs(self.base_path, exist_ok=True)
        for ext in [".jpg", ".png", ".jpeg"]:
            potential_path = os.path.join(self.base_path, f"{file_id}{ext}")
            if os.path.exists(potential_path):
                return potential_path
        return None

    def create_folder(self, folder_name: str, owner_id: str = None) -> str:
        os.makedirs(self.base_path, exist_ok=True)
        return f"local_folder_{uuid.uuid4()}"

    def delete_file(self, file_id: str, owner_id: str = None) -> bool:
        path = self.get_file_path(file_id, owner_id)
        if path and os.path.exists(path):
            try:
                os.remove(path)
                return True
            except Exception:
                return False
        return False

class GoogleDriveProvider(StorageProvider):
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
            raise Exception("ENCRYPTION_KEY is required to decrypt Google Drive credentials.")

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
            raise Exception("Google Drive not connected or unauthorized")

        file_metadata = {
            'name': folder_name,
            'mimeType': 'application/vnd.google-apps.folder'
        }
        folder = service.files().create(body=file_metadata, fields='id').execute()
        return folder.get('id')

    def save_file(self, temp_file_path: str, content_type: str, folder_id: str, owner_id: str = None) -> str:
        service = self._get_service(owner_id)
        if not service:
            raise Exception("Google Drive not connected or unauthorized")

        file_name = os.path.basename(temp_file_path)
        file_metadata = {
            'name': file_name,
            'parents': [folder_id]
        }
        media = MediaFileUpload(temp_file_path, mimetype=content_type, resumable=True)
        file = service.files().create(body=file_metadata, media_body=media, fields='id').execute()
        return file.get('id')

    def get_file_path(self, file_id: str, owner_id: str = None) -> Optional[str]:
        service = self._get_service(owner_id)
        if not service:
            raise Exception("Google Drive not connected or unauthorized")

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

    def delete_file(self, file_id: str, owner_id: str = None) -> bool:
        service = self._get_service(owner_id)
        if not service:
            return False
        try:
            service.files().delete(fileId=file_id).execute()
            return True
        except Exception:
            return False

class StorageManager:
    def __init__(self):
        self.providers = {
            "local": LocalStorageProvider(),
            "gdrive": GoogleDriveProvider()
        }

    def get_provider(self, provider_name: str) -> StorageProvider:
        provider = self.providers.get(provider_name)
        if not provider:
            raise ValueError(f"Unknown storage provider: {provider_name}")
        return provider

storage_manager = StorageManager()
