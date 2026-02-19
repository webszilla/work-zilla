import { useEffect, useState } from "react";
import { apiFetch } from "../lib/api.js";

const defaultForm = {
  name: "",
  email: "",
  password: "",
  role: "org_user",
  employee_role_id: ""
};

const defaultEditForm = {
  membership_id: "",
  name: "",
  role: "org_user",
  employee_role_id: "",
  is_active: true
};

export default function BusinessAutopilotUsersPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [canManageUsers, setCanManageUsers] = useState(false);
  const [users, setUsers] = useState([]);
  const [employeeRoles, setEmployeeRoles] = useState([]);
  const [newEmployeeRole, setNewEmployeeRole] = useState("");
  const [savingEmployeeRole, setSavingEmployeeRole] = useState(false);
  const [form, setForm] = useState(defaultForm);
  const [editForm, setEditForm] = useState(defaultEditForm);
  const [savingEdit, setSavingEdit] = useState(false);
  const [deletingMembershipId, setDeletingMembershipId] = useState("");
  const [notice, setNotice] = useState("");

  async function loadUsers() {
    setLoading(true);
    setNotice("");
    try {
      const data = await apiFetch("/api/business-autopilot/users");
      setUsers(data.users || []);
      setEmployeeRoles(data.employee_roles || []);
      setCanManageUsers(Boolean(data.can_manage_users));
    } catch (error) {
      setNotice(error?.message || "Unable to load users.");
      setUsers([]);
      setEmployeeRoles([]);
      setCanManageUsers(false);
    } finally {
      setLoading(false);
    }
  }

  function openEdit(user) {
    const matchedRole = employeeRoles.find((role) => role.name === (user.employee_role || ""));
    setEditForm({
      membership_id: user.membership_id,
      name: user.name || "",
      role: user.role || "org_user",
      employee_role_id: matchedRole ? String(matchedRole.id) : "",
      is_active: Boolean(user.is_active)
    });
    setNotice("");
  }

  function cancelEdit() {
    setEditForm(defaultEditForm);
  }

  async function handleUpdateUser(event) {
    event.preventDefault();
    if (!editForm.membership_id || savingEdit) {
      return;
    }
    setSavingEdit(true);
    setNotice("");
    try {
      const data = await apiFetch(`/api/business-autopilot/users/${editForm.membership_id}`, {
        method: "PUT",
        body: JSON.stringify({
          name: editForm.name,
          role: editForm.role,
          employee_role_id: editForm.employee_role_id || null,
          is_active: Boolean(editForm.is_active)
        })
      });
      setUsers(data.users || []);
      setEmployeeRoles(data.employee_roles || []);
      setNotice("User updated successfully.");
      cancelEdit();
    } catch (error) {
      setNotice(error?.message || "Unable to update user.");
    } finally {
      setSavingEdit(false);
    }
  }

  async function handleDeleteUser(membershipId) {
    if (!membershipId || deletingMembershipId) {
      return;
    }
    setDeletingMembershipId(String(membershipId));
    setNotice("");
    try {
      const data = await apiFetch(`/api/business-autopilot/users/${membershipId}`, {
        method: "DELETE"
      });
      setUsers(data.users || []);
      setEmployeeRoles(data.employee_roles || []);
      if (String(editForm.membership_id) === String(membershipId)) {
        cancelEdit();
      }
      setNotice("User deleted successfully.");
    } catch (error) {
      setNotice(error?.message || "Unable to delete user.");
    } finally {
      setDeletingMembershipId("");
    }
  }

  useEffect(() => {
    loadUsers();
  }, []);

  async function handleCreate(event) {
    event.preventDefault();
    if (!canManageUsers || saving) {
      return;
    }
    setSaving(true);
    setNotice("");
    try {
      const data = await apiFetch("/api/business-autopilot/users", {
        method: "POST",
        body: JSON.stringify(form)
      });
      setUsers(data.users || []);
      setEmployeeRoles(data.employee_roles || []);
      setForm(defaultForm);
      setNotice("User created successfully.");
    } catch (error) {
      setNotice(error?.message || "Unable to create user.");
    } finally {
      setSaving(false);
    }
  }

  async function handleCreateEmployeeRole(event) {
    event.preventDefault();
    if (!canManageUsers || savingEmployeeRole) {
      return;
    }
    const name = newEmployeeRole.trim();
    if (!name) {
      return;
    }
    setSavingEmployeeRole(true);
    setNotice("");
    try {
      const data = await apiFetch("/api/business-autopilot/employee-roles", {
        method: "POST",
        body: JSON.stringify({ name })
      });
      setEmployeeRoles(data.employee_roles || []);
      setNewEmployeeRole("");
      setNotice("Employee role created.");
    } catch (error) {
      setNotice(error?.message || "Unable to create employee role.");
    } finally {
      setSavingEmployeeRole(false);
    }
  }

  return (
    <div className="d-flex flex-column gap-3">
      <div className="card p-3">
        <h4 className="mb-2">ERP Users</h4>
        <p className="text-secondary mb-0">Create and manage users for Business Autopilot ERP.</p>
      </div>

      {notice ? <div className="alert alert-info py-2 mb-0">{notice}</div> : null}

      {canManageUsers ? (
        <>
        <div className="card p-3">
          <h6 className="mb-3">Employee Role Master</h6>
          <form className="row g-2 mb-3" onSubmit={handleCreateEmployeeRole}>
            <div className="col-12 col-md-4">
              <input
                type="text"
                className="form-control"
                placeholder="Create Employee Role (e.g. Accountant)"
                value={newEmployeeRole}
                onChange={(event) => setNewEmployeeRole(event.target.value)}
              />
            </div>
            <div className="col-12 col-md-2 d-grid">
              <button type="submit" className="btn btn-outline-success" disabled={savingEmployeeRole}>
                {savingEmployeeRole ? "Adding..." : "Add Role"}
              </button>
            </div>
          </form>
        </div>

        <div className="card p-3">
          <h6 className="mb-3">Create User</h6>
          <form className="row g-2" onSubmit={handleCreate}>
            <div className="col-12 col-md-3">
              <input
                type="text"
                className="form-control"
                placeholder="Full Name"
                value={form.name}
                onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
                required
              />
            </div>
            <div className="col-12 col-md-3">
              <input
                type="email"
                className="form-control"
                placeholder="Email"
                value={form.email}
                onChange={(event) => setForm((prev) => ({ ...prev, email: event.target.value }))}
                required
              />
            </div>
            <div className="col-12 col-md-2">
              <input
                type="password"
                className="form-control"
                placeholder="Password"
                value={form.password}
                onChange={(event) => setForm((prev) => ({ ...prev, password: event.target.value }))}
                minLength={6}
                required
              />
            </div>
            <div className="col-12 col-md-2">
              <select
                className="form-select"
                value={form.role}
                onChange={(event) => setForm((prev) => ({ ...prev, role: event.target.value }))}
              >
                <option value="org_user">Org User</option>
                <option value="hr_view">HR View</option>
                <option value="company_admin">Company Admin</option>
              </select>
            </div>
            <div className="col-12 col-md-2">
              <select
                className="form-select"
                value={form.employee_role_id}
                onChange={(event) => setForm((prev) => ({ ...prev, employee_role_id: event.target.value }))}
              >
                <option value="">Employee Role</option>
                {employeeRoles.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="col-12 col-md-2 d-grid">
              <button type="submit" className="btn btn-primary" disabled={saving}>
                {saving ? "Creating..." : "Create"}
              </button>
            </div>
          </form>
        </div>
        </>
      ) : (
        <div className="card p-3">
          <div className="text-secondary">Only company admin can create users.</div>
        </div>
      )}

      {editForm.membership_id ? (
        <div className="card p-3">
          <h6 className="mb-3">Edit User</h6>
          <form className="row g-2" onSubmit={handleUpdateUser}>
            <div className="col-12 col-md-3">
              <input
                type="text"
                className="form-control"
                placeholder="Full Name"
                value={editForm.name}
                onChange={(event) => setEditForm((prev) => ({ ...prev, name: event.target.value }))}
                required
              />
            </div>
            <div className="col-12 col-md-2">
              <select
                className="form-select"
                value={editForm.role}
                onChange={(event) => setEditForm((prev) => ({ ...prev, role: event.target.value }))}
              >
                <option value="org_user">Org User</option>
                <option value="hr_view">HR View</option>
                <option value="company_admin">Company Admin</option>
              </select>
            </div>
            <div className="col-12 col-md-3">
              <select
                className="form-select"
                value={editForm.employee_role_id}
                onChange={(event) => setEditForm((prev) => ({ ...prev, employee_role_id: event.target.value }))}
              >
                <option value="">Employee Role</option>
                {employeeRoles.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="col-12 col-md-2">
              <select
                className="form-select"
                value={editForm.is_active ? "active" : "inactive"}
                onChange={(event) => setEditForm((prev) => ({ ...prev, is_active: event.target.value === "active" }))}
              >
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>
            <div className="col-12 col-md-2 d-flex gap-2">
              <button type="submit" className="btn btn-success w-100" disabled={savingEdit}>
                {savingEdit ? "Updating..." : "Update"}
              </button>
              <button type="button" className="btn btn-outline-light" onClick={cancelEdit}>
                Cancel
              </button>
            </div>
          </form>
        </div>
      ) : null}

      <div className="card p-3">
        <h6 className="mb-3">User List</h6>
        <div className="table-responsive">
          <table className="table table-dark table-hover align-middle mb-0">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Role</th>
                <th>Employee Role</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6}>Loading users...</td></tr>
              ) : users.length ? (
                users.map((user) => (
                  <tr key={user.membership_id || user.id}>
                    <td>{user.name || "-"}</td>
                    <td>{user.email || "-"}</td>
                    <td>{(user.role || "org_user").replace("_", " ")}</td>
                    <td>{user.employee_role || "-"}</td>
                    <td>{user.is_active ? "Active" : "Inactive"}</td>
                    <td>
                      <div className="d-inline-flex gap-2">
                        <button type="button" className="btn btn-sm btn-outline-info" onClick={() => openEdit(user)}>
                          Edit
                        </button>
                        <button
                          type="button"
                          className="btn btn-sm btn-outline-danger"
                          onClick={() => handleDeleteUser(user.membership_id)}
                          disabled={deletingMembershipId === String(user.membership_id)}
                        >
                          {deletingMembershipId === String(user.membership_id) ? "Deleting..." : "Delete"}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr><td colSpan={6}>No users found.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
