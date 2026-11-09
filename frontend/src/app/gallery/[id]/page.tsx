"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Camera } from "lucide-react";
import Image from "next/image";

import { useEffect } from "react";

export default function ClientGallery({ params }: { params: { id: string } }) {
  const [matches, setMatches] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const fetchPhotos = async () => {
      try {
        const token = localStorage.getItem("access_token");
        const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
        const headers: any = {};
        if (token) {
          headers["Authorization"] = `Bearer ${token}`;
        }

        // Use the new owner listing endpoint
        const res = await fetch(`${apiUrl}/api/events/${params.id}/photos`, { headers });
        if (res.ok) {
          const data = await res.json();
          setMatches(data);
        } else {
          setError("Not authorized to view this gallery, or event expired.");
        }
      } catch (err) {
        setError("Failed to fetch gallery.");
      } finally {
        setLoading(false);
      }
    };

    fetchPhotos();
  }, [params.id]);

  if (loading) return <div className="p-8 text-center">Loading gallery...</div>;
  if (error) return <div className="p-8 text-center text-red-500">{error}</div>;

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 p-4 md:p-8">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold mb-4">Event Gallery</h1>
          <p className="text-slate-500 mb-8 max-w-xl mx-auto">
            (AI Selfie Search is currently disabled for development. Showing all photos.)
          </p>
        </div>

        <div>
            <h2 className="text-2xl font-semibold mb-6">All Photos ({matches.length})</h2>
            {matches.length === 0 ? (
              <div className="text-center text-slate-500 py-12">
                No photos found matching your selfie.
              </div>
            ) : (
              <div className="columns-1 sm:columns-2 md:columns-3 gap-4 space-y-4">
                {matches.map((match, i) => {
                  const token = localStorage.getItem("access_token");
                  const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
                  const imageUrl = `${apiUrl}/api/images/${match.photo_id}${token ? `?token=${token}` : ""}`;
                  return (
                    <div key={i} className="break-inside-avoid rounded-lg overflow-hidden relative group">
                      <div className="relative">
                        <img
                          src={imageUrl}
                          alt="Event photo"
                          className="w-full h-auto object-cover"
                          loading="lazy"
                        />
                      </div>
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-4">
                        <Button variant="secondary" size="sm" asChild>
                          <a href={imageUrl} download>Download</a>
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
      </div>
    </div>
  );
}
