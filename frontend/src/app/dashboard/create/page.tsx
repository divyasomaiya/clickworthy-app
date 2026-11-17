"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { getOrRefreshSession } from "@/lib/auth-session";

export default function CreateEvent() {
  const [name, setName] = useState("");
  const [clientName, setClientName] = useState("");
  const [date, setDate] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSubmitting(true);

    try {
      const token = await getOrRefreshSession();
      if (!token) {
        router.push("/login");
        return;
      }

      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
      const res = await fetch(`${apiUrl}/api/events/`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name,
          client_name: clientName,
          date,
          is_private: true,
        }),
      });

      if (res.status === 401) {
        const freshToken = await getOrRefreshSession();
        if (!freshToken) {
          router.push("/login");
          return;
        }
        setError("Session renewed — please click Create again.");
        return;
      }

      if (!res.ok) {
        const err = await res.json().catch(() => null);
        setError(err?.detail || `Server error (${res.status})`);
        return;
      }

      const data = await res.json();
      if (data.event_id) {
        router.push(`/dashboard/events/${data.event_id}`);
      } else {
        setError("Event was created but no event ID was returned.");
      }
    } catch (err) {
      setError("Network error — could not reach the server.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto p-8">
      <div className="mb-8">
        <Link
          href="/dashboard"
          className="text-sm text-blue-600 hover:underline"
        >
          ← Back to Dashboard
        </Link>
      </div>
      <h1 className="text-3xl font-bold mb-8 text-slate-900 dark:text-white">
        Create New Event
      </h1>

      {error && (
        <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700 rounded-lg text-red-700 dark:text-red-300 text-sm">
          ❌ {error}
        </div>
      )}

      <form onSubmit={handleCreate} className="space-y-6">
        <div>
          <label className="block text-sm font-medium mb-2">Event Name</label>
          <Input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g., Sharma Wedding"
            disabled={submitting}
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-2">Client Name</label>
          <Input
            required
            value={clientName}
            onChange={(e) => setClientName(e.target.value)}
            placeholder="e.g., Rahul Sharma"
            disabled={submitting}
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-2">Date</label>
          <Input
            type="date"
            required
            value={date}
            onChange={(e) => setDate(e.target.value)}
            disabled={submitting}
          />
        </div>
        <Button type="submit" className="w-full" disabled={submitting}>
          {submitting ? "Creating…" : "Create Event & Folders"}
        </Button>
      </form>
    </div>
  );
}
