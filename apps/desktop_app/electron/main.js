import { app, BrowserWindow, ipcMain, dialog, Tray, Menu, systemPreferences, shell } from "electron";
import path from "path";
import os from "os";
import fs from "fs";
import { randomUUID } from "crypto";
import { spawn } from "child_process";
import { fileURLToPath } from "url";
import SyncService from "./sync/SyncService.js";
import { login, logout, checkAuth } from "./sync/auth.js";
import { loadSettings, saveSettings, addFolder, removeFolder } from "./sync/settings.js";
import { listActivity, listErrors, listQueue } from "./sync/db.js";
import { getStorageStatus, recordMonitorStop, listRoot, listFolder, getOrgUsers, getOrgDevices, createOrgUser, downloadStorage } from "./sync/api.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let mainWindow = null;
let tray = null;
let isQuitting = false;
const syncService = new SyncService();
let monitorProcess = null;

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
      nodeIntegration: false
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

function refreshTray() {
  if (!tray) {
    return;
  }
  tray.setContextMenu(buildTrayMenu());
}

app.whenReady().then(() => {
  createWindow();
  createTray();
  broadcastMonitorPermissions();
});

app.on("before-quit", (event) => {
  const settings = loadSettings();
  if (settings.allowExit === false) {
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
  broadcastMonitorPermissions();
});

app.on("browser-window-focus", () => {
  broadcastMonitorPermissions();
});

ipcMain.handle("auth:login", async (_event, payload) => {
  const device = ensureDeviceIdentity();
  await login({ ...payload, ...device });
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
  const status = await checkAuth();
  persistAuthProfile(status);
  refreshTray();
  return { loading: false, ...status };
});

ipcMain.handle("settings:get", () => loadSettings());

ipcMain.handle("settings:update", (_event, payload) => {
  const settings = saveSettings({ ...loadSettings(), ...payload });
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
  return { folders: loadSettings().syncFolders || [] };
});

ipcMain.handle("folders:choose", async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ["openDirectory", "multiSelections"]
  });
  if (result.canceled) {
    return { message: "Selection cancelled." };
  }
  result.filePaths.forEach((folderPath) => {
    addFolder({ path: folderPath, name: path.basename(folderPath) });
  });
  syncService.start();
  return { message: "Folders added." };
});

ipcMain.handle("folders:remove", (_event, folderPath) => {
  removeFolder(folderPath);
  syncService.start();
  return true;
});

ipcMain.handle("sync:start", () => {
  syncService.start();
  return syncService.getStatus();
});

ipcMain.handle("sync:status", () => ({
  ...syncService.getStatus(),
  queue_size: listQueue(200).length
}));
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
ipcMain.handle("errors:list", () => ({ items: listErrors(200) }));
ipcMain.handle("queue:list", () => ({ items: listQueue(200) }));

ipcMain.handle("device:info", () => ensureDeviceIdentity());

ipcMain.handle("storage:explorer:root", async (_event, payload) => {
  return listRoot({ userId: payload?.userId });
});

ipcMain.handle("storage:explorer:folder", async (_event, payload) => {
  if (!payload?.folderId) {
    throw new Error("invalid_folder");
  }
  return listFolder(payload.folderId, { userId: payload?.userId });
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

ipcMain.handle("storage:download", async (_event, payload) => {
  const response = await downloadStorage(payload || {});
  const settings = loadSettings();
  const targetRoot = settings.syncFolders?.[0]?.path || app.getPath("downloads");
  const contentDisposition = response.headers.get("content-disposition") || "";
  let filename = payload?.filename || "";
  if (!filename && contentDisposition) {
    const match = /filename\*?=(?:UTF-8'')?["']?([^"';]+)["']?/i.exec(contentDisposition);
    if (match && match[1]) {
      filename = decodeURIComponent(match[1]);
    }
  }
  if (!filename) {
    filename = payload?.fileId ? `${payload.fileId}.bin` : "download.bin";
  }
  const safeName = filename.replace(/[\\/]/g, "-");
  let targetPath = path.join(targetRoot, safeName);
  if (fs.existsSync(targetPath)) {
    const ext = path.extname(safeName);
    const base = path.basename(safeName, ext);
    targetPath = path.join(targetRoot, `${base}-${Date.now()}${ext}`);
  }
  await new Promise((resolve, reject) => {
    const stream = fs.createWriteStream(targetPath);
    response.body.pipe(stream);
    response.body.on("error", reject);
    stream.on("finish", resolve);
    stream.on("error", reject);
  });
  return { ok: true, path: targetPath };
});

ipcMain.handle("monitor:start", async () => {
  return startMonitorWithAuth();
});

ipcMain.handle("monitor:permissions", async () => {
  if (process.platform !== "darwin") {
    return { screen: "granted", accessibility: true, needsRestart: false };
  }
  const screen = systemPreferences.getMediaAccessStatus("screen");
  const accessibility = systemPreferences.isTrustedAccessibilityClient(true);
  const needsRestart = screen === "granted" && !accessibility;
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

ipcMain.handle("monitor:open-settings", () => {
  if (process.platform !== "darwin") {
    return { ok: false, error: "unsupported_os" };
  }
  shell.openExternal("x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture");
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
  try {
    const settings = loadSettings();
    await recordMonitorStop({
      companyKey: settings.companyKey || settings.orgId || "",
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
  status: monitorProcess ? "running" : "stopped"
}));

ipcMain.handle("app:relaunch", () => {
  app.relaunch();
  app.exit(0);
  return { ok: true };
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
  return {
    device_id: deviceId,
    device_name: os.hostname(),
    os_info: `${os.platform()} ${os.release()}`,
    app_version: app.getVersion()
  };
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
  return path.join(__dirname, "..", "mac_helper", "build", "MonitorHelper");
}

async function ensureMonitorConfig(auth) {
  const identity = ensureDeviceIdentity();
  const settings = loadSettings();
  const companyKey = auth?.profile?.organization?.company_key || settings.companyKey || settings.orgId || "";
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
  const auth = await checkAuth();
  const settings = loadSettings();
  const hasProfile = Boolean(settings.orgId || settings.companyKey) && Boolean(settings.employeeName);
  if (!auth.authenticated && !hasProfile) {
    return { ok: false, error: "missing_profile" };
  }
  if (auth.authenticated && !auth.enabled_products?.includes("monitor")) {
    return { ok: false, error: "not_enabled" };
  }
  await ensureMonitorConfig(auth.authenticated ? auth : null);
  const status = startMonitorProcess();
  if (status === "unsupported") {
    return { ok: true, status };
  }
  return { ok: true, status };
}

function getMonitorPermissionsSnapshot() {
  if (process.platform !== "darwin") {
    return { screen: "granted", accessibility: true, needsRestart: false };
  }
  const screen = systemPreferences.getMediaAccessStatus("screen");
  const accessibility = systemPreferences.isTrustedAccessibilityClient(true);
  const needsRestart = screen === "granted" && !accessibility;
  return { screen, accessibility, needsRestart };
}

function broadcastMonitorPermissions() {
  if (process.platform !== "darwin") {
    return;
  }
  const perms = getMonitorPermissionsSnapshot();
  BrowserWindow.getAllWindows().forEach((win) => {
    win.webContents.send("monitor:permissions-updated", perms);
  });
}

function startMonitorProcess() {
  if (process.platform === "darwin") {
    const helperPath = getMacHelperPath();
    if (!fs.existsSync(helperPath)) {
      return "missing";
    }
    try {
      monitorProcess = spawn(helperPath, ["capture-once"], {
        stdio: ["ignore", "pipe", "inherit"]
      });
      attachHelperOutput(monitorProcess);
      monitorProcess.on("exit", () => {
        monitorProcess = null;
      });
      return "running";
    } catch {
      return "failed";
    }
  }
  if (process.platform !== "win32") {
    return "unsupported";
  }
  if (monitorProcess) {
    return "running";
  }
  const exePath = getMonitorExePath();
  if (!fs.existsSync(exePath)) {
    return "missing";
  }
  const settings = loadSettings();
  const orgId = settings.orgId || settings.companyKey || "";
  const employeeName = settings.employeeName || "";
  const args = ["--org", orgId, "--user", employeeName];
  monitorProcess = spawn(exePath, args, {
    windowsHide: true,
    stdio: "ignore"
  });
  monitorProcess.on("exit", () => {
    monitorProcess = null;
  });
  return "running";
}

function stopMonitorProcess() {
  if (!monitorProcess) {
    return;
  }
  try {
    monitorProcess.kill();
  } catch {
    // ignore
  }
  monitorProcess = null;
}
