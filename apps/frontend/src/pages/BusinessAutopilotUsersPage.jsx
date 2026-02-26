import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "../lib/api.js";
import TablePagination from "../components/TablePagination.jsx";

const defaultForm = {
  name: "",
  email: "",
  password: "",
  role: "org_user",
  department_id: "",
  employee_role_id: ""
};

const defaultEditForm = {
  membership_id: "",
  name: "",
  role: "org_user",
  department_id: "",
  employee_role_id: "",
  is_active: true
};

const ROLE_ACCESS_STORAGE_KEY = "wz_business_autopilot_role_access";
const SYSTEM_ROLE_OPTIONS = [
  { key: "system:company_admin", label: "Company Admin" },
  { key: "system:org_user", label: "Org User" },
  { key: "system:hr_view", label: "HR View" },
];
const ROLE_ACCESS_SECTIONS = [
  { key: "dashboard", label: "Dashboard" },
  { key: "inbox", label: "Inbox" },
  { key: "crm", label: "CRM" },
  { key: "hr", label: "HR" },
  { key: "projects", label: "Projects" },
  { key: "accounts", label: "Accounts / ERP" },
  { key: "ticketing", label: "Ticketing" },
  { key: "stocks", label: "Stocks" },
  { key: "users", label: "Users" },
  { key: "billing", label: "Billing" },
  { key: "plans", label: "Plans" },
  { key: "profile", label: "Profile" },
];
const ACCESS_LEVEL_OPTIONS = ["No Access", "View", "Create/Edit", "Full Access"];

function createDefaultRoleAccessRecord() {
  return {
    sections: ROLE_ACCESS_SECTIONS.reduce((acc, item) => {
      acc[item.key] = "No Access";
      return acc;
    }, {}),
    can_export: false,
    can_delete: false,
    attendance_self_service: false,
    remarks: "",
  };
}

export default function BusinessAutopilotUsersPage() {
  const [activeTopTab, setActiveTopTab] = useState("users");
  const [userSearch, setUserSearch] = useState("");
  const [userPage, setUserPage] = useState(1);
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
  const [employeeRoleSearch, setEmployeeRoleSearch] = useState("");
  const [departmentSearch, setDepartmentSearch] = useState("");
  const [employeeRolePage, setEmployeeRolePage] = useState(1);
  const [departmentPage, setDepartmentPage] = useState(1);
  const [editingEmployeeRoleId, setEditingEmployeeRoleId] = useState("");
  const [editingEmployeeRoleName, setEditingEmployeeRoleName] = useState("");
  const [editingDepartmentId, setEditingDepartmentId] = useState("");
  const [editingDepartmentName, setEditingDepartmentName] = useState("");
  const [savingEmployeeRoleRowId, setSavingEmployeeRoleRowId] = useState("");
  const [savingDepartmentRowId, setSavingDepartmentRowId] = useState("");
  const [deletingEmployeeRoleId, setDeletingEmployeeRoleId] = useState("");
  const [deletingDepartmentId, setDeletingDepartmentId] = useState("");
  const [form, setForm] = useState(defaultForm);
  const [editForm, setEditForm] = useState(defaultEditForm);
  const [savingEdit, setSavingEdit] = useState(false);
  const [deletingMembershipId, setDeletingMembershipId] = useState("");
  const [notice, setNotice] = useState("");
  const [roleAccessMap, setRoleAccessMap] = useState({});
  const [selectedRoleAccessKey, setSelectedRoleAccessKey] = useState(SYSTEM_ROLE_OPTIONS[0].key);
  const pageSize = 5;

  async function loadUsers() {
    setLoading(true);
    setNotice("");
    try {
      const data = await apiFetch("/api/business-autopilot/users");
      setUsers(data.users || []);
      setEmployeeRoles(data.employee_roles || []);
      setDepartments(data.departments || []);
      setCanManageUsers(Boolean(data.can_manage_users));
    } catch (error) {
      setNotice(error?.message || "Unable to load users.");
      setUsers([]);
      setEmployeeRoles([]);
      setDepartments([]);
      setCanManageUsers(false);
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
      department_id: matchedDepartment ? String(matchedDepartment.id) : "",
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
          department_id: editForm.department_id || null,
          employee_role_id: editForm.employee_role_id || null,
          is_active: Boolean(editForm.is_active)
        })
      });
      setUsers(data.users || []);
      setEmployeeRoles(data.employee_roles || []);
      setDepartments(data.departments || []);
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

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(ROLE_ACCESS_STORAGE_KEY);
      if (!raw) {
        return;
      }
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        setRoleAccessMap(parsed);
      }
    } catch (_error) {
      // Ignore invalid local role access cache.
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem(ROLE_ACCESS_STORAGE_KEY, JSON.stringify(roleAccessMap));
  }, [roleAccessMap]);

  useEffect(() => {
    setUserPage(1);
  }, [userSearch, users.length]);

  useEffect(() => {
    setEmployeeRolePage(1);
  }, [employeeRoleSearch, employeeRoles.length]);

  useEffect(() => {
    setDepartmentPage(1);
  }, [departmentSearch, departments.length]);

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
      if (data.departments) {
        setDepartments(data.departments);
      }
      setNewEmployeeRole("");
      setNotice("Employee role created.");
    } catch (error) {
      setNotice(error?.message || "Unable to create employee role.");
    } finally {
      setSavingEmployeeRole(false);
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
      setNewDepartment("");
      setNotice("Department created.");
    } catch (error) {
      setNotice(error?.message || "Unable to create department.");
    } finally {
      setSavingDepartment(false);
    }
  }

  function startEditEmployeeRole(item) {
    setEditingEmployeeRoleId(String(item.id));
    setEditingEmployeeRoleName(String(item.name || ""));
    setNotice("");
  }

  function cancelEditEmployeeRole() {
    setEditingEmployeeRoleId("");
    setEditingEmployeeRoleName("");
  }

  async function handleUpdateEmployeeRole(roleId) {
    const name = editingEmployeeRoleName.trim();
    if (!roleId || !name || savingEmployeeRoleRowId) {
      return;
    }
    setSavingEmployeeRoleRowId(String(roleId));
    setNotice("");
    try {
      const data = await apiFetch(`/api/business-autopilot/employee-roles/${roleId}`, {
        method: "PUT",
        body: JSON.stringify({ name })
      });
      setEmployeeRoles(data.employee_roles || []);
      if (data.departments) {
        setDepartments(data.departments || []);
      }
      cancelEditEmployeeRole();
      setNotice("Employee role updated.");
    } catch (error) {
      setNotice(error?.message || "Unable to update employee role.");
    } finally {
      setSavingEmployeeRoleRowId("");
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
      if (data.departments) {
        setDepartments(data.departments || []);
      }
      if (String(editingEmployeeRoleId) === String(roleId)) {
        cancelEditEmployeeRole();
      }
      setNotice("Employee role deleted.");
    } catch (error) {
      setNotice(error?.message || "Unable to delete employee role.");
    } finally {
      setDeletingEmployeeRoleId("");
    }
  }

  function startEditDepartment(item) {
    setEditingDepartmentId(String(item.id));
    setEditingDepartmentName(String(item.name || ""));
    setNotice("");
  }

  function cancelEditDepartment() {
    setEditingDepartmentId("");
    setEditingDepartmentName("");
  }

  async function handleUpdateDepartment(departmentId) {
    const name = editingDepartmentName.trim();
    if (!departmentId || !name || savingDepartmentRowId) {
      return;
    }
    setSavingDepartmentRowId(String(departmentId));
    setNotice("");
    try {
      const data = await apiFetch(`/api/business-autopilot/departments/${departmentId}`, {
        method: "PUT",
        body: JSON.stringify({ name })
      });
      setDepartments(data.departments || []);
      if (data.employee_roles) {
        setEmployeeRoles(data.employee_roles || []);
      }
      cancelEditDepartment();
      setNotice("Department updated.");
    } catch (error) {
      setNotice(error?.message || "Unable to update department.");
    } finally {
      setSavingDepartmentRowId("");
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
      if (data.employee_roles) {
        setEmployeeRoles(data.employee_roles || []);
      }
      if (String(editingDepartmentId) === String(departmentId)) {
        cancelEditDepartment();
      }
      setNotice("Department deleted.");
    } catch (error) {
      setNotice(error?.message || "Unable to delete department.");
    } finally {
      setDeletingDepartmentId("");
    }
  }

  const filteredUsers = useMemo(() => {
    const q = userSearch.trim().toLowerCase();
    if (!q) {
      return users;
    }
    return users.filter((user) =>
      [
        user.name,
        user.email,
        user.department,
        user.role,
        user.employee_role,
        user.is_active ? "active" : "inactive",
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(q)
    );
  }, [users, userSearch]);

  const filteredEmployeeRoles = useMemo(() => {
    const q = employeeRoleSearch.trim().toLowerCase();
    if (!q) {
      return employeeRoles;
    }
    return employeeRoles.filter((item) => String(item.name || "").toLowerCase().includes(q));
  }, [employeeRoles, employeeRoleSearch]);

  const filteredDepartments = useMemo(() => {
    const q = departmentSearch.trim().toLowerCase();
    if (!q) {
      return departments;
    }
    return departments.filter((item) => String(item.name || "").toLowerCase().includes(q));
  }, [departments, departmentSearch]);

  const totalUserPages = Math.max(1, Math.ceil(filteredUsers.length / pageSize));
  const normalizedUserPage = Math.min(userPage, totalUserPages);
  const paginatedUsers = filteredUsers.slice((normalizedUserPage - 1) * pageSize, normalizedUserPage * pageSize);
  const userStartIndex = filteredUsers.length ? (normalizedUserPage - 1) * pageSize + 1 : 0;
  const userEndIndex = Math.min(normalizedUserPage * pageSize, filteredUsers.length);
  const totalEmployeeRolePages = Math.max(1, Math.ceil(filteredEmployeeRoles.length / pageSize));
  const normalizedEmployeeRolePage = Math.min(employeeRolePage, totalEmployeeRolePages);
  const paginatedEmployeeRoles = filteredEmployeeRoles.slice((normalizedEmployeeRolePage - 1) * pageSize, normalizedEmployeeRolePage * pageSize);
  const employeeRoleStartIndex = filteredEmployeeRoles.length ? (normalizedEmployeeRolePage - 1) * pageSize + 1 : 0;
  const employeeRoleEndIndex = Math.min(normalizedEmployeeRolePage * pageSize, filteredEmployeeRoles.length);
  const totalDepartmentPages = Math.max(1, Math.ceil(filteredDepartments.length / pageSize));
  const normalizedDepartmentPage = Math.min(departmentPage, totalDepartmentPages);
  const paginatedDepartments = filteredDepartments.slice((normalizedDepartmentPage - 1) * pageSize, normalizedDepartmentPage * pageSize);
  const departmentStartIndex = filteredDepartments.length ? (normalizedDepartmentPage - 1) * pageSize + 1 : 0;
  const departmentEndIndex = Math.min(normalizedDepartmentPage * pageSize, filteredDepartments.length);
  const roleAccessRoleOptions = useMemo(() => {
    const employeeRoleOptions = employeeRoles.map((role) => ({
      key: `employee_role:${String(role.name || "").trim()}`,
      label: `Employee Role: ${role.name}`,
    })).filter((item) => item.key !== "employee_role:");
    const unique = new Map();
    [...SYSTEM_ROLE_OPTIONS, ...employeeRoleOptions].forEach((item) => {
      if (!unique.has(item.key)) {
        unique.set(item.key, item);
      }
    });
    return Array.from(unique.values());
  }, [employeeRoles]);

  useEffect(() => {
    if (roleAccessRoleOptions.some((item) => item.key === selectedRoleAccessKey)) {
      return;
    }
    setSelectedRoleAccessKey(roleAccessRoleOptions[0]?.key || SYSTEM_ROLE_OPTIONS[0].key);
  }, [roleAccessRoleOptions, selectedRoleAccessKey]);

  const selectedRoleAccess = roleAccessMap[selectedRoleAccessKey] || createDefaultRoleAccessRecord();

  function updateRoleAccess(updater) {
    if (!canManageUsers) {
      return;
    }
    setRoleAccessMap((prev) => {
      const current = prev[selectedRoleAccessKey] || createDefaultRoleAccessRecord();
      const nextRecord = typeof updater === "function" ? updater(current) : current;
      return {
        ...prev,
        [selectedRoleAccessKey]: nextRecord,
      };
    });
    setNotice("Role access settings saved locally.");
  }

  return (
    <div className="d-flex flex-column gap-3">
      <div>
        <h4 className="mb-2">ERP Users</h4>
        <p className="text-secondary mb-0">Create and manage users for Business Autopilot ERP.</p>
        <div className="d-flex flex-wrap gap-2 mt-3">
          <button
            type="button"
            className={`btn btn-sm ${activeTopTab === "users" ? "btn-success" : "btn-outline-light"}`}
            onClick={() => setActiveTopTab("users")}
          >
            Users
          </button>
          <button
            type="button"
            className={`btn btn-sm ${activeTopTab === "role-access" ? "btn-success" : "btn-outline-light"}`}
            onClick={() => setActiveTopTab("role-access")}
          >
            Role Based Access
          </button>
        </div>
      </div>

      {notice ? <div className="alert alert-info py-2 mb-0">{notice}</div> : null}

      {activeTopTab === "users" ? (
        <>
          {canManageUsers ? (
            <>
              <div className="row g-3">
                <div className="col-12 col-xl-6">
                  <div className="card p-3 h-100">
                    <h6 className="mb-3">Employee Role Master</h6>
                    <form className="row g-2" onSubmit={handleCreateEmployeeRole}>
                      <div className="col-12 col-md-8">
                        <input
                          type="text"
                          className="form-control"
                          placeholder="Create Employee Role (e.g. Accountant)"
                          value={newEmployeeRole}
                          onChange={(event) => setNewEmployeeRole(event.target.value)}
                        />
                      </div>
                <div className="col-12 col-md-4 d-grid">
                  <button type="submit" className="btn btn-outline-success" disabled={savingEmployeeRole}>
                    {savingEmployeeRole ? "Adding..." : "Add Role"}
                  </button>
                </div>
              </form>
              <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 mt-3 mb-2">
                <span className="badge bg-secondary">{filteredEmployeeRoles.length} items</span>
                <div className="table-search">
                  <i className="bi bi-search" aria-hidden="true" />
                  <input
                    type="search"
                    className="form-control form-control-sm"
                    placeholder="Search roles"
                    value={employeeRoleSearch}
                    onChange={(event) => setEmployeeRoleSearch(event.target.value)}
                  />
                </div>
              </div>
              <div className="table-responsive">
                <table className="table table-dark table-hover align-middle mb-0">
                  <thead>
                    <tr>
                      <th>Role Name</th>
                      <th className="text-end">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedEmployeeRoles.length ? (
                      paginatedEmployeeRoles.map((item) => (
                        <tr key={`employee-role-${item.id}`}>
                          <td>
                            {editingEmployeeRoleId === String(item.id) ? (
                              <input
                                type="text"
                                className="form-control form-control-sm"
                                value={editingEmployeeRoleName}
                                onChange={(event) => setEditingEmployeeRoleName(event.target.value)}
                              />
                            ) : (
                              item.name
                            )}
                          </td>
                          <td className="text-end">
                            <div className="d-inline-flex gap-2">
                              {editingEmployeeRoleId === String(item.id) ? (
                                <>
                                  <button type="button" className="btn btn-sm btn-success" disabled={savingEmployeeRoleRowId === String(item.id)} onClick={() => handleUpdateEmployeeRole(item.id)}>
                                    {savingEmployeeRoleRowId === String(item.id) ? "Saving..." : "Save"}
                                  </button>
                                  <button type="button" className="btn btn-sm btn-outline-light" onClick={cancelEditEmployeeRole}>
                                    Cancel
                                  </button>
                                </>
                              ) : (
                                <>
                                  <button type="button" className="btn btn-sm btn-outline-info" onClick={() => startEditEmployeeRole(item)}>
                                    Edit
                                  </button>
                                  <button type="button" className="btn btn-sm btn-outline-danger" disabled={deletingEmployeeRoleId === String(item.id)} onClick={() => handleDeleteEmployeeRole(item.id)}>
                                    {deletingEmployeeRoleId === String(item.id) ? "Deleting..." : "Delete"}
                                  </button>
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr><td colSpan={2}>No employee roles found.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
              <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 mt-2">
                <div className="small text-secondary">
                  Showing {employeeRoleStartIndex} to {employeeRoleEndIndex} of {filteredEmployeeRoles.length} entries
                </div>
                <TablePagination page={normalizedEmployeeRolePage} totalPages={totalEmployeeRolePages} onPageChange={setEmployeeRolePage} />
              </div>
            </div>
          </div>
                <div className="col-12 col-xl-6">
                  <div className="card p-3 h-100">
                    <h6 className="mb-3">Department Master</h6>
                    <form className="row g-2" onSubmit={handleCreateDepartment}>
                      <div className="col-12 col-md-8">
                        <input
                          type="text"
                          className="form-control"
                          placeholder="Create Department (e.g. Accounts)"
                          value={newDepartment}
                          onChange={(event) => setNewDepartment(event.target.value)}
                        />
                      </div>
                <div className="col-12 col-md-4 d-grid">
                  <button type="submit" className="btn btn-outline-success" disabled={savingDepartment}>
                    {savingDepartment ? "Adding..." : "Add Department"}
                  </button>
                </div>
              </form>
              <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 mt-3 mb-2">
                <span className="badge bg-secondary">{filteredDepartments.length} items</span>
                <div className="table-search">
                  <i className="bi bi-search" aria-hidden="true" />
                  <input
                    type="search"
                    className="form-control form-control-sm"
                    placeholder="Search departments"
                    value={departmentSearch}
                    onChange={(event) => setDepartmentSearch(event.target.value)}
                  />
                </div>
              </div>
              <div className="table-responsive">
                <table className="table table-dark table-hover align-middle mb-0">
                  <thead>
                    <tr>
                      <th>Department Name</th>
                      <th className="text-end">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedDepartments.length ? (
                      paginatedDepartments.map((item) => (
                        <tr key={`department-${item.id}`}>
                          <td>
                            {editingDepartmentId === String(item.id) ? (
                              <input
                                type="text"
                                className="form-control form-control-sm"
                                value={editingDepartmentName}
                                onChange={(event) => setEditingDepartmentName(event.target.value)}
                              />
                            ) : (
                              item.name
                            )}
                          </td>
                          <td className="text-end">
                            <div className="d-inline-flex gap-2">
                              {editingDepartmentId === String(item.id) ? (
                                <>
                                  <button type="button" className="btn btn-sm btn-success" disabled={savingDepartmentRowId === String(item.id)} onClick={() => handleUpdateDepartment(item.id)}>
                                    {savingDepartmentRowId === String(item.id) ? "Saving..." : "Save"}
                                  </button>
                                  <button type="button" className="btn btn-sm btn-outline-light" onClick={cancelEditDepartment}>
                                    Cancel
                                  </button>
                                </>
                              ) : (
                                <>
                                  <button type="button" className="btn btn-sm btn-outline-info" onClick={() => startEditDepartment(item)}>
                                    Edit
                                  </button>
                                  <button type="button" className="btn btn-sm btn-outline-danger" disabled={deletingDepartmentId === String(item.id)} onClick={() => handleDeleteDepartment(item.id)}>
                                    {deletingDepartmentId === String(item.id) ? "Deleting..." : "Delete"}
                                  </button>
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr><td colSpan={2}>No departments found.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
              <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 mt-2">
                <div className="small text-secondary">
                  Showing {departmentStartIndex} to {departmentEndIndex} of {filteredDepartments.length} entries
                </div>
                <TablePagination page={normalizedDepartmentPage} totalPages={totalDepartmentPages} onPageChange={setDepartmentPage} />
              </div>
            </div>
          </div>
              </div>

              <div>
                <h6 className="mb-3">Create User</h6>
                <form className="row g-2" onSubmit={handleCreate}>
                  <div className="col-12 col-md-2">
                    <input type="text" className="form-control" placeholder="Full Name" value={form.name} onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))} required />
                  </div>
                  <div className="col-12 col-md-2">
                    <input type="email" className="form-control" placeholder="Email" value={form.email} onChange={(event) => setForm((prev) => ({ ...prev, email: event.target.value }))} required />
                  </div>
                  <div className="col-12 col-md-2">
                    <input type="password" className="form-control" placeholder="Password" value={form.password} onChange={(event) => setForm((prev) => ({ ...prev, password: event.target.value }))} minLength={6} required />
                  </div>
                  <div className="col-12 col-md-2">
                    <select className="form-select" value={form.department_id} onChange={(event) => setForm((prev) => ({ ...prev, department_id: event.target.value }))}>
                      <option value="">Department</option>
                      {departments.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                    </select>
                  </div>
                  <div className="col-12 col-md-2">
                    <select className="form-select" value={form.employee_role_id} onChange={(event) => setForm((prev) => ({ ...prev, employee_role_id: event.target.value }))}>
                      <option value="">Employee Role</option>
                      {employeeRoles.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                    </select>
                  </div>
                  <div className="col-12 col-md-2 d-grid">
                    <button type="submit" className="btn btn-primary" disabled={saving} title="Create User">
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
                  <input type="text" className="form-control" placeholder="Full Name" value={editForm.name} onChange={(event) => setEditForm((prev) => ({ ...prev, name: event.target.value }))} required />
                </div>
                <div className="col-12 col-md-2">
                  <select className="form-select" value={editForm.role} onChange={(event) => setEditForm((prev) => ({ ...prev, role: event.target.value }))}>
                    <option value="org_user">Org User</option>
                    <option value="hr_view">HR View</option>
                    <option value="company_admin">Company Admin</option>
                  </select>
                </div>
                <div className="col-12 col-md-2">
                  <select className="form-select" value={editForm.department_id} onChange={(event) => setEditForm((prev) => ({ ...prev, department_id: event.target.value }))}>
                    <option value="">Department</option>
                    {departments.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                  </select>
                </div>
                <div className="col-12 col-md-3">
                  <select className="form-select" value={editForm.employee_role_id} onChange={(event) => setEditForm((prev) => ({ ...prev, employee_role_id: event.target.value }))}>
                    <option value="">Employee Role</option>
                    {employeeRoles.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                  </select>
                </div>
                <div className="col-12 col-md-2">
                  <select className="form-select" value={editForm.is_active ? "active" : "inactive"} onChange={(event) => setEditForm((prev) => ({ ...prev, is_active: event.target.value === "active" }))}>
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                  </select>
                </div>
                <div className="col-12 col-md-2 d-flex gap-2">
                  <button type="submit" className="btn btn-success w-100" disabled={savingEdit}>
                    {savingEdit ? "Updating..." : "Update"}
                  </button>
                  <button type="button" className="btn btn-outline-light" onClick={cancelEdit}>Cancel</button>
                </div>
              </form>
            </div>
          ) : null}

          <div>
            <h6 className="mb-3">User List</h6>
            <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-2">
              <span className="badge bg-secondary">{filteredUsers.length} items</span>
              <div className="table-search">
                <i className="bi bi-search" aria-hidden="true" />
                <input type="search" className="form-control form-control-sm" placeholder="Search users" value={userSearch} onChange={(event) => setUserSearch(event.target.value)} />
              </div>
            </div>
            <div className="table-responsive">
              <table className="table table-dark table-hover align-middle mb-0">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Email</th>
                    <th>Department</th>
                    <th>Role</th>
                    <th>Employee Role</th>
                    <th>Status</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr><td colSpan={7}>Loading users...</td></tr>
                  ) : paginatedUsers.length ? (
                    paginatedUsers.map((user) => (
                      <tr key={user.membership_id || user.id}>
                        <td>{user.name || "-"}</td>
                        <td>{user.email || "-"}</td>
                        <td>{user.department || "-"}</td>
                        <td>{(user.role || "org_user").replace("_", " ")}</td>
                        <td>{user.employee_role || "-"}</td>
                        <td>{user.is_active ? "Active" : "Inactive"}</td>
                        <td>
                          <div className="d-inline-flex gap-2">
                            <button type="button" className="btn btn-sm btn-outline-info" onClick={() => openEdit(user)}>Edit</button>
                            <button type="button" className="btn btn-sm btn-outline-danger" onClick={() => handleDeleteUser(user.membership_id)} disabled={deletingMembershipId === String(user.membership_id)}>
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
            {!loading ? (
              <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 mt-2">
                <div className="small text-secondary">
                  Showing {userStartIndex} to {userEndIndex} of {filteredUsers.length} entries
                </div>
                <TablePagination page={normalizedUserPage} totalPages={totalUserPages} onPageChange={setUserPage} />
              </div>
            ) : null}
          </div>
        </>
      ) : (
        <div className="card p-3">
          <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-3">
            <div>
              <h6 className="mb-1">Role Based Access</h6>
              <div className="small text-secondary">Configure section-level permissions for system roles and employee roles.</div>
            </div>
            <div style={{ minWidth: 280 }}>
              <label className="form-label small text-secondary mb-1">Role</label>
              <select className="form-select form-select-sm" value={selectedRoleAccessKey} onChange={(event) => setSelectedRoleAccessKey(event.target.value)}>
                {roleAccessRoleOptions.map((item) => (
                  <option key={item.key} value={item.key}>{item.label}</option>
                ))}
              </select>
            </div>
          </div>

          {!canManageUsers ? (
            <div className="alert alert-warning py-2">Only company admin can update role based access.</div>
          ) : null}

          <div className="table-responsive mb-3">
            <table className="table table-dark table-hover align-middle mb-0">
              <thead>
                <tr>
                  <th>Section</th>
                  <th>Access Level</th>
                </tr>
              </thead>
              <tbody>
                {ROLE_ACCESS_SECTIONS.map((section) => (
                  <tr key={section.key}>
                    <td>{section.label}</td>
                    <td>
                      <select
                        className="form-select form-select-sm"
                        value={selectedRoleAccess.sections?.[section.key] || "No Access"}
                        disabled={!canManageUsers}
                        onChange={(event) => updateRoleAccess((prev) => ({
                          ...prev,
                          sections: { ...(prev.sections || {}), [section.key]: event.target.value }
                        }))}
                      >
                        {ACCESS_LEVEL_OPTIONS.map((level) => (
                          <option key={`${section.key}-${level}`} value={level}>{level}</option>
                        ))}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="row g-3">
            <div className="col-12 col-md-4">
              <div className="form-check form-switch">
                <input id="rbac-export" className="form-check-input" type="checkbox" checked={Boolean(selectedRoleAccess.can_export)} disabled={!canManageUsers} onChange={(event) => updateRoleAccess((prev) => ({ ...prev, can_export: event.target.checked }))} />
                <label className="form-check-label" htmlFor="rbac-export">Allow Export</label>
              </div>
            </div>
            <div className="col-12 col-md-4">
              <div className="form-check form-switch">
                <input id="rbac-delete" className="form-check-input" type="checkbox" checked={Boolean(selectedRoleAccess.can_delete)} disabled={!canManageUsers} onChange={(event) => updateRoleAccess((prev) => ({ ...prev, can_delete: event.target.checked }))} />
                <label className="form-check-label" htmlFor="rbac-delete">Allow Delete</label>
              </div>
            </div>
            <div className="col-12 col-md-4">
              <div className="form-check form-switch">
                <input id="rbac-self-att" className="form-check-input" type="checkbox" checked={Boolean(selectedRoleAccess.attendance_self_service)} disabled={!canManageUsers} onChange={(event) => updateRoleAccess((prev) => ({ ...prev, attendance_self_service: event.target.checked }))} />
                <label className="form-check-label" htmlFor="rbac-self-att">Attendance Self-Service</label>
              </div>
            </div>
            <div className="col-12">
              <label className="form-label small text-secondary mb-1">Remarks</label>
              <textarea
                className="form-control"
                rows="2"
                placeholder="Notes for this role"
                value={selectedRoleAccess.remarks || ""}
                disabled={!canManageUsers}
                onChange={(event) => updateRoleAccess((prev) => ({ ...prev, remarks: event.target.value }))}
              />
            </div>
          </div>

          <hr />
          <div>
            <div className="small text-secondary mb-2">Enabled Access Preview</div>
            <div className="d-flex flex-wrap gap-2">
              {ROLE_ACCESS_SECTIONS.filter((section) => (selectedRoleAccess.sections?.[section.key] || "No Access") !== "No Access").map((section) => (
                <span key={`rbac-preview-${section.key}`} className="badge text-bg-success">
                  {section.label}: {selectedRoleAccess.sections?.[section.key]}
                </span>
              ))}
              {!ROLE_ACCESS_SECTIONS.some((section) => (selectedRoleAccess.sections?.[section.key] || "No Access") !== "No Access") ? (
                <span className="text-secondary small">No access sections configured.</span>
              ) : null}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
