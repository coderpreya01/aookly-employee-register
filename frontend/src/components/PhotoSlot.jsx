import { useState, useRef, useCallback, useEffect } from "react";

/* ── Face Silhouette SVGs ───────────────────────────────────────────── */
function LeftFaceSVG() {
  return (
    <svg viewBox="0 0 80 100" fill="none" xmlns="http://www.w3.org/2000/svg" style={{width:"100%",height:"100%"}}>
      <ellipse cx="45" cy="38" rx="22" ry="27" fill="#e0e7ff" />
      <path d="M45 65 C30 65 20 75 20 85 L70 85 C70 75 60 65 45 65Z" fill="#e0e7ff" />
      <ellipse cx="23" cy="40" rx="4" ry="6" fill="#c7d2fe" />
      <path d="M38 44 C36 47 37 50 40 51" stroke="#a5b4fc" strokeWidth="1.5" strokeLinecap="round" fill="none" />
      <ellipse cx="42" cy="36" rx="4" ry="2.5" fill="#a5b4fc" />
      <circle cx="42" cy="36" r="1.5" fill="#6366f1" />
      <path d="M12 48 L24 48" stroke="#6366f1" strokeWidth="2" strokeLinecap="round" />
      <polygon points="24,44 30,48 24,52" fill="#6366f1" />
    </svg>
  );
}

function RightFaceSVG() {
  return (
    <svg viewBox="0 0 80 100" fill="none" xmlns="http://www.w3.org/2000/svg" style={{width:"100%",height:"100%"}}>
      <ellipse cx="35" cy="38" rx="22" ry="27" fill="#ede9fe" />
      <path d="M35 65 C50 65 60 75 60 85 L10 85 C10 75 20 65 35 65Z" fill="#ede9fe" />
      <ellipse cx="57" cy="40" rx="4" ry="6" fill="#ddd6fe" />
      <path d="M42 44 C44 47 43 50 40 51" stroke="#c4b5fd" strokeWidth="1.5" strokeLinecap="round" fill="none" />
      <ellipse cx="38" cy="36" rx="4" ry="2.5" fill="#c4b5fd" />
      <circle cx="38" cy="36" r="1.5" fill="#7c3aed" />
      <path d="M68 48 L56 48" stroke="#7c3aed" strokeWidth="2" strokeLinecap="round" />
      <polygon points="56,44 50,48 56,52" fill="#7c3aed" />
    </svg>
  );
}

function FrontFaceSVG() {
  return (
    <svg viewBox="0 0 80 100" fill="none" xmlns="http://www.w3.org/2000/svg" style={{width:"100%",height:"100%"}}>
      <ellipse cx="40" cy="38" rx="24" ry="28" fill="#e0f2fe" />
      <path d="M40 66 C25 66 14 76 14 86 L66 86 C66 76 55 66 40 66Z" fill="#e0f2fe" />
      <ellipse cx="16" cy="40" rx="4" ry="6" fill="#bae6fd" />
      <ellipse cx="64" cy="40" rx="4" ry="6" fill="#bae6fd" />
      <ellipse cx="32" cy="35" rx="4.5" ry="3" fill="#bae6fd" />
      <circle cx="32" cy="35" r="2" fill="#0369a1" />
      <ellipse cx="48" cy="35" rx="4.5" ry="3" fill="#bae6fd" />
      <circle cx="48" cy="35" r="2" fill="#0369a1" />
      <ellipse cx="40" cy="44" rx="2.5" ry="1.5" fill="#bae6fd" />
      <path d="M34 51 Q40 55 46 51" stroke="#7dd3fc" strokeWidth="1.5" strokeLinecap="round" fill="none" />
      <circle cx="40" cy="38" r="30" stroke="#0369a1" strokeWidth="1" strokeDasharray="3 3" opacity="0.35" />
    </svg>
  );
}

/* ── Pose Configuration ─────────────────────────────────────────────── */
const POSE_CONFIG = [
  {
    label: "Left Side",
    sublabel: "Profile View",
    hint: "Turn head left — show your left profile",
    accent: "#6366f1",
    accentLight: "#eef2ff",
    accentBorder: "#c7d2fe",
    FaceSvg: LeftFaceSVG,
  },
  {
    label: "Right Side",
    sublabel: "Profile View",
    hint: "Turn head right — show your right profile",
    accent: "#7c3aed",
    accentLight: "#f5f3ff",
    accentBorder: "#ddd6fe",
    FaceSvg: RightFaceSVG,
  },
  {
    label: "Front Face",
    sublabel: "Straight On",
    hint: "Look straight at the camera",
    accent: "#0369a1",
    accentLight: "#f0f9ff",
    accentBorder: "#bae6fd",
    FaceSvg: FrontFaceSVG,
  },
];

/* ── Blur Quality Detection ─────────────────────────────────────────── */
function measureBlur(imgEl) {
  const size = 200;
  const canvas = document.createElement("canvas");
  canvas.width = size; canvas.height = size;
  const ctx = canvas.getContext("2d");
  const sx = (imgEl.naturalWidth - size) / 2;
  const sy = (imgEl.naturalHeight - size) / 2;
  ctx.drawImage(imgEl, Math.max(0, sx), Math.max(0, sy), size, size, 0, 0, size, size);
  const { data } = ctx.getImageData(0, 0, size, size);
  const gray = [];
  for (let i = 0; i < data.length; i += 4)
    gray.push(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
  let sum = 0, sumSq = 0, n = 0;
  for (let y = 1; y < size - 1; y++) {
    for (let x = 1; x < size - 1; x++) {
      const idx = y * size + x;
      const lap = gray[idx - size] + gray[idx + size] + gray[idx - 1] + gray[idx + 1] - 4 * gray[idx];
      sum += lap; sumSq += lap * lap; n++;
    }
  }
  const mean = sum / n;
  return sumSq / n - mean * mean;
}

const BLUR_THRESHOLD = 40;
const POSE_NAMES = ["left_side", "right_side", "front_face"];

/* ── PhotoSlot Component ────────────────────────────────────────────── */
export default function PhotoSlot({ index, preview, onPhotoSet }) {
  const pose = POSE_CONFIG[index];
  const { FaceSvg } = pose;
  const [mode, setMode] = useState(preview ? "preview" : "idle");
  const [qualityWarn, setQualityWarn] = useState("");
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const imgRef = useRef(null);

  useEffect(() => {
    if (preview) {
      setMode("preview");
    } else if (mode !== "camera") {
      setMode("idle");
    }
  }, [preview]);

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      streamRef.current = stream;
      setMode("camera");
      setQualityWarn("");
    } catch {
      alert("Could not access camera. Please allow permissions or use file upload.");
    }
  };

  useEffect(() => {
    if (mode === "camera" && videoRef.current && streamRef.current)
      videoRef.current.srcObject = streamRef.current;
  }, [mode]);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, [stopCamera]);

  const capturePhoto = () => {
    const video = videoRef.current;
    if (!video) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth; canvas.height = video.videoHeight;
    canvas.getContext("2d").drawImage(video, 0, 0);
    canvas.toBlob((blob) => {
      if (!blob) return;
      const file = new File([blob], `${POSE_NAMES[index]}.jpg`, { type: "image/jpeg" });
      onPhotoSet(index, file);
      stopCamera(); setMode("preview"); setQualityWarn("");
    }, "image/jpeg", 0.95);
  };

  const handleFileUpload = (e) => {
    const f = e.target.files[0];
    if (f) { onPhotoSet(index, f); setMode("preview"); setQualityWarn(""); }
  };

  const handleImageLoad = () => {
    if (!imgRef.current) return;
    try {
      const score = measureBlur(imgRef.current);
      setQualityWarn(score < BLUR_THRESHOLD
        ? "Please retake in better lighting and hold the camera still."
        : "");
    } catch { setQualityWarn(""); }
  };

  const clearPhoto = () => { onPhotoSet(index, null); setMode("idle"); setQualityWarn(""); };
  const cancelCamera = () => { stopCamera(); setMode("idle"); };

  const borderColor = mode === "idle"
    ? pose.accentBorder
    : mode === "preview"
    ? (qualityWarn ? "#fbbf24" : "#34d399")
    : "#374151";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>

      {/* ── Card ── */}
      <div
        style={{
          position: "relative",
          borderRadius: 16,
          border: `2px solid ${borderColor}`,
          overflow: "hidden",
          transition: "border-color 0.2s",
        }}
      >
        {/* ── IDLE: Pose illustration ── */}
        {mode === "idle" && (
          <div style={{ display: "flex", flexDirection: "column" }}>
            {/* Illustration area */}
            <div style={{
              display: "flex", alignItems: "center", justifyContent: "center",
              padding: "22px 0 16px",
              background: `linear-gradient(145deg, ${pose.accentLight}, #ffffff)`,
            }}>
              <div style={{ width: 72, height: 88 }}>
                <FaceSvg />
              </div>
            </div>

            {/* Info + buttons */}
            <div style={{
              borderTop: `1px solid ${pose.accentBorder}`,
              padding: "12px 14px 14px",
              background: "white",
            }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginBottom: 4 }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: "#1e293b" }}>{pose.label}</span>
                <span style={{ fontSize: 10, fontWeight: 500, color: "#94a3b8" }}>{pose.sublabel}</span>
              </div>
              <p style={{ fontSize: 11, color: "#64748b", lineHeight: 1.55, marginBottom: 12 }}>{pose.hint}</p>

              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <button
                  type="button"
                  id={`btn-camera-${index}`}
                  onClick={startCamera}
                  style={{
                    display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                    borderRadius: 10, padding: "9px 12px",
                    background: `linear-gradient(135deg, ${pose.accent}, ${pose.accent}bb)`,
                    color: "white", fontSize: 12, fontWeight: 600,
                    border: "none", cursor: "pointer",
                  }}
                >
                  📷 Take Photo
                </button>
                <label
                  htmlFor={`upload-${index}`}
                  style={{
                    display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                    borderRadius: 10, padding: "8px 12px",
                    background: "white", border: "1.5px solid #e2e8f0",
                    fontSize: 12, fontWeight: 600, color: "#475569", cursor: "pointer",
                  }}
                >
                  📁 Upload File
                  <input id={`upload-${index}`} type="file" accept="image/*" style={{ display: "none" }} onChange={handleFileUpload} />
                </label>
              </div>
            </div>
          </div>
        )}

        {/* ── CAMERA mode ── */}
        {mode === "camera" && (
          <div style={{ position: "relative", aspectRatio: "4/3", background: "#000" }}>
            {/* Face oval guide overlay */}
            <div style={{
              position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center",
              pointerEvents: "none", zIndex: 10,
            }}>
              <div style={{
                width: 110, height: 148, borderRadius: "50%",
                border: "2px dashed rgba(255,255,255,0.55)",
              }} />
            </div>
            <video ref={videoRef} autoPlay playsInline muted style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            {/* Hint bar */}
            <div style={{ position: "absolute", top: 10, left: 0, right: 0, display: "flex", justifyContent: "center", zIndex: 20 }}>
              <span style={{
                borderRadius: 999, background: "rgba(0,0,0,0.72)", padding: "4px 13px",
                fontSize: 11, color: "rgba(255,255,255,0.92)", fontWeight: 500,
              }}>
                {pose.hint}
              </span>
            </div>
            {/* Controls */}
            <div style={{
              position: "absolute", bottom: 0, left: 0, right: 0, zIndex: 20,
              display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "14px 16px 16px",
              background: "linear-gradient(to top, rgba(0,0,0,0.82), transparent)",
            }}>
              <button
                type="button"
                onClick={cancelCamera}
                style={{
                  borderRadius: 999, background: "rgba(255,255,255,0.22)",
                  padding: "6px 14px", fontSize: 12, color: "white", border: "none", cursor: "pointer",
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                id={`btn-capture-${index}`}
                onClick={capturePhoto}
                aria-label={`Capture ${pose.label}`}
                style={{
                  width: 56, height: 56, borderRadius: "50%",
                  border: "4px solid white", background: "white", cursor: "pointer",
                  boxShadow: `0 0 0 4px ${pose.accent}66, 0 4px 16px rgba(0,0,0,0.4)`,
                }}
              />
              <div style={{ width: 58 }} />
            </div>
          </div>
        )}

        {/* ── PREVIEW mode ── */}
        {mode === "preview" && preview && (
          <div style={{ position: "relative", aspectRatio: "4/3" }} className="group">
            <img
              ref={imgRef}
              src={preview}
              alt={pose.label}
              style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
              onLoad={handleImageLoad}
              crossOrigin="anonymous"
            />
            {/* Hover remove overlay */}
            <div className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 transition-opacity group-hover:opacity-100">
              <button
                type="button"
                onClick={clearPhoto}
                style={{
                  borderRadius: 12, background: "white", padding: "9px 18px",
                  fontSize: 12, fontWeight: 600, color: "#dc2626",
                  border: "none", cursor: "pointer",
                  boxShadow: "0 4px 16px rgba(0,0,0,0.25)",
                }}
              >
                🗑 Retake / Remove
              </button>
            </div>
            {/* Quality badge */}
            <div style={{
              position: "absolute", top: 8, right: 8, borderRadius: 999, padding: "3px 10px",
              background: qualityWarn ? "#f59e0b" : "#10b981",
              fontSize: 10, fontWeight: 700, color: "white",
              boxShadow: "0 2px 8px rgba(0,0,0,0.25)",
            }}>
              {qualityWarn ? "⚠ Low Quality" : "✓ Good"}
            </div>
            {/* Label strip at bottom */}
            <div style={{
              position: "absolute", bottom: 0, left: 0, right: 0,
              background: "linear-gradient(to top, rgba(0,0,0,0.65), transparent)",
              padding: "18px 12px 8px",
            }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: "white" }}>{pose.label}</span>
            </div>
          </div>
        )}
      </div>

      {/* Step number + label pill */}
      {mode === "idle" && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
          <div style={{
            width: 20, height: 20, borderRadius: "50%",
            display: "flex", alignItems: "center", justifyContent: "center",
            background: pose.accent, fontSize: 10, fontWeight: 700, color: "white",
          }}>
            {index + 1}
          </div>
          <span style={{ fontSize: 11, fontWeight: 600, color: "#64748b" }}>{pose.label}</span>
        </div>
      )}

      {/* Quality warning box */}
      {qualityWarn && (
        <div
          role="alert"
          style={{
            display: "flex", alignItems: "flex-start", gap: 8,
            borderRadius: 12, border: "1px solid #fde68a",
            background: "#fffbeb", padding: "10px 12px",
            fontSize: 11, lineHeight: 1.55, color: "#92400e",
          }}
        >
          <span style={{ flexShrink: 0, fontSize: 13 }}>⚠️</span>
          <span>
            <strong>Low image quality</strong> — {qualityWarn}
          </span>
        </div>
      )}
    </div>
  );
}
