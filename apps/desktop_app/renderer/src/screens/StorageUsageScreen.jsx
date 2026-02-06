import { useEffect, useState } from "react";

export default function StorageUsageScreen() {
  const [state, setState] = useState({ loading: true, data: null, error: "" });

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const data = await window.storageApi.getStorageUsage();
        if (!active) {
          return;
        }
        setState({ loading: false, data, error: "" });
      } catch (error) {
        if (!active) {
          return;
        }
        setState({ loading: false, data: null, error: error?.message || "Unable to load storage usage." });
      }
    }
    load();
    return () => {
      active = false;
    };
  }, []);

  if (state.loading) {
    return <div className="panel">Loading storage usage...</div>;
  }

  if (state.error) {
    return <div className="alert alert-danger">{state.error}</div>;
  }

  const data = state.data || {};

  return (
    <div className="screen">
      <div className="screen-header">
        <h2>Storage Used / Remaining</h2>
        <p className="text-muted">Organization storage visibility.</p>
      </div>
      <div className="card">
        <div className="row">
          <div>
            <div className="card-title">Used</div>
            <div className="card-value">{data.used || "0 GB"}</div>
            <div className="card-muted">{data.used_percent || 0}% used</div>
          </div>
          <div>
            <div className="card-title">Remaining</div>
            <div className="card-value">{data.remaining || "-"}</div>
            <div className="card-muted">Limit: {data.total || "-"}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
