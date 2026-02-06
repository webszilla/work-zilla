import { useEffect, useState } from "react";

const emptyState = {
  loading: true,
  error: "",
  items: []
};

export default function StorageUsersScreen() {
  const [state, setState] = useState(emptyState);
  const [form, setForm] = useState({ name: "", email: "", password: "", invite: false });
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");

  async function loadUsers() {
    setState((prev) => ({ ...prev, loading: true, error: "" }));
    try {
      const data = await window.storageApi.getStorageUsers();
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
    if (saving) {
      return;
    }
    setNotice("");
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        email: form.email.trim(),
        password: form.invite ? "" : form.password,
        invite: form.invite
      };
      await window.storageApi.createStorageUser(payload);
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
    <div className="screen">
      <div className="screen-header">
        <h2>Users</h2>
        <p className="text-muted">Create and manage storage users in your organization.</p>
      </div>
      {notice ? <div className="alert alert-info">{notice}</div> : null}
      {state.error ? <div className="alert alert-danger">{state.error}</div> : null}

      <div className="card">
        <h3>Create User</h3>
        <form className="form-grid" onSubmit={handleSubmit}>
          <label>
            Name
            <input
              type="text"
              value={form.name}
              onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
              required
            />
          </label>
          <label>
            Email
            <input
              type="email"
              value={form.email}
              onChange={(event) => setForm((prev) => ({ ...prev, email: event.target.value }))}
              required
            />
          </label>
          <label>
            Password
            <input
              type="password"
              value={form.password}
              onChange={(event) => setForm((prev) => ({ ...prev, password: event.target.value }))}
              disabled={form.invite}
              required={!form.invite}
            />
          </label>
          <div className="checkbox-row">
            <input
              type="checkbox"
              checked={form.invite}
              onChange={(event) => setForm((prev) => ({ ...prev, invite: event.target.checked }))}
            />
            <span className="text-muted">Send invite (auto-generate password)</span>
          </div>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? "Creating..." : "Create User"}
          </button>
        </form>
      </div>

      <div className="card">
        <div className="row">
          <h3>Users</h3>
          <button type="button" className="btn btn-secondary" onClick={loadUsers}>
            Refresh
          </button>
        </div>
        {state.loading ? (
          <div className="text-muted">Loading users...</div>
        ) : state.items.length ? (
          <ul className="list">
            {state.items.map((user) => (
              <li key={user.user_id} className="list-row">
                <div>
                  <div className="list-title">{user.name || "-"}</div>
                  <div className="list-subtitle">{user.email || "-"}</div>
                </div>
                <div className="text-muted">
                  {user.role || "org_user"} • {user.device_count ?? 0} devices • {user.is_active === false ? "Inactive" : "Active"}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <div className="text-muted">No users found.</div>
        )}
      </div>
    </div>
  );
}
