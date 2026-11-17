"use client";

import { useState, useEffect, useRef, use } from "react";
import { Button } from "@/components/ui/button";
import {
  Camera,
  Upload,
  Download,
  ArrowLeft,
  RefreshCw,
  Sparkles,
  AlertCircle,
  Users,
  User,
  X,
  RotateCcw,
  Check,
} from "lucide-react";
import Link from "next/link";
import { getOrRefreshSession } from "@/lib/auth-session";

interface PhotoItem {
  photo_id: string;
  drive_file_id?: string;
  objectUrl?: string | null;
  status: "loading" | "loaded" | "error";
  distance?: number;
  match_type?: string;
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

  // Search Modes: 'single' (Find My Photos) | 'together' (Find Us Together - Both) | 'either' (Find Us Together - Either)
  const [searchMode, setSearchMode] = useState<"single" | "together" | "either">("single");
  const [duoInputMethod, setDuoInputMethod] = useState<"single_photo" | "two_photos">("single_photo");

  // State for references
  const [personAPhoto, setPersonAPhoto] = useState<{ file: File; previewUrl: string } | null>(null);
  const [personBPhoto, setPersonBPhoto] = useState<{ file: File; previewUrl: string } | null>(null);
  const [singleRefPhoto, setSingleRefPhoto] = useState<{ file: File; previewUrl: string } | null>(null);

  // Search execution status
  const [searching, setSearching] = useState(false);
  const [searchFilterActive, setSearchFilterActive] = useState(false);
  const [searchMessage, setSearchMessage] = useState("");
  const [selectedPhoto, setSelectedPhoto] = useState<string | null>(null);

  // Camera capture modal state
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraTarget, setCameraTarget] = useState<"singleRef" | "personA" | "personB">("singleRef");
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [capturedBlob, setCapturedBlob] = useState<{ blob: Blob; previewUrl: string } | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [cameraStarting, setCameraStarting] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const objectUrlsRef = useRef<string[]>([]);

  // Hidden file input refs
  const singleFileInputRef = useRef<HTMLInputElement>(null);
  const fileInputARef = useRef<HTMLInputElement>(null);
  const fileInputBRef = useRef<HTMLInputElement>(null);

  const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

  const getHeaders = async () => {
    const token = await getOrRefreshSession();
    const headers: Record<string, string> = {};
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }
    return headers;
  };

  // Helper to fetch photo blobs sequentially or asynchronously without blocking
  const loadPhotoBlobs = async (items: PhotoItem[]) => {
    const headers = await getHeaders();
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
      const headers = await getHeaders();
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
      stopCameraTracks();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // Camera Management
  const stopCameraTracks = () => {
    if (cameraStream) {
      cameraStream.getTracks().forEach((track) => track.stop());
      setCameraStream(null);
    }
  };

  const openCameraModal = async (target: "singleRef" | "personA" | "personB") => {
    setCameraTarget(target);
    setCapturedBlob(null);
    setCameraError(null);
    setCameraOpen(true);
    setCameraStarting(true);

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setCameraError("Camera capture is not supported on this device/browser. Please use 'Upload Photo' instead.");
      setCameraStarting(false);
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: "user",
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      });

      setCameraStream(stream);
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play().catch(() => {});
      }
    } catch (err: any) {
      console.warn("Camera access denied or failed:", err);
      if (err.name === "NotAllowedError" || err.name === "PermissionDeniedError") {
        setCameraError("Camera permission was denied. Please allow camera access in your browser address bar, or upload an existing photo.");
      } else if (err.name === "NotFoundError" || err.name === "DevicesNotFoundError") {
        setCameraError("No camera found on this device. Please upload an existing photo.");
      } else {
        setCameraError("Unable to access camera. Please check your device permissions or use 'Upload Photo'.");
      }
    } finally {
      setCameraStarting(false);
    }
  };

  // Re-attach video stream if videoRef mounts after stream is active
  useEffect(() => {
    if (videoRef.current && cameraStream && !capturedBlob) {
      videoRef.current.srcObject = cameraStream;
      videoRef.current.play().catch(() => {});
    }
  }, [cameraStream, capturedBlob]);

  const handleCaptureFrame = () => {
    if (!videoRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current || document.createElement("canvas");
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    canvas.toBlob((blob) => {
      if (blob) {
        const previewUrl = URL.createObjectURL(blob);
        setCapturedBlob({ blob, previewUrl });
        // Stop live stream tracks while previewing captured photo
        stopCameraTracks();
      }
    }, "image/jpeg", 0.95);
  };

  const handleRetakeCamera = () => {
    if (capturedBlob) {
      URL.revokeObjectURL(capturedBlob.previewUrl);
      setCapturedBlob(null);
    }
    openCameraModal(cameraTarget);
  };

  const handleUseCapturedPhoto = () => {
    if (!capturedBlob) return;
    const file = new File([capturedBlob.blob], "selfie_capture.jpg", { type: "image/jpeg" });
    const previewUrl = capturedBlob.previewUrl;

    if (cameraTarget === "singleRef") {
      setSingleRefPhoto({ file, previewUrl });
    } else if (cameraTarget === "personA") {
      setPersonAPhoto({ file, previewUrl });
    } else if (cameraTarget === "personB") {
      setPersonBPhoto({ file, previewUrl });
    }

    setCameraOpen(false);
    setCapturedBlob(null);
    stopCameraTracks();
  };

  const handleCloseCameraModal = () => {
    if (capturedBlob) {
      URL.revokeObjectURL(capturedBlob.previewUrl);
      setCapturedBlob(null);
    }
    stopCameraTracks();
    setCameraOpen(false);
    setCameraError(null);
  };

  // File Upload Handlers for References
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>, target: "singleRef" | "personA" | "personB") => {
    const file = e.target.files?.[0];
    if (!file) return;

    const previewUrl = URL.createObjectURL(file);
    if (target === "singleRef") {
      setSingleRefPhoto({ file, previewUrl });
    } else if (target === "personA") {
      setPersonAPhoto({ file, previewUrl });
    } else if (target === "personB") {
      setPersonBPhoto({ file, previewUrl });
    }
    e.target.value = "";
  };

  // Execute AI Face Search
  const handleExecuteSearch = async () => {
    setSearching(true);
    setSearchMessage("");

    const formData = new FormData();
    formData.append("event_id", id);
    formData.append("mode", searchMode);

    if (searchMode === "single") {
      if (!singleRefPhoto) {
        setSearchMessage("Please take a selfie or upload a photo first.");
        setSearching(false);
        return;
      }
      formData.append("file", singleRefPhoto.file);
    } else {
      // Duo search: 'together' or 'either'
      if (duoInputMethod === "single_photo") {
        if (!singleRefPhoto) {
          setSearchMessage("Please take a selfie or upload a photo containing both people.");
          setSearching(false);
          return;
        }
        formData.append("file", singleRefPhoto.file);
      } else {
        // Two separate reference photos
        if (!personAPhoto || !personBPhoto) {
          setSearchMessage("Please provide reference photos for both Person A and Person B.");
          setSearching(false);
          return;
        }
        formData.append("file", personAPhoto.file);
        formData.append("file_b", personBPhoto.file);
      }
    }

    try {
      const headers = await getHeaders();
      const res = await fetch(`${apiUrl}/api/search/`, {
        method: "POST",
        headers,
        body: formData,
      });

      if (res.ok) {
        const data = await res.json();
        if (data.message && (!data.matches || data.matches.length === 0)) {
          setSearchMessage(data.message || "No matching photos found in this event.");
          setSearchFilterActive(true);
        } else if (data.matches && data.matches.length > 0) {
          const matchedIds = new Set(data.matches.map((m: any) => m.photo_id));
          setSearchFilterActive(true);
          const modeLabel = searchMode === "together" ? "where you appear together" : searchMode === "either" ? "with either person" : "matching your selfie";
          setSearchMessage(`Found ${data.matches.length} photo${data.matches.length > 1 ? "s" : ""} ${modeLabel}!`);

          // Update photos list with matches
          setPhotos((prev) => {
            const matchesOnly = prev.filter((p) => matchedIds.has(p.photo_id));
            const existingIds = new Set(prev.map((p) => p.photo_id));
            const newMatches: PhotoItem[] = data.matches
              .filter((m: any) => !existingIds.has(m.photo_id))
              .map((m: any) => ({
                photo_id: m.photo_id,
                drive_file_id: m.drive_file_id,
                status: "loading" as const,
                distance: m.distance,
                match_type: m.match_type,
              }));
            const combined = [...matchesOnly, ...newMatches];
            loadPhotoBlobs(combined);
            return combined;
          });
        } else {
          setSearchMessage("No matching photos found for these faces in this event.");
          setSearchFilterActive(true);
        }
      } else {
        const err = await res.json().catch(() => null);
        setSearchMessage(err?.detail || "Search request failed. Please try again.");
      }
    } catch {
      setSearchMessage("Network error during facial recognition search.");
    } finally {
      setSearching(false);
    }
  };

  const handleResetSearch = () => {
    setSingleRefPhoto(null);
    setPersonAPhoto(null);
    setPersonBPhoto(null);
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
          <Button
            asChild
            variant="ghost"
            size="sm"
            className="gap-2 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
          >
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
            Secure client gallery with live camera selfie capture and two-person AI search.
          </p>
        </div>

        {/* AI Face Search Box */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 mb-10 shadow-sm">
          {/* Mode Switcher Tabs */}
          <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-100 dark:border-slate-800">
            <div className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-amber-500" />
              <h3 className="font-bold text-slate-900 dark:text-white text-base">
                AI Face Recognition Search
              </h3>
            </div>

            <div className="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-lg gap-1 text-xs font-semibold">
              <button
                type="button"
                onClick={() => {
                  setSearchMode("single");
                  setSearchMessage("");
                }}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md transition ${
                  searchMode === "single"
                    ? "bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-sm"
                    : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                }`}
              >
                <User className="w-3.5 h-3.5" />
                Find My Photos
              </button>
              <button
                type="button"
                onClick={() => {
                  setSearchMode("together");
                  setSearchMessage("");
                }}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md transition ${
                  searchMode !== "single"
                    ? "bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-sm"
                    : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                }`}
              >
                <Users className="w-3.5 h-3.5" />
                Find Us Together
              </button>
            </div>
          </div>

          {/* Sub-options for Duo Search */}
          {searchMode !== "single" && (
            <div className="py-4 border-b border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-4 text-xs">
              <div className="flex items-center gap-2">
                <span className="font-medium text-slate-700 dark:text-slate-300">Matching Mode:</span>
                <button
                  type="button"
                  onClick={() => setSearchMode("together")}
                  className={`px-2.5 py-1 rounded font-medium transition ${
                    searchMode === "together"
                      ? "bg-blue-600 text-white"
                      : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400"
                  }`}
                >
                  Both Together (Same Photo)
                </button>
                <button
                  type="button"
                  onClick={() => setSearchMode("either")}
                  className={`px-2.5 py-1 rounded font-medium transition ${
                    searchMode === "either"
                      ? "bg-blue-600 text-white"
                      : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400"
                  }`}
                >
                  Either Person
                </button>
              </div>

              <div className="flex items-center gap-2">
                <span className="font-medium text-slate-700 dark:text-slate-300">Reference:</span>
                <button
                  type="button"
                  onClick={() => setDuoInputMethod("single_photo")}
                  className={`px-2.5 py-1 rounded font-medium transition ${
                    duoInputMethod === "single_photo"
                      ? "bg-slate-200 dark:bg-slate-700 text-slate-900 dark:text-white"
                      : "text-slate-500 hover:text-slate-900 dark:hover:text-white"
                  }`}
                >
                  1 Photo with Both of Us
                </button>
                <button
                  type="button"
                  onClick={() => setDuoInputMethod("two_photos")}
                  className={`px-2.5 py-1 rounded font-medium transition ${
                    duoInputMethod === "two_photos"
                      ? "bg-slate-200 dark:bg-slate-700 text-slate-900 dark:text-white"
                      : "text-slate-500 hover:text-slate-900 dark:hover:text-white"
                  }`}
                >
                  2 Separate Photos
                </button>
              </div>
            </div>
          )}

          {/* Reference Photo Input Area */}
          <div className="py-6">
            {searchMode === "single" || duoInputMethod === "single_photo" ? (
              /* Single Photo Input (Single Person OR 1 Photo with Both Faces) */
              <div className="flex flex-col sm:flex-row items-center gap-6">
                {singleRefPhoto ? (
                  <div className="relative group shrink-0 w-28 h-28 rounded-xl overflow-hidden border-2 border-blue-500 shadow">
                    <img
                      src={singleRefPhoto.previewUrl}
                      alt="Reference selfie"
                      className="w-full h-full object-cover"
                    />
                    <button
                      type="button"
                      onClick={() => setSingleRefPhoto(null)}
                      className="absolute top-1 right-1 bg-black/70 text-white rounded-full p-1 hover:bg-black"
                      title="Remove reference"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ) : (
                  <div className="w-28 h-28 rounded-xl border-2 border-dashed border-slate-300 dark:border-slate-700 flex flex-col items-center justify-center text-slate-400 p-2 text-center text-xs shrink-0">
                    <Camera className="w-6 h-6 mb-1 text-slate-400" />
                    <span>No selfie selected</span>
                  </div>
                )}

                <div className="flex-1 text-center sm:text-left">
                  <h4 className="font-semibold text-slate-900 dark:text-white text-sm mb-1">
                    {searchMode === "single"
                      ? "Capture or Upload Your Selfie"
                      : "Capture or Upload a Photo Showing Both Faces"}
                  </h4>
                  <p className="text-xs text-slate-500 mb-4">
                    {searchMode === "single"
                      ? "Take a quick selfie using your webcam/phone camera, or select an existing photo."
                      : "Upload a selfie or group shot where both people appear clearly."}
                  </p>

                  <div className="flex flex-wrap items-center gap-3 justify-center sm:justify-start">
                    <Button
                      type="button"
                      onClick={() => openCameraModal("singleRef")}
                      disabled={searching}
                      className="gap-2 bg-blue-600 hover:bg-blue-700 text-white text-xs h-9 cursor-pointer shadow-sm"
                    >
                      <Camera className="w-4 h-4" />
                      Take Selfie
                    </Button>

                    <input
                      ref={singleFileInputRef}
                      type="file"
                      accept="image/jpeg,image/png"
                      className="hidden"
                      onChange={(e) => handleFileChange(e, "singleRef")}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => singleFileInputRef.current?.click()}
                      disabled={searching}
                      className="gap-2 text-xs h-9 cursor-pointer"
                    >
                      <Upload className="w-4 h-4" />
                      Upload Photo
                    </Button>

                    {singleRefPhoto && (
                      <Button
                        type="button"
                        onClick={handleExecuteSearch}
                        disabled={searching}
                        className="gap-2 text-xs h-9 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white cursor-pointer shadow"
                      >
                        {searching ? (
                          <>
                            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                            Searching…
                          </>
                        ) : (
                          <>
                            <Sparkles className="w-3.5 h-3.5" />
                            Run AI Search
                          </>
                        )}
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              /* Two Separate Photos Input (Person A & Person B) */
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Person A Slot */}
                <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/40 flex items-center gap-4">
                  {personAPhoto ? (
                    <div className="relative group shrink-0 w-20 h-20 rounded-lg overflow-hidden border-2 border-blue-500 shadow">
                      <img
                        src={personAPhoto.previewUrl}
                        alt="Person A reference"
                        className="w-full h-full object-cover"
                      />
                      <button
                        type="button"
                        onClick={() => setPersonAPhoto(null)}
                        className="absolute top-1 right-1 bg-black/70 text-white rounded-full p-1 hover:bg-black"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ) : (
                    <div className="w-20 h-20 rounded-lg border-2 border-dashed border-slate-300 dark:border-slate-700 flex flex-col items-center justify-center text-slate-400 text-xs shrink-0">
                      <User className="w-5 h-5 mb-1" />
                      <span>Person A</span>
                    </div>
                  )}

                  <div className="flex-1">
                    <p className="font-semibold text-xs text-slate-900 dark:text-white mb-2">
                      Person A Reference
                    </p>
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => openCameraModal("personA")}
                        disabled={searching}
                        className="text-xs h-8 gap-1.5 bg-blue-600 text-white"
                      >
                        <Camera className="w-3.5 h-3.5" />
                        Take
                      </Button>

                      <input
                        ref={fileInputARef}
                        type="file"
                        accept="image/jpeg,image/png"
                        className="hidden"
                        onChange={(e) => handleFileChange(e, "personA")}
                      />
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => fileInputARef.current?.click()}
                        disabled={searching}
                        className="text-xs h-8 gap-1.5"
                      >
                        <Upload className="w-3.5 h-3.5" />
                        Upload
                      </Button>
                    </div>
                  </div>
                </div>

                {/* Person B Slot */}
                <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/40 flex items-center gap-4">
                  {personBPhoto ? (
                    <div className="relative group shrink-0 w-20 h-20 rounded-lg overflow-hidden border-2 border-indigo-500 shadow">
                      <img
                        src={personBPhoto.previewUrl}
                        alt="Person B reference"
                        className="w-full h-full object-cover"
                      />
                      <button
                        type="button"
                        onClick={() => setPersonBPhoto(null)}
                        className="absolute top-1 right-1 bg-black/70 text-white rounded-full p-1 hover:bg-black"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ) : (
                    <div className="w-20 h-20 rounded-lg border-2 border-dashed border-slate-300 dark:border-slate-700 flex flex-col items-center justify-center text-slate-400 text-xs shrink-0">
                      <User className="w-5 h-5 mb-1" />
                      <span>Person B</span>
                    </div>
                  )}

                  <div className="flex-1">
                    <p className="font-semibold text-xs text-slate-900 dark:text-white mb-2">
                      Person B Reference
                    </p>
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => openCameraModal("personB")}
                        disabled={searching}
                        className="text-xs h-8 gap-1.5 bg-indigo-600 text-white"
                      >
                        <Camera className="w-3.5 h-3.5" />
                        Take
                      </Button>

                      <input
                        ref={fileInputBRef}
                        type="file"
                        accept="image/jpeg,image/png"
                        className="hidden"
                        onChange={(e) => handleFileChange(e, "personB")}
                      />
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => fileInputBRef.current?.click()}
                        disabled={searching}
                        className="text-xs h-8 gap-1.5"
                      >
                        <Upload className="w-3.5 h-3.5" />
                        Upload
                      </Button>
                    </div>
                  </div>
                </div>

                {/* Submit Duo Search */}
                <div className="md:col-span-2 flex justify-end">
                  <Button
                    type="button"
                    onClick={handleExecuteSearch}
                    disabled={searching || !personAPhoto || !personBPhoto}
                    className="gap-2 text-xs h-9 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white shadow"
                  >
                    {searching ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        Matching Duo…
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-3.5 h-3.5" />
                        Find Us {searchMode === "together" ? "Together" : "Either"}
                      </>
                    )}
                  </Button>
                </div>
              </div>
            )}
          </div>

          {/* Feedback & Reset Controls */}
          {searchMessage && (
            <div className="p-3 bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 rounded-lg text-sm text-blue-800 dark:text-blue-300 flex items-center justify-between gap-4">
              <span>{searchMessage}</span>
              {searchFilterActive && (
                <button
                  type="button"
                  onClick={handleResetSearch}
                  className="text-xs text-blue-600 dark:text-blue-400 font-semibold underline shrink-0 hover:text-blue-800"
                >
                  Show All Photos
                </button>
              )}
            </div>
          )}
        </div>

        {/* Photos Grid Header */}
        <div>
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-2xl font-bold text-slate-900 dark:text-white">
              {searchFilterActive ? "Matching Photos" : "All Photos"} ({photos.length})
            </h2>
            {searchFilterActive && (
              <button
                type="button"
                onClick={handleResetSearch}
                className="text-sm text-blue-600 dark:text-blue-400 hover:underline font-medium"
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
                <Button variant="outline" size="sm" onClick={handleResetSearch}>
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

                      {/* Match badge if duo match */}
                      {photo.match_type === "together" && (
                        <div className="absolute top-2 left-2 bg-emerald-600/90 text-white text-[10px] font-bold px-2 py-0.5 rounded shadow backdrop-blur-sm flex items-center gap-1">
                          <Users className="w-3 h-3" /> Together
                        </div>
                      )}

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

        {/* Live Camera Capture Modal */}
        {cameraOpen && (
          <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 backdrop-blur-sm">
            <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-lg w-full overflow-hidden border border-slate-200 dark:border-slate-800 shadow-2xl">
              <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <Camera className="w-5 h-5 text-blue-600" />
                  <h3 className="font-bold text-slate-900 dark:text-white text-sm">
                    {capturedBlob ? "Preview Selfie" : "Take Live Selfie"}
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={handleCloseCameraModal}
                  className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-4 flex flex-col items-center">
                {cameraError ? (
                  <div className="p-6 text-center">
                    <AlertCircle className="w-10 h-10 text-red-500 mx-auto mb-3" />
                    <p className="text-sm text-red-600 dark:text-red-400 mb-4">{cameraError}</p>
                    <Button variant="outline" size="sm" onClick={handleCloseCameraModal}>
                      Close & Upload Instead
                    </Button>
                  </div>
                ) : (
                  <>
                    <div className="relative w-full aspect-[4/3] bg-black rounded-xl overflow-hidden mb-4 shadow-inner flex items-center justify-center">
                      {cameraStarting && (
                        <div className="absolute inset-0 flex flex-col items-center justify-center text-white/70 gap-2">
                          <RefreshCw className="w-6 h-6 animate-spin text-blue-400" />
                          <span className="text-xs">Starting camera…</span>
                        </div>
                      )}

                      {capturedBlob ? (
                        <img
                          src={capturedBlob.previewUrl}
                          alt="Captured selfie preview"
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <video
                          ref={videoRef}
                          autoPlay
                          playsInline
                          muted
                          className="w-full h-full object-cover -scale-x-100"
                        />
                      )}
                    </div>

                    <canvas ref={canvasRef} className="hidden" />

                    <div className="flex items-center gap-3 w-full justify-center">
                      {!capturedBlob ? (
                        <>
                          <Button
                            type="button"
                            variant="outline"
                            onClick={handleCloseCameraModal}
                            className="text-xs"
                          >
                            Cancel
                          </Button>
                          <Button
                            type="button"
                            onClick={handleCaptureFrame}
                            disabled={cameraStarting || !!cameraError}
                            className="gap-2 bg-blue-600 hover:bg-blue-700 text-white text-xs px-6"
                          >
                            <Camera className="w-4 h-4" />
                            Capture Photo
                          </Button>
                        </>
                      ) : (
                        <>
                          <Button
                            type="button"
                            variant="outline"
                            onClick={handleRetakeCamera}
                            className="gap-1.5 text-xs"
                          >
                            <RotateCcw className="w-3.5 h-3.5" />
                            Retake
                          </Button>
                          <Button
                            type="button"
                            onClick={handleUseCapturedPhoto}
                            className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs px-5 shadow"
                          >
                            <Check className="w-3.5 h-3.5" />
                            Use Photo
                          </Button>
                        </>
                      )}
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        )}

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
