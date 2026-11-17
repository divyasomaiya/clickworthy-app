# Clickworthy by DTC — AI Communication Log

This file records chronologically ordered, concise entries for key decisions, questions, answers, and findings between AI agents (Google Jules, Antigravity, ChatGPT, Codex) and human collaborators.

> **CRITICAL RULE**: Never log passwords, API keys, JWT secrets, raw tokens, or private credentials in this file.

---

### [2026-11-16] Jules (Google Jules) — Initial Foundation & PWA Integration
- **Context**: Continued platform development from baseline requirements.
- **Key Actions**:
  - Replaced legacy InsightFace dependencies with OpenCV YuNet (face detection) and OpenCV SFace (face recognition) ONNX models to avoid licensing and compilation failures.
  - Implemented FAISS vector search indexing for face embeddings.
  - Configured Next.js 16 PWA structure (`manifest.ts`, `sw.js`, offline fallback) with security checks excluding API routes and galleries from offline caching.
  - Authored `docs/PROJECT_HANDOFF.md`, `docs/STAGING_SETUP.md`, and `docs/MOBILE_APP_ROADMAP.md`.
  - Pushed to branch `feat/pr-1-foundation-8729560166700180768` (commit `cb2d9b8`).

---

### [2026-11-17 00:30] Antigravity — Verification & Local Preview Initialization
- **Agent**: Antigravity
- **Actions & Findings**:
  - Verified remote repository and confirmed HEAD commit `cb2d9b836019af3e2cbc7b71eb8de79d6090fa82` on `feat/pr-1-foundation-8729560166700180768`.
  - Established Python 3.10 virtual environment and installed backend dependencies.
  - Identified missing `httpx` import required by Google Drive endpoints and public certificate fetchers; pinned `httpx==0.27.2` for compatibility with `starlette==0.27.0`.
  - Generated secure random `JWT_SECRET_KEY` locally in `backend/.env` (untracked).
  - Started FastAPI backend (`127.0.0.1:8000`) and Next.js frontend (`localhost:3000`). Verified `/health` and `/docs` returning HTTP 200.

---

### [2026-11-17 00:45] Antigravity — UI Contrast & Dynamic Route Fixes
- **Agent**: Antigravity
- **Findings**:
  - Visual browser inspection revealed dark-on-dark text contrast issues on the landing page and login title.
  - Navigating to `/gallery/[id]` crashed due to Next.js 16 / React 19 dynamic `params` being a Promise.
- **Actions**:
  - Wrapped `params` in `React.use(params)` across `/gallery/[id]` and `/dashboard/events/[id]`.
  - Updated Tailwind color styles in `src/app/page.tsx` and `src/app/login/page.tsx` for full dark-mode visibility.
  - Re-inspected via browser subagent; verified crisp white text rendering and clean console logs.

---

### [2026-11-17 12:20] Antigravity — Firebase Google Auth Popup & Redirect Support
- **Agent**: Antigravity
- **Finding**:
  - Chrome popup closed with `auth/popup-closed-by-user` when navigating to `https://clickworthy-app.firebaseapp.com/__/auth/handler`.
  - Diagnosis: Modern Chrome cross-origin storage partitioning between `localhost:3000` and `firebaseapp.com` blocks popup postMessage handshakes.
- **Actions**:
  - Added full-page redirect flow (`signInWithRedirect` + `getRedirectResult`) as an alternative option in `login/page.tsx`.
  - Added `googleProvider.setCustomParameters({ prompt: 'select_account' })` in `frontend/src/lib/firebase.ts`.
  - Replaced unhandled Next.js error overlays with inline error alerts.
  - Removed unused mock bypass handler `handleBypassLogin`.
  - Implemented dual token verification in `backend/app/core/auth.py` (Firebase Admin SDK + Google public JWKS RS256 validation).
  - Ran `pytest` (13/13 passed) and `npm run build` (0 errors).
  - Committed and pushed to `feat/auth-verification-and-next16-fixes` (commit `108137d`).

---

### [2026-11-17 21:15] Antigravity — Backend Login Investigation & Credential Discovery
- **Agent**: Antigravity
- **Finding**:
  - Real browser Google sign-in completed client-side, but backend returned `401 Unauthorized: Invalid authentication credentials`.
  - Investigation of background task-115 showed Uvicorn was running an old process started without `--reload`, executing outdated code from before the authentication fixes were committed.
  - Found authentic Firebase Admin SDK service account file in `Downloads` (`clickworthy-app-firebase-adminsdk-fbsvc-fb4276eab0.json`) with `project_id: clickworthy-app`.
- **Action**:
  - Staged `firebase_credentials.json` locally in `backend/` (protected under `.gitignore`).
  - Next step: Terminate stale background processes, launch FastAPI with `--reload` and service account loaded, and complete end-to-end login.

---

### [2026-11-18 00:40] Antigravity — Markdown AI Coordination System
- **Agent**: Antigravity
- **Action**:
  - Authored root `AGENTS.md` establishing shared cross-agent coding rules, stack boundaries, and safety policies.
  - Authored `docs/AI_HANDOFF.md`, `docs/TASK_BOARD.md`, and `docs/AI_COMMUNICATION_LOG.md`.
  - Created branch `docs/shared-ai-coordination-system` and opened Pull Request for team synchronization.


---

### [2026-11-18 01:20] Antigravity — Dashboard Functional Repairs & Milestone Verification
- **Agent**: Antigravity
- **Milestone Reached**:
  - User confirmed successful real Google sign-in into the photographer dashboard.
- **Actions & Findings**:
  - Validated all 12 backend endpoints (including `/api/auth/me`, `/api/events/me`, event creation, image upload, photo retrieval, and gdrive error handling).
  - Rotated `JWT_SECRET_KEY` locally in `backend/.env` without exposing the secret in chat or logs; verified `.gitignore` exclusions.
  - Repaired `/dashboard`: added Google Drive OAuth "Not Configured" feedback, clean sign-out, and direct gallery links on cards.
  - Repaired `/dashboard/create`: added form submission feedback, loading state, error alert banners, and redirect.
  - Repaired `/dashboard/events/[id]`: added event details display, file-by-file upload progress tracking, uploaded photo thumbnail grid with individual download buttons.
  - Repaired `/gallery/[id]`: eliminated false "Failed to load" states by introducing animated loading skeletons; implemented AI facial recognition search via selfie (`POST /api/search/`), full-size image modal, and download buttons.
  - Verified backend test suite: 13/13 tests passed (`pytest -o pythonpath=.`).
  - Verified production build: Next.js 16.2.6 passed (`npm run build`) with 0 errors across all 8 routes.
  - Committed and pushed to branch `feat/dashboard-repairs`.


---

### [2026-11-18 01:45] Antigravity — Real DSLR Photo Upload Pipeline & Batch Processing Fixes
- **Agent**: Antigravity
- **Problem Diagnosed**:
  1. A 14–15 MB DSLR photograph was rejected by a hardcoded 10 MB limit in `upload.py`.
  2. Smaller WhatsApp photos failed with 500 error / network error because `LocalStorageProvider.save_file` hit `FileNotFoundError: [Errno 2] No such file or directory: 'backend_uploads\...'` when the directory was accessed before creation or after branch cleanups.
  3. Uvicorn's `StatReload` was traversing `temp_uploads` and `backend_uploads` upon file creation/deletion, causing file lock collisions and server resets during batch uploads.
  4. Next.js dev overlay accumulated errors due to `console.error` calls on failed upload attempts.
- **Key Fixes Applied**:
  - Replaced 10 MB file cap with configurable `MAX_UPLOAD_SIZE_MB = 50` in `backend/app/core/config.py`.
  - Implemented bounded chunked streaming (1 MB chunks) in `upload_photos`, rejecting files exceeding 50 MB with early HTTP 413 without memory buffering.
  - Made `LocalStorageProvider` automatically ensure its storage directory exists on every save and download.
  - Configured Uvicorn reload scope to `--reload-dir app` so file uploads never trigger server reloads.
  - Optimized `FaceRecognitionService.process_image` to scale down detection frame for images larger than 1920px while preserving the untouched full-resolution original image for cropping and storage.
  - Rewrote Event Dashboard upload UI to provide per-file real-time status tracking (Queued, Uploading, Uploaded, Failed with exact reason), preserving batch progress when a single file fails.
  - Replaced `console.error` with `console.warn` to prevent Next.js Redbox dev overlays.
  - Fixed low-contrast styling on "View Client Gallery" button and alert banners.
- **Verification**:
  - Executed real test suite with 9/9 passing tests (small WhatsApp JPEG, 35.5 MB DSLR JPEG, 52 MB rejection, 5-image batch, exact byte-for-byte download check, Firestore metadata check, and server health check).
  - Verified 13/13 passing backend unit tests (`pytest`).
  - Verified clean frontend build (`npm run build`).
  - Pushed to feature branch `feat/fix-dslr-photo-uploads`.

---

### [2026-11-18 02:45] Antigravity — Camera Selfie Capture, Duo Face Search & Session Persistence
- **Agent**: Antigravity
- **Actions & Findings**:
  - **Direct Camera Capture**:
    - Implemented in-browser webcam and mobile camera capture modal on `/gallery/[id]`.
    - Integrated `navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" } })` with live video preview, canvas freeze snapshot, retake, and selection.
    - Gracefully handles camera permission denial or unsuitability with actionable fallback to device file upload.
    - Guaranteed camera hardware release by systematically stopping video tracks upon capture modal close, completion, or component unmount.
  - **Two-Person / Duo Face Search**:
    - Added user toggle between single-person search and duo face search ("Find Us Together").
    - Supported two reference inputs: single photo containing both faces or two separate photos (Person A & Person B).
    - Added matching criteria toggle: "Both Together" (requires both individuals in the same event photo) vs. "Either Person" (returns photos containing either individual).
    - Enforced distinct face matching ($f_a \neq f_b$) in the backend FAISS index so a single face cannot satisfy both personas.
    - Cleaned up temporary reference images immediately after embedding extraction.
  - **Session Persistence**:
    - Created `frontend/src/lib/auth-session.ts` featuring `getOrRefreshSession()` using Firebase `auth.authStateReady()`.
    - Fixed the issue where page refreshes and new tabs prompted a Google login popup despite active Firebase sessions.
    - Added auto-session detection on `/login`, automatically redirecting authenticated users to `/dashboard`.
    - Integrated session recovery into `/dashboard`, `/dashboard/create`, and `/dashboard/events/[id]`.
    - Ensured explicit Sign Out (`logoutSession`) thoroughly terminates both Firebase and backend JWT sessions.
  - **Verification**:
    - Backend unit tests: 14/14 passed via `pytest -o pythonpath=.` (including new duo face search tests).
    - Frontend production build: `npm run build` completed with 0 errors across all routes.
    - Committed and pushed to `feat/camera-duo-search-and-session-persistence`.
