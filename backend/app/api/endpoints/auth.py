from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from app.core.auth import verify_firebase_token, create_access_token, get_current_user
from datetime import timedelta

router = APIRouter()

class LoginRequest(BaseModel):
    id_token: str

class LoginResponse(BaseModel):
    access_token: str
    token_type: str

@router.post("/login", response_model=LoginResponse)
async def login(request: LoginRequest):
    # Verify the Firebase token sent from the client
    firebase_user = await verify_firebase_token(request.id_token)

    # In a real system, you would check if the user exists in your database,
    # update their last login, or sync their Firebase profile data to your own DB.

    uid = firebase_user.get("uid")
    # For now, give them a token valid for 7 days
    access_token_expires = timedelta(days=7)
    access_token = create_access_token(
        data={"sub": uid, "role": "photographer"},
        expires_delta=access_token_expires
    )

    return LoginResponse(access_token=access_token, token_type="bearer")

@router.get("/me")
async def read_users_me(current_user: dict = Depends(get_current_user)):
    return current_user
