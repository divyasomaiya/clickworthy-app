import os
import firebase_admin
from firebase_admin import credentials, firestore
from app.core.config import settings

class FirebaseService:
    def __init__(self):
        self.db = None
        if os.path.exists(settings.FIREBASE_CREDENTIALS):
            cred = credentials.Certificate(settings.FIREBASE_CREDENTIALS)
            if not firebase_admin._apps:
                firebase_admin.initialize_app(cred)
            self.db = firestore.client()

    def get_db(self):
        return self.db

firebase_service = FirebaseService()
