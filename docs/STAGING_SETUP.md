# CLICKWORTHY BY DTC - Private Staging Setup

## 1. Hosting Providers Strategy
Deploying Clickworthy requires robust memory management (Python models) combined with Next.js dynamic routing operations avoiding purely static export limitations.

**Frontend (Next.js Application)**
The most native and stable execution environment providing automatic edge deployment utilizing native `.env.local` configurations is **Vercel**. Cloudflare Pages requires strict Edge Runtime compatibility causing complications deploying complex Next.js frameworks seamlessly.

*Setup via Vercel:*
1. Connect Vercel explicitly tracking the `frontend` folder path from the GitHub Repository.
2. Under "Environment Variables", assign the variables established in `.env.example`: `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_FIREBASE_API_KEY` etc.
3. Keep `npm run build` as the default deploy command implicitly handled natively resolving Next 16 dynamic paths efficiently.

**Backend (FastAPI Application)**
The OpenCV AI structure strictly requires memory limits typically bypassing free tier execution sizes natively (1-2GBs RAM minimum). Using **Render Standard Tier** or **AWS EC2 (t3.micro/medium)** provides Linux runtime execution environments preserving ONNX weight dependencies flawlessly natively.

*Setup via Render (Recommended for preview):*
1. Connect Render utilizing a "Web Service" tracking the `backend` folder explicitly mapped properly natively.
2. Select Docker as the Runtime mapping the default `backend/Dockerfile` ensuring `uvicorn` fires properly on port `8000`.
3. Provide `.env` secrets directly mapping `JWT_SECRET_KEY`, `ENCRYPTION_KEY`, and `FIREBASE_CREDENTIALS`.
4. Ensure volume persistence `backend_uploads` maps effectively retaining images testing securely dynamically checking volumes inherently retaining states precisely natively.

## 2. Capacitor Evaluation
Migrating this `Next.js` interface executing inside Capacitor generating native **Android APK / iOS** builds executes natively wrapping mobile WebView clients dynamically executing interfaces smoothly retaining shared backend operations dynamically effectively cleanly scaling capabilities flawlessly executing logic structurally inherently.
