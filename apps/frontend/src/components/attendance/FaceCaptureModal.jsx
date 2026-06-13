import { useEffect, useMemo, useRef, useState } from "react";

function dataUrlToBlob(dataUrl) {
  const [header, payload] = String(dataUrl || "").split(",", 2);
  const mimeMatch = header.match(/^data:(.+);base64$/);
  const mimeType = mimeMatch ? mimeMatch[1] : "image/jpeg";
  const binary = window.atob(payload || "");
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return new Blob([bytes], { type: mimeType });
}

export default function FaceCaptureModal({
  open,
  title = "Face Capture",
  subtitle = "",
  captureCount = 1,
  submitLabel = "Submit",
  busy = false,
  error = "",
  onClose,
  onSubmit,
}) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const [captures, setCaptures] = useState([]);

  useEffect(() => {
    if (!open) {
      return undefined;
    }
    let cancelled = false;
    async function startCamera() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" }, audio: false });
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => null);
        }
      } catch (_error) {
        // parent surface handles upload fallback / blocking notice
      }
    }
    startCamera();
    return () => {
      cancelled = true;
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }
    };
  }, [open]);

  useEffect(() => {
    if (!open) {
      setCaptures([]);
    }
  }, [open]);

  const readyToSubmit = captures.length >= Math.max(1, Number(captureCount || 1));
  const slots = useMemo(() => Array.from({ length: Math.max(1, Number(captureCount || 1)) }), [captureCount]);

  function captureFrame() {
    const video = videoRef.current;
    if (!video || !video.videoWidth || !video.videoHeight) {
      return;
    }
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const context = canvas.getContext("2d");
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.9);
    setCaptures((prev) => {
      if (prev.length >= slots.length) {
        const next = prev.slice();
        next[next.length - 1] = dataUrl;
        return next;
      }
      return [...prev, dataUrl];
    });
  }

  async function submitCaptures() {
    if (!readyToSubmit || busy) {
      return;
    }
    const files = captures.slice(0, slots.length).map((dataUrl, index) => new File([dataUrlToBlob(dataUrl)], `face-capture-${index + 1}.jpg`, { type: "image/jpeg" }));
    await onSubmit(files);
  }

  if (!open) {
    return null;
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="position-fixed top-0 start-0 w-100 h-100 d-flex align-items-center justify-content-center"
      style={{ background: "rgba(0,0,0,0.7)", zIndex: 1080, padding: "1rem" }}
      onClick={onClose}
    >
      <div
        className="card p-3"
        style={{ width: "min(760px, 100%)" }}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="d-flex align-items-start justify-content-between gap-3 mb-3">
          <div>
            <h5 className="mb-1">{title}</h5>
            <div className="small text-secondary">{subtitle}</div>
          </div>
          <button type="button" className="btn btn-sm btn-outline-light" onClick={onClose}>
            <i className="bi bi-x-lg" aria-hidden="true" />
          </button>
        </div>
        {error ? <div className="alert alert-danger py-2">{error}</div> : null}
        <div className="row g-3">
          <div className="col-12 col-lg-7">
            <div className="border rounded-3 overflow-hidden bg-dark">
              <video ref={videoRef} autoPlay playsInline muted style={{ width: "100%", display: "block", aspectRatio: "4 / 3", objectFit: "cover" }} />
            </div>
            <div className="d-flex gap-2 mt-3">
              <button type="button" className="btn btn-success btn-sm" onClick={captureFrame} disabled={busy}>
                Capture
              </button>
              <button type="button" className="btn btn-outline-light btn-sm" onClick={() => setCaptures([])} disabled={busy || !captures.length}>
                Reset
              </button>
            </div>
          </div>
          <div className="col-12 col-lg-5">
            <div className="small text-secondary mb-2">Required captures: {slots.length}</div>
            <div className="row g-2">
              {slots.map((_, index) => (
                <div key={`face-slot-${index}`} className="col-6">
                  <div className="border rounded-3 overflow-hidden bg-body-tertiary d-flex align-items-center justify-content-center" style={{ aspectRatio: "1 / 1" }}>
                    {captures[index] ? (
                      <img src={captures[index]} alt={`Face capture ${index + 1}`} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    ) : (
                      <span className="small text-secondary">Shot {index + 1}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="d-flex justify-content-end gap-2 mt-3">
          <button type="button" className="btn btn-outline-light btn-sm" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="button" className="btn btn-success btn-sm" onClick={submitCaptures} disabled={!readyToSubmit || busy}>
            {busy ? "Processing..." : submitLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
