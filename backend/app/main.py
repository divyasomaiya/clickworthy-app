from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api.endpoints import events, upload, search, auth

app = FastAPI(
    title="AI Photo Platform API",
    description="Backend for AI-powered event photography platform",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # For production, restrict to frontend URL
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/health")
def health_check():
    return {"status": "healthy"}

app.include_router(auth.router, prefix="/api/auth", tags=["auth"])
app.include_router(events.router, prefix="/api/events", tags=["events"])
app.include_router(upload.router, prefix="/api/upload", tags=["upload"])
app.include_router(search.router, prefix="/api/search", tags=["search"])
