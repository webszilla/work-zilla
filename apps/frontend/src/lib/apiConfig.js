const DEFAULT_DEV_API = "http://127.0.0.1:8000";

function normalizeBaseUrl(value) {
  return String(value || "").trim().replace(/\/+$/, "");
}

function isLocalHostname(hostname) {
  return hostname === "localhost" || hostname === "127.0.0.1";
}

function isLocalApiUrl(value) {
  try {
    const parsed = new URL(value);
    return isLocalHostname(parsed.hostname);
  } catch (_error) {
    return false;
  }
}

function isPlaceholderApiUrl(value) {
  try {
    const parsed = new URL(value);
    const host = String(parsed.hostname || "").toLowerCase();
    return host === "example.com" || host === "api.example.com" || host.endsWith(".example.com");
  } catch (_error) {
    return false;
  }
}

function resolveApiBaseUrl() {
  const explicit = normalizeBaseUrl(import.meta.env.VITE_API_BASE_URL);

  if (typeof window !== "undefined") {
    const hostname = window.location.hostname;
    const localHost = isLocalHostname(hostname);

    if (explicit) {
      // Safety guard: never use localhost API base on live/staging domains.
      if (!(isLocalApiUrl(explicit) && !localHost) && !isPlaceholderApiUrl(explicit)) {
        return explicit;
      }
    }

    if (import.meta.env.PROD) {
      return window.location.origin;
    }

    if (localHost) {
      return DEFAULT_DEV_API;
    }

    return window.location.origin;
  }

  if (explicit && !isPlaceholderApiUrl(explicit)) {
    return explicit;
  }

  return DEFAULT_DEV_API;
}

export const API_BASE = resolveApiBaseUrl();
