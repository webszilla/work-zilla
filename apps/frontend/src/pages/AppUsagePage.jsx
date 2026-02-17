import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "../lib/api.js";
import TablePagination from "../components/TablePagination.jsx";

const emptyState = {
  loading: true,
  error: "",
  errorStatus: 0,
  data: null
};

function normalizeUrl(value) {
  const text = String(value || "").trim();
  if (!text) {
    return "";
  }
  if (/^https?:\/\//i.test(text)) {
    return text;
  }
  if (/^\/\//.test(text)) {
    return `https:${text}`;
  }
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(text)) {
    return "";
  }
  const lower = text.toLowerCase();
  if (lower.startsWith("localhost") || /^[0-9.]+(?::\d+)?(\/|$)/.test(text)) {
    return `http://${text}`;
  }
  return `https://${text}`;
}

function renderUrlLink(url, label) {
  if (!url || url === "-") {
    return label || "-";
  }
  const href = normalizeUrl(url);
  if (!href) {
    return label || url;
  }
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-info text-decoration-none"
    >
      {label || url}
    </a>
  );
}

function getStatusMeta(status) {
  const normalized = String(status || "Offline").trim().toLowerCase();
  if (normalized === "online") {
    return { key: "online", label: "Online" };
  }
  if (normalized === "ideal" || normalized === "idle") {
    return { key: "idle", label: "Idle" };
  }
  return { key: "offline", label: "Offline" };
}

export default function AppUsagePage() {
  const [filters, setFilters] = useState({
    employeeId: "",
    preset: "today"
  });
  const [state, setState] = useState(emptyState);
  const [userQuery, setUserQuery] = useState("");
  const [tableSearchTerm, setTableSearchTerm] = useState("");
  const [tableSearchQuery, setTableSearchQuery] = useState("");
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 20;

  useEffect(() => {
    let active = true;
    async function loadUsage() {
      setState((prev) => ({ ...prev, loading: true, error: "", errorStatus: 0 }));
      try {
        const params = new URLSearchParams();
        if (filters.employeeId) {
          params.set("employee_id", filters.employeeId);
        }
        params.set("preset", filters.preset || "today");
        const url = params.toString()
          ? `/api/dashboard/app-usage?${params.toString()}`
          : "/api/dashboard/app-usage";
        const data = await apiFetch(url);
        if (!active) {
          return;
        }
        setState({ loading: false, error: "", errorStatus: 0, data });
      } catch (error) {
        if (error?.data?.redirect) {
          window.location.href = error.data.redirect;
          return;
        }
        if (active) {
          setState({
            loading: false,
            error: error?.message || "Unable to load app usage.",
            errorStatus: error?.status || 0,
            data: null
          });
        }
      }
    }

    loadUsage();
    return () => {
      active = false;
    };
  }, [filters]);

  useEffect(() => {
    const handle = setTimeout(() => {
      setTableSearchQuery(tableSearchTerm.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(handle);
  }, [tableSearchTerm]);

  const data = state.data || {};
  const employees = data.employees || [];
  const appRows = data.app_rows || [];
  const selectedId = data.selected_employee_id
    ? String(data.selected_employee_id)
    : filters.employeeId;

  const filteredEmployees = useMemo(() => {
    if (!userQuery) {
      return employees;
    }
    const term = userQuery.toLowerCase();
    return employees.filter((employee) =>
      employee.name.toLowerCase().includes(term)
    );
  }, [employees, userQuery]);

  const selectedEmployee = employees.find(
    (employee) => String(employee.id) === String(selectedId)
  );

  const filteredRows = useMemo(() => {
    if (!tableSearchQuery) {
      return appRows;
    }
    const term = tableSearchQuery.toLowerCase();
    return appRows.filter((row) => {
      const values = [row.name, row.url, row.duration, row.percent];
      return values.some((value) =>
        String(value || "").toLowerCase().includes(term)
      );
    });
  }, [appRows, tableSearchQuery]);

  const totalItems = filteredRows.length;
  const totalPages = Math.max(Math.ceil(totalItems / PAGE_SIZE), 1);
  const pagedRows = useMemo(
    () => filteredRows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [filteredRows, page]
  );
  const startEntry = totalItems ? (page - 1) * PAGE_SIZE + 1 : 0;
  const endEntry = totalItems
    ? Math.min(page * PAGE_SIZE, totalItems)
    : 0;

  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages);
    }
  }, [page, totalPages]);

  useEffect(() => {
    setPage(1);
  }, [filters]);

  function handleSelectEmployee(id) {
    setFilters((prev) => ({ ...prev, employeeId: id || "" }));
  }

  function handlePreset(preset) {
    setFilters((prev) => ({ ...prev, preset }));
  }

  function buildAppUrlLink(appName) {
    const params = new URLSearchParams();
    params.set("app", appName);
    if (selectedId) {
      params.set("employee_id", selectedId);
    }
    params.set("preset", filters.preset || "today");
    return `/app-urls?${params.toString()}`;
  }

  if (state.loading) {
    return (
      <div className="card p-4 text-center">
        <div className="spinner" />
        <p className="mb-0">Loading app usage...</p>
      </div>
    );
  }

  return (
    <>
      <div className="gallery-header">
        <h2>App Usage</h2>
      </div>

      {state.error ? (
        <div className={`alert ${state.errorStatus === 403 ? "alert-warning" : "alert-danger"}`}>
          {state.error}
        </div>
      ) : null}

      <div className="screen-layout">
        <div className="screen-left">
          <div className="user-panel">
            <div className="user-panel-header">
              <div className="user-panel-title">Users</div>
              <div className="user-search">
                <input
                  type="text"
                  placeholder="Search user"
                  value={userQuery}
                  onChange={(event) => setUserQuery(event.target.value)}
                />
              </div>
            </div>
            <div className="user-list">
              <button
                type="button"
                className={`user-chip all ${!selectedId ? "active" : ""}`}
                onClick={() => handleSelectEmployee("")}
              >
                All Users
              </button>
              {filteredEmployees.map((employee) => {
                const statusMeta = getStatusMeta(employee.status);
                return (
                  <button
                    key={employee.id}
                    type="button"
                    className={`user-chip ${
                      String(employee.id) === String(selectedId) ? "active" : ""
                    }`}
                    onClick={() => handleSelectEmployee(String(employee.id))}
                  >
                    <span className={`status-dot status-${statusMeta.key}`} />
                    <span className="user-name">{employee.name}</span>
                    <span className="user-status">({statusMeta.label})</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="screen-right">
          <div className="shot-toolbar">
            <div className="shot-info">
              Showing: {selectedEmployee ? selectedEmployee.name : "All Users"}
            </div>
            <div className="shot-filter">
              <div className="preset-buttons">
                <button
                  type="button"
                  className={`shot-btn ${filters.preset === "today" ? "active" : ""}`}
                  onClick={() => handlePreset("today")}
                >
                  Today
                </button>
                <button
                  type="button"
                  className={`shot-btn ${filters.preset === "yesterday" ? "active" : ""}`}
                  onClick={() => handlePreset("yesterday")}
                >
                  Yesterday
                </button>
                <button
                  type="button"
                  className={`shot-btn ${filters.preset === "one_week" ? "active" : ""}`}
                  onClick={() => handlePreset("one_week")}
                >
                  One Week
                </button>
                <button
                  type="button"
                  className={`shot-btn ${filters.preset === "one_month" ? "active" : ""}`}
                  onClick={() => handlePreset("one_month")}
                >
                  One Month
                </button>
              </div>
            </div>
            <div className="usage-total">
              Total Time: {data.total_time || "0s"}
            </div>
          </div>

          <div className="card p-3 usage-card">
            <div className="table-controls">
              <div className="table-length">Show {PAGE_SIZE} entries</div>
              <label className="table-search" htmlFor="app-usage-search">
                <span>Search:</span>
                <input
                  id="app-usage-search"
                  type="text"
                  value={tableSearchTerm}
                  onChange={(event) => setTableSearchTerm(event.target.value)}
                  placeholder="Search apps"
                />
              </label>
            </div>
            <div className="table-responsive">
              <table className="table table-dark table-striped table-hover align-middle">
                <thead>
                  <tr>
                    <th>Application</th>
                    <th>Top URL</th>
                    <th>Total Time</th>
                    <th>Share</th>
                  </tr>
                </thead>
                <tbody>
                  {pagedRows.length ? (
                    pagedRows.map((row) => (
                      <tr key={row.name}>
                        <td>
                          <a
                            className="text-info text-decoration-none"
                            href={buildAppUrlLink(row.name)}
                          >
                            {row.name}
                          </a>
                        </td>
                        <td className="text-truncate" style={{ maxWidth: "280px" }}>
                          {renderUrlLink(row.url)}
                        </td>
                        <td>{row.duration}</td>
                        <td>{row.percent}%</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan="4">No activity data yet.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="table-footer">
              <div className="table-info">
                Showing {startEntry} to {endEntry} of {totalItems} entries
              </div>
              <TablePagination
                page={page}
                totalPages={totalPages}
                onPageChange={setPage}
                showPageLinks
                showPageLabel={false}
                maxPageLinks={7}
              />
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
