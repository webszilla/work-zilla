import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { apiFetch } from "../lib/api.js";
import { formatDeviceDateTime } from "../lib/datetime.js";
import TablePagination from "../components/TablePagination.jsx";
import { useConfirm } from "../components/ConfirmDialog.jsx";

const emptyState = {
  loading: true,
  error: "",
  data: null
};

export default function EmployeesPage() {
  const [state, setState] = useState(emptyState);
  const [searchTerm, setSearchTerm] = useState("");
  const [query, setQuery] = useState("");
  const [addonCount, setAddonCount] = useState(0);
  const [intervalValue, setIntervalValue] = useState("");
  const [notice, setNotice] = useState("");
  const [page, setPage] = useState(1);
  const confirm = useConfirm();
  const PAGE_SIZE = 20;

  function buildEmployeesUrl(searchValue) {
    const params = new URLSearchParams();
    if (searchValue) {
      params.set("q", searchValue);
    }
    return params.toString()
      ? `/api/dashboard/employees?${params.toString()}`
      : "/api/dashboard/employees";
  }

  async function refreshEmployees(searchValue = query) {
    const url = buildEmployeesUrl(searchValue);
    const data = await apiFetch(url);
    setState({ loading: false, error: "", data });
    setAddonCount(0);
    setIntervalValue(data.meta?.screenshot_interval_minutes ?? "");
  }

  useEffect(() => {
    let active = true;
    async function loadEmployees() {
      setNotice("");
      try {
        const data = await apiFetch(buildEmployeesUrl(query));
        if (!active) {
          return;
        }
        setState({ loading: false, error: "", data });
        setAddonCount(0);
        setIntervalValue(data.meta?.screenshot_interval_minutes ?? "");
      } catch (error) {
        if (error?.data?.redirect) {
          window.location.href = error.data.redirect;
          return;
        }
        if (active) {
          setState({
            loading: false,
            error: error?.message || "Unable to load employees.",
            data: null
          });
        }
      }
    }

    loadEmployees();
    return () => {
      active = false;
    };
  }, [query]);

  useEffect(() => {
    const handle = setTimeout(() => {
      setQuery(searchTerm.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(handle);
  }, [searchTerm]);

  const employees = state.data?.employees || [];
  const meta = state.data?.meta || {};
  const subscription = state.data?.subscription || null;
  const companyKey = state.data?.org?.company_key || "-";
  const hrAccess = state.data?.hr_access || {};

  const filteredEmployees = useMemo(() => {
    if (!searchTerm) {
      return employees;
    }
    const term = searchTerm.toLowerCase();
    return employees.filter((employee) =>
      employee.name.toLowerCase().includes(term)
    );
  }, [employees, searchTerm]);

  const totalPages = Math.max(Math.ceil(filteredEmployees.length / PAGE_SIZE), 1);
  const pagedEmployees = useMemo(
    () =>
      filteredEmployees.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [filteredEmployees, page]
  );
  const totalItems = filteredEmployees.length;
  const startEntry = totalItems ? (page - 1) * PAGE_SIZE + 1 : 0;
  const endEntry = totalItems
    ? Math.min(page * PAGE_SIZE, totalItems)
    : 0;

  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages);
    }
  }, [page, totalPages]);

  async function handleDelete(id) {
    const confirmed = await confirm({
      title: "Delete Employee",
      message: "Are you sure you want to delete this employee?",
      confirmText: "Delete",
      confirmVariant: "danger"
    });
    if (!confirmed) {
      return;
    }
    try {
      await apiFetch(`/api/dashboard/employees/${id}/delete`, {
        method: "DELETE"
      });
      setNotice("Employee deleted.");
      await refreshEmployees();
    } catch (error) {
      if (error?.data?.redirect) {
        window.location.href = error.data.redirect;
        return;
      }
      setNotice("");
      setState((prev) => ({
        ...prev,
        error: error?.message || "Unable to delete employee."
      }));
    }
  }

  async function handleIntervalSubmit(event) {
    event.preventDefault();
    setNotice("");
    try {
      const data = await apiFetch("/api/dashboard/employees/screenshot-interval", {
        method: "POST",
        body: JSON.stringify({ interval: intervalValue })
      });
      setNotice(`Screenshot interval updated to ${data.screenshot_interval_minutes} minutes.`);
      await refreshEmployees();
    } catch (error) {
      if (error?.data?.redirect) {
        window.location.href = error.data.redirect;
        return;
      }
      setNotice("");
      setState((prev) => ({
        ...prev,
        error: error?.message || "Unable to update interval."
      }));
    }
  }

  async function handleAddonSubmit(event) {
    event.preventDefault();
    setNotice("");
    try {
      const data = await apiFetch("/api/dashboard/employees/addons", {
        method: "POST",
        body: JSON.stringify({ addon_count: addonCount })
      });
      if (data?.redirect) {
        window.location.href = data.redirect;
        return;
      }
      setNotice("Add-ons updated.");
      setAddonCount(0);
      await refreshEmployees();
    } catch (error) {
      if (error?.data?.redirect) {
        window.location.href = error.data.redirect;
        return;
      }
      setNotice("");
      setState((prev) => ({
        ...prev,
        error: error?.message || "Unable to update add-ons."
      }));
    }
  }

  if (state.loading) {
    return (
      <div className="card p-4 text-center">
        <div className="spinner" />
        <p className="mb-0">Loading employees...</p>
      </div>
    );
  }

  return (
    <>
      <h3 className="page-title">Employees</h3>

      <div className="row g-3 mt-2">
        <div className="col-12 col-lg-10">
          <div className="d-flex flex-wrap gap-2 align-items-center justify-content-between">
            <div className="d-flex gap-2 align-items-center flex-wrap">
              <a href="/dashboard/export/csv/" className="btn btn-success btn-sm">
                Export CSV
              </a>
              <a href="/dashboard/export/pdf/" className="btn btn-danger btn-sm">
                Export PDF
              </a>
            </div>
          </div>

          <p className="text-secondary mt-2 mb-0">
            {meta.employee_limit === 0 ? (
              <>
                Employees: {meta.employee_count ?? 0} / Add-ons:{" "}
                {meta.addon_count ?? 0}
              </>
            ) : (
              <>
                Employees: {meta.employee_count ?? 0} / {meta.employee_limit ?? 0}
                {subscription ? (
                  <span className="ms-2">Add-ons: {meta.addon_count ?? 0}</span>
                ) : null}
              </>
            )}
          </p>

          {notice ? (
            <div className="alert alert-success mt-3 mb-0">{notice}</div>
          ) : null}
          {state.error ? (
            <div className="alert alert-danger mt-3 mb-0">{state.error}</div>
          ) : null}

          <div className="card p-3 mt-3">
            <div className="table-controls">
              <div className="table-length">Show {PAGE_SIZE} entries</div>
              <label className="table-search" htmlFor="employees-search">
                <span>Search:</span>
                <input
                  id="employees-search"
                  type="text"
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  placeholder="Search employees"
                />
              </label>
            </div>
            <div className="table-responsive">
              <table className="table table-dark table-striped table-hover align-middle">
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Name</th>
                    <th>PC Name</th>
                    <th>Company Key</th>
                    <th>Device</th>
                    <th>Status</th>
                    <th>Last Seen</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {pagedEmployees.length ? (
                    pagedEmployees.map((employee) => {
                      const status = employee.status || (employee.is_online ? "Online" : "Offline");
                      let badgeClass = "bg-secondary";
                      if (status === "Online") {
                        badgeClass = "bg-success";
                      } else if (status === "Ideal") {
                        badgeClass = "bg-warning text-dark";
                      }
                      return (
                        <tr key={employee.id}>
                          <td>{employee.id}</td>
                          <td>{employee.name}</td>
                          <td>{employee.pc_name || "-"}</td>
                          <td>{companyKey}</td>
                          <td>{employee.device_id}</td>
                          <td>
                            <span className={`badge ${badgeClass}`}>{status}</span>
                          </td>
                          <td>{formatDeviceDateTime(employee.last_seen)}</td>
                          <td>
                            <Link
                              to={`/employees/${employee.id}`}
                              className="btn btn-primary btn-sm me-2"
                            >
                              View
                            </Link>
                            <Link
                              to={`/employees/${employee.id}/edit`}
                              className="btn btn-outline-light btn-sm me-2"
                            >
                              Edit
                            </Link>
                            <button
                              type="button"
                              className="btn btn-danger btn-sm"
                              onClick={() => handleDelete(employee.id)}
                            >
                              Delete
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan="8">No employees found.</td>
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

        <div className="col-12 col-lg-2">
          {subscription ? (
            <div className="card p-3">
              <h6 className="mb-2">Add Employee Add-ons</h6>
              {!subscription.allow_addons ? (
                <p className="text-warning mb-0">Add-ons disabled for this plan.</p>
              ) : (
                <form onSubmit={handleAddonSubmit}>
                  <div className="d-flex gap-2 align-items-center">
                    <label className="form-label mb-0">Addon Count</label>
                    <input
                      type="number"
                      min="0"
                      className="form-control form-control-sm"
                      style={{ maxWidth: "120px" }}
                      value={addonCount}
                      onChange={(event) => setAddonCount(event.target.value)}
                    />
                    <button className="btn btn-primary btn-sm" type="submit">
                      Update
                    </button>
                  </div>
                  <small className="text-secondary">
                    Proration applies based on remaining days in the current cycle.
                  </small>
                </form>
              )}
            </div>
          ) : null}

          <div className={`card p-3 ${subscription ? "mt-3" : ""}`}>
            <h6 className="mb-2">Screenshot Interval</h6>
            <form onSubmit={handleIntervalSubmit}>
              <div className="d-flex gap-2 align-items-center">
                <select
                  className="form-select form-select-sm"
                  style={{ maxWidth: "200px" }}
                  value={intervalValue}
                  onChange={(event) => setIntervalValue(event.target.value)}
                  disabled={!meta.allowed_intervals || meta.allowed_intervals.length === 0}
                >
                  {meta.allowed_intervals && meta.allowed_intervals.length ? (
                    meta.allowed_intervals.map((interval) => (
                      <option key={interval} value={interval}>
                        {interval} minutes
                      </option>
                    ))
                  ) : (
                    <option value="">No intervals</option>
                  )}
                </select>
                <button
                  className="btn btn-primary btn-sm"
                  type="submit"
                  disabled={!meta.allowed_intervals || meta.allowed_intervals.length === 0}
                >
                  Save
                </button>
              </div>
            </form>
          </div>

          {hrAccess.enabled ? (
            <div className="card p-3 mt-3">
              <h6 className="mb-2">HR User Details</h6>
              <div className="d-flex align-items-center justify-content-between mb-2">
                <span className="text-secondary">Login URL</span>
                <a className="btn btn-outline-light btn-sm" href={hrAccess.login_url || "/hr-login/"} target="_blank" rel="noreferrer">
                  Click Here
                </a>
              </div>
              <div className="mb-2">
                <span className="text-secondary">User Name: </span>
                <strong>{hrAccess.username || companyKey}</strong>
              </div>
              <div className="mb-2">
                <span className="text-secondary">Password: </span>
                <strong>{hrAccess.default_password || `${companyKey}hrlog`}</strong>
              </div>
              <div className="text-secondary small">
                Default password format: Company Key + hrlog.
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </>
  );
}
