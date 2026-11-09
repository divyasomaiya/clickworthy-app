from fastapi import APIRouter, HTTPException, Depends, Request
from fastapi.responses import RedirectResponse
from app.core.auth import get_current_user
from app.core.config import settings
from app.services.firebase import firebase_service
import google.oauth2.credentials
import google_auth_oauthlib.flow
from cryptography.fernet import Fernet
import json
import base64
import os

router = APIRouter()

# Setup Fernet for token encryption
def get_fernet():
    key = settings.ENCRYPTION_KEY
    if not key:
        # Fallback for dev only. Production MUST have ENCRYPTION_KEY.
        key = base64.urlsafe_b64encode(b"0" * 32).decode()
    return Fernet(key)

SCOPES = ['https://www.googleapis.com/auth/drive.file']

def get_client_config():
    return {
        "web": {
            "client_id": settings.GOOGLE_CLIENT_ID,
            "project_id": "clickworthy",
            "auth_uri": "https://accounts.google.com/o/oauth2/auth",
            "token_uri": "https://oauth2.googleapis.com/token",
            "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
            "client_secret": settings.GOOGLE_CLIENT_SECRET,
            "redirect_uris": [settings.GOOGLE_REDIRECT_URI]
        }
    }

@router.get("/auth")
def gdrive_auth(current_user: dict = Depends(get_current_user)):
    """Initiates the OAuth 2.0 flow for a photographer."""
    if not settings.GOOGLE_CLIENT_ID or not settings.GOOGLE_CLIENT_SECRET:
        raise HTTPException(status_code=500, detail="Google OAuth not configured on the server.")

    flow = google_auth_oauthlib.flow.Flow.from_client_config(
        get_client_config(),
        scopes=SCOPES
    )
    flow.redirect_uri = settings.GOOGLE_REDIRECT_URI

    # Store user id in the state parameter to correlate the callback
    authorization_url, state = flow.authorization_url(
        access_type='offline',
        include_granted_scopes='true',
        prompt='consent' # Force consent to ensure we get a refresh token
    )

    # In a real app we'd sign/encrypt the state or store it in a session DB.
    # For now, we will pack the user ID into the state.
    state_payload = {"uid": current_user.get("uid"), "state": state}
    encoded_state = base64.urlsafe_b64encode(json.dumps(state_payload).encode()).decode()

    # Re-generate url with custom state
    authorization_url, _ = flow.authorization_url(
        access_type='offline',
        include_granted_scopes='true',
        prompt='consent',
        state=encoded_state
    )

    return {"authorization_url": authorization_url}

@router.get("/callback")
def gdrive_callback(request: Request, state: str, code: str):
    """Handles the OAuth 2.0 callback and stores the refresh token."""
    try:
        decoded_state = json.loads(base64.urlsafe_b64decode(state.encode()).decode())
        uid = decoded_state.get("uid")
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid state parameter")

    flow = google_auth_oauthlib.flow.Flow.from_client_config(
        get_client_config(),
        scopes=SCOPES,
        state=state
    )
    flow.redirect_uri = settings.GOOGLE_REDIRECT_URI

    # The callback request url must be reconstructed perfectly.
    # When testing locally, proxies might change the scheme. Force http for localhost.
    authorization_response = str(request.url).replace("http://", "https://") if "localhost" not in str(request.url) else str(request.url)

    try:
        flow.fetch_token(authorization_response=authorization_response)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to fetch token: {e}")

    credentials = flow.credentials

    if not credentials.refresh_token:
        # If we didn't get a refresh token, it means the user previously granted access.
        # In a robust app, we'd prompt them to revoke and re-grant.
        pass

    # Store token in Firestore securely
    db = firebase_service.get_db()
    if not db:
        raise HTTPException(status_code=500, detail="Database not available")

    fernet = get_fernet()
    token_data = {
        "token": credentials.token,
        "refresh_token": credentials.refresh_token,
        "token_uri": credentials.token_uri,
        "client_id": credentials.client_id,
        "client_secret": credentials.client_secret,
        "scopes": credentials.scopes
    }

    encrypted_token = fernet.encrypt(json.dumps(token_data).encode()).decode()

    db.collection("photographers").document(uid).set({
        "gdrive_token": encrypted_token,
        "gdrive_connected": True
    }, merge=True)

    # Redirect back to the dashboard frontend
    frontend_url = os.environ.get("NEXT_PUBLIC_FRONTEND_URL", "http://localhost:3000")
    return RedirectResponse(f"{frontend_url}/dashboard?gdrive=connected")

@router.delete("/disconnect")
def gdrive_disconnect(current_user: dict = Depends(get_current_user)):
    db = firebase_service.get_db()
    if not db:
        raise HTTPException(status_code=500, detail="Database not available")

    # Remove token data
    db.collection("photographers").document(current_user.get("uid")).update({
        "gdrive_token": firestore.DELETE_FIELD,
        "gdrive_connected": False
    })

    return {"message": "Google Drive disconnected"}
