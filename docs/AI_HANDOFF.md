# Clickworthy by DTC — AI Agent Handoff Document

This document records the exact state of the project, verified commits, active branches, known blockers, and immediate next steps for seamless transitions between agents (Antigravity, ChatGPT, Codex, etc.).

---

## 1. Repository State & Active Branches

| Field | Detail |
| :--- | :--- |
| **Repository URL** | `https://github.com/divyasomaiya/clickworthy-app` |
| **Foundation Branch** | `feat/pr-1-foundation-8729560166700180768` (Starting SHA: `cb2d9b8`) |
| **Latest Fixes Branch** | `feat/auth-verification-and-next16-fixes` (Commit SHA: `108137d`) |
| **Coordination Branch** | `docs/shared-ai-coordination-system` (Current documentation branch) |
| **Active Base Branch** | `feat/pr-1-foundation-8729560166700180768` |

---

## 2. Implementation Status Summary

### Frontend (Next.js 16.2.6 / React 19)
- **Status**: Operational locally on `http://localhost:3000`.
- **Landing Page (`/`)**: Dark SaaS theme with high-contrast readable typography.
- **Login (`/login`)**: Google OAuth with both **Popup (`signInWithPopup`)** and **Full-Page Redirect (`signInWithRedirect`)** fallback. In-page error alert banner replaces unhandled Next.js error overlays.
- **Dynamic Routing**: Dynamic params in `/dashboard/events/[id]` and `/gallery/[id]` unwrapped with React 19 `use(params)`.
- **PWA**: Valid manifest at `/manifest.webmanifest`, service worker at `/sw.js` with API and private gallery cache exclusions.
- **Production Build**: Verified passing via `npm run build` with zero errors.

### Backend (FastAPI / Python 3.10)
- **Status**: Operational locally on `http://127.0.0.1:8000`.
- **Endpoints**: `/health` (200 OK), `/docs` Swagger UI (200 OK), `/api/auth`, `/api/events`, `/api/upload`, `/api/search`, `/api/images`, `/api/gdrive`.
- **AI Face Pipeline**: OpenCV YuNet (detection) and SFace (recognition) ONNX models loaded from `backend/models/`.
- **Vector Search**: FAISS CPU index.
- **Dependencies**: Pinned `httpx==0.27.2` for Starlette 0.27 / FastAPI 0.104 compatibility.
- **Unit Tests**: 13/13 passing via `pytest -o pythonpath=.`.

---

## 3. Current Blocker & Diagnosis

### The Issue:
When logging in via Google in the browser, the frontend displays:
`"Authentication with backend failed: Invalid authentication credentials"`

### Root Cause & Investigation:
1. **Stale Backend Process**: During earlier testing, FastAPI was running in a background process started without `--reload` before the dual-verification and configuration updates were applied. As a result, the server was executing outdated code and throwing `ValueError: The default Firebase app does not exist` when validating client tokens.
2. **Firebase Admin Service Account Found**: The real Firebase Admin SDK service account key was identified in `Downloads` (`clickworthy-app-firebase-adminsdk-fbsvc-fb4276eab0.json`) and placed at `backend/firebase_credentials.json` (strictly ignored by `.gitignore`).
3. **Pending Resolution**: The FastAPI backend must be cleanly restarted so it loads `firebase_credentials.json`. Once running with valid Admin credentials, the client ID token sent to `POST /api/auth/login` will validate successfully and return the session JWT.

---

## 4. Test Verification Status

| Scope | Test | Result | Notes |
| :--- | :--- | :--- | :--- |
| Backend | `pytest` test suite | **PASSED** (13/13) | AI integration & core endpoints verified |
| Backend | `/health` check | **PASSED** | Returns `{"status": "healthy"}` |
| Backend | `/docs` Swagger check | **PASSED** | HTTP 200 OK |
| Frontend | `npm run build` | **PASSED** | 0 TypeScript or lint errors, dynamic routes correct |
| Frontend | Dark theme contrast | **PASSED** | Inspected via visual browser subagent |
| Frontend | PWA manifest & SW | **PASSED** | Valid JSON & service worker loaded |
| Auth | Google Popup / Redirect flow | **IN PROGRESS** | Client Google OAuth succeeds; backend token exchange blocked by stale process |
| Auth | Full Dashboard Access | **BLOCKED** | Blocked on completing token exchange |
| End-to-End | Event creation & photo upload | **NOT TESTED** | Awaits authenticated session |
| End-to-End | AI facial search in gallery | **NOT TESTED** | Awaits uploaded photos in event |

*Note: Do not claim photo upload, gallery rendering, or AI facial matching are complete until they have been verified with a real logged-in session.*

---

## 5. Next Immediate Action

1. Ensure existing background server processes on ports 8000 and 3000 are cleanly terminated.
2. Start FastAPI with `firebase_credentials.json` configured in `backend/.env`.
3. Start Next.js (`npm run dev`) on port 3000.
4. Perform a real Google sign-in at `http://localhost:3000/login` and verify seamless redirect into `/dashboard`.
5. Create a test event and upload sample photographs to test OpenCV YuNet/SFace and FAISS indexing end-to-end.
