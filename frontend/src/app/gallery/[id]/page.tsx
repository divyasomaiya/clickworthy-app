"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Camera } from "lucide-react";
import Image from "next/image";

export default function ClientGallery({ params }: { params: { id: string } }) {
  const [isSearching, setIsSearching] = useState(false);
  const [matches, setMatches] = useState<any[]>([]);
  const [searched, setSearched] = useState(false);

  const handleSelfieUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.[0]) return;

    setIsSearching(true);
    const formData = new FormData();
    formData.append("file", e.target.files[0]);
    formData.append("event_id", params.id);

    try {
      const res = await fetch("http://localhost:8000/api/search/", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      setMatches(data.matches || []);
      setSearched(true);
    } catch (error) {
      console.error("Failed to search faces", error);
    } finally {
      setIsSearching(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 p-4 md:p-8">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold mb-4">Find Your Photos</h1>
          <p className="text-slate-500 mb-8 max-w-xl mx-auto">
            Upload a quick selfie and our AI will instantly find all your pictures from this event.
          </p>

          <input
            type="file"
            accept="image/*"
            capture="user"
            className="hidden"
            id="selfie-upload"
            onChange={handleSelfieUpload}
          />
          <label htmlFor="selfie-upload">
            <Button size="lg" className="rounded-full shadow-xl" asChild disabled={isSearching}>
              <span className="flex items-center gap-2 px-8">
                <Camera className="w-5 h-5" />
                {isSearching ? "Scanning Event..." : "Take a Selfie"}
              </span>
            </Button>
          </label>
        </div>

        {searched && (
          <div>
            <h2 className="text-2xl font-semibold mb-6">Your Photos ({matches.length})</h2>
            {matches.length === 0 ? (
              <div className="text-center text-slate-500 py-12">
                No photos found matching your selfie.
              </div>
            ) : (
              <div className="columns-1 sm:columns-2 md:columns-3 gap-4 space-y-4">
                {matches.map((match, i) => (
                  <div key={i} className="break-inside-avoid rounded-lg overflow-hidden relative group">
                    {/* In a real app, you would fetch a temporary signed URL from Google Drive here */}
                    <div className="aspect-[3/4] bg-slate-200 animate-pulse relative">
                       {/* Placeholder for the actual image. Requires a secure proxy endpoint from the backend */}
                       <div className="absolute inset-0 flex items-center justify-center text-slate-400">
                         Image {match.photo_id.substring(0, 8)}
                       </div>
                    </div>
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-4">
                      <Button variant="secondary" size="sm">Download</Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
