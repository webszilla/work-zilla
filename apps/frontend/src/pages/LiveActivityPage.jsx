import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "../lib/api.js";
import { formatDeviceDateTime } from "../lib/datetime.js";
import TablePagination from "../components/TablePagination.jsx";

const URL_LIMIT = 80;
const APP_LIMIT = 24;
const WINDOW_LIMIT = 60;

function limitText(value, limit) {
  const text = String(value || "");
  if (!text) {
    return "";
  }
  if (text.length <= limit) {
    return text;
  }
  return `${text.slice(0, Math.max(limit - 3, 0))}...`;
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

function formatUrlCell(url) {
  if (!url) {
    return { text: "-", href: "", full: "" };
  }
  const raw = String(url);
  const clipped =
    raw.length > URL_LIMIT ? `${raw.slice(0, URL_LIMIT - 3)}...` : raw;
  return { text: clipped, href: normalizeUrl(raw), full: raw };
}

export default function LiveActivityPage() {
  const [employees, setEmployees] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [employeeSearchTerm, setEmployeeSearchTerm] = useState("");
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const [pageSize, setPageSize] = useState(20);
  const [tableSearchTerm, setTableSearchTerm] = useState("");
  const [tableSearchQuery, setTableSearchQuery] = useState("");
  const [sortConfig, setSortConfig] = useState({
    key: "start",
    direction: "desc",
  });
  const PAGE_SIZE = 20;

  useEffect(() => {
    let active = true;
    async function loadEmployees() {
      try {
        const data = await apiFetch("/api/dashboard/employees");
        if (!active) {
          return;
        }
        const sorted = (data.employees || []).slice().sort((a, b) =>
          a.name.localeCompare(b.name)
        );
        setEmployees(sorted);
        setLoading(false);
      } catch (fetchError) {
        if (fetchError?.data?.redirect) {
          window.location.href = fetchError.data.redirect;
          return;
        }
        if (active) {
          setError(fetchError?.message || "Unable to load users.");
          setLoading(false);
        }
      }
    }

    loadEmployees();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    setPage(1);
  }, [selectedId]);

  useEffect(() => {
    const handle = setTimeout(() => {
      setTableSearchQuery(tableSearchTerm.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(handle);
  }, [tableSearchTerm]);

  useEffect(() => {
    let active = true;
    async function loadLogs() {
      setLoadingLogs(true);
      try {
        const params = new URLSearchParams();
        if (selectedId) {
          params.set("employee_id", selectedId);
        }
        if (tableSearchQuery) {
          params.set("q", tableSearchQuery);
        }
        if (sortConfig?.key) {
          params.set("sort", sortConfig.key);
          params.set("dir", sortConfig.direction);
        }
        params.set("page", page);
        params.set("page_size", PAGE_SIZE);
        const url = `/api/dashboard/activity/live?${params.toString()}`;
        const data = await apiFetch(url);
        if (active) {
          setLogs(data.logs || []);
          const pagination = data.pagination || {};
          const nextTotalPages = pagination.total_pages || 1;
          const nextPage = pagination.page || page;
          const nextPageSize = pagination.page_size || PAGE_SIZE;
          const nextTotalItems =
            typeof pagination.total_items === "number"
              ? pagination.total_items
              : (data.logs || []).length;
          setTotalPages(nextTotalPages);
          setTotalItems(nextTotalItems);
          setPageSize(nextPageSize);
          if (nextPage !== page) {
            setPage(nextPage);
          }
          setLoadingLogs(false);
        }
      } catch (fetchError) {
        if (fetchError?.data?.redirect) {
          window.location.href = fetchError.data.redirect;
          return;
        }
        if (active) {
          setError(fetchError?.message || "Unable to load activity.");
          setLoadingLogs(false);
        }
      }
    }

    loadLogs();
    const interval = setInterval(loadLogs, 5000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [page, selectedId, sortConfig, tableSearchQuery]);

  const filteredEmployees = useMemo(() => {
    if (!employeeSearchTerm) {
      return employees;
    }
    const term = employeeSearchTerm.toLowerCase().trim();
    return employees.filter((employee) =>
      employee.name.toLowerCase().includes(term)
    );
  }, [employees, employeeSearchTerm]);

  const startEntry = totalItems ? (page - 1) * pageSize + 1 : 0;
  const endEntry = totalItems
    ? Math.min(page * pageSize, totalItems)
    : 0;

  const handleSort = (key) => {
    setSortConfig((current) => {
      if (current.key === key) {
        return {
          key,
          direction: current.direction === "asc" ? "desc" : "asc",
        };
      }
      return { key, direction: "asc" };
    });
    setPage(1);
  };

  const handleSortKeyDown = (event, key) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      handleSort(key);
    }
  };

  if (loading) {
    return (
      <div className="card p-4 text-center">
        <div className="spinner" />
        <p className="mb-0">Loading users...</p>
      </div>
    );
  }

  return (
    <>
      <div style={{ marginBottom: "16px" }}>
        <h2 className="page-title">Live Activity</h2>
      </div>

      {error ? <div className="alert alert-danger">{error}</div> : null}

      <div className="activity-layout">
        <div className="activity-left">
          <div className="user-panel">
            <div className="user-panel-header">
              <div>Users</div>
              <div className="user-search">
                <input
                  type="text"
                  placeholder="Search user"
                  value={employeeSearchTerm}
                  onChange={(event) =>
                    setEmployeeSearchTerm(event.target.value)
                  }
                />
              </div>
            </div>
            <div className="user-list">
              <button
                type="button"
                className={`user-chip all ${!selectedId ? "active" : ""}`}
                onClick={() => setSelectedId("")}
              >
                All Users
              </button>
              {filteredEmployees.map((employee) => (
                <button
                  key={employee.id}
                  type="button"
                  className={`user-chip ${
                    String(employee.id) === String(selectedId) ? "active" : ""
                  }`}
                  onClick={() => setSelectedId(String(employee.id))}
                >
                  {employee.name}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="activity-right">
          <div className="table-controls">
            <div className="table-length">Show {pageSize} entries</div>
            <label className="table-search" htmlFor="activity-search">
              <span>Search:</span>
              <input
                id="activity-search"
                type="text"
                value={tableSearchTerm}
                onChange={(event) => setTableSearchTerm(event.target.value)}
                placeholder="Search activity"
              />
            </label>
          </div>
          <div className="table-responsive">
            <table className="table table-dark table-striped table-hover align-middle activity-table">
              <thead>
                <tr>
                  <th
                    className={`sortable ${
                      sortConfig.key === "employee"
                        ? `sorted-${sortConfig.direction}`
                        : ""
                    }`}
                    role="button"
                    tabIndex={0}
                    onClick={() => handleSort("employee")}
                    onKeyDown={(event) => handleSortKeyDown(event, "employee")}
                  >
                    Employee
                  </th>
                  <th
                    className={`sortable ${
                      sortConfig.key === "app"
                        ? `sorted-${sortConfig.direction}`
                        : ""
                    }`}
                    role="button"
                    tabIndex={0}
                    onClick={() => handleSort("app")}
                    onKeyDown={(event) => handleSortKeyDown(event, "app")}
                  >
                    Application
                  </th>
                  <th
                    className={`sortable ${
                      sortConfig.key === "window"
                        ? `sorted-${sortConfig.direction}`
                        : ""
                    }`}
                    role="button"
                    tabIndex={0}
                    onClick={() => handleSort("window")}
                    onKeyDown={(event) => handleSortKeyDown(event, "window")}
                  >
                    Window
                  </th>
                  <th
                    className={`sortable ${
                      sortConfig.key === "url"
                        ? `sorted-${sortConfig.direction}`
                        : ""
                    }`}
                    role="button"
                    tabIndex={0}
                    onClick={() => handleSort("url")}
                    onKeyDown={(event) => handleSortKeyDown(event, "url")}
                  >
                    URL
                  </th>
                  <th
                    className={`sortable ${
                      sortConfig.key === "start"
                        ? `sorted-${sortConfig.direction}`
                        : ""
                    }`}
                    role="button"
                    tabIndex={0}
                    onClick={() => handleSort("start")}
                    onKeyDown={(event) => handleSortKeyDown(event, "start")}
                  >
                    Time
                  </th>
                </tr>
              </thead>
              <tbody>
                {logs.length ? (
                  logs.map((row, index) => {
                    const urlInfo = formatUrlCell(row.url);
                    return (
                      <tr key={`${row.employee}-${row.start}-${index}`}>
                        <td>{row.employee || "-"}</td>
                        <td title={row.app || "-"}>
                          {limitText(row.app || "-", APP_LIMIT)}
                        </td>
                        <td title={row.window || "-"}>
                          {limitText(row.window || "-", WINDOW_LIMIT)}
                        </td>
                        <td className="activity-url-cell">
                          {urlInfo.href ? (
                            <>
                              <a
                                className="activity-url"
                                href={urlInfo.href}
                                target="_blank"
                                rel="noopener noreferrer"
                                title={urlInfo.full}
                              >
                                {urlInfo.text}
                              </a>
                              <span> </span>
                              <a
                                className="activity-url"
                                href={urlInfo.href}
                                target="_blank"
                                rel="noopener noreferrer"
                              >
                                Backlink
                              </a>
                            </>
                          ) : (
                            <span className="activity-url" title={urlInfo.full}>
                              {urlInfo.text}
                            </span>
                          )}
                        </td>
                        <td>{formatDeviceDateTime(row.start)}</td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan="5">
                      {loadingLogs ? "Loading..." : "No activity data yet."}
                    </td>
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
              showPageLabel
              maxPageLinks={7}
            />
          </div>
        </div>
      </div>
    </>
  );
}
