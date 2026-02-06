import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { apiFetch } from "../lib/api.js";

const emptyState = {
  loading: true,
  error: "",
  servers: []
};

function formatDate(value) {
  if (!value) {
    return "-";
  }
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) {
    return value;
  }
  return dt.toLocaleString();
}

export default function SaasAdminServerMonitoringPage() {
  const [state, setState] = useState(emptyState);

  useEffect(() => {
    let active = true;
    async function loadServers() {
      try {
        const data = await apiFetch("/api/monitoring/servers");
        if (!active) {
          return;
        }
        setState({ loading: false, error: "", servers: data || [] });
      } catch (error) {
        if (!active) {
          return;
        }
        setState({
          loading: false,
          error: error?.message || "Unable to load servers.",
          servers: []
        });
      }
    }
    loadServers();
    return () => {
      active = false;
    };
  }, []);

  if (state.loading) {
    return (
      <div className="card p-4 text-center">
        <div className="spinner" />
        <p className="mb-0">Loading servers...</p>
      </div>
    );
  }

  if (state.error) {
    return <div className="alert alert-danger">{state.error}</div>;
  }

  return (
    <div className="card p-4">
      <div className="d-flex align-items-center justify-content-between gap-2 flex-wrap">
        <div>
          <h3 className="mb-1">Server Monitoring</h3>
          <p className="text-secondary mb-0">
            Track server health and latest resource usage.
          </p>
        </div>
        <div className="d-flex gap-2">
          <Link to="/saas-admin/server-monitoring/alerts" className="btn btn-outline-light btn-sm">
            Alerts
          </Link>
          <Link to="/saas-admin/server-monitoring/settings" className="btn btn-outline-light btn-sm">
            Settings
          </Link>
        </div>
      </div>

      <div className="table-responsive mt-3">
        <table className="table table-dark table-striped table-hover align-middle">
          <thead>
            <tr>
              <th>Name</th>
              <th>Role</th>
              <th>Region</th>
              <th>Status</th>
              <th>Last Seen</th>
              <th>CPU %</th>
              <th>RAM %</th>
              <th>Disk %</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {state.servers.length ? (
              state.servers.map((server) => (
                <tr key={server.id}>
                  <td>{server.name}</td>
                  <td>{server.role}</td>
                  <td>{server.region || "-"}</td>
                  <td>
                    <span className={`badge ${server.status === "UP" ? "bg-success" : "bg-danger"}`}>
                      {server.status}
                    </span>
                  </td>
                  <td>{formatDate(server.last_seen_at)}</td>
                  <td>{Math.round(server.cpu_percent || 0)}</td>
                  <td>{Math.round(server.ram_percent || 0)}</td>
                  <td>{Math.round(server.disk_percent || 0)}</td>
                  <td>
                    <Link to={`/saas-admin/server-monitoring/${server.id}`} className="btn btn-primary btn-sm">
                      View
                    </Link>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan="9">No servers configured.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
