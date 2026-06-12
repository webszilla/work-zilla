import { useEffect, useRef, useState } from "react";

function getSupportedMimeType() {
  if (typeof window === "undefined" || typeof window.MediaRecorder === "undefined") {
    return "";
  }
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4",
    "audio/ogg;codecs=opus",
  ];
  return candidates.find((type) => window.MediaRecorder.isTypeSupported?.(type)) || "";
}

export function useWakeWordDetector({
  enabled = false,
  chunkMs = 2500,
  onChunk,
} = {}) {
  const recorderRef = useRef(null);
  const streamRef = useRef(null);
  const processingRef = useRef(false);
  const activeRef = useRef(false);
  const [supported, setSupported] = useState(false);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    setSupported(
      typeof window !== "undefined"
      && typeof navigator !== "undefined"
      && !!navigator.mediaDevices?.getUserMedia
      && typeof window.MediaRecorder !== "undefined"
    );
  }, []);

  useEffect(() => {
    if (!supported || !enabled) {
      stopDetector();
      return undefined;
    }
    let cancelled = false;

    async function startDetector() {
      if (activeRef.current || cancelled) {
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
        });
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = stream;
        const mimeType = getSupportedMimeType();
        const recorder = mimeType ? new window.MediaRecorder(stream, { mimeType }) : new window.MediaRecorder(stream);
        recorderRef.current = recorder;
        activeRef.current = true;
        recorder.onstart = () => setRunning(true);
        recorder.onstop = () => {
          setRunning(false);
          activeRef.current = false;
          processingRef.current = false;
          if (streamRef.current) {
            streamRef.current.getTracks().forEach((track) => track.stop());
            streamRef.current = null;
          }
        };
        recorder.ondataavailable = async (event) => {
          if (!enabled || cancelled || processingRef.current || !event.data || event.data.size <= 0) {
            return;
          }
          processingRef.current = true;
          try {
            await onChunk?.(event.data);
          } finally {
            processingRef.current = false;
          }
        };
        recorder.start(chunkMs);
      } catch {
        activeRef.current = false;
        setRunning(false);
      }
    }

    startDetector();
    return () => {
      cancelled = true;
      stopDetector();
    };
  }, [chunkMs, enabled, onChunk, supported]);

  function stopDetector() {
    activeRef.current = false;
    processingRef.current = false;
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      try {
        recorder.stop();
      } catch {
        // ignore
      }
    }
    recorderRef.current = null;
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    setRunning(false);
  }

  return {
    supported,
    running,
    stopDetector,
  };
}
