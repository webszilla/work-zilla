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

export function useAudioRecorder({ onRecorded } = {}) {
  const recorderRef = useRef(null);
  const streamRef = useRef(null);
  const chunksRef = useRef([]);
  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const sourceRef = useRef(null);
  const monitorFrameRef = useRef(0);
  const silenceSinceRef = useRef(0);
  const [supported, setSupported] = useState(false);
  const [recording, setRecording] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setSupported(
      typeof window !== "undefined"
      && typeof navigator !== "undefined"
      && !!navigator.mediaDevices?.getUserMedia
      && typeof window.MediaRecorder !== "undefined"
    );
    return () => {
      if (recorderRef.current && recorderRef.current.state !== "inactive") {
        try {
          recorderRef.current.stop();
        } catch {
          // ignore
        }
      }
      if (monitorFrameRef.current) {
        window.cancelAnimationFrame(monitorFrameRef.current);
        monitorFrameRef.current = 0;
      }
      if (sourceRef.current) {
        try {
          sourceRef.current.disconnect();
        } catch {
          // ignore
        }
        sourceRef.current = null;
      }
      if (analyserRef.current) {
        try {
          analyserRef.current.disconnect();
        } catch {
          // ignore
        }
        analyserRef.current = null;
      }
      if (audioContextRef.current) {
        try {
          audioContextRef.current.close();
        } catch {
          // ignore
        }
        audioContextRef.current = null;
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }
    };
  }, []);

  const stopSilenceMonitor = () => {
    silenceSinceRef.current = 0;
    if (monitorFrameRef.current) {
      window.cancelAnimationFrame(monitorFrameRef.current);
      monitorFrameRef.current = 0;
    }
    if (sourceRef.current) {
      try {
        sourceRef.current.disconnect();
      } catch {
        // ignore
      }
      sourceRef.current = null;
    }
    if (analyserRef.current) {
      try {
        analyserRef.current.disconnect();
      } catch {
        // ignore
      }
      analyserRef.current = null;
    }
    if (audioContextRef.current) {
      try {
        audioContextRef.current.close();
      } catch {
        // ignore
      }
      audioContextRef.current = null;
    }
  };

  const startSilenceMonitor = (stream, stopAfterSilenceMs = 0) => {
    if (
      typeof window === "undefined"
      || !stopAfterSilenceMs
      || stopAfterSilenceMs < 1000
      || typeof window.AudioContext === "undefined"
    ) {
      return;
    }
    try {
      const audioContext = new window.AudioContext();
      const source = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 2048;
      source.connect(analyser);
      audioContextRef.current = audioContext;
      sourceRef.current = source;
      analyserRef.current = analyser;
      silenceSinceRef.current = 0;
      const buffer = new Uint8Array(analyser.frequencyBinCount);
      const noiseThreshold = 8;

      const monitor = () => {
        if (!analyserRef.current || !recorderRef.current || recorderRef.current.state === "inactive") {
          stopSilenceMonitor();
          return;
        }
        analyser.getByteTimeDomainData(buffer);
        let peak = 0;
        for (let index = 0; index < buffer.length; index += 1) {
          peak = Math.max(peak, Math.abs(buffer[index] - 128));
        }
        const now = Date.now();
        if (peak > noiseThreshold) {
          silenceSinceRef.current = 0;
        } else if (!silenceSinceRef.current) {
          silenceSinceRef.current = now;
        } else if (now - silenceSinceRef.current >= stopAfterSilenceMs) {
          stopRecording();
          return;
        }
        monitorFrameRef.current = window.requestAnimationFrame(monitor);
      };

      monitorFrameRef.current = window.requestAnimationFrame(monitor);
    } catch {
      // Ignore silence monitor failures and continue normal recording.
    }
  };

  const startRecording = async (options = {}) => {
    if (!supported || recording) {
      return false;
    }
    setError("");
    chunksRef.current = [];
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mimeType = getSupportedMimeType();
      const recorder = mimeType ? new window.MediaRecorder(stream, { mimeType }) : new window.MediaRecorder(stream);
      recorderRef.current = recorder;
      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };
      recorder.onerror = () => {
        setError("audio capture failed");
      };
      recorder.onstart = () => {
        setRecording(true);
      };
      recorder.onstop = async () => {
        setRecording(false);
        stopSilenceMonitor();
        const recordedChunks = chunksRef.current.slice();
        chunksRef.current = [];
        const blobType = mimeType || recordedChunks[0]?.type || "audio/webm";
        const blob = recordedChunks.length ? new Blob(recordedChunks, { type: blobType }) : null;
        if (streamRef.current) {
          streamRef.current.getTracks().forEach((track) => track.stop());
          streamRef.current = null;
        }
        if (blob && blob.size > 0 && typeof onRecorded === "function") {
          await onRecorded(blob);
        }
      };
      recorder.start();
      startSilenceMonitor(stream, Number(options?.stopAfterSilenceMs || 0));
      return true;
    } catch {
      setError("microphone permission denied");
      stopSilenceMonitor();
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }
      return false;
    }
  };

  const stopRecording = () => {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state === "inactive") {
      return;
    }
    stopSilenceMonitor();
    try {
      recorder.stop();
    } catch {
      setRecording(false);
    }
  };

  return {
    supported,
    recording,
    error,
    startRecording,
    stopRecording,
  };
}
