import { auth } from "./firebase";

/**
 * Retrieves a valid backend JWT session token, automatically recovering or renewing
 * it from Firebase Auth persistence (IndexedDB/localStorage) if missing or expired.
 *
 * Avoids repeated Google login popups on page reload or new tab opens while
 * strictly respecting explicit sign-outs and session revocations.
 */
export async function getOrRefreshSession(): Promise<string | null> {
  if (typeof window === "undefined") return null;

  const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
  const existingToken = localStorage.getItem("access_token");

  // 1. Fast-path: Verify existing access_token against backend
  if (existingToken) {
    try {
      const res = await fetch(`${apiUrl}/api/auth/me`, {
        headers: { Authorization: `Bearer ${existingToken}` },
      });
      if (res.ok) {
        return existingToken;
      }
    } catch (_) {
      // Temporary network issue: return existing token for graceful offline behavior
      return existingToken;
    }
  }

  // 2. Token is missing or was rejected (e.g. expired or backend secret rotated).
  // Check if Firebase Auth has an active persistent user in IndexedDB.
  try {
    await auth.authStateReady();
    const currentUser = auth.currentUser;
    if (!currentUser) {
      // User is truly logged out
      return null;
    }

    // 3. Acquire fresh ID token from Firebase and exchange with backend
    const idToken = await currentUser.getIdToken(false);
    const loginRes = await fetch(`${apiUrl}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id_token: idToken }),
    });

    if (loginRes.ok) {
      const data = await loginRes.json();
      if (data.access_token) {
        localStorage.setItem("access_token", data.access_token);
        return data.access_token;
      }
    } else {
      console.warn("Backend token exchange failed with status:", loginRes.status);
    }
  } catch (err) {
    console.warn("Session auto-recovery encountered error:", err);
  }

  return null;
}

/**
 * Explicitly terminates both the backend and Firebase authentication sessions.
 */
export async function logoutSession(): Promise<void> {
  if (typeof window === "undefined") return;
  try {
    await auth.signOut();
  } catch (err) {
    console.warn("Firebase sign-out error:", err);
  } finally {
    localStorage.removeItem("access_token");
  }
}
