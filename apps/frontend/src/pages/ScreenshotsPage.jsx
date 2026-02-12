import { useEffect, useMemo, useRef, useState } from "react";
import { apiFetch } from "../lib/api.js";
import TablePagination from "../components/TablePagination.jsx";
import { useConfirm } from "../components/ConfirmDialog.jsx";

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

export default function ScreenshotsPage() {
  const today = formatDate(new Date());
  const isReadOnly = typeof window !== "undefined" && Boolean(window.__WZ_READ_ONLY__);
  const [filters, setFilters] = useState({
    employeeId: "",
    preset: "today",
    nickname: "",
    dateFrom: "",
    dateTo: ""
  });
  const [draftDates, setDraftDates] = useState({
    dateFrom: today,
    dateTo: today
  });
  const [page, setPage] = useState(1);
  const [state, setState] = useState(emptyState);
  const [userQuery, setUserQuery] = useState("");
  const [previewIndex, setPreviewIndex] = useState(-1);
  const [refreshKey, setRefreshKey] = useState(0);
  const [selectedShots, setSelectedShots] = useState(() => new Set());
  const [deleteStatus, setDeleteStatus] = useState(null);
  const confirm = useConfirm();
  const WARNING_MINUTES = 30;
  const DANGER_MINUTES = 120;
  const fromWrapRef = useRef(null);
  const toWrapRef = useRef(null);
  const fromPickerRef = useRef(null);
  const toPickerRef = useRef(null);
  const [availableNicknames, setAvailableNicknames] = useState([]);

  useEffect(() => {
    let active = true;
    async function loadScreenshots() {
      setState((prev) => ({ ...prev, loading: true, error: "" }));
      try {
        const params = new URLSearchParams();
        if (filters.employeeId) {
          params.set("employee_id", filters.employeeId);
        }
        if (filters.nickname) {
          params.set("nickname", filters.nickname);
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
        if (page) {
          params.set("page", String(page));
        }
        const url = params.toString()
          ? `/api/dashboard/screenshots?${params.toString()}`
          : "/api/dashboard/screenshots";
        const data = await apiFetch(url);
        if (active) {
          setState({ loading: false, error: "", data });
        }
      } catch (error) {
        if (error?.data?.redirect) {
          window.location.href = error.data.redirect;
          return;
        }
        if (active) {
          setState({
            loading: false,
            error: error?.message || "Unable to load screenshots.",
            data: null
          });
        }
      }
    }

    loadScreenshots();
    return () => {
      active = false;
    };
  }, [filters, page, refreshKey]);

  useEffect(() => {
    setSelectedShots(new Set());
  }, [filters, page]);

  const data = state.data || {};
  const employees = data.employees || [];
  const serverNow = data.server_now || "";
  const availableDates = data.available_dates || [];
  const nicknames =
    availableNicknames.length > 0
      ? availableNicknames
      : data.nicknames || [];
  const selectedId = data.selected_employee_id
    ? String(data.selected_employee_id)
    : filters.employeeId;
  const selectedNickname = filters.nickname || "";

  useEffect(() => {
    if (!Array.isArray(data.nicknames) || !data.nicknames.length) {
      return;
    }
    setAvailableNicknames((prev) => {
      const seen = new Set(prev);
      const next = [...prev];
      data.nicknames.forEach((name) => {
        if (name && !seen.has(name)) {
          seen.add(name);
          next.push(name);
        }
      });
      return next;
    });
  }, [data.nicknames]);

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

  function formatGap(minutes) {
    if (minutes === null || minutes === undefined) {
      return "";
    }
    const total = Math.max(0, Math.round(minutes));
    const hours = Math.floor(total / 60);
    const mins = total % 60;
    if (hours > 0) {
      return `${hours}h ${mins}m`;
    }
    return `${mins}m`;
  }

  function getMinutesSince(isoValue) {
    if (!isoValue) {
      return null;
    }
    const nowTime = serverNow ? Date.parse(serverNow) : Date.now();
    const timeValue = Date.parse(isoValue);
    if (!Number.isFinite(timeValue)) {
      return null;
    }
    return Math.max(0, (nowTime - timeValue) / 60000);
  }

  function formatTimeLabel(isoValue) {
    if (!isoValue) {
      return "";
    }
    const date = new Date(isoValue);
    if (!Number.isFinite(date.getTime())) {
      return "";
    }
    const hours24 = date.getHours();
    const minutes = String(date.getMinutes()).padStart(2, "0");
    const period = hours24 >= 12 ? "PM" : "AM";
    const hours12 = hours24 % 12 || 12;
    return `${hours12}:${minutes} ${period}`;
  }

  function formatLocalDateTime(isoValue, fallback = "") {
    if (!isoValue) {
      return fallback || "";
    }
    const date = new Date(isoValue);
    if (!Number.isFinite(date.getTime())) {
      return fallback || "";
    }
    const day = String(date.getDate()).padStart(2, "0");
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const year = date.getFullYear();
    const hours = String(date.getHours()).padStart(2, "0");
    const minutes = String(date.getMinutes()).padStart(2, "0");
    const seconds = String(date.getSeconds()).padStart(2, "0");
    return `${day}/${month}/${year}, ${hours}:${minutes}:${seconds}`;
  }

  const selectedLastShot = selectedEmployee?.last_screenshot_uploaded_at || "";
  const selectedLastCapture = selectedEmployee?.last_screenshot_captured_at || "";
  const selectedGapMinutes = getMinutesSince(selectedLastShot);
  const gapSeverity =
    selectedGapMinutes === null
      ? ""
      : selectedGapMinutes >= DANGER_MINUTES
      ? "danger"
      : selectedGapMinutes >= WARNING_MINUTES
      ? "warning"
      : "";
  const shots = data.shots || [];
  const allSelected = shots.length > 0 && shots.every((shot) => selectedShots.has(shot.id));
  const pagination = data.pagination || {};
  const currentPage = pagination.page || page;
  const totalPages = pagination.total_pages || 1;
  const pageSize = pagination.page_size || shots.length || 20;
  const totalItems =
    typeof pagination.total_items === "number"
      ? pagination.total_items
      : shots.length;
  const startEntry = totalItems ? (currentPage - 1) * pageSize + 1 : 0;
  const endEntry = totalItems ? Math.min(currentPage * pageSize, totalItems) : 0;
  const previewShot = previewIndex >= 0 ? shots[previewIndex] : null;
  const previewUrl = previewShot?.image_url || "";

  useEffect(() => {
    if (previewIndex >= shots.length) {
      setPreviewIndex(-1);
    }
  }, [shots, previewIndex]);

  const gapMessage =
    selectedGapMinutes === null
      ? "No screenshots received yet for this user."
      : `No screenshots received for ${formatGap(selectedGapMinutes)}.`;
  const lastCaptureLabel = formatTimeLabel(selectedLastCapture);
  const gapStartLabel = formatTimeLabel(selectedLastShot);
  const gapEndLabel = formatTimeLabel(serverNow);
  const gapRangeMessage =
    selectedGapMinutes !== null && gapStartLabel && gapEndLabel
      ? `No screenshots received between ${gapStartLabel} to ${gapEndLabel} due to PC Screen Lock or PC Signout.`
      : gapMessage;

  function handleSelectEmployee(id) {
    setFilters((prev) => ({ ...prev, employeeId: id || "", nickname: "" }));
    setPage(1);
  }

  function handleSelectNickname(value) {
    setFilters((prev) => ({ ...prev, nickname: value || "", employeeId: "" }));
    setPage(1);
  }

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
    if (fromPickerRef.current) {
      fromPickerRef.current.destroy();
      fromPickerRef.current = null;
    }
    if (toPickerRef.current) {
      toPickerRef.current.destroy();
      toPickerRef.current = null;
    }
  }, [filters.preset]);

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
    setPage(1);
  }

  function handleApply(event) {
    event.preventDefault();
    if (!draftDates.dateFrom && !draftDates.dateTo) {
      const now = new Date();
      const date = formatDate(now);
      setFilters((prev) => ({ ...prev, preset: "today", dateFrom: "", dateTo: "" }));
      setDraftDates({ dateFrom: date, dateTo: date });
      setPage(1);
      return;
    }
    setFilters((prev) => ({
      ...prev,
      preset: "",
      dateFrom: draftDates.dateFrom,
      dateTo: draftDates.dateTo
    }));
    setPage(1);
  }

  function formatLocalDateTime(value) {
    if (!value) {
      return "";
    }
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) {
      return "";
    }
    const day = String(date.getDate()).padStart(2, "0");
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const year = date.getFullYear();
    const hours = String(date.getHours()).padStart(2, "0");
    const minutes = String(date.getMinutes()).padStart(2, "0");
    const seconds = String(date.getSeconds()).padStart(2, "0");
    return `${day}/${month}/${year}, ${hours}:${minutes}:${seconds}`;
  }

  function startDeleteStatus(label, total = null) {
    setDeleteStatus({
      open: true,
      status: "pending",
      label,
      total,
      deleted: 0,
      startedAt: new Date().toISOString(),
      finishedAt: "",
      error: ""
    });
  }

  function finishDeleteStatus(count) {
    setDeleteStatus((prev) => ({
      ...(prev || {}),
      status: "completed",
      deleted: typeof count === "number" ? count : prev?.deleted || 0,
      finishedAt: new Date().toISOString()
    }));
  }

  function failDeleteStatus(error) {
    setDeleteStatus((prev) => ({
      ...(prev || {}),
      status: "failed",
      error: error?.message || "Unable to delete screenshots."
    }));
  }

  async function handleDeleteAll() {
    const confirmed = await confirm({
      title: "Delete All Screenshots",
      message: "Are you sure? All screenshots will be deleted.",
      confirmText: "Delete All",
      confirmVariant: "danger"
    });
    if (!confirmed) {
      return;
    }
    try {
      startDeleteStatus("Deleting all screenshots");
      const res = await apiFetch("/api/dashboard/screenshots/delete-all", { method: "POST" });
      finishDeleteStatus(res?.count);
      setRefreshKey((prev) => prev + 1);
    } catch (error) {
      failDeleteStatus(error);
      if (error?.data?.redirect) {
        window.location.href = error.data.redirect;
      }
    }
  }

  async function handleDeleteEmployee() {
    if (!selectedEmployee) {
      return;
    }
    const confirmed = await confirm({
      title: "Delete Employee Screenshots",
      message: `Delete all screenshots for ${selectedEmployee.name}?`,
      confirmText: "Delete All",
      confirmVariant: "danger"
    });
    if (!confirmed) {
      return;
    }
    try {
      startDeleteStatus(`Deleting screenshots for ${selectedEmployee.name || "employee"}`);
      const res = await apiFetch("/api/dashboard/screenshots/delete-employee", {
        method: "POST",
        body: JSON.stringify({ employee_id: selectedEmployee.id })
      });
      finishDeleteStatus(res?.count);
      setRefreshKey((prev) => prev + 1);
    } catch (error) {
      failDeleteStatus(error);
      if (error?.data?.redirect) {
        window.location.href = error.data.redirect;
      }
    }
  }

  async function handleDeleteShot(id) {
    const confirmed = await confirm({
      title: "Delete Screenshot",
      message: "Delete this screenshot?",
      confirmText: "Delete",
      confirmVariant: "danger"
    });
    if (!confirmed) {
      return;
    }
    try {
      await apiFetch(`/api/dashboard/screenshots/${id}/delete`, { method: "DELETE" });
      setRefreshKey((prev) => prev + 1);
    } catch (error) {
      if (error?.data?.redirect) {
        window.location.href = error.data.redirect;
      }
    }
  }

  async function handleDeleteSelected() {
    if (!selectedShots.size) {
      return;
    }
    const confirmed = await confirm({
      title: "Delete Selected Screenshots",
      message: `Delete ${selectedShots.size} selected screenshot(s)?`,
      confirmText: "Delete Selected",
      confirmVariant: "danger"
    });
    if (!confirmed) {
      return;
    }
    try {
      startDeleteStatus("Deleting selected screenshots", selectedShots.size);
      const res = await apiFetch("/api/dashboard/screenshots/delete-selected", {
        method: "POST",
        body: JSON.stringify({ ids: Array.from(selectedShots) })
      });
      finishDeleteStatus(res?.count ?? selectedShots.size);
      setSelectedShots(new Set());
      setRefreshKey((prev) => prev + 1);
    } catch (error) {
      failDeleteStatus(error);
      if (error?.data?.redirect) {
        window.location.href = error.data.redirect;
      }
    }
  }

  function toggleShotSelection(shotId) {
    setSelectedShots((prev) => {
      const next = new Set(prev);
      if (next.has(shotId)) {
        next.delete(shotId);
      } else {
        next.add(shotId);
      }
      return next;
    });
  }

  function handleSelectAllCurrent() {
    const shots = data.shots || [];
    setSelectedShots((prev) => {
      const next = new Set(prev);
      const allSelected = shots.every((shot) => next.has(shot.id));
      if (allSelected) {
        shots.forEach((shot) => next.delete(shot.id));
      } else {
        shots.forEach((shot) => next.add(shot.id));
      }
      return next;
    });
  }

  if (state.loading) {
    return (
      <div className="card p-4 text-center">
        <div className="spinner" />
        <p className="mb-0">Loading screenshots...</p>
      </div>
    );
  }

  return (
    <>
      <div className="gallery-header">
        <h2>Screenshot Gallery</h2>
        <div className="gallery-actions">
          <div className="gallery-select-wrap">
            <select
              className="gallery-select"
              value={selectedNickname}
              onChange={(event) => handleSelectNickname(event.target.value)}
            >
              <option value="">Nick Name</option>
              {nicknames.map((nickname) => (
                <option key={nickname} value={nickname}>
                  {nickname}
                </option>
              ))}
            </select>
          </div>
          {!isReadOnly ? (
            <>
              <button type="button" className="shot-danger" onClick={handleDeleteAll}>
                Delete all User data
              </button>
              <button
                type="button"
                className="shot-danger outline"
                onClick={handleDeleteSelected}
                disabled={!selectedShots.size}
              >
                Delete Selected
              </button>
              {selectedEmployee ? (
                <button
                  type="button"
                  className="shot-danger outline"
                  onClick={handleDeleteEmployee}
                >
                  Delete All Screenshots - {selectedEmployee.name}
                </button>
              ) : null}
            </>
          ) : null}
        </div>
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
                const minutesSince = getMinutesSince(employee.last_screenshot_uploaded_at);
                const badgeLevel =
                  minutesSince === null
                    ? "muted"
                    : minutesSince >= DANGER_MINUTES
                    ? "danger"
                    : minutesSince >= WARNING_MINUTES
                    ? "warning"
                    : "ok";
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
                    <span className={`gap-badge gap-${badgeLevel}`}>
                      {minutesSince === null ? "No shots" : `Last: ${formatGap(minutesSince)}`}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="screen-right">
          {selectedEmployee && gapSeverity ? (
            <div className={`alert alert-${gapSeverity}`}>
              {selectedEmployee ? `${selectedEmployee.name}: ` : ""}{gapRangeMessage}
              {lastCaptureLabel ? ` Last captured at ${lastCaptureLabel}.` : ""}
            </div>
          ) : selectedEmployee && selectedGapMinutes === null ? (
            <div className="alert alert-warning">
              {selectedEmployee ? `${selectedEmployee.name}: ` : ""}{gapMessage}
            </div>
          ) : null}
          {deleteStatus?.open ? (
            <div className="card p-3 mb-3">
              <div className="d-flex align-items-start justify-content-between gap-3 flex-wrap">
                <div>
                  <h5 className="mb-1">{deleteStatus.label || "Deleting screenshots"}</h5>
                  <div className="text-secondary">
                    {deleteStatus.status === "failed"
                      ? "Delete failed."
                      : deleteStatus.status === "completed"
                        ? "Delete completed."
                        : "Delete in progress..."}
                  </div>
                  {deleteStatus.finishedAt ? (
                    <div className="text-secondary small mt-1">
                      Completed at: {formatLocalDateTime(deleteStatus.finishedAt)}
                    </div>
                  ) : null}
                </div>
                <button
                  type="button"
                  className="btn btn-outline-light btn-sm"
                  onClick={() => setDeleteStatus((prev) => (prev ? { ...prev, open: false } : prev))}
                >
                  Close
                </button>
              </div>
              <div className="mt-3">
                <div className="mb-2">
                  {deleteStatus.total ? (
                    <>
                      <strong>{deleteStatus.deleted || 0}</strong> /{" "}
                      <strong>{deleteStatus.total}</strong> items deleted
                    </>
                  ) : (
                    <>
                      <strong>{deleteStatus.deleted || 0}</strong> items deleted
                    </>
                  )}
                </div>
                <div className="progress mb-2" style={{ height: "8px" }}>
                  <div
                    className={`progress-bar ${deleteStatus.status === "failed" ? "bg-danger" : "bg-success"}`}
                    style={{
                      width: deleteStatus.total
                        ? `${Math.min(100, Math.round(((deleteStatus.deleted || 0) / deleteStatus.total) * 100))}%`
                        : deleteStatus.status === "completed"
                          ? "100%"
                          : "35%"
                    }}
                  />
                </div>
                {deleteStatus.startedAt ? (
                  <div className="text-secondary small">
                    Started at: {formatLocalDateTime(deleteStatus.startedAt)}
                  </div>
                ) : null}
                {deleteStatus.error ? (
                  <div className="alert alert-danger mt-2">{deleteStatus.error}</div>
                ) : null}
              </div>
            </div>
          ) : null}
          <div className="shot-toolbar">
            <div className="shot-info" style={{ marginTop: "5px" }}>
              Showing: {selectedNickname || (selectedEmployee ? selectedEmployee.name : "All Users")}
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
                <button
                  type="button"
                  className={`shot-btn ${filters.preset === "all" ? "active" : ""}`}
                  onClick={() => handlePreset("all")}
                >
                  All Images
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

            {!isReadOnly ? (
              <div className="toolbar-actions">
                <button
                  type="button"
                  className="shot-btn"
                  onClick={handleSelectAllCurrent}
                  disabled={shots.length === 0}
                >
                  {allSelected ? "Unselect All" : "Select All"}
                </button>
              </div>
            ) : null}
          </div>

          <div className="gallery">
            {shots.length ? (
              shots.map((shot, index) => (
                <div className="shot-card" key={shot.id}>
                  <div className="shot-meta">
                    <span className="shot-name">{shot.employee}</span>
                    <span className="shot-time">
                      Captured: {formatLocalDateTime(shot.captured_at_iso, shot.captured_at_display || shot.captured_at || "-")}
                    </span>
                  </div>
                  <div className="shot-image-wrap">
                    {!isReadOnly ? (
                      <label className="shot-select">
                        <input
                          type="checkbox"
                          checked={selectedShots.has(shot.id)}
                          onChange={() => toggleShotSelection(shot.id)}
                        />
                        <span>Select</span>
                      </label>
                    ) : null}
                    <img
                      src={shot.image_url}
                      alt={shot.employee}
                      onClick={() => setPreviewIndex(index)}
                    />
                    <span className="shot-uploaded">
                      Uploaded: {shot.uploaded_at_display || "-"}
                    </span>
                  </div>
                  {!isReadOnly ? (
                    <div className="shot-actions">
                      <button
                        type="button"
                        className="link-danger"
                        onClick={() => handleDeleteShot(shot.id)}
                      >
                        Delete
                      </button>
                    </div>
                  ) : null}
                </div>
              ))
            ) : (
              <p>No screenshots yet.</p>
            )}
          </div>

          <div className="table-footer mt-4">
            <div className="table-info">
              Showing {startEntry} to {endEntry} of {totalItems} entries
            </div>
            <TablePagination
              page={currentPage}
              totalPages={totalPages}
              onPageChange={setPage}
              showPageLinks
              showPageLabel
              maxPageLinks={7}
            />
          </div>
        </div>
      </div>

      {previewUrl ? (
        <div className="modal-overlay" onClick={() => setPreviewIndex(-1)}>
          <div
            className="preview-modal"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              className="preview-nav preview-nav-prev"
              onClick={() => setPreviewIndex((idx) => Math.max(0, idx - 1))}
              disabled={previewIndex <= 0}
            >
              <span className="preview-nav-icon">‹</span>
            </button>
            <img
              src={previewUrl}
              alt={previewShot?.employee || "Screenshot preview"}
              className="preview-image"
            />
            <button
              type="button"
              className="preview-nav preview-nav-next"
              onClick={() =>
                setPreviewIndex((idx) => Math.min(shots.length - 1, idx + 1))
              }
              disabled={previewIndex >= shots.length - 1}
            >
              <span className="preview-nav-icon">›</span>
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}
