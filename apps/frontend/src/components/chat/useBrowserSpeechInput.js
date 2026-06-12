import { useEffect, useRef, useState } from "react";

function getSpeechRecognitionCtor() {
  if (typeof window === "undefined") {
    return null;
  }
  return window.SpeechRecognition || window.webkitSpeechRecognition || null;
}

export function useBrowserSpeechInput({
  lang,
  onInterimText,
  onFinalText,
} = {}) {
  const recognitionRef = useRef(null);
  const shouldResumeRef = useRef(false);
  const restartTimerRef = useRef(null);
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const RecognitionCtor = getSpeechRecognitionCtor();
    setSupported(Boolean(RecognitionCtor));
    if (!RecognitionCtor) {
      return undefined;
    }

    const recognition = new RecognitionCtor();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = String(lang || (typeof navigator !== "undefined" ? navigator.language : "") || "en-IN");

    recognition.onstart = () => {
      setError("");
      setListening(true);
    };

    recognition.onresult = (event) => {
      let interimText = "";
      let finalText = "";
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index];
        const transcript = String(result?.[0]?.transcript || "").trim();
        if (!transcript) {
          continue;
        }
        if (result.isFinal) {
          finalText = `${finalText} ${transcript}`.trim();
        } else {
          interimText = `${interimText} ${transcript}`.trim();
        }
      }
      if (interimText && typeof onInterimText === "function") {
        onInterimText(interimText);
      }
      if (finalText && typeof onFinalText === "function") {
        onFinalText(finalText);
      }
    };

    recognition.onerror = (event) => {
      const nextError = String(event?.error || "").trim().toLowerCase();
      if (nextError && nextError !== "no-speech" && nextError !== "aborted") {
        setError(nextError.replace(/-/g, " "));
        shouldResumeRef.current = false;
      }
    };

    recognition.onend = () => {
      setListening(false);
      if (!shouldResumeRef.current) {
        return;
      }
      if (restartTimerRef.current) {
        window.clearTimeout(restartTimerRef.current);
      }
      restartTimerRef.current = window.setTimeout(() => {
        restartTimerRef.current = null;
        if (!shouldResumeRef.current) {
          return;
        }
        try {
          recognition.start();
        } catch {
          setError("microphone unavailable");
          shouldResumeRef.current = false;
        }
      }, 250);
    };

    recognitionRef.current = recognition;
    return () => {
      shouldResumeRef.current = false;
      if (restartTimerRef.current) {
        window.clearTimeout(restartTimerRef.current);
        restartTimerRef.current = null;
      }
      try {
        recognition.stop();
      } catch {
        // Ignore cleanup failures from browsers that already stopped listening.
      }
      if (recognitionRef.current === recognition) {
        recognitionRef.current = null;
      }
    };
  }, [lang, onFinalText, onInterimText]);

  const startListening = () => {
    const recognition = recognitionRef.current;
    if (!recognition || listening) {
      return false;
    }
    setError("");
    shouldResumeRef.current = true;
    try {
      recognition.lang = String(lang || (typeof navigator !== "undefined" ? navigator.language : "") || "en-IN");
      recognition.start();
      return true;
    } catch {
      shouldResumeRef.current = false;
      setError("microphone unavailable");
      return false;
    }
  };

  const stopListening = () => {
    const recognition = recognitionRef.current;
    shouldResumeRef.current = false;
    if (restartTimerRef.current) {
      window.clearTimeout(restartTimerRef.current);
      restartTimerRef.current = null;
    }
    if (!recognition) {
      return;
    }
    try {
      recognition.stop();
    } catch {
      // Ignore duplicate stop calls.
    }
  };

  const toggleListening = () => {
    if (listening) {
      stopListening();
      return false;
    }
    return startListening();
  };

  return {
    supported,
    listening,
    error,
    startListening,
    stopListening,
    toggleListening,
  };
}
