import { useEffect, useMemo, useState } from "react";

const MAX_FOLDERS = 5;
const ACTIVE_WINDOW_MINUTES = 15;
const REMOVE_CONFIRM_MESSAGE = "Please download online data before removing because when you remove the sync folder, online storage data will also be deleted.";

function detectOsLabel(raw) {
  const value = String(raw || "").toLowerCase();
  if (value.includes("win")) {
    return "Windows";
  }
  if (value.includes("darwin") || value.includes("mac")) {
    return "Mac";
  }
  return "Unknown";
}

function normalizeDeviceLabel(device) {
  const host = String(device?.device_name || "").trim() || "Unknown Device";
  const osType = detectOsLabel(device?.os_info);
  return `${host} (${osType})`;
}

function isActiveDevice(lastSeen) {
  if (!lastSeen) {
    return false;
  }
  const parsed = new Date(lastSeen);
  if (Number.isNaN(parsed.getTime())) {
    return false;
  }
  const windowMs = ACTIVE_WINDOW_MINUTES * 60 * 1000;
  return Date.now() - parsed.getTime() <= windowMs;
}

export default function AddDeviceFoldersScreen({ onOpenCloud }) {
  const [status, setStatus] = useState({ loading: false, message: "", type: "info" });
  const [folders, setFolders] = useState({ loading: true, items: [], error: "" });
  const [devices, setDevices] = useState({ loading: true, items: [], error: "" });
  const [localDevice, setLocalDevice] = useState({
    loading: true,
    deviceId: "",
    hostName: "",
    osType: "Unknown",
    nickname: ""
  });
  const [folderContextMenu, setFolderContextMenu] = useState(null);

  const activeDeviceCount = useMemo(
    () => (devices.items || []).filter((item) => isActiveDevice(item.last_seen)).length,
    [devices.items]
  );

  const selectedFolderCount = folders.items.length;

  async function loadFolders() {
    try {
      const data = await window.storageApi.getFolders();
      setFolders({ loading: false, items: data.folders || [], error: "" });
    } catch (error) {
      setFolders({ loading: false, items: [], error: error?.message || "Unable to load folders." });
    }
  }

  async function loadDevices() {
    try {
      const data = await window.storageApi.getStorageDevices({});
      setDevices({ loading: false, items: data.items || [], error: "" });
    } catch (error) {
      setDevices({ loading: false, items: [], error: error?.message || "Unable to load devices." });
    }
  }

  async function loadLocalDevice() {
    try {
      const [info, settings] = await Promise.all([
        window.storageApi.getDeviceInfo(),
        window.storageApi.getSettings()
      ]);
      setLocalDevice({
        loading: false,
        deviceId: info?.device_id || "",
        hostName: info?.device_name || "",
        osType: detectOsLabel(info?.os_info),
        nickname: String(settings?.deviceNickname || "")
      });
    } catch {
      setLocalDevice((prev) => ({ ...prev, loading: false }));
    }
  }

  async function loadAll() {
    setStatus((prev) => ({ ...prev, message: "" }));
    await Promise.all([loadFolders(), loadDevices(), loadLocalDevice()]);
  }

  useEffect(() => {
    loadAll();
  }, []);

  useEffect(() => {
    function handleWindowClick() {
      setFolderContextMenu(null);
    }
    function handleEscape(event) {
      if (event.key === "Escape") {
        setFolderContextMenu(null);
      }
    }
    window.addEventListener("click", handleWindowClick);
    window.addEventListener("keydown", handleEscape);
    return () => {
      window.removeEventListener("click", handleWindowClick);
      window.removeEventListener("keydown", handleEscape);
    };
  }, []);

  async function handleChooseFolders() {
    setStatus({ loading: true, message: "", type: "info" });
    try {
      const result = await window.storageApi.chooseFolders();
      if (result?.limitReached) {
        setStatus({ loading: false, message: "Maximum 5 folders allowed per device.", type: "error" });
      } else {
        setStatus({ loading: false, message: result?.message || "Folders updated.", type: "success" });
      }
      await loadFolders();
    } catch (error) {
      setStatus({ loading: false, message: error?.message || "Unable to add folders.", type: "error" });
    }
  }

  async function handleSaveNickname() {
    const nickname = String(localDevice.nickname || "").trim();
    try {
      await window.storageApi.updateSettings({ deviceNickname: nickname });
      setStatus({ loading: false, message: "Device nickname saved.", type: "success" });
    } catch (error) {
      setStatus({ loading: false, message: error?.message || "Unable to save device nickname.", type: "error" });
    }
  }

  async function handleRemoveFolder(folderPath) {
    const confirmed = window.confirm(REMOVE_CONFIRM_MESSAGE);
    if (!confirmed) {
      return;
    }
    setStatus({ loading: true, message: "Removing folder and cloud data...", type: "info" });
    try {
      const result = await window.storageApi.removeFolder(folderPath);
      if (!result?.ok) {
        throw new Error(result?.error || "Unable to remove folder.");
      }
      setStatus({ loading: false, message: "Folder removed from sync and cloud storage.", type: "success" });
      await loadFolders();
    } catch (error) {
      setStatus({ loading: false, message: error?.message || "Unable to remove folder.", type: "error" });
    }
  }

  async function handleDownloadSyncedFolder(item) {
    if (!item?.path) {
      return;
    }
    setStatus({ loading: true, message: "Preparing download...", type: "info" });
    try {
      const mapped = await window.storageApi.resolveRemoteFolderForLocalPath(item.path);
      const remoteId = mapped?.remote_id;
      if (!remoteId) {
        throw new Error("Cloud mapping not found for this folder.");
      }
      const result = await window.storageApi.downloadFile({
        folderId: remoteId,
        filename: `${item.name || "folder"}.zip`
      });
      if (result?.cancelled) {
        setStatus({ loading: false, message: "Download cancelled.", type: "info" });
        return;
      }
      if (!result?.ok) {
        throw new Error(result?.error || "Download failed.");
      }
      setStatus({ loading: false, message: `Downloaded to ${result.path}`, type: "success" });
    } catch (error) {
      setStatus({ loading: false, message: error?.message || "Download failed.", type: "error" });
    }
  }

  function openFolderContextMenu(event, item) {
    event.preventDefault();
    setFolderContextMenu({ x: event.clientX, y: event.clientY, item });
  }

  return (
    <div className="screen">
      <div className="screen-header">
        <h2>Add Device &amp; Folders</h2>
        <p className="text-muted">Manage active devices, local sync folders, and folder downloads.</p>
      </div>

      {status.message ? (
        <div
          className={
            status.type === "error"
              ? "alert alert-danger"
              : status.type === "success"
                ? "banner banner-info"
                : "text-muted"
          }
        >
          {status.message}
        </div>
      ) : null}

      <div className="card">
        <div className="row">
          <div>
            <div className="list-title">Current Device Detection</div>
            <div className="list-subtitle">OS and hostname are auto-detected for this PC.</div>
          </div>
          <div className="button-row" style={{ marginTop: 0 }}>
            <button type="button" className="btn btn-secondary" onClick={loadAll}>Refresh</button>
          </div>
        </div>

        {localDevice.loading ? (
          <div className="text-muted mt-2">Loading device info...</div>
        ) : (
          <div className="table-wrap mt-3">
            <table className="table-ui">
              <thead>
                <tr>
                  <th>Device ID</th>
                  <th>PC Name</th>
                  <th>OS Type</th>
                  <th>Device Nickname (Optional)</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>{localDevice.deviceId || "-"}</td>
                  <td>{localDevice.hostName || "-"}</td>
                  <td>{localDevice.osType}</td>
                  <td>
                    <div className="button-row" style={{ marginTop: 0 }}>
                      <input
                        type="text"
                        value={localDevice.nickname}
                        placeholder="Enter nickname"
                        onChange={(event) => setLocalDevice((prev) => ({ ...prev, nickname: event.target.value }))}
                        style={{ minWidth: "220px" }}
                      />
                      <button type="button" className="btn btn-secondary btn-sm" onClick={handleSaveNickname}>
                        Save Nickname
                      </button>
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="card">
        <div className="row">
          <div>
            <div className="list-title">Active Sync Devices</div>
            <div className="list-subtitle">Device count is based on active sync devices.</div>
          </div>
          <div className="list-title">Active: {activeDeviceCount}</div>
        </div>

        {devices.error ? <div className="alert alert-danger mt-2">{devices.error}</div> : null}
        {devices.loading ? (
          <div className="text-muted mt-2">Loading devices...</div>
        ) : devices.items.length ? (
          <div className="table-wrap mt-3">
            <table className="table-ui">
              <thead>
                <tr>
                  <th>Device</th>
                  <th>Last Seen</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {devices.items.map((device) => {
                  const active = isActiveDevice(device.last_seen);
                  return (
                    <tr key={device.device_id}>
                      <td>{normalizeDeviceLabel(device)}</td>
                      <td>{device.last_seen ? new Date(device.last_seen).toLocaleString() : "-"}</td>
                      <td>
                        <span className={`status-pill ${active ? "status-success" : "status-error"}`}>
                          {active ? "Active" : "Inactive"}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-muted mt-2">No devices found.</div>
        )}
      </div>

      <div className="card">
        <div className="row">
          <div>
            <div className="list-title">Local Sync Folders</div>
            <div className="list-subtitle">Maximum {MAX_FOLDERS} folders per device.</div>
          </div>
          <div className="list-title">
            {selectedFolderCount}/{MAX_FOLDERS}
          </div>
        </div>

        <div className="button-row">
          <button type="button" className="btn btn-primary" onClick={handleChooseFolders} disabled={status.loading}>
            {status.loading ? "Opening..." : "Select Folders"}
          </button>
          <button type="button" className="btn btn-secondary" onClick={() => onOpenCloud?.()}>
            Open File Storage
          </button>
        </div>

        {folders.error ? <div className="alert alert-danger mt-2">{folders.error}</div> : null}
        {folders.loading ? (
          <div className="text-muted mt-2">Loading folders...</div>
        ) : folders.items.length ? (
          <div className="table-wrap mt-3">
            <table className="table-ui">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Path</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {folders.items.map((item) => (
                  <tr key={item.path} onContextMenu={(event) => openFolderContextMenu(event, item)}>
                    <td>{item.name}</td>
                    <td>{item.path}</td>
                    <td>
                      <div className="button-row" style={{ marginTop: 0 }}>
                        <button type="button" className="btn btn-secondary btn-sm" onClick={() => handleDownloadSyncedFolder(item)}>
                          Download
                        </button>
                        <button type="button" className="btn btn-secondary btn-sm" onClick={() => handleRemoveFolder(item.path)}>
                          Remove
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-muted mt-2">No folders selected yet.</div>
        )}
      </div>

      {folderContextMenu ? (
        <div
          className="item-context-menu"
          style={{ top: `${folderContextMenu.y}px`, left: `${folderContextMenu.x}px` }}
          onClick={(event) => event.stopPropagation()}
        >
          <button
            type="button"
            className="item-context-menu-action"
            onClick={() => {
              handleDownloadSyncedFolder(folderContextMenu.item);
              setFolderContextMenu(null);
            }}
          >
            Download
          </button>
          <button
            type="button"
            className="item-context-menu-action"
            onClick={() => {
              handleRemoveFolder(folderContextMenu.item.path);
              setFolderContextMenu(null);
            }}
          >
            Remove
          </button>
        </div>
      ) : null}
    </div>
  );
}
