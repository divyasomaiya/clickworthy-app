from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    GOOGLE_APPLICATION_CREDENTIALS: str = "service_account.json"
    FIREBASE_CREDENTIALS: str = "firebase_credentials.json"
    DRIVE_ROOT_FOLDER_ID: str = "" # The root folder in your Drive where events will be stored
    JWT_SECRET_KEY: str = "your-super-secret-key-for-dev"

    class Config:
        env_file = ".env"
        extra = "ignore"

settings = Settings()
