import { useEffect, useState } from "react";

export default function SyncStatusScreen() {
  const [state, setState] = useState({ loading: true, data: null, error: "" });

  async function load() {
    try {
      const data = await window.storageApi.getSyncStatus();
      setState({ loading: false, data, error: "" });
    } catch (error) {
      setState({ loading: false, data: null, error: error?.message || "Unable to load sync status." });
    }
  }

  useEffect(() => {
    load();
    const interval = setInterval(load, 5000);
    return () => clearInterval(interval);
  }, []);

  if (state.loading) {
    return <div className="panel">Loading sync status...</div>;
  }

  if (state.error) {
    return <div className="alert alert-danger">{state.error}</div>;
  }

  const data = state.data || {};
  const status = String(data.status || "").toLowerCase();
  const isStopped = status === "stopped" || !status;
  const isPaused = status === "paused";

  return (
    <div className="screen">
      <div className="screen-header">
        <h2>Sync Status</h2>
        <p className="text-muted">Live view of the sync engine.</p>
      </div>
      <div className="card">
        <div className="row">
          <div>
            <div className="card-title">Status</div>
            <div className="card-value">{data.status || "Paused"}</div>
            <div className="card-muted">Last sync: {data.last_sync || "-"}</div>
            <div className="card-muted">Queue: {data.queue_size ?? 0}</div>
          </div>
          <div>
            <div className="card-title">Network</div>
            <div className="card-value">{data.network || "Unknown"}</div>
            <div className="card-muted">Retry: {data.retry_in || "-"}</div>
            <div className="card-muted">Active uploads: {data.active_uploads ?? 0}</div>
          </div>
        </div>
      </div>
      <div className="button-row">
        {isStopped ? (
          <button
            type="button"
            className="btn btn-primary"
            onClick={async () => {
              await window.storageApi.startSync();
              await load();
            }}
          >
            Start Sync
          </button>
        ) : null}
        {!isStopped ? (
          <button
            type="button"
            className={`btn ${isPaused ? "btn-primary" : "btn-secondary"}`}
            onClick={async () => {
              await window.storageApi.resumeSync();
              await load();
            }}
          >
            Resume Sync
          </button>
        ) : null}
        <button
          type="button"
          className={`btn ${isStopped ? "btn-secondary" : "btn-secondary"}`}
          onClick={async () => {
            await window.storageApi.pauseSync();
            await load();
          }}
        >
          Pause Sync
        </button>
      </div>
    </div>
  );
}
