"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { getOrRefreshSession, logoutSession } from "@/lib/auth-session";

export default function DashboardPage() {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<any>(null);
  const [gdriveStatus, setGdriveStatus] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    let active = true;

    const fetchData = async () => {
      try {
        const token = await getOrRefreshSession();
        if (!token) {
          if (active) router.push("/login");
          return;
        }

        const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
        const headers = { Authorization: `Bearer ${token}` };

        const userRes = await fetch(`${apiUrl}/api/auth/me`, { headers });
        if (userRes.ok && active) {
          setUser(await userRes.json());
        }

        const eventsRes = await fetch(`${apiUrl}/api/events/me`, { headers });
        if (eventsRes.ok && active) {
          setEvents(await eventsRes.json());
        }
      } catch (e) {
        console.warn("Failed to fetch dashboard data", e);
      } finally {
        if (active) setLoading(false);
      }
    };

    fetchData();

    return () => {
      active = false;
    };
  }, [router]);

  const handleGDriveConnect = async () => {
    const token = localStorage.getItem("access_token");
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
    try {
      const res = await fetch(`${apiUrl}/api/gdrive/auth`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        window.location.href = data.authorization_url;
      } else {
        const err = await res.json().catch(() => null);
        const detail = err?.detail || "Unknown error";
        if (detail.includes("not configured")) {
          setGdriveStatus("Google Drive OAuth is not configured on the server. Ask your admin to set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.");
        } else {
          setGdriveStatus(`Failed to connect: ${detail}`);
        }
      }
    } catch (e) {
      setGdriveStatus("Network error connecting to Google Drive.");
    }
  };

  const handleGDriveDisconnect = async () => {
    const token = localStorage.getItem("access_token");
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
    try {
      const res = await fetch(`${apiUrl}/api/gdrive/disconnect`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        setUser({ ...user, gdrive_connected: false });
        setGdriveStatus(null);
      } else {
        setGdriveStatus("Failed to disconnect Google Drive.");
      }
    } catch (e) {
      setGdriveStatus("Network error disconnecting Google Drive.");
    }
  };

  const handleLogout = async () => {
    await logoutSession();
    router.push("/login");
  };

  if (loading)
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-slate-500 text-lg">Loading dashboard…</p>
      </div>
    );

  return (
    <div className="max-w-6xl mx-auto p-8">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 dark:text-white">
            My Events
          </h1>
          {user && (
            <p className="text-sm text-slate-500 mt-1">
              Signed in as {user.uid}
            </p>
          )}
        </div>
        <div className="flex gap-3 items-center">
          {user?.gdrive_connected ? (
            <Button
              variant="outline"
              className="text-red-500 border-red-200 hover:bg-red-50"
              onClick={handleGDriveDisconnect}
            >
              Disconnect Google Drive
            </Button>
          ) : (
            <Button
              variant="outline"
              className="border-blue-200 text-blue-600 hover:bg-blue-50"
              onClick={handleGDriveConnect}
            >
              Connect Google Drive
            </Button>
          )}
          <Button asChild>
            <Link href="/dashboard/create">Create New Event</Link>
          </Button>
          <Button variant="ghost" className="text-slate-500" onClick={handleLogout}>
            Sign Out
          </Button>
        </div>
      </div>

      {gdriveStatus && (
        <div className="mb-6 p-4 bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-700 rounded-lg text-amber-800 dark:text-amber-200 text-sm">
          ⚠️ {gdriveStatus}
        </div>
      )}

      {events.length === 0 ? (
        <div className="text-center py-24 bg-slate-50 dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800">
          <h3 className="text-xl font-semibold mb-2 text-slate-900 dark:text-white">
            No events yet
          </h3>
          <p className="text-slate-500 mb-6">
            Create your first event to start uploading photos.
          </p>
          <Button asChild variant="outline">
            <Link href="/dashboard/create">Create Event</Link>
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {events.map((event: any) => (
            <div
              key={event.id}
              className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 rounded-xl"
            >
              <h3 className="text-xl font-bold text-slate-900 dark:text-white">
                {event.name}
              </h3>
              <p className="text-slate-500 mb-4">
                {event.client_name} • {event.date}
              </p>
              <div className="flex gap-2">
                <Button asChild className="flex-1" variant="outline">
                  <Link href={`/dashboard/events/${event.id}`}>
                    Manage Event
                  </Link>
                </Button>
                <Button
                  asChild
                  variant="ghost"
                  className="text-blue-600"
                >
                  <Link href={`/gallery/${event.id}`}>Gallery</Link>
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
