import { useEffect, useRef, useState } from "react";

function containsTamil(text = "") {
  return /[\u0B80-\u0BFF]/.test(String(text || ""));
}

function containsTelugu(text = "") {
  return /[\u0C00-\u0C7F]/.test(String(text || ""));
}

function containsKannada(text = "") {
  return /[\u0C80-\u0CFF]/.test(String(text || ""));
}

function detectSpeechLanguage(text = "") {
  if (containsTamil(text)) {
    return "ta-IN";
  }
  if (containsTelugu(text)) {
    return "te-IN";
  }
  if (containsKannada(text)) {
    return "kn-IN";
  }
  return "en-IN";
}

function normalizeSpeechText(text = "") {
  return String(text || "")
    .replace(/[*_`#>-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function pickVoice(voices, langCode) {
  const normalized = String(langCode || "").toLowerCase();
  const exact = voices.find((voice) => String(voice?.lang || "").toLowerCase() === normalized);
  if (exact) {
    return exact;
  }
  const prefix = normalized.split("-")[0];
  return voices.find((voice) => String(voice?.lang || "").toLowerCase().startsWith(prefix)) || null;
}

function pickVoiceByGender(voices, gender) {
  const normalized = String(gender || "").trim().toLowerCase();
  if (!normalized) {
    return null;
  }
  const hints = normalized === "male"
    ? ["male", "man", "david", "alex", "aaron", "daniel"]
    : ["female", "woman", "samantha", "victoria", "karen", "moira"];
  return voices.find((voice) => {
    const name = String(voice?.name || "").toLowerCase();
    return hints.some((hint) => name.includes(hint));
  }) || null;
}

export function useSpeechPlayback() {
  const [supported, setSupported] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [enabled, setEnabled] = useState(true);
  const voicesRef = useRef([]);
  const audioRef = useRef(null);
  const objectUrlRef = useRef("");

  useEffect(() => {
    const available = typeof window !== "undefined" && !!window.speechSynthesis && typeof window.SpeechSynthesisUtterance !== "undefined";
    setSupported(available);
    if (!available) {
      return undefined;
    }
    const loadVoices = () => {
      voicesRef.current = window.speechSynthesis.getVoices() || [];
    };
    loadVoices();
    window.speechSynthesis.onvoiceschanged = loadVoices;
    return () => {
      if (window.speechSynthesis) {
        window.speechSynthesis.onvoiceschanged = null;
        window.speechSynthesis.cancel();
      }
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
        objectUrlRef.current = "";
      }
    };
  }, []);

  const stop = () => {
    if (typeof window === "undefined" || !window.speechSynthesis) {
      return;
    }
    window.speechSynthesis.cancel();
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = "";
    }
    setSpeaking(false);
  };

  const playBlob = async (blob) => {
    if (!blob || typeof window === "undefined") {
      return false;
    }
    stop();
    const audio = new Audio();
    audioRef.current = audio;
    const objectUrl = URL.createObjectURL(blob);
    objectUrlRef.current = objectUrl;
    audio.src = objectUrl;
    audio.onplay = () => setSpeaking(true);
    audio.onended = () => {
      setSpeaking(false);
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
        objectUrlRef.current = "";
      }
    };
    audio.onerror = () => setSpeaking(false);
    try {
      await audio.play();
      return true;
    } catch {
      setSpeaking(false);
      return false;
    }
  };

  const speak = (text, options = {}) => {
    const message = normalizeSpeechText(text);
    if (!supported || !enabled || !message || typeof window === "undefined" || !window.speechSynthesis) {
      return false;
    }
    stop();
    const utterance = new window.SpeechSynthesisUtterance(message);
    const targetLang = detectSpeechLanguage(message);
    const preferredGender = String(options?.voiceGender || "").trim().toLowerCase();
    const nextVoice = pickVoiceByGender(voicesRef.current, preferredGender)
      || pickVoice(voicesRef.current, targetLang)
      || pickVoice(voicesRef.current, targetLang.split("-")[0])
      || pickVoice(voicesRef.current, "en-IN");
    utterance.lang = nextVoice?.lang || targetLang;
    if (nextVoice) {
      utterance.voice = nextVoice;
    }
    utterance.rate = targetLang === "en-IN" ? 1 : 0.98;
    utterance.pitch = preferredGender === "male" ? 0.88 : 1.04;
    utterance.volume = 1;
    utterance.onstart = () => setSpeaking(true);
    utterance.onend = () => setSpeaking(false);
    utterance.onerror = () => setSpeaking(false);
    window.speechSynthesis.speak(utterance);
    return true;
  };

  return {
    supported,
    speaking,
    enabled,
    setEnabled,
    speak,
    playBlob,
    stop,
  };
}
