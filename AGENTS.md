# AGENTS.md — Shared AI Instructions for Clickworthy by DTC

This file governs all AI coding agents working on this repository (Antigravity, ChatGPT, Codex, Jules, etc.).
**All agents must read and adhere to these guidelines before proposing, modifying, or testing code.**

---

## 1. Project Overview & Architecture

Clickworthy by DTC is an AI-powered event photography platform allowing event guests to locate their photos from large pools of event photographs via a single selfie upload.

### Preserved Stack & Architecture:
- **Frontend**: Next.js 16 (App Router, React 19, Tailwind CSS v4, Lucide icons).
  - *Critical*: Next.js 16 dynamic route `params` are Promises and must be unwrapped via `React.use(params)`.
  - PWA: Progressive Web App compliant via `src/app/manifest.ts` and `public/sw.js`.
- **Backend**: FastAPI (Python 3.10+), Uvicorn server running on port `8000`.
- **AI Face Pipeline**: OpenCV YuNet (detection) and OpenCV SFace (recognition) using ONNX models residing in `backend/models/`.
  - **DO NOT** replace this pipeline with InsightFace or mock face recognition.
- **Vector Search**: FAISS (Facebook AI Similarity Search) CPU index for cosine/L2 distance face matching.
- **Authentication**: Firebase Authentication (Google OAuth) on client + JWT session tokens issued by FastAPI backend.
  - Client supports both popup (`signInWithPopup`) and full-page redirect (`signInWithRedirect`) with `getRedirectResult`.
  - Backend verifies tokens via Firebase Admin SDK when credentials are configured, with cryptographic RS256 validation against Google's public JWKS certs as fallback.
- **Database & Storage**:
  - Metadata: Firestore via Firebase Admin SDK with `LocalMockDB` JSON fallback for local development.
  - Files: Abstracted `StorageProvider` (Local filesystem storage + Google Drive BYOS OAuth).

---

## 2. Non-Negotiable Operational Rules

1. **Do Not Recreate Existing Features**: Always inspect the existing code first. Jules and prior sessions have implemented extensive core features. Do not start from scratch or duplicate modules.
2. **Never Commit Secrets**:
   - Never commit `.env`, `.env.local`, `firebase_credentials.json`, service account keys, or JWT secrets.
   - Ensure all credential files are listed in `.gitignore` before committing.
3. **No Authentication Bypasses**:
   - Never add mock login bypass buttons, fake auth tokens, or disabled guards for convenience.
   - Maintain real authentication, privacy checks, and tenant isolation at all times.
4. **Never Force-Push or Merge Without Approval**:
   - Create distinct feature branches for changes.
   - Open Pull Requests against the designated development branch (`feat/pr-1-foundation-8729560166700180768` or approved active branch).
   - Never run `git push --force` or merge PRs directly without explicit human approval.
5. **Factual & Tested Progress Reporting**:
   - Never claim an integration or feature works based solely on a passing build.
   - Run tests (`pytest` for backend, `npm run build` for frontend) and report actual pass/fail outcomes.
   - Label unverified items clearly as "Not Tested" or "In Progress".
6. **No Simultaneous Conflicting Edits**:
   - Do not allow multiple agents to modify the same source files without separate git branches.
   - Use GitHub branches and Pull Requests as the single source of truth for synchronization.

---

## 3. Communication & Coordination Workflow

At the start of every session or task:
1. Review `AGENTS.md` (this file) for overarching rules.
2. Review `docs/AI_HANDOFF.md` for current commit SHA, system status, and known blockers.
3. Review `docs/TASK_BOARD.md` to see what is Done, In Progress, Blocked, or Pending.
4. When a task or milestone concludes:
   - Update `docs/AI_HANDOFF.md` with latest commit SHA and verified test results.
   - Update `docs/TASK_BOARD.md` with current task status.
   - Append a concise, dated entry to `docs/AI_COMMUNICATION_LOG.md`.
