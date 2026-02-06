import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { apiFetch } from "../lib/api.js";
import TablePagination from "../components/TablePagination.jsx";

const emptyState = {
  loading: true,
  error: "",
  errorStatus: 0,
  data: null
};

function formatDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

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

function useQueryParams() {
  const location = useLocation();
  return useMemo(() => new URLSearchParams(location.search), [location.search]);
}

export default function AppUrlsPage() {
  const today = formatDate(new Date());
  const queryParams = useQueryParams();
  const initialApp = queryParams.get("app") || "";
  const initialEmployeeId = queryParams.get("employee_id") || "";
  const initialPreset = queryParams.get("preset") || "today";
  const initialDateFrom = queryParams.get("date_from") || "";
  const initialDateTo = queryParams.get("date_to") || "";

  const [appName, setAppName] = useState(initialApp);
  const [filters, setFilters] = useState({
    employeeId: initialEmployeeId,
    preset: initialPreset,
    dateFrom: initialDateFrom,
    dateTo: initialDateTo
  });
  const [draftDates, setDraftDates] = useState({
    dateFrom: initialDateFrom || today,
    dateTo: initialDateTo || today
  });
  const [state, setState] = useState(emptyState);
  const [userQuery, setUserQuery] = useState("");
  const [tableSearchTerm, setTableSearchTerm] = useState("");
  const [tableSearchQuery, setTableSearchQuery] = useState("");
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 20;
  const fromWrapRef = useRef(null);
  const toWrapRef = useRef(null);
  const fromPickerRef = useRef(null);
  const toPickerRef = useRef(null);

  useEffect(() => {
    setAppName(initialApp);
    setFilters((prev) => ({
      ...prev,
      employeeId: initialEmployeeId,
      preset: initialPreset,
      dateFrom: initialDateFrom,
      dateTo: initialDateTo
    }));
    setDraftDates({
      dateFrom: initialDateFrom || today,
      dateTo: initialDateTo || today
    });
    setPage(1);
  }, [initialApp, initialEmployeeId, initialPreset, initialDateFrom, initialDateTo, today]);

  useEffect(() => {
    let active = true;
    async function loadUrls() {
      setState((prev) => ({ ...prev, loading: true, error: "", errorStatus: 0 }));
      try {
        const params = new URLSearchParams();
        if (appName) {
          params.set("app", appName);
        }
        if (filters.employeeId) {
          params.set("employee_id", filters.employeeId);
        }
        if (filters.preset) {
          params.set("preset", filters.preset);
        } else {
          if (filters.dateFrom) {
            params.set("date_from", filters.dateFrom);
          }
          if (filters.dateTo) {
            params.set("date_to", filters.dateTo);
          }
        }
        const url = params.toString()
          ? `/api/dashboard/app-urls?${params.toString()}`
          : "/api/dashboard/app-urls";
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
            error: error?.message || "Unable to load app URLs.",
            errorStatus: error?.status || 0,
            data: null
          });
        }
      }
    }

    loadUrls();
    return () => {
      active = false;
    };
  }, [appName, filters]);

  useEffect(() => {
    const handle = setTimeout(() => {
      setTableSearchQuery(tableSearchTerm.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(handle);
  }, [tableSearchTerm]);

  const data = state.data || {};
  const employees = data.employees || [];
  const availableDates = data.available_dates || [];
  const urlRows = data.url_rows || [];
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
      return urlRows;
    }
    const term = tableSearchQuery.toLowerCase();
    return urlRows.filter((row) =>
      String(row.url || "").toLowerCase().includes(term)
    );
  }, [urlRows, tableSearchQuery]);

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
  }, [filters, appName]);

  useEffect(() => {
    if (!window.flatpickr) {
      return;
    }
    const enabledDates = availableDates.length ? availableDates : [];
    const baseConfig = {
      wrap: true,
      altInput: true,
      altFormat: "d-m-Y",
      dateFormat: "Y-m-d",
      altInputClass: "date-input flatpickr-input",
      enable: enabledDates,
      allowInput: false,
      disableMobile: true
    };

    if (fromWrapRef.current && !fromPickerRef.current) {
      fromPickerRef.current = window.flatpickr(fromWrapRef.current, {
        ...baseConfig,
        onChange: (_selected, dateStr) => {
          setDraftDates((prev) => ({ ...prev, dateFrom: dateStr }));
        }
      });
    }
    if (toWrapRef.current && !toPickerRef.current) {
      toPickerRef.current = window.flatpickr(toWrapRef.current, {
        ...baseConfig,
        onChange: (_selected, dateStr) => {
          setDraftDates((prev) => ({ ...prev, dateTo: dateStr }));
        }
      });
    }

    if (fromPickerRef.current) {
      fromPickerRef.current.set("enable", enabledDates);
      if (draftDates.dateFrom) {
        fromPickerRef.current.setDate(draftDates.dateFrom, false);
      } else {
        fromPickerRef.current.clear();
      }
    }
    if (toPickerRef.current) {
      toPickerRef.current.set("enable", enabledDates);
      if (draftDates.dateTo) {
        toPickerRef.current.setDate(draftDates.dateTo, false);
      } else {
        toPickerRef.current.clear();
      }
    }
  }, [availableDates, draftDates.dateFrom, draftDates.dateTo]);

  useEffect(() => {
    return () => {
      if (fromPickerRef.current) {
        fromPickerRef.current.destroy();
      }
      if (toPickerRef.current) {
        toPickerRef.current.destroy();
      }
    };
  }, []);

  function handleSelectEmployee(id) {
    setFilters((prev) => ({ ...prev, employeeId: id || "" }));
  }

  function handlePreset(preset) {
    const now = new Date();
    if (preset === "today") {
      const date = formatDate(now);
      setFilters((prev) => ({ ...prev, preset: "today", dateFrom: "", dateTo: "" }));
      setDraftDates({ dateFrom: date, dateTo: date });
    } else if (preset === "yesterday") {
      const yesterday = new Date(now);
      yesterday.setDate(now.getDate() - 1);
      const date = formatDate(yesterday);
      setFilters((prev) => ({ ...prev, preset: "yesterday", dateFrom: "", dateTo: "" }));
      setDraftDates({ dateFrom: date, dateTo: date });
    } else {
      setFilters((prev) => ({ ...prev, preset: "all", dateFrom: "", dateTo: "" }));
      setDraftDates({ dateFrom: "", dateTo: "" });
    }
  }

  function handleApply(event) {
    event.preventDefault();
    if (!draftDates.dateFrom && !draftDates.dateTo) {
      const now = new Date();
      const date = formatDate(now);
      setFilters((prev) => ({ ...prev, preset: "today", dateFrom: "", dateTo: "" }));
      setDraftDates({ dateFrom: date, dateTo: date });
      return;
    }
    setFilters((prev) => ({
      ...prev,
      preset: "",
      dateFrom: draftDates.dateFrom,
      dateTo: draftDates.dateTo
    }));
  }

  if (state.loading) {
    return (
      <div className="card p-4 text-center">
        <div className="spinner" />
        <p className="mb-0">Loading app URLs...</p>
      </div>
    );
  }

  return (
    <>
      <div className="gallery-header">
        <h2>App URLs</h2>
        <div className="gallery-actions">
          <Link to="/app-usage" className="shot-btn">
            Back to App Usage
          </Link>
        </div>
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
                const statusLabel = employee.status || "Offline";
                const statusKey = statusLabel.toLowerCase();
                return (
                  <button
                    key={employee.id}
                    type="button"
                    className={`user-chip ${
                      String(employee.id) === String(selectedId) ? "active" : ""
                    }`}
                    onClick={() => handleSelectEmployee(String(employee.id))}
                  >
                    <span className={`status-dot status-${statusKey}`} />
                    <span className="user-name">{employee.name}</span>
                    <span className="user-status">({statusLabel})</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="screen-right">
          <div className="shot-toolbar">
            <div className="shot-info">
              {appName ? (
                <>
                  Application: <strong>{appName}</strong>
                </>
              ) : (
                "Choose an application from App Usage."
              )}
            </div>
            <form className="shot-filter" onSubmit={handleApply}>
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
              </div>
              <label>
                <span>From</span>
                <div className="date-picker-wrap" ref={fromWrapRef}>
                  <input type="text" className="date-input" data-input />
                  <button type="button" className="calendar-trigger" title="Open calendar" data-toggle>
                    <i className="bi bi-calendar3" />
                  </button>
                </div>
              </label>
              <label>
                <span>To</span>
                <div className="date-picker-wrap" ref={toWrapRef}>
                  <input type="text" className="date-input" data-input />
                  <button type="button" className="calendar-trigger" title="Open calendar" data-toggle>
                    <i className="bi bi-calendar3" />
                  </button>
                </div>
              </label>
              <button type="submit" className="shot-btn primary">
                Apply
              </button>
              <button
                type="button"
                className={`shot-btn ${filters.preset === "all" ? "active" : ""}`}
                onClick={() => handlePreset("all")}
              >
                Reset
              </button>
            </form>
            <div className="usage-total">
              Total Time: {data.total_time || "0s"}
            </div>
          </div>

          <div className="card p-3 usage-card">
            <div className="table-controls">
              <div className="table-length">Show {PAGE_SIZE} entries</div>
              <label className="table-search" htmlFor="app-url-search">
                <span>Search:</span>
                <input
                  id="app-url-search"
                  type="text"
                  value={tableSearchTerm}
                  onChange={(event) => setTableSearchTerm(event.target.value)}
                  placeholder="Search URLs"
                />
              </label>
            </div>
            <div className="table-responsive">
              <table className="table table-dark table-striped table-hover align-middle">
                <thead>
                  <tr>
                    <th>URL</th>
                    <th>Total Time</th>
                    <th>Share</th>
                  </tr>
                </thead>
                <tbody>
                  {pagedRows.length ? (
                    pagedRows.map((row) => (
                      <tr key={row.url}>
                        <td className="text-truncate" style={{ maxWidth: "380px" }}>
                          {row.url ? (
                            (() => {
                              const href = normalizeUrl(row.url);
                              if (!href) {
                                return row.url;
                              }
                              return (
                                <a
                                  href={href}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-info text-decoration-none"
                                >
                                  {row.url}
                                </a>
                              );
                            })()
                          ) : (
                            "-"
                          )}
                        </td>
                        <td>{row.duration}</td>
                        <td>{row.percent}%</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan="3">No URL data yet.</td>
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
