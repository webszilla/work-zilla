import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { apiFetch } from "../lib/api.js";

const emptyForm = {
  name: "",
  email: "",
  device_id: ""
};

export default function EmployeeForm() {
  const { employeeId } = useParams();
  const navigate = useNavigate();
  const isEdit = Boolean(employeeId);
  const [form, setForm] = useState(emptyForm);
  const [loading, setLoading] = useState(isEdit);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!isEdit) {
      return;
    }
    let active = true;
    async function loadEmployee() {
      try {
        const data = await apiFetch(`/api/dashboard/employees/${employeeId}`);
        if (!active) {
          return;
        }
        const employee = data.employee || {};
        setForm({
          name: employee.name || "",
          email: employee.email || "",
          device_id: employee.device_id || ""
        });
        setLoading(false);
      } catch (fetchError) {
        if (fetchError?.data?.redirect) {
          window.location.href = fetchError.data.redirect;
          return;
        }
        if (active) {
          setError(fetchError?.message || "Unable to load employee.");
          setLoading(false);
        }
      }
    }

    loadEmployee();
    return () => {
      active = false;
    };
  }, [employeeId, isEdit]);

  function updateField(event) {
    const { name, value } = event.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    try {
      const url = isEdit
        ? `/api/dashboard/employees/${employeeId}/update`
        : "/api/dashboard/employees/create";
      const method = isEdit ? "PUT" : "POST";
      await apiFetch(url, {
        method,
        body: JSON.stringify(form)
      });
      navigate("/employees");
    } catch (submitError) {
      if (submitError?.data?.redirect) {
        window.location.href = submitError.data.redirect;
        return;
      }
      setError(submitError?.message || "Unable to save employee.");
    }
  }

  if (loading) {
    return (
      <div className="card p-4 text-center">
        <div className="spinner" />
        <p className="mb-0">Loading employee...</p>
      </div>
    );
  }

  return (
    <>
      <h3 className="page-title">{isEdit ? "Edit Employee" : "Add Employee"}</h3>
      {error ? <div className="alert alert-danger">{error}</div> : null}

      <div className="card p-3 mt-3">
        <form onSubmit={handleSubmit}>
          <div className="mb-3">
            <label className="form-label">Name</label>
            <input
              type="text"
              name="name"
              className="form-control"
              value={form.name}
              onChange={updateField}
              required
            />
          </div>

          <div className="mb-3">
            <label className="form-label">Email (optional)</label>
            <input
              type="email"
              name="email"
              className="form-control"
              value={form.email}
              onChange={updateField}
            />
          </div>

          <div className="mb-3">
            <label className="form-label">Device ID</label>
            <input
              type="text"
              name="device_id"
              className="form-control"
              value={form.device_id}
              onChange={updateField}
              required
            />
          </div>

          <button className="btn btn-primary" type="submit">
            {isEdit ? "Save Changes" : "Create Employee"}
          </button>
          <Link to="/employees" className="btn btn-outline-light ms-2">
            Cancel
          </Link>
        </form>
      </div>
    </>
  );
}
