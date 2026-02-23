import { API_BASE } from "./apiConfig.js";

function buildApiUrl(url) {
  if (url.startsWith("http://") || url.startsWith("https://")) {
    return url;
  }

  if (!API_BASE) {
    return url.startsWith("/api")
      ? url
      : `/api${url.startsWith("/") ? "" : "/"}${url}`;
  }

  if (url.startsWith("/api")) {
    return `${API_BASE}${url}`;
  }

  return `${API_BASE}/api${url.startsWith("/") ? "" : "/"}${url}`;
}

function getCookie(name) {
  if (typeof document === "undefined") {
    return "";
  }
  const cookies = document.cookie ? document.cookie.split(";") : [];
  for (const cookie of cookies) {
    const trimmed = cookie.trim();
    if (trimmed.startsWith(`${name}=`)) {
      return decodeURIComponent(trimmed.substring(name.length + 1));
    }
  }
  return "";
}

function getBrowserTimezone() {
  if (typeof Intl === "undefined" || typeof Intl.DateTimeFormat !== "function") {
    return "";
  }
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "";
  } catch (error) {
    return "";
  }
}

export function getCsrfToken() {
  return getCookie("csrftoken");
}

export async function apiFetch(url, options = {}) {
  const requestUrl = buildApiUrl(url);
  const browserTimezone = getBrowserTimezone();
  const fetchOptions = {
    credentials: "include",
    headers: {
      ...(browserTimezone ? { "X-Browser-Timezone": browserTimezone } : {}),
      ...(options.headers || {})
    },
    ...options
  };

  const method = (fetchOptions.method || "GET").toUpperCase();
  const isFormDataBody =
    typeof FormData !== "undefined" && fetchOptions.body instanceof FormData;
  if (typeof window !== "undefined" && window.__WZ_READ_ONLY__ && method !== "GET" && method !== "HEAD") {
    const err = new Error("read_only");
    err.status = 403;
    err.data = { error: "read_only" };
    throw err;
  }
  if (method !== "GET" && method !== "HEAD") {
    if (!getCsrfToken()) {
      await fetch(buildApiUrl("/api/auth/csrf"), { credentials: "include" });
    }
    fetchOptions.headers = {
      "X-CSRFToken": getCsrfToken(),
      ...fetchOptions.headers
    };
    if (!isFormDataBody && !fetchOptions.headers["Content-Type"]) {
      fetchOptions.headers["Content-Type"] = "application/json";
    }
  }

  const response = await fetch(requestUrl, fetchOptions);
  const text = await response.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch (error) {
      data = null;
    }
  }

  if (!response.ok) {
    const message = data?.error || data?.detail || `Request failed (${response.status})`;
    const err = new Error(message);
    err.status = response.status;
    err.data = data;
    throw err;
  }

  return data;
}
