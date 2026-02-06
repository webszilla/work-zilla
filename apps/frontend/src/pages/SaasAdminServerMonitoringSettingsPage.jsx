import { useEffect, useState } from "react";
import { apiFetch } from "../lib/api.js";

const emptyState = {
  loading: true,
  error: "",
  saving: false,
  enabled: true,
  heartbeat_expected_seconds: 30,
  down_after_minutes: 3,
  cpu_threshold: 85,
  ram_threshold: 90,
  disk_threshold: 90,
  breach_minutes: 5,
  email_enabled: true,
  alert_emails: "",
  retention_days_metrics: 30
};

export default function SaasAdminServerMonitoringSettingsPage() {
  const [state, setState] = useState(emptyState);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let active = true;
    async function loadSettings() {
      try {
        const data = await apiFetch("/api/monitoring/settings");
        if (!active) {
          return;
        }
        setState({
          loading: false,
          error: "",
          saving: false,
          enabled: Boolean(data.enabled),
          heartbeat_expected_seconds: data.heartbeat_expected_seconds ?? 30,
          down_after_minutes: data.down_after_minutes ?? 3,
          cpu_threshold: data.cpu_threshold ?? 85,
          ram_threshold: data.ram_threshold ?? 90,
          disk_threshold: data.disk_threshold ?? 90,
          breach_minutes: data.breach_minutes ?? 5,
          email_enabled: Boolean(data.email_enabled),
          alert_emails: (data.alert_emails || []).join(", "),
          retention_days_metrics: data.retention_days_metrics ?? 30
        });
      } catch (error) {
        if (!active) {
          return;
        }
        setState((prev) => ({
          ...prev,
          loading: false,
          error: error?.message || "Unable to load settings."
        }));
      }
    }
    loadSettings();
    return () => {
      active = false;
    };
  }, []);

  const onChange = (field) => (event) => {
    const value = event.target.type === "checkbox" ? event.target.checked : event.target.value;
    setState((prev) => ({ ...prev, [field]: value }));
  };

  const onSave = async () => {
    setNotice("");
    setState((prev) => ({ ...prev, saving: true, error: "" }));
    try {
      const payload = {
        enabled: state.enabled,
        heartbeat_expected_seconds: Number(state.heartbeat_expected_seconds),
        down_after_minutes: Number(state.down_after_minutes),
        cpu_threshold: Number(state.cpu_threshold),
        ram_threshold: Number(state.ram_threshold),
        disk_threshold: Number(state.disk_threshold),
        breach_minutes: Number(state.breach_minutes),
        email_enabled: state.email_enabled,
        alert_emails: state.alert_emails
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean),
        retention_days_metrics: Number(state.retention_days_metrics)
      };
      const data = await apiFetch("/api/monitoring/settings", {
        method: "POST",
        body: JSON.stringify(payload)
      });
      setState((prev) => ({
        ...prev,
        saving: false,
        error: "",
        alert_emails: (data.alert_emails || []).join(", ")
      }));
      setNotice("Settings saved.");
    } catch (error) {
      setState((prev) => ({
        ...prev,
        saving: false,
        error: error?.message || "Unable to save settings."
      }));
    }
  };

  if (state.loading) {
    return (
      <div className="card p-4 text-center">
        <div className="spinner" />
        <p className="mb-0">Loading settings...</p>
      </div>
    );
  }

  return (
    <div className="card p-4">
      <div className="d-flex align-items-center justify-content-between gap-2 flex-wrap">
        <div>
          <h3 className="mb-1">Server Monitoring Settings</h3>
          <p className="text-secondary mb-0">Thresholds, heartbeat, and notifications.</p>
        </div>
      </div>

      {state.error ? <div className="alert alert-danger mt-3">{state.error}</div> : null}
      {notice ? <div className="alert alert-success mt-3">{notice}</div> : null}

      <div className="row g-3 mt-2">
        <div className="col-12 col-md-6 col-xl-3">
          <label className="form-label">Heartbeat Expected (seconds)</label>
          <input
            type="number"
            className="form-control"
            value={state.heartbeat_expected_seconds}
            onChange={onChange("heartbeat_expected_seconds")}
          />
        </div>

        <div className="col-12 col-md-6 col-xl-3">
          <label className="form-label">Down After (minutes)</label>
          <input
            type="number"
            className="form-control"
            value={state.down_after_minutes}
            onChange={onChange("down_after_minutes")}
          />
        </div>

        <div className="col-12 col-md-6 col-xl-3">
          <label className="form-label">Breach Window (minutes)</label>
          <input
            type="number"
            className="form-control"
            value={state.breach_minutes}
            onChange={onChange("breach_minutes")}
          />
        </div>

        <div className="col-12 col-md-6 col-xl-3">
          <label className="form-label">CPU Threshold</label>
          <input
            type="number"
            className="form-control"
            value={state.cpu_threshold}
            onChange={onChange("cpu_threshold")}
          />
        </div>
        <div className="col-12 col-md-6 col-xl-3">
          <label className="form-label">RAM Threshold</label>
          <input
            type="number"
            className="form-control"
            value={state.ram_threshold}
            onChange={onChange("ram_threshold")}
          />
        </div>
        <div className="col-12 col-md-6 col-xl-3">
          <label className="form-label">Disk Threshold</label>
          <input
            type="number"
            className="form-control"
            value={state.disk_threshold}
            onChange={onChange("disk_threshold")}
          />
        </div>

        <div className="col-12 col-md-6 col-xl-3">
          <label className="form-label">Retention (days)</label>
          <input
            type="number"
            className="form-control"
            value={state.retention_days_metrics}
            onChange={onChange("retention_days_metrics")}
          />
        </div>

        <div className="col-12 col-md-6 col-xl-3">
          <label className="form-label">Alert Emails</label>
          <input
            type="text"
            className="form-control"
            placeholder="ops@company.com, admin@company.com"
            value={state.alert_emails}
            onChange={onChange("alert_emails")}
          />
        </div>

        <div className="col-12 col-md-6 col-xl-3">
          <label className="form-label">Email Alerts</label>
          <div className="form-check">
            <input
              type="checkbox"
              className="form-check-input"
              checked={state.email_enabled}
              onChange={onChange("email_enabled")}
              id="monitoring-email"
            />
            <label className="form-check-label" htmlFor="monitoring-email">
              Send email alerts
            </label>
          </div>
        </div>

        <div className="col-12 col-md-6 col-xl-3">
          <label className="form-label">Enabled</label>
          <div className="form-check">
            <input
              type="checkbox"
              className="form-check-input"
              checked={state.enabled}
              onChange={onChange("enabled")}
              id="monitoring-enabled-bottom"
            />
            <label className="form-check-label" htmlFor="monitoring-enabled-bottom">
              Monitoring Enabled
            </label>
          </div>
        </div>

        <div className="col-12 col-md-6 col-xl-3 d-flex align-items-end">
          <button
            type="button"
            className="btn btn-success"
            onClick={onSave}
            disabled={state.saving}
          >
            {state.saving ? "Saving..." : "Data Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
