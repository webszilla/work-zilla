import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { apiFetch } from "../lib/api.js";
import TablePagination from "../components/TablePagination.jsx";

const emptyState = {
  loading: true,
  error: "",
  data: null
};

export default function EmployeeDetail() {
  const { employeeId } = useParams();
  const [state, setState] = useState(emptyState);
  const [activityPage, setActivityPage] = useState(1);
  const PAGE_SIZE = 5;

  useEffect(() => {
    let active = true;
    async function loadEmployee() {
      try {
        const data = await apiFetch(`/api/dashboard/employees/${employeeId}`);
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
            error: error?.message || "Unable to load employee.",
            data: null
          });
        }
      }
    }

    loadEmployee();
    return () => {
      active = false;
    };
  }, [employeeId]);

  const employee = state.data?.employee || {};
  const recentActivities = state.data?.recent_activities || [];
  const recentScreenshots = state.data?.recent_screenshots || [];
  const status = employee.status || "Offline";
  let statusClass = "bg-danger";
  if (status === "Online") {
    statusClass = "bg-success";
  } else if (status === "Ideal") {
    statusClass = "bg-warning text-dark";
  }

  const activityTotalPages = Math.max(Math.ceil(recentActivities.length / PAGE_SIZE), 1);
  const pagedActivities = useMemo(
    () =>
      recentActivities.slice((activityPage - 1) * PAGE_SIZE, activityPage * PAGE_SIZE),
    [recentActivities, activityPage]
  );

  useEffect(() => {
    if (activityPage > activityTotalPages) {
      setActivityPage(activityTotalPages);
    }
  }, [activityPage, activityTotalPages]);

  if (state.loading) {
    return (
      <div className="card p-4 text-center">
        <div className="spinner" />
        <p className="mb-0">Loading employee...</p>
      </div>
    );
  }

  if (state.error) {
    return <div className="alert alert-danger">{state.error}</div>;
  }

  return (
    <>
      <div className="d-flex flex-wrap gap-2 align-items-center justify-content-between">
        <h3 className="page-title">
          {employee.name} ({employee.device_id})
        </h3>
        <div className="d-flex gap-2">
          <Link to={`/employees/${employeeId}/edit`} className="btn btn-outline-light btn-sm">
            Edit
          </Link>
          <Link to="/employees" className="btn btn-secondary btn-sm">
            Back
          </Link>
        </div>
      </div>

      <p className="mb-1">PC Name: {employee.pc_name || "-"}</p>
      <p className="mb-1">
        Status: <span className={`badge ${statusClass}`}>{status}</span>
      </p>
      <p>Last Seen: {employee.last_seen || "-"}</p>

      <hr className="section-divider" />

      <h4>Recent Activity</h4>
      <div className="table-responsive">
        <table className="table table-dark table-striped table-hover align-middle">
          <thead>
            <tr>
              <th>App</th>
              <th>Window</th>
              <th>Start</th>
              <th>End</th>
            </tr>
          </thead>
          <tbody>
            {pagedActivities.length ? (
              pagedActivities.map((log, idx) => (
                <tr key={`${log.app}-${idx}`}>
                  <td>{log.app}</td>
                  <td>{log.window || "-"}</td>
                  <td>{log.start || "-"}</td>
                  <td>{log.end || "-"}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan="4">No activity yet.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <TablePagination
        page={activityPage}
        totalPages={activityTotalPages}
        onPageChange={setActivityPage}
      />

      <hr className="section-divider" />

      <h4>Screenshots</h4>
      {recentScreenshots.length ? (
        <div className="row g-3">
          {recentScreenshots.map((shot) => (
            <div className="col-12 col-md-4 col-lg-3" key={shot.id}>
              <img
                src={shot.image_url}
                alt={shot.captured_at}
                className="img-fluid rounded"
              />
              <div className="text-secondary mt-1" style={{ fontSize: "12px" }}>
                {shot.captured_at}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p>No screenshots found.</p>
      )}
    </>
  );
}
