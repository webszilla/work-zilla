import path from "path";
import fs from "fs";
import FormData from "form-data";
import { getFetch } from "./auth.js";
import { loadSettings } from "./settings.js";

function buildUrl(endpoint) {
  const settings = loadSettings();
  if (!settings.serverUrl) {
    throw new Error("Server URL not configured.");
  }
  const normalized = normalizeServerUrl(settings.serverUrl);
  return new URL(endpoint, normalized).toString();
}

export async function getStorageStatus() {
  const response = await getFetch()(buildUrl("/api/storage/explorer/status"), { method: "GET" });
  if (!response.ok) {
    throw new Error("storage_unavailable");
  }
  return response.json();
}

export async function getSyncSettings() {
  const response = await getFetch()(buildUrl("/api/storage/sync/settings"), { method: "GET" });
  if (!response.ok) {
    throw new Error("sync_settings_unavailable");
  }
  return response.json();
}

export async function listRoot({ userId } = {}) {
  const query = userId ? `?user_id=${encodeURIComponent(userId)}` : "";
  const response = await getFetch()(buildUrl(`/api/storage/explorer/root${query}`), { method: "GET" });
  if (!response.ok) {
    throw new Error("invalid_folder");
  }
  return response.json();
}

export async function listFolder(folderId, { userId } = {}) {
  const query = userId ? `?user_id=${encodeURIComponent(userId)}` : "";
  const response = await getFetch()(buildUrl(`/api/storage/explorer/folder/${folderId}${query}`), { method: "GET" });
  if (!response.ok) {
    throw new Error("invalid_folder");
  }
  return response.json();
}

export async function getOrgUsers() {
  const response = await getFetch()(buildUrl("/api/storage/org/users"), { method: "GET" });
  if (!response.ok) {
    const err = new Error("permission_denied");
    err.status = response.status;
    throw err;
  }
  return response.json();
}

export async function getOrgDevices({ userId } = {}) {
  const query = userId ? `?user_id=${encodeURIComponent(userId)}` : "";
  const response = await getFetch()(buildUrl(`/api/storage/org/devices${query}`), { method: "GET" });
  if (!response.ok) {
    const err = new Error("permission_denied");
    err.status = response.status;
    throw err;
  }
  return response.json();
}

export async function createOrgUser(payload) {
  const response = await getFetch()(buildUrl("/api/storage/org/users/create"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload || {})
  });
  const text = await response.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }
  }
  if (!response.ok) {
    const code = data?.error || data?.detail || "user_create_failed";
    const err = new Error(code);
    err.code = code;
    err.status = response.status;
    throw err;
  }
  return data;
}

export async function createFolder(parentId, name) {
  const response = await getFetch()(buildUrl("/api/storage/explorer/folders/create"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ parent_id: parentId, name })
  });
  if (response.status === 409) {
    throw new Error("duplicate_folder");
  }
  if (!response.ok) {
    throw new Error("invalid_folder");
  }
  return response.json();
}

export async function uploadFile(folderId, filePath) {
  const form = new FormData();
  form.append("folder_id", folderId);
  form.append("file", fs.createReadStream(filePath), path.basename(filePath));
  const response = await getFetch()(buildUrl("/api/storage/explorer/upload"), {
    method: "POST",
    body: form,
    headers: form.getHeaders()
  });
  const text = await response.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }
  }
  if (!response.ok) {
    const code = data?.error || "upload_failed";
    const err = new Error(code);
    err.code = code;
    throw err;
  }
  return data;
}

export async function downloadStorage(params = {}) {
  const url = new URL(buildUrl("/api/storage/download/"));
  if (params.fileId) {
    url.searchParams.set("file_id", params.fileId);
  }
  if (params.folderId) {
    url.searchParams.set("folder_id", params.folderId);
  }
  if (params.userId) {
    url.searchParams.set("user_id", String(params.userId));
  }
  if (params.deviceId) {
    url.searchParams.set("device_id", String(params.deviceId));
  }
  const response = await getFetch()(url.toString(), { method: "GET" });
  if (!response.ok) {
    const text = await response.text();
    let data = null;
    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        data = null;
      }
    }
    const err = new Error(data?.detail || data?.error || "download_failed");
    err.status = response.status;
    err.data = data;
    throw err;
  }
  return response;
}

export async function registerEmployee(payload) {
  const response = await getFetch()(buildUrl("/api/employee/register"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  const text = await response.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }
  }
  if (!response.ok) {
    const code = data?.error || "employee_register_failed";
    const err = new Error(code);
    err.code = code;
    throw err;
  }
  return data;
}

export async function uploadScreenshot({ filePath, employeeId, deviceId, companyKey, pcName }) {
  const form = new FormData();
  if (employeeId) {
    form.append("employee", String(employeeId));
  }
  if (deviceId) {
    form.append("device_id", deviceId);
  }
  if (companyKey) {
    form.append("company_key", companyKey);
  }
  if (pcName) {
    form.append("pc_name", pcName);
  }
  form.append("image", fs.createReadStream(filePath), path.basename(filePath));
  const response = await getFetch()(buildUrl("/api/screenshot/upload"), {
    method: "POST",
    body: form,
    headers: form.getHeaders()
  });
  const text = await response.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }
  }
  if (!response.ok) {
    const code = data?.error || "screenshot_upload_failed";
    const err = new Error(code);
    err.code = code;
    throw err;
  }
  return data;
}

export async function recordMonitorStop({ companyKey, deviceId, employeeId, reason, stoppedAt }) {
  const payload = {
    company_key: companyKey,
    device_id: deviceId,
    employee_id: employeeId,
    reason,
    stopped_at: stoppedAt
  };
  const response = await getFetch()(buildUrl("/api/monitor/stop"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  const text = await response.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }
  }
  if (!response.ok) {
    const code = data?.error || "monitor_stop_failed";
    const err = new Error(code);
    err.code = code;
    throw err;
  }
  return data;
}

function normalizeServerUrl(input) {
  const raw = (input || "").trim();
  if (!raw) {
    throw new Error("Server URL not configured.");
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
