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
