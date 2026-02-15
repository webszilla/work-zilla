import { app, BrowserWindow, ipcMain, dialog, Tray, Menu, systemPreferences, shell, desktopCapturer, screen, nativeImage } from "electron";
import path from "path";
import os from "os";
import fs from "fs";
import dns from "dns/promises";
import { randomUUID } from "crypto";
import { spawn } from "child_process";
import { fileURLToPath } from "url";
import SyncService from "./sync/SyncService.js";
import { login, logout, checkAuth } from "./sync/auth.js";
import { loadSettings, saveSettings, addFolder, removeFolder as removeLocalFolder, MAX_SYNC_FOLDERS_PER_DEVICE } from "./sync/settings.js";
import {
  listActivity,
  listErrors,
  listQueue,
  getFolderMap,
  removeFolderMapsByPrefix,
  clearQueueByPathPrefix,
  setFolderMap,
  countPendingQueueByPrefix,
  addUserActivity,
  listUserActivity
} from "./sync/db.js";
import { getStorageStatus, pingApi, recordMonitorStop, listRoot, listFolder, getOrgUsers, getOrgDevices, createOrgUser, createFolder as createStorageFolder, renameFolder as renameStorageFolder, deleteFolder as deleteStorageFolder, uploadFile as uploadStorageFile, downloadStorage, downloadBulkSelection, sendMonitorHeartbeat, getMonitorSettings } from "./sync/api.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let mainWindow = null;
let tray = null;
let isQuitting = false;
const syncService = new SyncService();
let monitorProcess = null;
let monitorHeartbeatTimer = null;
let monitorCaptureTimer = null;
let monitorCaptureInFlight = false;
let monitorCaptureIntervalMs = 5 * 60 * 1000;
let connectivityTimer = null;
let syncResumeOnReconnect = false;
let monitorResumeOnReconnect = false;
let offlineAlertOpen = false;
let offlineAlertShown = false;
const CONNECTIVITY_CHECK_INTERVAL_MS = 10000;
const isInstallerCommand = process.platform === "win32" && process.argv.some((arg) => {
  const value = String(arg || "").toLowerCase();
  return value.includes("squirrel")
    || value.includes("--uninstall")
    || value.includes("--install")
    || value.includes("--updated");
});
const gotSingleInstanceLock = app.requestSingleInstanceLock();
const connectivityState = {
  internet: false,
  api: false,
  online: false,
  reconnecting: true,
  checked_at: null
};

process.on("uncaughtException", (error) => {
  const code = error?.code || error?.cause?.code || "";
  if (code === "EPIPE" || code === "ECONNRESET") {
    return;
  }
  console.error("Uncaught exception in main process:", error);
});

function getConnectionStatusSnapshot() {
  return {
    ...connectivityState,
    message: connectivityState.online
      ? "Online"
      : "WorkZilla requires internet connection. Please connect to internet to continue."
  };
}

function broadcastConnectionStatus() {
  const payload = getConnectionStatusSnapshot();
  BrowserWindow.getAllWindows().forEach((win) => {
    win.webContents.send("connection:status", payload);
  });
}

function broadcastSyncUploadProgress(payload) {
  BrowserWindow.getAllWindows().forEach((win) => {
    win.webContents.send("sync:upload-progress", payload);
  });
}

syncService.setUploadProgressListener((payload) => {
  broadcastSyncUploadProgress(payload);
});

async function checkInternetConnectivity() {
  const settings = loadSettings();
  let host = "example.com";
  try {
    const raw = String(settings.serverUrl || "").trim();
    if (raw) {
      const url = new URL(raw.startsWith("http://") || raw.startsWith("https://") ? raw : `https://${raw}`);
      host = url.hostname || host;
    }
  } catch {
    // fallback to default host
  }
  if (host === "localhost" || host === "127.0.0.1") {
    return true;
  }
  try {
    await dns.lookup(host);
    return true;
  } catch {
    return false;
  }
}

async function showOfflineAlert() {
  if (offlineAlertOpen || offlineAlertShown || !mainWindow) {
    return;
  }
  offlineAlertOpen = true;
  offlineAlertShown = true;
  try {
    await dialog.showMessageBox(mainWindow, {
      type: "warning",
      title: "Offline",
      message: "WorkZilla requires internet connection. Please connect to internet to continue."
    });
  } catch {
    // ignore UI alert failures
  } finally {
    offlineAlertOpen = false;
  }
}

function pauseServicesForReconnect() {
  const syncStatus = syncService.getStatus();
  if (syncStatus.status === "Running") {
    syncResumeOnReconnect = true;
    syncService.pause();
  }
  if (monitorProcess || monitorCaptureTimer || monitorHeartbeatTimer) {
    monitorResumeOnReconnect = true;
    stopMonitorProcess();
    if (monitorHeartbeatTimer) {
      clearInterval(monitorHeartbeatTimer);
      monitorHeartbeatTimer = null;
    }
  }
}

async function resumeServicesAfterReconnect() {
  if (syncResumeOnReconnect) {
    syncService.resume();
    syncResumeOnReconnect = false;
  }
  if (monitorResumeOnReconnect) {
    monitorResumeOnReconnect = false;
    await startMonitorWithAuth();
  }
}

async function runConnectivityCheck() {
  const prevOnline = connectivityState.online;
  const internet = await checkInternetConnectivity();
  const api = internet ? await pingApi() : false;
  connectivityState.internet = internet;
  connectivityState.api = api;
  connectivityState.online = Boolean(internet && api);
  connectivityState.reconnecting = !connectivityState.online;
  connectivityState.checked_at = new Date().toISOString();
  if (!connectivityState.online) {
    if (prevOnline) {
      pauseServicesForReconnect();
    }
    if (!prevOnline || !connectivityState.api) {
      showOfflineAlert();
    }
  } else if (!prevOnline) {
    offlineAlertShown = false;
    await resumeServicesAfterReconnect();
  }
  broadcastConnectionStatus();
  return getConnectionStatusSnapshot();
}

function startConnectivityMonitor() {
  if (connectivityTimer) {
    clearInterval(connectivityTimer);
  }
  runConnectivityCheck();
  connectivityTimer = setInterval(() => {
    runConnectivityCheck();
  }, CONNECTIVITY_CHECK_INTERVAL_MS);
}

function uploadScreenshot(filePath) {
  if (typeof syncService.uploadScreenshot === "function") {
    syncService.uploadScreenshot(filePath);
  }
}

function attachHelperOutput(child) {
  if (!child?.stdout) {
    return;
  }
  let buffer = "";
  child.stdout.setEncoding("utf8");
  child.stdout.on("data", (chunk) => {
    buffer += chunk;
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() || "";
    lines.forEach((line) => {
      const filePath = line.trim();
      if (!filePath || filePath.startsWith("error=")) {
        return;
      }
      if (filePath) {
        uploadScreenshot(filePath);
      }
    });
  });
  child.stdout.on("end", () => {
    const remaining = buffer.trim();
    if (remaining) {
      uploadScreenshot(remaining);
    }
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      devTools: !app.isPackaged
    }
  });

  const devUrl = process.env.VITE_DEV_SERVER_URL || (!app.isPackaged ? "http://localhost:5173" : "");
  if (devUrl) {
    mainWindow.loadURL(devUrl);
  } else {
    mainWindow.loadFile(path.join(__dirname, "../renderer/dist/index.html"));
  }

  mainWindow.on("close", (event) => {
    if (isQuitting) {
      return;
    }
    const settings = loadSettings();
    if (settings.allowExit === false || settings.allowBackground) {
      event.preventDefault();
      mainWindow.hide();
    }
  });
}

function buildTrayMenu() {
  const settings = loadSettings();
  const canExit = settings.allowExit !== false;
  const template = [
    { label: "Open", click: () => mainWindow?.show() },
    { label: "Pause Sync", click: () => syncService.pause() },
    { label: "Resume Sync", click: () => syncService.resume() }
  ];
  if (canExit) {
    template.push({ label: "Exit", click: () => app.quit() });
  }
  return Menu.buildFromTemplate(template);
}

function createTray() {
  tray = new Tray(path.join(__dirname, "tray.png"));
  tray.setToolTip("Work Zilla Agent");
  tray.setContextMenu(buildTrayMenu());
  tray.on("double-click", () => mainWindow?.show());
}

function cleanupLegacyWindowsMonitor() {
  if (process.platform !== "win32") {
    return;
  }
  const commands = [
    'taskkill /F /T /IM "Work Zilla Monitor.exe"',
    'taskkill /F /T /IM "WorkZillaMonitor.exe"',
    'taskkill /F /T /IM "monitoring_agent.exe"',
    'taskkill /F /T /IM "employee_agent.exe"',
    'reg delete "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run" /v "Work Zilla Monitor" /f',
    'reg delete "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run" /v "WorkZillaMonitor" /f',
    'reg delete "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run" /v "WorkZilla Monitor" /f',
    'del /F /Q "%APPDATA%\\Microsoft\\Windows\\Start Menu\\Programs\\Startup\\Work Zilla Monitor.lnk"',
    'del /F /Q "%APPDATA%\\Microsoft\\Windows\\Start Menu\\Programs\\Startup\\WorkZillaMonitor.lnk"',
    'rmdir /S /Q "%LOCALAPPDATA%\\Programs\\Work Zilla Monitor"',
    'rmdir /S /Q "%PROGRAMFILES%\\Work Zilla Monitor"',
    'rmdir /S /Q "%PROGRAMFILES(X86)%\\Work Zilla Monitor"',
    'rmdir /S /Q "%APPDATA%\\WorkZillaMonitor"'
  ];
  commands.forEach((command) => {
    try {
      const child = spawn("cmd.exe", ["/C", command], {
        windowsHide: true,
        stdio: "ignore"
      });
      child.unref();
    } catch {
      // ignore cleanup failures
    }
  });
}

function refreshTray() {
  if (!tray) {
    return;
  }
  tray.setContextMenu(buildTrayMenu());
}

async function resolveRemoteFolderIdForLocalPath(localPath) {
  const localName = path.basename(localPath || "").trim();
  if (!localName) {
    return null;
  }
  const settings = loadSettings();
  const rootData = await listRoot({});
  let parentId = rootData?.folder_id || null;
  if (!parentId) {
    return null;
  }
  const rootItems = Array.isArray(rootData?.items) ? rootData.items : [];
  const deviceId = String(settings?.deviceId || "").trim();
  if (deviceId) {
    const deviceFolder = rootItems.find((item) => item?.type === "folder" && item?.name === deviceId);
    if (deviceFolder?.id) {
      parentId = deviceFolder.id;
    }
  }
  const parentData = await listFolder(parentId, {});
  const items = Array.isArray(parentData?.items) ? parentData.items : [];
  const match = items.find((item) => item?.type === "folder" && item?.name === localName);
  return match?.id || null;
}

async function countFilesInRemoteFolder(folderId) {
  if (!folderId) {
    return 0;
  }
  const visited = new Set();
  async function walk(currentId) {
    if (!currentId || visited.has(currentId)) {
      return 0;
    }
    visited.add(currentId);
    const data = await listFolder(currentId, {});
    const items = Array.isArray(data?.items) ? data.items : [];
    let total = items.filter((item) => item?.type === "file").length;
    const folders = items.filter((item) => item?.type === "folder" && item?.id);
    for (const folder of folders) {
      total += await walk(folder.id);
    }
    return total;
  }
  return walk(folderId);
}

async function resolveRemoteDeviceFolderId(deviceId) {
  const normalizedDeviceId = String(deviceId || "").trim();
  if (!normalizedDeviceId) {
    return null;
  }
  const rootData = await listRoot({});
  const rootItems = Array.isArray(rootData?.items) ? rootData.items : [];
  const deviceFolder = rootItems.find(
    (item) => item?.type === "folder" && String(item?.name || "").trim() === normalizedDeviceId
  );
  return deviceFolder?.id || null;
}

function isRemoteDeleteNotFound(error) {
  const status = Number(error?.status || 0);
  const message = String(error?.message || "").toLowerCase();
  if (status === 404) {
    return true;
  }
  return (
    message.includes("not_found")
    || message.includes("invalid_folder")
    || message.includes("delete_folder_failed")
  );
}

if (!gotSingleInstanceLock) {
  app.quit();
} else {
  app.whenReady().then(() => {
    cleanupLegacyWindowsMonitor();
    createWindow();
    createTray();
    startConnectivityMonitor();
    if (process.platform === "darwin") {
      const settings = loadSettings();
      const screenStatus = systemPreferences.getMediaAccessStatus("screen");
      saveSettings({
        ...settings,
        screenPermissionStatus: screenStatus,
        screenPermissionRelaunchRequired: false
      });
    }
    persistScreenPermissionSnapshot();
    broadcastMonitorPermissions();
    const settings = loadSettings();
    configureAutoLaunch(settings.monitorRunning);
    if (settings.monitorRunning) {
      // Resume monitoring after app restart (e.g. PC shutdown/startup)
      setTimeout(() => {
        if (!connectivityState.online) {
          monitorResumeOnReconnect = true;
          return;
        }
        startMonitorWithAuth();
      }, 1500);
    }
  });

  app.on("second-instance", () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) {
        mainWindow.restore();
      }
      mainWindow.show();
      mainWindow.focus();
    }
  });
}

app.on("before-quit", (event) => {
  const settings = loadSettings();
  if (!isInstallerCommand && settings.allowExit === false) {
    event.preventDefault();
    isQuitting = false;
    mainWindow?.hide();
    return;
  }
  isQuitting = true;
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  persistScreenPermissionSnapshot();
  broadcastMonitorPermissions();
});

app.on("browser-window-focus", () => {
  persistScreenPermissionSnapshot();
  broadcastMonitorPermissions();
});

ipcMain.handle("auth:login", async (_event, payload) => {
  const device = ensureDeviceIdentity();
  await login({ ...payload, ...device });
  await runConnectivityCheck();
  const status = await checkAuth();
  persistAuthProfile(status);
  refreshTray();
  return { loading: false, ...status };
});

ipcMain.handle("auth:logout", async () => {
  logout();
  return true;
});

ipcMain.handle("auth:status", async () => {
  await runConnectivityCheck();
  const status = await checkAuth();
  persistAuthProfile(status);
  refreshTray();
  return { loading: false, ...status };
});

ipcMain.handle("settings:get", () => loadSettings());

ipcMain.handle("settings:update", (_event, payload) => {
  const previous = loadSettings();
  const next = { ...previous, ...payload };
  const prevCompanyKey = String(previous.companyKey || previous.orgId || "").trim();
  const nextCompanyKey = String(next.companyKey || next.orgId || "").trim();
  if (prevCompanyKey && nextCompanyKey && prevCompanyKey !== nextCompanyKey) {
    // Company key changed: force employee re-register for correct org binding.
    next.employeeId = null;
  }
  const settings = saveSettings(next);
  if (payload?.paused !== undefined) {
    if (payload.paused) {
      syncService.pause();
    } else {
      syncService.resume();
    }
  }
  refreshTray();
  return settings;
});

ipcMain.handle("folders:get", () => {
  const folders = loadSettings().syncFolders || [];
  const items = folders.map((item) => {
    const pendingCount = countPendingQueueByPrefix(item.path);
    return {
      ...item,
      pendingCount,
      uploadCompleted: pendingCount === 0
    };
  });
  return { folders: items };
});

ipcMain.handle("folders:choose", async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ["openDirectory", "multiSelections"]
  });
  if (result.canceled) {
    return { message: "Selection cancelled." };
  }
  const settings = loadSettings();
  const existing = Array.isArray(settings.syncFolders) ? settings.syncFolders : [];
  const existingPaths = new Set(existing.map((item) => item.path));
  const selected = (result.filePaths || []).filter(Boolean);
  const uniqueNew = selected.filter((folderPath) => !existingPaths.has(folderPath));
  const remaining = Math.max(0, MAX_SYNC_FOLDERS_PER_DEVICE - existing.length);
  const toAdd = uniqueNew.slice(0, remaining);
  toAdd.forEach((folderPath) => {
    addFolder({ path: folderPath, name: path.basename(folderPath) });
  });
  if (toAdd.length > 0) {
    addUserActivity("folder_add", "Folder added", `${toAdd.length} folder(s) added for sync.`);
  }
  const limitReached = uniqueNew.length > remaining;
  if (connectivityState.online) {
    syncService.start();
  }
  if (limitReached) {
    return {
      message: "Maximum 5 folders allowed per device.",
      added: toAdd.length,
      limitReached: true
    };
  }
  return { message: "Folders added.", added: toAdd.length, limitReached: false };
});

ipcMain.handle("folders:remove", async (_event, folderPath) => {
  if (!folderPath) {
    throw new Error("invalid_folder_path");
  }
  const mapped = getFolderMap(folderPath);
  let remoteId = mapped?.remote_id || null;
  if (!remoteId) {
    remoteId = await resolveRemoteFolderIdForLocalPath(folderPath);
  }
  let totalFiles = 0;
  if (remoteId) {
    totalFiles = await countFilesInRemoteFolder(remoteId);
  }
  if (remoteId) {
    try {
      await deleteStorageFolder(remoteId);
    } catch (error) {
      // Mapping can become stale after manual cloud operations; retry once via live lookup.
      const fallbackRemoteId = await resolveRemoteFolderIdForLocalPath(folderPath);
      if (fallbackRemoteId && fallbackRemoteId !== remoteId) {
        await deleteStorageFolder(fallbackRemoteId);
      } else if (!isRemoteDeleteNotFound(error)) {
        throw error;
      }
    }
  }
  removeFolderMapsByPrefix(folderPath);
  clearQueueByPathPrefix(folderPath);
  removeLocalFolder(folderPath);
  syncService.start();
  addUserActivity("folder_delete", "Folder removed", folderPath);
  return { ok: true, cloud_deleted: Boolean(remoteId), totalFiles, deletedFiles: totalFiles };
});

ipcMain.handle("folders:map-remote", (_event, payload) => {
  if (!payload?.localPath || !payload?.remoteId) {
    throw new Error("invalid_mapping");
  }
  setFolderMap(payload.localPath, payload.remoteId);
  return { ok: true };
});

ipcMain.handle("folders:get-map", (_event, localPath) => {
  if (!localPath) {
    return null;
  }
  const mapped = getFolderMap(localPath);
  return mapped?.remote_id ? { remote_id: mapped.remote_id } : null;
});

ipcMain.handle("folders:resolve-remote", async (_event, localPath) => {
  if (!localPath) {
    return null;
  }
  const mapped = getFolderMap(localPath);
  if (mapped?.remote_id) {
    return { remote_id: mapped.remote_id };
  }
  const remoteId = await resolveRemoteFolderIdForLocalPath(localPath);
  return remoteId ? { remote_id: remoteId } : null;
});

ipcMain.handle("sync:start", () => {
  if (!connectivityState.online) {
    return { ...syncService.getStatus(), error: "offline", reconnecting: true };
  }
  syncService.start();
  return syncService.getStatus();
});

ipcMain.handle("sync:status", () => ({
  ...syncService.getStatus(),
  queue_size: listQueue(200).length
}));
ipcMain.handle("sync:upload-progress", () => syncService.getUploadProgress());
ipcMain.handle("sync:pause", () => {
  syncService.pause();
  return syncService.getStatus();
});
ipcMain.handle("sync:resume", () => {
  syncService.resume();
  return syncService.getStatus();
});

ipcMain.handle("dashboard:summary", async () => {
  let storage = null;
  try {
    storage = await getStorageStatus();
  } catch {
    storage = null;
  }
  const queue = listQueue(100);
  const status = syncService.getStatus();
  return {
    sync_status: status.status,
    last_sync: status.last_sync,
    queue_size: queue.length,
    active_uploads: status.active_uploads,
    used_storage: storage ? `${storage.used_storage_gb} GB` : "-",
    remaining_storage: storage ? `${storage.remaining_storage_gb} GB` : "-"
  };
});

ipcMain.handle("storage:usage", async () => {
  const data = await getStorageStatus();
  const total = data.total_allowed_storage_gb || 0;
  const used = data.used_storage_gb || 0;
  const remaining = data.remaining_storage_gb || 0;
  return {
    total: `${total} GB`,
    used: `${used} GB`,
    remaining: `${remaining} GB`,
    used_percent: total ? Math.round((used / total) * 100) : 0
  };
});

ipcMain.handle("activity:list", () => ({ items: listActivity(200) }));
ipcMain.handle("user-activity:list", () => ({ items: listUserActivity(100) }));
ipcMain.handle("errors:list", () => ({ items: listErrors(200) }));
ipcMain.handle("queue:list", () => ({ items: listQueue(200) }));

ipcMain.handle("device:info", () => ensureDeviceIdentity());
ipcMain.handle("device:remove", async (_event, payload) => {
  const requestedId = String(payload?.deviceId || "").trim();
  const settings = loadSettings();
  const localDeviceId = String(settings?.deviceId || "").trim();
  const targetDeviceId = requestedId || localDeviceId;
  if (!targetDeviceId) {
    throw new Error("invalid_device_id");
  }
  const remoteFolderId = await resolveRemoteDeviceFolderId(targetDeviceId);
  let totalFiles = 0;
  if (remoteFolderId) {
    totalFiles = await countFilesInRemoteFolder(remoteFolderId);
    try {
      await deleteStorageFolder(remoteFolderId);
    } catch (error) {
      if (!isRemoteDeleteNotFound(error)) {
        throw error;
      }
    }
  }
  const isLocalDevice = targetDeviceId === localDeviceId;
  let removedLocalFolders = 0;
  if (isLocalDevice) {
    const localFolders = Array.isArray(settings.syncFolders) ? settings.syncFolders : [];
    removedLocalFolders = localFolders.length;
    localFolders.forEach((folder) => {
      if (folder?.path) {
        removeFolderMapsByPrefix(folder.path);
        clearQueueByPathPrefix(folder.path);
      }
    });
    saveSettings({
      ...settings,
      syncFolders: [],
      deviceId: "",
      deviceNickname: ""
    });
    syncService.pause();
  }
  addUserActivity("device_delete", "Device removed", `${targetDeviceId}${isLocalDevice ? " (local)" : ""}`);
  return {
    ok: true,
    deviceId: targetDeviceId,
    localRemoved: isLocalDevice,
    removedLocalFolders,
    totalFiles,
    deletedFiles: totalFiles
  };
});

ipcMain.handle("storage:explorer:root", async (_event, payload) => {
  return listRoot({ userId: payload?.userId });
});

ipcMain.handle("storage:explorer:folder", async (_event, payload) => {
  if (!payload?.folderId) {
    throw new Error("invalid_folder");
  }
  return listFolder(payload.folderId, { userId: payload?.userId });
});

ipcMain.handle("storage:explorer:create-folder", async (_event, payload) => {
  const folder = await createStorageFolder(payload?.parentId, payload?.name, { userId: payload?.userId });
  return folder;
});

ipcMain.handle("storage:explorer:rename-folder", async (_event, payload) => {
  if (!payload?.folderId || !payload?.name) {
    throw new Error("invalid_folder");
  }
  return renameStorageFolder(payload.folderId, payload.name, { userId: payload?.userId });
});

ipcMain.handle("storage:explorer:upload-picker", async (_event, payload) => {
  if (!payload?.folderId) {
    throw new Error("invalid_folder");
  }
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ["openFile", "multiSelections"]
  });
  if (result.canceled || !result.filePaths?.length) {
    return { ok: true, uploaded: 0, files: [] };
  }
  const uploaded = [];
  const failed = [];
  for (const filePath of result.filePaths) {
    try {
      const data = await uploadStorageFile(payload.folderId, filePath, { userId: payload?.userId });
      uploaded.push({
        file_id: data?.file_id,
        filename: data?.filename || path.basename(filePath)
      });
    } catch (error) {
      failed.push({
        path: filePath,
        error: error?.code || error?.message || "upload_failed"
      });
    }
  }
  return {
    ok: failed.length === 0,
    uploaded: uploaded.length,
    files: uploaded,
    failed
  };
});

ipcMain.handle("storage:explorer:upload-paths", async (_event, payload) => {
  if (!payload?.folderId) {
    throw new Error("invalid_folder");
  }
  const filePaths = Array.isArray(payload?.filePaths) ? payload.filePaths.filter(Boolean) : [];
  if (!filePaths.length) {
    return { ok: true, uploaded: 0, files: [], failed: [] };
  }
  const uploaded = [];
  const failed = [];
  const total = filePaths.length;
  let completed = 0;
  for (const filePath of filePaths) {
    try {
      const data = await uploadStorageFile(payload.folderId, filePath, { userId: payload?.userId });
      uploaded.push({
        file_id: data?.file_id,
        filename: data?.filename || path.basename(filePath)
      });
    } catch (error) {
      failed.push({
        path: filePath,
        error: error?.code || error?.message || "upload_failed"
      });
    } finally {
      completed += 1;
      BrowserWindow.getAllWindows().forEach((win) => {
        win.webContents.send("storage:upload-progress", { completed, total });
      });
    }
  }
  return {
    ok: failed.length === 0,
    uploaded: uploaded.length,
    files: uploaded,
    failed
  };
});

ipcMain.handle("storage:org:users", async () => {
  return getOrgUsers();
});

ipcMain.handle("storage:org:devices", async (_event, payload) => {
  return getOrgDevices({ userId: payload?.userId });
});

ipcMain.handle("storage:org:users:create", async (_event, payload) => {
  return createOrgUser(payload);
});

async function saveDownloadResponse(response, filenameOverride) {
  const defaultRoot = app.getPath("downloads");
  const contentDisposition = response.headers.get("content-disposition") || "";
  let filename = filenameOverride || "";
  if (!filename && contentDisposition) {
    const match = /filename\*?=(?:UTF-8'')?["']?([^"';]+)["']?/i.exec(contentDisposition);
    if (match && match[1]) {
      filename = decodeURIComponent(match[1]);
    }
  }
  if (!filename) {
    filename = "download.zip";
  }
  const safeName = filename.replace(/[\\\\/]/g, "-");
  const selection = await dialog.showSaveDialog(mainWindow, {
    title: "Choose download location",
    defaultPath: path.join(defaultRoot, safeName)
  });
  if (selection.canceled || !selection.filePath) {
    const err = new Error("download_cancelled");
    err.code = "download_cancelled";
    throw err;
  }
  const targetPath = selection.filePath;
  await new Promise((resolve, reject) => {
    const stream = fs.createWriteStream(targetPath);
    response.body.pipe(stream);
    response.body.on("error", reject);
    stream.on("finish", resolve);
    stream.on("error", reject);
  });
  return targetPath;
}

ipcMain.handle("storage:download", async (_event, payload) => {
  try {
    const response = await downloadStorage(payload || {});
    let filename = payload?.filename || "";
    if (!filename && payload?.fileId) {
      filename = `${payload.fileId}.bin`;
    }
    const targetPath = await saveDownloadResponse(response, filename);
    return { ok: true, path: targetPath };
  } catch (error) {
    if (error?.code === "download_cancelled" || error?.message === "download_cancelled") {
      return { ok: false, cancelled: true, error: "download_cancelled" };
    }
    return { ok: false, error: error?.message || "download_failed" };
  }
});

ipcMain.handle("storage:download-bulk", async (_event, payload) => {
  try {
    const response = await downloadBulkSelection({
      fileIds: payload?.fileIds || [],
      folderIds: payload?.folderIds || [],
      userId: payload?.userId
    });
    const targetPath = await saveDownloadResponse(response, payload?.filename || "selection.zip");
    return { ok: true, path: targetPath };
  } catch (error) {
    if (error?.code === "download_cancelled" || error?.message === "download_cancelled") {
      return { ok: false, cancelled: true, error: "download_cancelled" };
    }
    return { ok: false, error: error?.message || "bulk_download_failed" };
  }
});

ipcMain.handle("monitor:start", async () => {
  if (!connectivityState.online) {
    return { ok: false, error: "offline" };
  }
  return startMonitorWithAuth();
});

ipcMain.handle("connection:status", () => {
  return getConnectionStatusSnapshot();
});

ipcMain.handle("connection:check", async () => {
  return runConnectivityCheck();
});

ipcMain.handle("monitor:permissions", async () => {
  if (process.platform !== "darwin") {
    return { screen: "granted", accessibility: true, needsRestart: false };
  }
  const screen = systemPreferences.getMediaAccessStatus("screen");
  const accessibility = systemPreferences.isTrustedAccessibilityClient(true);
  const settings = loadSettings();
  const needsRestart = settings.screenPermissionRelaunchRequired === true;
  return { screen, accessibility, needsRestart };
});

ipcMain.handle("monitor:request-permissions", async () => {
  if (process.platform !== "darwin") {
    return { screen: "granted", accessibility: true };
  }
  const helperPath = getMacHelperPath();
  if (!fs.existsSync(helperPath)) {
    return { screen: "denied", accessibility: false };
  }
  return new Promise((resolve) => {
    let output = "";
    const child = spawn(helperPath, ["request-permissions"]);
    child.stdout.on("data", (data) => {
      output += data.toString();
    });
    child.on("exit", () => {
      const screen = output.includes("screen=granted") ? "granted" : "denied";
      const accessibility = output.includes("accessibility=granted");
      resolve({ screen, accessibility });
    });
    child.on("error", () => {
      resolve({ screen: "denied", accessibility: false });
    });
  });
});

ipcMain.handle("monitor:open-settings", (_event, payload) => {
  if (process.platform !== "darwin") {
    return { ok: false, error: "unsupported_os" };
  }
  const target = payload?.target || "screen";
  const url =
    target === "accessibility"
      ? "x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility"
      : "x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture";
  shell.openExternal(url);
  return { ok: true };
});

ipcMain.handle("monitor:support", async () => {
  if (process.platform === "win32") {
    return { supported: true };
  }
  if (process.platform === "darwin") {
    return { supported: true };
  }
  return { supported: false, reason: "unsupported_os" };
});

ipcMain.handle("monitor:stop", async (_event, payload) => {
  stopMonitorProcess();
  if (monitorHeartbeatTimer) {
    clearInterval(monitorHeartbeatTimer);
    monitorHeartbeatTimer = null;
  }
  configureAutoLaunch(false);
  try {
    const settings = loadSettings();
    await recordMonitorStop({
      companyKey: resolveCompanyKey(settings),
      deviceId: settings.deviceId || "",
      employeeId: settings.employeeId || null,
      reason: payload?.reason || "",
      stoppedAt: payload?.stopped_at || new Date().toISOString()
    });
  } catch {
    // ignore monitor stop logging failures
  }
  return { ok: true, status: monitorProcess ? "running" : "stopped" };
});

ipcMain.handle("monitor:status", () => ({
  ok: true,
  status: monitorProcess || monitorCaptureTimer ? "running" : "stopped"
}));

ipcMain.handle("app:relaunch", () => {
  app.relaunch();
  app.exit(0);
  return { ok: true };
});

ipcMain.handle("app:open-external", (_event, payload) => {
  const url = String(payload?.url || "").trim();
  if (!url) {
    return { ok: false, error: "missing_url" };
  }
  try {
    if (url.startsWith("/")) {
      const settings = loadSettings();
      const base = settings.serverUrl || "";
      if (base) {
        shell.openExternal(new URL(url, base).toString());
        return { ok: true };
      }
    }
    shell.openExternal(url);
    return { ok: true };
  } catch {
    return { ok: false, error: "open_failed" };
  }
});

ipcMain.handle("app:windows-agent-version", () => {
  const filePath = path.join(__dirname, "..", "..", "backend", "static", "downloads", "WorkZillaAgentSetup.exe");
  try {
    if (!fs.existsSync(filePath)) {
      return { ok: false, error: "not_found" };
    }
    const stats = fs.statSync(filePath);
    return { ok: true, version: stats.mtime.toISOString() };
  } catch (error) {
    return { ok: false, error: error?.message || "read_failed" };
  }
});

function ensureDeviceIdentity() {
  const settings = loadSettings();
  if (settings.deviceId) {
    return {
      device_id: settings.deviceId,
      device_name: os.hostname(),
      os_info: `${os.platform()} ${os.release()}`,
      app_version: app.getVersion()
    };
  }
  const deviceId = randomUUID();
  saveSettings({ ...settings, deviceId });
  addUserActivity("device_add", "Device added", `${os.hostname()} (${deviceId})`);
  return {
    device_id: deviceId,
    device_name: os.hostname(),
    os_info: `${os.platform()} ${os.release()}`,
    app_version: app.getVersion()
  };
}

function resolveCompanyKey(settings) {
  if (settings.companyKey) {
    return settings.companyKey;
  }
  if (typeof settings.orgId === "string" && /[a-zA-Z-]/.test(settings.orgId)) {
    return settings.orgId;
  }
  return "";
}

function persistAuthProfile(auth) {
  if (!auth?.authenticated) {
    return;
  }
  const settings = loadSettings();
  const orgId = auth.org_id || auth.profile?.organization?.id || null;
  const companyKey = auth.profile?.organization?.company_key || settings.companyKey || "";
  const employeeName =
    auth.user?.first_name ||
    auth.user?.username ||
    auth.user?.email ||
    settings.employeeName ||
    "";
  const policy = auth.policy || {};
  saveSettings({
    ...settings,
    orgId,
    userId: auth.user?.id || settings.userId,
    role: auth.profile?.role || settings.role,
    companyKey,
    employeeName,
    allowExit: policy.allow_exit === false ? false : settings.allowExit,
    allowBackground: policy.allow_background === false ? false : settings.allowBackground
  });
}

function getMonitorExePath() {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, "monitor", "employee_agent.exe");
  }
  return path.join(__dirname, "monitor", "employee_agent.exe");
}

function getMacHelperPath() {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, "mac_helper", "MonitorHelper");
  }
  const legacyPath = path.join(__dirname, "..", "mac_helper", "build", "MonitorHelper");
  if (fs.existsSync(legacyPath)) {
    return legacyPath;
  }
  const releasePath = path.join(__dirname, "..", "mac_helper", ".build", "release", "MonitorHelper");
  if (fs.existsSync(releasePath)) {
    return releasePath;
  }
  const debugPath = path.join(__dirname, "..", "mac_helper", ".build", "debug", "MonitorHelper");
  return debugPath;
}

async function ensureMonitorConfig(auth) {
  const identity = ensureDeviceIdentity();
  const settings = loadSettings();
  const companyKey = auth?.profile?.organization?.company_key || resolveCompanyKey(settings);
  const employeeName =
    settings.employeeName ||
    auth?.user?.first_name ||
    auth?.user?.username ||
    auth?.user?.email ||
    "Employee";
  const configDir = path.join(
    process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming"),
    "WorkZone"
  );
  const configPath = path.join(configDir, "agent_config.json");
  const payload = {
    device_id: identity.device_id,
    employee_code: identity.device_id,
    company_key: companyKey,
    employee_name: employeeName
  };
  fs.mkdirSync(configDir, { recursive: true });
  fs.writeFileSync(configPath, JSON.stringify(payload, null, 2));
}

async function startMonitorWithAuth() {
  if (!connectivityState.online) {
    return { ok: false, error: "offline" };
  }
  const auth = await checkAuth();
  const settings = loadSettings();
  const hasProfile = Boolean(resolveCompanyKey(settings)) && Boolean(settings.employeeName);
  if (!auth.authenticated && !hasProfile) {
    return { ok: false, error: "missing_profile" };
  }
  if (
    auth.authenticated &&
    Array.isArray(auth.enabled_products) &&
    auth.enabled_products.length > 0 &&
    !auth.enabled_products.includes("monitor")
  ) {
    return { ok: false, error: "not_enabled" };
  }
  if (process.platform === "darwin") {
    const perms = getMonitorPermissionsSnapshot();
    if (perms.screen === "granted" && perms.needsRestart) {
      return { ok: false, error: "relaunch_required" };
    }
  }
  await ensureMonitorConfig(auth.authenticated ? auth : null);
  try {
    await syncService.ensureEmployeeId();
  } catch (error) {
    const code = error?.code || error?.message || "missing_profile";
    return { ok: false, error: code };
  }
  configureAutoLaunch(true);
  const setupHeartbeat = async () => {
    if (monitorHeartbeatTimer) {
      clearInterval(monitorHeartbeatTimer);
    }
    monitorHeartbeatTimer = setInterval(async () => {
      try {
        const beatSettings = loadSettings();
        await sendMonitorHeartbeat({
          company_key: resolveCompanyKey(beatSettings),
          device_id: beatSettings.deviceId || "",
          employee_id: beatSettings.employeeId || null,
          app_name: "Work Zilla Agent",
          window_title: "Monitor Active"
        });
      } catch {
        // ignore heartbeat errors
      }
    }, 60000);
    try {
      const freshSettings = loadSettings();
      await sendMonitorHeartbeat({
        company_key: resolveCompanyKey(freshSettings),
        device_id: freshSettings.deviceId || "",
        employee_id: freshSettings.employeeId || null,
        app_name: "Work Zilla Agent",
        window_title: "Monitor Active"
      });
    } catch {
      // ignore heartbeat errors
    }
  };
  setupHeartbeat();
  if (process.platform === "darwin") {
    try {
      const intervalSettings = loadSettings();
      const result = await getMonitorSettings({
        companyKey: resolveCompanyKey(intervalSettings),
        deviceId: intervalSettings.deviceId || "",
        employeeId: intervalSettings.employeeId || null
      });
      const intervalSeconds = Number(result?.screenshot_interval_seconds || 0);
      if (Number.isFinite(intervalSeconds) && intervalSeconds > 0) {
        monitorCaptureIntervalMs = Math.max(15000, intervalSeconds * 1000);
      }
    } catch {
      // ignore monitor settings errors
    }
  }
  const status = startMonitorProcess();
  if (status === "unsupported") {
    return { ok: true, status };
  }
  if (status === "running") {
    try {
      const next = loadSettings();
      if (next.screenPermissionRelaunchRequired) {
        saveSettings({ ...next, screenPermissionRelaunchRequired: false });
      }
    } catch {
      // ignore
    }
  }
  return { ok: true, status };
}

function getMonitorPermissionsSnapshot() {
  if (process.platform !== "darwin") {
    return { screen: "granted", accessibility: true, needsRestart: false };
  }
  const screen = systemPreferences.getMediaAccessStatus("screen");
  const accessibility = systemPreferences.isTrustedAccessibilityClient(false);
  const settings = loadSettings();
  const needsRestart = settings.screenPermissionRelaunchRequired === true;
  return { screen, accessibility, needsRestart };
}

function persistScreenPermissionSnapshot() {
  if (process.platform !== "darwin") {
    return;
  }
  const perms = getMonitorPermissionsSnapshot();
  const settings = loadSettings();
  const prevStatus = settings.screenPermissionStatus || "unknown";
  let relaunchRequired = settings.screenPermissionRelaunchRequired === true;
  if (prevStatus !== "granted" && perms.screen === "granted") {
    relaunchRequired = true;
  }
  if (perms.screen === "granted" && perms.accessibility) {
    relaunchRequired = false;
  }
  if (perms.screen !== "granted") {
    relaunchRequired = false;
  }
  const next = {
    screenPermissionStatus: perms.screen,
    screenPermissionRelaunchRequired: relaunchRequired
  };
  if (prevStatus === "granted" && perms.screen !== "granted") {
    next.monitorRunning = false;
    next.monitorStartedAt = "";
  }
  saveSettings({ ...settings, ...next });
}

function broadcastMonitorPermissions() {
  if (process.platform !== "darwin") {
    return;
  }
  persistScreenPermissionSnapshot();
  const perms = getMonitorPermissionsSnapshot();
  BrowserWindow.getAllWindows().forEach((win) => {
    win.webContents.send("monitor:permissions-updated", perms);
  });
}

function configureAutoLaunch(enabled) {
  try {
    app.setLoginItemSettings({
      openAtLogin: Boolean(enabled),
      openAsHidden: true
    });
  } catch {
    // ignore auto-launch failures
  }
}

function scheduleMacCapture(intervalMs) {
  if (monitorCaptureTimer) {
    clearInterval(monitorCaptureTimer);
    monitorCaptureTimer = null;
  }
  if (!intervalMs || intervalMs < 15000) {
    return;
  }
  monitorCaptureTimer = setInterval(() => {
    captureOnceMac();
  }, intervalMs);
}

function scheduleWindowsCapture(intervalMs) {
  if (monitorCaptureTimer) {
    clearInterval(monitorCaptureTimer);
    monitorCaptureTimer = null;
  }
  if (!intervalMs || intervalMs < 15000) {
    return;
  }
  monitorCaptureTimer = setInterval(() => {
    captureOnceWindows();
  }, intervalMs);
}

async function captureOnceMacElectron() {
  try {
    const display = screen.getPrimaryDisplay();
    const size = display?.size || { width: 0, height: 0 };
    const sources = await desktopCapturer.getSources({
      types: ["screen"],
      thumbnailSize: { width: size.width || 1280, height: size.height || 720 }
    });
    const source = sources && sources[0];
    if (!source || !source.thumbnail || source.thumbnail.isEmpty()) {
      return null;
    }
    const png = source.thumbnail.toPNG();
    if (!png || !png.length) {
      return null;
    }
    const fileName = `screenshot-${Date.now()}-${randomUUID()}.png`;
    const filePath = path.join(os.tmpdir(), fileName);
    fs.writeFileSync(filePath, png);
    return filePath;
  } catch {
    return null;
  }
}

async function captureOnceWindowsElectron() {
  try {
    const display = screen.getPrimaryDisplay();
    const size = display?.size || { width: 0, height: 0 };
    const sources = await desktopCapturer.getSources({
      types: ["screen"],
      thumbnailSize: { width: size.width || 1366, height: size.height || 768 }
    });
    const source = sources && sources[0];
    if (!source || !source.thumbnail || source.thumbnail.isEmpty()) {
      return null;
    }
    const png = source.thumbnail.toPNG();
    if (!png || !png.length) {
      return null;
    }
    const fileName = `screenshot-${Date.now()}-${randomUUID()}.png`;
    const filePath = path.join(os.tmpdir(), fileName);
    fs.writeFileSync(filePath, png);
    return filePath;
  } catch {
    return null;
  }
}

function captureOnceMac() {
  if (process.platform !== "darwin") {
    return;
  }
  if (monitorCaptureInFlight) {
    return;
  }
  const perms = getMonitorPermissionsSnapshot();
  if (perms.screen === "granted") {
    monitorCaptureInFlight = true;
    captureOnceMacElectron().then((filePath) => {
      if (filePath) {
        uploadScreenshot(filePath);
      }
      monitorCaptureInFlight = false;
    });
    return;
  }
  const helperPath = getMacHelperPath();
  try {
    monitorCaptureInFlight = true;
    if (!fs.existsSync(helperPath)) {
      captureOnceMacElectron().then((filePath) => {
        if (filePath) {
          uploadScreenshot(filePath);
        }
        monitorCaptureInFlight = false;
      });
      return;
    }
    let capturedPath = "";
    monitorProcess = spawn(helperPath, ["capture-once"], {
      stdio: ["ignore", "pipe", "inherit"]
    });
    if (monitorProcess?.stdout) {
      let buffer = "";
      monitorProcess.stdout.setEncoding("utf8");
      monitorProcess.stdout.on("data", (chunk) => {
        buffer += chunk;
        const lines = buffer.split(/\r?\n/);
        buffer = lines.pop() || "";
        lines.forEach((line) => {
          const filePath = line.trim();
          if (!filePath) {
            return;
          }
          if (filePath.startsWith("error=")) {
            return;
          }
          capturedPath = filePath;
          uploadScreenshot(filePath);
        });
      });
      monitorProcess.stdout.on("end", () => {
        const remaining = buffer.trim();
        if (remaining && !remaining.startsWith("error=")) {
          capturedPath = remaining;
          uploadScreenshot(remaining);
        }
      });
    }
    monitorProcess.on("exit", () => {
      monitorProcess = null;
      monitorCaptureInFlight = false;
      if (!capturedPath) {
        captureOnceMacElectron().then((filePath) => {
          if (filePath) {
            uploadScreenshot(filePath);
          }
        });
      }
    });
  } catch {
    monitorProcess = null;
    monitorCaptureInFlight = false;
  }
}

function captureOnceWindows() {
  if (process.platform !== "win32") {
    return;
  }
  if (monitorCaptureInFlight) {
    return;
  }
  monitorCaptureInFlight = true;
  captureOnceWindowsElectron().then((filePath) => {
    if (filePath) {
      uploadScreenshot(filePath);
    }
    monitorCaptureInFlight = false;
  });
}

function startMonitorProcess() {
  cleanupLegacyWindowsMonitor();
  if (process.platform === "darwin") {
    captureOnceMac();
    scheduleMacCapture(monitorCaptureIntervalMs);
    return "running";
  }
  if (process.platform !== "win32") {
    return "unsupported";
  }
  if (monitorProcess || monitorCaptureTimer) {
    return "running";
  }
  captureOnceWindows();
  scheduleWindowsCapture(monitorCaptureIntervalMs);
  return "running";
}

function stopMonitorProcess() {
  if (monitorCaptureTimer) {
    clearInterval(monitorCaptureTimer);
    monitorCaptureTimer = null;
  }
  monitorCaptureInFlight = false;
  if (monitorProcess) {
    try {
      monitorProcess.kill();
    } catch {
      // ignore
    }
    monitorProcess = null;
  }
}
