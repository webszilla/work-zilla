import { useEffect, useState } from "react";

export default function DashboardScreen() {
  const [status, setStatus] = useState({ loading: true, data: null, error: "" });

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const data = await window.storageApi.getDashboardSummary();
        if (!active) {
          return;
        }
        setStatus({ loading: false, data, error: "" });
      } catch (error) {
        if (!active) {
          return;
        }
        setStatus({ loading: false, data: null, error: error?.message || "Unable to load dashboard." });
      }
    }
    load();
    return () => {
      active = false;
    };
  }, []);

  if (status.loading) {
    return <div className="panel">Loading dashboard...</div>;
  }

  if (status.error) {
    return <div className="alert alert-danger">{status.error}</div>;
  }

  const data = status.data || {};

  return (
    <div className="screen">
      <div className="screen-header">
        <h2>Dashboard</h2>
        <p className="text-muted">Overview of sync health and storage.</p>
      </div>
      <div className="card-grid">
        <div className="card">
          <div className="card-title">Sync Status</div>
          <div className="card-value">{data.sync_status || "Paused"}</div>
          <div className="card-muted">Last sync: {data.last_sync || "-"}</div>
        </div>
        <div className="card">
          <div className="card-title">Queued Changes</div>
          <div className="card-value">{data.queue_size || 0}</div>
          <div className="card-muted">Active uploads: {data.active_uploads || 0}</div>
        </div>
        <div className="card">
          <div className="card-title">Storage Used</div>
          <div className="card-value">{data.used_storage || "0 GB"}</div>
          <div className="card-muted">Remaining: {data.remaining_storage || "-"}</div>
        </div>
      </div>
    </div>
  );
}
