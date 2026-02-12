const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("storageApi", {
  login: (payload) => ipcRenderer.invoke("auth:login", payload),
  logout: () => ipcRenderer.invoke("auth:logout"),
  getAuthStatus: () => ipcRenderer.invoke("auth:status"),
  getSettings: () => ipcRenderer.invoke("settings:get"),
  updateSettings: (payload) => ipcRenderer.invoke("settings:update", payload),
  getFolders: () => ipcRenderer.invoke("folders:get"),
  chooseFolders: () => ipcRenderer.invoke("folders:choose"),
  removeFolder: (path) => ipcRenderer.invoke("folders:remove", path),
  startSync: () => ipcRenderer.invoke("sync:start"),
  getSyncStatus: () => ipcRenderer.invoke("sync:status"),
  pauseSync: () => ipcRenderer.invoke("sync:pause"),
  resumeSync: () => ipcRenderer.invoke("sync:resume"),
  getDashboardSummary: () => ipcRenderer.invoke("dashboard:summary"),
  getStorageUsage: () => ipcRenderer.invoke("storage:usage"),
  getActivity: () => ipcRenderer.invoke("activity:list"),
  getErrors: () => ipcRenderer.invoke("errors:list"),
  getQueue: () => ipcRenderer.invoke("queue:list"),
  getDeviceInfo: () => ipcRenderer.invoke("device:info"),
  getStorageRoot: (payload) => ipcRenderer.invoke("storage:explorer:root", payload),
  getStorageFolder: (payload) => ipcRenderer.invoke("storage:explorer:folder", payload),
  getStorageUsers: () => ipcRenderer.invoke("storage:org:users"),
  getStorageDevices: (payload) => ipcRenderer.invoke("storage:org:devices", payload),
  createStorageUser: (payload) => ipcRenderer.invoke("storage:org:users:create", payload),
  downloadFile: (payload) => ipcRenderer.invoke("storage:download", payload),
  getPlatform: () => process.platform,
  getMonitorPermissions: () => ipcRenderer.invoke("monitor:permissions"),
  requestMonitorPermissions: () => ipcRenderer.invoke("monitor:request-permissions"),
  openMonitorSettings: (payload) => ipcRenderer.invoke("monitor:open-settings", payload),
  getMonitorSupport: () => ipcRenderer.invoke("monitor:support"),
  startMonitor: () => ipcRenderer.invoke("monitor:start"),
  stopMonitor: (payload) => ipcRenderer.invoke("monitor:stop", payload),
  getMonitorStatus: () => ipcRenderer.invoke("monitor:status"),
  relaunchApp: () => ipcRenderer.invoke("app:relaunch"),
  openExternal: (url) => ipcRenderer.invoke("app:open-external", { url }),
  getWindowsAgentVersion: () => ipcRenderer.invoke("app:windows-agent-version"),
  onMonitorPermissionsUpdated: (handler) => {
    const listener = (_event, perms) => handler(perms);
    ipcRenderer.on("monitor:permissions-updated", listener);
    return () => ipcRenderer.removeListener("monitor:permissions-updated", listener);
  }
});
