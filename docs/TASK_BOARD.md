# Clickworthy by DTC — AI Task Board

Track project tasks, ownership, and status across AI sessions.

---

## 1. Done (Verified & Committed)

| Task | Description | Reference / Commit | Date |
| :--- | :--- | :--- | :--- |
| **Verify Jules Branch** | Cloned and verified starting commit `cb2d9b8` on branch `feat/pr-1-foundation-8729560166700180768`. | Commit `cb2d9b8` | 2026-11-17 |
| **Local Dev Setup** | Created Python 3.10 virtual environment, installed backend dependencies, ran `npm ci` for frontend. | Local setup | 2026-11-17 |
| **Missing Dep Fix** | Pinned `httpx==0.27.2` in `requirements.txt` for Starlette 0.27 compatibility. | Commit `108137d` | 2026-11-17 |
| **Next.js 16 Dynamic Params** | Resolved React 19 Promise dynamic route params using `React.use(params)` in `/gallery/[id]` and `/dashboard/events/[id]`. | Commit `108137d` | 2026-11-17 |
| **UI Contrast Fix** | Fixed dark-on-dark invisible headings and logo on landing page. | Commit `108137d` | 2026-11-17 |
| **Firebase Auth Fallback** | Implemented `signInWithRedirect` + `getRedirectResult(auth)` and in-page alert banners in `/login`. | Commit `108137d` | 2026-11-17 |
| **Dual Token Verification** | Added RS256 public JWKS certificate token verification fallback in FastAPI backend. | Commit `108137d` | 2026-11-17 |
| **PWA Compliance** | Verified `/manifest.webmanifest` and `/sw.js` with security-conscious cache boundaries. | Commit `cb2d9b8` | 2026-11-17 |
| **Real Google OAuth Flow** | User verified real Google sign-in into photographer dashboard. | Milestone | 2026-11-18 |
| **Backend Integration Suite** | Passed all 12 backend endpoint tests (health, auth, events, upload, photos, images, gdrive). | Verified | 2026-11-18 |
| **JWT Secret Rotation** | Rotated `JWT_SECRET_KEY` locally twice without exposure in logs or chat. | Local `.env` | 2026-11-18 |
| **Dashboard UI Overhaul** | Added status alerts, Google Drive OAuth "Not Configured" handling, event management. | Branch `feat/dashboard-repairs` | 2026-11-18 |
| **Create Event Flow** | End-to-end form validation, Firestore document creation, redirection. | Branch `feat/dashboard-repairs` | 2026-11-18 |
| **Event Photo Upload & Manage** | Multi-file photo upload with real-time progress, photo thumbnails with download. | Branch `feat/dashboard-repairs` | 2026-11-18 |
| **Client Gallery & AI Search** | Fixed loading bug, added selfie search (`/api/search/`), full-screen modal, download buttons. | Branch `feat/dashboard-repairs` | 2026-11-18 |
| **DSLR & Batch Photo Uploads** | 50 MB bounded chunk streaming, YuNet aspect scaling for 45MP images, per-file batch UI, exact original download parity. | Branch `feat/fix-dslr-photo-uploads` | 2026-11-18 |
| **Backend Unit Tests** | 14/14 passing via `pytest -o pythonpath=.` (including duo face matching). | Verified | 2026-11-18 |
| **Production Build** | Clean `npm run build` with 8/8 routes compiled. | Verified | 2026-11-18 |
| **Direct Camera Capture** | Live webcam / mobile camera capture with preview, retake, and track stop in client gallery. | Branch `feat/camera-duo-search-and-session-persistence` | 2026-11-18 |
| **Two-Person / Duo Face Search** | Duo search supporting both "Together" (distinct faces) and "Either" modes, dual or single reference photo. | Branch `feat/camera-duo-search-and-session-persistence` | 2026-11-18 |
| **Session Persistence** | Automatic silent session renewal via `authStateReady()` preventing redundant Google login popups on reload/tab open. | Branch `feat/camera-duo-search-and-session-persistence` | 2026-11-18 |

---

## 2. In Progress

| Task | Description | Assigned / Notes |
| :--- | :--- | :--- |
| **Camera & Duo Search PR** | Pushing verified changes to `feat/camera-duo-search-and-session-persistence` and opening PR against `feat/fix-dslr-photo-uploads`. | Antigravity |

---

## 3. Blocked

| Task | Blocker Description | Resolution Path |
| :--- | :--- | :--- |
| **Android APK (TWA / Bubblewrap)** | Requires a deployed HTTPS production or staging domain with `assetlinks.json`. | Deploy staging frontend to Vercel first. |

---

## 4. Pending (Future Milestones)

| Task | Description | Priority |
| :--- | :--- | :--- |
| **Staging Deployment (Frontend)** | Deploy Next.js frontend to Vercel with HTTPS. | High |
| **Staging Deployment (Backend)** | Deploy FastAPI Docker backend to Render Standard tier (1–2GB RAM for ONNX models). | High |
| **Google Drive OAuth Production Keys** | Configure real Google Cloud OAuth Client ID & Secret for BYOS drive storage. | Medium |
| **Mobile App (Android TWA)** | Generate Android `.apk` via Bubblewrap targeting deployed HTTPS URL. | Medium |
| **Mobile App (iOS Planning)** | Evaluate WKWebView native wrapper vs React Native bridge. | Low |

---

## 5. Next Recommended Action

1. Review and merge PR for `feat/dashboard-repairs` into `feat/auth-verification-and-next16-fixes`.
2. Configure staging hosting for frontend (Vercel) and backend (Render / Cloud Run).
3. Connect custom domain / HTTPS endpoints for Android TWA generation.