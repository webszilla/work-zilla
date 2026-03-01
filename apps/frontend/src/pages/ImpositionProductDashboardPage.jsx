import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "../lib/api.js";
import ProductAccessSection from "../components/ProductAccessSection.jsx";

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

export default function ImpositionProductDashboardPage({ isAdmin = false, subscriptions = [] }) {
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
      {
        label: "Active Plan",
        value: valueOrDash(plan.plan_name),
        icon: "bi-stars",
        meta: "Current subscription tier",
      },
      {
        label: "License Code",
        value: valueOrDash(license.license_code),
        icon: "bi-patch-check",
        meta: "Activation key for installs",
      },
      {
        label: "Registered Devices",
        value: String(activeDevices),
        icon: "bi-pc-display",
        meta: `${state.devices.length} total linked`,
      },
      {
        label: "Device Limit",
        value: String(plan.device_limit ?? 0),
        icon: "bi-diagram-3",
        meta: "Max allowed under plan",
      },
      {
        label: "Active Users",
        value: isAdmin ? String(activeUsers) : "-",
        icon: "bi-people-fill",
        meta: isAdmin ? `${state.users.length} total users` : "Admin access required",
      },
      {
        label: "Trial Days Remaining",
        value: String(plan.trial_days_remaining ?? 0),
        icon: "bi-hourglass-split",
        meta: "Upgrade before trial closes",
      },
    ];
  }, [state.devices, state.license, state.plan, state.users, isAdmin]);

  return (
    <div className="container-fluid imposition-dashboard">
      <div className="imposition-dashboard__hero d-flex align-items-center justify-content-between flex-wrap gap-3 mb-4">
        <div>
          <h2 className="page-title mb-1">Imposition Dashboard</h2>
          <div className="text-secondary">Product overview, device health, license details, and recent activity.</div>
        </div>
        <button type="button" className="btn btn-outline-light btn-sm imposition-dashboard__refresh" onClick={loadAll}>
          <i className="bi bi-arrow-clockwise" aria-hidden="true" />
          <span>Refresh</span>
        </button>
      </div>

      {message ? <div className="alert alert-info">{message}</div> : null}
      {state.error ? <div className="alert alert-danger">{state.error}</div> : null}

      <div className="row g-3 mb-4">
        {widgets.map((item) => (
          <div className="col-12 col-md-6 col-lg-4 col-xl-2" key={item.label}>
            <article className="imposition-stat-card h-100">
              <div className="imposition-stat-card__icon" aria-hidden="true">
                <i className={`bi ${item.icon}`} />
              </div>
              <div className="imposition-stat-card__label">{item.label}</div>
              <div className="imposition-stat-card__value" title={item.value}>{item.value}</div>
              <div className="imposition-stat-card__meta">{item.meta}</div>
            </article>
          </div>
        ))}
      </div>

      <section className="imposition-dashboard__section mb-4">
        <div className="imposition-dashboard__section-head">
          <div>
            <h5 className="mb-1">Registered Devices</h5>
            <p className="mb-0 text-secondary">Connected imposition systems and their latest status.</p>
          </div>
          <span className="imposition-dashboard__section-badge">{state.devices.length} total</span>
        </div>
        <div className="wz-data-table-wrap imposition-dashboard__table-wrap">
          <table className="table wz-data-table imposition-dashboard__table align-middle mb-0">
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
                    <td>
                      <span className={`imposition-dashboard__status-chip ${
                        device.status === "active"
                          ? "imposition-dashboard__status-chip--active"
                          : "imposition-dashboard__status-chip--inactive"
                      }`}>
                        {device.status === "active" ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td className="table-actions">
                      <div className="d-flex flex-wrap gap-2">
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
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr><td colSpan="6">No devices registered.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="imposition-dashboard__section mb-4">
        <div className="imposition-dashboard__section-head">
          <div>
            <h5 className="mb-1">Recent Activity</h5>
            <p className="mb-0 text-secondary">Latest user and device-side actions from this product.</p>
          </div>
          <span className="imposition-dashboard__section-badge">{state.activity.length} entries</span>
        </div>
        <div className="wz-data-table-wrap imposition-dashboard__table-wrap">
          <table className="table wz-data-table imposition-dashboard__table align-middle mb-0">
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
      </section>

      <div className="imposition-dashboard__products">
        <ProductAccessSection
          subscriptions={subscriptions}
          currentProductKey="imposition-software"
        />
      </div>
    </div>
  );
}
