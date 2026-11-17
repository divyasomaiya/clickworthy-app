from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    FIREBASE_CREDENTIALS: str = "firebase_credentials.json"
    FIREBASE_PROJECT_ID: str = "clickworthy-app"
    JWT_SECRET_KEY: str
    MAX_UPLOAD_SIZE_MB: int = 50

    # Storage paths
    LOCAL_STORAGE_PATH: str = "backend_uploads"
    TEMP_UPLOAD_PATH: str = "temp_uploads"

    # OAuth configuration for Google Drive BYOS
    GOOGLE_CLIENT_ID: str = ""
    GOOGLE_CLIENT_SECRET: str = ""
    GOOGLE_REDIRECT_URI: str = "http://localhost:8000/api/gdrive/callback"
    ENCRYPTION_KEY: str = "" # Used to encrypt refresh tokens at rest

    class Config:
        env_file = ".env"
        extra = "ignore"

settings = Settings()
