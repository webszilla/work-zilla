import { useEffect, useMemo, useState } from "react";
export default function MonitorScreen({ onBack }) {
  const [status, setStatus] = useState({ loading: true, state: "stopped", error: "" });
  const [form, setForm] = useState({ orgId: "", employeeName: "" });
  const [saving, setSaving] = useState(false);
  const [platform, setPlatform] = useState("unknown");
  const [permissions, setPermissions] = useState({ screen: "unknown", accessibility: false, needsRestart: false });
  const [support, setSupport] = useState({ supported: true, reason: "" });
  const [notice, setNotice] = useState("");
  const [bannerMessage, setBannerMessage] = useState("");
  const [showStopModal, setShowStopModal] = useState(false);
  const [stopReason, setStopReason] = useState("");
  const [stopping, setStopping] = useState(false);
  const [showPermissionModal, setShowPermissionModal] = useState(false);
  const [isMonitoring, setIsMonitoring] = useState(false);
  const [monitorStartedAt, setMonitorStartedAt] = useState("");
  const [durationLabel, setDurationLabel] = useState("");

  useEffect(() => {
    let active = true;
    async function load() {
      const response = await window.storageApi.getMonitorStatus();
      const os = window.storageApi.getPlatform ? window.storageApi.getPlatform() : "unknown";
      const supportInfo = window.storageApi.getMonitorSupport
        ? await window.storageApi.getMonitorSupport()
        : { supported: true };
      const settings = await window.storageApi.getSettings();
      if (!active) {
        return;
      }
      setPlatform(os);
      setSupport(supportInfo);
      setForm({
        orgId: settings.orgId || settings.companyKey || "",
        employeeName: settings.employeeName || ""
      });
      const running = response.status === "running" || settings.monitorRunning === true;
      setIsMonitoring(running);
      setMonitorStartedAt(settings.monitorStartedAt || "");
      if (running) {
        setBannerMessage("Work Zilla Monitor is working. You can continue using other products.");
      }
      setStatus({ loading: false, state: response.status, error: "" });
    }
    load();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!isMonitoring || !monitorStartedAt) {
      setDurationLabel("");
      return;
    }
    const startTime = Date.parse(monitorStartedAt);
    if (!Number.isFinite(startTime)) {
      setDurationLabel("");
      return;
    }
    const updateDuration = () => {
      const diffSeconds = Math.max(0, Math.floor((Date.now() - startTime) / 1000));
      const hours = Math.floor(diffSeconds / 3600);
      const minutes = Math.floor((diffSeconds % 3600) / 60);
      const seconds = diffSeconds % 60;
      if (hours) {
        setDurationLabel(`${hours}h ${minutes}m ${seconds}s`);
      } else if (minutes) {
        setDurationLabel(`${minutes}m ${seconds}s`);
      } else {
        setDurationLabel(`${seconds}s`);
      }
    };
    updateDuration();
    const handle = setInterval(updateDuration, 1000);
    return () => clearInterval(handle);
  }, [isMonitoring, monitorStartedAt]);

  useEffect(() => {
    let unsubscribe = null;
    async function refreshPermissions() {
      if (platform !== "darwin" || !window.storageApi.getMonitorPermissions) {
        return;
      }
      const perms = await window.storageApi.getMonitorPermissions();
      setPermissions(perms);
      if (support.supported && !perms.needsRestart && (perms.screen !== "granted" || !perms.accessibility)) {
        setShowPermissionModal(true);
      } else {
        setShowPermissionModal(false);
      }
    }
    if (platform === "darwin") {
      refreshPermissions();
      if (window.storageApi.onMonitorPermissionsUpdated) {
        unsubscribe = window.storageApi.onMonitorPermissionsUpdated((perms) => {
          setPermissions(perms);
          if (support.supported && !perms.needsRestart && (perms.screen !== "granted" || !perms.accessibility)) {
            setShowPermissionModal(true);
          } else {
            setShowPermissionModal(false);
          }
        });
      }
    }
    return () => {
      if (typeof unsubscribe === "function") {
        unsubscribe();
      }
    };
  }, [platform, support.supported]);

  async function startMonitoring() {
    if (!form.orgId || !form.employeeName) {
      setStatus((prev) => ({ ...prev, error: "Org ID and User Name are required." }));
      return;
    }
    setStatus((prev) => ({ ...prev, loading: true, error: "" }));
    setSaving(true);
    await window.storageApi.updateSettings({
      orgId: form.orgId,
      companyKey: form.orgId,
      employeeName: form.employeeName
    });
    setSaving(false);
    const response = await window.storageApi.startMonitor();
    if (!response.ok) {
      const message =
        response.error === "missing_profile"
          ? "Org ID and User Name are required."
          : response.error === "not_enabled"
            ? "Monitor is not enabled for this account."
            : response.error || "Unable to start.";
      setStatus({ loading: false, state: "stopped", error: message });
      return;
    }
    const startedAt = new Date().toISOString();
    await window.storageApi.updateSettings({ monitorRunning: true, monitorStartedAt: startedAt });
    setMonitorStartedAt(startedAt);
    setIsMonitoring(true);
    setNotice("Work Zilla Monitor started");
    setBannerMessage("Work Zilla Monitor is working. You can continue using other products.");
    setStatus({ loading: false, state: response.status, error: "" });
  }

  async function handleStart() {
    let currentPerms = permissions;
    if (platform === "darwin" && window.storageApi.getMonitorPermissions) {
      currentPerms = await window.storageApi.getMonitorPermissions();
      setPermissions(currentPerms);
    }
    if (
      platform === "darwin" &&
      (currentPerms.needsRestart || currentPerms.screen !== "granted" || !currentPerms.accessibility)
    ) {
      setShowPermissionModal(true);
      return;
    }
    if (platform === "darwin" && !support.supported) {
      return;
    }
    await startMonitoring();
  }

  async function handleStopConfirm() {
    if (!stopReason.trim()) {
      return;
    }
    setStopping(true);
    setStatus((prev) => ({ ...prev, loading: true, error: "" }));
    const response = await window.storageApi.stopMonitor({
      reason: stopReason.trim(),
      stopped_at: new Date().toISOString()
    });
    const settings = await window.storageApi.getSettings();
    const reasons = Array.isArray(settings.monitorStopReasons) ? settings.monitorStopReasons : [];
    const entry = { reason: stopReason.trim(), stopped_at: new Date().toISOString() };
    await window.storageApi.updateSettings({
      monitorStopReasons: [...reasons, entry],
      monitorRunning: false,
      monitorStartedAt: ""
    });
    setStopping(false);
    setStopReason("");
    setShowStopModal(false);
    setNotice("Monitoring stopped successfully");
    setBannerMessage("");
    setIsMonitoring(false);
    setMonitorStartedAt("");
    setStatus({ loading: false, state: response.status, error: "" });
  }

  const statusLabel = useMemo(() => {
    if (status.loading) {
      return "Checking...";
    }
    if (isMonitoring) {
      return "Working";
    }
    return status.state || "stopped";
  }, [status.loading, status.state, isMonitoring]);

  const formattedStart = useMemo(() => {
    if (!monitorStartedAt) {
      return "-";
    }
    const date = new Date(monitorStartedAt);
    if (!Number.isFinite(date.getTime())) {
      return "-";
    }
    return date.toLocaleString();
  }, [monitorStartedAt]);

  return (
    <div className="module-shell">
      <div className="module-header">
        <div>
          <h2>Monitor</h2>
          <p className="text-muted">Screenshot and activity tracking will run in the background.</p>
        </div>
        <button type="button" className="btn btn-secondary" onClick={onBack}>
          Back
        </button>
      </div>

      {notice ? <div className="alert alert-info">{notice}</div> : null}
      {bannerMessage ? <div className="banner banner-info">{bannerMessage}</div> : null}

      {platform === "darwin" ? (
        <div className="alert alert-info">
          {!support.supported
            ? "Monitor capture is not supported on macOS yet."
            : permissions.needsRestart
              ? "Permissions enabled. Please restart Work Zilla Agent."
              : permissions.screen === "unknown"
              ? "Click Start Monitoring to check permissions."
              : permissions.screen !== "granted"
                ? "Screen Recording permission is required to start monitoring."
                : !permissions.accessibility
                  ? "Accessibility permission is required to start monitoring."
                  : "Permissions granted. Monitoring is ready."}
        </div>
      ) : null}
      {status.error && platform !== "darwin" ? <div className="alert alert-danger">{status.error}</div> : null}

      <div className="card">
        <div className="card-title">Monitor Setup</div>
        <div className="monitor-input-row">
          <label>
            Org ID
            <input
              type="text"
              value={form.orgId}
              onChange={(event) => setForm((prev) => ({ ...prev, orgId: event.target.value }))}
              placeholder="Enter Org ID"
              required
              readOnly={platform === "darwin" || isMonitoring}
            />
          </label>
          <label>
            User Name
            <input
              type="text"
              value={form.employeeName}
              onChange={(event) => setForm((prev) => ({ ...prev, employeeName: event.target.value }))}
              placeholder="Enter user name"
              required
              readOnly={platform === "darwin" || isMonitoring}
            />
          </label>
          <div className="monitor-actions">
            <button
              className="btn btn-primary monitor-start-btn"
              type="button"
              onClick={handleStart}
              disabled={
                isMonitoring ||
                status.loading ||
                saving ||
                (platform === "darwin" &&
                  (!support.supported ||
                    permissions.needsRestart ||
                    permissions.screen !== "granted" ||
                    !permissions.accessibility))
              }
            >
              {isMonitoring ? "Working" : saving ? "Saving..." : "Start Monitoring"}
            </button>
            <button
              className="btn btn-secondary"
              type="button"
              onClick={() => setShowStopModal(true)}
              disabled={status.loading}
            >
              Stop
            </button>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="monitor-status-grid">
          <div>
            <div className="card-title">Monitor Status</div>
            <div className={`monitor-status-pill ${isMonitoring ? "running" : "stopped"}`}>{statusLabel}</div>
            <div className="card-muted">Uses your Work Zilla monitor plan and permissions.</div>
          </div>
          <div className="monitor-meta">
            <div>
              <div className="card-title">Start Date</div>
              <div className="card-value">{isMonitoring ? formattedStart : "-"}</div>
            </div>
            <div>
              <div className="card-title">Duration</div>
              <div className="card-value">{isMonitoring ? durationLabel || "-" : "-"}</div>
            </div>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-title">Data Policy</div>
        <div className="card-muted">
          Monitoring data is sent securely to your Work Zilla Admin dashboard and respects server-side permissions.
        </div>
      </div>

      {showStopModal ? (
        <div className="modal-backdrop">
          <div className="modal">
            <div className="modal-title">Stop Monitoring?</div>
            <div className="form-grid">
              <label>
                Reason for stopping
                <input
                  type="text"
                  value={stopReason}
                  onChange={(event) => setStopReason(event.target.value)}
                  placeholder="Enter reason"
                  required
                />
              </label>
            </div>
            <div className="modal-actions">
              <button
                className="btn btn-secondary"
                type="button"
                onClick={() => {
                  setShowStopModal(false);
                  setStopReason("");
                }}
              >
                Cancel
              </button>
              <button
                className="btn btn-primary"
                type="button"
                onClick={handleStopConfirm}
                disabled={stopping || !stopReason.trim()}
              >
                {stopping ? "Stopping..." : "Stop"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {showPermissionModal ? (
        <div className="modal-backdrop">
          <div className="modal">
            <div className="modal-title">Enable permissions to start monitoring</div>
            <div className="modal-actions">
              <button
                className="btn btn-secondary"
                type="button"
                onClick={() => setShowPermissionModal(false)}
              >
                Cancel
              </button>
              <button
                className="btn btn-primary"
                type="button"
                onClick={async () => {
                  await window.storageApi.openMonitorSettings();
                }}
              >
                Open System Settings
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
