import { useEffect, useMemo, useRef, useState } from "react";
import { apiFetch } from "../lib/api.js";
import TablePagination from "../components/TablePagination.jsx";

const emptyState = {
  loading: true,
  error: "",
  data: null
};

function formatDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export default function WorkActivityLogPage() {
  const today = formatDate(new Date());
  const [filters, setFilters] = useState({
    employeeId: "",
    preset: "today",
    dateFrom: "",
    dateTo: ""
  });
  const [draftDates, setDraftDates] = useState({
    dateFrom: today,
    dateTo: today
  });
  const [state, setState] = useState(emptyState);
  const [userQuery, setUserQuery] = useState("");
  const [tableSearchTerm, setTableSearchTerm] = useState("");
  const [tableSearchQuery, setTableSearchQuery] = useState("");
  const [historyModal, setHistoryModal] = useState({
    open: false,
    rows: [],
    meta: ""
  });
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 20;
  const fromWrapRef = useRef(null);
  const toWrapRef = useRef(null);
  const fromPickerRef = useRef(null);
  const toPickerRef = useRef(null);

  useEffect(() => {
    let active = true;
    async function loadRows() {
      setState((prev) => ({ ...prev, loading: true, error: "" }));
      try {
        const params = new URLSearchParams();
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
          ? `/api/dashboard/work-activity?${params.toString()}`
          : "/api/dashboard/work-activity";
        const data = await apiFetch(url);
        if (!active) {
          return;
        }
        setState({ loading: false, error: "", data });
      } catch (error) {
        if (error?.data?.redirect) {
          window.location.href = error.data.redirect;
          return;
        }
        if (active) {
          setState({
            loading: false,
            error: error?.message || "Unable to load activity log.",
            data: null
          });
        }
      }
    }

    loadRows();
    return () => {
      active = false;
    };
  }, [filters]);

  useEffect(() => {
    setPage(1);
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
  const availableDates = data.available_dates || [];
  const rows = data.rows || [];
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
      return rows;
    }
    const term = tableSearchQuery.toLowerCase();
    return rows.filter((row) => {
      const values = [
        row.employee,
        row.date,
        row.on_time,
        row.off_time,
        row.duration,
        row.history_label,
        row.stop_reason
      ];
      return values.some((value) =>
        String(value || "").toLowerCase().includes(term)
      );
    });
  }, [rows, tableSearchQuery]);

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

  function openHistory(row) {
    const historyRows = row.history || [];
    setHistoryModal({
      open: true,
      rows: historyRows,
      meta: `${row.employee} - ${row.date}`
    });
  }

  if (state.loading) {
    return (
      <div className="card p-4 text-center">
        <div className="spinner" />
        <p className="mb-0">Loading activity log...</p>
      </div>
    );
  }

  return (
    <>
      <div className="gallery-header">
        <h2>Work Activity Log</h2>
      </div>

      {state.error ? (
        <div className="alert alert-danger">{state.error}</div>
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
              Showing: {selectedEmployee ? selectedEmployee.name : "All Users"}
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
          </div>

          <div className="card p-3 usage-card">
            <div className="table-controls">
              <div className="table-length">Show {PAGE_SIZE} entries</div>
              <label className="table-search" htmlFor="work-activity-search">
                <span>Search:</span>
                <input
                  id="work-activity-search"
                  type="text"
                  value={tableSearchTerm}
                  onChange={(event) => setTableSearchTerm(event.target.value)}
                  placeholder="Search activity"
                />
              </label>
            </div>
            <div className="table-responsive">
              <table className="table table-dark table-striped table-hover align-middle">
                <thead>
                  <tr>
                    <th>Employee Name</th>
                    <th>Date</th>
                    <th>PC On Time</th>
                    <th>PC Off / Signout / Sleeping</th>
                    <th>Stop Reason</th>
                    <th>History</th>
                    <th>Duration</th>
                  </tr>
                </thead>
                <tbody>
                  {pagedRows.length ? (
                    pagedRows.map((row, index) => (
                      <tr key={`${row.employee}-${row.date}-${index}`}>
                        <td>{row.employee}</td>
                        <td>{row.date}</td>
                        <td>{row.on_time}</td>
                        <td>{row.off_time}</td>
                        <td>{row.stop_reason || "-"}</td>
                        <td>
                          <button
                            type="button"
                            className="btn btn-link text-info p-0 history-trigger"
                            onClick={() => openHistory(row)}
                          >
                            {row.history_label}
                          </button>
                        </td>
                        <td>{row.duration}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan="7">No activity data yet.</td>
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

      {historyModal.open ? (
        <div className="modal-overlay" onClick={() => setHistoryModal({ open: false, rows: [], meta: "" })}>
          <div className="modal-panel" onClick={(event) => event.stopPropagation()}>
            <h5>On/Off History</h5>
            <div className="text-secondary mb-2">{historyModal.meta}</div>
            <div className="table-responsive">
              <table className="table table-dark table-striped align-middle mb-0">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>On Time</th>
                    <th>PC Off / Signout / Sleeping</th>
                    <th>Stop Reason</th>
                    <th>Duration</th>
                  </tr>
                </thead>
                <tbody>
                  {historyModal.rows.length ? (
                    historyModal.rows.map((entry, idx) => (
                      <tr key={`${entry.on}-${idx}`}>
                        <td>{idx + 1}</td>
                        <td>{entry.on}</td>
                        <td>{entry.off}</td>
                        <td>{entry.stop_reason || "-"}</td>
                        <td>{entry.duration}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan="5">No history available.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="d-flex justify-content-end mt-3">
              <button
                type="button"
                className="modal-close"
                onClick={() => setHistoryModal({ open: false, rows: [], meta: "" })}
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
