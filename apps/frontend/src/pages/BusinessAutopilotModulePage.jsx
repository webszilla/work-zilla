import { useEffect, useMemo, useRef, useState } from "react";
import JSZip from "jszip";
import { jsPDF } from "jspdf";

const STORAGE_KEY = "wz_business_autopilot_projects_module";
const HR_STORAGE_KEY = "wz_business_autopilot_hr_module";
const ACCOUNT_STORAGE_KEY = "wz_business_autopilot_accounts_module";

const MODULE_CONTENT = {
  crm: {
    title: "CRM",
    subtitle: "Manage leads, deals, and customer follow-ups.",
    stats: [
      { label: "Open Leads", value: "24", icon: "bi-person-lines-fill" },
      { label: "Pipeline Value", value: "INR 8.4L", icon: "bi-graph-up-arrow" },
      { label: "Follow-ups Today", value: "11", icon: "bi-bell" }
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

const CRM_STORAGE_KEY = "wz_business_autopilot_crm_module";

const CRM_TAB_CONFIG = {
  leads: {
    label: "Leads",
    itemLabel: "Lead",
    columns: [
      { key: "name", label: "Lead Name" },
      { key: "source", label: "Source" },
      { key: "status", label: "Status" }
    ],
    fields: [
      { key: "name", label: "Lead Name", placeholder: "Enter lead name" },
      { key: "company", label: "Contacts - Company", placeholder: "Search company from contacts" },
      { key: "source", label: "Source", placeholder: "Website / Referral / Call" },
      { key: "status", label: "Status", placeholder: "Open / Qualified / Closed" }
    ]
  },
  deals: {
    label: "Deals",
    itemLabel: "Deal",
    columns: [
      { key: "title", label: "Deal" },
      { key: "value", label: "Value" },
      { key: "stage", label: "Stage" }
    ],
    fields: [
      { key: "title", label: "Deal", placeholder: "Enter deal title" },
      { key: "value", label: "Value", placeholder: "INR amount" },
      { key: "stage", label: "Stage", placeholder: "Prospecting / Negotiation / Won" }
    ]
  },
  contacts: {
    label: "Contacts",
    itemLabel: "Contact",
    columns: [
      { key: "name", label: "Name" },
      { key: "company", label: "Company" },
      { key: "email", label: "Email ID" },
      { key: "city", label: "City" },
      { key: "phone", label: "Phone" }
    ],
    fields: [
      { key: "name", label: "Name", placeholder: "Enter contact name" },
      { key: "company", label: "Company", placeholder: "Enter company name" },
      { key: "email", label: "Email ID", placeholder: "Enter email address" },
      { key: "city", label: "City", placeholder: "Enter city" },
      { key: "phone", label: "Phone", placeholder: "Enter phone number" }
    ]
  },
  followups: {
    label: "Follow-ups",
    itemLabel: "Follow-up",
    columns: [
      { key: "lead", label: "Lead" },
      { key: "dueDate", label: "Due Date" },
      { key: "owner", label: "Owner" }
    ],
    fields: [
      { key: "lead", label: "Lead", placeholder: "Enter lead name" },
      { key: "dueDate", label: "Due Date", placeholder: "YYYY-MM-DD" },
      { key: "owner", label: "Owner", placeholder: "Enter owner name" }
    ]
  },
  meetings: {
    label: "Meeting Information",
    itemLabel: "Meeting",
    columns: [
      { key: "title", label: "Title" },
      { key: "venue", label: "Meeting Venue" },
      { key: "from", label: "From" },
      { key: "to", label: "To" },
      { key: "host", label: "Host" }
    ],
    fields: [
      { key: "title", label: "Title", placeholder: "Enter meeting title" },
      { key: "venue", label: "Meeting Venue", placeholder: "Client location / Online" },
      { key: "location", label: "Location", placeholder: "Enter location" },
      { key: "from", label: "From", placeholder: "YYYY-MM-DD HH:MM" },
      { key: "to", label: "To", placeholder: "YYYY-MM-DD HH:MM" },
      { key: "host", label: "Host", placeholder: "Enter host name" },
      { key: "participants", label: "Participants", placeholder: "Comma separated participants" },
      { key: "participantsReminder", label: "Participants Reminder", placeholder: "Select reminder" }
    ]
  }
};

const CRM_LEAD_STATUS_OPTIONS = [
  "Attempted to Contact",
  "Contact in Future",
  "Contacted",
  "Junk Lead",
  "Lost Lead",
  "Not Contacted",
  "Pre Qualified",
  "Qualified",
  "Open",
  "Closed",
];

const CRM_LEAD_SOURCE_OPTIONS = [
  "Website",
  "Google Search",
  "Social Media",
  "Referral",
  "Call",
  "Trade Show",
];

const CRM_MEETING_PARTICIPANTS_REMINDER_OPTIONS = [
  "None",
  "At time of meeting",
  "5 minutes before",
  "10 minutes before",
  "15 minutes before",
  "30 minutes before",
  "1 hour before",
  "2 hours before",
  "1 day before",
];

const DEFAULT_CRM_DATA = {
  leads: [
    { id: "l1", name: "Prakash Textiles", source: "Website", status: "Open" },
    { id: "l2", name: "Sun Agro", source: "Referral", status: "Qualified" }
  ],
  deals: [
    { id: "d1", title: "ERP Annual Plan", value: "INR 1,20,000", stage: "Negotiation" },
    { id: "d2", title: "Storage Upgrade", value: "INR 45,000", stage: "Prospecting" }
  ],
  contacts: [
    { id: "c1", name: "Mohan", company: "Prakash Textiles", email: "mohan@prakashtextiles.com", city: "Chennai", phone: "+91 98765 43210" },
    { id: "c2", name: "Anitha", company: "Sun Agro", email: "anitha@sunagro.in", city: "Coimbatore", phone: "+91 99887 77665" }
  ],
  followups: [
    { id: "f1", lead: "Prakash Textiles", dueDate: "2026-02-21", owner: "Guru" },
    { id: "f2", lead: "Sun Agro", dueDate: "2026-02-22", owner: "GP" }
  ],
  meetings: [
    {
      id: "m1",
      title: "New Meeting",
      venue: "Client location",
      location: "Chennai",
      from: "2026-02-20 12:00",
      to: "2026-02-20 13:00",
      host: "Sai Creatives",
      participants: "Guru, Mohan"
    }
  ]
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

const ACCOUNT_TAB_CONFIG = {
  invoices: { label: "GST Invoices", kind: "invoice" },
  estimates: { label: "GST Estimates", kind: "estimate" },
  gst: { label: "GST Summary", kind: "summary" }
};

const DEFAULT_ACCOUNT_DATA = {
  clients: [],
  invoices: [],
  estimates: [],
  invoiceTemplate: {
    companyName: "Work Zilla Technologies",
    gstin: "",
    contactNumber: "",
    email: "",
    bankName: "",
    accountNumber: "",
    ifsc: "",
    branch: "",
    companyAddress: "",
    logoDataUrl: ""
  }
};

const defaultAccountForm = {
  customerName: "",
  customerGstin: "",
  customerState: "Tamil Nadu",
  placeOfSupply: "Tamil Nadu",
  invoiceDate: "",
  dueDate: "",
  taxableValue: "",
  gstRate: "18",
  supplyType: "intra",
  notes: "",
  items: [{ description: "", hsnSac: "", quantity: "1", unitPrice: "0" }]
};

const defaultClientForm = {
  clientName: "",
  mobileCountryCode: "+91",
  mobile: "",
  altMobileCountryCode: "+91",
  alternativeMobile: "",
  email: "",
  alternativeEmail: "",
  companyCountry: "India",
  companyState: "",
  companyPincode: "",
  companyCity: "",
  companyAddress: "",
  sameAsCompanyBilling: false,
  billingCountry: "India",
  billingState: "",
  billingPincode: "",
  billingCity: "",
  billingAddress: ""
};

const COUNTRY_PHONE_CODES = [
  { code: "+91", label: "India +91" },
  { code: "+1", label: "USA/Canada +1" },
  { code: "+44", label: "UK +44" },
  { code: "+61", label: "Australia +61" },
  { code: "+65", label: "Singapore +65" },
  { code: "+971", label: "UAE +971" },
];

const COUNTRY_STATES = {
  India: [
    "Tamil Nadu", "Karnataka", "Kerala", "Andhra Pradesh", "Telangana",
    "Maharashtra", "Delhi", "Gujarat", "Uttar Pradesh", "West Bengal"
  ],
  "United States": ["California", "Texas", "Florida", "New York", "Illinois", "Washington"],
  "United Kingdom": ["England", "Scotland", "Wales", "Northern Ireland"],
  Australia: ["New South Wales", "Victoria", "Queensland", "Western Australia"],
  Singapore: ["Central", "East", "North", "North-East", "West"],
  UAE: ["Abu Dhabi", "Dubai", "Sharjah", "Ajman", "Ras Al Khaimah"]
};

const COUNTRY_OPTIONS = Object.keys(COUNTRY_STATES);

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

function isValidCrmData(value) {
  return value && typeof value === "object" && Object.keys(CRM_TAB_CONFIG).every((key) => Array.isArray(value[key]));
}

function isValidAccountData(value) {
  return (
    value &&
    typeof value === "object" &&
    Array.isArray(value.clients) &&
    Array.isArray(value.invoices) &&
    Array.isArray(value.estimates)
  );
}

function normalizeAccountData(value) {
  if (!value || typeof value !== "object") {
    return DEFAULT_ACCOUNT_DATA;
  }
  return {
    clients: Array.isArray(value.clients) ? value.clients : [],
    invoices: Array.isArray(value.invoices) ? value.invoices : [],
    estimates: Array.isArray(value.estimates) ? value.estimates : [],
    invoiceTemplate: {
      ...DEFAULT_ACCOUNT_DATA.invoiceTemplate,
      ...(value.invoiceTemplate && typeof value.invoiceTemplate === "object" ? value.invoiceTemplate : {})
    }
  };
}

function toInr(value) {
  const amount = Number(value || 0);
  return `INR ${amount.toLocaleString("en-IN", { maximumFractionDigits: 2, minimumFractionDigits: 2 })}`;
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || "").trim());
}

function isValidPhone(phone) {
  return /^[0-9]{6,15}$/.test(String(phone || "").trim());
}

function computeGstAmounts(taxableValue, gstRate, supplyType) {
  const taxable = Number(taxableValue || 0);
  const rate = Number(gstRate || 0);
  const gstAmount = (taxable * rate) / 100;
  const isIntra = supplyType === "intra";
  const cgst = isIntra ? gstAmount / 2 : 0;
  const sgst = isIntra ? gstAmount / 2 : 0;
  const igst = isIntra ? 0 : gstAmount;
  const grandTotal = taxable + gstAmount;
  return {
    taxable,
    gstRate: rate,
    cgst,
    sgst,
    igst,
    grandTotal,
  };
}

function computeItemsTaxable(items = []) {
  return items.reduce((sum, item) => {
    const qty = Number(item.quantity || 0);
    const unitPrice = Number(item.unitPrice || 0);
    if (!Number.isFinite(qty) || !Number.isFinite(unitPrice)) {
      return sum;
    }
    return sum + qty * unitPrice;
  }, 0);
}

function toIsoDate(value) {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) {
    return "";
  }
  return new Date(parsed).toISOString().slice(0, 10);
}

function AccountsErpModule() {
  const [activeTab, setActiveTab] = useState("invoices");
  const [activeView, setActiveView] = useState("gst");
  const [moduleData, setModuleData] = useState(DEFAULT_ACCOUNT_DATA);
  const [formValues, setFormValues] = useState(defaultAccountForm);
  const [clientFormValues, setClientFormValues] = useState(defaultClientForm);
  const [editingClientId, setEditingClientId] = useState("");
  const [viewClient, setViewClient] = useState(null);
  const [duplicateClients, setDuplicateClients] = useState([]);
  const [clientSearch, setClientSearch] = useState("");
  const [clientPage, setClientPage] = useState(1);
  const [editingId, setEditingId] = useState("");
  const [notice, setNotice] = useState("");
  const [gstSearch, setGstSearch] = useState("");
  const [gstPage, setGstPage] = useState(1);
  const [exportFromDate, setExportFromDate] = useState("");
  const [exportToDate, setExportToDate] = useState("");

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(ACCOUNT_STORAGE_KEY);
      if (!raw) {
        return;
      }
      const parsed = JSON.parse(raw);
      if (isValidAccountData(parsed)) {
        setModuleData(normalizeAccountData(parsed));
      } else {
        setModuleData(normalizeAccountData(parsed));
      }
    } catch (_error) {
      // Ignore invalid cached module data.
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem(ACCOUNT_STORAGE_KEY, JSON.stringify(moduleData));
  }, [moduleData]);

  useEffect(() => {
    if ((moduleData.invoiceTemplate?.companyAddress || "").trim()) {
      return;
    }
    const fallbackKeys = [
      "wz_business_autopilot_profile",
      "wz_work_suite_profile",
      "wz_org_profile"
    ];
    for (const key of fallbackKeys) {
      try {
        const raw = window.localStorage.getItem(key);
        if (!raw) {
          continue;
        }
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== "object") {
          continue;
        }
        setModuleData((prev) => ({
          ...prev,
          invoiceTemplate: {
            ...prev.invoiceTemplate,
            companyName: parsed.organizationName || parsed.companyName || prev.invoiceTemplate.companyName,
            gstin: parsed.gstin || prev.invoiceTemplate.gstin,
            contactNumber: parsed.mobile || parsed.contactNumber || prev.invoiceTemplate.contactNumber,
            email: parsed.email || prev.invoiceTemplate.email,
            companyAddress: parsed.address || parsed.companyAddress || prev.invoiceTemplate.companyAddress
          }
        }));
        break;
      } catch (_error) {
        // ignore parse failure
      }
    }
  }, [moduleData.invoiceTemplate]);

  useEffect(() => {
    setEditingId("");
    setNotice("");
    setFormValues(defaultAccountForm);
    setGstSearch("");
    setGstPage(1);
  }, [activeTab]);

  const kind = ACCOUNT_TAB_CONFIG[activeTab]?.kind;
  const currentRows = activeTab === "invoices"
    ? moduleData.invoices
    : activeTab === "estimates"
    ? moduleData.estimates
    : [];
  const templateData = moduleData.invoiceTemplate || DEFAULT_ACCOUNT_DATA.invoiceTemplate;
  const gstPageSize = 10;
  const filteredGstRows = useMemo(() => {
    const query = gstSearch.trim().toLowerCase();
    if (!query) {
      return currentRows;
    }
    return currentRows.filter((row) =>
      [
        row.docNo,
        row.customerName,
        row.customerGstin,
        row.invoiceDate,
        row.status,
        row.grandTotal
      ]
        .join(" ")
        .toLowerCase()
        .includes(query)
    );
  }, [currentRows, gstSearch]);

  const gstTotalPages = Math.max(1, Math.ceil(filteredGstRows.length / gstPageSize));
  const pagedGstRows = useMemo(() => {
    const safePage = Math.min(gstPage, gstTotalPages);
    const start = (safePage - 1) * gstPageSize;
    return filteredGstRows.slice(start, start + gstPageSize);
  }, [filteredGstRows, gstPage, gstTotalPages]);

  useEffect(() => {
    if (gstPage > gstTotalPages) {
      setGstPage(gstTotalPages);
    }
  }, [gstPage, gstTotalPages]);

  const stats = useMemo(() => {
    const invoiceCount = moduleData.invoices.length;
    const estimateCount = moduleData.estimates.length;
    const totalTaxable = moduleData.invoices.reduce((sum, row) => sum + Number(row.taxable || 0), 0);
    const totalGst = moduleData.invoices.reduce(
      (sum, row) => sum + Number(row.cgst || 0) + Number(row.sgst || 0) + Number(row.igst || 0),
      0
    );
    return [
      { label: "GST Invoices", value: String(invoiceCount), icon: "bi-receipt-cutoff" },
      { label: "Estimates", value: String(estimateCount), icon: "bi-file-earmark-text" },
      { label: "Total GST", value: toInr(totalGst), icon: "bi-calculator" },
      { label: "Taxable Value", value: toInr(totalTaxable), icon: "bi-cash-stack" },
    ];
  }, [moduleData]);

  const clientPageSize = 8;
  const filteredClients = useMemo(() => {
    const query = clientSearch.trim().toLowerCase();
    if (!query) {
      return moduleData.clients;
    }
    return moduleData.clients.filter((row) => {
      const haystack = [
        row.clientName,
        row.mobileCountryCode,
        row.mobile,
        row.email,
        row.companyAddress,
        row.companyCity,
        row.companyState,
        row.companyCountry,
        row.companyPincode,
        row.billingAddress,
        row.billingCity,
        row.billingState,
        row.billingCountry,
        row.billingPincode,
      ].join(" ").toLowerCase();
      return haystack.includes(query);
    });
  }, [moduleData.clients, clientSearch]);

  const clientTotalPages = Math.max(1, Math.ceil(filteredClients.length / clientPageSize));
  const pagedClients = useMemo(() => {
    const currentPage = Math.min(clientPage, clientTotalPages);
    const start = (currentPage - 1) * clientPageSize;
    return filteredClients.slice(start, start + clientPageSize);
  }, [filteredClients, clientPage, clientTotalPages]);

  useEffect(() => {
    if (clientPage > clientTotalPages) {
      setClientPage(clientTotalPages);
    }
  }, [clientPage, clientTotalPages]);

  function onChangeField(field, value) {
    setFormValues((prev) => ({ ...prev, [field]: value }));
  }

  function onChangeClientField(field, value) {
    setClientFormValues((prev) => {
      const next = { ...prev, [field]: value };

      if (field === "companyCountry") {
        next.companyState = "";
        if (prev.sameAsCompanyBilling) {
          next.billingCountry = value;
          next.billingState = "";
        }
      }
      if (field === "billingCountry") {
        next.billingState = "";
      }
      if (field === "sameAsCompanyBilling") {
        if (value) {
          next.billingAddress = prev.companyAddress;
          next.billingCountry = prev.companyCountry;
          next.billingState = prev.companyState;
          next.billingPincode = prev.companyPincode;
          next.billingCity = prev.companyCity;
        }
      }
      if (prev.sameAsCompanyBilling) {
        if (field === "companyAddress") {
          next.billingAddress = value;
        } else if (field === "companyCountry") {
          next.billingCountry = value;
        } else if (field === "companyState") {
          next.billingState = value;
        } else if (field === "companyPincode") {
          next.billingPincode = value;
        } else if (field === "companyCity") {
          next.billingCity = value;
        }
      }
      return next;
    });
  }

  function onSubmitClient(event) {
    event.preventDefault();
    if (!clientFormValues.clientName.trim() || !clientFormValues.mobile.trim() || !clientFormValues.email.trim()) {
      setNotice("Client name, mobile and email are required.");
      return;
    }
    if (!isValidEmail(clientFormValues.email)) {
      setNotice("Enter a valid Email ID.");
      return;
    }
    if (clientFormValues.alternativeEmail.trim() && !isValidEmail(clientFormValues.alternativeEmail)) {
      setNotice("Enter a valid Alternative Email.");
      return;
    }
    if (!isValidPhone(clientFormValues.mobile)) {
      setNotice("Mobile number should contain only digits (6 to 15).");
      return;
    }
    if (clientFormValues.alternativeMobile.trim() && !isValidPhone(clientFormValues.alternativeMobile)) {
      setNotice("Alternative mobile should contain only digits (6 to 15).");
      return;
    }
    if (
      !clientFormValues.companyCountry ||
      !clientFormValues.companyState ||
      !clientFormValues.companyPincode.trim() ||
      !clientFormValues.companyCity.trim() ||
      !clientFormValues.companyAddress.trim()
    ) {
      setNotice("Complete all Company Address fields including country, state, city and pincode.");
      return;
    }
    if (
      !clientFormValues.billingCountry ||
      !clientFormValues.billingState ||
      !clientFormValues.billingPincode.trim() ||
      !clientFormValues.billingCity.trim() ||
      !clientFormValues.billingAddress.trim()
    ) {
      setNotice("Complete all Billing Address fields including country, state, city and pincode.");
      return;
    }

    const normalizedEmail = clientFormValues.email.trim().toLowerCase();
    const normalizedMobile = clientFormValues.mobile.trim();
    const normalizedCode = clientFormValues.mobileCountryCode || "+91";
    const possibleDuplicates = moduleData.clients.filter((row) => {
      if (editingClientId && row.id === editingClientId) {
        return false;
      }
      const sameEmail = String(row.email || "").trim().toLowerCase() === normalizedEmail;
      const sameMobile = String(row.mobile || "").trim() === normalizedMobile &&
        String(row.mobileCountryCode || "+91") === normalizedCode;
      return sameEmail || sameMobile;
    });
    if (possibleDuplicates.length) {
      setDuplicateClients(possibleDuplicates);
      setNotice("Client already registered with same mobile/email.");
      return;
    }

    setDuplicateClients([]);
    const payload = {
      id: editingClientId || `client_${Date.now()}`,
      clientName: clientFormValues.clientName.trim(),
      mobileCountryCode: clientFormValues.mobileCountryCode || "+91",
      mobile: clientFormValues.mobile.trim(),
      altMobileCountryCode: clientFormValues.altMobileCountryCode || "+91",
      alternativeMobile: clientFormValues.alternativeMobile.trim(),
      email: clientFormValues.email.trim(),
      alternativeEmail: clientFormValues.alternativeEmail.trim(),
      companyCountry: clientFormValues.companyCountry,
      companyState: clientFormValues.companyState,
      companyPincode: clientFormValues.companyPincode.trim(),
      companyCity: clientFormValues.companyCity.trim(),
      companyAddress: clientFormValues.companyAddress.trim(),
      sameAsCompanyBilling: Boolean(clientFormValues.sameAsCompanyBilling),
      billingCountry: clientFormValues.billingCountry,
      billingState: clientFormValues.billingState,
      billingPincode: clientFormValues.billingPincode.trim(),
      billingCity: clientFormValues.billingCity.trim(),
      billingAddress: clientFormValues.billingAddress.trim(),
    };
    setModuleData((prev) => ({
      ...prev,
      clients: editingClientId
        ? prev.clients.map((row) => (row.id === editingClientId ? payload : row))
        : [payload, ...prev.clients]
    }));
    setNotice(editingClientId ? "Client updated." : "Client added.");
    setEditingClientId("");
    setClientFormValues(defaultClientForm);
  }

  function onViewClient(client) {
    setViewClient(client);
  }

  function onEditClient(client) {
    setEditingClientId(client.id);
    setClientFormValues({
      clientName: client.clientName || "",
      mobileCountryCode: client.mobileCountryCode || "+91",
      mobile: client.mobile || "",
      altMobileCountryCode: client.altMobileCountryCode || "+91",
      alternativeMobile: client.alternativeMobile || "",
      email: client.email || "",
      alternativeEmail: client.alternativeEmail || "",
      companyCountry: client.companyCountry || "India",
      companyState: client.companyState || "",
      companyPincode: client.companyPincode || "",
      companyCity: client.companyCity || "",
      companyAddress: client.companyAddress || "",
      sameAsCompanyBilling: Boolean(client.sameAsCompanyBilling),
      billingCountry: client.billingCountry || "India",
      billingState: client.billingState || "",
      billingPincode: client.billingPincode || "",
      billingCity: client.billingCity || "",
      billingAddress: client.billingAddress || "",
    });
    setActiveView("clients");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function onDeleteClient(clientId) {
    setModuleData((prev) => ({ ...prev, clients: prev.clients.filter((row) => row.id !== clientId) }));
    if (editingClientId === clientId) {
      setEditingClientId("");
      setClientFormValues(defaultClientForm);
    }
    if (viewClient?.id === clientId) {
      setViewClient(null);
    }
  }

  function onEditRow(row) {
    setEditingId(row.id);
    setFormValues({
      customerName: row.customerName || "",
      customerGstin: row.customerGstin || "",
      customerState: row.customerState || "Tamil Nadu",
      placeOfSupply: row.placeOfSupply || "Tamil Nadu",
      invoiceDate: row.invoiceDate || "",
      dueDate: row.dueDate || "",
      taxableValue: String(row.taxable || ""),
      gstRate: String(row.gstRate || "18"),
      supplyType: row.supplyType || "intra",
      notes: row.notes || "",
      items: Array.isArray(row.items) && row.items.length
        ? row.items
        : [{ description: "", hsnSac: "", quantity: "1", unitPrice: "0" }]
    });
  }

  function onDeleteRow(rowId) {
    if (activeTab === "invoices") {
      setModuleData((prev) => ({ ...prev, invoices: prev.invoices.filter((row) => row.id !== rowId) }));
    } else if (activeTab === "estimates") {
      setModuleData((prev) => ({ ...prev, estimates: prev.estimates.filter((row) => row.id !== rowId) }));
    }
    if (editingId === rowId) {
      setEditingId("");
      setFormValues(defaultAccountForm);
    }
  }

  function toRecord(existingRowId = "") {
    const now = new Date();
    const runningCount = activeTab === "invoices" ? moduleData.invoices.length + 1 : moduleData.estimates.length + 1;
    const docPrefix = activeTab === "invoices" ? "INV" : "EST";
    const docNo = `${docPrefix}-${now.getFullYear()}-${String(runningCount).padStart(4, "0")}`;
    const gst = computeGstAmounts(formValues.taxableValue, formValues.gstRate, formValues.supplyType);
    return {
      id: existingRowId || `${activeTab}_${Date.now()}`,
      docNo: existingRowId ? undefined : docNo,
      customerName: formValues.customerName.trim(),
      customerGstin: formValues.customerGstin.trim(),
      customerState: formValues.customerState,
      placeOfSupply: formValues.placeOfSupply,
      invoiceDate: formValues.invoiceDate,
      dueDate: formValues.dueDate,
      supplyType: formValues.supplyType,
      notes: formValues.notes.trim(),
      status: activeTab === "invoices" ? "Issued" : "Draft",
      items: (formValues.items || [])
        .filter((item) => String(item.description || "").trim())
        .map((item) => ({
          description: String(item.description || "").trim(),
          hsnSac: String(item.hsnSac || "").trim(),
          quantity: String(item.quantity || "0").trim(),
          unitPrice: String(item.unitPrice || "0").trim()
        })),
      ...gst,
    };
  }

  function onSubmit(event) {
    event.preventDefault();
    const computedTaxable = computeItemsTaxable(formValues.items || []);
    const taxableForSave = computedTaxable > 0 ? computedTaxable : Number(formValues.taxableValue || 0);
    if (!formValues.customerName || !formValues.invoiceDate || !taxableForSave) {
      return;
    }
    if (computedTaxable > 0 && String(formValues.taxableValue || "") !== String(computedTaxable)) {
      setFormValues((prev) => ({ ...prev, taxableValue: String(computedTaxable) }));
    }
    const nextRecord = toRecord(editingId || "");
    if (activeTab === "invoices") {
      setModuleData((prev) => ({
        ...prev,
        invoices: editingId
          ? prev.invoices.map((row) => (row.id === editingId ? { ...row, ...nextRecord, docNo: row.docNo } : row))
          : [{ ...nextRecord }, ...prev.invoices],
      }));
    } else if (activeTab === "estimates") {
      setModuleData((prev) => ({
        ...prev,
        estimates: editingId
          ? prev.estimates.map((row) => (row.id === editingId ? { ...row, ...nextRecord, docNo: row.docNo } : row))
          : [{ ...nextRecord }, ...prev.estimates],
      }));
    }
    setEditingId("");
    setFormValues(defaultAccountForm);
    setNotice(`${activeTab === "invoices" ? "Invoice" : "Estimate"} saved.`);
  }

  function onConvertEstimate(row) {
    const converted = { ...row, id: `invoices_${Date.now()}`, docNo: `INV-${new Date().getFullYear()}-${String(moduleData.invoices.length + 1).padStart(4, "0")}`, status: "Issued" };
    setModuleData((prev) => ({
      ...prev,
      invoices: [converted, ...prev.invoices],
      estimates: prev.estimates.filter((item) => item.id !== row.id),
    }));
    setNotice("Estimate converted to GST invoice.");
    setActiveTab("invoices");
  }

  function exportCurrentTab() {
    const rows = currentRows || [];
    if (!rows.length) {
      setNotice("No records to export.");
      return;
    }
    const headers = [
      "docNo", "customerName", "customerGstin", "customerState", "placeOfSupply",
      "invoiceDate", "dueDate", "taxable", "gstRate", "cgst", "sgst", "igst", "grandTotal", "status",
    ];
    const escapeCell = (value) => {
      const text = String(value ?? "");
      if (text.includes(",") || text.includes("\"") || text.includes("\n")) {
        return `"${text.replace(/"/g, "\"\"")}"`;
      }
      return text;
    };
    const content = [
      headers.join(","),
      ...rows.map((row) => headers.map((key) => escapeCell(row[key])).join(",")),
    ].join("\n");
    const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `gst_${activeTab}_${Date.now()}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  function createInvoicePdfBlob(row) {
    const doc = new jsPDF({ unit: "pt", format: "a4" });
    let y = 48;
    doc.setFontSize(14);
    doc.text(templateData.companyName || "Company", 40, y);
    y += 18;
    doc.setFontSize(10);
    doc.text(`GSTIN: ${templateData.gstin || "-"}`, 40, y);
    y += 14;
    doc.text(`Contact: ${templateData.contactNumber || "-"}  Email: ${templateData.email || "-"}`, 40, y);
    y += 14;
    doc.text(`Address: ${templateData.companyAddress || "-"}`, 40, y, { maxWidth: 520 });
    y += 24;
    doc.setFontSize(12);
    doc.text(`GST Invoice: ${row.docNo || "-"}`, 40, y);
    y += 16;
    doc.setFontSize(10);
    doc.text(`Customer: ${row.customerName || "-"}`, 40, y);
    y += 14;
    doc.text(`Date: ${row.invoiceDate || "-"}  Due: ${row.dueDate || "-"}`, 40, y);
    y += 14;
    doc.text(`GSTIN: ${row.customerGstin || "-"}  Place: ${row.placeOfSupply || "-"}`, 40, y);
    y += 22;

    doc.text("Items", 40, y);
    y += 12;
    doc.line(40, y, 555, y);
    y += 14;
    doc.text("Description", 40, y);
    doc.text("HSN/SAC", 280, y);
    doc.text("Qty", 360, y);
    doc.text("Rate", 410, y);
    doc.text("Amount", 480, y);
    y += 8;
    doc.line(40, y, 555, y);
    y += 14;
    (row.items || []).forEach((item) => {
      const amount = Number(item.quantity || 0) * Number(item.unitPrice || 0);
      doc.text(String(item.description || "-"), 40, y, { maxWidth: 220 });
      doc.text(String(item.hsnSac || "-"), 280, y);
      doc.text(String(item.quantity || "-"), 360, y);
      doc.text(String(item.unitPrice || "-"), 410, y);
      doc.text(String(amount.toFixed(2)), 480, y);
      y += 16;
    });

    y += 8;
    doc.line(40, y, 555, y);
    y += 18;
    const gstAmount = Number(row.cgst || 0) + Number(row.sgst || 0) + Number(row.igst || 0);
    doc.text(`Taxable: ${toInr(row.taxable)}`, 380, y);
    y += 14;
    doc.text(`GST: ${toInr(gstAmount)}`, 380, y);
    y += 14;
    doc.text(`Grand Total: ${toInr(row.grandTotal)}`, 380, y);
    y += 24;
    doc.text(`Bank: ${templateData.bankName || "-"}  A/C: ${templateData.accountNumber || "-"}  IFSC: ${templateData.ifsc || "-"}`, 40, y, { maxWidth: 520 });
    return doc.output("blob");
  }

  function downloadInvoicePdf(row) {
    const blob = createInvoicePdfBlob(row);
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${row.docNo || "invoice"}.pdf`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  async function exportInvoicesAsZip() {
    if (activeTab !== "invoices") {
      setNotice("ZIP export available only in GST Invoices tab.");
      return;
    }
    const from = toIsoDate(exportFromDate);
    const to = toIsoDate(exportToDate);
    const rows = moduleData.invoices.filter((row) => {
      const rowDate = toIsoDate(row.invoiceDate);
      if (!rowDate) {
        return false;
      }
      if (from && rowDate < from) {
        return false;
      }
      if (to && rowDate > to) {
        return false;
      }
      return true;
    });
    if (!rows.length) {
      setNotice("No invoices available for selected date range.");
      return;
    }
    const zip = new JSZip();
    rows.forEach((row) => {
      zip.file(`${row.docNo || row.id}.pdf`, createInvoicePdfBlob(row));
    });
    const zipBlob = await zip.generateAsync({ type: "blob" });
    const url = URL.createObjectURL(zipBlob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `gst_invoices_${Date.now()}.zip`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    setNotice(`Downloaded ${rows.length} invoice PDFs as ZIP.`);
  }

  function onChangeTemplateField(field, value) {
    setModuleData((prev) => ({
      ...prev,
      invoiceTemplate: { ...prev.invoiceTemplate, [field]: value }
    }));
  }

  function onTemplateLogoUpload(event) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      onChangeTemplateField("logoDataUrl", String(reader.result || ""));
    };
    reader.readAsDataURL(file);
  }

  function onChangeItem(index, field, value) {
    setFormValues((prev) => {
      const items = [...(prev.items || [])];
      items[index] = { ...items[index], [field]: value };
      const taxableValue = String(computeItemsTaxable(items));
      return { ...prev, items, taxableValue };
    });
  }

  function onAddItem() {
    setFormValues((prev) => ({
      ...prev,
      items: [...(prev.items || []), { description: "", hsnSac: "", quantity: "1", unitPrice: "0" }]
    }));
  }

  function onRemoveItem(index) {
    setFormValues((prev) => {
      const items = (prev.items || []).filter((_, idx) => idx !== index);
      const safeItems = items.length ? items : [{ description: "", hsnSac: "", quantity: "1", unitPrice: "0" }];
      const taxableValue = String(computeItemsTaxable(safeItems));
      return { ...prev, items: safeItems, taxableValue };
    });
  }

  return (
    <div className="d-flex flex-column gap-3">
      <div className="module-heading">
        <h4 className="mb-1">Accounts / ERP</h4>
        <p className="text-secondary mb-0">Indian GST invoices and estimates with GST breakup (CGST/SGST/IGST).</p>
      </div>

      <div className="erp-top-tabs">
        <button
          type="button"
          className={`erp-top-tab ${activeView === "clients" ? "active" : ""}`}
          onClick={() => {
            setActiveView("clients");
            setNotice("");
          }}
        >
          Add Clients
        </button>
        {Object.entries(ACCOUNT_TAB_CONFIG).map(([tabKey, tab]) => (
          <button
            key={tabKey}
            type="button"
            className={`erp-top-tab ${activeView === "gst" && activeTab === tabKey ? "active" : ""}`}
            onClick={() => {
              setActiveView("gst");
              setActiveTab(tabKey);
            }}
          >
            {tab.label}
          </button>
        ))}
        <button
          type="button"
          className={`erp-top-tab ${activeView === "template" ? "active" : ""}`}
          onClick={() => {
            setActiveView("template");
            setNotice("");
          }}
        >
          Invoice Template
        </button>
      </div>

      {notice ? <div className="alert alert-info py-2 mb-0">{notice}</div> : null}

      {activeView === "clients" ? (
        <>
          <div className="card p-3">
            <h6 className="mb-3">{editingClientId ? "Edit Client" : "Add Client Details"}</h6>
            <form className="row g-3" onSubmit={onSubmitClient}>
              <div className="col-12 col-md-4">
                <label className="form-label small text-secondary mb-1">Client Name</label>
                <input className="form-control" value={clientFormValues.clientName} onChange={(e) => onChangeClientField("clientName", e.target.value)} required />
              </div>
              <div className="col-12 col-md-4">
                <label className="form-label small text-secondary mb-1">Mobile Number</label>
                <div className="input-group">
                  <select
                    className="form-select"
                    style={{ maxWidth: "180px" }}
                    value={clientFormValues.mobileCountryCode}
                    onChange={(e) => onChangeClientField("mobileCountryCode", e.target.value)}
                  >
                    {COUNTRY_PHONE_CODES.map((item) => (
                      <option key={item.code} value={item.code}>{item.label}</option>
                    ))}
                  </select>
                  <input
                    className="form-control"
                    value={clientFormValues.mobile}
                    onChange={(e) => onChangeClientField("mobile", e.target.value)}
                    required
                    placeholder="Digits only"
                  />
                </div>
              </div>
              <div className="col-12 col-md-4">
                <label className="form-label small text-secondary mb-1">Alternative Mobile Number</label>
                <div className="input-group">
                  <select
                    className="form-select"
                    style={{ maxWidth: "180px" }}
                    value={clientFormValues.altMobileCountryCode}
                    onChange={(e) => onChangeClientField("altMobileCountryCode", e.target.value)}
                  >
                    {COUNTRY_PHONE_CODES.map((item) => (
                      <option key={`alt_${item.code}`} value={item.code}>{item.label}</option>
                    ))}
                  </select>
                  <input
                    className="form-control"
                    value={clientFormValues.alternativeMobile}
                    onChange={(e) => onChangeClientField("alternativeMobile", e.target.value)}
                    placeholder="Optional"
                  />
                </div>
              </div>

              <div className="col-12 col-md-6">
                <label className="form-label small text-secondary mb-1">Email ID</label>
                <input type="email" className="form-control" value={clientFormValues.email} onChange={(e) => onChangeClientField("email", e.target.value)} required />
              </div>
              <div className="col-12 col-md-6">
                <label className="form-label small text-secondary mb-1">Alternative Email</label>
                <input type="email" className="form-control" value={clientFormValues.alternativeEmail} onChange={(e) => onChangeClientField("alternativeEmail", e.target.value)} placeholder="Optional" />
              </div>

              <div className="col-12"><h6 className="mb-0">Company Address</h6></div>
              <div className="col-12 col-md-5">
                <label className="form-label small text-secondary mb-1">Address</label>
                <textarea rows={2} className="form-control" value={clientFormValues.companyAddress} onChange={(e) => onChangeClientField("companyAddress", e.target.value)} required />
              </div>
              <div className="col-12 col-md-7">
                <div className="row g-3">
                  <div className="col-12 col-md-3">
                    <label className="form-label small text-secondary mb-1">Country</label>
                    <select className="form-select" value={clientFormValues.companyCountry} onChange={(e) => onChangeClientField("companyCountry", e.target.value)} required>
                      {COUNTRY_OPTIONS.map((country) => (
                        <option key={country} value={country}>{country}</option>
                      ))}
                    </select>
                  </div>
                  <div className="col-12 col-md-3">
                    <label className="form-label small text-secondary mb-1">State</label>
                    <select className="form-select" value={clientFormValues.companyState} onChange={(e) => onChangeClientField("companyState", e.target.value)} required>
                      <option value="">Select State</option>
                      {(COUNTRY_STATES[clientFormValues.companyCountry] || []).map((state) => (
                        <option key={state} value={state}>{state}</option>
                      ))}
                    </select>
                  </div>
                  <div className="col-12 col-md-3">
                    <label className="form-label small text-secondary mb-1">City</label>
                    <input className="form-control" value={clientFormValues.companyCity} onChange={(e) => onChangeClientField("companyCity", e.target.value)} required />
                  </div>
                  <div className="col-12 col-md-3">
                    <label className="form-label small text-secondary mb-1">Pincode</label>
                    <input className="form-control" value={clientFormValues.companyPincode} onChange={(e) => onChangeClientField("companyPincode", e.target.value)} required />
                  </div>
                </div>
              </div>

              <div className="col-12 d-flex align-items-center">
                <div className="form-check">
                  <input
                    id="sameBillingAddress"
                    className="form-check-input"
                    type="checkbox"
                    checked={Boolean(clientFormValues.sameAsCompanyBilling)}
                    onChange={(e) => onChangeClientField("sameAsCompanyBilling", e.target.checked)}
                  />
                  <label className="form-check-label small text-secondary" htmlFor="sameBillingAddress">
                    Billing address same as company address
                  </label>
                </div>
              </div>

              <div className="col-12"><h6 className="mb-0">Billing Address</h6></div>
              <div className="col-12 col-md-5">
                <label className="form-label small text-secondary mb-1">Address</label>
                <textarea
                  rows={2}
                  className="form-control"
                  value={clientFormValues.billingAddress}
                  onChange={(e) => onChangeClientField("billingAddress", e.target.value)}
                  required
                  disabled={Boolean(clientFormValues.sameAsCompanyBilling)}
                />
              </div>
              <div className="col-12 col-md-7">
                <div className="row g-3">
                  <div className="col-12 col-md-3">
                    <label className="form-label small text-secondary mb-1">Country</label>
                    <select
                      className="form-select"
                      value={clientFormValues.billingCountry}
                      onChange={(e) => onChangeClientField("billingCountry", e.target.value)}
                      required
                      disabled={Boolean(clientFormValues.sameAsCompanyBilling)}
                    >
                      {COUNTRY_OPTIONS.map((country) => (
                        <option key={`billing_${country}`} value={country}>{country}</option>
                      ))}
                    </select>
                  </div>
                  <div className="col-12 col-md-3">
                    <label className="form-label small text-secondary mb-1">State</label>
                    <select
                      className="form-select"
                      value={clientFormValues.billingState}
                      onChange={(e) => onChangeClientField("billingState", e.target.value)}
                      required
                      disabled={Boolean(clientFormValues.sameAsCompanyBilling)}
                    >
                      <option value="">Select State</option>
                      {(COUNTRY_STATES[clientFormValues.billingCountry] || []).map((state) => (
                        <option key={`billing_state_${state}`} value={state}>{state}</option>
                      ))}
                    </select>
                  </div>
                  <div className="col-12 col-md-3">
                    <label className="form-label small text-secondary mb-1">City</label>
                    <input
                      className="form-control"
                      value={clientFormValues.billingCity}
                      onChange={(e) => onChangeClientField("billingCity", e.target.value)}
                      required
                      disabled={Boolean(clientFormValues.sameAsCompanyBilling)}
                    />
                  </div>
                  <div className="col-12 col-md-3">
                    <label className="form-label small text-secondary mb-1">Pincode</label>
                    <input
                      className="form-control"
                      value={clientFormValues.billingPincode}
                      onChange={(e) => onChangeClientField("billingPincode", e.target.value)}
                      required
                      disabled={Boolean(clientFormValues.sameAsCompanyBilling)}
                    />
                  </div>
                </div>
              </div>
              <div className="col-12 d-flex gap-2">
                <button type="submit" className="btn btn-success btn-sm">{editingClientId ? "Update Client" : "Save Client"}</button>
                {editingClientId ? (
                  <button
                    type="button"
                    className="btn btn-outline-light btn-sm"
                    onClick={() => {
                      setEditingClientId("");
                      setClientFormValues(defaultClientForm);
                      setDuplicateClients([]);
                    }}
                  >
                    Cancel
                  </button>
                ) : null}
              </div>
            </form>
          </div>

          {duplicateClients.length ? (
            <div className="card p-3 border border-warning">
              <div className="d-flex align-items-center justify-content-between mb-2">
                <h6 className="mb-0 text-warning">Already Registered Client</h6>
                <button type="button" className="btn btn-sm btn-outline-light" onClick={() => setDuplicateClients([])}>
                  Close
                </button>
              </div>
              <p className="small text-secondary mb-2">
                Same mobile number or email already exists. Existing client details:
              </p>
              <div className="table-responsive">
                <table className="table table-dark table-borderless align-middle mb-0">
                  <thead>
                    <tr>
                      <th>Client Name</th>
                      <th>Mobile</th>
                      <th>Email</th>
                      <th>Company Address</th>
                    </tr>
                  </thead>
                  <tbody>
                    {duplicateClients.map((row) => (
                      <tr key={`dup_${row.id}`}>
                        <td>{row.clientName}</td>
                        <td>{`${row.mobileCountryCode || "+91"} ${row.mobile}`}</td>
                        <td>{row.email}</td>
                        <td>{[row.companyAddress, row.companyCity, row.companyState, row.companyCountry, row.companyPincode].filter(Boolean).join(", ") || "-"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}

          <div className="card p-3">
            <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-3">
              <h6 className="mb-0">Clients</h6>
              <input
                className="form-control form-control-sm"
                style={{ maxWidth: "280px" }}
                placeholder="Search clients..."
                value={clientSearch}
                onChange={(e) => {
                  setClientSearch(e.target.value);
                  setClientPage(1);
                }}
              />
            </div>
            <div className="table-responsive">
              <table className="table table-dark table-borderless align-middle mb-0">
                <thead>
                  <tr>
                    <th>Client Name</th>
                    <th>Mobile</th>
                    <th>Email</th>
                    <th>Company Address</th>
                    <th>Billing Address</th>
                    <th className="text-end">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {pagedClients.length ? (
                    pagedClients.map((row) => (
                      <tr key={row.id}>
                        <td>{row.clientName}</td>
                        <td>{`${row.mobileCountryCode || "+91"} ${row.mobile}`}</td>
                        <td>{row.email}</td>
                        <td>{[row.companyAddress, row.companyCity, row.companyState, row.companyCountry, row.companyPincode].filter(Boolean).join(", ") || "-"}</td>
                        <td>{[row.billingAddress, row.billingCity, row.billingState, row.billingCountry, row.billingPincode].filter(Boolean).join(", ") || "-"}</td>
                        <td className="text-end">
                          <div className="d-inline-flex gap-2">
                            <button type="button" className="btn btn-sm btn-outline-info" onClick={() => onViewClient(row)}>View</button>
                            <button type="button" className="btn btn-sm btn-outline-warning" onClick={() => onEditClient(row)}>Edit</button>
                            <button type="button" className="btn btn-sm btn-outline-danger" onClick={() => onDeleteClient(row.id)}>Delete</button>
                          </div>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={6} className="text-secondary">No clients yet.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 mt-3">
              <small className="text-secondary">
                Showing {filteredClients.length ? (clientPage - 1) * clientPageSize + 1 : 0} to{" "}
                {Math.min(clientPage * clientPageSize, filteredClients.length)} of {filteredClients.length} clients
              </small>
              <div className="d-flex align-items-center gap-2">
                <button
                  type="button"
                  className="btn btn-sm btn-outline-light"
                  onClick={() => setClientPage((prev) => Math.max(1, prev - 1))}
                  disabled={clientPage <= 1}
                >
                  Prev
                </button>
                <span className="small text-secondary">Page {clientPage} / {clientTotalPages}</span>
                <button
                  type="button"
                  className="btn btn-sm btn-outline-light"
                  onClick={() => setClientPage((prev) => Math.min(clientTotalPages, prev + 1))}
                  disabled={clientPage >= clientTotalPages}
                >
                  Next
                </button>
              </div>
            </div>
          </div>

          {viewClient ? (
            <div className="modal d-block" tabIndex="-1" role="dialog" style={{ backgroundColor: "rgba(0,0,0,0.6)" }}>
              <div className="modal-dialog modal-xl modal-dialog-centered" role="document">
                <div className="modal-content bg-dark text-light border-secondary">
                  <div className="modal-header border-secondary">
                    <h6 className="modal-title mb-0">Client View</h6>
                    <button type="button" className="btn btn-outline-light btn-sm" onClick={() => setViewClient(null)}>Close</button>
                  </div>
                  <div className="modal-body">
                    <div className="row g-3 small">
                      <div className="col-12 col-md-4"><span className="text-secondary">Client Name:</span> {viewClient.clientName}</div>
                      <div className="col-12 col-md-4"><span className="text-secondary">Mobile:</span> {`${viewClient.mobileCountryCode || "+91"} ${viewClient.mobile}`}</div>
                      <div className="col-12 col-md-4"><span className="text-secondary">Alternative Mobile:</span> {viewClient.alternativeMobile ? `${viewClient.altMobileCountryCode || "+91"} ${viewClient.alternativeMobile}` : "-"}</div>
                      <div className="col-12 col-md-4"><span className="text-secondary">Email:</span> {viewClient.email}</div>
                      <div className="col-12 col-md-4"><span className="text-secondary">Alternative Email:</span> {viewClient.alternativeEmail || "-"}</div>
                      <div className="col-12 col-md-4"><span className="text-secondary">Same Billing:</span> {viewClient.sameAsCompanyBilling ? "Yes" : "No"}</div>
                      <div className="col-12 col-md-4"><span className="text-secondary">Company Country:</span> {viewClient.companyCountry || "-"}</div>
                      <div className="col-12 col-md-4"><span className="text-secondary">Company State:</span> {viewClient.companyState || "-"}</div>
                      <div className="col-12 col-md-4"><span className="text-secondary">Company City:</span> {viewClient.companyCity || "-"}</div>
                      <div className="col-12 col-md-4"><span className="text-secondary">Company Pincode:</span> {viewClient.companyPincode || "-"}</div>
                      <div className="col-12 col-md-8"><span className="text-secondary">Company Address:</span> {viewClient.companyAddress || "-"}</div>
                      <div className="col-12 col-md-4"><span className="text-secondary">Billing Country:</span> {viewClient.billingCountry || "-"}</div>
                      <div className="col-12 col-md-4"><span className="text-secondary">Billing State:</span> {viewClient.billingState || "-"}</div>
                      <div className="col-12 col-md-4"><span className="text-secondary">Billing City:</span> {viewClient.billingCity || "-"}</div>
                      <div className="col-12 col-md-4"><span className="text-secondary">Billing Pincode:</span> {viewClient.billingPincode || "-"}</div>
                      <div className="col-12 col-md-8"><span className="text-secondary">Billing Address:</span> {viewClient.billingAddress || "-"}</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : null}
        </>
      ) : null}

      {activeView === "template" ? (
        <div className="card p-3">
          <h6 className="mb-3">GST Invoice Template</h6>
          <div className="row g-3">
            <div className="col-12 col-md-4">
              <label className="form-label small text-secondary mb-1">Company Name</label>
              <input className="form-control" value={templateData.companyName || ""} onChange={(e) => onChangeTemplateField("companyName", e.target.value)} />
            </div>
            <div className="col-12 col-md-4">
              <label className="form-label small text-secondary mb-1">GSTIN</label>
              <input className="form-control" value={templateData.gstin || ""} onChange={(e) => onChangeTemplateField("gstin", e.target.value)} />
            </div>
            <div className="col-12 col-md-4">
              <label className="form-label small text-secondary mb-1">Contact Number</label>
              <input className="form-control" value={templateData.contactNumber || ""} onChange={(e) => onChangeTemplateField("contactNumber", e.target.value)} />
            </div>
            <div className="col-12 col-md-6">
              <label className="form-label small text-secondary mb-1">Email</label>
              <input className="form-control" value={templateData.email || ""} onChange={(e) => onChangeTemplateField("email", e.target.value)} />
            </div>
            <div className="col-12 col-md-6">
              <label className="form-label small text-secondary mb-1">Company Address</label>
              <input className="form-control" value={templateData.companyAddress || ""} onChange={(e) => onChangeTemplateField("companyAddress", e.target.value)} />
            </div>
            <div className="col-12 col-md-3">
              <label className="form-label small text-secondary mb-1">Bank Name</label>
              <input className="form-control" value={templateData.bankName || ""} onChange={(e) => onChangeTemplateField("bankName", e.target.value)} />
            </div>
            <div className="col-12 col-md-3">
              <label className="form-label small text-secondary mb-1">Account Number</label>
              <input className="form-control" value={templateData.accountNumber || ""} onChange={(e) => onChangeTemplateField("accountNumber", e.target.value)} />
            </div>
            <div className="col-12 col-md-3">
              <label className="form-label small text-secondary mb-1">IFSC</label>
              <input className="form-control" value={templateData.ifsc || ""} onChange={(e) => onChangeTemplateField("ifsc", e.target.value)} />
            </div>
            <div className="col-12 col-md-3">
              <label className="form-label small text-secondary mb-1">Branch</label>
              <input className="form-control" value={templateData.branch || ""} onChange={(e) => onChangeTemplateField("branch", e.target.value)} />
            </div>
            <div className="col-12 col-md-6">
              <label className="form-label small text-secondary mb-1">Company Logo</label>
              <input type="file" className="form-control" accept="image/*" onChange={onTemplateLogoUpload} />
            </div>
            <div className="col-12 col-md-6">
              {templateData.logoDataUrl ? (
                <img src={templateData.logoDataUrl} alt="Logo preview" style={{ maxHeight: "80px", maxWidth: "220px", objectFit: "contain" }} />
              ) : (
                <div className="small text-secondary pt-4">Logo not uploaded.</div>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {activeView === "gst" ? (
        <div className="row g-3">
        {stats.map((item) => (
          <div className="col-12 col-md-6 col-xl-3" key={item.label}>
            <div className="card p-3 crm-stat-card">
              <div className="d-flex align-items-center justify-content-between">
                <div>
                  <div className="text-secondary small">{item.label}</div>
                  <h5 className="mb-0 mt-1">{item.value}</h5>
                </div>
                <i className={`bi ${item.icon} fs-4 text-success`} aria-hidden="true" />
              </div>
            </div>
          </div>
        ))}
        </div>
      ) : null}

      {activeView === "gst" && kind === "summary" ? (
        <div className="card p-3">
          <h6 className="mb-3">GST Filing Summary</h6>
          <div className="row g-3">
            <div className="col-12 col-md-4">
              <div className="border rounded p-3">
                <div className="small text-secondary">Output GST</div>
                <div className="fw-semibold">{toInr(moduleData.invoices.reduce((sum, row) => sum + Number(row.cgst || 0) + Number(row.sgst || 0) + Number(row.igst || 0), 0))}</div>
              </div>
            </div>
            <div className="col-12 col-md-4">
              <div className="border rounded p-3">
                <div className="small text-secondary">Taxable Turnover</div>
                <div className="fw-semibold">{toInr(moduleData.invoices.reduce((sum, row) => sum + Number(row.taxable || 0), 0))}</div>
              </div>
            </div>
            <div className="col-12 col-md-4">
              <div className="border rounded p-3">
                <div className="small text-secondary">Invoice Count</div>
                <div className="fw-semibold">{moduleData.invoices.length}</div>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {activeView === "gst" && kind !== "summary" ? (
        <>
          <div className="card p-3">
            <h6 className="mb-3">{editingId ? `Edit ${kind}` : `Create ${kind}`}</h6>
            <form className="row g-3" onSubmit={onSubmit}>
              <div className="col-12 col-md-4">
                <label className="form-label small text-secondary mb-1">Customer Name</label>
                <input className="form-control" value={formValues.customerName} onChange={(e) => onChangeField("customerName", e.target.value)} required />
              </div>
              <div className="col-12 col-md-4">
                <label className="form-label small text-secondary mb-1">Customer GSTIN</label>
                <input className="form-control" value={formValues.customerGstin} onChange={(e) => onChangeField("customerGstin", e.target.value)} placeholder="27ABCDE1234F1Z5" />
              </div>
              <div className="col-12 col-md-4">
                <label className="form-label small text-secondary mb-1">Customer State</label>
                <input className="form-control" value={formValues.customerState} onChange={(e) => onChangeField("customerState", e.target.value)} />
              </div>
              <div className="col-12 col-md-4">
                <label className="form-label small text-secondary mb-1">Place of Supply</label>
                <input className="form-control" value={formValues.placeOfSupply} onChange={(e) => onChangeField("placeOfSupply", e.target.value)} />
              </div>
              <div className="col-12 col-md-4">
                <label className="form-label small text-secondary mb-1">{kind === "invoice" ? "Invoice Date" : "Estimate Date"}</label>
                <input type="date" className="form-control" value={formValues.invoiceDate} onChange={(e) => onChangeField("invoiceDate", e.target.value)} required />
              </div>
              <div className="col-12 col-md-4">
                <label className="form-label small text-secondary mb-1">{kind === "invoice" ? "Due Date" : "Valid Till"}</label>
                <input type="date" className="form-control" value={formValues.dueDate} onChange={(e) => onChangeField("dueDate", e.target.value)} />
              </div>
              <div className="col-12 col-md-3">
                <label className="form-label small text-secondary mb-1">Taxable Value</label>
                <input type="number" className="form-control" value={formValues.taxableValue} onChange={(e) => onChangeField("taxableValue", e.target.value)} required />
              </div>
              <div className="col-12 col-md-3">
                <label className="form-label small text-secondary mb-1">GST Rate (%)</label>
                <input type="number" className="form-control" value={formValues.gstRate} onChange={(e) => onChangeField("gstRate", e.target.value)} />
              </div>
              <div className="col-12 col-md-3">
                <label className="form-label small text-secondary mb-1">Supply Type</label>
                <select className="form-select" value={formValues.supplyType} onChange={(e) => onChangeField("supplyType", e.target.value)}>
                  <option value="intra">Intra-state (CGST + SGST)</option>
                  <option value="inter">Inter-state (IGST)</option>
                </select>
              </div>
              <div className="col-12 col-md-3">
                <label className="form-label small text-secondary mb-1">Grand Total</label>
                <input className="form-control" value={toInr(computeGstAmounts(formValues.taxableValue, formValues.gstRate, formValues.supplyType).grandTotal)} readOnly />
              </div>
              <div className="col-12">
                <div className="d-flex align-items-center justify-content-between mb-2">
                  <label className="form-label small text-secondary mb-0">Item List</label>
                  <button type="button" className="btn btn-sm btn-outline-success" onClick={onAddItem}>
                    Add Item
                  </button>
                </div>
                <div className="d-flex flex-column gap-2">
                  {(formValues.items || []).map((item, index) => (
                    <div className="row g-2 align-items-center" key={`item_${index}`}>
                      <div className="col-12 col-md-5">
                        <input
                          className="form-control form-control-sm"
                          placeholder="Item description"
                          value={item.description}
                          onChange={(e) => onChangeItem(index, "description", e.target.value)}
                        />
                      </div>
                      <div className="col-12 col-md-2">
                        <input
                          className="form-control form-control-sm"
                          placeholder="HSN/SAC"
                          value={item.hsnSac}
                          onChange={(e) => onChangeItem(index, "hsnSac", e.target.value)}
                        />
                      </div>
                      <div className="col-6 col-md-2">
                        <input
                          type="number"
                          min="0"
                          className="form-control form-control-sm"
                          placeholder="Qty"
                          value={item.quantity}
                          onChange={(e) => onChangeItem(index, "quantity", e.target.value)}
                        />
                      </div>
                      <div className="col-6 col-md-2">
                        <input
                          type="number"
                          min="0"
                          className="form-control form-control-sm"
                          placeholder="Unit Price"
                          value={item.unitPrice}
                          onChange={(e) => onChangeItem(index, "unitPrice", e.target.value)}
                        />
                      </div>
                      <div className="col-12 col-md-1 text-end">
                        <button
                          type="button"
                          className="btn btn-sm btn-outline-danger"
                          onClick={() => onRemoveItem(index)}
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="col-12">
                <label className="form-label small text-secondary mb-1">Notes</label>
                <textarea className="form-control" rows={2} value={formValues.notes} onChange={(e) => onChangeField("notes", e.target.value)} />
              </div>
              <div className="col-12 d-flex gap-2">
                <button type="submit" className="btn btn-success btn-sm">{editingId ? "Update" : `Create ${kind === "invoice" ? "Invoice" : "Estimate"}`}</button>
                {editingId ? (
                  <button type="button" className="btn btn-outline-light btn-sm" onClick={() => {
                    setEditingId("");
                    setFormValues(defaultAccountForm);
                  }}>
                    Cancel
                  </button>
                ) : null}
              </div>
            </form>
          </div>

          <div className="card p-3">
            <h6 className="mb-3">Invoice Preview</h6>
            <div className="border rounded p-3">
              <div className="d-flex justify-content-between align-items-start gap-3">
                <div>
                  <div className="fw-semibold">{templateData.companyName || "-"}</div>
                  <div className="small text-secondary">GSTIN: {templateData.gstin || "-"}</div>
                  <div className="small text-secondary">Contact: {templateData.contactNumber || "-"}</div>
                  <div className="small text-secondary">Address: {templateData.companyAddress || "-"}</div>
                </div>
                {templateData.logoDataUrl ? (
                  <img src={templateData.logoDataUrl} alt="Template logo" style={{ maxHeight: "64px", maxWidth: "180px", objectFit: "contain" }} />
                ) : null}
              </div>
              <hr className="my-2" />
              <div className="small">Customer: {formValues.customerName || "-"}</div>
              <div className="small">Invoice Date: {formValues.invoiceDate || "-"}</div>
              <div className="small">Place of Supply: {formValues.placeOfSupply || "-"}</div>
              <div className="small">Grand Total: {toInr(computeGstAmounts(formValues.taxableValue, formValues.gstRate, formValues.supplyType).grandTotal)}</div>
            </div>
          </div>

          <div className="card p-3">
            <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-3">
              <h6 className="mb-0">{activeTab === "invoices" ? "GST Invoices" : "GST Estimates"}</h6>
              <div className="d-flex flex-wrap align-items-end gap-2">
                <div>
                  <label className="form-label small text-secondary mb-1">From</label>
                  <input type="date" className="form-control form-control-sm" value={exportFromDate} onChange={(e) => setExportFromDate(e.target.value)} />
                </div>
                <div>
                  <label className="form-label small text-secondary mb-1">To</label>
                  <input type="date" className="form-control form-control-sm" value={exportToDate} onChange={(e) => setExportToDate(e.target.value)} />
                </div>
                <input
                  className="form-control form-control-sm"
                  style={{ width: "220px" }}
                  placeholder={`Search ${activeTab}...`}
                  value={gstSearch}
                  onChange={(e) => {
                    setGstSearch(e.target.value);
                    setGstPage(1);
                  }}
                />
                <button type="button" className="btn btn-outline-light btn-sm" onClick={exportCurrentTab}>
                  Export CSV
                </button>
                {activeTab === "invoices" ? (
                  <button type="button" className="btn btn-success btn-sm" onClick={exportInvoicesAsZip}>
                    Download PDF ZIP
                  </button>
                ) : null}
              </div>
            </div>
            <div className="table-responsive">
              <table className="table table-dark table-borderless align-middle mb-0">
                <thead>
                  <tr>
                    <th>Doc No</th>
                    <th>Customer</th>
                    <th>Date</th>
                    <th>Taxable</th>
                    <th>GST</th>
                    <th>Total</th>
                    <th>Status</th>
                    <th className="text-end">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {pagedGstRows.length ? (
                    pagedGstRows.map((row) => (
                      <tr key={row.id}>
                        <td>{row.docNo || "-"}</td>
                        <td>{row.customerName}</td>
                        <td>{row.invoiceDate || "-"}</td>
                        <td>{toInr(row.taxable)}</td>
                        <td>{toInr(Number(row.cgst || 0) + Number(row.sgst || 0) + Number(row.igst || 0))}</td>
                        <td>{toInr(row.grandTotal)}</td>
                        <td>{row.status}</td>
                        <td className="text-end">
                          <div className="d-inline-flex gap-2">
                            {activeTab === "invoices" ? (
                              <button type="button" className="btn btn-sm btn-outline-success" onClick={() => downloadInvoicePdf(row)}>
                                PDF
                              </button>
                            ) : null}
                            <button type="button" className="btn btn-sm btn-outline-info" onClick={() => onEditRow(row)}>Edit</button>
                            {activeTab === "estimates" ? (
                              <button type="button" className="btn btn-sm btn-outline-success" onClick={() => onConvertEstimate(row)}>Convert</button>
                            ) : null}
                            <button type="button" className="btn btn-sm btn-outline-danger" onClick={() => onDeleteRow(row.id)}>Delete</button>
                          </div>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={8} className="text-secondary">No records yet.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 mt-3">
              <small className="text-secondary">
                Showing {filteredGstRows.length ? (gstPage - 1) * gstPageSize + 1 : 0} to {Math.min(gstPage * gstPageSize, filteredGstRows.length)} of {filteredGstRows.length} entries
              </small>
              <div className="d-flex align-items-center gap-2">
                <button
                  type="button"
                  className="btn btn-sm btn-outline-light"
                  onClick={() => setGstPage((prev) => Math.max(1, prev - 1))}
                  disabled={gstPage <= 1}
                >
                  Prev
                </button>
                <span className="small text-secondary">Page {gstPage} / {gstTotalPages}</span>
                <button
                  type="button"
                  className="btn btn-sm btn-outline-light"
                  onClick={() => setGstPage((prev) => Math.min(gstTotalPages, prev + 1))}
                  disabled={gstPage >= gstTotalPages}
                >
                  Next
                </button>
              </div>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}

function CrmManagementModule() {
  const [activeTab, setActiveTab] = useState("leads");
  const [moduleData, setModuleData] = useState(DEFAULT_CRM_DATA);
  const [formValues, setFormValues] = useState(buildEmptyValues(CRM_TAB_CONFIG.leads.fields));
  const [editingId, setEditingId] = useState("");
  const [notice, setNotice] = useState("");
  const [leadCompanyFocused, setLeadCompanyFocused] = useState(false);
  const importRef = useRef(null);
  const formRef = useRef(null);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(CRM_STORAGE_KEY);
      if (!raw) {
        return;
      }
      const parsed = JSON.parse(raw);
      if (isValidCrmData(parsed)) {
        setModuleData(parsed);
      }
    } catch (_error) {
      // Ignore invalid cached module data.
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem(CRM_STORAGE_KEY, JSON.stringify(moduleData));
  }, [moduleData]);

  useEffect(() => {
    setEditingId("");
    setFormValues(buildEmptyValues(CRM_TAB_CONFIG[activeTab].fields));
    setNotice("");
    setLeadCompanyFocused(false);
  }, [activeTab]);

  const config = CRM_TAB_CONFIG[activeTab];
  const currentRows = moduleData[activeTab] || [];
  const leadCompanyOptions = useMemo(() => {
    const seen = new Set();
    return (moduleData.contacts || [])
      .map((contact) => String(contact?.company || "").trim())
      .filter((company) => {
        if (!company) return false;
        const key = company.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
  }, [moduleData.contacts]);
  const filteredLeadCompanyOptions = useMemo(() => {
    const query = String(formValues.company || "").trim().toLowerCase();
    if (!query) return leadCompanyOptions.slice(0, 8);
    return leadCompanyOptions.filter((option) => option.toLowerCase().includes(query)).slice(0, 8);
  }, [leadCompanyOptions, formValues.company]);

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
    setNotice(`${config.itemLabel} saved.`);
  }

  function downloadCsv(filename, headers, rows) {
    const escapeCell = (value) => {
      const text = String(value ?? "");
      if (text.includes(",") || text.includes("\"") || text.includes("\n")) {
        return `"${text.replace(/"/g, "\"\"")}"`;
      }
      return text;
    };
    const content = [
      headers.join(","),
      ...rows.map((row) => headers.map((key) => escapeCell(row[key])).join(","))
    ].join("\n");
    const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  function handleDownloadLeadTemplate() {
    downloadCsv("crm_leads_template.csv", ["name", "source", "status"], [
      { name: "Example Pvt Ltd", source: "Website", status: "Open" }
    ]);
  }

  function handleDownloadLeads() {
    const leads = moduleData.leads || [];
    downloadCsv("crm_leads_export.csv", ["name", "source", "status"], leads);
  }

  function handleImportClick() {
    if (importRef.current) {
      importRef.current.value = "";
      importRef.current.click();
    }
  }

  function handleCreateLeadQuick() {
    setActiveTab("leads");
    setEditingId("");
    setFormValues(buildEmptyValues(CRM_TAB_CONFIG.leads.fields));
    setTimeout(() => {
      if (formRef.current) {
        formRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }, 50);
  }

  function handleImportLeads(event) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result || "");
      const lines = text
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);
      if (lines.length < 2) {
        setNotice("Import failed: file is empty.");
        return;
      }
      const headers = lines[0].split(",").map((value) => value.trim().toLowerCase());
      const nameIdx = headers.indexOf("name");
      const sourceIdx = headers.indexOf("source");
      const statusIdx = headers.indexOf("status");
      if (nameIdx === -1 || sourceIdx === -1 || statusIdx === -1) {
        setNotice("Import failed: required columns are name, source, status.");
        return;
      }
      const importedRows = [];
      for (let i = 1; i < lines.length; i += 1) {
        const columns = lines[i].split(",").map((value) => value.trim());
        const name = columns[nameIdx] || "";
        const source = columns[sourceIdx] || "";
        const status = columns[statusIdx] || "";
        if (!name || !source || !status) {
          continue;
        }
        importedRows.push({
          id: `leads_${Date.now()}_${i}`,
          name,
          source,
          status
        });
      }
      if (!importedRows.length) {
        setNotice("Import skipped: no valid lead rows found.");
        return;
      }
      setModuleData((prev) => ({
        ...prev,
        leads: [...importedRows, ...(prev.leads || [])]
      }));
      setActiveTab("leads");
      setNotice(`${importedRows.length} leads imported.`);
    };
    reader.readAsText(file);
  }

  return (
    <div className="d-flex flex-column gap-3">
      <div className="module-heading">
        <h4 className="mb-1">CRM</h4>
        <p className="text-secondary mb-0">Manage leads, deals, and customer follow-ups.</p>
      </div>

      <div className="erp-top-tabs">
        {Object.entries(CRM_TAB_CONFIG).map(([tabKey, tabValue]) => (
          <button
            key={tabKey}
            type="button"
            className={`erp-top-tab ${activeTab === tabKey ? "active" : ""}`}
            onClick={() => setActiveTab(tabKey)}
          >
            {tabValue.label}
          </button>
        ))}
      </div>

      {notice ? <div className="alert alert-info py-2 mb-0">{notice}</div> : null}

      <div className="row g-3">
        {MODULE_CONTENT.crm.stats.map((item) => (
          <div className="col-12 col-md-4" key={item.label}>
            <div className="card p-3 crm-stat-card">
              <div className="d-flex align-items-center justify-content-between">
                <div>
                  <div className="text-secondary small">{item.label}</div>
                  <h5 className="mb-0 mt-1">{item.value}</h5>
                </div>
                {item.icon ? <i className={`bi ${item.icon} fs-4 text-success`} aria-hidden="true" /> : null}
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="card p-3">
        <div className="d-flex align-items-center justify-content-between mb-3">
          <h6 className="mb-0">{config.label}</h6>
          <span className="badge bg-secondary">{currentRows.length} items</span>
        </div>
        {activeTab === "leads" ? (
          <div className="d-flex flex-wrap gap-2 mb-3">
            <button type="button" className="btn btn-success btn-sm" onClick={handleCreateLeadQuick}>
              Create Lead
            </button>
            <button type="button" className="btn btn-outline-info btn-sm" onClick={handleDownloadLeadTemplate}>
              Download Excel Template
            </button>
            <button type="button" className="btn btn-outline-primary btn-sm" onClick={handleImportClick}>
              Import Leads (Excel)
            </button>
            <button type="button" className="btn btn-outline-light btn-sm" onClick={handleDownloadLeads}>
              Download Leads
            </button>
            <input
              ref={importRef}
              type="file"
              accept=".csv,text/csv"
              className="d-none"
              onChange={handleImportLeads}
            />
          </div>
        ) : null}
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

      <div className="card p-3" ref={formRef}>
        <h6 className="mb-3">{editingId ? `Edit ${config.itemLabel}` : `Create ${config.itemLabel}`}</h6>
        <form className="d-flex flex-column gap-3" onSubmit={onSubmit}>
          <div className="row g-3">
            {config.fields.map((field) => (
              <div className={activeTab === "leads" ? "col-12 col-md-6 col-xl-3" : "col-12 col-md-4"} key={field.key}>
                <label className="form-label small text-secondary mb-1">{field.label}</label>
                {activeTab === "leads" && field.key === "status" ? (
                  <select
                    className="form-select"
                    value={formValues[field.key] || ""}
                    onChange={(event) => onChangeField(field.key, event.target.value)}
                  >
                    <option value="">Select lead status</option>
                    {CRM_LEAD_STATUS_OPTIONS.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                ) : activeTab === "leads" && field.key === "source" ? (
                  <select
                    className="form-select"
                    value={formValues[field.key] || ""}
                    onChange={(event) => onChangeField(field.key, event.target.value)}
                  >
                    <option value="">Select lead source</option>
                    {CRM_LEAD_SOURCE_OPTIONS.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                ) : activeTab === "leads" && field.key === "company" ? (
                  <div className="position-relative">
                    <input
                      type="text"
                      className="form-control"
                      placeholder={field.placeholder}
                      value={formValues[field.key] || ""}
                      onFocus={() => setLeadCompanyFocused(true)}
                      onBlur={() => setTimeout(() => setLeadCompanyFocused(false), 120)}
                      onChange={(event) => onChangeField(field.key, event.target.value)}
                    />
                    {leadCompanyFocused && filteredLeadCompanyOptions.length ? (
                      <div
                        className="position-absolute start-0 end-0 mt-1 border rounded bg-dark shadow"
                        style={{ zIndex: 30, maxHeight: "180px", overflowY: "auto" }}
                      >
                        {filteredLeadCompanyOptions.map((option) => (
                          <button
                            key={option}
                            type="button"
                            className="d-block w-100 text-start px-2 py-1 border-0 bg-transparent text-light"
                            onMouseDown={(event) => {
                              event.preventDefault();
                              onChangeField(field.key, option);
                              setLeadCompanyFocused(false);
                            }}
                          >
                            {option}
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ) : activeTab === "meetings" && field.key === "participantsReminder" ? (
                  <select
                    className="form-select"
                    value={formValues[field.key] || ""}
                    onChange={(event) => onChangeField(field.key, event.target.value)}
                  >
                    <option value="">Select participants reminder</option>
                    {CRM_MEETING_PARTICIPANTS_REMINDER_OPTIONS.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    className="form-control"
                    placeholder={field.placeholder}
                    value={formValues[field.key] || ""}
                    onChange={(event) => onChangeField(field.key, event.target.value)}
                  />
                )}
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

function ProjectManagementModule() {
  const [activeTab, setActiveTab] = useState("projects");
  const [moduleData, setModuleData] = useState(DEFAULT_PROJECT_DATA);
  const [formValues, setFormValues] = useState(buildEmptyValues(PROJECT_TAB_CONFIG.projects.fields));
  const [editingId, setEditingId] = useState("");
  const [searchText, setSearchText] = useState("");
  const [currentPage, setCurrentPage] = useState(1);

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
    setSearchText("");
    setCurrentPage(1);
  }, [activeTab]);

  const config = PROJECT_TAB_CONFIG[activeTab];
  const currentRows = moduleData[activeTab] || [];
  const pageSize = 10;

  const filteredRows = useMemo(() => {
    const query = searchText.trim().toLowerCase();
    if (!query) {
      return currentRows;
    }
    return currentRows.filter((row) =>
      config.columns.some((column) => String(row[column.key] || "").toLowerCase().includes(query))
    );
  }, [currentRows, config.columns, searchText]);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / pageSize));
  const pagedRows = useMemo(() => {
    const safePage = Math.min(currentPage, totalPages);
    const start = (safePage - 1) * pageSize;
    return filteredRows.slice(start, start + pageSize);
  }, [filteredRows, currentPage, totalPages]);
  const visiblePageNumbers = useMemo(() => {
    if (totalPages <= 7) {
      return Array.from({ length: totalPages }, (_, idx) => idx + 1);
    }
    if (currentPage <= 4) {
      return [1, 2, 3, 4, 5, -1, totalPages];
    }
    if (currentPage >= totalPages - 3) {
      return [1, -1, totalPages - 4, totalPages - 3, totalPages - 2, totalPages - 1, totalPages];
    }
    return [1, -1, currentPage - 1, currentPage, currentPage + 1, -1, totalPages];
  }, [currentPage, totalPages]);

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

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
      <div className="module-heading">
        <h4 className="mb-1">Project Management</h4>
        <p className="text-secondary mb-0">Track project milestones, tasks, and team delivery.</p>
      </div>

      <div className="erp-top-tabs">
        {Object.entries(PROJECT_TAB_CONFIG).map(([tabKey, tabValue]) => (
          <button
            key={tabKey}
            type="button"
            className={`erp-top-tab ${activeTab === tabKey ? "active" : ""}`}
            onClick={() => setActiveTab(tabKey)}
          >
            {tabValue.label}
          </button>
        ))}
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

      <div className="card p-3">
        <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-3">
          <small className="text-secondary">Show {pageSize} entries</small>
          <h6 className="mb-0">{config.label}</h6>
          <input
            className="form-control form-control-sm"
            style={{ maxWidth: "280px" }}
            placeholder={`Search ${config.label.toLowerCase()}...`}
            value={searchText}
            onChange={(event) => {
              setSearchText(event.target.value);
              setCurrentPage(1);
            }}
          />
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
              {pagedRows.length === 0 ? (
                <tr>
                  <td colSpan={config.columns.length + 1} className="text-secondary">
                    No {config.label.toLowerCase()} found.
                  </td>
                </tr>
              ) : (
                pagedRows.map((row) => (
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
        <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 mt-2">
          <small className="text-secondary">
            Showing {filteredRows.length ? (currentPage - 1) * pageSize + 1 : 0} to {Math.min(currentPage * pageSize, filteredRows.length)} of {filteredRows.length} entries
          </small>
          <div className="d-flex flex-wrap align-items-center gap-2">
            <button
              type="button"
              className="btn btn-sm btn-outline-light"
              onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
              disabled={currentPage <= 1}
            >
              Prev
            </button>
            {visiblePageNumbers.map((page, idx) =>
              page === -1 ? (
                <span key={`ellipsis_${idx}`} className="small text-secondary px-1">
                  ...
                </span>
              ) : (
                <button
                  key={page}
                  type="button"
                  className={`btn btn-sm ${currentPage === page ? "btn-success" : "btn-outline-light"}`}
                  onClick={() => setCurrentPage(page)}
                >
                  {page}
                </button>
              )
            )}
            <button
              type="button"
              className="btn btn-sm btn-outline-light"
              onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
              disabled={currentPage >= totalPages}
            >
              Next
            </button>
          </div>
        </div>
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
      <div className="module-heading">
        <h4 className="mb-1">HR Management</h4>
        <p className="text-secondary mb-0">Handle employees, attendance, leave approvals, and payroll.</p>
      </div>

      <div className="erp-top-tabs">
        {Object.entries(HR_TAB_CONFIG).map(([tabKey, tabValue]) => (
          <button
            key={tabKey}
            type="button"
            className={`erp-top-tab ${activeTab === tabKey ? "active" : ""}`}
            onClick={() => setActiveTab(tabKey)}
          >
            {tabValue.label}
          </button>
        ))}
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
  const [activeTab, setActiveTab] = useState((moduleData.sections || [])[0] || "");

  useEffect(() => {
    const firstTab = (moduleData.sections || [])[0] || "";
    setActiveTab(firstTab);
  }, [moduleData]);

  return (
    <div className="d-flex flex-column gap-3">
      <div className="module-heading">
        <h4 className="mb-1">{heading}</h4>
        <p className="text-secondary mb-0">{moduleData.subtitle}</p>
      </div>

      {(moduleData.sections || []).length ? (
        <div className="erp-top-tabs">
          {(moduleData.sections || []).map((section) => (
            <button
              key={section}
              type="button"
              className={`erp-top-tab ${activeTab === section ? "active" : ""}`}
              onClick={() => setActiveTab(section)}
            >
              {section}
            </button>
          ))}
        </div>
      ) : null}

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
        <h6 className="mb-3">{activeTab || "Enabled Features"}</h6>
        <div className="d-flex flex-column gap-2">
          {(moduleData.sections || [])
            .filter((section) => !activeTab || section === activeTab)
            .map((section) => (
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
  if (moduleKey === "crm") {
    return <CrmManagementModule />;
  }
  if (moduleKey === "accounts") {
    return <AccountsErpModule />;
  }

  return <StandardModule heading={heading} moduleData={moduleData} />;
}
