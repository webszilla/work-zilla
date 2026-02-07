import { useEffect, useState } from "react";

export default function ChooseFoldersScreen() {
  const [status, setStatus] = useState({ loading: false, message: "", type: "info" });
  const [folders, setFolders] = useState({ loading: true, items: [], error: "" });

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
    const confirmed = window.confirm("Remove this folder from local sync?");
    if (!confirmed) return;

    setStatus({ loading: true, message: "Removing folder...", type: "info" });
    try {
      await window.storageApi.removeFolder(path);
      setStatus({ loading: false, message: "Folder removed from sync.", type: "success" });
      await loadFolders();
    } catch (error) {
      setStatus({
        loading: false,
        message: error?.message || "Unable to remove folder.",
        type: "error"
      });
    }
  }

  return (
    <div className="screen">
      <div className="screen-header">
        <h2>Choose Local Folders</h2>
        <p className="text-muted">Select folders to sync to the cloud.</p>
      </div>
      <div className="card">
        <div className="button-row">
          <button type="button" className="btn btn-primary" onClick={handleChoose} disabled={status.loading}>
            {status.loading ? "Opening..." : "Select Folders"}
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
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {folders.items.map((item) => (
                  <tr key={item.path}>
                    <td>{item.name}</td>
                    <td className="text-muted">{item.path}</td>
                    <td>
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={() => handleRemove(item.path)}
                        disabled={status.loading}
                      >
                        Remove
                      </button>
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
    </div>
  );
}
