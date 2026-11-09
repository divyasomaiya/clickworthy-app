import pytest
from fastapi.testclient import TestClient
from app.main import app
import os
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
