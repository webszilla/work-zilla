import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { apiFetch } from "../lib/api.js";
import { formatDeviceDateTime } from "../lib/datetime.js";

const emptyState = {
  loading: true,
  error: "",
  server: null,
  metrics: []
};

const RANGE_OPTIONS = [
  { key: "1h", label: "1 Hour" },
  { key: "24h", label: "24 Hours" },
  { key: "7d", label: "7 Days" }
];

function formatDate(value) {
  return formatDeviceDateTime(value);
}

export default function SaasAdminServerMonitoringDetailPage() {
  const { serverId } = useParams();
  const [state, setState] = useState(emptyState);
  const [range, setRange] = useState("24h");

  useEffect(() => {
    let active = true;
    async function loadData() {
      try {
        const [server, metrics] = await Promise.all([
          apiFetch(`/api/monitoring/servers/${serverId}`),
          apiFetch(`/api/monitoring/servers/${serverId}/metrics?range=${range}`)
        ]);
        if (!active) {
          return;
        }
        setState({
          loading: false,
          error: "",
          server,
          metrics: metrics || []
        });
      } catch (error) {
        if (!active) {
          return;
        }
        setState({
          loading: false,
          error: error?.message || "Unable to load server details.",
          server: null,
          metrics: []
        });
      }
    }
    loadData();
    return () => {
      active = false;
    };
  }, [serverId, range]);

  const latest = useMemo(() => {
    if (!state.metrics.length) {
      return null;
    }
    return state.metrics[state.metrics.length - 1];
  }, [state.metrics]);

  if (state.loading) {
    return (
      <div className="card p-4 text-center">
        <div className="spinner" />
        <p className="mb-0">Loading server details...</p>
      </div>
    );
  }

  if (state.error) {
    return <div className="alert alert-danger">{state.error}</div>;
  }

  if (!state.server) {
    return <div className="alert alert-warning">Server not found.</div>;
  }

  return (
    <div className="card p-4">
      <div className="d-flex align-items-center justify-content-between gap-2 flex-wrap">
        <div>
          <h3 className="mb-1">{state.server.name}</h3>
          <div className="text-secondary">
            {state.server.role} • {state.server.region || "Unknown"} • {state.server.hostname || "-"}
          </div>
        </div>
        <div className="d-flex gap-2">
          <Link to="/saas-admin/server-monitoring" className="btn btn-outline-light btn-sm">
            Back
          </Link>
          <Link to="/saas-admin/server-monitoring/alerts" className="btn btn-outline-light btn-sm">
            Alerts
          </Link>
        </div>
      </div>

      <div className="row g-3 mt-3">
        <div className="col-12 col-md-4">
          <div className="card p-3 h-100 stat-card">
            <div className="stat-icon stat-icon-primary">
              <i className="bi bi-cpu" aria-hidden="true" />
            </div>
            <h6 className="mb-1">CPU %</h6>
            <div className="stat-value">{latest ? Math.round(latest.cpu_percent || 0) : 0}</div>
          </div>
        </div>
        <div className="col-12 col-md-4">
          <div className="card p-3 h-100 stat-card">
            <div className="stat-icon stat-icon-primary">
              <i className="bi bi-memory" aria-hidden="true" />
            </div>
            <h6 className="mb-1">RAM %</h6>
            <div className="stat-value">{latest ? Math.round(latest.ram_percent || 0) : 0}</div>
          </div>
        </div>
        <div className="col-12 col-md-4">
          <div className="card p-3 h-100 stat-card">
            <div className="stat-icon stat-icon-primary">
              <i className="bi bi-hdd" aria-hidden="true" />
            </div>
            <h6 className="mb-1">Disk %</h6>
            <div className="stat-value">{latest ? Math.round(latest.disk_percent || 0) : 0}</div>
          </div>
        </div>
      </div>

      <div className="d-flex align-items-center justify-content-between gap-2 mt-4 flex-wrap">
        <h5 className="mb-0">Metrics ({range})</h5>
        <select
          className="form-select"
          style={{ width: "180px" }}
          value={range}
          onChange={(event) => setRange(event.target.value)}
        >
          {RANGE_OPTIONS.map((option) => (
            <option key={option.key} value={option.key}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      <div className="table-responsive mt-3">
        <table className="table table-dark table-striped table-hover align-middle">
          <thead>
            <tr>
              <th>Time</th>
              <th>CPU %</th>
              <th>RAM %</th>
              <th>Disk %</th>
              <th>Load 1</th>
              <th>Load 5</th>
              <th>Load 15</th>
            </tr>
          </thead>
          <tbody>
            {state.metrics.length ? (
              state.metrics.map((row) => (
                <tr key={row.ts_minute}>
                  <td>{formatDate(row.ts_minute)}</td>
                  <td>{Math.round(row.cpu_percent || 0)}</td>
                  <td>{Math.round(row.ram_percent || 0)}</td>
                  <td>{Math.round(row.disk_percent || 0)}</td>
                  <td>{Math.round(row.load1 || 0)}</td>
                  <td>{Math.round(row.load5 || 0)}</td>
                  <td>{Math.round(row.load15 || 0)}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan="7">No metrics found.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
