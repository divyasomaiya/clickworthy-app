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

import secrets
from datetime import datetime, timedelta

# Setup Fernet for token encryption
def get_fernet():
    key = settings.ENCRYPTION_KEY
    if not key:
        raise Exception("ENCRYPTION_KEY is required.")
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

    # Generate cryptographically secure state
    secure_state = secrets.token_urlsafe(32)
    state_payload = {
        "uid": current_user.get("uid"),
        "state": secure_state,
        "exp": (datetime.now() + timedelta(minutes=15)).isoformat()
    }
    encoded_state = base64.urlsafe_b64encode(json.dumps(state_payload).encode()).decode()

    # Store state signature in DB to prevent replay
    db = firebase_service.get_db()
    if db:
        db.collection("oauth_states").document(secure_state).set(state_payload)

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
        secure_state = decoded_state.get("state")

        db = firebase_service.get_db()
        if not db:
            raise HTTPException(status_code=500, detail="Database not available")

        # Execute atomic consumption
        state_ref = db.collection("oauth_states").document(secure_state)

        # If it's the real firestore, use a transaction
        if hasattr(db, "transaction"):
            from google.cloud import firestore
            @firestore.transactional
            def consume_state(transaction, state_ref):
                snapshot = state_ref.get(transaction=transaction)
                if not snapshot.exists:
                    raise Exception("State not found or already consumed")
                data = snapshot.to_dict()
                if data.get("uid") != uid:
                    raise Exception("State tampered")

                exp = datetime.fromisoformat(data.get("exp"))
                if datetime.now() > exp:
                    transaction.delete(state_ref)
                    raise Exception("State expired")

                transaction.delete(state_ref)
                return data

            transaction = db.transaction()
            consume_state(transaction, state_ref)
        else:
            # Fallback for LocalMockDB
            state_doc = state_ref.get()

            if not state_doc.exists:
                raise Exception("State not found or already consumed")

            state_data = state_doc.to_dict()

            # Verify fields
            if state_data.get("uid") != uid:
                raise Exception("State tampered")

            exp = datetime.fromisoformat(state_data.get("exp"))
            if datetime.now() > exp:
                state_ref.delete()
                raise Exception("State expired")

            # Consume state
            state_ref.delete()

    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid state parameter: {e}")

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

from googleapiclient.discovery import build
import httpx

@router.delete("/disconnect")
def gdrive_disconnect(current_user: dict = Depends(get_current_user)):
    db = firebase_service.get_db()
    if not db:
        raise HTTPException(status_code=500, detail="Database not available")

    uid = current_user.get("uid")
    doc = db.collection("photographers").document(uid).get()

    if doc.exists:
        data = doc.to_dict()
        encrypted_token = data.get("gdrive_token")

        # Optionally revoke the token from Google side if we have it
        if encrypted_token:
            try:
                fernet = get_fernet()
                decrypted = fernet.decrypt(encrypted_token.encode()).decode()
                token_data = json.loads(decrypted)
                access_token = token_data.get("token")
                if access_token:
                    httpx.post('https://oauth2.googleapis.com/revoke', data={'token': access_token})
            except Exception as e:
                print(f"Failed to revoke token externally: {e}")

        from firebase_admin import firestore
        # Remove token data locally
        db.collection("photographers").document(uid).update({
            "gdrive_token": firestore.DELETE_FIELD,
            "gdrive_connected": False
        })

    return {"message": "Google Drive disconnected"}
