import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { apiFetch } from "../lib/api.js";

const TABS = [
  { key: "system", label: "System Backup" },
  { key: "org", label: "Organization Backup" },
  { key: "restore", label: "Restore Manager" },
  { key: "scheduler", label: "Scheduler" },
  { key: "logs", label: "Logs" },
];
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function errMsg(error, fallback) {
  return error?.data?.detail || error?.message || fallback;
}

function Badge({ value }) {
  const key = String(value || "").toLowerCase();
  const cls = key.includes("complete") || key === "connected" || key === "active"
    ? "bg-success"
    : key.includes("fail") || key === "error"
      ? "bg-danger"
      : key.includes("run") || key.includes("validat")
        ? "bg-warning text-dark"
        : "bg-secondary";
  return <span className={`badge ${cls}`}>{value || "-"}</span>;
}

export default function SaasAdminSystemBackupManagerPage() {
  const [tab, setTab] = useState("system");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [dashboard, setDashboard] = useState(null);
  const [sysLogs, setSysLogs] = useState([]);
  const [orgLogs, setOrgLogs] = useState([]);
  const [restoreLogs, setRestoreLogs] = useState([]);
  const [availableBackups, setAvailableBackups] = useState([]);
  const [form, setForm] = useState({
    is_active: false,
    google_client_id: "",
    google_client_secret: "",
    google_redirect_uri: "",
    google_drive_folder_id: "",
    scheduler_enabled: false,
    schedule_frequency: "daily",
    schedule_weekday: 0,
    schedule_hour_utc: 2,
    schedule_minute_utc: 0,
    keep_last_backups: 7,
  });
  const [selectedOrgId, setSelectedOrgId] = useState("");
  const [restoreOrgId, setRestoreOrgId] = useState("");
  const [selectedBackupFile, setSelectedBackupFile] = useState("");

  const organizations = dashboard?.organizations || [];

  const loadDashboard = async (silent = false) => {
    if (silent) setRefreshing(true); else setLoading(true);
    try {
      const [dash, systemLogs, orgBackupLogs, orgRestoreLogs] = await Promise.all([
        apiFetch("/api/saas-admin/system-backup-manager/dashboard"),
        apiFetch("/api/saas-admin/system-backup-manager/logs?limit=10"),
        apiFetch("/api/saas-admin/system-backup-manager/org-backups/logs?limit=20"),
        apiFetch("/api/saas-admin/system-backup-manager/restore/logs?limit=20"),
      ]);
      setDashboard(dash);
      setSysLogs(systemLogs?.items || []);
      setOrgLogs(orgBackupLogs?.items || []);
      setRestoreLogs(orgRestoreLogs?.items || []);
      const s = dash?.settings || {};
      setForm((prev) => ({
        ...prev,
        is_active: !!s.is_active,
        google_client_id: s.google_client_id || "",
        google_client_secret: "",
        google_redirect_uri: s.google_redirect_uri || "",
        google_drive_folder_id: s.google_drive_folder_id || "",
        scheduler_enabled: !!s.scheduler_enabled,
        schedule_frequency: s.schedule_frequency || "daily",
        schedule_weekday: Number(s.schedule_weekday || 0),
        schedule_hour_utc: Number(s.schedule_hour_utc ?? 2),
        schedule_minute_utc: Number(s.schedule_minute_utc ?? 0),
        keep_last_backups: Number(s.keep_last_backups || 7),
      }));
      if (!selectedOrgId && (dash?.organizations || []).length) setSelectedOrgId(String(dash.organizations[0].id));
      if (!restoreOrgId && (dash?.organizations || []).length) setRestoreOrgId(String(dash.organizations[0].id));
      setError("");
    } catch (e) {
      setError(errMsg(e, "Unable to load backup manager."));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadDashboard(false);
    const timer = setInterval(() => loadDashboard(true), 10000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!restoreOrgId) {
      setAvailableBackups([]);
      return;
    }
    let active = true;
    apiFetch(`/api/saas-admin/system-backup-manager/restore/available?org_id=${encodeURIComponent(restoreOrgId)}`)
      .then((data) => {
        if (!active) return;
        const items = Array.isArray(data?.items) ? data.items : [];
        setAvailableBackups(items);
        if (items.length && !items.some((f) => f.id === selectedBackupFile)) {
          setSelectedBackupFile(items[0].id);
        }
      })
      .catch(() => {
        if (!active) return;
        setAvailableBackups([]);
      });
    return () => { active = false; };
  }, [restoreOrgId]);

  const onChange = (key) => (e) => {
    const v = e.target.type === "checkbox" ? e.target.checked : e.target.value;
    setForm((prev) => ({ ...prev, [key]: v }));
    setError("");
    setSuccess("");
  };

  const saveSettings = async () => {
    setSaving(true); setError(""); setSuccess("");
    try {
      await apiFetch("/api/saas-admin/settings/system-backup-manager", {
        method: "PUT",
        body: JSON.stringify({
          ...form,
          schedule_weekday: Number(form.schedule_weekday || 0),
          schedule_hour_utc: Number(form.schedule_hour_utc || 0),
          schedule_minute_utc: Number(form.schedule_minute_utc || 0),
          keep_last_backups: Number(form.keep_last_backups || 7),
        })
      });
      setSuccess("Backup settings saved.");
      await loadDashboard(true);
    } catch (e) {
      setError(errMsg(e, "Unable to save backup settings."));
    } finally {
      setSaving(false);
    }
  };

  const runSystemBackup = async () => {
    try {
      setError(""); setSuccess("");
      await apiFetch("/api/saas-admin/system-backup-manager/run", { method: "POST", body: JSON.stringify({}) });
      setSuccess("System backup queued.");
      await loadDashboard(true);
    } catch (e) {
      setError(errMsg(e, "Unable to queue system backup."));
    }
  };

  const runOrgBackup = async () => {
    if (!selectedOrgId) return;
    try {
      setError(""); setSuccess("");
      await apiFetch("/api/saas-admin/system-backup-manager/org-backups/run", {
        method: "POST",
        body: JSON.stringify({ org_id: Number(selectedOrgId) }),
      });
      setSuccess("Organization backup queued.");
      await loadDashboard(true);
    } catch (e) {
      setError(errMsg(e, "Unable to queue organization backup."));
    }
  };

  const runAllOrgBackups = async () => {
    try {
      setError(""); setSuccess("");
      await apiFetch("/api/saas-admin/system-backup-manager/org-backups/run-all", { method: "POST", body: JSON.stringify({}) });
      setSuccess("Backup All Organizations queued.");
      await loadDashboard(true);
    } catch (e) {
      setError(errMsg(e, "Unable to queue all-organization backup."));
    }
  };

  const runRestore = async () => {
    if (!restoreOrgId || !selectedBackupFile) return;
    const fileMeta = availableBackups.find((f) => f.id === selectedBackupFile);
    try {
      setError(""); setSuccess("");
      await apiFetch("/api/saas-admin/system-backup-manager/restore/run", {
        method: "POST",
        body: JSON.stringify({
          org_id: Number(restoreOrgId),
          backup_file_id: selectedBackupFile,
          backup_file_name: fileMeta?.name || "",
        }),
      });
      setSuccess("Restore job queued. Safe staged restore flow will validate before applying.");
      await loadDashboard(true);
    } catch (e) {
      setError(errMsg(e, "Unable to queue restore."));
    }
  };

  const connectGoogleDrive = async () => {
    try {
      const data = await apiFetch("/api/saas-admin/system-backup-manager/google-drive/auth-start");
      if (data?.auth_url) window.open(data.auth_url, "wzGoogleDriveConnect", "width=640,height=760");
      setSuccess("Google Drive OAuth window opened.");
    } catch (e) {
      setError(errMsg(e, "Unable to start Google Drive OAuth."));
    }
  };

  const disconnectGoogleDrive = async () => {
    try {
      await apiFetch("/api/saas-admin/system-backup-manager/google-drive/disconnect", { method: "POST", body: JSON.stringify({}) });
      setSuccess("Google Drive disconnected.");
      await loadDashboard(true);
    } catch (e) {
      setError(errMsg(e, "Unable to disconnect Google Drive."));
    }
  };

  const topStats = useMemo(() => {
    const s = dashboard?.settings || {};
    return [
      { label: "Last Backup Date", value: s.last_backup_date || "-" },
      { label: "Backup Status", value: s.last_backup_status || "never" },
      { label: "Google Drive", value: s.google_drive_connection_status || "not_connected" },
      { label: "Scheduler", value: s.scheduler_enabled ? "enabled" : "disabled" },
    ];
  }, [dashboard]);

  if (loading) {
    return <div className="card p-4 text-center"><div className="spinner" /><p className="mb-0">Loading Backup Manager...</p></div>;
  }

  return (
    <div className="page-shell">
      <div className="card p-4">
        <div className="d-flex justify-content-between align-items-start gap-2 flex-wrap">
          <div>
            <h3 className="mb-1">Backup Manager</h3>
            <p className="text-secondary mb-0">System + organization backups, restore manager, scheduler, and logs.</p>
          </div>
          <div className="d-flex gap-2">
            <button type="button" className="btn btn-outline-light btn-sm" onClick={() => loadDashboard(true)} disabled={refreshing}>{refreshing ? "Refreshing..." : "Refresh"}</button>
            <Link to="/saas-admin" className="btn btn-outline-light btn-sm">Back to Overview</Link>
          </div>
        </div>

        {error ? <div className="alert alert-danger mt-3">{error}</div> : null}
        {success ? <div className="alert alert-success mt-3">{success}</div> : null}

        <div className="row g-3 mt-2">
          {topStats.map((card) => (
            <div className="col-12 col-md-6 col-xl-3" key={card.label}>
              <div className="card p-3 h-100">
                <div className="small text-secondary">{card.label}</div>
                <div className="mt-1"><Badge value={card.value} /></div>
              </div>
            </div>
          ))}
        </div>

        <div className="d-flex flex-wrap gap-2 mt-4">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              className={`btn btn-sm ${tab === t.key ? "btn-primary" : "btn-outline-light"}`}
              onClick={() => setTab(t.key)}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === "system" ? (
          <div className="card p-3 mt-3">
            <h5 className="mb-3">System Backup</h5>
            <div className="row g-3">
              <div className="col-12 col-md-6">
                <label className="form-label">Google OAuth Client ID</label>
                <input className="form-control" value={form.google_client_id} onChange={onChange("google_client_id")} />
              </div>
              <div className="col-12 col-md-6">
                <label className="form-label">Google OAuth Client Secret</label>
                <input type="password" className="form-control" value={form.google_client_secret} onChange={onChange("google_client_secret")} placeholder={dashboard?.settings?.has_google_client_secret ? "Leave blank to keep existing" : "Paste secret"} />
              </div>
              <div className="col-12 col-md-6">
                <label className="form-label">Google Drive Folder ID</label>
                <input className="form-control" value={form.google_drive_folder_id} onChange={onChange("google_drive_folder_id")} placeholder="Optional root folder id" />
              </div>
              <div className="col-12 col-md-6">
                <label className="form-label">Enable Backup Manager</label>
                <div className="form-check form-switch mt-2">
                  <input className="form-check-input" type="checkbox" checked={!!form.is_active} onChange={onChange("is_active")} />
                  <label className="form-check-label">{form.is_active ? "Active" : "Inactive"}</label>
                </div>
              </div>
            </div>
            <div className="d-flex flex-wrap gap-2 mt-3">
              <button type="button" className="btn btn-primary btn-sm" onClick={saveSettings} disabled={saving}>{saving ? "Saving..." : "Save"}</button>
              <button type="button" className="btn btn-outline-light btn-sm" onClick={connectGoogleDrive}>Connect Google Drive</button>
              <button type="button" className="btn btn-outline-danger btn-sm" onClick={disconnectGoogleDrive} disabled={!dashboard?.settings?.google_connected}>Disconnect</button>
              <button type="button" className="btn btn-success btn-sm" onClick={runSystemBackup} disabled={dashboard?.settings?.backup_running}>Run Backup</button>
            </div>
            <div className="small text-secondary mt-2">Flow: pg_dump {"->"} zip project {"->"} upload to Google Drive {"->"} delete local temp files on success only.</div>
          </div>
        ) : null}

        {tab === "org" ? (
          <div className="card p-3 mt-3">
            <h5 className="mb-3">Organization Backup</h5>
            <div className="row g-3 align-items-end">
              <div className="col-12 col-md-6">
                <label className="form-label">Select Organization</label>
                <select className="form-select" value={selectedOrgId} onChange={(e) => setSelectedOrgId(e.target.value)}>
                  {(organizations || []).map((org) => <option key={org.id} value={org.id}>{org.name}</option>)}
                </select>
              </div>
              <div className="col-12 col-md-6 d-flex flex-wrap gap-2">
                <button type="button" className="btn btn-primary btn-sm" onClick={runOrgBackup} disabled={!selectedOrgId}>Backup Selected Organization</button>
                <button type="button" className="btn btn-outline-light btn-sm" onClick={runAllOrgBackups}>Backup All Organizations</button>
              </div>
            </div>
            <div className="small text-secondary mt-2">Temp file {"->"} Google Drive <code>/SaaSBackups/org_{"{org_id}"}/</code> {"->"} local temp delete. Server permanent storage not used.</div>
            <div className="table-responsive mt-3">
              <table className="table table-dark table-striped table-hover align-middle">
                <thead><tr><th>Org</th><th>Status</th><th>Records</th><th>Models</th><th>Drive File</th><th>Created</th><th>Completed</th><th>Message</th></tr></thead>
                <tbody>
                  {(orgLogs || []).length ? orgLogs.map((row) => (
                    <tr key={row.id}>
                      <td>{row.org_name}</td>
                      <td><Badge value={row.status} /></td>
                      <td>{row.records_exported}</td>
                      <td>{row.model_count}</td>
                      <td>{row.drive_file_name || "-"}</td>
                      <td>{row.created_at || "-"}</td>
                      <td>{row.completed_at || "-"}</td>
                      <td className="small">{row.error_message || row.message || "-"}</td>
                    </tr>
                  )) : <tr><td colSpan="8">No organization backups yet.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}

        {tab === "restore" ? (
          <div className="card p-3 mt-3">
            <h5 className="mb-3">Restore Manager</h5>
            <div className="row g-3 align-items-end">
              <div className="col-12 col-md-4">
                <label className="form-label">Select Organization</label>
                <select className="form-select" value={restoreOrgId} onChange={(e) => setRestoreOrgId(e.target.value)}>
                  {(organizations || []).map((org) => <option key={org.id} value={org.id}>{org.name}</option>)}
                </select>
              </div>
              <div className="col-12 col-md-8">
                <label className="form-label">Available Backups (Google Drive)</label>
                <select className="form-select" value={selectedBackupFile} onChange={(e) => setSelectedBackupFile(e.target.value)}>
                  {(availableBackups || []).map((f) => <option key={f.id} value={f.id}>{f.name} ({f.created_at || "-"})</option>)}
                </select>
              </div>
            </div>
            <div className="d-flex flex-wrap gap-2 mt-3">
              <button type="button" className="btn btn-primary btn-sm" onClick={runRestore} disabled={!restoreOrgId || !selectedBackupFile}>Restore Selected Backup</button>
            </div>
            <div className="small text-warning mt-2">Enterprise safe mode: downloads to temp file, stages in temp restore DB, validates schema/org/records, then restores with no-overwrite policy inside transaction.</div>
            <div className="table-responsive mt-3">
              <table className="table table-dark table-striped table-hover align-middle">
                <thead><tr><th>Org</th><th>Status</th><th>Backup File</th><th>Restored</th><th>Started</th><th>Completed</th><th>Result</th></tr></thead>
                <tbody>
                  {(restoreLogs || []).length ? restoreLogs.map((row) => (
                    <tr key={row.id}>
                      <td>{row.org_name}</td>
                      <td><Badge value={row.status} /></td>
                      <td>{row.backup_file_name || "-"}</td>
                      <td>{row.restored_records}</td>
                      <td>{row.started_at || "-"}</td>
                      <td>{row.completed_at || "-"}</td>
                      <td className="small">{row.errors || row.message || "-"}</td>
                    </tr>
                  )) : <tr><td colSpan="7">No restore jobs yet.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}

        {tab === "scheduler" ? (
          <div className="card p-3 mt-3">
            <h5 className="mb-3">Scheduler</h5>
            <div className="row g-3">
              <div className="col-12 col-md-3">
                <label className="form-label">Enable Scheduler</label>
                <div className="form-check form-switch mt-2">
                  <input className="form-check-input" type="checkbox" checked={!!form.scheduler_enabled} onChange={onChange("scheduler_enabled")} />
                  <label className="form-check-label">{form.scheduler_enabled ? "Enabled" : "Disabled"}</label>
                </div>
              </div>
              <div className="col-12 col-md-3">
                <label className="form-label">Frequency</label>
                <select className="form-select" value={form.schedule_frequency} onChange={onChange("schedule_frequency")}>
                  <option value="daily">Daily</option>
                  <option value="weekly">Weekly</option>
                </select>
              </div>
              <div className="col-12 col-md-2">
                <label className="form-label">Weekday (UTC)</label>
                <select className="form-select" value={form.schedule_weekday} onChange={onChange("schedule_weekday")} disabled={form.schedule_frequency !== "weekly"}>
                  {WEEKDAYS.map((d, i) => <option key={d} value={i}>{d}</option>)}
                </select>
              </div>
              <div className="col-6 col-md-2">
                <label className="form-label">Hour</label>
                <input type="number" min="0" max="23" className="form-control" value={form.schedule_hour_utc} onChange={onChange("schedule_hour_utc")} />
              </div>
              <div className="col-6 col-md-2">
                <label className="form-label">Minute</label>
                <input type="number" min="0" max="59" className="form-control" value={form.schedule_minute_utc} onChange={onChange("schedule_minute_utc")} />
              </div>
              <div className="col-12 col-md-3">
                <label className="form-label">Keep Last Backups</label>
                <input type="number" min="1" max="30" className="form-control" value={form.keep_last_backups} onChange={onChange("keep_last_backups")} />
              </div>
            </div>
            <div className="d-flex gap-2 mt-3">
              <button type="button" className="btn btn-primary btn-sm" onClick={saveSettings} disabled={saving}>{saving ? "Saving..." : "Save Scheduler"}</button>
            </div>
            <div className="small text-secondary mt-2">Celery Beat tick runs every 15 minutes and checks DB schedule. Requires Redis + Celery worker + Celery Beat in production.</div>
          </div>
        ) : null}

        {tab === "logs" ? (
          <div className="card p-3 mt-3">
            <h5 className="mb-3">Logs</h5>
            <h6 className="mb-2">System Backup Logs</h6>
            <div className="table-responsive">
              <table className="table table-dark table-striped table-hover align-middle">
                <thead><tr><th>Status</th><th>Trigger</th><th>Created</th><th>Completed</th><th>Files</th><th>Message</th></tr></thead>
                <tbody>
                  {(sysLogs || []).length ? sysLogs.map((row) => (
                    <tr key={row.id}>
                      <td><Badge value={row.status} /></td>
                      <td>{row.trigger}</td>
                      <td>{row.created_at}</td>
                      <td>{row.completed_at || "-"}</td>
                      <td>{row.drive_sql_file_name || row.drive_zip_file_name ? `${row.drive_sql_file_name || "SQL"} / ${row.drive_zip_file_name || "ZIP"}` : "-"}</td>
                      <td className="small">{row.error_message || row.message || "-"}</td>
                    </tr>
                  )) : <tr><td colSpan="6">No system backup logs yet.</td></tr>}
                </tbody>
              </table>
            </div>
            <div className="small text-warning mt-2">Restore logs keep temp file paths only when failures happen (for investigation). Success flow removes local temp files immediately.</div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
