"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useRouter } from "next/navigation";

export default function CreateEvent() {
  const [name, setName] = useState("");
  const [clientName, setClientName] = useState("");
  const [date, setDate] = useState("");
  const router = useRouter();

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
      const res = await fetch(`${apiUrl}/api/events/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          client_name: clientName,
          date,
          photographer_id: "admin-photographer-id" // Replace with real auth
        })
      });
      const data = await res.json();
      if (data.event_id) {
        router.push(`/dashboard/events/${data.event_id}`);
      }
    } catch (error) {
      console.error("Failed to create event", error);
    }
  };

  return (
    <div className="max-w-2xl mx-auto p-8">
      <h1 className="text-3xl font-bold mb-8">Create New Event</h1>
      <form onSubmit={handleCreate} className="space-y-6">
        <div>
          <label className="block text-sm font-medium mb-2">Event Name</label>
          <Input
            required
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="e.g., Sharma Wedding"
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-2">Client Name</label>
          <Input
            required
            value={clientName}
            onChange={e => setClientName(e.target.value)}
            placeholder="e.g., Rahul Sharma"
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-2">Date</label>
          <Input
            type="date"
            required
            value={date}
            onChange={e => setDate(e.target.value)}
          />
        </div>
        <Button type="submit" className="w-full">Create Event & Folders</Button>
      </form>
    </div>
  );
}
