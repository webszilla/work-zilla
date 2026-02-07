const DEFAULT_DEV_API = "http://127.0.0.1:8000";

function normalizeBaseUrl(value) {
  return String(value || "").trim().replace(/\/+$/, "");
}

function resolveApiBaseUrl() {
  const explicit = normalizeBaseUrl(import.meta.env.VITE_API_BASE_URL);
  if (explicit) {
    return explicit;
  }

  if (typeof window !== "undefined") {
    if (import.meta.env.PROD) {
      return window.location.origin;
    }

    const hostname = window.location.hostname;
    if (hostname === "localhost" || hostname === "127.0.0.1") {
      return DEFAULT_DEV_API;
    }
  }

  return DEFAULT_DEV_API;
}

export const API_BASE = resolveApiBaseUrl();
