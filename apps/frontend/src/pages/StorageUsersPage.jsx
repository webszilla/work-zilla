import { useEffect, useState } from "react";
import { apiFetch } from "../lib/api.js";

const emptyState = {
  loading: true,
  error: "",
  items: []
};

export default function StorageUsersPage() {
  const [state, setState] = useState(emptyState);
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    invite: false
  });
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");

  async function loadUsers() {
    setState((prev) => ({ ...prev, loading: true, error: "" }));
    try {
      const data = await apiFetch("/api/storage/org/users");
      setState({ loading: false, error: "", items: data.items || [] });
    } catch (error) {
      setState({ loading: false, error: error?.message || "Unable to load users.", items: [] });
    }
  }

  useEffect(() => {
    loadUsers();
  }, []);

  async function handleSubmit(event) {
    event.preventDefault();
    setNotice("");
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        email: form.email.trim(),
        password: form.invite ? "" : form.password,
        invite: form.invite
      };
      await apiFetch("/api/storage/org/users/create", {
        method: "POST",
        body: JSON.stringify(payload)
      });
      setForm({ name: "", email: "", password: "", invite: false });
      await loadUsers();
      setNotice("User created.");
    } catch (error) {
      setNotice(error?.message || "Unable to create user.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="container-fluid">
      <div className="d-flex align-items-center justify-content-between mb-3">
        <div>
          <h2 className="page-title">Organization Users</h2>
          <div className="text-secondary">Create and manage storage users under your organization.</div>
        </div>
      </div>

      {notice ? <div className="alert alert-info">{notice}</div> : null}
      {state.error ? <div className="alert alert-danger">{state.error}</div> : null}

      <div className="card p-3 mb-3">
        <h5 className="mb-2">Create User</h5>
        <form className="row g-3" onSubmit={handleSubmit}>
          <div className="col-12 col-md-4">
            <label className="form-label">Name</label>
            <input
              type="text"
              className="form-control"
              value={form.name}
              onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
              required
            />
          </div>
          <div className="col-12 col-md-4">
            <label className="form-label">Email</label>
            <input
              type="email"
              className="form-control"
              value={form.email}
              onChange={(event) => setForm((prev) => ({ ...prev, email: event.target.value }))}
              required
            />
          </div>
          <div className="col-12 col-md-4">
            <label className="form-label">Password</label>
            <input
              type="password"
              className="form-control"
              value={form.password}
              onChange={(event) => setForm((prev) => ({ ...prev, password: event.target.value }))}
              disabled={form.invite}
              required={!form.invite}
            />
            <div className="form-text text-secondary">Leave empty if using invite.</div>
          </div>
          <div className="col-12">
            <div className="form-check">
              <input
                className="form-check-input"
                type="checkbox"
                id="storage-user-invite"
                checked={form.invite}
                onChange={(event) => setForm((prev) => ({ ...prev, invite: event.target.checked }))}
              />
              <label className="form-check-label" htmlFor="storage-user-invite">
                Send invite (auto-generate password)
              </label>
            </div>
          </div>
          <div className="col-12">
            <button type="submit" className="btn btn-primary btn-sm" disabled={saving}>
              {saving ? "Creating..." : "Create User"}
            </button>
          </div>
        </form>
      </div>

      <div className="card p-3">
        <div className="d-flex align-items-center justify-content-between mb-2">
          <h5 className="mb-0">Users</h5>
          <button type="button" className="btn btn-outline-light btn-sm" onClick={loadUsers}>
            Refresh
          </button>
        </div>
        <div className="table-responsive">
          <table className="table table-dark table-striped table-hover align-middle">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Role</th>
                <th>Devices</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {state.loading ? (
                <tr>
                  <td colSpan="5">Loading...</td>
                </tr>
              ) : state.items.length ? (
                state.items.map((user) => (
                  <tr key={user.user_id}>
                    <td>{user.name || "-"}</td>
                    <td>{user.email || "-"}</td>
                    <td>{user.role || "org_user"}</td>
                    <td>{user.device_count ?? 0}</td>
                    <td>{user.is_active === false ? "Inactive" : "Active"}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="5">No users found.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
