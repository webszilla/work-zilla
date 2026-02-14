import { useEffect, useMemo, useState } from "react";

const confirmMessage = "Please download online data before removing because when you remove the sync folder, online storage data will also be deleted.";

const initialCloudPicker = {
  visible: false,
  loading: false,
  error: "",
  localPath: "",
  currentFolderId: null,
  path: [],
  items: []
};

export default function ChooseFoldersScreen({ onOpenCloud }) {
  const [status, setStatus] = useState({ loading: false, message: "", type: "info" });
  const [folders, setFolders] = useState({ loading: true, items: [], error: "" });
  const [cloudPicker, setCloudPicker] = useState(initialCloudPicker);

  async function loadFolders() {
    try {
      const data = await window.storageApi.getFolders();
      setFolders({ loading: false, items: data.folders || [], error: "" });
    } catch (error) {
      setFolders({
        loading: false,
        items: [],
        error: error?.message || "Unable to load folders."
      });
    }
  }

  useEffect(() => {
    loadFolders();
  }, []);

  async function loadCloudRoot(localPath) {
    setCloudPicker({
      visible: true,
      loading: true,
      error: "",
      localPath,
      currentFolderId: null,
      path: [],
      items: []
    });
    try {
      const data = await window.storageApi.getStorageRoot({});
      const mapped = await window.storageApi.getMappedOnlineFolder?.(localPath);
      if (mapped?.remote_id) {
        const mappedData = await window.storageApi.getStorageFolder({ folderId: mapped.remote_id });
        setCloudPicker({
          visible: true,
          loading: false,
          error: "",
          localPath,
          currentFolderId: mapped.remote_id,
          path: [{ id: mapped.remote_id, name: "Mapped Folder" }],
          items: mappedData.items || []
        });
        return;
      }
      setCloudPicker({
        visible: true,
        loading: false,
        error: "",
        localPath,
        currentFolderId: data.folder_id || null,
        path: [],
        items: data.items || []
      });
    } catch (error) {
      setCloudPicker((prev) => ({
        ...prev,
        loading: false,
        error: error?.message || "Unable to load cloud folders."
      }));
    }
  }

  async function loadCloudFolder(folderId, nextPath) {
    if (!folderId) {
      return;
    }
    setCloudPicker((prev) => ({ ...prev, loading: true, error: "" }));
    try {
      const data = await window.storageApi.getStorageFolder({ folderId });
      setCloudPicker((prev) => ({
        ...prev,
        loading: false,
        error: "",
        currentFolderId: data.folder_id || folderId,
        path: nextPath,
        items: data.items || []
      }));
    } catch (error) {
      setCloudPicker((prev) => ({
        ...prev,
        loading: false,
        error: error?.message || "Unable to open cloud folder."
      }));
    }
  }

  async function handleChoose() {
    setStatus({ loading: true, message: "", type: "info" });
    try {
      const result = await window.storageApi.chooseFolders();
      setStatus({ loading: false, message: result?.message || "Folders updated.", type: "success" });
      await loadFolders();
    } catch (error) {
      setStatus({
        loading: false,
        message: error?.message || "Unable to add folders.",
        type: "error"
      });
    }
  }

  async function handleRemove(path) {
    const confirmed = window.confirm(confirmMessage);
    if (!confirmed) {
      return;
    }

    setStatus({ loading: true, message: "Removing folder and cloud data...", type: "info" });
    try {
      const result = await window.storageApi.removeFolder(path);
      if (!result?.ok) {
        throw new Error(result?.error || "Unable to remove folder.");
      }
      setStatus({ loading: false, message: "Folder removed from sync and cloud storage.", type: "success" });
      setCloudPicker((prev) => (prev.localPath === path ? initialCloudPicker : prev));
      await loadFolders();
    } catch (error) {
      setStatus({
        loading: false,
        message: error?.message || "Unable to remove folder.",
        type: "error"
      });
    }
  }

  async function handleMapFolderToCloud(remoteFolderId) {
    if (!cloudPicker.localPath || !remoteFolderId) {
      return;
    }
    setStatus({ loading: true, message: "Saving sync mapping...", type: "info" });
    try {
      await window.storageApi.mapFolderToOnline({
        localPath: cloudPicker.localPath,
        remoteId: remoteFolderId
      });
      setStatus({ loading: false, message: "Online folder selected for sync.", type: "success" });
    } catch (error) {
      setStatus({
        loading: false,
        message: error?.message || "Unable to save sync mapping.",
        type: "error"
      });
    }
  }

  const cloudFolders = useMemo(
    () => (cloudPicker.items || []).filter((item) => item.type === "folder"),
    [cloudPicker.items]
  );

  return (
    <div className="screen">
      <div className="screen-header">
        <h2>Choose Local Folders</h2>
        <p className="text-muted">Manage local sync folders. Cloud file browsing is handled in File Storage.</p>
      </div>
      <div className="card">
        <div className="button-row">
          <button type="button" className="btn btn-primary" onClick={handleChoose} disabled={status.loading}>
            {status.loading ? "Opening..." : "Select Folders"}
          </button>
          <button type="button" className="btn btn-secondary" onClick={() => onOpenCloud?.()}>
            Open File Storage
          </button>
          <button type="button" className="btn btn-secondary" onClick={loadFolders}>
            Refresh
          </button>
        </div>
        {status.message ? (
          <div
            className={
              status.type === "error"
                ? "alert alert-danger mt-2"
                : status.type === "success"
                  ? "alert alert-success mt-2"
                  : "text-muted mt-2"
            }
          >
            {status.message}
          </div>
        ) : null}
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
                  <tr key={item.path}>
                    <td>{item.name}</td>
                    <td>
                      <button
                        type="button"
                        className="item-link text-muted"
                        onClick={() => loadCloudRoot(item.path)}
                        title="Open related cloud folder preview"
                      >
                        {item.path}
                      </button>
                    </td>
                    <td>
                      <div className="button-row" style={{ marginTop: 0 }}>
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          onClick={() => loadCloudRoot(item.path)}
                          disabled={status.loading}
                        >
                          Select Online Folder
                        </button>
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          onClick={() => handleRemove(item.path)}
                          disabled={status.loading}
                        >
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

        {cloudPicker.visible ? (
          <div className="card mt-3">
            <div className="row">
              <div>
                <div className="list-title">Online Folder Sync</div>
                <div className="list-subtitle">Local path: {cloudPicker.localPath || "-"}</div>
              </div>
              <div className="button-row" style={{ marginTop: 0 }}>
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => setCloudPicker(initialCloudPicker)}>
                  Close
                </button>
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => handleMapFolderToCloud(cloudPicker.currentFolderId)}>
                  Select Current Folder
                </button>
              </div>
            </div>

            <div className="file-location mt-2">
              <button type="button" className="breadcrumb-link" onClick={() => loadCloudRoot(cloudPicker.localPath)}>
                Root
              </button>
              {cloudPicker.path.map((entry, index) => (
                <div className="breadcrumb-item" key={entry.id}>
                  <span className="breadcrumb-sep">/</span>
                  <button
                    type="button"
                    className="breadcrumb-link"
                    onClick={() => loadCloudFolder(entry.id, cloudPicker.path.slice(0, index + 1))}
                  >
                    {entry.name}
                  </button>
                </div>
              ))}
            </div>

            {cloudPicker.error ? <div className="alert alert-danger mt-2">{cloudPicker.error}</div> : null}
            {cloudPicker.loading ? (
              <div className="text-muted mt-2">Loading cloud folders...</div>
            ) : cloudFolders.length ? (
              <div className="table-wrap mt-3">
                <table className="table-ui">
                  <thead>
                    <tr>
                      <th>Folder</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cloudFolders.map((item) => (
                      <tr key={item.id}>
                        <td>📁 {item.name}</td>
                        <td>
                          <div className="button-row" style={{ marginTop: 0 }}>
                            <button
                              type="button"
                              className="btn btn-secondary btn-sm"
                              onClick={() => loadCloudFolder(item.id, [...cloudPicker.path, { id: item.id, name: item.name }])}
                            >
                              Open
                            </button>
                            <button
                              type="button"
                              className="btn btn-secondary btn-sm"
                              onClick={() => handleMapFolderToCloud(item.id)}
                            >
                              Select
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="text-muted mt-2">No cloud folders found in this location.</div>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}
