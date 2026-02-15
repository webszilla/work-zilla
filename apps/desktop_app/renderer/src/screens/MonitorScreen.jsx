import { useEffect, useMemo, useState } from "react";
export default function MonitorScreen({ onBack }) {
  const [status, setStatus] = useState({ loading: true, state: "stopped", error: "" });
  const [form, setForm] = useState({ orgId: "", employeeName: "" });
  const [saving, setSaving] = useState(false);
  const [platform, setPlatform] = useState("unknown");
  const [permissions, setPermissions] = useState({ screen: "unknown", accessibility: false, needsRestart: false });
  const [screenPrompted, setScreenPrompted] = useState(false);
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
        orgId: settings.companyKey || settings.orgId || "",
        employeeName: settings.employeeName || ""
      });
      let running = response.status === "running";
      if (!running && settings.monitorRunning) {
        try {
          const restart = await window.storageApi.startMonitor();
          running = restart?.ok && restart.status === "running";
          if (!running) {
            await window.storageApi.updateSettings({ monitorRunning: false, monitorStartedAt: "" });
          }
        } catch {
          await window.storageApi.updateSettings({ monitorRunning: false, monitorStartedAt: "" });
        }
      }
      setIsMonitoring(running);
      setMonitorStartedAt(settings.monitorStartedAt || "");
      if (running) {
        setBannerMessage("Work Suite monitoring is active. You can continue using other products.");
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
      if (perms.screen === "granted" && perms.accessibility && !perms.needsRestart) {
        setShowPermissionModal(false);
      }
    }
    if (platform === "darwin") {
      setScreenPrompted(false);
      refreshPermissions();
      if (window.storageApi.onMonitorPermissionsUpdated) {
        unsubscribe = window.storageApi.onMonitorPermissionsUpdated((perms) => {
          setPermissions(perms);
          setShowPermissionModal(false);
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
      setStatus((prev) => ({ ...prev, error: "Company Key and User Name are required." }));
      return;
    }
    setStatus((prev) => ({ ...prev, loading: true, error: "" }));
    setSaving(true);
    await window.storageApi.updateSettings({
      orgId: form.orgId,
      companyKey: form.orgId,
      employeeName: form.employeeName,
      employeeId: null
    });
    setSaving(false);
    const response = await window.storageApi.startMonitor();
    if (!response.ok) {
      const errorCode = String(response.error || "").toLowerCase();
      const message =
        errorCode === "missing_profile"
          ? "Company Key and User Name are required."
          : errorCode === "not_enabled"
            ? "Monitor is not enabled for this account."
            : errorCode === "relaunch_required"
              ? "Restart required to enable screen capture."
            : errorCode === "invalid company key" || errorCode === "invalid_company_key"
              ? "Invalid Company Key. Please check and try again."
              : errorCode === "company_key is required" || errorCode === "missing_company_key"
                ? "Company Key is required."
                : errorCode === "no active subscription" || errorCode === "subscription_required"
                  ? "Subscription required to start monitoring."
                  : response.error || "Unable to start.";
      setStatus({ loading: false, state: "stopped", error: message });
      return;
    }
    const startedAt = new Date().toISOString();
    await window.storageApi.updateSettings({ monitorRunning: true, monitorStartedAt: startedAt });
    setMonitorStartedAt(startedAt);
    setIsMonitoring(true);
    setNotice("Work Suite monitoring started");
    setBannerMessage("Work Suite monitoring is active. You can continue using other products.");
    setStatus({ loading: false, state: response.status, error: "" });
  }

  async function handleStart() {
    let currentPerms = permissions;
    if (platform === "darwin" && window.storageApi.getMonitorPermissions) {
      currentPerms = await window.storageApi.getMonitorPermissions();
      setPermissions(currentPerms);
    }
    if (platform === "darwin" && (currentPerms.screen !== "granted" || !currentPerms.accessibility)) {
      if (currentPerms.screen !== "granted") {
        if (!screenPrompted && window.storageApi?.requestMonitorPermissions) {
          setScreenPrompted(true);
          try {
            const requested = await window.storageApi.requestMonitorPermissions();
            setPermissions(requested);
            if (requested.screen === "granted" && requested.accessibility && !requested.needsRestart) {
              await startMonitoring();
              return;
            }
          } catch {
            // ignore permission request failures
          }
        }
      }
      setShowPermissionModal(true);
      return;
    }
    if (platform === "darwin" && currentPerms.needsRestart) {
      setStatus((prev) => ({
        ...prev,
        error: "Restart required to enable screen capture. Please restart Work Zilla Agent."
      }));
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
          <h2>Work Suite</h2>
          <p className="text-muted">Screenshot and activity tracking will run in the background.</p>
        </div>
        <button type="button" className="btn btn-secondary" onClick={onBack}>
          Back
        </button>
      </div>

      {notice ? <div className="alert alert-info">{notice}</div> : null}
      {bannerMessage ? <div className="banner banner-info">{bannerMessage}</div> : null}

      {platform === "darwin" ? (
        !support.supported ? (
          <div className="alert alert-info">Monitor capture is not supported on macOS yet.</div>
        ) : (
          <div
            className={`permission-banner ${
              permissions.screen === "granted" && permissions.accessibility ? "ok" : "warn"
            }`}
          >
            <div className="permission-banner__header">
              <div>
                <div className="permission-banner__title">Permissions</div>
                <div className="permission-banner__desc">
                  Enable Screen Recording and Accessibility to start monitoring.
                </div>
              </div>
              <div className="permission-banner__chips">
                <span className={`status-chip ${permissions.screen === "granted" ? "ok" : "warn"}`}>
                  Screen Recording: {permissions.screen === "unknown" ? "Checking" : permissions.screen === "granted" ? "Enabled" : "Not Enabled"}
                </span>
                <span className={`status-chip ${permissions.accessibility ? "ok" : "warn"}`}>
                  Accessibility: {permissions.accessibility ? "Enabled" : "Not Enabled"}
                </span>
              </div>
            </div>

            <div className="permission-banner__actions">
              {permissions.screen !== "granted" ? (
                <button
                  className="btn btn-primary"
                  type="button"
                  onClick={async () => {
                    await window.storageApi.openMonitorSettings({ target: "screen" });
                  }}
                >
                  Open Screen Recording
                </button>
              ) : null}
              {!permissions.accessibility ? (
                <button
                  className="btn btn-primary"
                  type="button"
                  onClick={async () => {
                    await window.storageApi.openMonitorSettings({ target: "accessibility" });
                  }}
                >
                  Open Accessibility
                </button>
              ) : null}
              <button
                className="btn btn-secondary"
                type="button"
                onClick={async () => {
                  if (window.storageApi?.getMonitorPermissions) {
                    const perms = await window.storageApi.getMonitorPermissions();
                    setPermissions(perms);
                    if (perms.screen === "granted" && perms.accessibility && !perms.needsRestart) {
                      setShowPermissionModal(false);
                    }
                  }
                }}
              >
                Refresh Status
              </button>
              <button
                className="btn btn-primary"
                type="button"
                onClick={async () => {
                  if (window.storageApi?.relaunchApp) {
                    await window.storageApi.relaunchApp();
                  }
                }}
                disabled={!permissions.needsRestart}
              >
                Restart Work Zilla Agent
              </button>
            </div>
          </div>
        )
      ) : null}
      {status.error ? <div className="alert alert-danger">{status.error}</div> : null}

      <div className="card monitor-card">
        <div className="card-title">Work Suite Setup</div>
        <div className="monitor-input-row">
          <label>
            Company Key
            <input
              type="text"
              value={form.orgId}
              onChange={(event) => setForm((prev) => ({ ...prev, orgId: event.target.value }))}
              placeholder="Enter company key (e.g., zilla-17)"
              required
              readOnly={isMonitoring}
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
              readOnly={isMonitoring}
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
                    permissions.screen !== "granted" ||
                    !permissions.accessibility))
              }
            >
              {isMonitoring ? "Working" : saving ? "Saving..." : "Start Monitoring"}
            </button>
            <button
              className="btn btn-secondary"
              type="button"
              onClick={() => {
                if (isMonitoring) {
                  setShowStopModal(true);
                }
              }}
              disabled={status.loading || !isMonitoring}
            >
              Stop
            </button>
          </div>
        </div>
      </div>

      <div className="card monitor-card">
        <div className="monitor-status-grid">
          <div>
            <div className="card-title">Work Suite Status</div>
            <div className={`monitor-status-pill ${isMonitoring ? "running" : "stopped"}`}>{statusLabel}</div>
            <div className="card-muted">Uses your Work Suite plan and permissions.</div>
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

      <div className="card monitor-card">
        <div className="card-title">Work Suite Data Policy</div>
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
          <div className="modal permission-modal">
            <div className="permission-modal__header">
              <div>
                <div className="modal-title">Enable Permissions</div>
                <div className="modal-subtitle">Required to start monitoring</div>
              </div>
              <div className="permission-modal__status">
                <span className={`status-chip ${permissions.screen === "granted" ? "ok" : "warn"}`}>
                  Screen Recording: {permissions.screen === "granted" ? "Enabled" : "Not Enabled"}
                </span>
                <span className={`status-chip ${permissions.accessibility ? "ok" : "warn"}`}>
                  Accessibility: {permissions.accessibility ? "Enabled" : "Not Enabled"}
                </span>
              </div>
            </div>

            <div className="permission-modal__grid">
              <div className="permission-card">
                <div className="permission-card__title">Screen Recording</div>
                <div className="permission-card__text">
                  Allow Work Zilla Agent to capture your screen for monitoring screenshots.
                </div>
                <div className="permission-card__footer">
                  <button
                    className="btn btn-primary"
                    type="button"
                    onClick={async () => {
                      await window.storageApi.openMonitorSettings({ target: "screen" });
                    }}
                  >
                    Open Screen Recording
                  </button>
                </div>
              </div>
              <div className="permission-card">
                <div className="permission-card__title">Accessibility</div>
                <div className="permission-card__text">
                  Enable accessibility so Work Zilla Agent can track activity reliably.
                </div>
                <div className="permission-card__footer">
                  <button
                    className="btn btn-primary"
                    type="button"
                    onClick={async () => {
                      await window.storageApi.openMonitorSettings({ target: "accessibility" });
                    }}
                  >
                    Open Accessibility
                  </button>
                </div>
              </div>
              <div className="permission-card permission-card--steps">
                <div className="permission-card__title">Quick Steps</div>
                <div className="permission-card__text">
                  1. Turn on Work Zilla Agent in the list.
                  <br />
                  2. Return here and click Refresh.
                  <br />
                  3. Restart the app if asked.
                </div>
                <div className="permission-card__footer">
                  <button
                    className="btn btn-secondary"
                    type="button"
                    onClick={async () => {
                      if (window.storageApi?.getMonitorPermissions) {
                        const perms = await window.storageApi.getMonitorPermissions();
                        setPermissions(perms);
                      }
                    }}
                  >
                    Refresh Status
                  </button>
                </div>
              </div>
            </div>

            <div className="modal-actions">
              <button
                className="btn btn-secondary"
                type="button"
                onClick={() => setShowPermissionModal(false)}
              >
                Close
              </button>
              <button
                className="btn btn-primary"
                type="button"
                onClick={async () => {
                  if (window.storageApi?.relaunchApp) {
                    await window.storageApi.relaunchApp();
                  }
                }}
                disabled={!permissions.needsRestart}
              >
                Restart App
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
