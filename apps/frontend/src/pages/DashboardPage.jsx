import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "../lib/api.js";
import TablePagination from "../components/TablePagination.jsx";
import ProductAccessSection from "../components/ProductAccessSection.jsx";

const emptyState = {
  loading: true,
  error: "",
  data: null
};

function shouldShowAlert() {
  try {
    const todayKey = new Date().toISOString().slice(0, 10);
    const storageKey = `usageAlertLastShown:${todayKey}`;
    const lastShown = Number(localStorage.getItem(storageKey) || 0);
    const now = Date.now();
    const threeHoursMs = 3 * 60 * 60 * 1000;
    if (!lastShown || now - lastShown >= threeHoursMs) {
      localStorage.setItem(storageKey, String(now));
      return true;
    }
    return false;
  } catch (error) {
    return false;
  }
}

export default function DashboardPage({ productSlug = "", subscriptions = [] }) {
  const [state, setState] = useState(emptyState);
  const [showAlert, setShowAlert] = useState(false);
  const isReadOnly = typeof window !== "undefined" && window.__WZ_READ_ONLY__ === true;
  const [adminPage, setAdminPage] = useState(1);
  const [appsPage, setAppsPage] = useState(1);
  const [adminSearchTerm, setAdminSearchTerm] = useState("");
  const [adminSearchQuery, setAdminSearchQuery] = useState("");
  const [appsSearchTerm, setAppsSearchTerm] = useState("");
  const [appsSearchQuery, setAppsSearchQuery] = useState("");
  const PAGE_SIZE = 5;

  useEffect(() => {
    let active = true;
    async function loadSummary() {
      try {
        const data = await apiFetch("/api/dashboard/summary");
        if (!active) {
          return;
        }
        setState({ loading: false, error: "", data });
        if (data?.usage_alerts?.length && shouldShowAlert()) {
          setShowAlert(true);
        }
      } catch (error) {
        if (error?.data?.redirect) {
          window.location.href = error.data.redirect;
          return;
        }
        if (active) {
          setState({
            loading: false,
            error: error?.message || "Unable to load dashboard.",
            data: null
          });
        }
      }
    }

    loadSummary();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const handle = setTimeout(() => {
      setAdminSearchQuery(adminSearchTerm.trim());
      setAdminPage(1);
    }, 300);
    return () => clearTimeout(handle);
  }, [adminSearchTerm]);

  useEffect(() => {
    const handle = setTimeout(() => {
      setAppsSearchQuery(appsSearchTerm.trim());
      setAppsPage(1);
    }, 300);
    return () => clearTimeout(handle);
  }, [appsSearchTerm]);

  const data = state.data || {};
  const stats = data.stats || {};
  const org = data.org || {};
  const subscription = data.subscription || null;
  const settings = data.settings || {};
  const topApps = data.top_apps || [];
  const adminActions = data.recent_admin_actions || [];
  const usageAlerts = data.usage_alerts || [];

  const statCards = [
    {
      label: "Total Employees",
      value: stats.employees ?? 0,
      icon: "bi-people",
      color: "#4dabff"
    },
    {
      label: "Online Now",
      value: stats.online ?? 0,
      icon: "bi-broadcast",
      color: "#3ef58a"
    },
    {
      label: "Total Activities",
      value: stats.activities ?? 0,
      icon: "bi-activity",
      color: "#ffdd57"
    },
    {
      label: "Screenshots",
      value: stats.screenshots ?? 0,
      icon: "bi-camera",
      color: "#ff6b6b"
    }
  ];

  const now = Date.now();
  const activeSubscriptions = (subscriptions || []).filter((item) => {
    if (!item?.product_slug) {
      return false;
    }
    const status = String(item.status || "").toLowerCase();
    if (status === "active") {
      return true;
    }
    if (status === "trialing") {
      if (!item.trial_end) {
        return true;
      }
      const trialEnd = Date.parse(item.trial_end);
      return Number.isNaN(trialEnd) ? true : trialEnd >= now;
    }
    return false;
  });
  const activeProductKeys = new Set(
    activeSubscriptions.map((item) => item.product_slug)
  );

  const filteredAdminActions = useMemo(() => {
    if (!adminSearchQuery) {
      return adminActions;
    }
    const term = adminSearchQuery.toLowerCase();
    return adminActions.filter((log) => {
      const values = [log.time, log.action, log.details];
      return values.some((value) =>
        String(value || "").toLowerCase().includes(term)
      );
    });
  }, [adminActions, adminSearchQuery]);

  const filteredTopApps = useMemo(() => {
    if (!appsSearchQuery) {
      return topApps;
    }
    const term = appsSearchQuery.toLowerCase();
    return topApps.filter((app) => {
      const values = [app.app_name, app.count];
      return values.some((value) =>
        String(value || "").toLowerCase().includes(term)
      );
    });
  }, [topApps, appsSearchQuery]);

  const adminTotalItems = filteredAdminActions.length;
  const appsTotalItems = filteredTopApps.length;
  const adminTotalPages = Math.max(Math.ceil(adminTotalItems / PAGE_SIZE), 1);
  const appsTotalPages = Math.max(Math.ceil(appsTotalItems / PAGE_SIZE), 1);
  const adminRows = useMemo(
    () =>
      filteredAdminActions.slice(
        (adminPage - 1) * PAGE_SIZE,
        adminPage * PAGE_SIZE
      ),
    [filteredAdminActions, adminPage]
  );
  const appRows = useMemo(
    () =>
      filteredTopApps.slice((appsPage - 1) * PAGE_SIZE, appsPage * PAGE_SIZE),
    [filteredTopApps, appsPage]
  );
  const adminStartEntry = adminTotalItems
    ? (adminPage - 1) * PAGE_SIZE + 1
    : 0;
  const adminEndEntry = adminTotalItems
    ? Math.min(adminPage * PAGE_SIZE, adminTotalItems)
    : 0;
  const appsStartEntry = appsTotalItems
    ? (appsPage - 1) * PAGE_SIZE + 1
    : 0;
  const appsEndEntry = appsTotalItems
    ? Math.min(appsPage * PAGE_SIZE, appsTotalItems)
    : 0;

  useEffect(() => {
    if (adminPage > adminTotalPages) {
      setAdminPage(adminTotalPages);
    }
  }, [adminPage, adminTotalPages]);

  useEffect(() => {
    if (appsPage > appsTotalPages) {
      setAppsPage(appsTotalPages);
    }
  }, [appsPage, appsTotalPages]);

  if (state.loading) {
    return (
      <div className="card p-4 text-center">
        <div className="spinner" />
        <p className="mb-0">Loading dashboard...</p>
      </div>
    );
  }

  if (state.error) {
    return (
      <div className="alert alert-danger">
        {state.error}
      </div>
    );
  }

  return (
    <>
      <h2 className="page-title">Dashboard Analytics</h2>
      <hr className="section-divider" />

      <div id="monitor-analytics" className="card p-3 mb-3 notice-card">
        <h5 className="mb-1">Monitoring Policy Notice</h5>
        <p className="mb-0 text-secondary">
          Employee activity is monitored for productivity and security purposes.
          Screenshots may be captured when required. Sensitive / personal screens are excluded from monitoring.
        </p>
      </div>

      <div className="row g-3">
        {statCards.map((card) => (
          <div className="col-12 col-md-6 col-xl-3" key={card.label}>
            <div className="card p-3 text-center h-100">
              <div className="stat-icon" style={{ color: card.color }}>
                <i className={`bi ${card.icon}`} aria-hidden="true" />
              </div>
              <h5>{card.label}</h5>
              <div className="stat-value" style={{ color: card.color }}>
                {card.value}
              </div>
            </div>
          </div>
        ))}
      </div>

      {!isReadOnly ? (
        <div className="card p-4 mt-4">
          <h4>Admin Activity (Last 100)</h4>
          <div className="table-controls">
            <div className="table-length">Show {PAGE_SIZE} entries</div>
            <label className="table-search" htmlFor="dashboard-admin-search">
              <span>Search:</span>
              <input
                id="dashboard-admin-search"
                type="text"
                value={adminSearchTerm}
                onChange={(event) => setAdminSearchTerm(event.target.value)}
                placeholder="Search activity"
              />
            </label>
          </div>
          <div className="table-responsive mt-2">
            <table className="table table-dark table-striped table-hover align-middle">
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Action</th>
                  <th>Details</th>
                </tr>
              </thead>
              <tbody>
                {adminRows.length ? (
                  adminRows.map((log, idx) => (
                    <tr key={`${log.time}-${idx}`}>
                      <td>{log.time}</td>
                      <td>{log.action}</td>
                      <td>{log.details || "-"}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan="3">No admin activity yet.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="table-footer">
            <div className="table-info">
              Showing {adminStartEntry} to {adminEndEntry} of {adminTotalItems} entries
            </div>
            <TablePagination
              page={adminPage}
              totalPages={adminTotalPages}
              onPageChange={setAdminPage}
              showPageLinks
              showPageLabel={false}
              maxPageLinks={7}
            />
          </div>
        </div>
      ) : null}

      <div className="row g-3 mt-2">
        <div className="col-12 col-lg-4">
          <div className="card p-3 h-100 monitor-summary-card">
            <h5>Company Details</h5>
            <div className="monitor-summary-row">
              <span>Name</span>
              <strong>{org.name || "-"}</strong>
            </div>
            <div className="monitor-summary-row">
              <span>Company Key</span>
              <strong>{org.company_key || "-"}</strong>
            </div>
            <div className="monitor-summary-row">
              <span>Created</span>
              <strong>{org.created_at || "-"}</strong>
            </div>
          </div>
        </div>
        <div className="col-12 col-lg-4">
          <div className="card p-3 h-100 monitor-summary-card">
            <h5>Subscription</h5>
            {subscription ? (
              <>
                <div className="monitor-summary-row">
                  <span>Plan</span>
                  <strong>{subscription.plan}</strong>
                </div>
                <div className="monitor-summary-row">
                  <span>Employees Allowed</span>
                  <strong>
                    {subscription.employee_limit === 0
                      ? "Unlimited"
                      : subscription.employee_limit}
                  </strong>
                </div>
                <div className="monitor-summary-row">
                  <span>Valid Till</span>
                  <strong>{subscription.end_date || "-"}</strong>
                </div>
              </>
            ) : (
              <div className="monitor-summary-note">No active plan.</div>
            )}
          </div>
        </div>
        <div className="col-12 col-lg-4">
          <div className="card p-3 h-100 monitor-summary-card">
            <h5>Screenshot Interval</h5>
            <div className="monitor-summary-row monitor-summary-row--accent">
              <span>Current Interval</span>
              <strong>{settings.screenshot_interval_minutes ?? "-"} minutes</strong>
            </div>
          </div>
        </div>
      </div>

      <div className="card p-4 mt-4">
        <h4>Top Applications Used</h4>
        <div className="table-controls">
          <div className="table-length">Show {PAGE_SIZE} entries</div>
          <label className="table-search" htmlFor="dashboard-apps-search">
            <span>Search:</span>
            <input
              id="dashboard-apps-search"
              type="text"
              value={appsSearchTerm}
              onChange={(event) => setAppsSearchTerm(event.target.value)}
              placeholder="Search apps"
            />
          </label>
        </div>
        {filteredTopApps.length ? (
          <div className="table-responsive mt-2">
            <table className="table table-dark table-striped table-hover align-middle">
              <thead>
                <tr>
                  <th>Application</th>
                  <th>Usage Count</th>
                </tr>
              </thead>
              <tbody>
                {appRows.map((app, idx) => (
                  <tr key={`${app.app_name}-${idx}`}>
                    <td>{app.app_name}</td>
                    <td>{app.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="mb-0">No data available.</p>
        )}
        <div className="table-footer">
          <div className="table-info">
            Showing {appsStartEntry} to {appsEndEntry} of {appsTotalItems} entries
          </div>
          <TablePagination
            page={appsPage}
            totalPages={appsTotalPages}
            onPageChange={setAppsPage}
            showPageLinks
            showPageLabel={false}
            maxPageLinks={7}
          />
        </div>
      </div>

      <ProductAccessSection
        products={data.products || []}
        subscriptions={subscriptions}
        isReadOnly={isReadOnly}
        currentProductKey="monitor"
      />

      {showAlert && usageAlerts.length ? (

        <div className="modal-overlay" onClick={() => setShowAlert(false)}>
          <div
            className="modal-panel"
            onClick={(event) => event.stopPropagation()}
          >
            <h5>Automation Alert: Gaming/OTT Usage</h5>
            <div className="text-secondary mb-2">
              Work hours: {data.work_hours_label || "09:00 - 18:00"}
            </div>
            <div className="table-responsive">
              <table className="table table-dark table-striped align-middle mb-0">
                <thead>
                  <tr>
                    <th>Employee</th>
                    <th>App / URL</th>
                    <th>Time</th>
                  </tr>
                </thead>
                <tbody>
                  {usageAlerts.map((alert, idx) => (
                    <tr key={`${alert.employee}-${idx}`}>
                      <td>{alert.employee}</td>
                      <td className="text-truncate" style={{ maxWidth: "320px" }}>
                        {alert.app}
                      </td>
                      <td>{alert.time}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="d-flex justify-content-end mt-3">
              <button
                className="modal-close"
                type="button"
                onClick={() => setShowAlert(false)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
