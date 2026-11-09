from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    FIREBASE_CREDENTIALS: str = "firebase_credentials.json"
    JWT_SECRET_KEY: str

    # OAuth configuration for Google Drive BYOS
    GOOGLE_CLIENT_ID: str = ""
    GOOGLE_CLIENT_SECRET: str = ""
    GOOGLE_REDIRECT_URI: str = "http://localhost:8000/api/gdrive/callback"
    ENCRYPTION_KEY: str = "" # Used to encrypt refresh tokens at rest

    class Config:
        env_file = ".env"
        extra = "ignore"

settings = Settings()
