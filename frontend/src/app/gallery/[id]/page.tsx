"use client";

import { useState, useEffect, useRef, use } from "react";
import { Button } from "@/components/ui/button";
import { Camera, Download, ArrowLeft, RefreshCw, Sparkles, AlertCircle } from "lucide-react";
import Link from "next/link";

interface PhotoItem {
  photo_id: string;
  drive_file_id?: string;
  objectUrl?: string | null;
  status: "loading" | "loaded" | "error";
  distance?: number;
}

export default function ClientGallery({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [photos, setPhotos] = useState<PhotoItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchFilterActive, setSearchFilterActive] = useState(false);
  const [searchMessage, setSearchMessage] = useState("");
  const [selectedPhoto, setSelectedPhoto] = useState<string | null>(null);

  const objectUrlsRef = useRef<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

  const getHeaders = () => {
    const token = typeof window !== "undefined" ? localStorage.getItem("access_token") : null;
    const headers: Record<string, string> = {};
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }
    return headers;
  };

  // Helper to fetch photo blobs sequentially or asynchronously without blocking
  const loadPhotoBlobs = (items: PhotoItem[]) => {
    const headers = getHeaders();
    items.forEach(async (item) => {
      if (item.objectUrl || item.status === "loaded") return;
      try {
        const res = await fetch(`${apiUrl}/api/images/${item.photo_id}`, { headers });
        if (res.ok) {
          const blob = await res.blob();
          const url = URL.createObjectURL(blob);
          objectUrlsRef.current.push(url);
          setPhotos((prev) =>
            prev.map((p) =>
              p.photo_id === item.photo_id
                ? { ...p, objectUrl: url, status: "loaded" }
                : p
            )
          );
        } else {
          setPhotos((prev) =>
            prev.map((p) =>
              p.photo_id === item.photo_id
                ? { ...p, status: "error" }
                : p
            )
          );
        }
      } catch {
        setPhotos((prev) =>
          prev.map((p) =>
            p.photo_id === item.photo_id
              ? { ...p, status: "error" }
              : p
          )
        );
      }
    });
  };

  const fetchAllPhotos = async () => {
    setLoading(true);
    setError("");
    setSearchFilterActive(false);
    setSearchMessage("");

    try {
      const headers = getHeaders();
      const res = await fetch(`${apiUrl}/api/events/${id}/photos`, { headers });

      if (res.status === 401 || res.status === 403) {
        setError("Not authorized to view this gallery, or event has expired.");
        return;
      }

      if (!res.ok) {
        setError(`Failed to fetch gallery (HTTP ${res.status}).`);
        return;
      }

      const data = await res.json();
      const initialPhotos: PhotoItem[] = data.map((item: any) => ({
        photo_id: item.photo_id,
        drive_file_id: item.drive_file_id,
        objectUrl: null,
        status: "loading",
      }));

      setPhotos(initialPhotos);
      loadPhotoBlobs(initialPhotos);
    } catch {
      setError("Failed to fetch gallery due to network error.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAllPhotos();

    return () => {
      objectUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
      objectUrlsRef.current = [];
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const handleSelfieSearch = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setSearching(true);
    setSearchMessage("");

    const formData = new FormData();
    formData.append("event_id", id);
    formData.append("file", file);

    try {
      const headers = getHeaders();
      const res = await fetch(`${apiUrl}/api/search/`, {
        method: "POST",
        headers,
        body: formData,
      });

      if (res.ok) {
        const data = await res.json();
        if (data.message && (!data.matches || data.matches.length === 0)) {
          setSearchMessage(data.message || "No matches found for this selfie.");
          setSearchFilterActive(true);
        } else if (data.matches && data.matches.length > 0) {
          const matchedIds = new Set(data.matches.map((m: any) => m.photo_id));
          setSearchFilterActive(true);
          setSearchMessage(`Found ${data.matches.length} matching photo${data.matches.length > 1 ? "s" : ""}!`);
          
          // Reorder or filter photos to show matches
          setPhotos((prev) => {
            const matchesOnly = prev.filter((p) => matchedIds.has(p.photo_id));
            // In case some matched photos weren't loaded yet
            const existingIds = new Set(prev.map((p) => p.photo_id));
            const newMatches: PhotoItem[] = data.matches
              .filter((m: any) => !existingIds.has(m.photo_id))
              .map((m: any) => ({
                photo_id: m.photo_id,
                drive_file_id: m.drive_file_id,
                status: "loading" as const,
                distance: m.distance,
              }));
            const combined = [...matchesOnly, ...newMatches];
            loadPhotoBlobs(combined);
            return combined;
          });
        } else {
          setSearchMessage("No matching faces found in this event.");
          setSearchFilterActive(true);
        }
      } else {
        const err = await res.json().catch(() => null);
        setSearchMessage(err?.detail || "Search request failed.");
      }
    } catch {
      setSearchMessage("Network error during selfie search.");
    } finally {
      setSearching(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const resetSearch = () => {
    fetchAllPhotos();
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center text-white p-4">
        <RefreshCw className="w-8 h-8 animate-spin text-blue-400 mb-4" />
        <p className="text-slate-300 text-lg">Loading event gallery…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center text-red-400 text-center p-8">
        <AlertCircle className="w-12 h-12 mb-4 text-red-500" />
        <h2 className="text-xl font-bold mb-2">Access Error</h2>
        <p className="text-slate-400 mb-6 max-w-md">{error}</p>
        <Button asChild variant="outline" className="text-slate-200">
          <Link href="/dashboard">Return to Dashboard</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 p-4 md:p-8">
      <div className="max-w-6xl mx-auto">
        {/* Navigation & Header */}
        <div className="flex flex-wrap items-center justify-between gap-4 mb-8">
          <Button asChild variant="ghost" size="sm" className="gap-2 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white">
            <Link href={`/dashboard/events/${id}`}>
              <ArrowLeft className="w-4 h-4" /> Back to Event Dashboard
            </Link>
          </Button>
          <div className="flex gap-2">
            <Button asChild variant="outline" size="sm">
              <Link href="/dashboard">My Events</Link>
            </Button>
          </div>
        </div>

        <div className="text-center mb-10">
          <h1 className="text-4xl font-extrabold mb-3 text-slate-900 dark:text-white tracking-tight">
            Event Gallery
          </h1>
          <p className="text-slate-500 max-w-xl mx-auto text-sm md:text-base">
            Secure client gallery with instant AI face recognition.
          </p>
        </div>

        {/* AI Face Search Box */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 mb-10 shadow-sm">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="text-center sm:text-left">
              <div className="flex items-center gap-2 justify-center sm:justify-start">
                <Sparkles className="w-5 h-5 text-amber-500" />
                <h3 className="font-semibold text-slate-900 dark:text-white">
                  Find Your Photos with AI
                </h3>
              </div>
              <p className="text-sm text-slate-500 mt-1">
                Upload a quick selfie and our face recognition model will find all photos you appear in.
              </p>
            </div>

            <div className="flex items-center gap-3 w-full sm:w-auto">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png"
                className="hidden"
                id="selfie-search-input"
                onChange={handleSelfieSearch}
                disabled={searching}
              />
              <Button
                asChild
                disabled={searching}
                className="gap-2 w-full sm:w-auto bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white shadow"
              >
                <label htmlFor="selfie-search-input" className="cursor-pointer">
                  {searching ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Scanning Faces…</span>
                    </>
                  ) : (
                    <>
                      <Camera className="w-4 h-4" />
                      <span>Search by Selfie</span>
                    </>
                  )}
                </label>
              </Button>

              {searchFilterActive && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={resetSearch}
                  className="shrink-0"
                >
                  Show All
                </Button>
              )}
            </div>
          </div>

          {searchMessage && (
            <div className="mt-4 p-3 bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 rounded-lg text-sm text-blue-800 dark:text-blue-300 text-center sm:text-left">
              {searchMessage}
            </div>
          )}
        </div>

        {/* Photos Grid */}
        <div>
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-2xl font-bold text-slate-900 dark:text-white">
              {searchFilterActive ? "Matching Photos" : "All Photos"} ({photos.length})
            </h2>
            {searchFilterActive && (
              <button
                onClick={resetSearch}
                className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
              >
                Reset to all photos
              </button>
            )}
          </div>

          {photos.length === 0 ? (
            <div className="text-center py-20 bg-white dark:bg-slate-900/50 rounded-xl border border-slate-200 dark:border-slate-800">
              <p className="text-slate-500 mb-2">
                {searchFilterActive
                  ? "No matching photos found in this event."
                  : "No photos uploaded to this event yet."}
              </p>
              {searchFilterActive ? (
                <Button variant="outline" size="sm" onClick={resetSearch}>
                  View All Event Photos
                </Button>
              ) : (
                <Button asChild variant="outline" size="sm">
                  <Link href={`/dashboard/events/${id}`}>Upload Photos</Link>
                </Button>
              )}
            </div>
          ) : (
            <div className="columns-1 sm:columns-2 md:columns-3 lg:columns-4 gap-4 space-y-4">
              {photos.map((photo) => (
                <div
                  key={photo.photo_id}
                  className="break-inside-avoid rounded-xl overflow-hidden relative group bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm transition hover:shadow-md"
                >
                  {photo.status === "loading" && (
                    <div className="aspect-[3/4] bg-slate-200 dark:bg-slate-800 animate-pulse flex flex-col items-center justify-center text-slate-400 text-xs p-4 text-center">
                      <RefreshCw className="w-5 h-5 animate-spin mb-2" />
                      Loading photo…
                    </div>
                  )}

                  {photo.status === "error" && (
                    <div className="aspect-[3/4] bg-red-50 dark:bg-red-950/20 flex flex-col items-center justify-center text-red-400 text-xs p-4 text-center">
                      <AlertCircle className="w-6 h-6 mb-1 text-red-400" />
                      Failed to load
                    </div>
                  )}

                  {photo.status === "loaded" && photo.objectUrl && (
                    <>
                      <img
                        src={photo.objectUrl}
                        alt="Event photo"
                        className="w-full h-auto object-cover cursor-pointer block"
                        loading="lazy"
                        onClick={() => setSelectedPhoto(photo.objectUrl!)}
                      />
                      {/* Hover Overlay */}
                      <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2 p-4">
                        <Button
                          variant="secondary"
                          size="sm"
                          className="gap-1.5 shadow"
                          asChild
                        >
                          <a
                            href={photo.objectUrl}
                            download={`photo-${photo.photo_id}.jpg`}
                          >
                            <Download className="w-3.5 h-3.5" />
                            Download
                          </a>
                        </Button>
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Full Image Modal */}
        {selectedPhoto && (
          <div
            className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 backdrop-blur-sm"
            onClick={() => setSelectedPhoto(null)}
          >
            <div className="relative max-w-4xl max-h-[90vh]">
              <img
                src={selectedPhoto}
                alt="Enlarged event photo"
                className="max-w-full max-h-[85vh] object-contain rounded-lg shadow-2xl"
              />
              <div className="absolute top-4 right-4 flex gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  asChild
                  onClick={(e) => e.stopPropagation()}
                >
                  <a href={selectedPhoto} download="photo-full.jpg">
                    <Download className="w-4 h-4 mr-1" /> Download
                  </a>
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="bg-black/60 text-white border-white/20 hover:bg-black/80"
                  onClick={() => setSelectedPhoto(null)}
                >
                  ✕ Close
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
