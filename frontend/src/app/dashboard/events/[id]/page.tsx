"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

export default function EventDashboard({ params }: { params: { id: string } }) {
  const [uploading, setUploading] = useState(false);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.length) return;

    setUploading(true);
    const files = Array.from(e.target.files);

    for (const file of files) {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("event_id", params.id);
      formData.append("folder_id", "mock-folder-id"); // In real app, fetch from event details

      try {
        const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
        await fetch(`${apiUrl}/api/upload/`, {
          method: "POST",
          body: formData,
        });
      } catch (error) {
        console.error("Failed to upload", file.name);
      }
    }

    setUploading(false);
    alert("Uploads complete! AI is processing in the background.");
  };

  return (
    <div className="max-w-4xl mx-auto p-8">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold">Event Dashboard</h1>
        <Button onClick={() => window.open(`/gallery/${params.id}`, "_blank")} variant="outline">
          View Client Gallery
        </Button>
      </div>

      <div className="border-2 border-dashed border-slate-300 rounded-lg p-12 text-center">
        <h3 className="text-lg font-medium mb-4">Upload Event Photos</h3>
        <p className="text-slate-500 mb-6">Photos will be uploaded to Google Drive and scanned by AI</p>

        <input
          type="file"
          multiple
          accept="image/*"
          className="hidden"
          id="photo-upload"
          onChange={handleUpload}
          disabled={uploading}
        />
        <label htmlFor="photo-upload">
          <Button asChild disabled={uploading}>
            <span>{uploading ? "Uploading..." : "Select Photos"}</span>
          </Button>
        </label>
      </div>
    </div>
  );
}
