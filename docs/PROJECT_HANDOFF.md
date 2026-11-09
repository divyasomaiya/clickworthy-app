# CLICKWORTHY BY DTC - Project Handoff

## 1. Project Vision
Clickworthy is an AI-powered event photography SaaS designed for event photographers and their clients. The core value proposition is utilizing AI Face Recognition (InsightFace) to allow guests to find their photos instantly via a selfie upload from a large pool of event photos.

## 2. Four Roles Architecture
The platform is designed around 4 distinct roles:
- **DTC Super-Admin**: Platform managers overseeing the system.
- **Photographer/Studio**: Paying customers. They upload event photos, manage galleries, and define privacy controls.
- **Event Host/Client**: The person who hired the photographer, capable of viewing the gallery and sharing it.
- **Guest/User**: Event attendees who access the gallery, upload a selfie, and discover their photos.

## 3. Current Architecture
- **Frontend**: Next.js (App Router), Tailwind CSS, Framer Motion, Zustand.
- **Backend**: FastAPI (Python), REST APIs, Background Tasks.
- **AI Pipeline**: RetinaFace + InsightFace (ArcFace `buffalo_l` model).
- **Vector Search**: FAISS (Facebook AI Similarity Search).
- **Database**: Firebase Firestore (with local DB fallback for development).
- **Storage**: Abstracted `StorageProvider`. Currently implemented via local disk (`LocalStorageProvider`).

## 4. Verified Functionality (Milestone 1)
- **Local Storage Provider**: File uploads correctly store data locally and prevent Path Traversal vulnerabilities via UUID generation. File sizes and actual image contents (via Pillow) are validated.
- **Event Ownership**: Secure JWT verification (via Firebase ID tokens) ensures photographers can only list, view, and upload to events they own. Empty JWT secrets fail safely.
- **Real Previews**: The frontend gallery `/gallery/[id]` retrieves actual images via a proxy route (`GET /api/images/{photo_id}`). Guest auth tokens are properly verified before retrieving images from private events.
- **Privacy Controls**: Events default to private. Expiry checks are enforced on image retrieval.
- **Safe Development**: Mock authentication bypasses have been removed. The local database fallback securely persists state without tracking in version control.

## 5. Pending Work & Next Steps (Milestones 3+)
**COMPLETED: Milestone 2 (Google Drive BYOS)**
- Implemented `GoogleDriveProvider` extending the generic `StorageProvider`.
- Setup `/api/gdrive` OAuth routes allowing independent photographer authorization retaining token details encryptedly via `Fernet`.
- Cleaned unused mock features optimizing UI retrieval flows without leaking entire image responses to memory leveraging strictly temporary `objectUrl` streams natively.

**PROPOSAL: Milestone 3**
- **AI Face Recognition Roadmap**: Focus heavily on finalizing InsightFace model licensing resolution securely natively re-integrating proper FAISS indexing flows mapping group-photo consent configurations properly bypassing currently restricted components natively.

**Subsequent Milestones**
- **Universal Discovery**: Implement consent-based universal photo discovery across multiple events for eligible users.
- **Guest Authentication**: Implement secure JWT/magic links for guests so private galleries can be safely accessed without relying solely on open links.
- **Advanced Features**: Albums, Lightroom integration, WhatsApp bot, camera-to-cloud workflows, and subscriptions/billing.

## 6. Known Bugs & Limitations
- The system heavily relies on an in-memory/local JSON dictionary if Firebase is not connected, which limits production scaling until actual Firestore is verified.
- The `InsightFace` dependency is currently omitted from `requirements.txt` to prevent build failures until licensing is resolved.
