import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "../lib/api.js";

const emptyState = {
  loading: true,
  error: "",
  plan: null,
  license: null,
  devices: [],
  users: [],
  activity: [],
};

function valueOrDash(value) {
  return value || "-";
}

export default function ImpositionProductDashboardPage({ isAdmin = false }) {
  const [state, setState] = useState(emptyState);
  const [message, setMessage] = useState("");

  async function loadAll() {
    setState((prev) => ({ ...prev, loading: true, error: "" }));
    try {
      const [plan, license, devices, users, activity] = await Promise.all([
        apiFetch("/api/product/plan"),
        apiFetch("/api/product/license"),
        apiFetch("/api/product/devices"),
        isAdmin ? apiFetch("/api/product/users") : Promise.resolve({ items: [] }),
        apiFetch("/api/product/activity?limit=20"),
      ]);
      setState({
        loading: false,
        error: "",
        plan,
        license,
        devices: devices.items || [],
        users: users.items || [],
        activity: activity.items || [],
      });
    } catch (error) {
      setState((prev) => ({
        ...prev,
        loading: false,
        error: error?.message || "Unable to load product dashboard.",
      }));
    }
  }

  useEffect(() => {
    loadAll();
  }, []);

  async function renameDevice(device) {
    const nextName = window.prompt("Enter new device name", device.device_name || "");
    if (!nextName || !nextName.trim()) {
      return;
    }
    setMessage("");
    try {
      await apiFetch("/api/product/devices", {
        method: "POST",
        body: JSON.stringify({
          action: "rename",
          device_id: device.device_id,
          device_name: nextName.trim(),
        }),
      });
      await loadAll();
      setMessage("Device renamed.");
    } catch (error) {
      setMessage(error?.message || "Unable to rename device.");
    }
  }

  async function deactivateDevice(device) {
    if (!window.confirm(`Deactivate ${device.device_name || device.device_id}?`)) {
      return;
    }
    setMessage("");
    try {
      await apiFetch("/api/product/devices", {
        method: "POST",
        body: JSON.stringify({
          action: "deactivate",
          device_id: device.device_id,
        }),
      });
      await loadAll();
      setMessage("Device deactivated.");
    } catch (error) {
      setMessage(error?.message || "Unable to deactivate device.");
    }
  }

  const widgets = useMemo(() => {
    const plan = state.plan || {};
    const license = state.license || {};
    const activeDevices = state.devices.filter((item) => item.status === "active").length;
    const activeUsers = state.users.filter((item) => item.status === "active").length;
    return [
      { label: "Active Plan", value: valueOrDash(plan.plan_name) },
      { label: "License Code", value: valueOrDash(license.license_code) },
      { label: "Registered Devices", value: String(activeDevices) },
      { label: "Device Limit", value: String(plan.device_limit ?? 0) },
      { label: "Active Users", value: isAdmin ? String(activeUsers) : "-" },
      { label: "Trial Days Remaining", value: String(plan.trial_days_remaining ?? 0) },
    ];
  }, [state.devices, state.license, state.plan, state.users, isAdmin]);

  return (
    <div className="container-fluid">
      <div className="d-flex align-items-center justify-content-between flex-wrap gap-2 mb-3">
        <div>
          <h2 className="page-title mb-1">Imposition Dashboard</h2>
          <div className="text-secondary">Product overview, device status, and recent activity.</div>
        </div>
        <button type="button" className="btn btn-outline-light btn-sm" onClick={loadAll}>
          Refresh
        </button>
      </div>

      {message ? <div className="alert alert-info">{message}</div> : null}
      {state.error ? <div className="alert alert-danger">{state.error}</div> : null}

      <div className="row g-3 mb-3">
        {widgets.map((item) => (
          <div className="col-12 col-md-6 col-xl-4" key={item.label}>
            <div className="card p-3 h-100">
              <div className="text-secondary small">{item.label}</div>
              <div className="fs-5 fw-semibold">{item.value}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="card p-3 mb-3">
        <div className="d-flex align-items-center justify-content-between mb-2">
          <h5 className="mb-0">Registered Devices</h5>
        </div>
        <div className="table-responsive">
          <table className="table table-dark table-striped align-middle">
            <thead>
              <tr>
                <th>Device Name</th>
                <th>Device ID</th>
                <th>OS</th>
                <th>Last Active</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {state.loading ? (
                <tr><td colSpan="6">Loading...</td></tr>
              ) : state.devices.length ? (
                state.devices.map((device) => (
                  <tr key={device.device_id}>
                    <td>{valueOrDash(device.device_name)}</td>
                    <td>{device.device_id}</td>
                    <td>{valueOrDash(device.os)}</td>
                    <td>{valueOrDash(device.last_active)}</td>
                    <td>{device.status === "active" ? "Active" : "Inactive"}</td>
                    <td className="d-flex gap-2">
                      <button
                        type="button"
                        className="btn btn-outline-light btn-sm"
                        disabled={!isAdmin}
                        onClick={() => renameDevice(device)}
                      >
                        Rename
                      </button>
                      <button
                        type="button"
                        className="btn btn-outline-danger btn-sm"
                        disabled={!isAdmin || device.status !== "active"}
                        onClick={() => deactivateDevice(device)}
                      >
                        Deactivate
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr><td colSpan="6">No devices registered.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card p-3">
        <h5 className="mb-2">Recent Activity</h5>
        <div className="table-responsive">
          <table className="table table-dark table-striped align-middle">
            <thead>
              <tr>
                <th>Event</th>
                <th>User</th>
                <th>Device</th>
                <th>Time</th>
              </tr>
            </thead>
            <tbody>
              {state.loading ? (
                <tr><td colSpan="4">Loading...</td></tr>
              ) : state.activity.length ? (
                state.activity.map((row) => (
                  <tr key={row.id}>
                    <td>{row.event_type}</td>
                    <td>{valueOrDash(row.user_name)}</td>
                    <td>{valueOrDash(row.device_name)}</td>
                    <td>{valueOrDash(row.created_at)}</td>
                  </tr>
                ))
              ) : (
                <tr><td colSpan="4">No activity yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
