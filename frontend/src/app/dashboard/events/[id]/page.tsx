"use client";

import { useState, useEffect, use } from "react";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { getOrRefreshSession } from "@/lib/auth-session";
import QRCode from "qrcode";
import { QrCode, Copy, Check, ExternalLink, RefreshCw, ShieldAlert, ShieldCheck } from "lucide-react";

interface UploadFileResult {
  name: string;
  sizeFormatted: string;
  status: "pending" | "uploading" | "success" | "error";
  detail?: string;
}

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
  const [uploadResults, setUploadResults] = useState<UploadFileResult[]>([]);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loadingEvent, setLoadingEvent] = useState(true);

  // Guest QR Access state
  const [guestAccess, setGuestAccess] = useState<{
    enabled: boolean;
    token: string | null;
    expires_at: string | null;
    qrDataUrl: string | null;
    guestUrl: string | null;
  }>({
    enabled: false,
    token: null,
    expires_at: null,
    qrDataUrl: null,
    guestUrl: null,
  });
  const [guestLoading, setGuestLoading] = useState(false);
  const [guestCopied, setGuestCopied] = useState(false);

  const getHeaders = async () => {
    const token = await getOrRefreshSession();
    if (!token) {
      router.push("/login");
      return null;
    }
    return { Authorization: `Bearer ${token}` };
  };

  const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024 * 1024) {
      return `${(bytes / 1024).toFixed(1)} KB`;
    }
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  // Load event details and photos on mount
  useEffect(() => {
    const fetchEvent = async () => {
      const headers = await getHeaders();
      if (!headers) return;

      try {
        const res = await fetch(`${apiUrl}/api/events/${id}`, { headers });
        if (res.status === 401) {
          const freshToken = await getOrRefreshSession();
          if (!freshToken) {
            router.push("/login");
            return;
          }
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

        // Fetch guest access status
        const guestRes = await fetch(`${apiUrl}/api/events/${id}/guest-access`, {
          headers,
        });
        if (guestRes.ok) {
          const gData = await guestRes.json();
          if (gData.guest_access_enabled && gData.token) {
            const guestUrl = `${window.location.origin}/guest/${id}?token=${encodeURIComponent(gData.token)}`;
            try {
              const qrDataUrl = await QRCode.toDataURL(guestUrl, { width: 220, margin: 2 });
              setGuestAccess({
                enabled: true,
                token: gData.token,
                expires_at: gData.expires_at,
                qrDataUrl,
                guestUrl,
              });
            } catch (qrErr) {
              setGuestAccess({
                enabled: true,
                token: gData.token,
                expires_at: gData.expires_at,
                qrDataUrl: null,
                guestUrl,
              });
            }
          }
        }
      } catch (e) {
        setError("Failed to load event data. Check backend connectivity.");
      } finally {
        setLoadingEvent(false);
      }
    };
    fetchEvent();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const handleGenerateGuestAccess = async (hours = 72) => {
    setGuestLoading(true);
    setError("");
    const headers = await getHeaders();
    if (!headers) return;

    try {
      const res = await fetch(`${apiUrl}/api/events/${id}/guest-access/generate?duration_hours=${hours}`, {
        method: "POST",
        headers,
      });

      if (res.ok) {
        const data = await res.json();
        const guestUrl = `${window.location.origin}/guest/${id}?token=${encodeURIComponent(data.token)}`;
        let qrDataUrl = null;
        try {
          qrDataUrl = await QRCode.toDataURL(guestUrl, { width: 220, margin: 2 });
        } catch {}

        setGuestAccess({
          enabled: true,
          token: data.token,
          expires_at: data.expires_at,
          qrDataUrl,
          guestUrl,
        });
        setSuccess("Event-specific Guest QR code and link generated successfully!");
        setTimeout(() => setSuccess(""), 4000);
      } else {
        const err = await res.json().catch(() => null);
        setError(err?.detail || "Failed to generate guest access.");
      }
    } catch {
      setError("Network error generating guest access.");
    } finally {
      setGuestLoading(false);
    }
  };

  const handleRevokeGuestAccess = async () => {
    if (!confirm("Are you sure you want to revoke guest access? All existing QR codes and links for this event will be immediately invalidated.")) {
      return;
    }
    setGuestLoading(true);
    setError("");
    const headers = await getHeaders();
    if (!headers) return;

    try {
      const res = await fetch(`${apiUrl}/api/events/${id}/guest-access/revoke`, {
        method: "POST",
        headers,
      });

      if (res.ok) {
        setGuestAccess({
          enabled: false,
          token: null,
          expires_at: null,
          qrDataUrl: null,
          guestUrl: null,
        });
        setSuccess("Guest access revoked successfully. Previous links and QR codes are now inactive.");
        setTimeout(() => setSuccess(""), 4000);
      } else {
        const err = await res.json().catch(() => null);
        setError(err?.detail || "Failed to revoke guest access.");
      }
    } catch {
      setError("Network error revoking guest access.");
    } finally {
      setGuestLoading(false);
    }
  };

  const handleCopyGuestLink = () => {
    if (!guestAccess.guestUrl) return;
    navigator.clipboard.writeText(guestAccess.guestUrl);
    setGuestCopied(true);
    setTimeout(() => setGuestCopied(false), 3000);
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.length) return;

    const headers = await getHeaders();
    if (!headers) return;

    const files = Array.from(e.target.files);
    setUploading(true);
    setError("");
    setSuccess("");

    // Initialize per-file status list
    const initialResults: UploadFileResult[] = files.map((f) => ({
      name: f.name,
      sizeFormatted: formatFileSize(f.size),
      status: "pending",
    }));
    setUploadResults(initialResults);

    let uploadedCount = 0;
    let failedCount = 0;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      setUploadProgress(`Uploading ${i + 1} of ${files.length}: ${file.name} (${formatFileSize(file.size)})`);

      // Update file status to uploading
      setUploadResults((prev) =>
        prev.map((item, idx) =>
          idx === i ? { ...item, status: "uploading" } : item
        )
      );

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
          uploadedCount++;
          setUploadResults((prev) =>
            prev.map((item, idx) =>
              idx === i ? { ...item, status: "success" } : item
            )
          );
        } else {
          failedCount++;
          let errorDetail = `HTTP ${res.status}`;
          if (res.status === 413) {
            errorDetail = "File exceeds 50 MB limit";
          } else if (res.status === 400) {
            const err = await res.json().catch(() => null);
            errorDetail = err?.detail || "Invalid image format";
          } else if (res.status === 401) {
            errorDetail = "Session expired — please re-login";
          } else if (res.status === 403) {
            errorDetail = "Unauthorized for this event";
          } else if (res.status === 500) {
            errorDetail = "Server storage error";
          }

          // Use console.warn instead of console.error to prevent triggering Next.js dev overlay
          console.warn(`Upload rejected for ${file.name}: ${errorDetail}`);

          setUploadResults((prev) =>
            prev.map((item, idx) =>
              idx === i ? { ...item, status: "error", detail: errorDetail } : item
            )
          );
        }
      } catch (networkErr) {
        failedCount++;
        const errorDetail = "Network error: Server unreachable or timeout";
        console.warn(`Network error for ${file.name}:`, networkErr);

        setUploadResults((prev) =>
          prev.map((item, idx) =>
            idx === i ? { ...item, status: "error", detail: errorDetail } : item
          )
        );
      }
    }

    setUploading(false);
    setUploadProgress("");

    if (failedCount === 0) {
      setSuccess(`✅ All ${uploadedCount} photo${uploadedCount !== 1 ? "s" : ""} uploaded successfully!`);
    } else if (uploadedCount > 0) {
      setError(`⚠️ Partial upload: ${uploadedCount} succeeded, ${failedCount} failed. Review details below.`);
    } else {
      setError(`❌ Upload failed: 0 of ${files.length} photos succeeded. Review details below.`);
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

    // Reset file input so user can re-upload if needed
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
          className="text-sm text-blue-600 dark:text-blue-400 hover:underline inline-flex items-center gap-1"
        >
          ← Back to Dashboard
        </Link>
      </div>

      <div className="flex justify-between items-start mb-8 gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 dark:text-white">
            {event?.name || "Event Dashboard"}
          </h1>
          {event && (
            <p className="text-slate-600 dark:text-slate-400 mt-1 font-medium">
              {event.client_name} • {event.date}
              {event.storage_provider === "gdrive" && " • Google Drive"}
              {event.storage_provider === "local" && " • Local Storage"}
            </p>
          )}
        </div>
        <Button
          onClick={() => window.open(`/gallery/${id}`, "_blank")}
          variant="outline"
          className="border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white hover:bg-slate-100 dark:hover:bg-slate-800 font-semibold shadow-sm"
        >
          View Client Gallery
        </Button>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-100 dark:bg-red-950/60 border border-red-300 dark:border-red-800 rounded-lg text-red-900 dark:text-red-200 text-sm font-medium">
          {error}
        </div>
      )}

      {success && (
        <div className="mb-6 p-4 bg-emerald-100 dark:bg-emerald-950/60 border border-emerald-300 dark:border-emerald-800 rounded-lg text-emerald-900 dark:text-emerald-200 text-sm font-medium">
          {success}
        </div>
      )}

      {/* Guest QR Access Card */}
      <div className="mb-8 border border-slate-200 dark:border-slate-800 rounded-xl p-6 bg-white dark:bg-slate-900 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-start justify-between gap-6">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2">
              <QrCode className="w-5 h-5 text-blue-600 dark:text-blue-400" />
              <h2 className="text-xl font-bold text-slate-900 dark:text-white">
                Guest QR Access & Self-Service Portal
              </h2>
            </div>
            <p className="text-slate-600 dark:text-slate-400 text-sm mb-4">
              Guests can scan this QR code or use the link on their mobile phones to search and find their photos with a selfie. No photographer account is required, and biometric consent is enforced.
            </p>

            {guestAccess.enabled && guestAccess.guestUrl ? (
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800">
                    <ShieldCheck className="w-3.5 h-3.5" /> Active Guest Access
                  </span>
                  {guestAccess.expires_at && (
                    <span className="text-xs text-slate-500 dark:text-slate-400">
                      Expires: {new Date(guestAccess.expires_at).toLocaleString()}
                    </span>
                  )}
                </div>

                {/* Guest Link Copy Field */}
                <div className="flex items-center gap-2 max-w-xl">
                  <input
                    type="text"
                    readOnly
                    value={guestAccess.guestUrl}
                    className="flex-1 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md px-3 py-2 text-slate-800 dark:text-slate-200 truncate select-all"
                  />
                  <Button
                    onClick={handleCopyGuestLink}
                    variant="outline"
                    size="sm"
                    className="text-xs shrink-0 flex items-center gap-1.5"
                  >
                    {guestCopied ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-600" /> Copied!
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" /> Copy Link
                      </>
                    )}
                  </Button>
                  <Button
                    onClick={() => window.open(guestAccess.guestUrl!, "_blank")}
                    variant="outline"
                    size="sm"
                    className="text-xs shrink-0 flex items-center gap-1.5"
                  >
                    <ExternalLink className="w-3.5 h-3.5" /> Open
                  </Button>
                </div>

                {/* Revoke / Regenerate actions */}
                <div className="flex items-center gap-3 pt-2">
                  <Button
                    onClick={() => handleGenerateGuestAccess(72)}
                    disabled={guestLoading}
                    variant="outline"
                    size="sm"
                    className="text-xs flex items-center gap-1.5"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${guestLoading ? "animate-spin" : ""}`} />
                    Regenerate QR / Refresh Token
                  </Button>
                  <Button
                    onClick={handleRevokeGuestAccess}
                    disabled={guestLoading}
                    variant="destructive"
                    size="sm"
                    className="text-xs flex items-center gap-1.5"
                  >
                    <ShieldAlert className="w-3.5 h-3.5" />
                    Revoke Guest Access
                  </Button>
                </div>
              </div>
            ) : (
              <div className="bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/60 rounded-lg p-4">
                <p className="text-sm text-slate-700 dark:text-slate-300 font-medium mb-3">
                  Guest access is currently disabled or revoked for this event.
                </p>
                <Button
                  onClick={() => handleGenerateGuestAccess(72)}
                  disabled={guestLoading}
                  className="text-xs font-semibold"
                >
                  <QrCode className="w-4 h-4 mr-1.5" />
                  {guestLoading ? "Generating QR Code…" : "Enable & Generate Guest QR Code"}
                </Button>
              </div>
            )}
          </div>

          {/* QR Code Preview */}
          {guestAccess.enabled && guestAccess.qrDataUrl && (
            <div className="flex flex-col items-center bg-slate-50 dark:bg-slate-800/60 p-4 rounded-xl border border-slate-200 dark:border-slate-700 shrink-0">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={guestAccess.qrDataUrl}
                alt="Event Guest Access QR Code"
                className="w-44 h-44 rounded-lg bg-white p-2 shadow-sm"
              />
              <span className="text-[11px] text-slate-500 dark:text-slate-400 mt-2 font-medium">
                Scan to find event photos
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Upload section */}
      <div className="border-2 border-dashed border-slate-300 dark:border-slate-700 rounded-lg p-12 text-center mb-8 bg-slate-50/50 dark:bg-slate-900/30">
        <h3 className="text-lg font-semibold mb-2 text-slate-900 dark:text-white">
          Upload Event Photos
        </h3>
        <p className="text-slate-600 dark:text-slate-400 mb-6 text-sm">
          Supports original full-resolution DSLR JPEGs and PNGs up to 50 MB each.
        </p>

        {uploadProgress && (
          <p className="text-blue-600 dark:text-blue-400 mb-4 text-sm font-medium animate-pulse">
            {uploadProgress}
          </p>
        )}

        <input
          type="file"
          multiple
          accept="image/jpeg,image/png,image/jpg"
          className="hidden"
          id="photo-upload"
          onChange={handleUpload}
          disabled={uploading}
        />
        <label htmlFor="photo-upload">
          <Button asChild disabled={uploading} className="cursor-pointer shadow">
            <span>
              {uploading ? "Uploading Batch…" : "Select Photos"}
            </span>
          </Button>
        </label>
      </div>

      {/* Per-file Upload Breakdown */}
      {uploadResults.length > 0 && (
        <div className="mb-8 border border-slate-200 dark:border-slate-800 rounded-lg p-4 bg-white dark:bg-slate-900 shadow-sm">
          <h4 className="text-sm font-bold text-slate-900 dark:text-white mb-3">
            Batch Upload Status ({uploadResults.filter((r) => r.status === "success").length} / {uploadResults.length} Succeeded)
          </h4>
          <div className="space-y-2 max-h-60 overflow-y-auto">
            {uploadResults.map((result, idx) => (
              <div
                key={idx}
                className="flex items-center justify-between text-xs p-2 rounded bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800"
              >
                <div className="flex items-center gap-2 truncate mr-3">
                  <span className="font-medium text-slate-800 dark:text-slate-200 truncate">
                    {result.name}
                  </span>
                  <span className="text-slate-400 shrink-0">
                    ({result.sizeFormatted})
                  </span>
                </div>

                <div className="shrink-0 flex items-center gap-2">
                  {result.status === "pending" && (
                    <span className="text-slate-400">Queued</span>
                  )}
                  {result.status === "uploading" && (
                    <span className="text-blue-600 dark:text-blue-400 font-medium animate-pulse">
                      Uploading…
                    </span>
                  )}
                  {result.status === "success" && (
                    <span className="text-emerald-600 dark:text-emerald-400 font-semibold">
                      ✓ Uploaded
                    </span>
                  )}
                  {result.status === "error" && (
                    <span className="text-red-600 dark:text-red-400 font-semibold">
                      ✕ {result.detail || "Failed"}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Photos list */}
      <div>
        <h3 className="text-lg font-bold mb-4 text-slate-900 dark:text-white">
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
      const token = await getOrRefreshSession();
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
      <div className="aspect-square bg-red-50 dark:bg-red-900/20 rounded-lg flex items-center justify-center text-red-400 text-xs font-medium">
        Failed to load
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
          className="text-xs bg-white text-slate-900 font-semibold px-2.5 py-1 rounded shadow hover:bg-slate-100"
        >
          Download
        </a>
      </div>
    </div>
  );
}
