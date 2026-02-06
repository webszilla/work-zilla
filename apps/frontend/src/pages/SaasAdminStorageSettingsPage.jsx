import { useEffect, useState } from "react";
import { apiFetch } from "../lib/api.js";
import MediaLibraryPage from "./MediaLibraryPage.jsx";

const emptyState = {
  loading: true,
  error: "",
  saving: false,
  storage_mode: "local",
  endpoint_url: "",
  bucket_name: "",
  access_key_id: "",
  secret_access_key: "",
  region_name: "",
  base_path: "",
  updated_at: "",
  has_secret_access_key: false
};

export default function SaasAdminStorageSettingsPage() {
  const [state, setState] = useState(emptyState);
  const [notice, setNotice] = useState("");
  const [pullNotice, setPullNotice] = useState("");
  const [pullJobId, setPullJobId] = useState("");
  const [pullStatus, setPullStatus] = useState(null);
  const [pullOpen, setPullOpen] = useState(false);
  const [confirmModal, setConfirmModal] = useState({ open: false, message: "", resolve: null });

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const data = await apiFetch("/api/saas-admin/settings/media-storage");
        if (!active) {
          return;
        }
        setState((prev) => ({
          ...prev,
          loading: false,
          error: "",
          storage_mode: data.storage_mode || "local",
          endpoint_url: data.endpoint_url || "",
          bucket_name: data.bucket_name || "",
          access_key_id: data.access_key_id || "",
          region_name: data.region_name || "",
          base_path: data.base_path || "",
          updated_at: data.updated_at || "",
          has_secret_access_key: Boolean(data.has_secret_access_key)
        }));
      } catch (err) {
        if (!active) {
          return;
        }
        setState((prev) => ({
          ...prev,
          loading: false,
          error: err?.message || "Unable to load storage settings."
        }));
      }
    };
    load();
    return () => {
      active = false;
    };
  }, []);


  const onChange = (field) => (event) => {
    const value = event.target.value;
    setState((prev) => ({ ...prev, [field]: value }));
  };

  const onSave = async () => {
    setNotice("");
    setPullNotice("");
    setState((prev) => ({ ...prev, saving: true, error: "" }));
    try {
      const payload = {
        storage_mode: state.storage_mode,
        endpoint_url: state.endpoint_url,
        bucket_name: state.bucket_name,
        access_key_id: state.access_key_id,
        secret_access_key: state.secret_access_key,
        region_name: state.region_name,
        base_path: state.base_path
      };
      const data = await apiFetch("/api/saas-admin/settings/media-storage", {
        method: "PUT",
        body: JSON.stringify(payload)
      });
      setState((prev) => ({
        ...prev,
        saving: false,
        error: "",
        secret_access_key: "",
        updated_at: data.updated_at || prev.updated_at,
        has_secret_access_key: Boolean(data.has_secret_access_key)
      }));
      setNotice("Storage settings saved.");
    } catch (err) {
      setState((prev) => ({
        ...prev,
        saving: false,
        error: err?.message || "Unable to save."
      }));
    }
  };

  const askConfirm = (message) =>
    new Promise((resolve) => {
      setConfirmModal({ open: true, message, resolve });
    });

  const closeConfirm = (result) => {
    setConfirmModal((prev) => {
      if (prev.resolve) {
        prev.resolve(result);
      }
      return { open: false, message: "", resolve: null };
    });
  };

  useEffect(() => {
    if (!pullJobId) {
      return undefined;
    }
    let active = true;
    const poll = async () => {
      try {
        const data = await apiFetch(`/api/saas-admin/settings/media-storage/pull-local/status/${pullJobId}`);
        if (!active) {
          return;
        }
        setPullStatus((prev) => {
          if (!prev) return data;
          if (!data.total_files && prev.total_files) {
            return { ...data, total_files: prev.total_files };
          }
          return data;
        });
        if (data.status === "completed" || data.status === "failed") {
          setPullJobId("");
        }
      } catch (err) {
        if (!active) {
          return;
        }
        setPullStatus((prev) => ({
          ...(prev || {}),
          status: "failed",
          error_message: err?.message || "Unable to load status."
        }));
        setPullJobId("");
      }
    };
    poll();
    const timer = setInterval(poll, 1500);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [pullJobId]);

  const onPullLocal = async () => {
    setNotice("");
    setPullNotice("");
    if (state.storage_mode !== "object") {
      setPullNotice("Switch to Online Object Storage before pulling local files.");
      return;
    }
    try {
      const preview = await apiFetch("/api/saas-admin/settings/media-storage/pull-local/preview", {
        method: "POST",
        body: JSON.stringify({})
      });
      if (!preview.total) {
        setPullNotice("No local files found to pull.");
        return;
      }
      let overwrite = false;
      if (preview.partial) {
        const confirmPartial = await askConfirm(
          `Validated only ${preview.checked} files out of ${preview.total}. Continue with pull?`
        );
        if (!confirmPartial) {
          return;
        }
      }
      if (preview.existing) {
        const confirmOverwrite = await askConfirm(
          `Found ${preview.existing} files already in object storage. Pull again and overwrite?`
        );
        if (!confirmOverwrite) {
          return;
        }
        overwrite = true;
      }
      const deleteLocal = await askConfirm("Delete local media files after successful pull?");
      const start = await apiFetch("/api/saas-admin/settings/media-storage/pull-local/start", {
        method: "POST",
        body: JSON.stringify({
          overwrite,
          delete_local: deleteLocal
        })
      });
      setPullStatus({
        status: "pending",
        total_files: preview.total || 0,
        existing_files: preview.existing || 0,
        copied_files: 0,
        skipped_files: 0,
        file_type_counts: {},
        current_path: ""
      });
      setPullOpen(true);
      setPullJobId(start.job_id || "");
    } catch (err) {
      setPullNotice(err?.message || "Unable to pull local files.");
    }
  };

  const isObjectStorage = state.storage_mode === "object";

  return (
    <div className="page-shell">
      <div className="card p-4">
        <div className="d-flex align-items-start justify-content-between gap-3 flex-wrap">
          <div>
            <h3 className="mb-1">Media Storage</h3>
            <p className="text-secondary mb-0">
              Global storage mode for all products and organizations.
            </p>
            {state.updated_at ? (
              <div className="text-secondary small mt-2">Last updated: {state.updated_at}</div>
            ) : null}
          </div>
        </div>

        {state.error ? <div className="alert alert-danger mt-3">{state.error}</div> : null}
        {notice ? <div className="alert alert-success mt-3">{notice}</div> : null}
        {pullNotice ? <div className="alert alert-info mt-3">{pullNotice}</div> : null}

        <div className="row g-3 mt-2">
          <div className="col-12 col-md-6 col-xl-3">
            <label className="form-label">Storage Mode</label>
            <select
              className="form-select"
              value={state.storage_mode}
              onChange={onChange("storage_mode")}
            >
              <option value="local">Local (server disk)</option>
              <option value="object">Online Object Storage (Backblaze/S3)</option>
            </select>
            <div className="text-secondary small mt-1">
              Local stores screenshots inside the server. Object storage pushes files to S3-compatible buckets.
            </div>
          </div>

          {isObjectStorage ? (
            <>
              <div className="col-12 col-md-6 col-xl-3">
                <label className="form-label">Endpoint URL</label>
                <input
                  type="text"
                  className="form-control"
                  placeholder="https://s3.us-west-004.backblazeb2.com"
                  value={state.endpoint_url}
                  onChange={onChange("endpoint_url")}
                />
                <div className="text-secondary small mt-1">Backblaze B2 or other S3 endpoint.</div>
              </div>
              <div className="col-12 col-md-6 col-xl-3">
                <label className="form-label">Bucket Name</label>
                <input
                  type="text"
                  className="form-control"
                  value={state.bucket_name}
                  onChange={onChange("bucket_name")}
                />
              </div>
              <div className="col-12 col-md-6 col-xl-3">
                <label className="form-label">Access Key ID</label>
                <input
                  type="text"
                  className="form-control"
                  value={state.access_key_id}
                  onChange={onChange("access_key_id")}
                />
              </div>
              <div className="col-12 col-md-6 col-xl-3">
                <label className="form-label">Secret Access Key</label>
                <input
                  type="password"
                  className="form-control"
                  placeholder={state.has_secret_access_key ? "Stored (leave blank to keep)" : ""}
                  value={state.secret_access_key}
                  onChange={onChange("secret_access_key")}
                />
              </div>
              <div className="col-12 col-md-6 col-xl-3">
                <label className="form-label">Region</label>
                <input
                  type="text"
                  className="form-control"
                  placeholder="us-west-004"
                  value={state.region_name}
                  onChange={onChange("region_name")}
                />
              </div>
              <div className="col-12 col-md-6 col-xl-3">
              <label className="form-label">Base Path (Optional prefix inside the bucket)</label>
              <input
                type="text"
                className="form-control"
                placeholder="screenshots/"
                value={state.base_path}
                onChange={onChange("base_path")}
              />
            </div>
            </>
          ) : null}

          <div className="col-12 col-md-6 col-xl-3 d-flex align-items-end gap-2">
            <button
              type="button"
              className="btn btn-success"
              onClick={onSave}
              disabled={state.saving}
            >
              {state.saving ? "Saving..." : "Save Data"}
            </button>
            <button
              type="button"
              className="btn btn-outline-light"
              onClick={onPullLocal}
              disabled={state.saving}
            >
              Pull Local Media
            </button>
          </div>
        </div>
      </div>
      {pullOpen && pullStatus ? (
        <div className="card p-3 mt-3">
          <div className="d-flex align-items-start justify-content-between gap-3 flex-wrap">
            <div>
              <h5 className="mb-1">Pulling Local Media</h5>
              <div className="text-secondary">
                {pullStatus.status === "failed"
                  ? "Failed to pull files."
                  : pullStatus.status === "completed"
                    ? "Pull completed."
                    : "Transfer in progress..."}
              </div>
              {pullStatus.finished_at ? (
                <div className="text-secondary small mt-1">Completed at: {pullStatus.finished_at}</div>
              ) : null}
            </div>
            <button type="button" className="btn btn-outline-light btn-sm" onClick={() => setPullOpen(false)}>
              Close
            </button>
          </div>
          <div className="mt-3">
            <div className="mb-2">
              <strong>{(pullStatus.copied_files || 0) + (pullStatus.skipped_files || 0)}</strong> /{" "}
              <strong>{pullStatus.total_files || 0}</strong> files processed
            </div>
            <div className="progress mb-2" style={{ height: "8px" }}>
              <div
                className="progress-bar bg-success"
                style={{
                  width:
                    pullStatus.total_files
                      ? `${Math.min(100, Math.round((((pullStatus.copied_files || 0) + (pullStatus.skipped_files || 0)) / pullStatus.total_files) * 100))}%`
                      : "0%"
                }}
              />
            </div>
            <div className="text-secondary small">
              Current: {pullStatus.current_path || "-"}
            </div>
            <div className="text-secondary small mt-1">
              Uploaded: {pullStatus.copied_files || 0} | Skipped: {pullStatus.skipped_files || 0}
            </div>
            {pullStatus.status === "completed" ? (
              <div className="text-secondary small mt-2">
                {Object.keys(pullStatus.file_type_counts || {}).length
                  ? Object.entries(pullStatus.file_type_counts).map(([ext, count]) => (
                      <span key={ext} className="me-2">
                        {ext.toUpperCase()} {count} files
                      </span>
                    ))
                  : null}
                {pullStatus.copied_files
                  ? `Total ${pullStatus.copied_files} media updated`
                  : null}
              </div>
            ) : null}
            {pullStatus.error_message ? (
              <div className="alert alert-danger mt-2">{pullStatus.error_message}</div>
            ) : null}
          </div>
        </div>
      ) : null}
      <div className="mt-4">
        <MediaLibraryPage scope="saas" embedded hideTabs initialCategory="screenshots" showTabs={false} />
      </div>
      {confirmModal.open ? (
        <div className="modal-overlay" onClick={() => closeConfirm(false)}>
          <div className="modal-panel" onClick={(event) => event.stopPropagation()}>
            <h5>Confirm</h5>
            <div className="text-secondary mb-3">{confirmModal.message}</div>
            <div className="d-flex justify-content-end gap-2">
              <button type="button" className="btn btn-outline-light" onClick={() => closeConfirm(false)}>
                Cancel
              </button>
              <button type="button" className="btn btn-success" onClick={() => closeConfirm(true)}>
                OK
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
