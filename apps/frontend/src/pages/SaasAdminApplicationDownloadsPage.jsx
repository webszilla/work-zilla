import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { apiFetch } from "../lib/api.js";

const emptyState = {
  loading: true,
  error: "",
  items: [],
  storage_mode: "local",
  object_ready: false,
  folder_prefix: "",
  public_page_path: "",
  public_routes: []
};

function formatBytes(bytes) {
  const value = Number(bytes || 0);
  if (!value) {
    return "0 B";
  }
  const units = ["B", "KB", "MB", "GB"];
  let unitIndex = 0;
  let size = value;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }
  return `${size.toFixed(size >= 100 || unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

export default function SaasAdminApplicationDownloadsPage() {
  const [state, setState] = useState(emptyState);
  const [busyKey, setBusyKey] = useState("");
  const [notice, setNotice] = useState("");

  async function loadData() {
    setState((prev) => ({ ...prev, loading: true, error: "" }));
    try {
      const data = await apiFetch("/api/saas-admin/settings/application-downloads");
      setState({
        loading: false,
        error: "",
        items: Array.isArray(data?.items) ? data.items : [],
        storage_mode: data?.storage_mode || "local",
        object_ready: Boolean(data?.object_ready),
        folder_prefix: data?.folder_prefix || "",
        public_page_path: data?.public_page_path || "",
        public_routes: Array.isArray(data?.public_routes) ? data.public_routes : []
      });
    } catch (error) {
      setState((prev) => ({
        ...prev,
        loading: false,
        error: error?.message || "Unable to load application downloads."
      }));
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  async function handleRemove(item) {
    if (!window.confirm(`Remove ${item.filename} from Backblaze application folder?`)) {
      return;
    }
    setBusyKey(item.relative_key);
    setNotice("");
    try {
      await apiFetch("/api/saas-admin/settings/application-downloads", {
        method: "DELETE",
        body: JSON.stringify({ relative_key: item.relative_key })
      });
      setNotice(`${item.filename} removed.`);
      await loadData();
    } catch (error) {
      setNotice(error?.message || "Unable to remove file.");
    } finally {
      setBusyKey("");
    }
  }

  return (
    <>
        <div className="d-flex justify-content-between align-items-start gap-3 flex-wrap">
          <div>
            <h3 className="mb-1">Application Downloads</h3>
            <p className="text-secondary mb-1">
              Manage installer files from the Backblaze application folder.
            </p>
            <div className="small text-secondary">
              Folder: <code>{state.folder_prefix || "application-downloads/"}</code>
            </div>
            <div className="small text-secondary">
              Public page: <a href={state.public_page_path || "/downloads/application-files/"} target="_blank" rel="noreferrer">{state.public_page_path || "/downloads/application-files/"}</a>
            </div>
          </div>
          <div className="d-flex gap-2">
            <button type="button" className="btn btn-outline-light btn-sm" onClick={loadData}>
              Refresh
            </button>
            <Link to="/saas-admin" className="btn btn-outline-light btn-sm">
              Back to SaaS Admin
            </Link>
          </div>
        </div>

        {state.error ? <div className="alert alert-danger mt-3">{state.error}</div> : null}
        {notice ? <div className="alert alert-info mt-3">{notice}</div> : null}
        {!state.object_ready ? (
          <div className="alert alert-warning mt-3">
            Object storage is not ready. Configure Backblaze in Media Storage first.
          </div>
        ) : null}

        <div className="row g-3 mt-1 application-downloads__routes">
          {state.public_routes.map((route) => (
            <div className="col-12 col-md-6 col-xl-3" key={route.path}>
              <a className="card p-3 h-100 admin-feature-card" href={route.path} target="_blank" rel="noreferrer">
                <div className="stat-icon stat-icon-primary">
                  <i className="bi bi-box-arrow-up-right" aria-hidden="true" />
                </div>
                <h5 className="mb-1">{route.label}</h5>
                <p className="text-secondary mb-0">{route.path}</p>
              </a>
            </div>
          ))}
        </div>

        <div className="table-responsive mt-4">
          <table className="table table-dark table-hover align-middle mb-0">
            <thead>
              <tr>
                <th>File</th>
                <th>Product</th>
                <th>Platform</th>
                <th>Arch</th>
                <th>Size</th>
                <th>Updated</th>
                <th className="text-end">Actions</th>
              </tr>
            </thead>
            <tbody>
              {state.items.length ? state.items.map((item) => (
                <tr key={item.relative_key || item.filename}>
                  <td title={item.filename || ""}>
                    <span
                      className="d-inline-block text-truncate align-middle"
                      style={{ maxWidth: "260px" }}
                    >
                      {item.filename}
                    </span>
                  </td>
                  <td>{item.product || "-"}</td>
                  <td>{item.platform || "-"}</td>
                  <td>{item.arch || "-"}</td>
                  <td>{formatBytes(item.size_bytes)}</td>
                  <td>{item.updated_at || "-"}</td>
                  <td className="text-end">
                    <div className="d-flex justify-content-end gap-2 application-downloads__actions">
                      <a
                        className="btn btn-primary btn-sm application-downloads__action-btn"
                        href={item.download_url}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Download
                      </a>
                      <button
                        type="button"
                        className="btn btn-outline-danger btn-sm application-downloads__action-btn"
                        onClick={() => handleRemove(item)}
                        disabled={!state.object_ready || busyKey === item.relative_key}
                      >
                        {busyKey === item.relative_key ? "Removing..." : "Remove"}
                      </button>
                    </div>
                  </td>
                </tr>
              )) : (
                <tr>
                  <td colSpan="7" className="text-center text-secondary">No installer files found.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
    </>
  );
}
