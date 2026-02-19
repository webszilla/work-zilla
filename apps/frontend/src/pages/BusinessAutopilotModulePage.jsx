import { useEffect, useMemo, useState } from "react";

const STORAGE_KEY = "wz_business_autopilot_projects_module";
const HR_STORAGE_KEY = "wz_business_autopilot_hr_module";

const MODULE_CONTENT = {
  crm: {
    title: "CRM",
    subtitle: "Manage leads, deals, and customer follow-ups.",
    stats: [
      { label: "Open Leads", value: "24" },
      { label: "Pipeline Value", value: "INR 8.4L" },
      { label: "Follow-ups Today", value: "11" }
    ],
    sections: [
      "Lead pipeline board",
      "Deal stage tracking",
      "Activity timeline",
      "Contact import/export"
    ]
  },
  hrm: {
    title: "HR Management",
    subtitle: "Handle employees, attendance, and payroll workflows.",
    stats: [
      { label: "Employees", value: "42" },
      { label: "Attendance Today", value: "89%" },
      { label: "Pending Leaves", value: "6" }
    ],
    sections: [
      "Employee directory",
      "Attendance and shifts",
      "Leave approvals",
      "Payroll run setup"
    ]
  },
  projects: {
    title: "Project Management",
    subtitle: "Track project milestones, tasks, and team delivery."
  },
  accounts: {
    title: "Accounts / ERP",
    subtitle: "Control billing, expenses, GST, and accounting reports.",
    stats: [
      { label: "Invoices This Month", value: "126" },
      { label: "Receivables", value: "INR 3.2L" },
      { label: "GST Status", value: "Ready" }
    ],
    sections: [
      "Invoice and billing",
      "Expense tracking",
      "GST reports",
      "Vendor and purchase entries"
    ]
  }
};

const PROJECT_TAB_CONFIG = {
  projects: {
    label: "Projects",
    itemLabel: "Project",
    columns: [
      { key: "name", label: "Project Name" },
      { key: "owner", label: "Owner" },
      { key: "status", label: "Status" }
    ],
    fields: [
      { key: "name", label: "Project Name", placeholder: "Enter project name" },
      { key: "owner", label: "Owner", placeholder: "Enter owner name" },
      { key: "status", label: "Status", placeholder: "Active / Planned / Hold" }
    ]
  },
  tasks: {
    label: "Tasks",
    itemLabel: "Task",
    columns: [
      { key: "title", label: "Task" },
      { key: "assignee", label: "Assignee" },
      { key: "dueDate", label: "Due Date" }
    ],
    fields: [
      { key: "title", label: "Task", placeholder: "Enter task title" },
      { key: "assignee", label: "Assignee", placeholder: "Enter assignee name" },
      { key: "dueDate", label: "Due Date", placeholder: "YYYY-MM-DD" }
    ]
  },
  milestones: {
    label: "Milestones",
    itemLabel: "Milestone",
    columns: [
      { key: "title", label: "Milestone" },
      { key: "project", label: "Project" },
      { key: "targetDate", label: "Target Date" }
    ],
    fields: [
      { key: "title", label: "Milestone", placeholder: "Enter milestone title" },
      { key: "project", label: "Project", placeholder: "Enter project name" },
      { key: "targetDate", label: "Target Date", placeholder: "YYYY-MM-DD" }
    ]
  },
  team: {
    label: "Team",
    itemLabel: "Team Member",
    columns: [
      { key: "name", label: "Name" },
      { key: "role", label: "Role" },
      { key: "project", label: "Project" }
    ],
    fields: [
      { key: "name", label: "Name", placeholder: "Enter member name" },
      { key: "role", label: "Role", placeholder: "Enter role" },
      { key: "project", label: "Project", placeholder: "Enter project name" }
    ]
  }
};

const DEFAULT_PROJECT_DATA = {
  projects: [
    { id: "p1", name: "ERP Rollout", owner: "Guru", status: "Active" },
    { id: "p2", name: "HR Automation", owner: "Nithya", status: "Planned" }
  ],
  tasks: [
    { id: "t1", title: "Finalize sprint board", assignee: "Guru", dueDate: "2026-02-20" },
    { id: "t2", title: "Client approval review", assignee: "Arun", dueDate: "2026-02-22" }
  ],
  milestones: [
    { id: "m1", title: "Phase 1 Go-Live", project: "ERP Rollout", targetDate: "2026-03-10" },
    { id: "m2", title: "Payroll Cutover", project: "HR Automation", targetDate: "2026-03-25" }
  ],
  team: [
    { id: "u1", name: "Guru", role: "Project Manager", project: "ERP Rollout" },
    { id: "u2", name: "Nithya", role: "Business Analyst", project: "HR Automation" }
  ]
};

const HR_TAB_CONFIG = {
  employees: {
    label: "Employees",
    itemLabel: "Employee",
    columns: [
      { key: "name", label: "Name" },
      { key: "department", label: "Department" },
      { key: "designation", label: "Designation" }
    ],
    fields: [
      { key: "name", label: "Name", placeholder: "Enter employee name" },
      { key: "department", label: "Department", placeholder: "HR / Sales / Engineering" },
      { key: "designation", label: "Designation", placeholder: "Executive / Manager" }
    ]
  },
  attendance: {
    label: "Attendance",
    itemLabel: "Attendance Entry",
    columns: [
      { key: "employee", label: "Employee" },
      { key: "date", label: "Date" },
      { key: "status", label: "Status" }
    ],
    fields: [
      { key: "employee", label: "Employee", placeholder: "Enter employee name" },
      { key: "date", label: "Date", placeholder: "YYYY-MM-DD" },
      { key: "status", label: "Status", placeholder: "Present / Half Day / Leave" }
    ]
  },
  leaves: {
    label: "Leaves",
    itemLabel: "Leave Request",
    columns: [
      { key: "employee", label: "Employee" },
      { key: "leaveType", label: "Leave Type" },
      { key: "status", label: "Status" }
    ],
    fields: [
      { key: "employee", label: "Employee", placeholder: "Enter employee name" },
      { key: "leaveType", label: "Leave Type", placeholder: "Sick / Casual / Paid" },
      { key: "status", label: "Status", placeholder: "Pending / Approved / Rejected" }
    ]
  },
  payroll: {
    label: "Payroll",
    itemLabel: "Payroll Entry",
    columns: [
      { key: "employee", label: "Employee" },
      { key: "month", label: "Month" },
      { key: "salary", label: "Net Salary" }
    ],
    fields: [
      { key: "employee", label: "Employee", placeholder: "Enter employee name" },
      { key: "month", label: "Month", placeholder: "YYYY-MM" },
      { key: "salary", label: "Net Salary", placeholder: "INR amount" }
    ]
  }
};

const DEFAULT_HR_DATA = {
  employees: [
    { id: "e1", name: "Guru", department: "Engineering", designation: "Project Lead" },
    { id: "e2", name: "Nithya", department: "HR", designation: "HR Executive" }
  ],
  attendance: [
    { id: "a1", employee: "Guru", date: "2026-02-19", status: "Present" },
    { id: "a2", employee: "Nithya", date: "2026-02-19", status: "Present" }
  ],
  leaves: [
    { id: "l1", employee: "Arun", leaveType: "Sick", status: "Pending" },
    { id: "l2", employee: "Kiran", leaveType: "Casual", status: "Approved" }
  ],
  payroll: [
    { id: "pr1", employee: "Guru", month: "2026-02", salary: "INR 85,000" },
    { id: "pr2", employee: "Nithya", month: "2026-02", salary: "INR 42,000" }
  ]
};

function buildEmptyValues(fields) {
  return fields.reduce((acc, field) => {
    acc[field.key] = "";
    return acc;
  }, {});
}

function isValidProjectData(value) {
  return value && typeof value === "object" && Object.keys(PROJECT_TAB_CONFIG).every((key) => Array.isArray(value[key]));
}

function isValidHrData(value) {
  return value && typeof value === "object" && Object.keys(HR_TAB_CONFIG).every((key) => Array.isArray(value[key]));
}

function ProjectManagementModule() {
  const [activeTab, setActiveTab] = useState("projects");
  const [moduleData, setModuleData] = useState(DEFAULT_PROJECT_DATA);
  const [formValues, setFormValues] = useState(buildEmptyValues(PROJECT_TAB_CONFIG.projects.fields));
  const [editingId, setEditingId] = useState("");

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        return;
      }
      const parsed = JSON.parse(raw);
      if (isValidProjectData(parsed)) {
        setModuleData(parsed);
      }
    } catch (_error) {
      // Ignore invalid cached module data.
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(moduleData));
  }, [moduleData]);

  useEffect(() => {
    setEditingId("");
    setFormValues(buildEmptyValues(PROJECT_TAB_CONFIG[activeTab].fields));
  }, [activeTab]);

  const config = PROJECT_TAB_CONFIG[activeTab];
  const currentRows = moduleData[activeTab] || [];

  const stats = useMemo(() => {
    const activeProjects = (moduleData.projects || []).filter((item) => item.status.toLowerCase() === "active").length;
    const upcomingTasks = (moduleData.tasks || []).length;
    const overdueTasks = (moduleData.tasks || []).filter((item) => {
      const value = Date.parse(item.dueDate);
      return Number.isFinite(value) && value < Date.now();
    }).length;
    return [
      { label: "Active Projects", value: String(activeProjects) },
      { label: "Tasks", value: String(upcomingTasks) },
      { label: "Overdue Tasks", value: String(overdueTasks) }
    ];
  }, [moduleData]);

  function onChangeField(fieldKey, nextValue) {
    setFormValues((prev) => ({ ...prev, [fieldKey]: nextValue }));
  }

  function onEditRow(row) {
    setEditingId(row.id);
    const nextValues = {};
    config.fields.forEach((field) => {
      nextValues[field.key] = row[field.key] || "";
    });
    setFormValues(nextValues);
  }

  function onCancelEdit() {
    setEditingId("");
    setFormValues(buildEmptyValues(config.fields));
  }

  function onDeleteRow(rowId) {
    setModuleData((prev) => ({
      ...prev,
      [activeTab]: (prev[activeTab] || []).filter((row) => row.id !== rowId)
    }));
    if (editingId === rowId) {
      onCancelEdit();
    }
  }

  function onSubmit(event) {
    event.preventDefault();
    const hasEmptyField = config.fields.some((field) => !String(formValues[field.key] || "").trim());
    if (hasEmptyField) {
      return;
    }
    const payload = {};
    config.fields.forEach((field) => {
      payload[field.key] = String(formValues[field.key]).trim();
    });
    setModuleData((prev) => {
      const existing = prev[activeTab] || [];
      if (editingId) {
        return {
          ...prev,
          [activeTab]: existing.map((row) => (row.id === editingId ? { ...row, ...payload } : row))
        };
      }
      return {
        ...prev,
        [activeTab]: [{ id: `${activeTab}_${Date.now()}`, ...payload }, ...existing]
      };
    });
    onCancelEdit();
  }

  return (
    <div className="d-flex flex-column gap-3">
      <div className="card p-3">
        <h4 className="mb-2">Project Management</h4>
        <p className="text-secondary mb-3">Track project milestones, tasks, and team delivery.</p>
        <div className="d-flex flex-wrap gap-2">
          {Object.entries(PROJECT_TAB_CONFIG).map(([tabKey, tabValue]) => (
            <button
              key={tabKey}
              type="button"
              className={`btn btn-sm ${activeTab === tabKey ? "btn-success" : "btn-outline-light"}`}
              onClick={() => setActiveTab(tabKey)}
            >
              {tabValue.label}
            </button>
          ))}
        </div>
      </div>

      <div className="row g-3">
        {stats.map((item) => (
          <div className="col-12 col-md-4" key={item.label}>
            <div className="card p-3 h-100">
              <div className="text-secondary small">{item.label}</div>
              <h5 className="mb-0 mt-1">{item.value}</h5>
            </div>
          </div>
        ))}
      </div>

      <div className="card p-3">
        <div className="d-flex align-items-center justify-content-between mb-3">
          <h6 className="mb-0">{config.label}</h6>
          <span className="badge bg-secondary">{currentRows.length} items</span>
        </div>
        <div className="table-responsive">
          <table className="table table-dark table-borderless align-middle mb-2">
            <thead>
              <tr>
                {config.columns.map((column) => (
                  <th key={column.key}>{column.label}</th>
                ))}
                <th className="text-end">Action</th>
              </tr>
            </thead>
            <tbody>
              {currentRows.length === 0 ? (
                <tr>
                  <td colSpan={config.columns.length + 1} className="text-secondary">
                    No {config.label.toLowerCase()} yet.
                  </td>
                </tr>
              ) : (
                currentRows.map((row) => (
                  <tr key={row.id}>
                    {config.columns.map((column) => (
                      <td key={`${row.id}_${column.key}`}>{row[column.key] || "-"}</td>
                    ))}
                    <td className="text-end">
                      <div className="d-inline-flex gap-2">
                        <button type="button" className="btn btn-sm btn-outline-info" onClick={() => onEditRow(row)}>
                          Edit
                        </button>
                        <button type="button" className="btn btn-sm btn-outline-danger" onClick={() => onDeleteRow(row.id)}>
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card p-3">
        <h6 className="mb-3">{editingId ? `Edit ${config.itemLabel}` : `Create ${config.itemLabel}`}</h6>
        <form className="d-flex flex-column gap-3" onSubmit={onSubmit}>
          <div className="row g-3">
            {config.fields.map((field) => (
              <div className="col-12 col-md-4" key={field.key}>
                <label className="form-label small text-secondary mb-1">{field.label}</label>
                <input
                  type="text"
                  className="form-control"
                  placeholder={field.placeholder}
                  value={formValues[field.key] || ""}
                  onChange={(event) => onChangeField(field.key, event.target.value)}
                />
              </div>
            ))}
          </div>
          <div className="d-flex gap-2">
            <button type="submit" className="btn btn-success btn-sm">
              {editingId ? "Update" : "Create"}
            </button>
            {editingId ? (
              <button type="button" className="btn btn-outline-light btn-sm" onClick={onCancelEdit}>
                Cancel
              </button>
            ) : null}
          </div>
        </form>
      </div>
    </div>
  );
}

function HrManagementModule() {
  const [activeTab, setActiveTab] = useState("employees");
  const [moduleData, setModuleData] = useState(DEFAULT_HR_DATA);
  const [formValues, setFormValues] = useState(buildEmptyValues(HR_TAB_CONFIG.employees.fields));
  const [editingId, setEditingId] = useState("");

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(HR_STORAGE_KEY);
      if (!raw) {
        return;
      }
      const parsed = JSON.parse(raw);
      if (isValidHrData(parsed)) {
        setModuleData(parsed);
      }
    } catch (_error) {
      // Ignore invalid cached module data.
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem(HR_STORAGE_KEY, JSON.stringify(moduleData));
  }, [moduleData]);

  useEffect(() => {
    setEditingId("");
    setFormValues(buildEmptyValues(HR_TAB_CONFIG[activeTab].fields));
  }, [activeTab]);

  const config = HR_TAB_CONFIG[activeTab];
  const currentRows = moduleData[activeTab] || [];

  const stats = useMemo(() => {
    const employees = (moduleData.employees || []).length;
    const attendanceToday = (moduleData.attendance || []).filter((item) =>
      String(item.status || "").toLowerCase().includes("present")
    ).length;
    const pendingLeaves = (moduleData.leaves || []).filter((item) =>
      String(item.status || "").toLowerCase() === "pending"
    ).length;
    return [
      { label: "Employees", value: String(employees) },
      { label: "Attendance Today", value: String(attendanceToday) },
      { label: "Pending Leaves", value: String(pendingLeaves) }
    ];
  }, [moduleData]);

  function onChangeField(fieldKey, nextValue) {
    setFormValues((prev) => ({ ...prev, [fieldKey]: nextValue }));
  }

  function onEditRow(row) {
    setEditingId(row.id);
    const nextValues = {};
    config.fields.forEach((field) => {
      nextValues[field.key] = row[field.key] || "";
    });
    setFormValues(nextValues);
  }

  function onCancelEdit() {
    setEditingId("");
    setFormValues(buildEmptyValues(config.fields));
  }

  function onDeleteRow(rowId) {
    setModuleData((prev) => ({
      ...prev,
      [activeTab]: (prev[activeTab] || []).filter((row) => row.id !== rowId)
    }));
    if (editingId === rowId) {
      onCancelEdit();
    }
  }

  function onSubmit(event) {
    event.preventDefault();
    const hasEmptyField = config.fields.some((field) => !String(formValues[field.key] || "").trim());
    if (hasEmptyField) {
      return;
    }
    const payload = {};
    config.fields.forEach((field) => {
      payload[field.key] = String(formValues[field.key]).trim();
    });
    setModuleData((prev) => {
      const existing = prev[activeTab] || [];
      if (editingId) {
        return {
          ...prev,
          [activeTab]: existing.map((row) => (row.id === editingId ? { ...row, ...payload } : row))
        };
      }
      return {
        ...prev,
        [activeTab]: [{ id: `${activeTab}_${Date.now()}`, ...payload }, ...existing]
      };
    });
    onCancelEdit();
  }

  return (
    <div className="d-flex flex-column gap-3">
      <div className="card p-3">
        <h4 className="mb-2">HR Management</h4>
        <p className="text-secondary mb-3">Handle employees, attendance, leave approvals, and payroll.</p>
        <div className="d-flex flex-wrap gap-2">
          {Object.entries(HR_TAB_CONFIG).map(([tabKey, tabValue]) => (
            <button
              key={tabKey}
              type="button"
              className={`btn btn-sm ${activeTab === tabKey ? "btn-success" : "btn-outline-light"}`}
              onClick={() => setActiveTab(tabKey)}
            >
              {tabValue.label}
            </button>
          ))}
        </div>
      </div>

      <div className="row g-3">
        {stats.map((item) => (
          <div className="col-12 col-md-4" key={item.label}>
            <div className="card p-3 h-100">
              <div className="text-secondary small">{item.label}</div>
              <h5 className="mb-0 mt-1">{item.value}</h5>
            </div>
          </div>
        ))}
      </div>

      <div className="card p-3">
        <div className="d-flex align-items-center justify-content-between mb-3">
          <h6 className="mb-0">{config.label}</h6>
          <span className="badge bg-secondary">{currentRows.length} items</span>
        </div>
        <div className="table-responsive">
          <table className="table table-dark table-borderless align-middle mb-2">
            <thead>
              <tr>
                {config.columns.map((column) => (
                  <th key={column.key}>{column.label}</th>
                ))}
                <th className="text-end">Action</th>
              </tr>
            </thead>
            <tbody>
              {currentRows.length === 0 ? (
                <tr>
                  <td colSpan={config.columns.length + 1} className="text-secondary">
                    No {config.label.toLowerCase()} yet.
                  </td>
                </tr>
              ) : (
                currentRows.map((row) => (
                  <tr key={row.id}>
                    {config.columns.map((column) => (
                      <td key={`${row.id}_${column.key}`}>{row[column.key] || "-"}</td>
                    ))}
                    <td className="text-end">
                      <div className="d-inline-flex gap-2">
                        <button type="button" className="btn btn-sm btn-outline-info" onClick={() => onEditRow(row)}>
                          Edit
                        </button>
                        <button type="button" className="btn btn-sm btn-outline-danger" onClick={() => onDeleteRow(row.id)}>
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card p-3">
        <h6 className="mb-3">{editingId ? `Edit ${config.itemLabel}` : `Create ${config.itemLabel}`}</h6>
        <form className="d-flex flex-column gap-3" onSubmit={onSubmit}>
          <div className="row g-3">
            {config.fields.map((field) => (
              <div className="col-12 col-md-4" key={field.key}>
                <label className="form-label small text-secondary mb-1">{field.label}</label>
                <input
                  type="text"
                  className="form-control"
                  placeholder={field.placeholder}
                  value={formValues[field.key] || ""}
                  onChange={(event) => onChangeField(field.key, event.target.value)}
                />
              </div>
            ))}
          </div>
          <div className="d-flex gap-2">
            <button type="submit" className="btn btn-success btn-sm">
              {editingId ? "Update" : "Create"}
            </button>
            {editingId ? (
              <button type="button" className="btn btn-outline-light btn-sm" onClick={onCancelEdit}>
                Cancel
              </button>
            ) : null}
          </div>
        </form>
      </div>
    </div>
  );
}

function StandardModule({ heading, moduleData }) {
  return (
    <div className="d-flex flex-column gap-3">
      <div className="card p-3">
        <h4 className="mb-2">{heading}</h4>
        <p className="text-secondary mb-0">{moduleData.subtitle}</p>
      </div>

      <div className="row g-3">
        {(moduleData.stats || []).map((item) => (
          <div className="col-12 col-md-4" key={item.label}>
            <div className="card p-3 h-100">
              <div className="text-secondary small">{item.label}</div>
              <h5 className="mb-0 mt-1">{item.value}</h5>
            </div>
          </div>
        ))}
      </div>

      <div className="card p-3">
        <h6 className="mb-3">Enabled Features</h6>
        <div className="d-flex flex-column gap-2">
          {(moduleData.sections || []).map((section) => (
            <div key={section} className="d-flex align-items-center justify-content-between border rounded px-2 py-2">
              <span>{section}</span>
              <span className="badge bg-success">Ready</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function BusinessAutopilotModulePage({ moduleKey = "crm", title }) {
  const moduleData = MODULE_CONTENT[moduleKey] || MODULE_CONTENT.crm;
  const heading = title || moduleData.title;

  if (moduleKey === "projects") {
    return <ProjectManagementModule />;
  }
  if (moduleKey === "hrm") {
    return <HrManagementModule />;
  }

  return <StandardModule heading={heading} moduleData={moduleData} />;
}
