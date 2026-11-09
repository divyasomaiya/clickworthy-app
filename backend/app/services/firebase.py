import os
import json
import uuid
import firebase_admin
from firebase_admin import credentials, firestore
from app.core.config import settings

class LocalMockDB:
    """A local mock database to use when Firebase is not connected."""
    def __init__(self, filepath="local_db.json"):
        self.filepath = filepath
        if os.path.exists(self.filepath):
            with open(self.filepath, "r") as f:
                self.data = json.load(f)
        else:
            self.data = {"events": {}, "images": {}, "faces": {}}
            self._save()

    def _save(self):
        with open(self.filepath, "w") as f:
            json.dump(self.data, f)

    def collection(self, coll_name: str):
        class MockCollectionRef:
            def __init__(self, db, name):
                self.db = db
                self.name = name
                if self.name not in self.db.data:
                    self.db.data[self.name] = {}

            def document(self, doc_id: str):
                class MockDocRef:
                    def __init__(self, coll, did):
                        self.coll = coll
                        self.did = did

                    def set(self, data: dict, merge: bool = False):
                        if merge:
                            existing = self.coll.db.data[self.coll.name].get(self.did, {})
                            existing.update(data)
                            self.coll.db.data[self.coll.name][self.did] = existing
                        else:
                            self.coll.db.data[self.coll.name][self.did] = data
                        self.coll.db._save()

                    def update(self, data: dict):
                        if self.did not in self.coll.db.data[self.coll.name]:
                            raise Exception("Cannot update non-existent document")

                        from firebase_admin import firestore
                        for k, v in data.items():
                            if v == firestore.DELETE_FIELD:
                                self.coll.db.data[self.coll.name][self.did].pop(k, None)
                            else:
                                self.coll.db.data[self.coll.name][self.did][k] = v
                        self.coll.db._save()

                    def delete(self):
                        if self.did in self.coll.db.data[self.coll.name]:
                            del self.coll.db.data[self.coll.name][self.did]
                            self.coll.db._save()

                    def get(self):
                        class MockDocSnapshot:
                            def __init__(self, exists, doc_id, data):
                                self.exists = exists
                                self.id = doc_id
                                self._data = data

                            def to_dict(self):
                                return self._data

                        exists = self.did in self.coll.db.data[self.coll.name]
                        data = self.coll.db.data[self.coll.name].get(self.did, {})
                        return MockDocSnapshot(exists, self.did, data)
                return MockDocRef(self, doc_id)

            def where(self, field, op, value):
                class MockQuery:
                    def __init__(self, coll, field, value):
                        self.coll = coll
                        self.field = field
                        self.value = value

                    def get(self):
                        results = []
                        for doc_id, data in self.coll.db.data[self.coll.name].items():
                            if data.get(self.field) == self.value:
                                class MockDocSnapshot:
                                    def __init__(self, doc_id, data):
                                        self.id = doc_id
                                        self._data = data
                                    def to_dict(self):
                                        return self._data
                                results.append(MockDocSnapshot(doc_id, data))
                        return results
                return MockQuery(self, field, value)

        return MockCollectionRef(self, coll_name)

class FirebaseService:
    def __init__(self):
        self.db = None
        self.local_db = None
        is_prod = os.environ.get("ENVIRONMENT") == "production"

        if os.path.exists(settings.FIREBASE_CREDENTIALS):
            try:
                cred = credentials.Certificate(settings.FIREBASE_CREDENTIALS)
                if not firebase_admin._apps:
                    firebase_admin.initialize_app(cred)
                self.db = firestore.client()
            except Exception as e:
                print(f"Error initializing Firebase: {e}")
                if not is_prod:
                    print("Falling back to local DB for development.")
                    self.local_db = LocalMockDB()
                else:
                    raise Exception("Firebase initialization failed in production.") from e
        else:
            if is_prod:
                raise Exception("Missing FIREBASE_CREDENTIALS in production.")
            self.local_db = LocalMockDB()

    def get_db(self):
        return self.db if self.db else self.local_db

firebase_service = FirebaseService()
