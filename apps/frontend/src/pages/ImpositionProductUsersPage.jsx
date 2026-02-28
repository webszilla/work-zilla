import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "../lib/api.js";

const initialForm = {
  user_name: "",
  email: "",
  password: "",
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
  const [viewUser, setViewUser] = useState(null);
  const [editModal, setEditModal] = useState({
    open: false,
    saving: false,
    user_id: "",
    user_name: "",
    email: "",
  });

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
        body: JSON.stringify({ action: "add", ...form, role: "org_user" }),
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

  function handleEdit(user) {
    setEditModal({
      open: true,
      saving: false,
      user_id: user?.user_id || "",
      user_name: user?.user_name || "",
      email: user?.email || "",
    });
  }

  async function submitEditUser(event) {
    event.preventDefault();
    if (!editModal.user_id) {
      return;
    }
    setNotice("");
    setEditModal((prev) => ({ ...prev, saving: true }));
    try {
      await apiFetch("/api/product/users", {
        method: "POST",
        body: JSON.stringify({
          action: "edit",
          user_id: editModal.user_id,
          user_name: String(editModal.user_name || "").trim(),
          email: String(editModal.email || "").trim(),
          role: "org_user",
        }),
      });
      setEditModal((prev) => ({ ...prev, open: false, saving: false }));
      await loadUsers();
      setNotice("User updated.");
    } catch (err) {
      setEditModal((prev) => ({ ...prev, saving: false }));
      setNotice(err?.message || "Unable to update user.");
    }
  }

  function handleView(user) {
    setViewUser(user || null);
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
          <div className="col-12 col-md-4">
            <label className="form-label">Password</label>
            <input
              type="password"
              className="form-control"
              value={form.password}
              onChange={(event) => setForm((prev) => ({ ...prev, password: event.target.value }))}
              required
            />
          </div>
          <div className="col-12 col-md-2 d-flex align-items-end">
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
                <th>License Code</th>
                <th style={{ width: "110px", whiteSpace: "nowrap" }}>Status</th>
                <th style={{ width: "280px", whiteSpace: "nowrap" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan="5">Loading...</td></tr>
              ) : state.items.length ? (
                state.items.map((row) => (
                  <tr key={row.id}>
                    <td>{row.user_name || "-"}</td>
                    <td>{row.email || "-"}</td>
                    <td>{row.license_code || "-"}</td>
                    <td style={{ width: "110px" }}>
                      <span className="d-inline-block text-truncate" style={{ maxWidth: "100px" }} title={row.status || "-"}>
                        {row.status || "-"}
                      </span>
                    </td>
                    <td>
                      <div className="d-flex flex-wrap gap-2" style={{ minWidth: "200px" }}>
                      <button type="button" className="btn btn-outline-info btn-sm" onClick={() => handleView(row)}>
                        View
                      </button>
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
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr><td colSpan="5">No users found.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {viewUser ? (
        <div className="modal-overlay" onClick={() => setViewUser(null)}>
          <div className="modal-panel" style={{ width: "min(640px, 92vw)" }} onClick={(event) => event.stopPropagation()}>
            <h5 className="mb-3">User Details</h5>
            <div className="modal-form-grid">
              <div className="modal-form-field">
                <label className="form-label small text-secondary mb-1">User Name</label>
                <div>{viewUser.user_name || "-"}</div>
              </div>
              <div className="modal-form-field">
                <label className="form-label small text-secondary mb-1">Email</label>
                <div>{viewUser.email || "-"}</div>
              </div>
              <div className="modal-form-field">
                <label className="form-label small text-secondary mb-1">Status</label>
                <div>{viewUser.status || "-"}</div>
              </div>
              <div className="modal-form-field">
                <label className="form-label small text-secondary mb-1">License Code</label>
                <div className="text-break">{viewUser.license_code || "-"}</div>
              </div>
              <div className="modal-form-field">
                <label className="form-label small text-secondary mb-1">Last Login</label>
                <div>{viewUser.last_login || "-"}</div>
              </div>
              <div className="modal-form-field">
                <label className="form-label small text-secondary mb-1">User ID</label>
                <div>{viewUser.user_id || "-"}</div>
              </div>
            </div>
            <div className="d-flex justify-content-end mt-3">
              <button type="button" className="btn btn-outline-light" onClick={() => setViewUser(null)}>
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {editModal.open ? (
        <div className="modal-overlay" onClick={() => setEditModal((prev) => ({ ...prev, open: false }))}>
          <div className="modal-panel" style={{ width: "min(640px, 92vw)" }} onClick={(event) => event.stopPropagation()}>
            <h5 className="mb-3">Edit User</h5>
            <form onSubmit={submitEditUser}>
              <div className="modal-form-grid">
                <div className="modal-form-field">
                  <label className="form-label small text-secondary mb-1">User Name</label>
                  <input
                    type="text"
                    className="form-control"
                    value={editModal.user_name}
                    onChange={(event) => setEditModal((prev) => ({ ...prev, user_name: event.target.value }))}
                    required
                  />
                </div>
                <div className="modal-form-field">
                  <label className="form-label small text-secondary mb-1">Email</label>
                  <input
                    type="email"
                    className="form-control"
                    value={editModal.email}
                    onChange={(event) => setEditModal((prev) => ({ ...prev, email: event.target.value }))}
                    required
                  />
                </div>
              </div>
              <div className="d-flex justify-content-end gap-2 mt-3">
                <button
                  type="button"
                  className="btn btn-outline-light"
                  disabled={editModal.saving}
                  onClick={() => setEditModal((prev) => ({ ...prev, open: false }))}
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={editModal.saving}>
                  {editModal.saving ? "Saving..." : "Save"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
