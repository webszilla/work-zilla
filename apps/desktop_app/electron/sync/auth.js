import fs from "fs";
import path from "path";
import { app, safeStorage } from "electron";
import fetch from "node-fetch";
import fetchCookie from "fetch-cookie";
import { CookieJar } from "tough-cookie";
import { loadSettings, saveSettings } from "./settings.js";

const AUTH_FILE = "auth.dat";
let jar = null;
let wrappedFetch = null;

function getAuthPath() {
  return path.join(app.getPath("userData"), AUTH_FILE);
}

function createJar() {
  if (jar) {
    return jar;
  }
  jar = new CookieJar();
  wrappedFetch = fetchCookie(fetch, jar);
  return jar;
}

function loadJar() {
  createJar();
  const filePath = getAuthPath();
  if (!fs.existsSync(filePath)) {
    return;
  }
  try {
    const encrypted = fs.readFileSync(filePath);
    if (!safeStorage.isEncryptionAvailable()) {
      return;
    }
    const decrypted = safeStorage.decryptString(encrypted);
    const json = JSON.parse(decrypted || "{}");
    jar = CookieJar.fromJSON(json);
    wrappedFetch = fetchCookie(fetch, jar);
  } catch {
    // ignore
  }
}

function saveJar() {
  if (!jar) {
    return;
  }
  const filePath = getAuthPath();
  const json = JSON.stringify(jar.toJSON());
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error("Encryption unavailable.");
  }
  const encrypted = safeStorage.encryptString(json);
  fs.writeFileSync(filePath, encrypted);
}

export async function login({ email, password, serverUrl, device_id, device_name, os_info, app_version }) {
  const settings = loadSettings();
  const normalizedUrl = normalizeServerUrl(serverUrl || settings.serverUrl);
  const nextSettings = saveSettings({ ...settings, serverUrl: normalizedUrl });
  createJar();
  const url = new URL("/api/auth/login", nextSettings.serverUrl).toString();
  const response = await wrappedFetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email,
      password,
      device_id,
      device_name,
      os_info,
      app_version
    })
  });
  if (!response.ok) {
    let message = "Login failed.";
    try {
      const data = await response.json();
      if (data?.error) {
        message = data.error;
      }
    } catch {
      // ignore
    }
    throw new Error(message);
  }
  saveJar();
  return true;
}

export function logout() {
  jar = new CookieJar();
  wrappedFetch = fetchCookie(fetch, jar);
  const filePath = getAuthPath();
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
}

export function getFetch() {
  if (!wrappedFetch) {
    loadJar();
    if (!wrappedFetch) {
      createJar();
    }
  }
  return wrappedFetch;
}

export async function checkAuth() {
  const settings = loadSettings();
  if (!settings.serverUrl) {
    return { authenticated: false, user: null };
  }
  try {
    const normalizedUrl = normalizeServerUrl(settings.serverUrl);
    const response = await getFetch()(new URL("/api/auth/me", normalizedUrl).toString(), {
      method: "GET"
    });
    if (!response.ok) {
      return { authenticated: false, user: null };
    }
    const data = await response.json();
    const subscriptions = await fetchSubscriptions(normalizedUrl);
    const enabledProducts = normalizeEnabledProducts(subscriptions);
    return {
      authenticated: Boolean(data.authenticated),
      user: data.user || null,
      profile: data.profile || null,
      subscriptions,
      enabled_products: enabledProducts,
      theme_primary: data.theme_primary || "",
      theme_secondary: data.theme_secondary || "",
      device_limit: data.device_limit || 0,
      policy: {
        allow_exit: data.allow_exit,
        allow_background: data.allow_background
      },
      org_id: data.profile?.organization?.id || null,
      role: data.profile?.role || ""
    };
  } catch {
    return { authenticated: false, user: null };
  }
}

async function fetchSubscriptions(serverUrl) {
  try {
    const response = await getFetch()(new URL("/api/auth/subscriptions", serverUrl).toString(), {
      method: "GET"
    });
    if (!response.ok) {
      return [];
    }
    const data = await response.json();
    return data.subscriptions || [];
  } catch {
    return [];
  }
}

function normalizeEnabledProducts(subscriptions) {
  const enabled = new Set();
  (subscriptions || []).forEach((sub) => {
    const status = String(sub.status || "").toLowerCase();
    if (status === "active" || status === "trialing") {
      enabled.add(sub.product_slug);
    }
  });
  if (enabled.has("online-storage")) {
    enabled.add("storage");
  }
  return Array.from(enabled);
}

function normalizeServerUrl(input) {
  const raw = (input || "").trim();
  if (!raw) {
    throw new Error("Server URL is required.");
  }
  const withScheme = raw.startsWith("http://") || raw.startsWith("https://") ? raw : `https://${raw}`;
  const url = new URL(withScheme);
  const allowHttp = process.env.WZ_ALLOW_HTTP === "1";
  const isLocalhost = url.hostname === "localhost" || url.hostname === "127.0.0.1";
  if (url.protocol !== "https:" && !allowHttp && !isLocalhost) {
    throw new Error("HTTPS is required.");
  }
  return url.toString().replace(/\/+$/, "");
}
