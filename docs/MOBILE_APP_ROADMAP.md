# Clickworthy Mobile App Roadmap

This document outlines the strategy for expanding the Clickworthy platform from a responsive web application to native installable applications for Android and iOS.

## 1. PWA (Progressive Web App) - Current State
**Status: Implemented**
The Next.js 16 frontend is configured as an installable PWA.
- Uses `manifest.ts` for dynamic Next.js App Router manifest generation.
- Service Worker (`sw.js`) caches static assets and an `offline.html` fallback.
- **Security Check:** API routes, dynamic galleries, authentication, and user photos are strictly excluded from the service worker cache to ensure privacy and immediate expiration.

## 2. Android APK Integration (Bubblewrap / TWA)
**Status: Prepared for Antigravity**
Given our Next.js backend uses dynamic rendering (`use(params)`), we cannot easily export it to static HTML for Capacitor without significant architectural rewrites. The most efficient route to the Google Play Store is a Trusted Web Activity (TWA) via Bubblewrap.

**Requirements:**
- A deployed Next.js frontend with HTTPS.
- Android Studio / Android SDK (Java 17+, Gradle 8+).
- The `assetlinks.json` file hosted at `/.well-known/assetlinks.json` on the Next.js server to verify domain ownership.

**Execution Steps (Local/CI):**
1. Install Bubblewrap CLI: `npm i -g @bubblewrap/cli`.
2. Run `bubblewrap init --manifest https://YOUR_PROD_URL/manifest.webmanifest`.
3. Follow prompts to generate Android keystores.
4. Run `bubblewrap build` to generate the `.apk` and `.aab`.

*Note: Jules verified the environment has Java 21, Gradle 8.8, and Android SDK, and installed Bubblewrap. A test build could not be run because Bubblewrap requires an interactive setup and a deployed HTTPS manifest.*

## 3. iOS Integration Strategy
**Status: Planning Phase**
iOS restricts TWAs, meaning a direct web-wrapper to the App Store requires careful planning.
- **Option A (CapacitorJS):** Cannot be used directly with Next.js dynamic routing unless the app is rewritten to support `output: 'export'`.
- **Option B (WKWebView Native App):** Create a minimal Swift app that loads the Next.js URL in a `WKWebView`. Requires implementing native bridges for the Camera and Photo Picker.
- **Option C (React Native):** Rebuild the UI layer in React Native while sharing the existing FastAPI backend.

## 4. Native Capabilities Considerations
- **Camera/Photo Picker:** The web-based `<input type="file" capture="environment">` works well in PWAs and TWAs.
- **OAuth (Google Drive):** Next.js handles Google OAuth. In a TWA, OAuth will trigger a Custom Tab, seamlessly redirecting back to the app without losing session state.
