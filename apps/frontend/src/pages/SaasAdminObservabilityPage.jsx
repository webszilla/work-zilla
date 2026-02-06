import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { fetchObservabilitySummary } from "../api/saasAdminObservability.js";

const emptyState = {
  loading: true,
  error: "",
  data: null
};

const KPI_DEFINITIONS = [
  { key: "agent_activity_upload", label: "Activity uploads", icon: "bi-upload" },
  { key: "agent_screenshot_upload", label: "Screenshot uploads", icon: "bi-camera" },
  { key: "agent_org_settings", label: "Org settings hits", icon: "bi-gear" },
  { key: "agent_rate_limited", label: "Rate limited hits", icon: "bi-slash-circle" },
  { key: "renew_submitted", label: "Renew submitted", icon: "bi-arrow-repeat" },
  { key: "transfer_approved", label: "Transfer approved", icon: "bi-check2-circle" },
  { key: "subscription_expired", label: "Subscription expired", icon: "bi-x-circle" }
];

const DAY_OPTIONS = [7, 14, 30];

function formatCount(value) {
  if (value === null || value === undefined) {
    return 0;
  }
  return Number(value).toLocaleString();
}

export default function SaasAdminObservabilityPage({
  initialProduct = "monitor",
  initialOrgId = "all",
  initialDays = 7,
  showTitle = true
}) {
  const [state, setState] = useState(emptyState);
  const [filters, setFilters] = useState({
    days: initialDays,
    orgId: initialOrgId,
    product: initialProduct
  });
  const [refreshKey, setRefreshKey] = useState(0);
  const [autoRefresh, setAutoRefresh] = useState(false);

  useEffect(() => {
    let active = true;
    async function loadSummary() {
      setState((prev) => ({ ...prev, loading: true, error: "" }));
      try {
        const data = await fetchObservabilitySummary({
          days: filters.days,
          org_id: filters.orgId === "all" ? null : filters.orgId,
          product: filters.product === "all" ? null : filters.product
        });
        if (!active) {
          return;
        }
        setState({ loading: false, error: "", data });
      } catch (error) {
        if (!active) {
          return;
        }
        setState({
          loading: false,
          error: error?.message || "Unable to load observability summary.",
          data: null
        });
      }
    }

    loadSummary();
    return () => {
      active = false;
    };
  }, [filters, refreshKey]);

  useEffect(() => {
    if (!autoRefresh) {
      return;
    }
    const handle = setInterval(() => {
      setRefreshKey((prev) => prev + 1);
    }, 60000);
    return () => clearInterval(handle);
  }, [autoRefresh]);

  const data = state.data || {};
  const totals = data.totals || {};
  const orgs = data.orgs || [];
  const products = data.products || [];
  const byDay = data.by_day || [];
  const pendingTransfers = data.pending_transfers || [];

  const tableRows = useMemo(() => {
    return byDay.map((row) => {
      const counts = row.counts || {};
      return {
        date: row.date,
        counts: KPI_DEFINITIONS.reduce((acc, item) => {
          acc[item.key] = counts[item.key] ?? 0;
          return acc;
        }, {})
      };
    });
  }, [byDay]);

  if (state.loading) {
    return (
      <div className="card p-4 text-center">
        <div className="spinner" />
        <p className="mb-0">Loading observability summary...</p>
      </div>
    );
  }

  if (state.error) {
    return (
      <div className="card p-4">
        <div className="alert alert-danger mb-3">{state.error}</div>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => setRefreshKey((prev) => prev + 1)}
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <>
      {showTitle ? <h3 className="page-title">Observability</h3> : null}

      <div className="d-flex flex-wrap align-items-end gap-2 mt-3">
        <label className="table-search">
          <span>Organization</span>
          <select
            value={filters.orgId}
            onChange={(event) =>
              setFilters((prev) => ({ ...prev, orgId: event.target.value }))
            }
          >
            <option value="all">All</option>
            {orgs.map((org) => (
              <option key={org.id} value={String(org.id)}>
                {org.name}
              </option>
            ))}
          </select>
        </label>
        <label className="table-search">
          <span>Product</span>
          <select
            value={filters.product}
            onChange={(event) =>
              setFilters((prev) => ({ ...prev, product: event.target.value }))
            }
          >
            <option value="all">All</option>
            {products.map((slug) => (
              <option key={slug} value={slug}>
                {slug}
              </option>
            ))}
          </select>
        </label>
        <label className="table-search">
          <span>Days</span>
          <select
            value={filters.days}
            onChange={(event) =>
              setFilters((prev) => ({ ...prev, days: Number(event.target.value) }))
            }
          >
            {DAY_OPTIONS.map((days) => (
              <option key={days} value={days}>
                {days} days
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => setRefreshKey((prev) => prev + 1)}
        >
          Refresh
        </button>
        <div className="form-check ms-2">
          <input
            id="observability-auto-refresh"
            className="form-check-input"
            type="checkbox"
            checked={autoRefresh}
            onChange={(event) => setAutoRefresh(event.target.checked)}
          />
          <label className="form-check-label" htmlFor="observability-auto-refresh">
            Auto-refresh (60s)
          </label>
        </div>
      </div>

      <div className="row g-3 mt-3">
        {KPI_DEFINITIONS.map((item) => (
          <div className="col-12 col-md-6 col-xl-3" key={item.key}>
            <div className="card p-3 h-100 stat-card">
              <div className="stat-icon stat-icon-primary">
                <i className={`bi ${item.icon}`} aria-hidden="true" />
              </div>
              <h6 className="mb-1">{item.label}</h6>
              <div className="stat-value">{formatCount(totals[item.key] ?? 0)}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="row g-3 mt-3">
        <div className="col-12">
          <div className="card p-3 h-100">
            <h5 className="mb-0">Daily Breakdown</h5>
            <div className="table-responsive mt-3">
              <table className="table table-dark table-striped table-hover align-middle">
                <thead>
                  <tr>
                    <th>Date</th>
                    {KPI_DEFINITIONS.map((item) => (
                      <th key={item.key}>{item.label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {tableRows.length ? (
                    tableRows.map((row) => (
                      <tr key={row.date}>
                        <td>{row.date}</td>
                        {KPI_DEFINITIONS.map((item) => (
                          <td key={`${row.date}-${item.key}`}>
                            {formatCount(row.counts[item.key] || 0)}
                          </td>
                        ))}
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={KPI_DEFINITIONS.length + 1}>No metrics found.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
        <div className="col-12">
          <div className="card p-3 h-100">
            <div className="d-flex align-items-center justify-content-between">
              <h5 className="mb-0">Pending Approvals</h5>
              <span className="badge bg-warning text-dark">
                {formatCount(pendingTransfers.reduce((sum, row) => sum + (row.count || 0), 0))}
              </span>
            </div>
            <div className="table-responsive mt-3">
              <table className="table table-dark table-striped table-hover align-middle">
                <thead>
                  <tr>
                    <th>Org</th>
                    <th>Pending Transfers</th>
                    <th>Link</th>
                  </tr>
                </thead>
                <tbody>
                  {pendingTransfers.length ? (
                    pendingTransfers.map((row) => (
                      <tr key={row.org_id}>
                        <td>{row.org_name}</td>
                        <td>{formatCount(row.count)}</td>
                        <td>
                          <Link
                            className="btn btn-outline-light btn-sm"
                            to={`/saas-admin/transfers?org_id=${row.org_id}`}
                          >
                            View
                          </Link>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan="3">No pending transfers.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
