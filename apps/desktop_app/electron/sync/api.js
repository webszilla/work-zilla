import path from "path";
import fs from "fs";
import FormData from "form-data";
import { getFetch } from "./auth.js";
import { loadSettings } from "./settings.js";

function getFormHeaders(form, extraHeaders = {}) {
  return new Promise((resolve, reject) => {
    form.getLength((error, length) => {
      if (error) {
        reject(error);
        return;
      }
      resolve({
        ...form.getHeaders(),
        "Content-Length": String(length),
        Connection: "close",
        ...extraHeaders
      });
    });
  });
}

function mapUploadTransportError(error, fallbackCode = "upload_failed") {
  const code = error?.code || error?.cause?.code || "";
  if (code === "EPIPE" || code === "ECONNRESET" || code === "UND_ERR_SOCKET") {
    const mapped = new Error("upload_connection_closed");
    mapped.code = "upload_connection_closed";
    return mapped;
  }
  const mapped = new Error(error?.message || fallbackCode);
  mapped.code = error?.code || fallbackCode;
  return mapped;
}

async function parseJsonResponse(response) {
  const text = await response.text();
  if (!text) {
    return null;
  }
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

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

export async function pingApi() {
  try {
    const response = await getFetch()(buildUrl("/api/auth/me"), { method: "GET" });
    // 2xx, 401, 403 all confirm API is reachable.
    return response.status < 500;
  } catch {
    return false;
  }
}

export async function getSyncSettings() {
  const response = await getFetch()(buildUrl("/api/storage/sync/settings"), { method: "GET" });
  if (!response.ok) {
    throw new Error("sync_settings_unavailable");
  }
  return response.json();
}

export async function getMonitorSettings({ companyKey, deviceId, employeeId } = {}) {
  const params = new URLSearchParams();
  if (companyKey) {
    params.set("company_key", companyKey);
  }
  if (deviceId) {
    params.set("device_id", deviceId);
  }
  if (employeeId) {
    params.set("employee", String(employeeId));
  }
  const query = params.toString();
  const url = buildUrl(`/api/org/settings${query ? `?${query}` : ""}`);
  const response = await getFetch()(url, { method: "GET" });
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
    const code = data?.error || data?.detail || "org_settings_failed";
    const err = new Error(code);
    err.code = code;
    err.status = response.status;
    throw err;
  }
  return data || {};
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

export async function createFolder(parentId, name, { userId } = {}) {
  const query = userId ? `?user_id=${encodeURIComponent(userId)}` : "";
  const response = await getFetch()(buildUrl(`/api/storage/explorer/folders/create${query}`), {
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

export async function deleteFolder(folderId, { userId } = {}) {
  const query = userId ? `?user_id=${encodeURIComponent(userId)}` : "";
  const response = await getFetch()(buildUrl(`/api/storage/explorer/folders/${folderId}/delete${query}`), {
    method: "DELETE"
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
    const err = new Error(data?.detail || data?.error || "delete_folder_failed");
    err.status = response.status;
    err.data = data;
    throw err;
  }
  return data || { deleted: true };
}

export async function renameFolder(folderId, name, { userId } = {}) {
  const query = userId ? `?user_id=${encodeURIComponent(userId)}` : "";
  const response = await getFetch()(buildUrl(`/api/storage/explorer/folders/${folderId}/rename${query}`), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name })
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
  if (response.status === 409) {
    throw new Error("duplicate_folder");
  }
  if (!response.ok) {
    const code = data?.error || data?.detail || "rename_folder_failed";
    const err = new Error(code);
    err.code = code;
    err.status = response.status;
    throw err;
  }
  return data;
}

export async function uploadFile(folderId, filePath, { userId } = {}) {
  const form = new FormData();
  form.append("folder_id", folderId);
  form.append("file", fs.createReadStream(filePath), path.basename(filePath));
  const query = userId ? `?user_id=${encodeURIComponent(userId)}` : "";
  const headers = await getFormHeaders(form);
  let response;
  try {
    response = await getFetch()(buildUrl(`/api/storage/explorer/upload${query}`), {
      method: "POST",
      body: form,
      headers
    });
  } catch (error) {
    throw mapUploadTransportError(error, "upload_failed");
  }
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

export async function downloadBulkSelection({ fileIds = [], folderIds = [], userId } = {}) {
  const query = userId ? `?user_id=${encodeURIComponent(userId)}` : "";
  const response = await getFetch()(buildUrl(`/api/storage/explorer/download-bulk${query}`), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      file_ids: fileIds,
      folder_ids: folderIds
    })
  });
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
    const err = new Error(data?.error || data?.detail || "bulk_download_failed");
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

export async function sendMonitorHeartbeat(payload) {
  const settings = loadSettings();
  const extraHeaders = {};
  if (settings.companyKey) {
    extraHeaders["X-Company-Key"] = settings.companyKey;
  }
  if (settings.deviceId) {
    extraHeaders["X-Device-Id"] = settings.deviceId;
  }
  const response = await getFetch()(buildUrl("/api/monitor/heartbeat"), {
    method: "POST",
    headers: { "Content-Type": "application/json", ...extraHeaders },
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
    const code = data?.error || data?.detail || "heartbeat_failed";
    const err = new Error(code);
    err.code = code;
    err.status = response.status;
    throw err;
  }
  return data;
}

export async function uploadScreenshot({
  filePath,
  employeeId,
  deviceId,
  companyKey,
  pcName,
  appName,
  windowTitle,
  url,
  pcTime
}) {
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
  if (appName) {
    form.append("app_name", appName);
  }
  if (windowTitle) {
    form.append("window_title", windowTitle);
  }
  if (url) {
    form.append("url", url);
  }
  if (pcTime) {
    form.append("pc_time", pcTime);
  }
  form.append("image", fs.createReadStream(filePath), path.basename(filePath));
  const extraHeaders = {};
  if (companyKey) {
    extraHeaders["X-Company-Key"] = companyKey;
  }
  if (deviceId) {
    extraHeaders["X-Device-Id"] = deviceId;
  }
  const headers = await getFormHeaders(form, extraHeaders);
  let response;
  try {
    response = await getFetch()(buildUrl("/api/screenshot/upload"), {
      method: "POST",
      body: form,
      headers
    });
  } catch (error) {
    throw mapUploadTransportError(error, "screenshot_upload_failed");
  }
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

export async function validateImpositionLicense(payload = {}) {
  const response = await getFetch()(buildUrl("/api/imposition/license/validate"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload || {})
  });
  const data = await parseJsonResponse(response);
  if (!response.ok) {
    const code = data?.detail || data?.error || "license_validation_failed";
    const err = new Error(code);
    err.code = code;
    err.status = response.status;
    throw err;
  }
  return data || {};
}

export async function registerImpositionDevice(payload = {}) {
  const response = await getFetch()(buildUrl("/api/imposition/device/register"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload || {})
  });
  const data = await parseJsonResponse(response);
  if (!response.ok) {
    const code = data?.detail || data?.error || "device_register_failed";
    const err = new Error(code);
    err.code = code;
    err.status = response.status;
    err.data = data;
    throw err;
  }
  return data || {};
}

export async function checkImpositionDevice(payload = {}) {
  const response = await getFetch()(buildUrl("/api/imposition/device/check"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload || {})
  });
  const data = await parseJsonResponse(response);
  if (!response.ok) {
    const code = data?.detail || data?.error || "device_check_failed";
    const err = new Error(code);
    err.code = code;
    err.status = response.status;
    throw err;
  }
  return data || {};
}

export async function getImpositionPolicy() {
  const response = await getFetch()(buildUrl("/api/imposition/policy"), { method: "GET" });
  const data = await parseJsonResponse(response);
  if (!response.ok) {
    const code = data?.detail || data?.error || "imposition_policy_unavailable";
    const err = new Error(code);
    err.code = code;
    err.status = response.status;
    throw err;
  }
  return data || {};
}

export async function generateImpositionQrBarcode(payload = {}) {
  const response = await getFetch()(buildUrl("/api/imposition/qr-barcode/generate"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload || {})
  });
  const data = await parseJsonResponse(response);
  if (!response.ok) {
    const code = data?.detail || data?.error || "imposition_qr_barcode_generate_failed";
    const err = new Error(code);
    err.code = code;
    err.status = response.status;
    throw err;
  }
  return data || {};
}

export async function uploadImpositionBulkImport({
  filePath,
  importType = "id_card",
  fieldMapping = {},
  qrBarcode = {}
} = {}) {
  if (!filePath) {
    const err = new Error("file_required");
    err.code = "file_required";
    throw err;
  }
  const form = new FormData();
  form.append("file", fs.createReadStream(filePath), path.basename(filePath));
  form.append("import_type", String(importType || "id_card"));
  form.append("field_mapping", JSON.stringify(fieldMapping || {}));
  form.append("qr_barcode", JSON.stringify(qrBarcode || {}));
  const headers = await getFormHeaders(form);
  let response;
  try {
    response = await getFetch()(buildUrl("/api/imposition/bulk-import/upload"), {
      method: "POST",
      body: form,
      headers
    });
  } catch (error) {
    throw mapUploadTransportError(error, "bulk_import_upload_failed");
  }
  const data = await parseJsonResponse(response);
  if (!response.ok) {
    const code = data?.detail || data?.error || "bulk_import_upload_failed";
    const err = new Error(code);
    err.code = code;
    err.status = response.status;
    throw err;
  }
  return data || {};
}

export async function generateImpositionBulkLayout(payload = {}) {
  const response = await getFetch()(buildUrl("/api/imposition/bulk-layout/generate"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload || {})
  });
  const data = await parseJsonResponse(response);
  if (!response.ok) {
    const code = data?.detail || data?.error || "imposition_bulk_layout_failed";
    const err = new Error(code);
    err.code = code;
    err.status = response.status;
    throw err;
  }
  return data || {};
}

export async function exportImpositionBulk(payload = {}) {
  const response = await getFetch()(buildUrl("/api/imposition/bulk-export"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload || {})
  });
  const data = await parseJsonResponse(response);
  if (!response.ok) {
    const code = data?.detail || data?.error || "imposition_bulk_export_failed";
    const err = new Error(code);
    err.code = code;
    err.status = response.status;
    throw err;
  }
  return data || {};
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
