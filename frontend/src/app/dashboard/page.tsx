"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function DashboardPage() {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    const token = localStorage.getItem("access_token");
    if (!token) {
      router.push("/login");
      return;
    }

    const fetchEvents = async () => {
      try {
        const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
        const res = await fetch(`${apiUrl}/api/events/me`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (res.ok) {
          const data = await res.json();
          setEvents(data);
        }
      } catch (e) {
        console.error("Failed to fetch events", e);
      } finally {
        setLoading(false);
      }
    };

    fetchEvents();
  }, [router]);

  if (loading) return null;

  return (
    <div className="max-w-6xl mx-auto p-8">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold">My Events</h1>
        <Button asChild>
          <Link href="/dashboard/create">Create New Event</Link>
        </Button>
      </div>

      {events.length === 0 ? (
        <div className="text-center py-24 bg-slate-50 dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800">
          <h3 className="text-xl font-semibold mb-2">No events yet</h3>
          <p className="text-slate-500 mb-6">Create your first event to start uploading photos.</p>
          <Button asChild variant="outline">
            <Link href="/dashboard/create">Create Event</Link>
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {events.map((event: any) => (
            <div key={event.id} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 rounded-xl">
               <h3 className="text-xl font-bold">{event.name}</h3>
               <p className="text-slate-500 mb-4">{event.client_name} • {event.date}</p>
               <Button asChild className="w-full" variant="outline">
                 <Link href={`/dashboard/events/${event.id}`}>Manage Event</Link>
               </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
