import chokidar from "chokidar";
import fs from "fs";
import os from "os";
import path from "path";
import { addActivity, addError, dequeueNext, enqueueFile, incrementRetry, listQueue, updateQueueStatus, setFolderMap, getFolderMap } from "./db.js";
import { loadSettings, saveSettings } from "./settings.js";
import { createFolder, getStorageStatus, getSyncSettings, listFolder, listRoot, uploadFile, registerEmployee, uploadScreenshot as uploadScreenshotApi } from "./api.js";

const SYSTEM_FOLDER_NAMES = new Set([
  "Windows",
  "Program Files",
  "Program Files (x86)",
  "ProgramData",
  "$Recycle.Bin",
  "System Volume Information",
  "AppData",
  "Temp"
]);

function isSystemPath(filePath) {
  const parts = filePath.split(path.sep);
  return parts.some((part) => SYSTEM_FOLDER_NAMES.has(part));
}

function isHiddenPath(filePath) {
  return filePath.split(path.sep).some((part) => part.startsWith("."));
}

function isTempPath(filePath) {
  return filePath.toLowerCase().includes("\\temp") || filePath.toLowerCase().includes("/temp");
}

function nowLabel() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function resolveCompanyKey(settings) {
  if (settings?.companyKey) {
    return settings.companyKey;
  }
  if (typeof settings?.orgId === "string" && /[a-zA-Z-]/.test(settings.orgId)) {
    return settings.orgId;
  }
  return "";
}

export default class SyncService {
  constructor() {
    this.watchers = [];
    this.paused = false;
    this.running = false;
    this.lastSync = null;
    this.networkStatus = "Unknown";
    this.retryIn = "-";
    this.worker = null;
    this.rootFolderId = null;
    this.rootFolderItems = [];
    this.deviceFolderId = null;
    this.activeUploads = 0;
    this.autoPaused = false;
    this.lastUploadAt = 0;
    this.rateLimitedUntil = 0;
  }

  getStatus() {
    return {
      status: this.paused ? "Paused" : this.running ? "Running" : "Stopped",
      last_sync: this.lastSync || "-",
      network: this.networkStatus,
      retry_in: this.retryIn || "-",
      active_uploads: this.activeUploads
    };
  }

  start() {
    if (this.running) {
      return;
    }
    const settings = loadSettings();
    this.paused = Boolean(settings.paused);
    this.running = true;
    this.startWatchers(settings.syncFolders);
    this.startWorker();
    addActivity("Sync service started", "Watching selected folders", "info");
  }

  stop() {
    this.running = false;
    this.watchers.forEach((watcher) => watcher.close());
    this.watchers = [];
    if (this.worker) {
      clearInterval(this.worker);
      this.worker = null;
    }
  }

  pause() {
    this.paused = true;
    this.autoPaused = false;
    addActivity("Sync paused", "Paused by user", "info");
  }

  resume() {
    this.paused = false;
    this.autoPaused = false;
    addActivity("Sync resumed", "Resuming sync", "info");
  }

  startWatchers(folders) {
    this.watchers.forEach((watcher) => watcher.close());
    this.watchers = [];

    folders.forEach((folder) => {
      const watcher = chokidar.watch(folder.path, {
        ignoreInitial: true,
        depth: 20,
        ignored: (filePath) => {
          if (isSystemPath(filePath) || isHiddenPath(filePath) || isTempPath(filePath)) {
            return true;
          }
          return false;
        }
      });

      watcher.on("add", (filePath, stats) => this.handleChange("add", filePath, stats));
      watcher.on("change", (filePath, stats) => this.handleChange("change", filePath, stats));
      watcher.on("unlink", (filePath) => this.handleChange("unlink", filePath));
      this.watchers.push(watcher);

      if (!folder.initialSyncDone) {
        this.queueInitialSync(folder);
      }
    });
  }

  async queueInitialSync(folder) {
    try {
      await this.enqueueExistingFiles(folder.path);
      const settings = loadSettings();
      const nextFolders = (settings.syncFolders || []).map((item) =>
        item.path === folder.path ? { ...item, initialSyncDone: true } : item
      );
      saveSettings({ ...settings, syncFolders: nextFolders });
      addActivity("Initial sync queued", folder.path, "info");
    } catch (error) {
      addError("Initial sync failed", error?.message || "Unable to scan selected folder.");
    }
  }

  async enqueueExistingFiles(rootPath) {
    const walk = async (currentPath) => {
      if (isSystemPath(currentPath) || isHiddenPath(currentPath) || isTempPath(currentPath)) {
        return;
      }
      let entries = [];
      try {
        entries = await fs.promises.readdir(currentPath, { withFileTypes: true });
      } catch {
        return;
      }
      for (const entry of entries) {
        const fullPath = path.join(currentPath, entry.name);
        if (isSystemPath(fullPath) || isHiddenPath(fullPath) || isTempPath(fullPath)) {
          continue;
        }
        if (entry.isDirectory()) {
          await walk(fullPath);
        } else if (entry.isFile()) {
          try {
            const stats = await fs.promises.stat(fullPath);
            enqueueFile(fullPath, "add", stats.size || 0);
          } catch {
            // ignore unreadable file
          }
        }
      }
    };
    await walk(rootPath);
  }

  handleChange(event, filePath, stats) {
    if (!this.running || this.paused) {
      return;
    }
    if (isSystemPath(filePath) || isHiddenPath(filePath) || isTempPath(filePath)) {
      return;
    }
    if (event === "unlink") {
      return;
    }
    enqueueFile(filePath, event, stats?.size || 0);
  }

  startWorker() {
    if (this.worker) {
      clearInterval(this.worker);
    }
    this.worker = setInterval(() => this.processQueue(), 1000);
  }

  async processQueue() {
    if (!this.running || this.paused) {
      if (this.autoPaused) {
        try {
          await getStorageStatus();
          this.networkStatus = "Online";
          this.paused = false;
          this.autoPaused = false;
          addActivity("Sync resumed", "Network restored", "info");
        } catch {
          this.retryIn = "30s";
        }
      }
      return;
    }
    const settings = loadSettings();
    const throttleMs = Math.max(0, Number(settings.throttleMs || 0));
    if (throttleMs && Date.now() - this.lastUploadAt < throttleMs) {
      return;
    }
    if (this.rateLimitedUntil && Date.now() < this.rateLimitedUntil) {
      const remainingSeconds = Math.max(1, Math.ceil((this.rateLimitedUntil - Date.now()) / 1000));
      this.retryIn = `${remainingSeconds}s`;
      return;
    }
    const item = dequeueNext();
    if (!item) {
      return;
    }
    if (!fs.existsSync(item.path)) {
      updateQueueStatus(item.id, "skipped");
      return;
    }

    try {
      const syncSettings = await getSyncSettings();
      if (syncSettings && syncSettings.effective_sync_enabled === false) {
        this.paused = true;
        this.autoPaused = true;
        addActivity("Sync disabled", "Disabled by admin", "error");
        addError("Sync disabled", "System folder sync is disabled for this account.");
        updateQueueStatus(item.id, "blocked");
        return;
      }
      const status = await getStorageStatus();
      this.networkStatus = "Online";
      this.retryIn = "-";
      if (status.total_allowed_storage_gb && status.remaining_storage_gb <= 0) {
        this.pause();
        addActivity("Storage limit exceeded", "Sync paused", "error");
        addError("Storage limit exceeded", "Upgrade storage to continue syncing.");
        updateQueueStatus(item.id, "blocked");
        return;
      }
    } catch (error) {
      this.networkStatus = "Offline";
      this.paused = true;
      this.autoPaused = true;
      this.retryIn = "30s";
      incrementRetry(item.id);
      addError("Network error", error?.message || "Storage API unavailable.");
      return;
    }

    updateQueueStatus(item.id, "uploading");
    this.activeUploads += 1;
    try {
      const remoteFolderId = await this.ensureRemoteFolderForFile(item.path);
      await uploadFile(remoteFolderId, item.path);
      updateQueueStatus(item.id, "done");
      addActivity("File uploaded", item.path, "success");
      this.lastSync = new Date().toLocaleString();
      this.lastUploadAt = Date.now();
    } catch (error) {
      updateQueueStatus(item.id, "failed");
      incrementRetry(item.id);
      if (error?.code === "storage_limit_exceeded") {
        this.pause();
        addActivity("Storage limit exceeded", "Sync paused", "error");
        addError("Storage limit exceeded", "Upgrade storage to continue syncing.");
      } else if (error?.code === "read_only") {
        this.pause();
        this.autoPaused = true;
        addActivity("Read-only mode", "Sync paused", "error");
        addError("Read-only mode", "Upgrade plan to resume syncing.");
      } else if (error?.code === "conflict") {
        const renamed = await this.handleConflict(item.path);
        addActivity("Conflict resolved", `Renamed to ${renamed}`, "info");
      } else if (error?.code === "rate_limited") {
        this.rateLimitedUntil = Date.now() + 60000;
        this.retryIn = "60s";
        addActivity("Sync rate limited", "Retrying uploads after cooldown", "error");
        addError("Upload rate limited", "Too many uploads. Retrying in 60 seconds.");
      } else {
        addError("Upload failed", error?.message || "Unknown error");
      }
    } finally {
      this.activeUploads = Math.max(0, this.activeUploads - 1);
    }
  }

  async ensureRemoteFolderForFile(filePath) {
    const settings = loadSettings();
    const root = settings.syncFolders.find((folder) => filePath.startsWith(folder.path));
    if (!root) {
      throw new Error("Folder not in sync scope");
    }

    if (!this.rootFolderId) {
      const rootData = await listRoot();
      this.rootFolderId = rootData.folder_id;
      this.rootFolderItems = rootData.items || [];
    }

    if (!this.deviceFolderId) {
      const deviceKey = settings.deviceId;
      if (deviceKey) {
        const match = (this.rootFolderItems || []).find(
          (item) => item.type === "folder" && item.name === deviceKey
        );
        if (match?.id) {
          this.deviceFolderId = match.id;
        } else {
          this.deviceFolderId = await this.ensureFolderByName(this.rootFolderId, deviceKey);
        }
      } else {
        this.deviceFolderId = this.rootFolderId;
      }
    }

    const rootMap = getFolderMap(root.path);
    let rootRemoteId = rootMap?.remote_id;
    if (!rootRemoteId) {
      const baseParent = this.deviceFolderId || this.rootFolderId;
      rootRemoteId = await this.ensureFolderByName(baseParent, root.name || path.basename(root.path));
      setFolderMap(root.path, rootRemoteId);
    }

    const relative = path.relative(root.path, path.dirname(filePath));
    if (!relative || relative === ".") {
      return rootRemoteId;
    }

    const segments = relative.split(path.sep).filter(Boolean);
    let currentPath = root.path;
    let parentId = rootRemoteId;
    for (const segment of segments) {
      currentPath = path.join(currentPath, segment);
      const mapped = getFolderMap(currentPath);
      if (mapped?.remote_id) {
        parentId = mapped.remote_id;
        continue;
      }
      const remoteId = await this.ensureFolderByName(parentId, segment);
      setFolderMap(currentPath, remoteId);
      parentId = remoteId;
    }

    return parentId;
  }

  async ensureFolderByName(parentId, name) {
    try {
      const created = await createFolder(parentId, name);
      return created.id;
    } catch (error) {
      if (error?.message === "duplicate_folder") {
        const list = await listFolder(parentId);
        const match = (list.items || []).find((item) => item.type === "folder" && item.name === name);
        if (match) {
          return match.id;
        }
      }
      throw error;
    }
  }

  async handleConflict(filePath) {
    const dir = path.dirname(filePath);
    const base = path.basename(filePath);
    const nextName = `${base}.conflict-${nowLabel()}`;
    const nextPath = path.join(dir, nextName);
    fs.renameSync(filePath, nextPath);
    return nextName;
  }

  getQueue() {
    return listQueue(100);
  }

  async ensureEmployeeId() {
    const settings = loadSettings();
    if (settings.employeeId) {
      return settings.employeeId;
    }
    if (!settings.deviceId) {
      throw new Error("missing_device_id");
    }
    const companyKey = resolveCompanyKey(settings);
    if (!companyKey) {
      throw new Error("missing_company_key");
    }
    const payload = {
      company_key: companyKey,
      employee_code: settings.deviceId,
      device_id: settings.deviceId,
      pc_name: os.hostname(),
      name: settings.employeeName || "Employee"
    };
    const data = await registerEmployee(payload);
    const employeeId = data?.employee_id || data?.data?.id || null;
    if (employeeId) {
      saveSettings({ ...settings, employeeId });
    }
    if (!employeeId) {
      throw new Error("missing_employee_id");
    }
    return employeeId;
  }

  async uploadScreenshot(filePath) {
    if (!filePath || !fs.existsSync(filePath)) {
      return;
    }
    try {
      const settings = loadSettings();
      const employeeId = await this.ensureEmployeeId();
      const companyKey = resolveCompanyKey(settings);
      await uploadScreenshotApi({
        filePath,
        employeeId,
        deviceId: settings.deviceId,
        companyKey,
        pcName: os.hostname()
      });
      addActivity("Screenshot uploaded", filePath, "success");
    } catch (error) {
      addError("Screenshot upload failed", error?.message || "Unknown error");
    }
  }
}
