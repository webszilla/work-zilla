import { Fragment, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { apiFetch } from "../lib/api.js";

const TABS = [
  { key: "system", label: "System Backup" },
  { key: "logs", label: "Logs" },
];
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const PROVIDER_TABS = [
  { key: "blackblaze", label: "Blackblaze" },
  { key: "google_drive", label: "Google Drive" },
];

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

function formatSize(bytes) {
  const n = Number(bytes || 0);
  if (!n) return "-";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function recentDays(count = 7) {
  const now = new Date();
  const items = [];
  for (let i = 0; i < count; i += 1) {
    const date = new Date(now);
    date.setDate(now.getDate() - i);
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    items.push(`${y}-${m}-${d}`);
  }
  return items;
}

export default function SaasAdminSystemBackupManagerPage() {
  const [tab, setTab] = useState("system");
  const [providerTab, setProviderTab] = useState("blackblaze");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [bbSaving, setBbSaving] = useState(false);
  const [bbRunningType, setBbRunningType] = useState("");
  const [bbExpanded, setBbExpanded] = useState({});
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [dashboard, setDashboard] = useState(null);
  const [sysLogs, setSysLogs] = useState([]);
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
  const [bbForm, setBbForm] = useState({
    db_enabled: true,
    db_interval_hours: 4,
    db_retention_days: 7,
    script_enabled: true,
    script_daily_hour_local: 21,
    script_daily_minute_local: 0,
    script_retention_days: 7,
  });
  const [bbGrouped, setBbGrouped] = useState({ db: {}, script: {} });

  const loadDashboard = async (silent = false) => {
    if (silent) setRefreshing(true); else setLoading(true);
    try {
      const [dash, systemLogs] = await Promise.all([
        apiFetch("/api/saas-admin/system-backup-manager/dashboard"),
        apiFetch("/api/saas-admin/system-backup-manager/logs?limit=10"),
      ]);
      setDashboard(dash);
      const dashProviderTabs = Array.isArray(dash?.provider_tabs) ? dash.provider_tabs : [];
      if (dashProviderTabs.includes(providerTab) === false) {
        setProviderTab(dashProviderTabs[0] || "blackblaze");
      }
      setSysLogs(systemLogs?.items || []);
      setBbGrouped(dash?.blackblaze_grouped || { db: {}, script: {} });
      const s = dash?.settings || {};
      const bb = dash?.blackblaze || {};
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
      setBbForm({
        db_enabled: !!bb.db_enabled,
        db_interval_hours: Number(bb.db_interval_hours || 4),
        db_retention_days: Number(bb.db_retention_days || 7),
        script_enabled: !!bb.script_enabled,
        script_daily_hour_local: Number(bb.script_daily_hour_local || 21),
        script_daily_minute_local: Number(bb.script_daily_minute_local || 0),
        script_retention_days: Number(bb.script_retention_days || 7),
      });
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

  const onBbChange = (key) => (e) => {
    const value = e.target.type === "checkbox" ? e.target.checked : e.target.value;
    setBbForm((prev) => ({ ...prev, [key]: value }));
    setError("");
    setSuccess("");
  };

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

  const saveBlackblazeSettings = async () => {
    setBbSaving(true);
    setError("");
    setSuccess("");
    try {
      await apiFetch("/api/saas-admin/system-backup-manager/blackblaze/settings", {
        method: "PUT",
        body: JSON.stringify({
          ...bbForm,
          is_active: Boolean(bbForm.db_enabled || bbForm.script_enabled),
          db_interval_hours: Number(bbForm.db_interval_hours || 4),
          db_retention_days: Number(bbForm.db_retention_days || 7),
          script_daily_hour_local: Number(bbForm.script_daily_hour_local || 21),
          script_daily_minute_local: Number(bbForm.script_daily_minute_local || 0),
          script_retention_days: Number(bbForm.script_retention_days || 7),
        }),
      });
      setSuccess("Blackblaze schedule settings saved.");
      await loadDashboard(true);
    } catch (e) {
      setError(errMsg(e, "Unable to save Blackblaze settings."));
    } finally {
      setBbSaving(false);
    }
  };

  const runBlackblazeBackup = async (backupType) => {
    setError("");
    setSuccess("");
    setBbRunningType(backupType);
    try {
      await apiFetch("/api/saas-admin/system-backup-manager/blackblaze/run", {
        method: "POST",
        body: JSON.stringify({ backup_type: backupType }),
      });
      setSuccess(backupType === "db" ? "Database backup queued." : "SaaS files backup queued.");
      await loadDashboard(true);
    } catch (e) {
      setError(errMsg(e, "Unable to queue Blackblaze backup."));
    } finally {
      setBbRunningType("");
    }
  };

  const liveDbDownload = () => {
    window.open("/api/saas-admin/system-backup-manager/live-db-download", "_blank", "noopener,noreferrer");
  };

  const topStats = useMemo(() => {
    const s = dashboard?.settings || {};
    const bb = dashboard?.blackblaze || {};
    if (providerTab === "google_drive") {
      return [
        { key: "gd_last_backup", label: "Last Backup Date", value: s.last_backup_date || "-", icon: "bi-calendar3", active: true },
        { key: "gd_backup_status", label: "Backup Status", value: s.last_backup_status || "never", icon: "bi-shield-check", active: true },
        {
          key: "gd_connection",
          label: "Google Drive",
          value: s.google_drive_connection_status || "not_connected",
          icon: "bi-google",
          active: true,
        },
        {
          key: "gd_scheduler",
          label: "Scheduler",
          value: s.is_active ? "enabled" : "disabled",
          icon: "bi-clock-history",
          active: true,
        },
      ];
    }

    return [
      { key: "bb_last_db", label: "Last DB Backup", value: bb.last_db_backup_at || "-", icon: "bi-database", active: true },
      { key: "bb_last_files", label: "Last Files Backup", value: bb.last_script_backup_at || "-", icon: "bi-file-earmark-zip", active: true },
      { key: "bb_status", label: "Blackblaze", value: bb.status || "offline", icon: "bi-hdd-rack", active: true },
      {
        key: "bb_storage",
        label: "Storage Mode",
        value: bb.storage_mode || "local",
        icon: "bi-hdd-network",
        active: true,
      },
    ];
  }, [dashboard, providerTab]);

  const last7Days = useMemo(() => recentDays(7), []);
  const blackblazeStatus = String(dashboard?.blackblaze?.status || "offline").toLowerCase();
  const blackblazeOnline = blackblazeStatus === "online";
  const blackblazeLogRows = useMemo(() => {
    const items = [];
    const grouped = bbGrouped || {};
    ["db", "script"].forEach((backupType) => {
      const dayMap = grouped[backupType] || {};
      Object.keys(dayMap).forEach((day) => {
        const rows = Array.isArray(dayMap[day]) ? dayMap[day] : [];
        rows.forEach((row) => {
          items.push({
            ...row,
            backup_type: backupType === "db" ? "Database" : "SaaS Files",
          });
        });
      });
    });
    return items.sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || "")));
  }, [bbGrouped]);

  if (loading) {
    return <div className="card p-4 text-center"><div className="spinner" /><p className="mb-0">Loading Backup Manager...</p></div>;
  }

  return (
    <div className="page-shell">
      <div className="p-4">
        <div className="d-flex justify-content-between align-items-start gap-2 flex-wrap">
          <div>
            <h3 className="mb-1">Backup Manager</h3>
            <p className="text-secondary mb-0">System + organization backups, restore manager, scheduler, and logs.</p>
          </div>
          <div className="d-flex gap-2">
            {PROVIDER_TABS.map((provider) => (
              <button
                key={provider.key}
                type="button"
                className={`btn btn-sm ${providerTab === provider.key ? "btn-primary" : "btn-outline-light"}`}
                onClick={() => { setProviderTab(provider.key); setTab("system"); }}
              >
                {provider.label}
              </button>
            ))}
            <button type="button" className="btn btn-outline-light btn-sm" onClick={() => loadDashboard(true)} disabled={refreshing}>{refreshing ? "Refreshing..." : "Refresh"}</button>
            <button type="button" className="btn btn-outline-light btn-sm" onClick={liveDbDownload}>Live DB Download</button>
            <Link to="/saas-admin" className="btn btn-outline-light btn-sm">Back to Overview</Link>
          </div>
        </div>

        {error ? <div className="alert alert-danger mt-3">{error}</div> : null}
        {success ? <div className="alert alert-success mt-3">{success}</div> : null}

        <div className="row g-3 mt-2">
          {topStats.map((card) => (
            <div className="col-12 col-md-6 col-xl-3" key={card.label}>
              <div className={`card p-3 h-100 stat-card ${card.active ? "border-primary" : ""}`}>
                <div className="stat-icon stat-icon-primary mb-2">
                  <i className={`bi ${card.icon}`} aria-hidden="true" />
                </div>
                <h6 className="mb-1">{card.label}</h6>
                <div className="stat-value" style={{ fontSize: "0.95rem", lineHeight: "1.35" }}>{card.value || "-"}</div>
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
          providerTab === "google_drive" ? (
            <div className="card p-3 mt-3">
              <h5 className="mb-3">System Backup (Google Drive)</h5>
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
          ) : (
            <div className="card p-3 mt-3">
              <div className="d-flex justify-content-between align-items-start gap-3 flex-wrap">
                <div>
                  <h5 className="mb-1">Blackblaze Backup Manager</h5>
                  <div className="small text-secondary">Database backup every 4 hours and SaaS files backup daily at 9:00 PM (local). 7-day retention cleanup is automatic.</div>
                </div>
                <div>
                  <span className={`badge ${blackblazeOnline ? "bg-success" : "bg-danger"}`}>
                    Blackblaze {blackblazeOnline ? "Online" : "Offline"}
                  </span>
                </div>
              </div>

              <div className="row g-3 mt-1">
                <div className="col-12 col-xl-6">
                  <div className="card p-3 h-100">
                    <h6 className="mb-3">Database Backup Schedule</h6>
                    <div className="row g-2">
                      <div className="col-12">
                        <div className="form-check form-switch">
                          <input className="form-check-input" type="checkbox" checked={!!bbForm.db_enabled} onChange={onBbChange("db_enabled")} />
                          <label className="form-check-label">Enable Database Backup</label>
                        </div>
                      </div>
                      <div className="col-6">
                        <label className="form-label">Interval (Hours)</label>
                        <input type="number" min="1" max="24" className="form-control" value={bbForm.db_interval_hours} onChange={onBbChange("db_interval_hours")} />
                      </div>
                      <div className="col-6">
                        <label className="form-label">Retention (Days)</label>
                        <input type="number" min="1" max="30" className="form-control" value={bbForm.db_retention_days} onChange={onBbChange("db_retention_days")} />
                      </div>
                    </div>
                    <div className="d-flex gap-2 mt-3">
                      <button type="button" className="btn btn-success btn-sm" onClick={() => runBlackblazeBackup("db")} disabled={!blackblazeOnline || bbRunningType === "db"}>{bbRunningType === "db" ? "Running..." : "Run DB Backup"}</button>
                    </div>
                    <div className="small text-secondary mt-2">Last DB Backup: {dashboard?.blackblaze?.last_db_backup_at || "-"}</div>
                  </div>
                </div>

                <div className="col-12 col-xl-6">
                  <div className="card p-3 h-100">
                    <h6 className="mb-3">SaaS Files Backup Schedule</h6>
                    <div className="row g-2">
                      <div className="col-12">
                        <div className="form-check form-switch">
                          <input className="form-check-input" type="checkbox" checked={!!bbForm.script_enabled} onChange={onBbChange("script_enabled")} />
                          <label className="form-check-label">Enable Script Files Backup</label>
                        </div>
                      </div>
                      <div className="col-4">
                        <label className="form-label">Hour (Local)</label>
                        <input type="number" min="0" max="23" className="form-control" value={bbForm.script_daily_hour_local} onChange={onBbChange("script_daily_hour_local")} />
                      </div>
                      <div className="col-4">
                        <label className="form-label">Minute</label>
                        <input type="number" min="0" max="59" className="form-control" value={bbForm.script_daily_minute_local} onChange={onBbChange("script_daily_minute_local")} />
                      </div>
                      <div className="col-4">
                        <label className="form-label">Retention (Days)</label>
                        <input type="number" min="1" max="30" className="form-control" value={bbForm.script_retention_days} onChange={onBbChange("script_retention_days")} />
                      </div>
                    </div>
                    <div className="d-flex gap-2 mt-3">
                      <button type="button" className="btn btn-success btn-sm" onClick={() => runBlackblazeBackup("script")} disabled={!blackblazeOnline || bbRunningType === "script"}>{bbRunningType === "script" ? "Running..." : "Run Files Backup"}</button>
                    </div>
                    <div className="small text-secondary mt-2">Last Files Backup: {dashboard?.blackblaze?.last_script_backup_at || "-"}</div>
                  </div>
                </div>
              </div>

              <div className="d-flex flex-wrap gap-2 mt-3">
                <button type="button" className="btn btn-primary btn-sm" onClick={saveBlackblazeSettings} disabled={bbSaving}>{bbSaving ? "Saving..." : "Save Blackblaze Settings"}</button>
              </div>
              {dashboard?.blackblaze?.last_error_message ? (
                <div className="small text-danger mt-2">{dashboard.blackblaze.last_error_message}</div>
              ) : null}

              <div className="row g-3 mt-2">
                {[
                  { key: "db", title: "Database Backups (Last 7 Days)" },
                  { key: "script", title: "SaaS Files Backups (Last 7 Days)" },
                ].map((block) => (
                  <div className="col-12 col-xl-6" key={block.key}>
                    <h6 className="mb-2">{block.title}</h6>
                    <div className="table-responsive">
                      <table className="table table-dark table-striped table-hover align-middle">
                        <thead>
                          <tr>
                            <th>Day</th>
                            <th>Backups</th>
                            <th>Action</th>
                          </tr>
                        </thead>
                        <tbody>
                          {last7Days.map((day) => {
                            const key = `${block.key}_${day}`;
                            const rows = (bbGrouped?.[block.key] && bbGrouped[block.key][day]) || [];
                            const open = !!bbExpanded[key];
                            return (
                              <Fragment key={key}>
                                <tr>
                                  <td>{day}</td>
                                  <td>{rows.length}</td>
                                  <td>
                                    <button type="button" className="btn btn-outline-light btn-sm" onClick={() => setBbExpanded((prev) => ({ ...prev, [key]: !open }))}>
                                      {open ? "Hide" : "View"}
                                    </button>
                                  </td>
                                </tr>
                                {open ? (
                                  <tr>
                                    <td colSpan="3">
                                      {rows.length ? (
                                        <div className="table-responsive">
                                          <table className="table table-sm table-dark mb-0">
                                            <thead>
                                              <tr>
                                                <th>Created At</th>
                                                <th>Status</th>
                                                <th>Size</th>
                                                <th>Download</th>
                                              </tr>
                                            </thead>
                                            <tbody>
                                              {rows.map((row) => (
                                                <tr key={row.id}>
                                                  <td>{row.created_at || "-"}</td>
                                                  <td><Badge value={row.status} /></td>
                                                  <td>{formatSize(row.size_bytes)}</td>
                                                  <td>
                                                    {row.status === "completed" && row.download_url ? (
                                                      <a className="btn btn-outline-success btn-sm" href={row.download_url}>Download</a>
                                                    ) : "-"}
                                                  </td>
                                                </tr>
                                              ))}
                                            </tbody>
                                          </table>
                                        </div>
                                      ) : (
                                        <div className="small text-secondary">No backups for this day.</div>
                                      )}
                                    </td>
                                  </tr>
                                ) : null}
                              </Fragment>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )
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

            <h6 className="mb-2 mt-4">Blackblaze Backup Logs (Last 7 Days)</h6>
            <div className="table-responsive">
              <table className="table table-dark table-striped table-hover align-middle">
                <thead>
                  <tr>
                    <th>Type</th>
                    <th>Status</th>
                    <th>File</th>
                    <th>Size</th>
                    <th>Created</th>
                    <th>Completed</th>
                    <th>Download</th>
                  </tr>
                </thead>
                <tbody>
                  {blackblazeLogRows.length ? blackblazeLogRows.map((row) => (
                    <tr key={`${row.id}_${row.created_at}`}>
                      <td>{row.backup_type}</td>
                      <td><Badge value={row.status} /></td>
                      <td>{row.file_name || "-"}</td>
                      <td>{formatSize(row.size_bytes)}</td>
                      <td>{row.created_at || "-"}</td>
                      <td>{row.completed_at || "-"}</td>
                      <td>
                        {row.status === "completed" && row.download_url ? (
                          <a className="btn btn-outline-success btn-sm" href={row.download_url}>Download</a>
                        ) : "-"}
                      </td>
                    </tr>
                  )) : (
                    <tr><td colSpan="7">No Blackblaze backup logs yet.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
