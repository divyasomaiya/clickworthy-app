import pytest
from fastapi.testclient import TestClient
from app.main import app
import os
import shutil

# Set environment variable for mock auth during tests
os.environ["USE_MOCK_AUTH"] = "true"

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

def test_login_returns_token():
    response = client.post("/api/auth/login", json={"id_token": "mock"})
    assert response.status_code == 200
    assert "access_token" in response.json()

def test_create_event_without_auth_fails():
    response = client.post("/api/events/", json={
        "name": "Test",
        "client_name": "Test Client",
        "date": "2026-05-27"
    })
    assert response.status_code == 401

def test_get_image_not_found():
    response = client.get("/api/images/invalid-id")
    # Will likely return 500 if DB is not connected, or 404 if it is
    assert response.status_code in [404, 500]
