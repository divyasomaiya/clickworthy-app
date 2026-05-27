# AI-Powered Event Photography Platform

A production-ready SaaS application for event photographers to upload galleries, where clients can upload a selfie to instantly find their photos using AI Face Recognition.

Inspired by FotoOwl, Kwikpic, and Samaro AI.

## Architecture

- **Frontend:** Next.js (App Router), Tailwind CSS, Framer Motion, Zustand
- **Backend:** FastAPI (Python), REST APIs, Background Tasks
- **AI Pipeline:** RetinaFace + InsightFace (ArcFace `buffalo_l` model)
- **Vector Search:** FAISS (Facebook AI Similarity Search)
- **Database:** Firebase Firestore
- **Storage:** Google Drive API (Service Account)

## Prerequisites

1. Create a Firebase Project and download the Admin SDK Service Account JSON as `firebase_credentials.json` in the `backend/` folder.
2. Go to Google Cloud Console, enable the Google Drive API, create a Service Account, and download the JSON key as `service_account.json` in the `backend/` folder.
3. Share a folder in your Google Drive with the email address of the Service Account (give it Editor access). This is your `DRIVE_ROOT_FOLDER_ID`.
4. Install Docker and Docker Compose.

## Local Development (Docker)

1. Clone the repository.
2. Create `backend/.env` and `frontend/.env.local` files based on the required credentials.
3. Run `docker-compose up --build`.

- Frontend will be at `http://localhost:3000`
- Backend API docs will be at `http://localhost:8000/docs`

## Deployment Strategy (AWS Free Tier / Render)

### Backend (Render / AWS EC2)
The backend requires substantial memory (2GB+) to run the ONNX AI models (`buffalo_l`).
- **Render:** Deploy the backend using the Dockerfile. Use a standard instance (not free-tier, as the AI model requires memory).
- **AWS EC2:** Launch a `t3.small` or `t3.medium` instance. SSH in, install Docker, and run the backend container.

### Frontend (Vercel)
Connect your GitHub repository to Vercel and import the `frontend/` directory. Vercel's free tier is perfectly suited for this Next.js app.

## Project Structure

```
├── backend/
│   ├── app/
│   │   ├── api/          # FastAPI Routers
│   │   ├── core/         # Config & Settings
│   │   ├── models/       # Pydantic Schemas
│   │   └── services/     # AI, Firebase, GDrive Logic
│   └── Dockerfile
└── frontend/
    ├── src/
    │   ├── app/          # Next.js Pages (App Router)
    │   ├── components/   # UI Components (Shadcn)
    │   └── lib/          # Utilities
    └── Dockerfile
```
