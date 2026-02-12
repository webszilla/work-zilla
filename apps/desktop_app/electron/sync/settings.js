import fs from "fs";
import path from "path";
import { app } from "electron";

const SETTINGS_FILE = "settings.json";

const defaultSettings = {
  serverUrl: process.env.WZ_SERVER_URL || "http://127.0.0.1:8000",
  theme: "system",
  syncFolders: [],
  two_way: false,
  paused: false,
  throttleMs: 1000,
  deviceId: "",
  employeeId: null,
  orgId: null,
  userId: null,
  role: "",
  companyKey: "",
  employeeName: "",
  allowExit: true,
  allowBackground: true,
  macScreenRecordingOnboarded: false,
  screenPermissionStatus: "unknown",
  screenPermissionRelaunchRequired: false,
  monitorStartOnLaunch: false,
  monitorStopReasons: [],
  monitorRunning: false,
  monitorStartedAt: ""
};

export function getSettingsPath() {
  return path.join(app.getPath("userData"), SETTINGS_FILE);
}

export function loadSettings() {
  const filePath = getSettingsPath();
  if (!fs.existsSync(filePath)) {
    return { ...defaultSettings };
  }
  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    const data = JSON.parse(raw);
    return { ...defaultSettings, ...data };
  } catch (error) {
    return { ...defaultSettings };
  }
}

export function saveSettings(next) {
  const filePath = getSettingsPath();
  const merged = { ...defaultSettings, ...next };
  fs.writeFileSync(filePath, JSON.stringify(merged, null, 2));
  return merged;
}

export function addFolder(folder) {
  const settings = loadSettings();
  const existing = settings.syncFolders.find((item) => item.path === folder.path);
  if (!existing) {
    settings.syncFolders.push({ ...folder, initialSyncDone: false });
  }
  return saveSettings(settings);
}

export function removeFolder(folderPath) {
  const settings = loadSettings();
  settings.syncFolders = settings.syncFolders.filter((item) => item.path !== folderPath);
  return saveSettings(settings);
}
