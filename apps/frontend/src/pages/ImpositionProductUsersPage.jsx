import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "../lib/api.js";

const initialForm = {
  user_name: "",
  email: "",
  password: "",
  role: "org_user",
};

export default function ImpositionProductUsersPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [state, setState] = useState({
    items: [],
    user_limit: 0,
    active_users: 0,
    can_add_user: false,
    limit_message: "Upgrade plan or purchase additional user.",
  });
  const [form, setForm] = useState(initialForm);
  const [saving, setSaving] = useState(false);

  async function loadUsers() {
    setLoading(true);
    setError("");
    try {
      const data = await apiFetch("/api/product/users");
      setState({
        items: data.items || [],
        user_limit: data.user_limit ?? 0,
        active_users: data.active_users ?? 0,
        can_add_user: Boolean(data.can_add_user),
        limit_message: data.limit_message || "Upgrade plan or purchase additional user.",
      });
    } catch (err) {
      setError(err?.message || "Unable to load users.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadUsers();
  }, []);

  const activeUsersText = useMemo(
    () => `${state.active_users}/${state.user_limit || 0}`,
    [state.active_users, state.user_limit],
  );

  async function handleAddUser(event) {
    event.preventDefault();
    setSaving(true);
    setNotice("");
    try {
      await apiFetch("/api/product/users", {
        method: "POST",
        body: JSON.stringify({ action: "add", ...form }),
      });
      setForm(initialForm);
      setNotice("User added.");
      await loadUsers();
    } catch (err) {
      setNotice(err?.data?.message || err?.message || "Unable to add user.");
    } finally {
      setSaving(false);
    }
  }

  async function runAction(action, user) {
    if (!user?.user_id) {
      return;
    }
    setNotice("");
    try {
      await apiFetch("/api/product/users", {
        method: "POST",
        body: JSON.stringify({ action, user_id: user.user_id }),
      });
      await loadUsers();
      setNotice(`User ${action} completed.`);
    } catch (err) {
      setNotice(err?.data?.message || err?.message || `Unable to ${action} user.`);
    }
  }

  async function handleEdit(user) {
    const userName = window.prompt("User Name", user.user_name || "");
    if (!userName) {
      return;
    }
    const email = window.prompt("Email", user.email || "");
    if (!email) {
      return;
    }
    setNotice("");
    try {
      await apiFetch("/api/product/users", {
        method: "POST",
        body: JSON.stringify({
          action: "edit",
          user_id: user.user_id,
          user_name: userName.trim(),
          email: email.trim(),
          role: user.role || "org_user",
        }),
      });
      await loadUsers();
      setNotice("User updated.");
    } catch (err) {
      setNotice(err?.message || "Unable to update user.");
    }
  }

  return (
    <div className="container-fluid">
      <div className="d-flex align-items-center justify-content-between mb-3">
        <div>
          <h2 className="page-title mb-1">Imposition Users</h2>
          <div className="text-secondary">Manage users for Imposition Software under this organization.</div>
        </div>
        <div className="text-secondary small">Active Users: {activeUsersText}</div>
      </div>

      {notice ? <div className="alert alert-info">{notice}</div> : null}
      {error ? <div className="alert alert-danger">{error}</div> : null}

      {!state.can_add_user ? (
        <div className="alert alert-warning">{state.limit_message}</div>
      ) : null}

      <div className="card p-3 mb-3">
        <h5 className="mb-2">Add User</h5>
        <form className="row g-3" onSubmit={handleAddUser}>
          <div className="col-12 col-md-3">
            <label className="form-label">User Name</label>
            <input
              type="text"
              className="form-control"
              value={form.user_name}
              onChange={(event) => setForm((prev) => ({ ...prev, user_name: event.target.value }))}
              required
            />
          </div>
          <div className="col-12 col-md-3">
            <label className="form-label">Email</label>
            <input
              type="email"
              className="form-control"
              value={form.email}
              onChange={(event) => setForm((prev) => ({ ...prev, email: event.target.value }))}
              required
            />
          </div>
          <div className="col-12 col-md-3">
            <label className="form-label">Password</label>
            <input
              type="password"
              className="form-control"
              value={form.password}
              onChange={(event) => setForm((prev) => ({ ...prev, password: event.target.value }))}
              required
            />
          </div>
          <div className="col-12 col-md-2">
            <label className="form-label">Role</label>
            <select
              className="form-select"
              value={form.role}
              onChange={(event) => setForm((prev) => ({ ...prev, role: event.target.value }))}
            >
              <option value="org_user">Org User</option>
              <option value="company_admin">Company Admin</option>
            </select>
          </div>
          <div className="col-12 col-md-1 d-flex align-items-end">
            <button type="submit" className="btn btn-primary w-100" disabled={saving || !state.can_add_user}>
              {saving ? "..." : "Add"}
            </button>
          </div>
        </form>
      </div>

      <div className="card p-3">
        <div className="table-responsive">
          <table className="table table-dark table-striped align-middle">
            <thead>
              <tr>
                <th>User Name</th>
                <th>Email</th>
                <th>Role</th>
                <th>License Code</th>
                <th>Status</th>
                <th>Last Login</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan="7">Loading...</td></tr>
              ) : state.items.length ? (
                state.items.map((row) => (
                  <tr key={row.id}>
                    <td>{row.user_name || "-"}</td>
                    <td>{row.email || "-"}</td>
                    <td>{row.role || "org_user"}</td>
                    <td>{row.license_code || "-"}</td>
                    <td>{row.status || "-"}</td>
                    <td>{row.last_login || "-"}</td>
                    <td className="d-flex gap-2">
                      <button type="button" className="btn btn-outline-light btn-sm" onClick={() => handleEdit(row)}>
                        Edit
                      </button>
                      {row.status === "active" ? (
                        <button type="button" className="btn btn-outline-warning btn-sm" onClick={() => runAction("disable", row)}>
                          Disable
                        </button>
                      ) : (
                        <button type="button" className="btn btn-outline-success btn-sm" onClick={() => runAction("enable", row)}>
                          Enable
                        </button>
                      )}
                      <button type="button" className="btn btn-outline-danger btn-sm" onClick={() => runAction("delete", row)}>
                        Delete
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr><td colSpan="7">No users found.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
