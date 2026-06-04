import { API_BASE_URL } from "@/core/config/env";

function getCookie(name: string) {
  if (typeof document === "undefined") {
    return "";
  }

  const cookies = document.cookie ? document.cookie.split(";") : [];
  for (const entry of cookies) {
    const cookie = entry.trim();
    if (cookie.startsWith(`${name}=`)) {
      return decodeURIComponent(cookie.slice(name.length + 1));
    }
  }
  return "";
}

async function ensureCsrfCookie() {
  await fetch(`${API_BASE_URL}/api/auth/csrf?_ts=${Date.now()}`, {
    method: "GET",
    credentials: "include",
    cache: "no-store",
    headers: {
      Accept: "application/json",
      "Cache-Control": "no-cache"
    }
  });
}

export async function apiGet<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    credentials: "include",
    headers: {
      Accept: "application/json",
      ...(init?.headers || {})
    }
  });

  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`);
  }

  return response.json() as Promise<T>;
}

export async function apiPost<T>(path: string, body: Record<string, unknown>, init?: RequestInit): Promise<T> {
  let csrfToken = getCookie("csrftoken");
  if (!csrfToken) {
    await ensureCsrfCookie();
    csrfToken = getCookie("csrftoken");
  }

  let response = await fetch(`${API_BASE_URL}${path}`, {
    method: "POST",
    credentials: "include",
    ...init,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      ...(csrfToken ? { "X-CSRFToken": csrfToken } : {}),
      ...(init?.headers || {})
    },
    body: JSON.stringify(body)
  });

  if (response.status === 403) {
    await ensureCsrfCookie();
    csrfToken = getCookie("csrftoken");
    response = await fetch(`${API_BASE_URL}${path}`, {
      method: "POST",
      credentials: "include",
      ...init,
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        ...(csrfToken ? { "X-CSRFToken": csrfToken } : {}),
        ...(init?.headers || {})
      },
      body: JSON.stringify(body)
    });
  }

  if (!response.ok) {
    let message = `Request failed: ${response.status}`;
    try {
      const payload = await response.json();
      message = payload?.error || payload?.message || message;
      const error = new Error(message) as Error & { payload?: unknown; status?: number };
      error.payload = payload;
      error.status = response.status;
      throw error;
    } catch (error) {
      if (error instanceof Error && "payload" in error) {
        throw error;
      }
      throw new Error(message);
    }
  }

  return response.json() as Promise<T>;
}
