# Clickworthy by DTC — AI Task Board

Track project tasks, ownership, and status across AI sessions.

---

## 1. Done (Verified & Merged/Committed)

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
| **Backend Test Suite** | Verified all 13 backend unit tests pass (`pytest -o pythonpath=.`). | Commit `108137d` | 2026-11-17 |
| **Production Build** | Verified clean Next.js production build (`npm run build`). | Commit `108137d` | 2026-11-17 |

---

## 2. In Progress

| Task | Description | Assigned / Notes |
| :--- | :--- | :--- |
| **Shared AI Coordination System** | Creating `AGENTS.md`, `AI_HANDOFF.md`, `TASK_BOARD.md`, and `AI_COMMUNICATION_LOG.md`. | Branch `docs/shared-ai-coordination-system` |
| **Firebase Admin Token Validation** | Restarting FastAPI backend with real `firebase_credentials.json` to complete token exchange. | In progress |

---

## 3. Blocked

| Task | Blocker Description | Resolution Path |
| :--- | :--- | :--- |
| **Event Creation & Management** | Blocked on successful authentication into photographer dashboard. | Complete backend token verification restart. |
| **Sample Photo Upload** | Blocked on event creation and authenticated session token. | Complete backend token verification restart. |
| **AI Facial Recognition Search** | Blocked on having indexed photos in event gallery. | Upload test photos after authentication succeeds. |
| **Android APK (TWA / Bubblewrap)** | Requires a deployed HTTPS production or staging domain with `assetlinks.json`. | Deploy staging frontend to Vercel first. |

---

## 4. Pending (Future Milestones)

| Task | Description | Priority |
| :--- | :--- | :--- |
| **Staging Deployment (Frontend)** | Deploy Next.js frontend to Vercel with HTTPS. | High |
| **Staging Deployment (Backend)** | Deploy FastAPI Docker backend to Render Standard tier (1–2GB RAM for ONNX models). | High |
| **Tenant Isolation Audit** | Verify photographer ownership boundaries on image downloads and private event queries. | Medium |
| **Google Drive BYOS OAuth Test** | Test end-to-end photo sync to photographer Google Drive. | Medium |
| **Mobile App (Android TWA)** | Generate Android `.apk` via Bubblewrap targeting deployed HTTPS URL. | Medium |
| **Mobile App (iOS Planning)** | Evaluate WKWebView native wrapper vs React Native bridge. | Low |

---

## 5. Next Recommended Action

1. Merge or retain PR for `feat/auth-verification-and-next16-fixes`.
2. Stop background task processes on ports 8000 and 3000.
3. Start FastAPI using `.\.venv\Scripts\uvicorn.exe app.main:app --port 8000 --reload` with `firebase_credentials.json` loaded.
4. Test real Google login from Chrome browser at `http://localhost:3000/login`.
5. Verify redirection into `http://localhost:3000/dashboard`.
