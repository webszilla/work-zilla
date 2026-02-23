import { useEffect, useState } from "react";
import { apiFetch } from "../lib/api.js";

const defaultForm = {
  name: "",
  email: "",
  password: "",
  role: "org_user",
  employee_role_id: "",
  department_id: ""
};

const defaultEditForm = {
  membership_id: "",
  name: "",
  role: "org_user",
  employee_role_id: "",
  department_id: "",
  is_active: true
};

const ERP_PAGE_OPTIONS = [
  { path: "/", label: "Dashboard" },
  { path: "/crm", label: "CRM" },
  { path: "/hrm", label: "HR Management" },
  { path: "/projects", label: "Projects" },
  { path: "/accounts", label: "Accounts" },
  { path: "/users", label: "Users" },
  { path: "/billing", label: "Billing" },
  { path: "/plans", label: "Plans" },
  { path: "/profile", label: "Profile" }
];

export default function BusinessAutopilotUsersPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [canManageUsers, setCanManageUsers] = useState(false);
  const [users, setUsers] = useState([]);
  const [employeeRoles, setEmployeeRoles] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [newEmployeeRole, setNewEmployeeRole] = useState("");
  const [newDepartment, setNewDepartment] = useState("");
  const [savingEmployeeRole, setSavingEmployeeRole] = useState(false);
  const [savingDepartment, setSavingDepartment] = useState(false);
  const [editingEmployeeRoleId, setEditingEmployeeRoleId] = useState("");
  const [editingEmployeeRoleName, setEditingEmployeeRoleName] = useState("");
  const [editingDepartmentId, setEditingDepartmentId] = useState("");
  const [editingDepartmentName, setEditingDepartmentName] = useState("");
  const [savingEmployeeRoleId, setSavingEmployeeRoleId] = useState("");
  const [savingDepartmentId, setSavingDepartmentId] = useState("");
  const [deletingEmployeeRoleId, setDeletingEmployeeRoleId] = useState("");
  const [deletingDepartmentId, setDeletingDepartmentId] = useState("");
  const [accessRoleId, setAccessRoleId] = useState("");
  const [accessRoleName, setAccessRoleName] = useState("");
  const [accessSelection, setAccessSelection] = useState([]);
  const [savingAccessRoleId, setSavingAccessRoleId] = useState("");
  const [form, setForm] = useState(defaultForm);
  const [editForm, setEditForm] = useState(defaultEditForm);
  const [savingEdit, setSavingEdit] = useState(false);
  const [deletingMembershipId, setDeletingMembershipId] = useState("");
  const [notice, setNotice] = useState("");
  const [userQuota, setUserQuota] = useState(null);
  const [showAddonModal, setShowAddonModal] = useState(false);
  const [targetAddonCount, setTargetAddonCount] = useState(0);
  const [addonLoading, setAddonLoading] = useState(false);
  const [addonExtraNeeded, setAddonExtraNeeded] = useState(1);

  async function loadUsers() {
    setLoading(true);
    setNotice("");
    try {
      const data = await apiFetch("/api/business-autopilot/users");
      setUsers(data.users || []);
      setEmployeeRoles(data.employee_roles || []);
      setDepartments(data.departments || []);
      setCanManageUsers(Boolean(data.can_manage_users));
      setUserQuota(data.user_quota || null);
    } catch (error) {
      setNotice(error?.message || "Unable to load users.");
      setUsers([]);
      setEmployeeRoles([]);
      setDepartments([]);
      setCanManageUsers(false);
      setUserQuota(null);
    } finally {
      setLoading(false);
    }
  }

  function openEdit(user) {
    const matchedRole = employeeRoles.find((role) => role.name === (user.employee_role || ""));
    const matchedDepartment = departments.find((department) => department.name === (user.department || ""));
    setEditForm({
      membership_id: user.membership_id,
      name: user.name || "",
      role: user.role || "org_user",
      employee_role_id: matchedRole ? String(matchedRole.id) : "",
      department_id: matchedDepartment ? String(matchedDepartment.id) : "",
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
          department_id: editForm.department_id || null,
          is_active: Boolean(editForm.is_active)
        })
      });
      setUsers(data.users || []);
      setEmployeeRoles(data.employee_roles || []);
      setDepartments(data.departments || []);
      setUserQuota(data.user_quota || null);
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
      setDepartments(data.departments || []);
      setUserQuota(data.user_quota || null);
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
      setDepartments(data.departments || []);
      setUserQuota(data.user_quota || null);
      setForm(defaultForm);
      setNotice("User created successfully.");
    } catch (error) {
      if (error?.data?.detail === "user_limit_reached") {
        const quota = error?.data?.user_quota || null;
        setUserQuota(quota);
        const extraNeeded = Math.max(1, (quota?.current_users || 0) + 1 - (quota?.total_allowed_users || 0));
        setAddonExtraNeeded(extraNeeded);
        setTargetAddonCount((quota?.addon_count || 0) + extraNeeded);
        setShowAddonModal(true);
        setNotice("User limit reached. Add user addon to continue.");
      } else {
        setNotice(error?.message || "Unable to create user.");
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleAddonCheckout() {
    if (!targetAddonCount || addonLoading) {
      return;
    }
    setAddonLoading(true);
    setNotice("");
    try {
      const data = await apiFetch("/api/business-autopilot/users/addon-checkout", {
        method: "POST",
        body: JSON.stringify({ target_addon_count: targetAddonCount })
      });
      const redirectUrl = data?.redirect_url || "/my-account/billing/renew/";
      window.location.href = redirectUrl;
    } catch (error) {
      if (error?.data?.redirect_url) {
        window.location.href = error.data.redirect_url;
        return;
      }
      setNotice(error?.message || "Unable to open addon checkout.");
    } finally {
      setAddonLoading(false);
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

  function startEditEmployeeRole(role) {
    setEditingEmployeeRoleId(String(role.id));
    setEditingEmployeeRoleName(role.name || "");
    setNotice("");
  }

  function cancelEditEmployeeRole() {
    setEditingEmployeeRoleId("");
    setEditingEmployeeRoleName("");
  }

  async function handleUpdateEmployeeRole(roleId) {
    if (!roleId || savingEmployeeRoleId) {
      return;
    }
    const name = editingEmployeeRoleName.trim();
    if (!name) {
      return;
    }
    setSavingEmployeeRoleId(String(roleId));
    setNotice("");
    try {
      const data = await apiFetch(`/api/business-autopilot/employee-roles/${roleId}`, {
        method: "PUT",
        body: JSON.stringify({ name })
      });
      setEmployeeRoles(data.employee_roles || []);
      setUsers(data.users || []);
      setNotice("Employee role updated.");
      cancelEditEmployeeRole();
    } catch (error) {
      setNotice(error?.message || "Unable to update employee role.");
    } finally {
      setSavingEmployeeRoleId("");
    }
  }

  async function handleDeleteEmployeeRole(roleId) {
    if (!roleId || deletingEmployeeRoleId) {
      return;
    }
    setDeletingEmployeeRoleId(String(roleId));
    setNotice("");
    try {
      const data = await apiFetch(`/api/business-autopilot/employee-roles/${roleId}`, {
        method: "DELETE"
      });
      setEmployeeRoles(data.employee_roles || []);
      setUsers(data.users || []);
      if (editingEmployeeRoleId === String(roleId)) {
        cancelEditEmployeeRole();
      }
      setNotice("Employee role deleted.");
    } catch (error) {
      setNotice(error?.message || "Unable to delete employee role.");
    } finally {
      setDeletingEmployeeRoleId("");
    }
  }

  async function handleCreateDepartment(event) {
    event.preventDefault();
    if (!canManageUsers || savingDepartment) {
      return;
    }
    const name = newDepartment.trim();
    if (!name) {
      return;
    }
    setSavingDepartment(true);
    setNotice("");
    try {
      const data = await apiFetch("/api/business-autopilot/departments", {
        method: "POST",
        body: JSON.stringify({ name })
      });
      setDepartments(data.departments || []);
      setUsers(data.users || users);
      setNewDepartment("");
      setNotice("Department created.");
    } catch (error) {
      setNotice(error?.message || "Unable to create department.");
    } finally {
      setSavingDepartment(false);
    }
  }

  function startEditDepartment(department) {
    setEditingDepartmentId(String(department.id));
    setEditingDepartmentName(department.name || "");
    setNotice("");
  }

  function cancelEditDepartment() {
    setEditingDepartmentId("");
    setEditingDepartmentName("");
  }

  async function handleUpdateDepartment(departmentId) {
    if (!departmentId || savingDepartmentId) {
      return;
    }
    const name = editingDepartmentName.trim();
    if (!name) {
      return;
    }
    setSavingDepartmentId(String(departmentId));
    setNotice("");
    try {
      const data = await apiFetch(`/api/business-autopilot/departments/${departmentId}`, {
        method: "PUT",
        body: JSON.stringify({ name })
      });
      setDepartments(data.departments || []);
      setUsers(data.users || users);
      setNotice("Department updated.");
      cancelEditDepartment();
    } catch (error) {
      setNotice(error?.message || "Unable to update department.");
    } finally {
      setSavingDepartmentId("");
    }
  }

  async function handleDeleteDepartment(departmentId) {
    if (!departmentId || deletingDepartmentId) {
      return;
    }
    setDeletingDepartmentId(String(departmentId));
    setNotice("");
    try {
      const data = await apiFetch(`/api/business-autopilot/departments/${departmentId}`, {
        method: "DELETE"
      });
      setDepartments(data.departments || []);
      setUsers(data.users || users);
      if (editingDepartmentId === String(departmentId)) {
        cancelEditDepartment();
      }
      setNotice("Department deleted.");
    } catch (error) {
      setNotice(error?.message || "Unable to delete department.");
    } finally {
      setDeletingDepartmentId("");
    }
  }

  function openPageAccess(role) {
    setAccessRoleId(String(role.id));
    setAccessRoleName(role.name || "");
    setAccessSelection(Array.isArray(role.page_access) && role.page_access.length ? role.page_access : ["/"]);
    setNotice("");
  }

  function closePageAccess() {
    setAccessRoleId("");
    setAccessRoleName("");
    setAccessSelection([]);
  }

  function toggleAccess(path) {
    setAccessSelection((prev) => {
      const current = Array.isArray(prev) ? prev : [];
      if (path === "/") {
        return current.includes("/") ? current : ["/", ...current];
      }
      if (current.includes(path)) {
        return current.filter((item) => item !== path);
      }
      return [...current, path];
    });
  }

  async function handleSavePageAccess() {
    if (!accessRoleId || savingAccessRoleId) {
      return;
    }
    const cleaned = ["/", ...accessSelection.filter((item) => item !== "/")];
    setSavingAccessRoleId(accessRoleId);
    setNotice("");
    try {
      const data = await apiFetch(`/api/business-autopilot/employee-roles/${accessRoleId}`, {
        method: "PUT",
        body: JSON.stringify({
          page_access: cleaned
        })
      });
      setEmployeeRoles(data.employee_roles || []);
      setUsers(data.users || []);
      setNotice("Page access updated.");
      closePageAccess();
    } catch (error) {
      setNotice(error?.message || "Unable to update page access.");
    } finally {
      setSavingAccessRoleId("");
    }
  }

  return (
    <div className="d-flex flex-column gap-3">
      <div className="px-1 pt-1">
        <h4 className="mb-2">ERP Users</h4>
        <p className="text-secondary mb-0">Create and manage users for Business Autopilot ERP.</p>
      </div>

      {notice ? <div className="alert alert-info py-2 mb-0">{notice}</div> : null}

      {userQuota ? (
        <div className="card p-3">
          <div className="row g-2">
            {[
              { label: "Plan", value: userQuota.plan_name || "-", icon: "bi-card-text" },
              { label: "Included Users", value: userQuota.included_users ?? 0, icon: "bi-people-fill" },
              { label: "Addon Users", value: userQuota.addon_count ?? 0, icon: "bi-person-plus-fill" },
              { label: "Used", value: userQuota.current_users ?? 0, icon: "bi-person-check-fill" },
              { label: "Remaining", value: userQuota.remaining_users ?? 0, icon: "bi-hourglass-split" }
            ].map((item) => (
              <div className="col-12 col-sm-6 col-lg-3 col-xl" key={item.label}>
                <div className="border rounded p-2 h-100 d-flex align-items-center gap-2">
                  <i className={`bi ${item.icon} text-primary`} />
                  <div className="d-flex align-items-center gap-2 flex-wrap small w-100">
                    <span className="text-secondary">{item.label}</span>
                    <span className="fw-semibold text-body">{item.value}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div className="small text-secondary mt-2">
            Add-on price: {userQuota.addon_currency || "INR"} {Number(userQuota.addon_unit_price || 0)} / user / {userQuota.billing_cycle || "monthly"}
          </div>
        </div>
      ) : null}

      {canManageUsers ? (
        <>
        <div className="row g-3">
          <div className="col-12 col-xl-6">
            <div className="card p-3 h-100">
              <h6 className="mb-3">Employee Role Master</h6>
              <div className="row g-3">
                <div className="col-12 col-lg-4">
                  <form className="d-grid gap-2" onSubmit={handleCreateEmployeeRole}>
                    <input
                      type="text"
                      className="form-control"
                      placeholder="Create Employee Role (e.g. Accountant)"
                      value={newEmployeeRole}
                      onChange={(event) => setNewEmployeeRole(event.target.value)}
                    />
                    <button type="submit" className="btn btn-outline-success" disabled={savingEmployeeRole}>
                      {savingEmployeeRole ? "Adding..." : "Add Role"}
                    </button>
                  </form>
                </div>
                <div className="col-12 col-lg-8">
                  <div className="table-responsive">
                    <table className="table table-dark table-hover align-middle mb-0">
                      <thead>
                        <tr>
                          <th>Role Name</th>
                          <th className="text-end" style={{ width: "320px" }}>Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {employeeRoles.length ? (
                          employeeRoles.map((role) => {
                            const isEditing = editingEmployeeRoleId === String(role.id);
                            const isSaving = savingEmployeeRoleId === String(role.id);
                            const isDeleting = deletingEmployeeRoleId === String(role.id);
                            return (
                              <tr key={role.id}>
                                <td>
                                  {isEditing ? (
                                    <input
                                      type="text"
                                      className="form-control form-control-sm"
                                      value={editingEmployeeRoleName}
                                      onChange={(event) => setEditingEmployeeRoleName(event.target.value)}
                                    />
                                  ) : (
                                    role.name
                                  )}
                                </td>
                                <td className="text-end">
                                  <div className="d-inline-flex gap-2">
                                    {isEditing ? (
                                      <>
                                        <button
                                          type="button"
                                          className="btn btn-sm btn-success"
                                          onClick={() => handleUpdateEmployeeRole(role.id)}
                                          disabled={isSaving}
                                        >
                                          {isSaving ? "Saving..." : "Save"}
                                        </button>
                                        <button
                                          type="button"
                                          className="btn btn-sm btn-outline-light"
                                          onClick={cancelEditEmployeeRole}
                                        >
                                          Cancel
                                        </button>
                                      </>
                                    ) : (
                                      <>
                                        <button
                                          type="button"
                                          className="btn btn-sm btn-outline-info"
                                          onClick={() => startEditEmployeeRole(role)}
                                        >
                                          Edit
                                        </button>
                                        <button
                                          type="button"
                                          className="btn btn-sm btn-outline-primary"
                                          onClick={() => openPageAccess(role)}
                                        >
                                          Page Access
                                        </button>
                                        <button
                                          type="button"
                                          className="btn btn-sm btn-outline-danger"
                                          onClick={() => handleDeleteEmployeeRole(role.id)}
                                          disabled={isDeleting}
                                        >
                                          {isDeleting ? "Deleting..." : "Delete"}
                                        </button>
                                      </>
                                    )}
                                  </div>
                                </td>
                              </tr>
                            );
                          })
                        ) : (
                          <tr>
                            <td colSpan={2}>No employee roles found.</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div className="col-12 col-xl-6">
            <div className="card p-3 h-100">
              <h6 className="mb-3">Department Master</h6>
              <div className="row g-3">
                <div className="col-12 col-lg-4">
                  <form className="d-grid gap-2" onSubmit={handleCreateDepartment}>
                    <input
                      type="text"
                      className="form-control"
                      placeholder="Create Department (e.g. Sales)"
                      value={newDepartment}
                      onChange={(event) => setNewDepartment(event.target.value)}
                    />
                    <button type="submit" className="btn btn-outline-success" disabled={savingDepartment}>
                      {savingDepartment ? "Adding..." : "Add Department"}
                    </button>
                  </form>
                </div>
                <div className="col-12 col-lg-8">
                  <div className="table-responsive">
                    <table className="table table-dark table-hover align-middle mb-0">
                      <thead>
                        <tr>
                          <th>Department Name</th>
                          <th className="text-end" style={{ width: "220px" }}>Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {departments.length ? (
                          departments.map((department) => {
                            const isEditing = editingDepartmentId === String(department.id);
                            const isSaving = savingDepartmentId === String(department.id);
                            const isDeleting = deletingDepartmentId === String(department.id);
                            return (
                              <tr key={department.id}>
                                <td>
                                  {isEditing ? (
                                    <input
                                      type="text"
                                      className="form-control form-control-sm"
                                      value={editingDepartmentName}
                                      onChange={(event) => setEditingDepartmentName(event.target.value)}
                                    />
                                  ) : (
                                    department.name
                                  )}
                                </td>
                                <td className="text-end">
                                  <div className="d-inline-flex gap-2">
                                    {isEditing ? (
                                      <>
                                        <button
                                          type="button"
                                          className="btn btn-sm btn-success"
                                          onClick={() => handleUpdateDepartment(department.id)}
                                          disabled={isSaving}
                                        >
                                          {isSaving ? "Saving..." : "Save"}
                                        </button>
                                        <button
                                          type="button"
                                          className="btn btn-sm btn-outline-light"
                                          onClick={cancelEditDepartment}
                                        >
                                          Cancel
                                        </button>
                                      </>
                                    ) : (
                                      <>
                                        <button
                                          type="button"
                                          className="btn btn-sm btn-outline-info"
                                          onClick={() => startEditDepartment(department)}
                                        >
                                          Edit
                                        </button>
                                        <button
                                          type="button"
                                          className="btn btn-sm btn-outline-danger"
                                          onClick={() => handleDeleteDepartment(department.id)}
                                          disabled={isDeleting}
                                        >
                                          {isDeleting ? "Deleting..." : "Delete"}
                                        </button>
                                      </>
                                    )}
                                  </div>
                                </td>
                              </tr>
                            );
                          })
                        ) : (
                          <tr>
                            <td colSpan={2}>No departments found.</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {accessRoleId ? (
          <div className="card p-3 mt-3">
            <div className="d-flex align-items-center justify-content-between mb-3">
              <h6 className="mb-0">Page Access - {accessRoleName}</h6>
              <button type="button" className="btn btn-sm btn-outline-light" onClick={closePageAccess}>
                Close
              </button>
            </div>
            <div className="row g-2">
              {ERP_PAGE_OPTIONS.map((item) => (
                <div className="col-12 col-md-4" key={item.path}>
                  <label className="form-check d-flex align-items-center gap-2">
                    <input
                      className="form-check-input"
                      type="checkbox"
                      checked={accessSelection.includes(item.path)}
                      onChange={() => toggleAccess(item.path)}
                      disabled={item.path === "/"}
                    />
                    <span>{item.label}</span>
                  </label>
                </div>
              ))}
            </div>
            <div className="d-flex gap-2 mt-3">
              <button
                type="button"
                className="btn btn-success btn-sm"
                onClick={handleSavePageAccess}
                disabled={savingAccessRoleId === accessRoleId}
              >
                {savingAccessRoleId === accessRoleId ? "Saving..." : "Save Access"}
              </button>
            </div>
          </div>
        ) : null}

        <div className="card p-3">
          <h6 className="mb-3">Create User</h6>
          <form className="row g-2" onSubmit={handleCreate}>
            <div className="col-12 col-md-4">
              <input
                type="text"
                className="form-control"
                placeholder="Full Name"
                value={form.name}
                onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
                required
              />
            </div>
            <div className="col-12 col-md-4">
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
                value={form.department_id}
                onChange={(event) => setForm((prev) => ({ ...prev, department_id: event.target.value }))}
              >
                <option value="">Department</option>
                {departments.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
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
                value={editForm.department_id}
                onChange={(event) => setEditForm((prev) => ({ ...prev, department_id: event.target.value }))}
              >
                <option value="">Department</option>
                {departments.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
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
                <th>Department</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7}>Loading users...</td></tr>
              ) : users.length ? (
                users.map((user) => (
                  <tr key={user.membership_id || user.id}>
                    <td>{user.name || "-"}</td>
                    <td>{user.email || "-"}</td>
                    <td>{(user.role || "org_user").replace("_", " ")}</td>
                    <td>{user.employee_role || "-"}</td>
                    <td>{user.department || "-"}</td>
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
                <tr><td colSpan={7}>No users found.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showAddonModal ? (
        <div className="modal d-block" tabIndex="-1" role="dialog" style={{ backgroundColor: "rgba(0,0,0,0.6)" }}>
          <div className="modal-dialog modal-dialog-centered" role="document">
            <div className="modal-content bg-dark text-light border-secondary">
              <div className="modal-header border-secondary">
                <h6 className="modal-title mb-0">Add User Add-on Required</h6>
                <button type="button" className="btn btn-outline-light btn-sm" onClick={() => setShowAddonModal(false)}>
                  Close
                </button>
              </div>
              <div className="modal-body">
                <p className="small mb-2">
                  User limit reached. Please add users and continue checkout.
                </p>
                <p className="small text-secondary mb-3">
                  Extra users needed now: {addonExtraNeeded}
                </p>
                <div className="d-flex align-items-center gap-2">
                  <button
                    type="button"
                    className="btn btn-outline-light btn-sm"
                    onClick={() => setTargetAddonCount((prev) => Math.max((userQuota?.addon_count || 0) + 1, prev - 1))}
                  >
                    -
                  </button>
                  <div className="px-3 py-1 border rounded">Addon Count: {targetAddonCount}</div>
                  <button
                    type="button"
                    className="btn btn-outline-light btn-sm"
                    onClick={() => setTargetAddonCount((prev) => prev + 1)}
                  >
                    +
                  </button>
                </div>
                <div className="small text-secondary mt-3">
                  Total add-on price: {userQuota?.addon_currency || "INR"}{" "}
                  {Number(userQuota?.addon_unit_price || 0) * Number(targetAddonCount || 0)}
                </div>
              </div>
              <div className="modal-footer border-secondary">
                <button type="button" className="btn btn-outline-light btn-sm" onClick={() => setShowAddonModal(false)}>
                  Cancel
                </button>
                <button type="button" className="btn btn-success btn-sm" onClick={handleAddonCheckout} disabled={addonLoading}>
                  {addonLoading ? "Opening..." : "Proceed to Checkout"}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
