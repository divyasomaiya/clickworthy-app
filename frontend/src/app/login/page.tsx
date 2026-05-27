"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { auth, googleProvider } from "@/lib/firebase";
import { signInWithPopup } from "firebase/auth";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleLogin = async () => {
    setLoading(true);
    try {
      let idToken = "mock-token";
      try {
        const result = await signInWithPopup(auth, googleProvider);
        idToken = await result.user.getIdToken();
      } catch (fbError) {
        console.warn("Firebase sign-in skipped or failed. Using mock-token for local testing:", fbError);
      }

      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
      const res = await fetch(`${apiUrl}/api/auth/login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ id_token: idToken })
      });

      const data = await res.json();
      if (data.access_token) {
        localStorage.setItem("access_token", data.access_token);
        router.push("/dashboard");
      }
    } catch (error) {
      console.error("Login failed", error);
    } finally {
      setLoading(false);
    }
  };

  const handleBypassLogin = async () => {
    setLoading(true);
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
      const res = await fetch(`${apiUrl}/api/auth/login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ id_token: "mock-token" })
      });

      const data = await res.json();
      if (data.access_token) {
        localStorage.setItem("access_token", data.access_token);
        router.push("/dashboard");
      }
    } catch (error) {
      console.error("Bypass login failed", error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950">
      <div className="max-w-md w-full bg-white dark:bg-slate-900 p-8 rounded-xl shadow-lg text-center">
        <h1 className="text-3xl font-bold mb-2">Welcome Back</h1>
        <p className="text-slate-500 mb-8">Sign in to your photographer dashboard</p>
        <div className="space-y-4">
          <Button
            className="w-full h-12 text-lg flex items-center justify-center gap-2"
            onClick={handleLogin}
            disabled={loading}
          >
            {loading ? "Signing in..." : "Continue with Google"}
          </Button>
          <Button
            variant="outline"
            className="w-full h-12 text-md flex items-center justify-center gap-2 border-slate-300 dark:border-slate-700"
            onClick={handleBypassLogin}
            disabled={loading}
          >
            Bypass Google Login (Local Dev Mode)
          </Button>
        </div>
      </div>
    </div>
  );
}
