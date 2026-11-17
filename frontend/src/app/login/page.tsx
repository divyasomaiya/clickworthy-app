"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { auth, googleProvider } from "@/lib/firebase";
import { getOrRefreshSession } from "@/lib/auth-session";
import { signInWithPopup, signInWithRedirect, getRedirectResult } from "firebase/auth";
import { useRouter } from "next/navigation";
import { AlertCircle, ExternalLink, RefreshCw } from "lucide-react";

export default function LoginPage() {
  const [loading, setLoading] = useState(false);
  const [checkingExistingSession, setCheckingExistingSession] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showRedirectHelp, setShowRedirectHelp] = useState(false);
  const router = useRouter();

  // Exchange Firebase ID Token with our FastAPI backend
  const exchangeTokenAndRedirect = async (idToken: string) => {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
    const res = await fetch(`${apiUrl}/api/auth/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ id_token: idToken }),
    });

    if (!res.ok) {
      let detail = `Backend returned HTTP ${res.status}`;
      try {
        const errJson = await res.json();
        if (errJson.detail) detail = errJson.detail;
      } catch (_) {}
      throw new Error(`Authentication with backend failed: ${detail}`);
    }

    const data = await res.json();
    if (data.access_token) {
      localStorage.setItem("access_token", data.access_token);
      router.push("/dashboard");
    } else {
      throw new Error("No access token returned by backend.");
    }
  };

  const mapAuthError = (error: any) => {
    const code = error?.code || "";
    console.warn("Firebase Auth Notice:", code, error);

    if (code === "auth/popup-closed-by-user") {
      setErrorMessage(
        "The Google sign-in popup was closed before completing. If it got stuck on the auth handler, your browser may be partitioning storage. Please try 'Sign In with Redirect' below."
      );
      setShowRedirectHelp(true);
    } else if (code === "auth/popup-blocked") {
      setErrorMessage(
        "The sign-in popup was blocked by your browser. Please allow popups for localhost:3000 or click 'Sign In with Redirect' below."
      );
      setShowRedirectHelp(true);
    } else if (code === "auth/unauthorized-domain") {
      setErrorMessage(
        "Firebase Error: 'localhost' is not in the Authorized Domains list for project 'clickworthy-app'. Go to Firebase Console -> Authentication -> Settings -> Authorized Domains and add 'localhost'."
      );
    } else if (code === "auth/operation-not-allowed") {
      setErrorMessage(
        "Firebase Error: Google Sign-in provider is disabled. Go to Firebase Console -> Authentication -> Sign-in method -> Google and click 'Enable'."
      );
    } else if (code === "auth/network-request-failed") {
      setErrorMessage("Network request failed. Please check your internet connection and try again.");
    } else {
      setErrorMessage(error?.message || "An unexpected error occurred during sign-in.");
    }
  };

  // Check for existing persistent session or incoming redirect result on mount
  useEffect(() => {
    let active = true;

    const checkSession = async () => {
      // 1. Check if redirect result is pending
      try {
        const redirectResult = await getRedirectResult(auth);
        if (redirectResult && active) {
          setLoading(true);
          const idToken = await redirectResult.user.getIdToken();
          await exchangeTokenAndRedirect(idToken);
          return;
        }
      } catch (err: any) {
        if (active) mapAuthError(err);
      }

      // 2. Check if a valid session already exists or can be auto-recovered
      try {
        const validToken = await getOrRefreshSession();
        if (validToken && active) {
          router.push("/dashboard");
          return;
        }
      } catch (_) {}

      if (active) {
        setCheckingExistingSession(false);
      }
    };

    checkSession();

    return () => {
      active = false;
    };
  }, [router]);

  const handlePopupLogin = async () => {
    setLoading(true);
    setErrorMessage(null);
    try {
      const result = await signInWithPopup(auth, googleProvider);
      const idToken = await result.user.getIdToken();
      await exchangeTokenAndRedirect(idToken);
    } catch (error: any) {
      mapAuthError(error);
    } finally {
      setLoading(false);
    }
  };

  const handleRedirectLogin = async () => {
    setLoading(true);
    setErrorMessage(null);
    try {
      await signInWithRedirect(auth, googleProvider);
    } catch (error: any) {
      mapAuthError(error);
      setLoading(false);
    }
  };

  if (checkingExistingSession) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950 p-4">
        <div className="flex flex-col items-center gap-3 text-slate-500">
          <RefreshCw className="w-6 h-6 animate-spin text-blue-600" />
          <p className="text-sm font-medium">Verifying session…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950 p-4">
      <div className="max-w-md w-full bg-white dark:bg-slate-900 p-8 rounded-xl shadow-lg text-center border border-slate-200 dark:border-slate-800">
        <h1 className="text-3xl font-bold mb-2 text-slate-900 dark:text-white">Welcome Back</h1>
        <p className="text-slate-500 dark:text-slate-400 mb-6">Sign in to your photographer dashboard</p>

        {errorMessage && (
          <div className="mb-6 p-4 rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 text-left">
            <div className="flex gap-3 items-start">
              <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-red-700 dark:text-red-300 leading-relaxed">
                {errorMessage}
              </div>
            </div>
          </div>
        )}

        <div className="space-y-3">
          <Button
            className="w-full h-12 text-base font-medium flex items-center justify-center gap-3 bg-white text-slate-800 border border-slate-300 hover:bg-slate-50 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100 shadow-sm cursor-pointer"
            onClick={handlePopupLogin}
            disabled={loading}
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path
                fill="#4285F4"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="#34A853"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="#FBBC05"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
              />
              <path
                fill="#EA4335"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
              />
            </svg>
            {loading ? "Signing in..." : "Continue with Google (Popup)"}
          </Button>

          <Button
            variant="outline"
            className="w-full h-11 text-sm font-normal flex items-center justify-center gap-2 border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
            onClick={handleRedirectLogin}
            disabled={loading}
          >
            <ExternalLink className="w-4 h-4" />
            Sign in with Redirect (Recommended if popup fails)
          </Button>
        </div>

        <div className="mt-6 pt-6 border-t border-slate-200 dark:border-slate-800 text-xs text-slate-400">
          Clickworthy by DTC &bull; Secure Authentication
        </div>
      </div>
    </div>
  );
}
