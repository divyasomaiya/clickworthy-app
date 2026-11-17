import os
import httpx
from datetime import datetime, timedelta
from typing import Optional
from jose import JWTError, jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from app.services.firebase import firebase_service
from firebase_admin import auth as firebase_auth
from cryptography.x509 import load_pem_x509_certificate

from app.core.config import settings

SECRET_KEY = settings.JWT_SECRET_KEY
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24 * 7 # 7 days
FIREBASE_PROJECT_ID = getattr(settings, "FIREBASE_PROJECT_ID", "clickworthy-app")

security = HTTPBearer()

# Cache Google public certs
_google_certs_cache = {}
_google_certs_expires = datetime.min

async def get_google_public_certs():
    global _google_certs_cache, _google_certs_expires
    if datetime.utcnow() < _google_certs_expires and _google_certs_cache:
        return _google_certs_cache
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.get("https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com")
            if resp.status_code == 200:
                _google_certs_cache = resp.json()
                _google_certs_expires = datetime.utcnow() + timedelta(hours=1)
                return _google_certs_cache
    except Exception as e:
        print(f"Error fetching Google public certs: {e}")
    return _google_certs_cache

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=15)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

async def verify_firebase_token(token: str):
    # 1. Primary: Use Firebase Admin SDK (or mock in tests)
    try:
        decoded_token = firebase_auth.verify_id_token(token)
        return decoded_token
    except Exception:
        pass

    # 2. Cryptographic verification using Google's public x509 certificates
    try:
        header = jwt.get_unverified_header(token)
        kid = header.get("kid")
        certs = await get_google_public_certs()
        if kid in certs:
            pem = certs[kid]
            cert_obj = load_pem_x509_certificate(pem.encode("utf-8"))
            pub_key = cert_obj.public_key()
            decoded = jwt.decode(
                token,
                pub_key,
                algorithms=["RS256"],
                audience=FIREBASE_PROJECT_ID,
                issuer=f"https://securetoken.google.com/{FIREBASE_PROJECT_ID}"
            )
            decoded["uid"] = decoded.get("user_id") or decoded.get("sub")
            return decoded
    except Exception as e:
        print(f"Public cert token verification failed: {e}")

    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid authentication credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )

async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    token = credentials.credentials
    # First attempt to verify as a standard JWT from our backend
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id: str = payload.get("sub")
        if user_id is None:
            raise HTTPException(status_code=401, detail="Invalid token")
        return {"uid": user_id, "role": payload.get("role", "user")}
    except JWTError:
        # If it's not a valid standard JWT, attempt Firebase verify
        firebase_user = await verify_firebase_token(token)
        return firebase_user
