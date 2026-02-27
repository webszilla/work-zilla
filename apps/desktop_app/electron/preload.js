import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("storageApi", {
  login: (payload) => ipcRenderer.invoke("auth:login", payload),
  logout: () => ipcRenderer.invoke("auth:logout"),
  getAuthStatus: () => ipcRenderer.invoke("auth:status"),
  getSettings: () => ipcRenderer.invoke("settings:get"),
  getConnectionStatus: () => ipcRenderer.invoke("connection:status"),
  checkConnectionNow: () => ipcRenderer.invoke("connection:check"),
  updateSettings: (payload) => ipcRenderer.invoke("settings:update", payload),
  getFolders: () => ipcRenderer.invoke("folders:get"),
  chooseFolders: () => ipcRenderer.invoke("folders:choose"),
  removeFolder: (path) => ipcRenderer.invoke("folders:remove", path),
  removeDevice: (payload) => ipcRenderer.invoke("device:remove", payload),
  mapFolderToOnline: (payload) => ipcRenderer.invoke("folders:map-remote", payload),
  getMappedOnlineFolder: (localPath) => ipcRenderer.invoke("folders:get-map", localPath),
  resolveRemoteFolderForLocalPath: (localPath) => ipcRenderer.invoke("folders:resolve-remote", localPath),
  startSync: () => ipcRenderer.invoke("sync:start"),
  getSyncStatus: () => ipcRenderer.invoke("sync:status"),
  getSyncUploadProgress: () => ipcRenderer.invoke("sync:upload-progress"),
  pauseSync: () => ipcRenderer.invoke("sync:pause"),
  resumeSync: () => ipcRenderer.invoke("sync:resume"),
  getDashboardSummary: () => ipcRenderer.invoke("dashboard:summary"),
  getStorageUsage: () => ipcRenderer.invoke("storage:usage"),
  getActivity: () => ipcRenderer.invoke("activity:list"),
  getUserActivity: () => ipcRenderer.invoke("user-activity:list"),
  getErrors: () => ipcRenderer.invoke("errors:list"),
  getQueue: () => ipcRenderer.invoke("queue:list"),
  getDeviceInfo: () => ipcRenderer.invoke("device:info"),
  getStorageRoot: (payload) => ipcRenderer.invoke("storage:explorer:root", payload),
  getStorageFolder: (payload) => ipcRenderer.invoke("storage:explorer:folder", payload),
  createStorageFolder: (payload) => ipcRenderer.invoke("storage:explorer:create-folder", payload),
  renameStorageFolder: (payload) => ipcRenderer.invoke("storage:explorer:rename-folder", payload),
  uploadStorageFiles: (payload) => ipcRenderer.invoke("storage:explorer:upload-picker", payload),
  uploadStoragePaths: (payload) => ipcRenderer.invoke("storage:explorer:upload-paths", payload),
  getStorageUsers: () => ipcRenderer.invoke("storage:org:users"),
  getStorageDevices: (payload) => ipcRenderer.invoke("storage:org:devices", payload),
  createStorageUser: (payload) => ipcRenderer.invoke("storage:org:users:create", payload),
  validateImpositionLicense: (payload) => ipcRenderer.invoke("imposition:license:validate", payload),
  registerImpositionDevice: (payload) => ipcRenderer.invoke("imposition:device:register", payload),
  checkImpositionDevice: (payload) => ipcRenderer.invoke("imposition:device:check", payload),
  getImpositionPolicy: () => ipcRenderer.invoke("imposition:policy"),
  generateImpositionQrBarcode: (payload) => ipcRenderer.invoke("imposition:qr-barcode:generate", payload),
  uploadImpositionBulkImport: (payload) => ipcRenderer.invoke("imposition:bulk-import:upload", payload),
  generateImpositionBulkLayout: (payload) => ipcRenderer.invoke("imposition:bulk-layout:generate", payload),
  exportImpositionBulk: (payload) => ipcRenderer.invoke("imposition:bulk-export", payload),
  downloadFile: (payload) => ipcRenderer.invoke("storage:download", payload),
  downloadBulk: (payload) => ipcRenderer.invoke("storage:download-bulk", payload),
  startMonitor: () => ipcRenderer.invoke("monitor:start"),
  stopMonitor: () => ipcRenderer.invoke("monitor:stop"),
  getMonitorStatus: () => ipcRenderer.invoke("monitor:status"),
  onConnectionStatusUpdated: (handler) => {
    const listener = (_event, status) => handler(status);
    ipcRenderer.on("connection:status", listener);
    return () => ipcRenderer.removeListener("connection:status", listener);
  },
  onStorageUploadProgress: (handler) => {
    const listener = (_event, status) => handler(status);
    ipcRenderer.on("storage:upload-progress", listener);
    return () => ipcRenderer.removeListener("storage:upload-progress", listener);
  },
  onSyncUploadProgress: (handler) => {
    const listener = (_event, status) => handler(status);
    ipcRenderer.on("sync:upload-progress", listener);
    return () => ipcRenderer.removeListener("sync:upload-progress", listener);
  }
});
