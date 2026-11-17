import os
import pytest
# Set JWT secret before app imports
os.environ["JWT_SECRET_KEY"] = "test_secret_key"

from fastapi.testclient import TestClient
from app.main import app
import shutil
import json
from unittest.mock import patch
from app.core.auth import create_access_token
from datetime import timedelta

client = TestClient(app)

@pytest.fixture(autouse=True)
def setup_and_teardown():
    # Setup test uploads directory
    os.makedirs("backend_uploads", exist_ok=True)
    yield
    # Cleanup after tests
    if os.path.exists("backend_uploads"):
        shutil.rmtree("backend_uploads")
    if os.path.exists("temp_uploads"):
        shutil.rmtree("temp_uploads")
    if os.path.exists("temp_search"):
        shutil.rmtree("temp_search")

def test_health_check():
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "healthy"}

@patch("app.core.auth.firebase_auth.verify_id_token")
def test_login_returns_token(mock_verify):
    mock_verify.return_value = {"uid": "test-uid", "email": "test@example.com"}
    response = client.post("/api/auth/login", json={"id_token": "mock"})
    assert response.status_code == 200
    assert "access_token" in response.json()

def test_auth_me_returns_gdrive_connected():
    token = get_test_token("test-uid")
    headers = {"Authorization": f"Bearer {token}"}

    # First, hitting /me without any gdrive status set
    res1 = client.get("/api/auth/me", headers=headers)
    assert res1.status_code == 200
    assert res1.json().get("uid") == "test-uid"
    assert res1.json().get("gdrive_connected", False) is False

    # Mock setting gdrive connected status in DB
    from app.services.firebase import firebase_service
    db = firebase_service.get_db()
    db.collection("photographers").document("test-uid").set({"gdrive_connected": True})

    res2 = client.get("/api/auth/me", headers=headers)
    assert res2.status_code == 200
    assert res2.json().get("gdrive_connected") is True

def test_create_event_without_auth_fails():
    response = client.post("/api/events/", json={
        "name": "Test",
        "client_name": "Test Client",
        "date": "2026-05-27"
    })
    assert response.status_code == 403

def get_test_token(uid="test-uid"):
    return create_access_token({"sub": uid, "role": "photographer"})

def test_create_event_success_and_private_access():
    token = get_test_token()
    headers = {"Authorization": f"Bearer {token}"}

    # Create an event
    response = client.post("/api/events/", json={
        "name": "Test Event",
        "client_name": "Test Client",
        "date": "2026-05-27",
        "is_private": True
    }, headers=headers)
    assert response.status_code == 200
    event_id = response.json()["event_id"]

    # Get event as owner
    res = client.get(f"/api/events/{event_id}", headers=headers)
    assert res.status_code == 200

    # Get event as another user (tenant isolation check)
    other_token = get_test_token(uid="other-uid")
    other_headers = {"Authorization": f"Bearer {other_token}"}
    res = client.get(f"/api/events/{event_id}", headers=other_headers)
    assert res.status_code == 403

def test_upload_invalid_file_type():
    token = get_test_token()
    headers = {"Authorization": f"Bearer {token}"}

    # First create an event to own
    response = client.post("/api/events/", json={
        "name": "Test Event",
        "client_name": "Test Client",
        "date": "2026-05-27",
    }, headers=headers)
    event_id = response.json()["event_id"]

    # Upload invalid file type
    res = client.post(
        "/api/upload/",
        data={"event_id": event_id, "folder_id": "mock"},
        files={"file": ("test.txt", b"not an image", "text/plain")},
        headers=headers
    )
    assert res.status_code == 400

def test_private_image_retrieval_unauthorized():
    token = get_test_token()
    headers = {"Authorization": f"Bearer {token}"}

    # Create private event
    response = client.post("/api/events/", json={
        "name": "Test Event",
        "client_name": "Test Client",
        "date": "2026-05-27",
        "is_private": True
    }, headers=headers)
    event_id = response.json()["event_id"]

    # Upload mock valid image
    from PIL import Image
    import io
    file_bytes = io.BytesIO()
    image = Image.new('RGB', (100, 100))
    image.save(file_bytes, format='JPEG')
    file_bytes.seek(0)

    upload_res = client.post(
        "/api/upload/",
        data={"event_id": event_id},
        files={"file": ("test.jpg", file_bytes.read(), "image/jpeg")},
        headers=headers
    )
    assert upload_res.status_code == 200
    photo_id = upload_res.json()["photo_id"]

    # Attempt to retrieve without token (should fail 403)
    get_res = client.get(f"/api/images/{photo_id}")
    assert get_res.status_code == 403

    # Attempt to retrieve with other user's token (should fail 403)
    other_token = get_test_token("other-uid")
    get_other = client.get(f"/api/images/{photo_id}", headers={"Authorization": f"Bearer {other_token}"})
    assert get_other.status_code == 403

    # Attempt to retrieve with owner's token (should succeed 200)
    get_owner = client.get(f"/api/images/{photo_id}", headers=headers)
    assert get_owner.status_code == 200

def test_get_event_photos_tenant_isolation():
    token = get_test_token()
    headers = {"Authorization": f"Bearer {token}"}

    # Create event
    response = client.post("/api/events/", json={
        "name": "Test Event",
        "client_name": "Test Client",
        "date": "2026-05-27"
    }, headers=headers)
    event_id = response.json()["event_id"]

    # Try fetching as owner (should succeed 200)
    res_owner = client.get(f"/api/events/{event_id}/photos", headers=headers)
    assert res_owner.status_code == 200

    # Try fetching as non-owner (should fail 403)
    other_token = get_test_token("other")
    res_other = client.get(f"/api/events/{event_id}/photos", headers={"Authorization": f"Bearer {other_token}"})
    assert res_other.status_code == 403

def test_search_returns_placeholder():
    token = get_test_token()
    headers = {"Authorization": f"Bearer {token}"}

    # Create an event first so event_id lookup succeeds
    response = client.post("/api/events/", json={
        "name": "Test Event",
        "client_name": "Test Client",
        "date": "2026-05-27",
        "is_private": True
    }, headers=headers)
    event_id = response.json()["event_id"]

    import io
    from PIL import Image
    file_bytes = io.BytesIO()
    image = Image.new('RGB', (100, 100))
    image.save(file_bytes, format='JPEG')
    file_bytes.seek(0)

    img_data = file_bytes.read()

    # Search should return 403 when unauthenticated. We do not use Depends for current_user directly on the route,
    # instead we check the token in the route logic, so it's a 403, not a 401.
    res_unauth = client.post("/api/search/", data={"event_id": event_id}, files={"file": ("test.jpg", img_data, "image/jpeg")})
    assert res_unauth.status_code == 403

    # Search should return 403 when using another user's token
    other_token = get_test_token("other-uid")
    res_other = client.post("/api/search/", data={"event_id": event_id}, files={"file": ("test.jpg", img_data, "image/jpeg")}, headers={"Authorization": f"Bearer {other_token}"})
    assert res_other.status_code == 403

    # Search should return 200 but matches empty list since it's just an empty image
    res = client.post("/api/search/", data={"event_id": event_id}, files={"file": ("test.jpg", img_data, "image/jpeg")}, headers=headers)
    assert res.status_code == 200
    assert "No face found in selfie" in res.json()["message"]

def test_gdrive_oauth_state_replay():
    import base64
    import json
    from app.services.firebase import firebase_service
    from datetime import datetime, timedelta

    os.environ["ENCRYPTION_KEY"] = base64.urlsafe_b64encode(b"0" * 32).decode()
    from app.core.config import settings
    settings.ENCRYPTION_KEY = os.environ["ENCRYPTION_KEY"]

    # Simulate an oauth flow and attempt to consume state twice
    token = get_test_token()

    secure_state = "mock_secure_state_123"
    state_payload = {
        "uid": "test-uid",
        "state": secure_state,
        "exp": (datetime.now() + timedelta(minutes=15)).isoformat()
    }

    db = firebase_service.get_db()
    db.collection("oauth_states").document(secure_state).set(state_payload)

    encoded_state = base64.urlsafe_b64encode(json.dumps(state_payload).encode()).decode()

    # We will just test the callback directly, mocking the google flow
    with patch("app.api.endpoints.gdrive.google_auth_oauthlib.flow.Flow") as mock_flow:
        class MockFlow:
            def __init__(self, *args, **kwargs):
                self.credentials = type('MockCreds', (), {
                    'token': 't',
                    'refresh_token': 'r',
                    'token_uri': 'tu',
                    'client_id': 'cid',
                    'client_secret': 'cs',
                    'scopes': []
                })()
                self.redirect_uri = ""
            def fetch_token(self, **kwargs):
                pass

        mock_flow.from_client_config.return_value = MockFlow()

        # First consumption should succeed (return 200/Redirect)
        # Note: the test client follows redirects if follow_redirects=True.
        # But we disabled mock routes initially for the callback by setting redirect uri to nothing.
        # It's an HTTP 200 OK after Redirect normally, but we get 404 because the frontend URL is not configured.
        # Let's set follow_redirects=False to catch the 307 Temporary Redirect explicitly
        res1 = client.get(f"/api/gdrive/callback?state={encoded_state}&code=mock_code", follow_redirects=False)
        assert res1.status_code in [200, 307] # Redirects actually

        # Second consumption should fail (400 Invalid state)
        res2 = client.get(f"/api/gdrive/callback?state={encoded_state}&code=mock_code", follow_redirects=False)
        assert res2.status_code == 400

@patch("app.api.endpoints.gdrive.google_auth_oauthlib.flow.Flow")
def test_gdrive_auth_route(mock_flow):
    # Ensure it returns an auth URL when env variables are mocked
    os.environ["GOOGLE_CLIENT_ID"] = "mock"
    os.environ["GOOGLE_CLIENT_SECRET"] = "mock"

    from app.core.config import settings
    settings.GOOGLE_CLIENT_ID = "mock"
    settings.GOOGLE_CLIENT_SECRET = "mock"

    class MockFlow:
        def authorization_url(self, **kwargs):
            return "https://mock-auth-url", "mock-state"

    mock_flow.from_client_config.return_value = MockFlow()

    token = get_test_token()
    headers = {"Authorization": f"Bearer {token}"}
    res = client.get("/api/gdrive/auth", headers=headers)

    assert res.status_code == 200
    assert "authorization_url" in res.json()

@patch("app.api.endpoints.gdrive.httpx.post")
def test_gdrive_disconnect(mock_post):
    import base64
    os.environ["ENCRYPTION_KEY"] = base64.urlsafe_b64encode(b"0" * 32).decode()
    from app.core.config import settings
    settings.ENCRYPTION_KEY = os.environ["ENCRYPTION_KEY"]

    token = get_test_token()
    headers = {"Authorization": f"Bearer {token}"}

    # We test local fallback update delete handling essentially
    res = client.delete("/api/gdrive/disconnect", headers=headers)

    # It might return 200 even if there was nothing to disconnect,
    # but the point is we test the mock DB update operation handling DELETE_FIELD string.
    assert res.status_code == 200
    assert res.json()["message"] == "Google Drive disconnected"


def test_search_duo_face_matching_modes():
    """Verify two-person 'together', 'either', and 'single' search modes."""
    import numpy as np
    from app.services.vector_store import faiss_index
    from app.services.firebase import firebase_service

    token = get_test_token("photographer-duo-test")
    headers = {"Authorization": f"Bearer {token}"}

    # 1. Create test event
    ev_res = client.post("/api/events/", json={
        "name": "Duo Test Event",
        "client_name": "Test Client",
        "date": "2026-11-18",
        "is_private": True
    }, headers=headers)
    assert ev_res.status_code == 200
    event_id = ev_res.json()["event_id"]

    # 2. Add embeddings to FAISS and metadata to Firestore
    # Person A vector: dimension 0
    vec_a = np.zeros(128, dtype=np.float32)
    vec_a[0] = 1.0
    # Person B vector: dimension 1
    vec_b = np.zeros(128, dtype=np.float32)
    vec_b[1] = 1.0

    db = firebase_service.get_db()

    # Photo 1: Contains BOTH Person A and Person B (2 distinct faces)
    pid_together = "photo_both_a_and_b"
    faiss_index.add_embedding(vec_a, f"{pid_together}_face_0")
    faiss_index.add_embedding(vec_b, f"{pid_together}_face_1")
    db.collection("images").document(pid_together).set({"event_id": event_id, "drive_file_id": "d1"})
    db.collection("faces").document(f"{pid_together}_face_0").set({"event_id": event_id, "photo_id": pid_together, "bbox": [10, 10, 50, 50], "det_score": 0.95})
    db.collection("faces").document(f"{pid_together}_face_1").set({"event_id": event_id, "photo_id": pid_together, "bbox": [100, 10, 50, 50], "det_score": 0.94})

    # Photo 2: Contains ONLY Person A
    pid_a_only = "photo_person_a_only"
    faiss_index.add_embedding(vec_a, f"{pid_a_only}_face_0")
    db.collection("images").document(pid_a_only).set({"event_id": event_id, "drive_file_id": "d2"})
    db.collection("faces").document(f"{pid_a_only}_face_0").set({"event_id": event_id, "photo_id": pid_a_only, "bbox": [10, 10, 50, 50], "det_score": 0.95})

    # Photo 3: Contains ONLY Person B
    pid_b_only = "photo_person_b_only"
    faiss_index.add_embedding(vec_b, f"{pid_b_only}_face_0")
    db.collection("images").document(pid_b_only).set({"event_id": event_id, "drive_file_id": "d3"})
    db.collection("faces").document(f"{pid_b_only}_face_0").set({"event_id": event_id, "photo_id": pid_b_only, "bbox": [10, 10, 50, 50], "det_score": 0.95})

    # Mock face_service.process_image to return deterministic embeddings
    with patch("app.api.endpoints.search.face_service.process_image") as mock_proc:
        duo_mode_flag = {"two_faces": False}
        def side_effect(path):
            if duo_mode_flag["two_faces"]:
                return [
                    {"bbox": [0, 0, 10, 10], "det_score": 0.98, "embedding": vec_a.tolist()},
                    {"bbox": [20, 20, 10, 10], "det_score": 0.97, "embedding": vec_b.tolist()}
                ]
            elif "_b.tmp" in path or "person_b" in path:
                return [{"bbox": [0, 0, 10, 10], "det_score": 0.98, "embedding": vec_b.tolist()}]
            else:
                return [{"bbox": [0, 0, 10, 10], "det_score": 0.98, "embedding": vec_a.tolist()}]

        mock_proc.side_effect = side_effect

        dummy_img = b"\xFF\xD8\xFF\xE0\x00\x10JFIF\x00\x01\x01\x01\x00`\x00`\x00\x00\xFF\xDB\x00C\x00\x08\x06\x06\x07\x06\x05\x08\x07\x07\x07\t\t\x08\n\x0c\x14\r\x0c\x0b\x0b\x0c\x19\x12\x13\x0f\x14\x1d\x1a\x1f\x1e\x1d\x1a\x1c\x1c $.' \",#\x1c\x1c(7),01444\x1f'9=82<.342\xFF\xC0\x00\x0b\x08\x00\x01\x00\x01\x01\x01\x11\x00\xFF\xC4\x00\x1f\x00\x00\x01\x05\x01\x01\x01\x01\x01\x01\x00\x00\x00\x00\x00\x00\x00\x00\x01\x02\x03\x04\x05\x06\x07\x08\t\n\x0b\xFF\xDA\x00\x08\x01\x01\x00\x00?\x00\xbf\x00\xFF\xD9"

        # Test A: Find Us Together with 2 separate files
        res_together = client.post(
            "/api/search/",
            data={"event_id": event_id, "mode": "together"},
            files={
                "file": ("person_a.jpg", dummy_img, "image/jpeg"),
                "file_b": ("person_b.jpg", dummy_img, "image/jpeg")
            },
            headers=headers
        )
        assert res_together.status_code == 200
        matches_together = res_together.json()["matches"]
        assert len(matches_together) == 1
        assert matches_together[0]["photo_id"] == pid_together
        assert matches_together[0]["match_type"] == "together"

        # Test B: Either Person mode
        res_either = client.post(
            "/api/search/",
            data={"event_id": event_id, "mode": "either"},
            files={
                "file": ("person_a.jpg", dummy_img, "image/jpeg"),
                "file_b": ("person_b.jpg", dummy_img, "image/jpeg")
            },
            headers=headers
        )
        assert res_either.status_code == 200
        matches_either = res_either.json()["matches"]
        pids_either = set(m["photo_id"] for m in matches_either)
        assert pids_either == {pid_together, pid_a_only, pid_b_only}

        # Test C: Single photo duo search (1 photo with 2 faces)
        duo_mode_flag["two_faces"] = True
        res_single_duo = client.post(
            "/api/search/",
            data={"event_id": event_id, "mode": "together"},
            files={"file": ("duo_single_photo.jpg", dummy_img, "image/jpeg")},
            headers=headers
        )
        duo_mode_flag["two_faces"] = False
        assert res_single_duo.status_code == 200
        matches_single_duo = res_single_duo.json()["matches"]
        assert len(matches_single_duo) == 1
        assert matches_single_duo[0]["photo_id"] == pid_together

        # Test D: Duo search with only 1 detected face (graceful guidance message)
        mock_proc.side_effect = lambda p: [{"bbox": [0, 0, 10, 10], "det_score": 0.9, "embedding": vec_a.tolist()}]
        res_insufficient = client.post(
            "/api/search/",
            data={"event_id": event_id, "mode": "together"},
            files={"file": ("single_face.jpg", dummy_img, "image/jpeg")},
            headers=headers
        )
        assert res_insufficient.status_code == 200
        assert res_insufficient.json()["matches"] == []
        assert "Only 1 face was detected" in res_insufficient.json()["message"]
