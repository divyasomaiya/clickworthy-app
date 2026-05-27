from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    GOOGLE_APPLICATION_CREDENTIALS: str = "service_account.json"
    FIREBASE_CREDENTIALS: str = "firebase_credentials.json"
    DRIVE_ROOT_FOLDER_ID: str = "" # The root folder in your Drive where events will be stored

    class Config:
        env_file = ".env"

settings = Settings()
