"use client";

import { useState, useEffect, useRef, use } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Camera,
  Upload,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  Download,
  X,
  ShieldCheck,
  Lock,
  ArrowRight
} from "lucide-react";

interface GuestPhotoMatch {
  photo_id: string;
  filename: string;
  match_score: number;
  photo_url: string;
}

interface EventPublicInfo {
  event_id: string;
  event_name: string;
  client_name: string;
  date: string;
  expires_at?: string;
}

export default function GuestPortalPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const searchParams = useSearchParams();
  const token = searchParams.get("token") || "";

  const [eventInfo, setEventInfo] = useState<EventPublicInfo | null>(null);
  const [loadingInfo, setLoadingInfo] = useState(true);
  const [accessError, setAccessError] = useState<string | null>(null);

  // Step 1: Consent State
  const [consentGiven, setConsentGiven] = useState(false);
  const [consentConfirmed, setConsentConfirmed] = useState(false);

  // Step 2: Reference Selfie State
  const [selfiePhoto, setSelfiePhoto] = useState<{ file: File; previewUrl: string } | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchMessage, setSearchMessage] = useState<string | null>(null);
  const [searchResults, setSearchResults] = useState<GuestPhotoMatch[] | null>(null);

  // Camera Capture Modal State
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [capturedBlob, setCapturedBlob] = useState<{ blob: Blob; previewUrl: string } | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [cameraStarting, setCameraStarting] = useState(false);

  // Enlarged Photo Modal
  const [selectedPhoto, setSelectedPhoto] = useState<GuestPhotoMatch | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

  // Validate guest access token and fetch event info
  useEffect(() => {
    if (!token) {
      setAccessError("No guest access token was provided. Please scan the event QR code or use the official link provided by your photographer.");
      setLoadingInfo(false);
      return;
    }

    const verifyToken = async () => {
      try {
        const res = await fetch(`${apiUrl}/api/guest/${id}/info?token=${encodeURIComponent(token)}`);
        if (res.ok) {
          const data = await res.json();
          setEventInfo(data);
        } else {
          const err = await res.json().catch(() => null);
          setAccessError(err?.detail || "This guest access link is invalid, expired, or has been revoked.");
        }
      } catch {
        setAccessError("Unable to reach the server. Please verify your connection.");
      } finally {
        setLoadingInfo(false);
      }
    };

    verifyToken();
  }, [id, token, apiUrl]);

  // Clean up object URLs and camera streams on unmount
  useEffect(() => {
    return () => {
      if (cameraStream) {
        cameraStream.getTracks().forEach((track) => track.stop());
      }
      if (selfiePhoto?.previewUrl) {
        URL.revokeObjectURL(selfiePhoto.previewUrl);
      }
    };
  }, [cameraStream, selfiePhoto]);

  // Re-attach video stream when video element mounts
  useEffect(() => {
    if (videoRef.current && cameraStream && !capturedBlob) {
      videoRef.current.srcObject = cameraStream;
      videoRef.current.play().catch(() => {});
    }
  }, [cameraStream, capturedBlob]);

  // Camera Management
  const stopCameraTracks = () => {
    if (cameraStream) {
      cameraStream.getTracks().forEach((track) => track.stop());
      setCameraStream(null);
    }
  };

  const handleOpenLiveCamera = async () => {
    setCameraError(null);
    setCapturedBlob(null);
    setCameraStarting(true);
    setCameraOpen(true);

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setCameraError("Camera access is not supported on this browser or device. Please upload an existing photo.");
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
        setCameraError("Camera permission was denied. Please allow camera access in your browser settings, or upload an existing photo.");
      } else if (err.name === "NotFoundError" || err.name === "DevicesNotFoundError") {
        setCameraError("No camera detected on this device. Please use 'Upload Photo'.");
      } else {
        setCameraError("Unable to access camera. Please check your browser permissions or upload a selfie file.");
      }
    } finally {
      setCameraStarting(false);
    }
  };

  const handleCaptureFrame = () => {
    if (!videoRef.current) return;
    const video = videoRef.current;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    canvas.toBlob((blob) => {
      if (blob) {
        const previewUrl = URL.createObjectURL(blob);
        setCapturedBlob({ blob, previewUrl });
        stopCameraTracks();
      }
    }, "image/jpeg", 0.95);
  };

  const handleRetakeCamera = () => {
    if (capturedBlob) {
      URL.revokeObjectURL(capturedBlob.previewUrl);
      setCapturedBlob(null);
    }
    handleOpenLiveCamera();
  };

  const handleUseSnapshot = () => {
    if (!capturedBlob) return;
    const file = new File([capturedBlob.blob], `selfie_${Date.now()}.jpg`, {
      type: "image/jpeg",
    });

    if (selfiePhoto?.previewUrl) {
      URL.revokeObjectURL(selfiePhoto.previewUrl);
    }

    setSelfiePhoto({ file, previewUrl: capturedBlob.previewUrl });
    setCapturedBlob(null);
    setCameraOpen(false);
    stopCameraTracks();
  };

  const handleCloseCameraModal = () => {
    if (capturedBlob) {
      URL.revokeObjectURL(capturedBlob.previewUrl);
      setCapturedBlob(null);
    }
    stopCameraTracks();
    setCameraOpen(false);
  };

  // File Upload Selection
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (selfiePhoto?.previewUrl) {
      URL.revokeObjectURL(selfiePhoto.previewUrl);
    }

    const previewUrl = URL.createObjectURL(file);
    setSelfiePhoto({ file, previewUrl });
    e.target.value = "";
  };

  // Perform Consented Biometric Search
  const handleExecuteSearch = async () => {
    if (!selfiePhoto) {
      setSearchMessage("Please take a selfie or upload a photo first.");
      return;
    }

    if (!consentConfirmed) {
      setSearchMessage("Biometric consent is required before processing.");
      return;
    }

    setSearching(true);
    setSearchMessage(null);

    const formData = new FormData();
    formData.append("token", token);
    formData.append("consent", "true");
    formData.append("file", selfiePhoto.file);

    try {
      const res = await fetch(`${apiUrl}/api/guest/${id}/search`, {
        method: "POST",
        body: formData,
      });

      if (res.ok) {
        const data = await res.json();
        setSearchResults(data.results || []);
        if (!data.results || data.results.length === 0) {
          setSearchMessage("No matching photos found in this event. Try another photo with different lighting or angle.");
        } else {
          setSearchMessage(`Found ${data.results.length} photo${data.results.length > 1 ? "s" : ""} of you in this album!`);
        }
      } else {
        const err = await res.json().catch(() => null);
        setSearchMessage(err?.detail || "Photo search failed. Please try again.");
      }
    } catch {
      setSearchMessage("Network error searching photos. Please check your connection.");
    } finally {
      setSearching(false);
    }
  };

  const handleResetSearch = () => {
    if (selfiePhoto?.previewUrl) {
      URL.revokeObjectURL(selfiePhoto.previewUrl);
    }
    setSelfiePhoto(null);
    setSearchResults(null);
    setSearchMessage(null);
  };

  // Loading State
  if (loadingInfo) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
        <div className="text-center">
          <div className="w-10 h-10 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-slate-400 font-medium">Verifying guest access grant…</p>
        </div>
      </div>
    );
  }

  // Access Error State
  if (accessError || !eventInfo) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-2xl p-8 text-center shadow-xl">
          <div className="w-14 h-14 bg-red-950/80 border border-red-800 rounded-full flex items-center justify-center mx-auto mb-4">
            <Lock className="w-7 h-7 text-red-400" />
          </div>
          <h1 className="text-xl font-bold text-white mb-2">Guest Access Inactive</h1>
          <p className="text-slate-400 text-sm mb-6 leading-relaxed">
            {accessError || "The link or QR code you scanned is no longer valid."}
          </p>
          <div className="p-4 bg-slate-800/60 rounded-xl text-xs text-slate-400 border border-slate-700/60 text-left">
            <p className="font-semibold text-slate-300 mb-1">What can I do?</p>
            <p>Please contact your event photographer or host to request an updated QR code or fresh guest access link.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 py-10 px-4 sm:px-6">
      <div className="max-w-3xl mx-auto">
        {/* Event Header Banner */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 mb-8 shadow-sm">
          <div className="flex items-center gap-2 mb-2">
            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-blue-950/80 text-blue-400 border border-blue-800">
              Guest Portal
            </span>
            <span className="text-xs text-slate-500">• {eventInfo.date}</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
            {eventInfo.event_name}
          </h1>
          <p className="text-slate-400 text-sm mt-1">
            Hosted for <span className="font-semibold text-slate-300">{eventInfo.client_name}</span>
          </p>
        </div>

        {/* STEP 1: Biometric Consent Screen */}
        {!consentConfirmed && (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 sm:p-8 shadow-lg">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-blue-950/80 border border-blue-800 flex items-center justify-center shrink-0">
                <ShieldCheck className="w-5 h-5 text-blue-400" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-white">Biometric Facial Search Consent</h2>
                <p className="text-xs text-slate-400">Clickworthy Privacy & Security Protection</p>
              </div>
            </div>

            <div className="bg-slate-800/50 border border-slate-700/60 rounded-xl p-5 mb-6 text-sm text-slate-300 leading-relaxed space-y-3">
              <p>
                To help you find your photos from <span className="font-semibold text-white">{eventInfo.event_name}</span>, Clickworthy analyzes facial geometry from your selfie in real-time memory.
              </p>
              <ul className="list-disc pl-5 space-y-1.5 text-xs text-slate-400">
                <li>Your selfie is processed strictly to generate a temporary mathematical feature vector.</li>
                <li>Your reference selfie image is <strong className="text-slate-300">immediately discarded</strong> from memory and disk upon extraction.</li>
                <li>We <strong className="text-slate-300">never store, sell, or reuse</strong> your facial data across other events or third parties.</li>
                <li>You will only see event photos in which you appear.</li>
              </ul>
            </div>

            <div className="flex items-start gap-3 p-4 bg-slate-950/60 border border-slate-800 rounded-xl mb-6 cursor-pointer" onClick={() => setConsentGiven(!consentGiven)}>
              <input
                type="checkbox"
                id="consent-checkbox"
                checked={consentGiven}
                onChange={(e) => setConsentGiven(e.target.checked)}
                className="mt-1 w-4 h-4 rounded border-slate-700 text-blue-600 focus:ring-blue-500 bg-slate-900 cursor-pointer"
              />
              <label htmlFor="consent-checkbox" className="text-xs text-slate-300 cursor-pointer leading-relaxed select-none">
                I understand and consent to Clickworthy analyzing my selfie to locate my photos in this event album.
              </label>
            </div>

            <Button
              onClick={() => setConsentConfirmed(true)}
              disabled={!consentGiven}
              className="w-full py-6 text-sm font-semibold rounded-xl bg-blue-600 hover:bg-blue-500 text-white flex items-center justify-center gap-2 shadow-lg disabled:opacity-40"
            >
              Continue to Photo Finder <ArrowRight className="w-4 h-4" />
            </Button>
          </div>
        )}

        {/* STEP 2 & 3: Photo Finder & Matched Results */}
        {consentConfirmed && (
          <div className="space-y-8">
            {/* Selfie Input Panel */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 sm:p-8 shadow-lg">
              <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                <div>
                  <h2 className="text-lg font-bold text-white">Find Your Event Photos</h2>
                  <p className="text-xs text-slate-400">Take a quick selfie or upload a photo from your gallery</p>
                </div>
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-emerald-950/60 text-emerald-400 border border-emerald-800">
                  <CheckCircle2 className="w-3 h-3" /> Consent Verified
                </span>
              </div>

              {/* Action Buttons: Take Selfie vs Upload */}
              {!selfiePhoto ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 my-6">
                  <Button
                    onClick={handleOpenLiveCamera}
                    variant="outline"
                    className="py-8 border-slate-700 bg-slate-800/60 hover:bg-slate-800 text-white flex flex-col items-center justify-center gap-2 rounded-xl"
                  >
                    <Camera className="w-6 h-6 text-blue-400" />
                    <span className="font-semibold text-sm">Take Selfie</span>
                    <span className="text-[11px] text-slate-400">Use mobile or laptop camera</span>
                  </Button>

                  <Button
                    onClick={() => fileInputRef.current?.click()}
                    variant="outline"
                    className="py-8 border-slate-700 bg-slate-800/60 hover:bg-slate-800 text-white flex flex-col items-center justify-center gap-2 rounded-xl"
                  >
                    <Upload className="w-6 h-6 text-emerald-400" />
                    <span className="font-semibold text-sm">Upload Photo</span>
                    <span className="text-[11px] text-slate-400">Select JPEG or PNG from device</span>
                  </Button>

                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/jpg"
                    className="hidden"
                    onChange={handleFileSelect}
                  />
                </div>
              ) : (
                /* Selfie Preview & Execute Search */
                <div className="my-6 p-4 bg-slate-800/40 border border-slate-700/60 rounded-xl flex flex-col sm:flex-row items-center gap-6">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={selfiePhoto.previewUrl}
                    alt="Your reference selfie"
                    className="w-28 h-28 object-cover rounded-xl border border-slate-600 shadow-md shrink-0"
                  />
                  <div className="flex-1 text-center sm:text-left">
                    <p className="font-semibold text-sm text-white mb-1">Selfie Ready</p>
                    <p className="text-xs text-slate-400 mb-4">
                      {selfiePhoto.file.name} • {(selfiePhoto.file.size / 1024).toFixed(1)} KB
                    </p>
                    <div className="flex items-center justify-center sm:justify-start gap-3 flex-wrap">
                      <Button
                        onClick={handleExecuteSearch}
                        disabled={searching}
                        className="bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs px-5 py-2.5 rounded-lg flex items-center gap-2"
                      >
                        {searching ? (
                          <>
                            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                            Searching Album…
                          </>
                        ) : (
                          "Find My Photos"
                        )}
                      </Button>
                      <Button
                        onClick={handleResetSearch}
                        disabled={searching}
                        variant="outline"
                        size="sm"
                        className="border-slate-700 text-slate-300 hover:bg-slate-800 text-xs"
                      >
                        Retake / Change
                      </Button>
                    </div>
                  </div>
                </div>
              )}

              {searchMessage && (
                <div className={`p-4 rounded-xl text-xs font-medium border ${
                  searchResults && searchResults.length > 0
                    ? "bg-emerald-950/60 border-emerald-800 text-emerald-200"
                    : "bg-amber-950/60 border-amber-800 text-amber-200"
                }`}>
                  {searchMessage}
                </div>
              )}
            </div>

            {/* Matched Photo Gallery */}
            {searchResults && searchResults.length > 0 && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-bold text-white">
                    Your Matched Photos ({searchResults.length})
                  </h3>
                  <Button
                    onClick={handleResetSearch}
                    variant="outline"
                    size="sm"
                    className="text-xs border-slate-700 text-slate-300 hover:bg-slate-800"
                  >
                    Clear Results
                  </Button>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                  {searchResults.map((photo) => (
                    <div
                      key={photo.photo_id}
                      className="group relative aspect-square bg-slate-900 rounded-xl overflow-hidden border border-slate-800 hover:border-slate-600 transition shadow"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={`${apiUrl}${photo.photo_url}`}
                        alt={photo.filename}
                        className="w-full h-full object-cover cursor-pointer group-hover:scale-105 transition duration-300"
                        onClick={() => setSelectedPhoto(photo)}
                      />
                      <div className="absolute inset-x-0 bottom-0 p-2 bg-gradient-to-t from-black/80 to-transparent flex items-center justify-between opacity-0 group-hover:opacity-100 transition">
                        <span className="text-[10px] text-white font-medium truncate max-w-[90px]">
                          {photo.filename}
                        </span>
                        <a
                          href={`${apiUrl}${photo.photo_url}`}
                          download={photo.filename}
                          className="p-1.5 bg-white/20 hover:bg-white/30 rounded-md text-white backdrop-blur-sm transition"
                          title="Download photo"
                        >
                          <Download className="w-3.5 h-3.5" />
                        </a>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Live Camera Capture Modal */}
        {cameraOpen && (
          <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full overflow-hidden shadow-2xl flex flex-col">
              <div className="p-4 border-b border-slate-800 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Camera className="w-5 h-5 text-blue-400" />
                  <span className="font-bold text-sm text-white">Live Camera Selfie</span>
                </div>
                <button
                  onClick={handleCloseCameraModal}
                  className="text-slate-400 hover:text-white p-1 rounded-md"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-6 flex flex-col items-center">
                {cameraError ? (
                  <div className="p-6 text-center">
                    <AlertTriangle className="w-10 h-10 text-amber-400 mx-auto mb-3" />
                    <p className="text-sm text-slate-300 mb-4">{cameraError}</p>
                    <Button
                      onClick={handleCloseCameraModal}
                      variant="outline"
                      size="sm"
                      className="border-slate-700 text-white"
                    >
                      Close & Upload Instead
                    </Button>
                  </div>
                ) : capturedBlob ? (
                  /* Snapshot Preview */
                  <div className="flex flex-col items-center w-full">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={capturedBlob.previewUrl}
                      alt="Captured preview"
                      className="w-full max-h-[380px] object-cover rounded-xl border border-slate-700 shadow-md mb-6"
                    />
                    <div className="flex items-center gap-4 w-full">
                      <Button
                        onClick={handleRetakeCamera}
                        variant="outline"
                        className="flex-1 border-slate-700 text-white font-semibold py-5 rounded-xl"
                      >
                        Retake
                      </Button>
                      <Button
                        onClick={handleUseSnapshot}
                        className="flex-1 bg-blue-600 hover:bg-blue-500 text-white font-semibold py-5 rounded-xl"
                      >
                        Use Photo
                      </Button>
                    </div>
                  </div>
                ) : (
                  /* Live Camera View */
                  <div className="flex flex-col items-center w-full">
                    <div className="relative w-full aspect-video bg-black rounded-xl overflow-hidden mb-6 border border-slate-700 shadow-inner">
                      <video
                        ref={videoRef}
                        autoPlay
                        playsInline
                        muted
                        className="w-full h-full object-cover transform -scale-x-100"
                      />
                      {cameraStarting && (
                        <div className="absolute inset-0 flex items-center justify-center bg-black/50 text-white text-xs">
                          Starting camera…
                        </div>
                      )}
                    </div>
                    <Button
                      onClick={handleCaptureFrame}
                      disabled={cameraStarting}
                      className="w-full py-6 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl flex items-center justify-center gap-2 shadow-lg"
                    >
                      <Camera className="w-5 h-5" /> Take Snapshot
                    </Button>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Enlarged Photo View Modal */}
        {selectedPhoto && (
          <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex items-center justify-center p-4">
            <div className="relative max-w-4xl max-h-[90vh] flex flex-col items-center">
              <button
                onClick={() => setSelectedPhoto(null)}
                className="absolute -top-12 right-0 text-white hover:text-slate-300 p-2"
              >
                <X className="w-6 h-6" />
              </button>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`${apiUrl}${selectedPhoto.photo_url}`}
                alt={selectedPhoto.filename}
                className="max-h-[80vh] w-auto object-contain rounded-xl shadow-2xl border border-slate-800"
              />
              <div className="mt-4 flex items-center justify-between w-full px-2">
                <span className="text-sm font-medium text-slate-300">{selectedPhoto.filename}</span>
                <a
                  href={`${apiUrl}${selectedPhoto.photo_url}`}
                  download={selectedPhoto.filename}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded-lg flex items-center gap-2 transition shadow"
                >
                  <Download className="w-4 h-4" /> Download Full Photo
                </a>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
