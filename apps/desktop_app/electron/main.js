import { app, BrowserWindow, ipcMain, dialog, Tray, Menu, systemPreferences, shell, desktopCapturer, screen, nativeImage } from "electron";
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
import { getStorageStatus, recordMonitorStop, listRoot, listFolder, getOrgUsers, getOrgDevices, createOrgUser, downloadStorage, sendMonitorHeartbeat, getMonitorSettings } from "./sync/api.js";

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
      startMonitorWithAuth();
    }, 1500);
  }
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
  try {
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
      filename = payload?.fileId ? `${payload.fileId}.bin` : "download.zip";
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
  } catch (error) {
    return { ok: false, error: error?.message || "download_failed" };
  }
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

function startMonitorProcess() {
  if (process.platform === "darwin") {
    const helperPath = getMacHelperPath();
    captureOnceMac();
    scheduleMacCapture(monitorCaptureIntervalMs);
    return "running";
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
  const orgId = resolveCompanyKey(settings);
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
