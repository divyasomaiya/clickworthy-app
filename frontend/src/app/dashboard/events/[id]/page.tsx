"use client";

import { useState, useEffect, use } from "react";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function EventDashboard({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const [event, setEvent] = useState<any>(null);
  const [photos, setPhotos] = useState<any[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loadingEvent, setLoadingEvent] = useState(true);

  const getHeaders = () => {
    const token = localStorage.getItem("access_token");
    if (!token) {
      router.push("/login");
      return null;
    }
    return { Authorization: `Bearer ${token}` };
  };

  const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

  // Load event details and photos on mount
  useEffect(() => {
    const fetchEvent = async () => {
      const headers = getHeaders();
      if (!headers) return;

      try {
        const res = await fetch(`${apiUrl}/api/events/${id}`, { headers });
        if (res.status === 401) {
          localStorage.removeItem("access_token");
          router.push("/login");
          return;
        }
        if (res.status === 404) {
          setError("Event not found.");
          setLoadingEvent(false);
          return;
        }
        if (res.status === 403) {
          setError("You are not authorized to view this event.");
          setLoadingEvent(false);
          return;
        }
        if (res.ok) {
          setEvent(await res.json());
        }

        // Fetch photos
        const photosRes = await fetch(`${apiUrl}/api/events/${id}/photos`, {
          headers,
        });
        if (photosRes.ok) {
          setPhotos(await photosRes.json());
        }
      } catch (e) {
        setError("Failed to load event data.");
      } finally {
        setLoadingEvent(false);
      }
    };
    fetchEvent();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.length) return;

    const headers = getHeaders();
    if (!headers) return;

    setUploading(true);
    setError("");
    setSuccess("");
    const files = Array.from(e.target.files);
    let uploaded = 0;
    let failed = 0;

    for (const file of files) {
      setUploadProgress(`Uploading ${uploaded + 1} of ${files.length}: ${file.name}`);
      const formData = new FormData();
      formData.append("file", file);
      formData.append("event_id", id);

      try {
        const res = await fetch(`${apiUrl}/api/upload/`, {
          method: "POST",
          headers: { Authorization: headers.Authorization },
          body: formData,
        });
        if (res.ok) {
          uploaded++;
        } else {
          failed++;
          const err = await res.json().catch(() => null);
          console.error(`Upload failed for ${file.name}:`, err?.detail);
        }
      } catch (err) {
        failed++;
        console.error("Network error uploading", file.name);
      }
    }

    setUploading(false);
    setUploadProgress("");

    if (failed === 0) {
      setSuccess(`✅ ${uploaded} photo${uploaded !== 1 ? "s" : ""} uploaded successfully!`);
    } else {
      setError(`${uploaded} uploaded, ${failed} failed. Check file size (max 10 MB) and format (JPEG/PNG).`);
    }

    // Refresh photo list
    try {
      const photosRes = await fetch(`${apiUrl}/api/events/${id}/photos`, {
        headers,
      });
      if (photosRes.ok) {
        setPhotos(await photosRes.json());
      }
    } catch {}

    // Reset file input so the same files can be re-selected if needed
    e.target.value = "";
  };

  if (loadingEvent)
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-slate-500 text-lg">Loading event…</p>
      </div>
    );

  return (
    <div className="max-w-4xl mx-auto p-8">
      <div className="mb-6">
        <Link
          href="/dashboard"
          className="text-sm text-blue-600 hover:underline"
        >
          ← Back to Dashboard
        </Link>
      </div>

      <div className="flex justify-between items-start mb-8">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 dark:text-white">
            {event?.name || "Event Dashboard"}
          </h1>
          {event && (
            <p className="text-slate-500 mt-1">
              {event.client_name} • {event.date}
              {event.storage_provider === "gdrive" && " • Google Drive"}
              {event.storage_provider === "local" && " • Local Storage"}
            </p>
          )}
        </div>
        <Button
          onClick={() => window.open(`/gallery/${id}`, "_blank")}
          variant="outline"
        >
          View Client Gallery
        </Button>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700 rounded-lg text-red-700 dark:text-red-300 text-sm">
          ❌ {error}
        </div>
      )}

      {success && (
        <div className="mb-6 p-4 bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-700 rounded-lg text-green-700 dark:text-green-300 text-sm">
          {success}
        </div>
      )}

      {/* Upload section */}
      <div className="border-2 border-dashed border-slate-300 dark:border-slate-700 rounded-lg p-12 text-center mb-8">
        <h3 className="text-lg font-medium mb-2 text-slate-900 dark:text-white">
          Upload Event Photos
        </h3>
        <p className="text-slate-500 mb-6">
          JPEG and PNG files up to 10 MB each. AI face indexing runs automatically.
        </p>

        {uploadProgress && (
          <p className="text-blue-600 mb-4 text-sm font-medium animate-pulse">
            {uploadProgress}
          </p>
        )}

        <input
          type="file"
          multiple
          accept="image/jpeg,image/png"
          className="hidden"
          id="photo-upload"
          onChange={handleUpload}
          disabled={uploading}
        />
        <label htmlFor="photo-upload">
          <Button asChild disabled={uploading}>
            <span>
              {uploading ? "Uploading…" : "Select Photos"}
            </span>
          </Button>
        </label>
      </div>

      {/* Photos list */}
      <div>
        <h3 className="text-lg font-semibold mb-4 text-slate-900 dark:text-white">
          Uploaded Photos ({photos.length})
        </h3>
        {photos.length === 0 ? (
          <p className="text-slate-500 text-sm">
            No photos uploaded yet. Use the button above to add photos.
          </p>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {photos.map((photo: any) => (
              <PhotoThumbnail
                key={photo.photo_id}
                photoId={photo.photo_id}
                apiUrl={apiUrl}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function PhotoThumbnail({
  photoId,
  apiUrl,
}: {
  photoId: string;
  apiUrl: string;
}) {
  const [src, setSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let revoke: string | null = null;
    const load = async () => {
      const token = localStorage.getItem("access_token");
      if (!token) return;
      try {
        const res = await fetch(`${apiUrl}/api/images/${photoId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const blob = await res.blob();
          const url = URL.createObjectURL(blob);
          revoke = url;
          setSrc(url);
        } else {
          setFailed(true);
        }
      } catch {
        setFailed(true);
      }
    };
    load();
    return () => {
      if (revoke) URL.revokeObjectURL(revoke);
    };
  }, [photoId, apiUrl]);

  if (failed) {
    return (
      <div className="aspect-square bg-red-50 dark:bg-red-900/20 rounded-lg flex items-center justify-center text-red-400 text-xs">
        Failed
      </div>
    );
  }

  if (!src) {
    return (
      <div className="aspect-square bg-slate-100 dark:bg-slate-800 rounded-lg animate-pulse" />
    );
  }

  return (
    <div className="relative group rounded-lg overflow-hidden border border-slate-200 dark:border-slate-800">
      <img
        src={src}
        alt="Uploaded photo"
        className="aspect-square object-cover w-full h-full"
      />
      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
        <a
          href={src}
          download={`photo-${photoId}.jpg`}
          className="text-xs bg-white text-slate-900 font-medium px-2.5 py-1 rounded shadow hover:bg-slate-100"
        >
          Download
        </a>
      </div>
    </div>
  );
}
