import { useEffect, useMemo, useState } from "react";
import { waApi } from "../api/whatsappAutomation.js";
import TablePagination from "../components/TablePagination.jsx";

const PAGE_SIZE = 10;
const FILTERS = [
  { key: "day", label: "Day" },
  { key: "week", label: "Week" },
  { key: "month", label: "Month" },
];

function formatTime(value) {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleString();
}

export default function DigitalCardVisitorAnalyticsPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("week");
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [summary, setSummary] = useState({ total_visits: 0, unique_visitors: 0, days: 7 });
  const [chart, setChart] = useState([]);
  const [rows, setRows] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, page_size: PAGE_SIZE, total_items: 0, total_pages: 1 });

  async function loadData({ nextFilter = filter, nextQuery = query, nextPage = page } = {}) {
    setLoading(true);
    setError("");
    try {
      const res = await waApi.getDigitalCardVisitorAnalytics({
        range: nextFilter,
        q: nextQuery,
        page: nextPage,
        pageSize: PAGE_SIZE,
      });
      setSummary(res?.summary || { total_visits: 0, unique_visitors: 0, days: 7 });
      setChart(Array.isArray(res?.chart) ? res.chart : []);
      setRows(Array.isArray(res?.items) ? res.items : []);
      setPagination(res?.pagination || { page: 1, page_size: PAGE_SIZE, total_items: 0, total_pages: 1 });
    } catch (err) {
      setError(err?.message || "Unable to load visitor analytics.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData({ nextFilter: filter, nextQuery: query, nextPage: page });
  }, [filter, query, page]);

  const chartMax = useMemo(() => {
    const values = chart.map((item) => Number(item?.visits || 0));
    return Math.max(1, ...values);
  }, [chart]);
  const averagePerDay = summary?.days ? (Number(summary?.total_visits || 0) / Number(summary.days || 1)).toFixed(1) : "0.0";
  const statCards = [
    {
      key: "total",
      icon: "bi-eye-fill",
      label: "Total Page Visits",
      value: Number(summary?.total_visits || 0),
      meta: `${summary?.days || 0} day window`,
    },
    {
      key: "unique",
      icon: "bi-people-fill",
      label: "Unique Visitors",
      value: Number(summary?.unique_visitors || 0),
      meta: "Distinct visitor count",
    },
    {
      key: "average",
      icon: "bi-graph-up-arrow",
      label: "Average / Day",
      value: averagePerDay,
      meta: "Daily traffic average",
    },
  ];

  return (
    <div className="d-flex flex-column gap-3 digital-card-visitor-analytics">
      <div className="d-flex flex-wrap align-items-start justify-content-between gap-3">
        <div>
          <h3 className="mb-1">Visitor Analytics</h3>
          <div className="text-secondary">Digital Card page visits analytics (WordPress Jetpack style).</div>
        </div>
        <div className="d-flex flex-wrap gap-2">
          {FILTERS.map((item) => (
            <button
              key={item.key}
              type="button"
              className={`btn btn-sm ${filter === item.key ? "btn-primary" : "btn-outline-light"}`}
              onClick={() => {
                setFilter(item.key);
                setPage(1);
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {error ? <div className="alert alert-danger mb-0">{error}</div> : null}

      <div className="row g-3">
        {statCards.map((item) => (
          <div className="col-12 col-md-4" key={item.key}>
            <div className="card p-3 h-100 stat-card whatsapp-automation-stat-card">
              <span className="stat-icon" aria-hidden="true">
                <i className={`bi ${item.icon}`} />
              </span>
              <h6>{item.label}</h6>
              <div className="stat-value">{item.value}</div>
              <div className="text-secondary">{item.meta}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="card p-3">
        <div className="d-flex align-items-center justify-content-between mb-2">
          <h5 className="mb-0">Daily Visits Chart</h5>
          {loading ? <small className="text-secondary">Loading...</small> : null}
        </div>
        <div className="d-flex align-items-end gap-2" style={{ minHeight: 170, overflowX: "auto" }}>
          {(chart.length ? chart : [{ label: "-", visits: 0 }]).map((item, idx) => {
            const value = Number(item?.visits || 0);
            const height = Math.max(8, Math.round((value / chartMax) * 120));
            return (
              <div key={`${item?.day || item?.label || "d"}-${idx}`} className="d-flex flex-column align-items-center" style={{ minWidth: 44 }}>
                <div className="small text-secondary">{value}</div>
                <div style={{ width: 20, height, borderRadius: 8, background: "var(--color-primary)" }} />
                <div className="small text-secondary mt-1">{item?.label || "-"}</div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="card p-0 overflow-hidden digital-card-visitor-analytics__table">
        <div className="wz-table-toolbar p-3 pb-2">
          <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 w-100">
            <h5 className="mb-0">Visitor Table</h5>
            <label className="table-search mb-0">
              <i className="bi bi-search" aria-hidden="true" />
              <input
                className="form-control"
                placeholder="Search country / ip / url"
                value={search}
                onChange={(e) => {
                  const next = e.target.value.slice(0, 120);
                  setSearch(next);
                  setQuery(next.trim());
                  setPage(1);
                }}
              />
            </label>
          </div>
        </div>

        <div className="table-responsive wz-data-table-wrap">
          <table className="table table-dark table-striped table-hover align-middle mb-0 wz-data-table">
            <thead>
              <tr>
                <th>Visited At</th>
                <th>Card</th>
                <th>Country</th>
                <th>IP</th>
                <th>Page URL</th>
              </tr>
            </thead>
            <tbody>
              {rows.length ? rows.map((row) => (
                <tr key={row.id}>
                  <td>{formatTime(row.visited_at)}</td>
                  <td>{row.public_slug || "-"}</td>
                  <td>{row.visitor_country || "Unknown"}</td>
                  <td>{row.visitor_ip || "-"}</td>
                  <td style={{ maxWidth: 380 }}>
                    <div className="text-truncate">{row.page_url || row.page_path || "-"}</div>
                  </td>
                </tr>
              )) : (
                <tr>
                  <td colSpan="5" className="text-secondary">No visitor records found.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="wz-table-footer p-3 pt-2">
          <span className="text-secondary">Showing {rows.length ? ((pagination.page - 1) * pagination.page_size) + 1 : 0} to {((pagination.page - 1) * pagination.page_size) + rows.length} of {pagination.total_items}</span>
          <TablePagination
            page={pagination.page}
            totalPages={pagination.total_pages}
            onPageChange={setPage}
            showPageLinks
            showPageLabel={false}
            maxPageLinks={5}
          />
        </div>
      </div>
    </div>
  );
}
