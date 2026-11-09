import os
import uuid
import shutil
from abc import ABC, abstractmethod
from typing import Optional

class StorageProvider(ABC):
    @abstractmethod
    def save_file(self, temp_file_path: str, content_type: str, folder_id: str) -> str:
        pass

    @abstractmethod
    def get_file_path(self, file_id: str) -> Optional[str]:
        pass

class LocalStorageProvider(StorageProvider):
    def __init__(self, base_path: str = "backend_uploads"):
        self.base_path = base_path
        os.makedirs(self.base_path, exist_ok=True)

    def save_file(self, temp_file_path: str, content_type: str, folder_id: str) -> str:
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

    def get_file_path(self, file_id: str) -> Optional[str]:
        # Search for file_id with any supported extension
        for ext in [".jpg", ".png", ".jpeg"]:
            potential_path = os.path.join(self.base_path, f"{file_id}{ext}")
            if os.path.exists(potential_path):
                return potential_path
        return None

# For now, we will just use the LocalStorageProvider
storage_provider = LocalStorageProvider()
