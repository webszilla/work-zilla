import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { apiFetch } from "../lib/api.js";
import { formatDeviceDateTime } from "../lib/datetime.js";

const emptyState = {
  loading: true,
  error: "",
  alerts: []
};

function formatDate(value) {
  return formatDeviceDateTime(value);
}

export default function SaasAdminServerMonitoringAlertsPage() {
  const [state, setState] = useState(emptyState);
  const [status, setStatus] = useState("open");

  useEffect(() => {
    let active = true;
    async function loadAlerts() {
      try {
        const data = await apiFetch(`/api/monitoring/alerts?status=${status}`);
        if (!active) {
          return;
        }
        setState({ loading: false, error: "", alerts: data || [] });
      } catch (error) {
        if (!active) {
          return;
        }
        setState({
          loading: false,
          error: error?.message || "Unable to load alerts.",
          alerts: []
        });
      }
    }
    loadAlerts();
    return () => {
      active = false;
    };
  }, [status]);

  if (state.loading) {
    return (
      <div className="card p-4 text-center">
        <div className="spinner" />
        <p className="mb-0">Loading alerts...</p>
      </div>
    );
  }

  return (
    <div className="card p-4">
      <div className="d-flex align-items-center justify-content-between gap-2 flex-wrap">
        <div>
          <h3 className="mb-1">Server Alerts</h3>
          <p className="text-secondary mb-0">Active and historical alert events.</p>
        </div>
        <div className="d-flex gap-2">
          <Link to="/saas-admin/server-monitoring" className="btn btn-outline-light btn-sm">
            Back
          </Link>
          <select
            className="form-select"
            style={{ width: "160px" }}
            value={status}
            onChange={(event) => setStatus(event.target.value)}
          >
            <option value="open">Open</option>
            <option value="closed">Closed</option>
          </select>
        </div>
      </div>

      {state.error ? <div className="alert alert-danger mt-3">{state.error}</div> : null}

      <div className="table-responsive mt-3">
        <table className="table table-dark table-striped table-hover align-middle">
          <thead>
            <tr>
              <th>Server</th>
              <th>Type</th>
              <th>Severity</th>
              <th>Started</th>
              <th>Ended</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {state.alerts.length ? (
              state.alerts.map((alert) => (
                <tr key={alert.id}>
                  <td>{alert.server_name}</td>
                  <td>{alert.type}</td>
                  <td>{alert.severity}</td>
                  <td>{formatDate(alert.started_at)}</td>
                  <td>{formatDate(alert.ended_at)}</td>
                  <td>
                    <span className={`badge ${alert.is_active ? "bg-danger" : "bg-secondary"}`}>
                      {alert.is_active ? "Open" : "Closed"}
                    </span>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan="6">No alerts.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
