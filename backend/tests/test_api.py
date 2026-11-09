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

    # Search should return 200 but matches empty list since it's just an empty image
    # We use Bearer headers instead of Form token for the new authenticated path.
    res = client.post("/api/search/", data={"event_id": event_id}, files={"file": ("test.jpg", file_bytes.read(), "image/jpeg")}, headers=headers)
    assert res.status_code == 200
    assert "No face found in selfie" in res.json()["message"]

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
