import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import * as XLSX from "xlsx";
import { apiFetch } from "../lib/api.js";
import { DIAL_CODE_OPTIONS, DIAL_CODE_LABEL_OPTIONS, COUNTRY_OPTIONS, getStateOptionsForCountry } from "../lib/locationData.js";
import TablePagination from "../components/TablePagination.jsx";
import PhoneCountryCodePicker from "../components/PhoneCountryCodePicker.jsx";
import { showUploadAlert } from "../lib/uploadAlert.js";
import { getOrgCurrency, setOrgCurrency as applyOrgCurrency } from "../lib/orgCurrency.js";
import {
  clampBusinessAutopilotText,
  getBusinessAutopilotMaxLength,
  validateBusinessAutopilotImage,
  validateBusinessAutopilotImageOrPdf,
  validateBusinessAutopilotPdf,
} from "../lib/businessAutopilotFormRules.js";

const STORAGE_KEY = "wz_business_autopilot_projects_module";
const CRM_STORAGE_KEY = "wz_business_autopilot_crm_module";
const CRM_STORAGE_KEY_ACTIVE = "wz_business_autopilot_crm_active_key";
const CRM_STORAGE_KEY_PREFIX = "wz_business_autopilot_crm_module_scope";
const CRM_ROLE_ACCESS_STORAGE_KEY = "wz_business_autopilot_role_access";
const HR_STORAGE_KEY = "wz_business_autopilot_hr_module";
const TICKETING_STORAGE_KEY = "wz_business_autopilot_ticketing_module";
const STOCKS_STORAGE_KEY = "wz_business_autopilot_stocks_module";
const ACCOUNTS_STORAGE_KEY = "wz_business_autopilot_accounts_module";
const DEFAULT_TABLE_PAGE_SIZE = 5;
const DIAL_COUNTRY_PICKER_OPTIONS = DIAL_CODE_LABEL_OPTIONS.map((option) => ({
  code: String(option?.value || "").trim(),
  label: String(option?.country || option?.label || "").trim(),
  flag: String(option?.flag || "🌐"),
}));

function normalizeCountryName(value) {
  return String(value || "").trim().toLowerCase();
}

const EMAIL_ADDRESS_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function getAccountsTaxUiConfig(countryValue) {
  const country = String(countryValue || "India").trim() || "India";
  const normalized = normalizeCountryName(country);
  if (normalized === "india") {
    return {
      country,
      mode: "gst",
      templatesLabel: "GST Templates",
      templateSingular: "GST Template",
      templateListTitle: "GST Template List",
      createTitle: "Create GST Template",
      editTitle: "Edit GST Template",
      createActionLabel: "Create GST Template",
      editActionLabel: "Update GST Template",
      scopeLabel: "Scope",
      defaultScope: "Intra State",
      scopeOptions: ["Intra State", "Inter State", "Export"],
      namePlaceholder: "India GST 18%",
      notesPlaceholder: "Template notes",
      cgstLabel: "CGST %",
      sgstLabel: "SGST %",
      igstLabel: "IGST %",
      cessLabel: "CESS %",
      helperText: "India billing profile detected. GST rule template defaults are enabled."
    };
  }
  if (normalized === "united states" || normalized === "usa" || normalized === "us") {
    return {
      country,
      mode: "us_sales_tax",
      templatesLabel: "Tax Templates",
      templateSingular: "Tax Template",
      templateListTitle: "Tax Template List",
      createTitle: "Create Tax Template",
      editTitle: "Edit Tax Template",
      createActionLabel: "Create Tax Template",
      editActionLabel: "Update Tax Template",
      scopeLabel: "Jurisdiction",
      defaultScope: "Same State",
      scopeOptions: ["Same State", "Out of State", "International"],
      namePlaceholder: "US Sales Tax",
      notesPlaceholder: "Tax rule notes",
      cgstLabel: "State Tax %",
      sgstLabel: "County/Local Tax %",
      igstLabel: "Combined Sales Tax %",
      cessLabel: "Extra Tax %",
      helperText: "US billing profile detected. Sales-tax style rule labels are shown."
    };
  }
  return {
    country,
    mode: "vat",
    templatesLabel: "Tax Templates",
    templateSingular: "Tax Template",
    templateListTitle: "Tax Template List",
    createTitle: "Create Tax Template",
    editTitle: "Edit Tax Template",
    createActionLabel: "Create Tax Template",
    editActionLabel: "Update Tax Template",
    scopeLabel: "Scope",
    defaultScope: "Domestic",
    scopeOptions: ["Domestic", "Cross Border", "Export"],
    namePlaceholder: `${country} VAT`,
    notesPlaceholder: "VAT / tax rule notes",
    cgstLabel: "Regional Tax %",
    sgstLabel: "Local Tax %",
    igstLabel: "VAT / Main Tax %",
    cessLabel: "Additional Tax %",
    helperText: `${country} billing profile detected. VAT/Tax rule labels are shown.`
  };
}

const MODULE_CONTENT = {
  crm: {
    title: "CRM",
    subtitle: "Manage leads, deals, and customer follow-ups.",
    stats: [
      { label: "Open Leads", value: "24" },
      { label: "Pipeline Value", value: "8.4L" },
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
    title: "HR",
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
    title: "Accounts",
    subtitle: "Control billing, expenses, GST, and accounting reports.",
    stats: [
      { label: "Invoices This Month", value: "126" },
      { label: "Receivables", value: "3.2L" },
      { label: "GST Status", value: "Ready" }
    ],
    sections: [
      "Invoice and billing",
      "Expense tracking",
      "GST reports",
      "Vendor and purchase entries"
    ]
  },
  subscriptions: {
    title: "Subscriptions",
    subtitle: "Create categories, plans, and subscription billing records.",
    stats: [
      { label: "Categories", value: "0" },
      { label: "Sub Categories", value: "0" },
      { label: "Subscriptions", value: "0" }
    ],
    sections: [
      "Subscription categories",
      "Sub category management",
      "Subscription plans and billing"
    ]
  },
  ticketing: {
    title: "Ticketing System",
    subtitle: "Track support tickets, priorities, SLA, and team resolution workflows.",
    stats: [
      { label: "Open Tickets", value: "18" },
      { label: "Pending Today", value: "7" },
      { label: "Avg Resolution", value: "4h 20m" }
    ],
    sections: [
      "Ticket queue and status board",
      "Priority and SLA tracking",
      "Agent assignment and ownership",
      "Customer issue comments and history"
    ]
  },
  stocks: {
    title: "Inventory",
    subtitle: "Manage inventory levels, stock movement, reorder alerts, and warehouses.",
    stats: [
      { label: "Items In Stock", value: "428" },
      { label: "Low Stock Alerts", value: "12" },
      { label: "Warehouses", value: "3" }
    ],
    sections: [
      "Inventory items master",
      "Stock in / stock out entries",
      "Low-stock reorder alerts",
      "Warehouse-wise quantity tracking"
    ]
  }
};

const CRM_MEETING_REMINDER_CHANNEL_OPTIONS = ["App Alert", "Email", "SMS", "WhatsApp"];
const CRM_LEAD_SOURCE_OPTIONS = [
  "Advertisement",
  "Social Media",
  "Cold Call",
  "Employee Referral",
  "External Referral",
  "Partner",
  "Public Relations",
  "Sales Email Alias",
  "Seminar Partner",
  "Internal Seminar",
  "Trade Show",
  "Web Research",
  "Others",
];
const CRM_MEETING_REMINDER_MINUTE_OPTIONS = [
  { value: "5", label: "5 Mins" },
  { value: "10", label: "10 Mins" },
  { value: "15", label: "15 Mins" },
  { value: "30", label: "30 Mins" },
  { value: "60", label: "1 Hr" },
  { value: "120", label: "2 Hrs" },
  { value: "180", label: "3 Hrs" },
  { value: "240", label: "4 Hrs" },
  { value: "360", label: "6 Hrs" },
  { value: "480", label: "8 Hrs" },
  { value: "1440", label: "24 Hrs" },
];
const CRM_FOLLOWUP_RELATED_TO_TYPES = ["Lead", "CRM Contact", "Client"];
const CRM_FOLLOWUP_STATUS_TABS = ["ongoing", "pending", "missed", "completed"];
const CRM_DEAL_STATUS_OPTIONS = ["Open", "Won", "Lost"];
const CRM_SOFT_DELETE_RETENTION_DAYS = 180;

const CRM_SECTION_CONFIG = {
  leads: {
    label: "Leads",
    itemLabel: "Lead",
    icon: "bi-person-plus",
    columns: [
      { key: "name", label: "Lead Name" },
      { key: "company", label: "Company" },
      { key: "leadAmount", label: "Lead Amount" },
      { key: "phone", label: "Phone" },
      { key: "assignedTo", label: "Assigned To" },
      { key: "createdBy", label: "Created By" },
      { key: "stage", label: "Stage" },
      { key: "status", label: "Status" }
    ],
    fields: [
      { key: "name", label: "Lead Name", placeholder: "Enter lead name" },
      { key: "company", label: "Company", placeholder: "Company / Business name" },
      { key: "contactPerson", label: "Contact Person", placeholder: "Client / Contact person", required: false },
      { key: "phoneCountryCode", label: "Country Code", type: "select", options: DIAL_CODE_OPTIONS, defaultValue: "+91" },
      { key: "phone", label: "Phone", placeholder: "Mobile number" },
      { key: "leadAmount", label: "Lead Amount", placeholder: "Lead amount", required: false },
      { key: "leadSource", label: "Lead Source", type: "select", options: CRM_LEAD_SOURCE_OPTIONS, defaultValue: "" },
      { key: "assignType", label: "Assign To", type: "select", options: ["Users", "Team"], defaultValue: "Users" },
      { key: "assignedUser", label: "Users", type: "multiselect", options: [], optionSource: "erpUsers", placeholder: "Search users" },
      { key: "assignedTeam", label: "Team", type: "select", options: [], optionSource: "crmTeams", defaultValue: "" },
      { key: "stage", label: "Stage", type: "select", options: ["New", "Qualified", "Proposal"], defaultValue: "New" },
      { key: "status", label: "Status", type: "select", options: ["Open", "Closed", "Onhold"], defaultValue: "Open" }
    ]
  },
  contacts: {
    label: "Contacts",
    itemLabel: "Contact",
    icon: "bi-person-lines-fill",
    columns: [
      { key: "name", label: "Name" },
      { key: "company", label: "Company" },
      { key: "email", label: "Email" },
      { key: "phone", label: "Phone" },
      { key: "tag", label: "Tag" }
    ],
    fields: [
      { key: "name", label: "Name", placeholder: "Contact name" },
      { key: "company", label: "Company", placeholder: "Company name" },
      { key: "email", label: "Email", placeholder: "contact@example.com" },
      { key: "phoneCountryCode", label: "Country Code", type: "select", options: DIAL_CODE_OPTIONS, defaultValue: "+91" },
      { key: "phone", label: "Phone", placeholder: "Phone number" },
      { key: "tag", label: "Tag", type: "select", options: ["Client", "Prospect", "Vendor"], defaultValue: "" }
    ]
  },
  teams: {
    label: "Teams",
    itemLabel: "Team",
    icon: "bi-people-fill",
    columns: [
      { key: "name", label: "Team Name" },
      { key: "departmentSummary", label: "Department" },
      { key: "employeeCount", label: "Employees" },
      { key: "createdBy", label: "Created By" }
    ],
    fields: [
      { key: "name", label: "Team Name", placeholder: "Inside Sales Team" },
      { key: "members", label: "Employees", type: "multiselect", options: [], optionSource: "erpUsers" }
    ]
  },
  deals: {
    label: "Deals",
    itemLabel: "Deal",
    icon: "bi-currency-rupee",
    columns: [
      { key: "dealName", label: "Deal Name" },
      { key: "company", label: "Company" },
      { key: "dealValueExpected", label: "Deal Value (Expected)" },
      { key: "wonAmountFinal", label: "Won Amount (Final)" },
      { key: "status", label: "Status" }
    ],
    fields: [
      { key: "dealName", label: "Deal Name", placeholder: "ERP rollout annual contract" },
      { key: "company", label: "Company", placeholder: "Client or Company" },
      { key: "dealValueExpected", label: "Deal Value (Expected)", placeholder: "Expected value", required: false },
      { key: "wonAmountFinal", label: "Won Amount (Final)", placeholder: "Final won amount", required: false },
      { key: "status", label: "Status", type: "select", options: ["Open", "Won", "Lost"], defaultValue: "Open" }
    ]
  },
  salesOrders: {
    label: "Sales Orders",
    itemLabel: "Sales Order",
    icon: "bi-receipt-cutoff",
    columns: [
      { key: "orderId", label: "Order ID" },
      { key: "customerName", label: "Customer Name" },
      { key: "company", label: "Company" },
      { key: "phone", label: "Phone" },
      { key: "amount", label: "Amount" },
      { key: "status", label: "Status" }
    ],
    fields: [
      { key: "customerName", label: "Customer Name", placeholder: "Customer name" },
      { key: "company", label: "Company", placeholder: "Company name" },
      { key: "phone", label: "Phone", placeholder: "Phone number" },
      { key: "amount", label: "Amount", placeholder: "Order amount", required: false },
      { key: "quantity", label: "Quantity", placeholder: "Quantity", required: false },
      { key: "price", label: "Price", placeholder: "Price", required: false },
      { key: "tax", label: "Tax", placeholder: "Tax amount", required: false },
      { key: "status", label: "Status", type: "select", options: ["Pending", "Completed"], defaultValue: "Pending" }
    ]
  },
  followUps: {
    label: "Follow-ups",
    itemLabel: "Follow-up",
    icon: "bi-telephone-forward",
    columns: [
      { key: "subject", label: "Subject" },
      { key: "relatedTo", label: "Related To" },
      { key: "dueDate", label: "Due Date" },
      { key: "owner", label: "Employee" },
      { key: "status", label: "Status" }
    ],
    fields: [
      { key: "subject", label: "Subject", placeholder: "Demo callback / pricing follow-up" },
      { key: "relatedTo", label: "Related To", placeholder: "Lead / Contact / Deal name" },
      { key: "dueDate", label: "Due Date", type: "date" },
      { key: "owner", label: "Employee", placeholder: "Search employee" },
      { key: "status", label: "Status", type: "select", options: ["Ongoing", "Pending", "Completed"], defaultValue: "Pending" }
    ]
  },
  activities: {
    label: "Activities",
    itemLabel: "Activity",
    icon: "bi-clock-history",
    columns: [
      { key: "activityType", label: "Activity Type" },
      { key: "relatedTo", label: "Client Name" },
      { key: "date", label: "Date" },
      { key: "owner", label: "Assigned Users" },
      { key: "notes", label: "Notes" }
    ],
    fields: [
      { key: "activityType", label: "Activity Type", placeholder: "Call / Meeting / Demo / Email" },
      { key: "relatedTo", label: "Client Name", placeholder: "Search client / company" },
      { key: "date", label: "Date", type: "date" },
      { key: "owner", label: "Assigned Users", type: "multiselect", defaultValue: [] },
      { key: "notes", label: "Notes", placeholder: "Short activity notes" }
    ]
  },
  meetings: {
    label: "Meetings",
    itemLabel: "Meeting",
    icon: "bi-calendar-event",
    columns: [
      { key: "title", label: "Meeting Title" },
      { key: "relatedTo", label: "Related To" },
      { key: "meetingDate", label: "Date" },
      { key: "meetingTime", label: "Time" },
      { key: "owner", label: "Owner" },
      { key: "reminderSummary", label: "Reminder" },
      { key: "status", label: "Status" }
    ],
    fields: [
      { key: "title", label: "Meeting Title", placeholder: "Client demo / Follow-up call" },
      { key: "companyOrClientName", label: "Company / Client Name", type: "datalist", datalistSource: "crmContacts", placeholder: "Select company / client from contacts" },
      { key: "relatedTo", label: "Related To", placeholder: "Lead / Contact / Deal / Company" },
      { key: "meetingDate", label: "Meeting Date", type: "date" },
      { key: "meetingTime", label: "Meeting Time", type: "time" },
      { key: "owner", label: "Employees", type: "multiselect", defaultValue: [] },
      { key: "meetingMode", label: "Meeting Mode", type: "select", options: ["Online", "Offline", "Phone"], defaultValue: "" },
      { key: "reminderChannel", label: "Reminder Channel", type: "multiselect", options: CRM_MEETING_REMINDER_CHANNEL_OPTIONS, defaultValue: [] },
      { key: "reminderDays", label: "Remind Before Days", type: "multiselect", defaultValue: [] },
      { key: "reminderMinutes", label: "Reminder Before (Minutes)", type: "multiselect", options: CRM_MEETING_REMINDER_MINUTE_OPTIONS.map((option) => option.value), defaultValue: [] },
      { key: "status", label: "Status", type: "select", options: ["Scheduled", "Completed", "Rescheduled", "Cancelled", "Missed"], defaultValue: "" }
    ]
  }
};

const LEGACY_DEMO_CRM_IDS = new Set([
  "crm_l1",
  "crm_l2",
  "crm_c1",
  "crm_c2",
  "crm_t1",
  "crm_d1",
  "crm_d2",
  "crm_f1",
  "crm_f2",
  "crm_a1",
  "crm_a2",
  "crm_m1",
  "crm_m2",
]);

const PROJECT_TAB_CONFIG = {
  projects: {
    label: "Projects",
    itemLabel: "Project",
    columns: [
      { key: "name", label: "Project Name" },
      { key: "clientCompany", label: "Client / Company" },
      { key: "status", label: "Status" }
    ],
    fields: [
      { key: "name", label: "Project Name", placeholder: "Enter project name" },
      { key: "clientCompany", label: "Client / Company", type: "datalist", datalistSource: "accountsCustomers", placeholder: "Search client or company" },
      { key: "status", label: "Status", type: "select", options: ["Ongoing", "New", "Hold", "Completed"], defaultValue: "New" }
    ]
  },
  tasks: {
    label: "Tasks",
    itemLabel: "Task",
    columns: [
      { key: "title", label: "Task" },
      { key: "assignee", label: "Assign To" },
      { key: "startDate", label: "Start Date" },
      { key: "dueDate", label: "Due Date" }
    ],
    fields: [
      { key: "title", label: "Task", placeholder: "Enter task title" },
      { key: "assignee", label: "Assign To", placeholder: "Search user name" },
      { key: "startDate", label: "Start Date", type: "date" },
      { key: "dueDate", label: "Due Date", type: "date" }
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
  },
  customers: {
    label: "Clients",
    itemLabel: "Client",
    columns: [
      { key: "companyName", label: "Company Name" },
      { key: "clientName", label: "Client Name" },
      { key: "phone", label: "Phone Number" },
      { key: "email", label: "Email ID" }
    ],
    fields: [
      { key: "companyName", label: "Company Name", placeholder: "Enter company name" },
      { key: "clientName", label: "Client Name", placeholder: "Enter client name" },
      { key: "phone", label: "Phone Number", placeholder: "Enter phone number" },
      { key: "email", label: "Email ID", placeholder: "Enter email id" }
    ]
  }
};

const DEFAULT_PROJECT_DATA = {
  projects: [
    { id: "p1", name: "ERP Rollout", clientCompany: "Ultra HD Prints", status: "Ongoing" },
    { id: "p2", name: "HR Automation", clientCompany: "North India Jewels", status: "New" }
  ],
  tasks: [
    { id: "t1", title: "Finalize sprint board", assignee: "Guru", startDate: "2026-02-16", dueDate: "2026-02-20" },
    { id: "t2", title: "Client approval review", assignee: "Arun", startDate: "2026-02-18", dueDate: "2026-02-22" }
  ],
  milestones: [
    { id: "m1", title: "Phase 1 Go-Live", project: "ERP Rollout", targetDate: "2026-03-10" },
    { id: "m2", title: "Payroll Cutover", project: "HR Automation", targetDate: "2026-03-25" }
  ],
  team: [
    { id: "u1", name: "Guru", role: "Project Manager", project: "ERP Rollout" },
    { id: "u2", name: "Nithya", role: "Business Analyst", project: "HR Automation" }
  ],
  customers: [],
  projectDetails: {
    p1: {
      projectId: "p1",
      projectValueEnabled: true,
      projectValue: "450000",
      teams: ["Implementation Team", "Support Team"],
      employees: ["Guru", "Nithya"],
      expenses: [
        { id: "pex_1", title: "Requirement workshop", category: "Travel", amount: "18000", date: "2026-02-19", payee: "Field Team", notes: "Client kickoff travel and stay" },
        { id: "pex_2", title: "Server provisioning", category: "Infrastructure", amount: "42000", date: "2026-02-24", payee: "Cloud Vendor", notes: "Production hosting setup" },
      ],
      notes: "Priority rollout project with phase-wise delivery tracking.",
      updatedAt: "2026-02-24T10:00:00.000Z",
    },
    p2: {
      projectId: "p2",
      projectValueEnabled: false,
      projectValue: "",
      teams: ["HR Operations"],
      employees: ["Guru"],
      expenses: [
        { id: "pex_3", title: "Process discovery", category: "Consulting", amount: "12000", date: "2026-02-25", payee: "Internal Team", notes: "" },
      ],
      notes: "Automation blueprint under approval.",
      updatedAt: "2026-02-25T09:30:00.000Z",
    },
  }
};

const HR_TAB_CONFIG = {
  employees: {
    label: "Employees",
    itemLabel: "Employee",
    columns: [
      { key: "name", label: "Name" },
      { key: "department", label: "Department" },
      { key: "designation", label: "Employee Role" }
    ],
    fields: [
      { key: "name", label: "Name", placeholder: "Select Employee From Created Users" },
      { key: "gender", label: "Gender", type: "select", options: ["Male", "Female", "Other"] },
      { key: "department", label: "Department", placeholder: "Auto From User / Editable" },
      { key: "designation", label: "Employee Role", placeholder: "Auto From User / Editable" },
      { key: "dateOfJoining", label: "Date of Joining", type: "date" },
      { key: "dateOfBirth", label: "Date of Birth", type: "date" },
      { key: "bloodGroup", label: "Blood Group", type: "select", options: ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"] },
      { key: "fatherName", label: "Father's Name", placeholder: "Father's Name" },
      { key: "motherName", label: "Mother's Name", placeholder: "Mother's Name" },
      { key: "photoDataUrl", label: "Employee Photo", type: "imageUpload", optional: true },
      { key: "photoName", label: "Employee Photo Name", optional: true },
      { key: "documentName", label: "Employee Document", type: "documentUpload", optional: true },
      { key: "documentMimeType", label: "Employee Document Type", optional: true },
      { key: "documentSizeLabel", label: "Employee Document Size", optional: true },
      { key: "contactCountryCode", label: "Contact Number", type: "phoneCode", defaultValue: "+91" },
      { key: "contactNumber", label: "Contact Number", placeholder: "Primary Mobile Number", type: "phoneNumber" },
      { key: "secondaryContactCountryCode", label: "Secondary Contact Number", type: "phoneCode", defaultValue: "+91", optional: true },
      { key: "secondaryContactNumber", label: "Secondary Contact Number", placeholder: "Secondary Mobile Number", type: "phoneNumber", optional: true },
      { key: "maritalStatus", label: "Marital Status", type: "select", options: ["Single", "Married", "Divorcee", "Widower"] },
      { key: "wifeName", label: "Spouse Name", placeholder: "Spouse Name", optional: true, conditionalOn: { key: "maritalStatus", value: "Married" } },
      { key: "permanentAddress", label: "Address", placeholder: "Permanent Address", type: "textarea" },
      { key: "permanentCountry", label: "Country", placeholder: "Country", defaultValue: "India" },
      { key: "permanentState", label: "State", placeholder: "State" },
      { key: "permanentCity", label: "City", placeholder: "City" },
      { key: "permanentPincode", label: "Pincode", placeholder: "Pincode" },
      { key: "temporaryAddress", label: "Address", placeholder: "Temporary Address", type: "textarea" },
      { key: "temporaryCountry", label: "Country", placeholder: "Country", defaultValue: "India" },
      { key: "temporaryState", label: "State", placeholder: "State" },
      { key: "temporaryCity", label: "City", placeholder: "City" },
      { key: "temporaryPincode", label: "Pincode", placeholder: "Pincode" }
    ]
  },
  attendance: {
    label: "Attendance",
    itemLabel: "Attendance Entry",
    columns: [
      { key: "employee", label: "Employee" },
      { key: "date", label: "Date" },
      { key: "inTime", label: "In Time" },
      { key: "outTime", label: "Out Time" },
      { key: "workedHours", label: "Worked" },
      { key: "status", label: "Status" }
    ],
    fields: [
      { key: "employee", label: "Employee", placeholder: "Enter employee name" },
      { key: "date", label: "Date", type: "date" },
      { key: "entryMode", label: "Entry Side", type: "select", options: ["HR Side", "User Side"], defaultValue: "HR Side" },
      { key: "inTime", label: "In Time", type: "time" },
      { key: "outTime", label: "Out Time", type: "time" },
      { key: "status", label: "Status", type: "select", options: ["Present", "Half Day", "Leave", "Permission"], defaultValue: "Present" },
      { key: "permissionHours", label: "Permission Hours", placeholder: "e.g. 2", conditionalOn: { key: "status", value: "Permission" } },
      { key: "notes", label: "Notes", placeholder: "Optional notes", optional: true }
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
      { key: "salary", label: "Net Salary", placeholder: "Amount" }
    ]
  },
  salaryStructures: {
    label: "Salary Structures",
    itemLabel: "Salary Structure",
    columns: [],
    fields: [],
  },
  payslips: {
    label: "Payslips",
    itemLabel: "Payslip",
    columns: [],
    fields: [],
  },
  payrollSettings: {
    label: "Payroll Settings",
    itemLabel: "Payroll Settings",
    columns: [],
    fields: [],
  }
};

const DEFAULT_HR_DATA = {
  employees: [
    { id: "e1", name: "Guru", department: "Engineering", designation: "Project Lead" },
    { id: "e2", name: "Nithya", department: "HR", designation: "HR Executive" }
  ],
  attendance: [
    { id: "a1", employee: "Guru", date: "2026-02-19", entryMode: "HR Side", inTime: "09:10", outTime: "18:05", workedHours: "8h 55m", status: "Present", notes: "" },
    { id: "a2", employee: "Nithya", date: "2026-02-19", entryMode: "User Side", inTime: "09:25", outTime: "17:48", workedHours: "8h 23m", status: "Present", notes: "" }
  ],
  leaves: [
    { id: "l1", employee: "Arun", leaveType: "Sick", status: "Pending" },
    { id: "l2", employee: "Kiran", leaveType: "Casual", status: "Approved" }
  ],
  payroll: [
    { id: "pr1", employee: "Guru", month: "2026-02", salary: "85000" },
    { id: "pr2", employee: "Nithya", month: "2026-02", salary: "42000" }
  ],
  salaryStructures: [],
  payslips: [],
  payrollSettings: [],
};

const TICKETING_TAB_CONFIG = {
  mainCategories: {
    label: "Main Category",
    itemLabel: "Main Category",
    columns: [
      { key: "name", label: "Category Name" },
      { key: "department", label: "Department" },
      { key: "sla", label: "SLA" }
    ],
    fields: [
      { key: "name", label: "Category Name", placeholder: "Technical Support / Billing" },
      { key: "department", label: "Department", placeholder: "Support / Accounts / Sales" },
      { key: "sla", label: "SLA", placeholder: "4h / 8h / 24h" }
    ]
  },
  subCategories: {
    label: "Sub Category",
    itemLabel: "Sub Category",
    columns: [
      { key: "name", label: "Sub Category" },
      { key: "mainCategory", label: "Main Category" },
      { key: "priority", label: "Default Priority" }
    ],
    fields: [
      { key: "name", label: "Sub Category", placeholder: "Login Issue / Refund / Installation" },
      { key: "mainCategory", label: "Main Category", placeholder: "Technical Support" },
      { key: "priority", label: "Default Priority", placeholder: "Low / Medium / High" }
    ]
  },
  tickets: {
    label: "Tickets",
    itemLabel: "Ticket",
    columns: [
      { key: "ticketNo", label: "Ticket No" },
      { key: "subject", label: "Subject" },
      { key: "category", label: "Category" },
      { key: "status", label: "Status" }
    ],
    fields: [
      { key: "ticketNo", label: "Ticket No", placeholder: "TK-1001" },
      { key: "clientCompany", label: "Client / Company", type: "datalist", datalistSource: "accountsCustomers", placeholder: "Search client or company" },
      { key: "subject", label: "Subject", placeholder: "Customer login issue" },
      { key: "mainCategory", label: "Category", placeholder: "Select category" },
      { key: "subCategory", label: "Sub Category", placeholder: "Select sub category" },
      { key: "status", label: "Status", type: "select", options: ["Open", "Process", "Hold", "Closed"], defaultValue: "Open" },
      { key: "description", label: "Description", type: "textarea", placeholder: "Ticket description / issue details" }
    ]
  }
};

const DEFAULT_TICKETING_DATA = {
  mainCategories: [
    { id: "tm1", name: "Technical Support", department: "Support", sla: "4h" },
    { id: "tm2", name: "Billing", department: "Accounts", sla: "8h" }
  ],
  subCategories: [
    { id: "ts1", name: "Login Issue", mainCategory: "Technical Support", priority: "High" },
    { id: "ts2", name: "Refund Request", mainCategory: "Billing", priority: "Medium" }
  ],
  tickets: [
    { id: "tt1", ticketNo: "TK-1001", subject: "Customer login issue", mainCategory: "Technical Support", subCategory: "Login Issue", category: "Technical Support / Login Issue", status: "Open", description: "Customer unable to login after password reset." },
    { id: "tt2", ticketNo: "TK-1002", subject: "Refund follow-up", mainCategory: "Billing", subCategory: "Refund Request", category: "Billing / Refund Request", status: "In Progress", description: "Customer requested refund status update." }
  ]
};

const STOCKS_TAB_CONFIG = {
  items: {
    label: "Inventory Items",
    itemLabel: "Inventory Item",
    columns: [
      { key: "itemName", label: "Item Name" },
      { key: "sku", label: "SKU" },
      { key: "mainCategory", label: "Main Category" },
      { key: "subCategory", label: "Sub Category" },
      { key: "qty", label: "Qty" }
    ],
    fields: [
      { key: "itemName", label: "Item Name", placeholder: "Dell Laptop 14" },
      { key: "sku", label: "SKU", placeholder: "DL-14-001" },
      { key: "mainCategory", label: "Main Category", placeholder: "Type / select main category" },
      { key: "subCategory", label: "Sub Category", placeholder: "Type / select sub category" },
      { key: "qty", label: "Qty", placeholder: "25" }
    ]
  },
  mainCategories: {
    label: "Main Category",
    itemLabel: "Main Category",
    columns: [
      { key: "name", label: "Category Name" },
      { key: "code", label: "Code" },
      { key: "warehouse", label: "Warehouse" }
    ],
    fields: [
      { key: "name", label: "Category Name", placeholder: "Electronics / Stationery / Spares" },
      { key: "code", label: "Code", placeholder: "ELEC / STAT / SPR" },
      { key: "warehouse", label: "Warehouse", placeholder: "Main Warehouse" }
    ]
  },
  subCategories: {
    label: "Sub Category",
    itemLabel: "Sub Category",
    columns: [
      { key: "name", label: "Sub Category" },
      { key: "mainCategory", label: "Main Category" },
      { key: "reorderLevel", label: "Reorder Level" }
    ],
    fields: [
      { key: "name", label: "Sub Category", placeholder: "Laptops / Keyboards / Toners" },
      { key: "mainCategory", label: "Main Category", placeholder: "Electronics" },
      { key: "reorderLevel", label: "Reorder Level", placeholder: "10 / 25 / 50" }
    ]
  }
};

const DEFAULT_STOCKS_DATA = {
  mainCategories: [
    { id: "sm1", name: "Electronics", code: "ELEC", warehouse: "Main Warehouse" },
    { id: "sm2", name: "Office Supplies", code: "OFF", warehouse: "Store Room" }
  ],
  subCategories: [
    { id: "ss1", name: "Laptops", mainCategory: "Electronics", reorderLevel: "5" },
    { id: "ss2", name: "Printers", mainCategory: "Electronics", reorderLevel: "3" }
  ],
  items: [
    { id: "si1", itemName: "Dell Latitude 5440", sku: "DL5440", category: "Electronics / Laptops", qty: "12" },
    { id: "si2", itemName: "HP LaserJet Pro", sku: "HPLJPRO", category: "Electronics / Printers", qty: "4" }
  ]
};

const GST_STATUS_OPTIONS = ["Active", "Inactive"];
const ESTIMATE_STATUS_OPTIONS = ["Draft", "Sent", "Approved", "Rejected", "Converted"];
const INVOICE_STATUS_OPTIONS = ["Draft", "Sent", "Partially Paid", "Paid", "Overdue", "Cancelled"];
const INVOICE_PAYMENT_STATUS_OPTIONS = ["Pending", "Partially Paid", "Paid", "Failed", "Refunded"];
const INVOICE_DELIVERY_STATUS_OPTIONS = ["Pending", "Packed", "Shipped", "Completed", "Cancelled"];
const SUBSCRIPTION_STATUS_OPTIONS = ["Active", "Expired", "Cancelled"];
const SUBSCRIPTION_LIST_STATUS_TABS = [
  { key: "all", label: "All" },
  { key: "active", label: "Active" },
  { key: "expired", label: "Expired" },
  { key: "cancelled", label: "Cancelled" },
  { key: "expiring_30", label: "30 Days" },
  { key: "expiring_15", label: "15 Days" },
  { key: "expiring_7", label: "7 Days" }
];
const SUBSCRIPTION_PLAN_DURATION_OPTIONS = [
  { label: "Custom", value: "custom" },
  { label: "1 Month", value: "30" },
  { label: "3 Months", value: "90" },
  { label: "6 Months", value: "180" },
  { label: "1 Year", value: "365" },
  { label: "2 Years", value: "730" },
  { label: "3 Years", value: "1095" }
];
const SUBSCRIPTION_ALERT_OPTIONS = [
  { value: "", label: "Select" },
  { value: "15", label: "15 Days Before" },
  { value: "10", label: "10 Days Before" },
  { value: "7", label: "7 Days Before" },
  { value: "2", label: "2 Days Before" },
  { value: "1", label: "One Day Before" },
  { value: "0", label: "Same day" }
];

const DEFAULT_ACCOUNTS_DATA = {
  customers: [
    {
      id: "cust_1",
      name: "Ultra HD Prints",
      gstin: "33ABCDE1234F1Z5",
      phone: "9876543210",
      email: "accounts@ultrahdprints.example",
      billingAddress: "No 17, 2nd Cross Street, Venkateswara Nagar"
    }
  ],
  itemMasters: [
    {
      id: "itm_1",
      name: "POS Billing Setup",
      itemType: "Service",
      sku: "POS-SETUP",
      hsnSacCode: "998313",
      unit: "Nos",
      defaultRate: "24999",
      taxPercent: "18"
    },
    {
      id: "itm_2",
      name: "Thermal Printer",
      itemType: "Product",
      sku: "THERMAL-PRN",
      hsnSacCode: "844332",
      unit: "Nos",
      defaultRate: "15000",
      taxPercent: "18"
    }
  ],
  gstTemplates: [
    {
      id: "gst_1",
      name: "India GST 18% (Intra State)",
      taxScope: "Intra State",
      cgst: "9",
      sgst: "9",
      igst: "0",
      cess: "0",
      status: "Active",
      notes: "Default GST for local billing"
    },
    {
      id: "gst_2",
      name: "India GST 18% (Inter State)",
      taxScope: "Inter State",
      cgst: "0",
      sgst: "0",
      igst: "18",
      cess: "0",
      status: "Active",
      notes: "Use for interstate billing"
    }
  ],
  billingTemplates: [
    {
      id: "bt_1",
      name: "Default GST Invoice Template",
      docType: "Invoice",
      gstTemplateId: "gst_1",
      prefix: "INV",
      themeColor: "#22c55e",
      footerNote: "Thank you for your business.",
      termsText: "Payment due within 7 days.",
      status: "Active"
    },
    {
      id: "bt_2",
      name: "Estimate Proposal Template",
      docType: "Estimate",
      gstTemplateId: "gst_1",
      prefix: "EST",
      themeColor: "#3b82f6",
      footerNote: "Estimate validity: 15 days.",
      termsText: "Subject to stock availability.",
      status: "Active"
    }
  ],
  estimates: [
    {
      id: "est_1",
      docNo: "EST-1001",
      customerName: "Ultra HD Prints",
      customerGstin: "33ABCDE1234F1Z5",
      issueDate: "2026-02-20",
      dueDate: "2026-02-27",
      status: "Sent",
      gstTemplateId: "gst_1",
      billingTemplateId: "bt_2",
      salesperson: "Guru",
      billingAddress: "No 17, 2nd Cross Street, Venkateswara Nagar",
      notes: "Quote includes installation support.",
      termsText: "Advance 50% before order confirmation.",
      items: [
        { id: "eli_1", description: "Thermal Printer", qty: "2", rate: "15000", taxPercent: "18" },
        { id: "eli_2", description: "Barcode Scanner", qty: "4", rate: "3500", taxPercent: "18" }
      ]
    }
  ],
  invoices: [
    {
      id: "inv_1",
      docNo: "INV-1001",
      customerName: "Ultra HD Prints",
      customerGstin: "33ABCDE1234F1Z5",
      issueDate: "2026-02-24",
      dueDate: "2026-03-03",
      status: "Draft",
      gstTemplateId: "gst_1",
      billingTemplateId: "bt_1",
      salesperson: "Guru",
      billingAddress: "No 17, 2nd Cross Street, Venkateswara Nagar",
      notes: "Thanks for your business.",
      termsText: "Due on receipt.",
      items: [
        { id: "ili_1", description: "POS Billing Setup", qty: "1", rate: "24999", taxPercent: "18" }
      ]
    }
  ]
};

function parseNumber(value) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }
  const raw = String(value ?? "").trim();
  if (!raw) {
    return 0;
  }
  const normalized = raw
    .replace(/,/g, "")
    .replace(/[^\d.-]/g, "");
  if (!normalized || normalized === "-" || normalized === "." || normalized === "-.") {
    return 0;
  }
  const n = Number(normalized);
  return Number.isFinite(n) ? n : 0;
}

function getCurrencyLocale(currencyCode) {
  const code = String(currencyCode || "INR").trim().toUpperCase();
  if (code === "INR") {
    return "en-IN";
  }
  return "en-US";
}

function formatCurrencyNumberInput(rawValue, currencyCode) {
  const numericValue = parseNumber(rawValue);
  if (!String(rawValue ?? "").trim() || numericValue === 0) {
    return String(rawValue ?? "").trim() ? "0" : "";
  }
  const locale = getCurrencyLocale(currencyCode);
  return numericValue.toLocaleString(locale, { maximumFractionDigits: 2 });
}

const CURRENCY_MAX_INTEGER_DIGITS = 10;
const CURRENCY_MAX_DECIMAL_DIGITS = 2;
const AMOUNT_MAX_NUMERIC_VALUE = 9999999999.99;
const AMOUNT_FIELD_KEYS = new Set([
  "amount",
  "leadamount",
  "dealvalueexpected",
  "wonamountfinal",
  "projectvalue",
  "price",
  "tax",
  "rate",
  "cost",
  "dealvalue",
  "wonamount",
]);

function isAmountFieldKey(fieldKey) {
  const key = String(fieldKey || "").trim().toLowerCase();
  if (!key) {
    return false;
  }
  return AMOUNT_FIELD_KEYS.has(key);
}

function sanitizeCurrencyInput(rawValue) {
  const value = String(rawValue ?? "");
  const noSpaces = value.replace(/\s+/g, "").replace(/-/g, "");
  const cleaned = noSpaces.replace(/[^\d.,]/g, "");
  if (!cleaned) {
    return "";
  }

  let normalized = cleaned;
  if (normalized.includes(".")) {
    // Dot is treated as decimal separator; commas are grouping separators.
    normalized = normalized.replace(/,/g, "");
  } else if (normalized.includes(",")) {
    const commaCount = (normalized.match(/,/g) || []).length;
    if (commaCount > 1) {
      // 1,23,456 / 123,456 style grouping
      normalized = normalized.replace(/,/g, "");
    } else {
      const [left = "", right = ""] = normalized.split(",");
      // Single comma with <=2 trailing digits can be decimal input (e.g., 12,5)
      normalized = right.length > 0 && right.length <= CURRENCY_MAX_DECIMAL_DIGITS
        ? `${left}.${right}`
        : `${left}${right}`;
    }
  }

  const parts = normalized.split(".");
  const integerRaw = (parts.shift() || "").replace(/[^\d]/g, "");
  const integerPart = integerRaw.slice(0, CURRENCY_MAX_INTEGER_DIGITS);
  const decimalPart = parts.join("").replace(/[^\d]/g, "").slice(0, CURRENCY_MAX_DECIMAL_DIGITS);
  if (!integerPart && !decimalPart) {
    return "";
  }
  return decimalPart ? `${integerPart || "0"}.${decimalPart}` : (integerPart || "0");
}

function getCurrencySymbol(currencyCode) {
  const code = String(currencyCode || "INR").trim().toUpperCase();
  try {
    const formatted = new Intl.NumberFormat(getCurrencyLocale(code), {
      style: "currency",
      currency: code,
      currencyDisplay: "narrowSymbol",
      maximumFractionDigits: 0,
    }).formatToParts(0);
    const symbolPart = formatted.find((part) => part.type === "currency")?.value || "";
    return symbolPart || code;
  } catch (_error) {
    return code;
  }
}

function formatInr(amount) {
  return formatCurrencyAmount(amount, getOrgCurrency());
}

function gstTemplateTotalPercent(row) {
  return parseNumber(row?.cgst) + parseNumber(row?.sgst) + parseNumber(row?.igst) + parseNumber(row?.cess);
}

function createEmptyDocLine() {
  return {
    id: `line_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    itemMasterId: "",
    inventoryItemId: "",
    description: "",
    qty: "1",
    rate: "",
    taxPercent: ""
  };
}

function createEmptyBillingDocument(kind = "invoice") {
  const prefix = kind === "estimate" ? "EST" : "INV";
  const today = new Date().toISOString().slice(0, 10);
  return {
    id: "",
    docNo: `${prefix}-${Date.now().toString().slice(-6)}`,
    customerName: "",
    customerGstin: "",
    issueDate: today,
    dueDate: today,
    status: "Draft",
    gstTemplateId: "",
    billingTemplateId: "",
    salesperson: "",
    billingAddress: "",
    notes: "Thank you for your business.",
    termsText: "Payment due within 7 days. Please contact your org admin for support.",
    paymentStatus: kind === "invoice" ? "Pending" : "",
    deliveryStatus: kind === "invoice" ? "Pending" : "",
    inventoryCommitted: false,
    items: [createEmptyDocLine()]
  };
}

function createEmptySubscriptionCategory() {
  return {
    id: "",
    name: "",
    description: ""
  };
}

function createEmptySubscriptionSubCategory() {
  return {
    id: "",
    categoryId: "",
    name: "",
    description: ""
  };
}

function getNextBillingDateFromStart(startDate) {
  const normalizedStart = String(startDate || "").trim();
  if (!normalizedStart) {
    return "";
  }
  const date = new Date(`${normalizedStart}T00:00:00`);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  const next = new Date(date.getFullYear(), date.getMonth() + 1, date.getDate());
  if (Number.isNaN(next.getTime())) {
    return "";
  }
  return next.toISOString().slice(0, 10);
}

function getDaysUntilDate(dateValue) {
  const normalizedDate = String(dateValue || "").trim();
  if (!normalizedDate) {
    return null;
  }
  const target = new Date(`${normalizedDate}T00:00:00`);
  if (Number.isNaN(target.getTime())) {
    return null;
  }
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.floor((target.getTime() - today.getTime()) / (24 * 60 * 60 * 1000));
}

function getSubscriptionAlertOptionLabel(value) {
  const normalizedValue = String(value || "").trim();
  return SUBSCRIPTION_ALERT_OPTIONS.find((option) => String(option.value) === normalizedValue)?.label || "";
}

function normalizeSubscriptionAlertAssignees(value) {
  const seen = new Set();
  const normalized = [];
  if (!Array.isArray(value)) {
    return [];
  }
  value.forEach((entry) => {
    if (!entry || typeof entry !== "object") {
      return;
    }
    const type = String(entry.type || "").trim().toLowerCase();
    const recipientValue = String(entry.value || "").trim();
    const recipientLabel = String(entry.label || entry.name || "").trim() || recipientValue;
    if (!type || !recipientValue || !["user", "department"].includes(type)) {
      return;
    }
    const key = `${type}:${recipientValue.toLowerCase()}`;
    if (seen.has(key)) {
      return;
    }
    seen.add(key);
    normalized.push({
      type,
      value: recipientValue,
      label: recipientLabel,
    });
  });
  return normalized;
}

function getSubscriptionAlertAssigneeLabel(assignee = {}) {
  return String(assignee.label || assignee.name || "").trim() || String(assignee.value || "").trim() || "Unknown";
}

function normalizeSubscriptionAlertAssigneeSearch(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizeSubscriptionAlertDays(value) {
  const normalizedValues = [];
  const pushIfValid = (item) => {
    const normalized = String(item || "").trim();
    if (!normalized) {
      return;
    }
    const number = Number(normalized);
    if (Number.isNaN(number) || !Number.isInteger(number) || number < 0) {
      return;
    }
    if (!normalizedValues.includes(normalized)) {
      normalizedValues.push(normalized);
    }
  };
  if (Array.isArray(value)) {
    value.forEach(pushIfValid);
    return normalizedValues;
  }
  if (typeof value === "number") {
    pushIfValid(value);
    return normalizedValues;
  }
  const asString = String(value || "").trim();
  if (!asString) {
    return normalizedValues;
  }
  if (asString.includes(",")) {
    asString
      .split(",")
      .map((item) => item.trim())
      .forEach(pushIfValid);
    return normalizedValues;
  }
  pushIfValid(asString);
  return normalizedValues;
}

function createEmptySubscriptionForm({ currency = "INR" } = {}) {
  const today = new Date().toISOString().slice(0, 10);
  return {
    id: "",
    categoryId: "",
    subCategoryId: "",
    subscriptionTitle: "",
    customerName: "",
    customerId: "",
    planDuration: "30",
    planDurationDays: "",
    paymentDescription: "",
    amount: "",
    currency: String(currency || "INR").trim().toUpperCase() || "INR",
    startDate: today,
    endDate: "",
    nextBillingDate: "",
    status: "Active",
    emailAlertDays: [],
    whatsappAlertDays: [],
    emailAlertAssignees: [],
    whatsappAlertAssignees: []
  };
}

function computeDocumentTotals(doc, gstTemplates) {
  const gstTemplate = (gstTemplates || []).find((row) => row.id === doc.gstTemplateId);
  const defaultTax = gstTemplate ? gstTemplateTotalPercent(gstTemplate) : 0;
  const rows = Array.isArray(doc?.items) ? doc.items : [];
  let subtotal = 0;
  let taxTotal = 0;
  rows.forEach((item) => {
    const qty = parseNumber(item.qty);
    const rate = parseNumber(item.rate);
    const lineAmount = qty * rate;
    const taxPct = parseNumber(item.taxPercent || defaultTax);
    subtotal += lineAmount;
    taxTotal += lineAmount * (taxPct / 100);
  });
  return {
    subtotal,
    taxTotal,
    grandTotal: subtotal + taxTotal
  };
}

function buildEmptyValues(fields) {
  return fields.reduce((acc, field) => {
    if (field.type === "multiselect") {
      acc[field.key] = Array.isArray(field.defaultValue) ? [...field.defaultValue] : [];
    } else if (field.type === "select") {
      const normalizedKey = String(field.key || "").trim().toLowerCase();
      acc[field.key] = normalizedKey === "phonecountrycode" ? "+91" : "";
    } else {
      acc[field.key] = field.defaultValue ?? "";
    }
    return acc;
  }, {});
}

function getCrmMeetingReminderMinuteLabel(value) {
  const normalizedValue = String(value || "").trim();
  return CRM_MEETING_REMINDER_MINUTE_OPTIONS.find((option) => option.value === normalizedValue)?.label || normalizedValue;
}

function parseCrmMeetingReminderMinuteValues(reminderMinutes) {
  const rawValues = Array.isArray(reminderMinutes)
    ? reminderMinutes
    : typeof reminderMinutes === "string"
      ? reminderMinutes.split(",")
      : reminderMinutes === null || reminderMinutes === undefined
        ? []
        : [reminderMinutes];
  const normalized = rawValues
    .map((item) => String(item || "").trim())
    .filter(Boolean)
    .map((item) => {
      const labelMatch = CRM_MEETING_REMINDER_MINUTE_OPTIONS.find((option) => option.label.toLowerCase() === item.toLowerCase());
      if (labelMatch) {
        return labelMatch.value;
      }
      const minutesMatch = item.match(/(\d+)\s*min/i);
      if (minutesMatch) {
        return String(Number(minutesMatch[1]));
      }
      return /^\d+$/.test(item) ? String(Number(item)) : "";
    })
    .filter(Boolean);
  return Array.from(new Set(normalized)).sort((a, b) => Number(a) - Number(b));
}

function parseCrmMeetingReminderDayValues(reminderDays) {
  const rawValues = Array.isArray(reminderDays)
    ? reminderDays
    : typeof reminderDays === "string"
      ? reminderDays.split(",")
      : reminderDays === null || reminderDays === undefined
        ? []
        : [reminderDays];
  const normalized = rawValues
    .map((item) => {
      const value = String(item || "").trim();
      if (!value) {
        return "";
      }
      if (/^same day$/i.test(value)) {
        return "0";
      }
      if (/^1\s*week$/i.test(value)) {
        return "7";
      }
      const dayMatch = value.match(/^(\d+)\s*day/i);
      if (dayMatch) {
        return dayMatch[1];
      }
      return /^\d+$/.test(value) ? value : "";
    })
    .filter(Boolean)
    .map((item) => String(Math.max(0, Number(item))));
  return Array.from(new Set(normalized)).sort((a, b) => Number(a) - Number(b));
}

function formatCrmMeetingReminderDayLabel(dayCountValue, withBefore = false) {
  const dayCount = Number(dayCountValue);
  if (!Number.isFinite(dayCount) || dayCount < 0) {
    return "";
  }
  if (dayCount === 0) {
    return "Same day";
  }
  if (dayCount === 7) {
    return withBefore ? "1 Week before" : "1 Week";
  }
  const base = `${dayCount} Day${dayCount > 1 ? "s" : ""}`;
  return withBefore ? `${base} before` : base;
}

function parseCrmMeetingDateValue(dateValue) {
  const normalizedDate = String(dateValue || "").trim();
  if (!normalizedDate) {
    return null;
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(normalizedDate)) {
    const [year, month, day] = normalizedDate.split("-").map((part) => Number(part));
    const parsed = new Date(year, month - 1, day);
    if (parsed.getFullYear() === year && parsed.getMonth() === month - 1 && parsed.getDate() === day) {
      return parsed;
    }
    return null;
  }
  const slashOrDashMatch = normalizedDate.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/);
  if (slashOrDashMatch) {
    const day = Number(slashOrDashMatch[1]);
    const month = Number(slashOrDashMatch[2]);
    const year = Number(slashOrDashMatch[3]);
    const parsed = new Date(year, month - 1, day);
    if (parsed.getFullYear() === year && parsed.getMonth() === month - 1 && parsed.getDate() === day) {
      return parsed;
    }
    return null;
  }
  const fallback = new Date(normalizedDate);
  if (Number.isNaN(fallback.getTime())) {
    return null;
  }
  return fallback;
}

function getCrmMeetingReminderDayOptions(dateValue) {
  const buildOptions = (maxDays) => {
    const safeMaxDays = Math.max(0, Number(maxDays || 0));
    return Array.from({ length: safeMaxDays + 1 }, (_, index) => {
      const dayCount = index;
      return {
        value: String(dayCount),
        label: formatCrmMeetingReminderDayLabel(dayCount, false),
      };
    });
  };

  const target = parseCrmMeetingDateValue(dateValue);
  if (!target) {
    return buildOptions(7);
  }
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  target.setHours(0, 0, 0, 0);
  const diffDays = Math.floor((target.getTime() - today.getTime()) / (24 * 60 * 60 * 1000));
  if (diffDays < 0) {
    return buildOptions(7);
  }
  return buildOptions(Math.min(Math.max(diffDays, 0), 7));
}

function buildCrmMeetingReminderSummary(reminderChannels, reminderDays, reminderMinutes) {
  const channels = Array.isArray(reminderChannels)
    ? reminderChannels.map((item) => String(item || "").trim()).filter(Boolean)
    : String(reminderChannels || "")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  const parts = [];
  const dayCounts = parseCrmMeetingReminderDayValues(reminderDays);
  if (dayCounts.length) {
    parts.push(dayCounts.map((dayCount) => formatCrmMeetingReminderDayLabel(dayCount, true)).filter(Boolean).join(", "));
  }
  const minuteValues = parseCrmMeetingReminderMinuteValues(reminderMinutes);
  if (minuteValues.length) {
    const minuteLabel = minuteValues
      .map((value) => getCrmMeetingReminderMinuteLabel(value))
      .filter(Boolean)
      .join(", ");
    if (minuteLabel) {
      parts.push(`${minuteLabel} before`);
    }
  }
  return [channels.join(", "), ...parts].filter(Boolean).join(" • ");
}

function formatFileSizeLabel(bytes) {
  const size = Number(bytes || 0);
  if (!Number.isFinite(size) || size <= 0) {
    return "";
  }
  if (size >= 1024 * 1024) {
    return `${(size / (1024 * 1024)).toFixed(2)} MB`;
  }
  return `${Math.max(1, Math.round(size / 1024))} KB`;
}

const PAYROLL_MANAGEMENT_TABS = new Set(["payroll", "salaryStructures", "payslips", "payrollSettings"]);
const FALLBACK_CURRENCY_CODES = [
  "INR", "USD", "EUR", "AED", "SGD", "GBP", "AUD", "CAD", "JPY", "CNY",
  "CHF", "SAR", "QAR", "KWD", "OMR", "BHD", "NZD", "MYR", "THB", "IDR",
  "PHP", "ZAR", "NGN", "KES", "EGP", "TRY", "PLN", "SEK", "NOK", "DKK",
  "HKD", "KRW", "VND", "BRL", "MXN", "ARS", "CLP", "COP", "PKR", "BDT"
];

function getCurrencyCodeOptions() {
  try {
    if (typeof Intl !== "undefined" && typeof Intl.supportedValuesOf === "function") {
      return Array.from(new Set(Intl.supportedValuesOf("currency").map((code) => String(code || "").trim().toUpperCase()).filter(Boolean))).sort();
    }
  } catch (_error) {
    // Fallback below.
  }
  return [...FALLBACK_CURRENCY_CODES];
}

function formatCurrencyAmount(amount, currency = "INR", locale = getCurrencyLocale(currency)) {
  const numericValue = parseNumber(amount);
  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency: String(currency || "INR").trim().toUpperCase(),
      maximumFractionDigits: 2,
    }).format(numericValue);
  } catch (_error) {
    return `${String(currency || "INR").trim().toUpperCase()} ${numericValue.toLocaleString(locale, { maximumFractionDigits: 2 })}`;
  }
}

function createEmptyPayrollOrganizationProfile() {
  return {
    organizationName: "",
    country: "India",
    currency: getOrgCurrency(),
    timezone: "UTC",
  };
}

function createEmptyPayrollSettingsForm() {
  return {
    enablePf: true,
    enableEsi: true,
    pfEmployeePercent: "12.00",
    pfEmployerPercent: "12.00",
    esiEmployeePercent: "0.75",
    esiEmployerPercent: "3.25",
  };
}

function createEmptySalaryStructureForm() {
  return {
    id: "",
    name: "",
    isDefault: false,
    basicSalaryPercent: "40.00",
    hraPercent: "20.00",
    conveyanceFixed: "1600.00",
    autoSpecialAllowance: true,
    basicSalary: "",
    hra: "",
    conveyance: "1600.00",
    specialAllowance: "",
    bonus: "",
    otherAllowances: "",
    applyPf: true,
    applyEsi: true,
    professionalTax: "",
    otherDeduction: "",
    notes: "",
  };
}

function createEmptySalaryHistoryForm(defaultMonth = "") {
  return {
    id: "",
    employeeName: "",
    sourceUserId: "",
    employeeId: "",
    salaryStructureId: "",
    currentSalary: "",
    monthlySalaryAmount: "",
    incrementType: "percentage",
    incrementValue: "",
    effectiveFrom: defaultMonth ? `${defaultMonth}-01` : getTodayIsoDate(),
    incrementAmount: "",
    newSalary: "",
    notes: "",
  };
}

function createEmptyPayrollRunForm() {
  return {
    month: getTodayIsoDate().slice(0, 7),
  };
}

function createEmptyPayrollWorkspaceState() {
  return {
    organizationProfile: createEmptyPayrollOrganizationProfile(),
    payrollSettings: createEmptyPayrollSettingsForm(),
    salaryStructures: [],
    salaryHistory: [],
    payrollEntries: [],
    payslips: [],
    employeeDirectory: [],
    permissions: {
      can_manage_payroll: false,
      can_view_all_payroll: false,
      can_view_salary_history: false,
    },
  };
}

function monthToLabel(value) {
  const month = String(value || "").trim();
  if (!/^\d{4}-\d{2}$/.test(month)) {
    return month || "-";
  }
  const [year, monthNumber] = month.split("-");
  const date = new Date(Number(year), Number(monthNumber) - 1, 1);
  return Number.isNaN(date.getTime()) ? month : date.toLocaleString("en-US", { month: "long", year: "numeric" });
}

const PAYSLIP_MONTH_FILTER_OPTIONS = Array.from({ length: 12 }, (_value, index) => {
  const value = String(index + 1).padStart(2, "0");
  const label = new Date(2026, index, 1).toLocaleString("en-US", { month: "long" });
  return { value, label };
});

function splitPayrollMonthParts(value) {
  const month = String(value || "").trim();
  const match = month.match(/^(\d{4})-(\d{2})$/);
  if (!match) {
    return { year: "", month: "" };
  }
  return {
    year: match[1],
    month: match[2],
  };
}

function buildPayrollEmployeeCode(sourceUserId) {
  const numericUserId = Number.parseInt(String(sourceUserId || "").trim(), 10);
  if (!Number.isFinite(numericUserId) || numericUserId <= 0) {
    return "";
  }
  return `EMP${String(numericUserId).padStart(3, "0")}`;
}

function buildPayrollEmployeeLabel({ employeeName = "", employeeId = "", sourceUserId = "" } = {}) {
  const name = String(employeeName || "").trim();
  const code = String(employeeId || "").trim() || buildPayrollEmployeeCode(sourceUserId);
  if (name && code) {
    return `${name} (${code})`;
  }
  return name || code;
}

function formatIsoDateForDisplay(value) {
  const isoValue = String(value || "").trim();
  const match = isoValue.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) {
    return isoValue || "-";
  }
  return `${match[3]}-${match[2]}-${match[1]}`;
}

function formatDateLikeCellValue(columnKey, value, fallback = "-") {
  const rawValue = String(value || "").trim();
  if (!rawValue) {
    return fallback;
  }
  const normalizedKey = String(columnKey || "").trim().toLowerCase();
  if (!normalizedKey.includes("date")) {
    return rawValue;
  }
  const normalizedDate = normalizeMeetingDateValue(rawValue);
  if (!normalizedDate) {
    return rawValue;
  }
  return formatIsoDateForDisplay(normalizedDate);
}

function payrollEmployeeKey(row = {}) {
  const sourceUserId = String(row.sourceUserId || "").trim();
  if (sourceUserId) {
    return `user:${sourceUserId}`;
  }
  return `name:${String(row.employeeName || row.name || "").trim().toLowerCase()}`;
}

function buildPayrollSlipNumber(month, row, fallbackIndex = 1) {
  const monthPart = String(month || "").replace(/[^0-9]/g, "") || new Date().toISOString().slice(0, 7).replace("-", "");
  const employeePart = String(row.sourceUserId || row.employeeName || fallbackIndex).replace(/[^a-zA-Z0-9]/g, "").slice(0, 10) || String(fallbackIndex);
  return `PS-${monthPart}-${employeePart.toUpperCase()}`;
}

function calculatePayrollFromStructure({
  employeeName,
  sourceUserId,
  payrollMonth,
  structure,
  salaryHistory,
  payrollSettings,
  currency,
}) {
  if (!structure) {
    return null;
  }
  const totalSalary = parseNumber(salaryHistory?.monthlySalaryAmount);
  if (totalSalary <= 0) {
    return null;
  }
  const basicSalary = (totalSalary * parseNumber(structure.basicSalaryPercent || structure.basicSalary)) / 100;
  const hra = (totalSalary * parseNumber(structure.hraPercent || structure.hra)) / 100;
  const conveyance = parseNumber(structure.conveyanceFixed || structure.conveyance);
  const bonus = parseNumber(structure.bonus);
  const otherAllowances = parseNumber(structure.otherAllowances);
  const incrementAmount = parseNumber(salaryHistory?.incrementAmount);
  const remainingSpecialAllowance = totalSalary - basicSalary - hra - conveyance - bonus - otherAllowances;
  const specialAllowance = Boolean(structure.autoSpecialAllowance) ? Math.max(remainingSpecialAllowance, 0) : parseNumber(structure.specialAllowance);
  const grossSalary = totalSalary + incrementAmount;
  const enablePf = Boolean(payrollSettings?.enablePf) && Boolean(structure.applyPf);
  const enableEsi = Boolean(payrollSettings?.enableEsi) && Boolean(structure.applyEsi);
  const pfEmployeeAmount = enablePf ? (basicSalary * parseNumber(payrollSettings?.pfEmployeePercent)) / 100 : 0;
  const pfEmployerAmount = enablePf ? (basicSalary * parseNumber(payrollSettings?.pfEmployerPercent)) / 100 : 0;
  const esiEligible = grossSalary <= 21000 || parseNumber(payrollSettings?.esiEmployeePercent) <= 0;
  const esiEmployeeAmount = enableEsi && esiEligible ? (grossSalary * parseNumber(payrollSettings?.esiEmployeePercent)) / 100 : 0;
  const esiEmployerAmount = enableEsi && esiEligible ? (grossSalary * parseNumber(payrollSettings?.esiEmployerPercent)) / 100 : 0;
  const professionalTaxAmount = parseNumber(structure.professionalTax);
  const otherDeductionAmount = parseNumber(structure.otherDeduction);
  const totalDeductions = pfEmployeeAmount + esiEmployeeAmount + professionalTaxAmount + otherDeductionAmount;
  const netSalary = grossSalary - totalDeductions;
  const earnings = {
    "Basic Salary": basicSalary,
    HRA: hra,
    Conveyance: conveyance,
    "Special Allowance": specialAllowance,
    Bonus: bonus,
    "Other Allowances": otherAllowances,
    Increment: incrementAmount,
  };
  const deductions = {
    PF: pfEmployeeAmount,
    ESI: esiEmployeeAmount,
    "Professional Tax": professionalTaxAmount,
    "Other Deduction": otherDeductionAmount,
  };
  return {
    employeeName,
    sourceUserId: sourceUserId || "",
    month: payrollMonth,
    currency: currency || "INR",
    salaryStructureId: structure.id,
    salaryStructureName: structure.name || "",
    salaryHistoryId: salaryHistory?.id || "",
    monthlySalaryAmount: totalSalary.toFixed(2),
    grossSalary: grossSalary.toFixed(2),
    pfEmployeeAmount: pfEmployeeAmount.toFixed(2),
    pfEmployerAmount: pfEmployerAmount.toFixed(2),
    esiEmployeeAmount: esiEmployeeAmount.toFixed(2),
    esiEmployerAmount: esiEmployerAmount.toFixed(2),
    professionalTaxAmount: professionalTaxAmount.toFixed(2),
    otherDeductionAmount: otherDeductionAmount.toFixed(2),
    totalDeductions: totalDeductions.toFixed(2),
    netSalary: netSalary.toFixed(2),
    earnings,
    deductions,
    status: "processed",
  };
}

function calculateSalaryBreakdownPreview(totalSalaryValue, structure = {}) {
  const totalSalary = parseNumber(totalSalaryValue);
  if (totalSalary <= 0 || !structure) {
    return null;
  }
  const basicSalary = (totalSalary * parseNumber(structure.basicSalaryPercent || structure.basicSalary)) / 100;
  const hra = (totalSalary * parseNumber(structure.hraPercent || structure.hra)) / 100;
  const conveyance = parseNumber(structure.conveyanceFixed || structure.conveyance);
  const bonus = parseNumber(structure.bonus);
  const otherAllowances = parseNumber(structure.otherAllowances);
  const specialAllowance = Boolean(structure.autoSpecialAllowance)
    ? Math.max(totalSalary - basicSalary - hra - conveyance - bonus - otherAllowances, 0)
    : parseNumber(structure.specialAllowance);
  return {
    basicSalary,
    hra,
    conveyance,
    specialAllowance,
    grossSalary: totalSalary,
    netSalary: totalSalary,
  };
}

function calculateSalaryIncrementPreview(currentSalaryValue, incrementType, incrementValue) {
  const currentSalary = parseNumber(currentSalaryValue);
  const normalizedType = String(incrementType || "percentage").trim().toLowerCase();
  const value = parseNumber(incrementValue);
  const incrementAmount = normalizedType === "fixed"
    ? value
    : (currentSalary * value) / 100;
  const newSalary = currentSalary + incrementAmount;
  return {
    currentSalary,
    incrementAmount,
    newSalary,
  };
}

function isValidProjectData(value) {
  return value
    && typeof value === "object"
    && ["projects", "tasks", "milestones", "team"].every((key) => Array.isArray(value[key]))
    && (!("customers" in value) || Array.isArray(value.customers))
    && (!("projectDetails" in value) || (value.projectDetails && typeof value.projectDetails === "object" && !Array.isArray(value.projectDetails)));
}

function createEmptyProjectExpense() {
  return {
    id: "",
    title: "",
    category: "Operations",
    amount: "",
    date: getTodayIsoDate(),
    payee: "",
    notes: "",
    attachmentName: "",
    attachmentType: "",
    attachmentSizeLabel: "",
    attachmentSize: 0,
  };
}

function normalizeProjectExpenseRecord(row = {}) {
  return {
    id: row.id || `pex_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    title: String(row.title || "").trim(),
    category: String(row.category || "Operations").trim() || "Operations",
    amount: String(row.amount || "").trim(),
    date: String(row.date || getTodayIsoDate()).trim() || getTodayIsoDate(),
    payee: String(row.payee || "").trim(),
    notes: String(row.notes || "").trim(),
    attachmentName: String(row.attachmentName || "").trim(),
    attachmentType: String(row.attachmentType || "").trim(),
    attachmentSizeLabel: String(row.attachmentSizeLabel || "").trim(),
    attachmentSize: Number(row.attachmentSize || 0),
  };
}

function createEmptyProjectDetail(projectId = "") {
  return {
    projectId,
    projectValueEnabled: false,
    projectValue: "",
    teams: [],
    employees: [],
    expenses: [],
    notes: "",
    updatedAt: "",
  };
}

function normalizeProjectDetailRecord(row = {}, projectId = "") {
  return {
    ...createEmptyProjectDetail(projectId),
    ...row,
    projectId: String(row.projectId || projectId || "").trim(),
    projectValueEnabled: Boolean(row.projectValueEnabled),
    projectValue: String(row.projectValue || "").trim(),
    teams: Array.from(new Set((Array.isArray(row.teams) ? row.teams : []).map((item) => String(item || "").trim()).filter(Boolean))),
    employees: Array.from(new Set((Array.isArray(row.employees) ? row.employees : []).map((item) => String(item || "").trim()).filter(Boolean))),
    expenses: (Array.isArray(row.expenses) ? row.expenses : []).map((item) => normalizeProjectExpenseRecord(item)),
    notes: String(row.notes || "").trim(),
    updatedAt: String(row.updatedAt || "").trim(),
  };
}

function normalizeProjectData(value) {
  const base = {
    projects: Array.isArray(DEFAULT_PROJECT_DATA.projects) ? [...DEFAULT_PROJECT_DATA.projects] : [],
    tasks: Array.isArray(DEFAULT_PROJECT_DATA.tasks) ? [...DEFAULT_PROJECT_DATA.tasks] : [],
    milestones: Array.isArray(DEFAULT_PROJECT_DATA.milestones) ? [...DEFAULT_PROJECT_DATA.milestones] : [],
    team: Array.isArray(DEFAULT_PROJECT_DATA.team) ? [...DEFAULT_PROJECT_DATA.team] : [],
    customers: Array.isArray(DEFAULT_PROJECT_DATA.customers) ? [...DEFAULT_PROJECT_DATA.customers] : [],
    projectDetails: {},
  };
  if (value && typeof value === "object") {
    if (Array.isArray(value.projects)) base.projects = value.projects;
    if (Array.isArray(value.tasks)) base.tasks = value.tasks;
    if (Array.isArray(value.milestones)) base.milestones = value.milestones;
    if (Array.isArray(value.team)) base.team = value.team;
    if (Array.isArray(value.customers)) base.customers = value.customers;
  }

  const incomingDetails = value && typeof value === "object" && value.projectDetails && typeof value.projectDetails === "object"
    ? value.projectDetails
    : DEFAULT_PROJECT_DATA.projectDetails;

  base.projects.forEach((project) => {
    const projectId = String(project?.id || "").trim();
    if (!projectId) {
      return;
    }
    base.projectDetails[projectId] = normalizeProjectDetailRecord(incomingDetails?.[projectId] || DEFAULT_PROJECT_DATA.projectDetails?.[projectId] || {}, projectId);
  });

  return base;
}

function readProjectWorkspaceData() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return normalizeProjectData(DEFAULT_PROJECT_DATA);
    }
    const parsed = JSON.parse(raw);
    return isValidProjectData(parsed) ? normalizeProjectData(parsed) : normalizeProjectData(DEFAULT_PROJECT_DATA);
  } catch (_error) {
    return normalizeProjectData(DEFAULT_PROJECT_DATA);
  }
}

function isValidHrData(value) {
  return value && typeof value === "object" && Object.keys(HR_TAB_CONFIG).every((key) => Array.isArray(value[key]));
}

function normalizeHrData(value) {
  if (!value || typeof value !== "object") {
    return Object.fromEntries(
      Object.keys(HR_TAB_CONFIG).map((key) => [key, Array.isArray(DEFAULT_HR_DATA[key]) ? [...DEFAULT_HR_DATA[key]] : []])
    );
  }
  const next = {};
  Object.keys(HR_TAB_CONFIG).forEach((key) => {
    next[key] = Array.isArray(value[key]) ? value[key] : [];
  });
  return next;
}

function isValidCrmData(value) {
  return value && typeof value === "object" && Object.keys(CRM_SECTION_CONFIG).every((key) => !value[key] || Array.isArray(value[key]));
}

function parseTeamMemberList(rawMembers) {
  if (Array.isArray(rawMembers)) {
    return rawMembers
      .map((item) => String(item || "").trim())
      .filter(Boolean);
  }
  if (typeof rawMembers === "string") {
    return rawMembers
      .split(/[,;]/)
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [];
}

function normalizeCrmData(value) {
  const base = Object.fromEntries(
    Object.keys(CRM_SECTION_CONFIG).map((key) => [key, []])
  );
  if (!value || typeof value !== "object") {
    return base;
  }
  Object.keys(base).forEach((key) => {
    if (Array.isArray(value[key])) {
      base[key] = key === "leads"
        ? value[key].map((row) => normalizeCrmLeadRecord(row))
        : key === "contacts"
        ? value[key].map((row) => normalizeCrmContactRecord(row))
        : key === "deals"
        ? value[key].map((row) => normalizeCrmDealRecord(row))
        : key === "meetings"
        ? value[key].map((row) => normalizeCrmMeetingRecord(row))
        : key === "teams"
        ? value[key].map((row) => normalizeCrmTeamRecord(row))
        : value[key];
    }
  });
  base.leads = (base.leads || []).map((row) => normalizeCrmLeadRecord(row));
  base.contacts = (base.contacts || []).map((row) => normalizeCrmContactRecord(row));
  base.deals = (base.deals || []).map((row) => normalizeCrmDealRecord(row));
  base.meetings = (base.meetings || []).map((row) => normalizeCrmMeetingRecord(row));
  base.teams = (base.teams || []).map((row) => normalizeCrmTeamRecord(row));
  return base;
}

function buildScopedCrmStorageKey(authData = {}) {
  const userId = String(authData?.user?.id || "").trim();
  const orgId = String(
    authData?.profile?.organization_id
    || authData?.profile?.org_id
    || authData?.profile?.company_id
    || ""
  ).trim();
  const email = String(authData?.user?.email || "").trim().toLowerCase();
  const parts = [orgId, userId, email].filter(Boolean).map((part) =>
    String(part).replace(/[^a-z0-9_.-]/gi, "_")
  );
  if (!parts.length) {
    return CRM_STORAGE_KEY;
  }
  return `${CRM_STORAGE_KEY_PREFIX}__${parts.join("__")}`;
}

function normalizeCrmRoleToken(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
}

function readCrmRoleAccessMapFromStorage() {
  if (typeof window === "undefined") {
    return {};
  }
  try {
    const raw = window.localStorage.getItem(CRM_ROLE_ACCESS_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function resolveCrmRoleAccessRecord(roleAccessMap, profileRole, employeeRole) {
  const safeMap = roleAccessMap && typeof roleAccessMap === "object" ? roleAccessMap : {};
  const normalizedProfileRole = normalizeCrmRoleToken(profileRole);
  const normalizedEmployeeRole = normalizeCrmRoleToken(employeeRole);
  const entries = Object.entries(safeMap).filter(([, value]) => value && typeof value === "object");

  if (normalizedEmployeeRole) {
    for (const [key, value] of entries) {
      const [scope, rawRole] = String(key || "").split(":", 2);
      if (scope === "employee_role" && normalizeCrmRoleToken(rawRole) === normalizedEmployeeRole) {
        return value;
      }
    }
  }
  if (normalizedProfileRole) {
    for (const [key, value] of entries) {
      const [scope, rawRole] = String(key || "").split(":", 2);
      if (scope === "system" && normalizeCrmRoleToken(rawRole) === normalizedProfileRole) {
        return value;
      }
    }
  }
  return null;
}

function isLegacyDemoCrmRow(row = {}) {
  const id = String(row?.id || "").trim().toLowerCase();
  if (id && LEGACY_DEMO_CRM_IDS.has(id)) {
    return true;
  }
  const name = String(row?.name || row?.dealName || row?.title || row?.subject || "").trim().toLowerCase();
  const company = String(row?.company || row?.relatedTo || "").trim().toLowerCase();
  if (!name && !company) {
    return false;
  }
  return (
    (name === "ravi kumar" && company === "ultra hd prints")
    || (name === "priya n" && company === "north india jewels")
    || name === "pos billing setup"
    || name === "whatsapp campaign suite"
  );
}

function stripLegacyDemoCrmData(value) {
  const normalized = normalizeCrmData(value);
  const cleaned = {};
  Object.keys(CRM_SECTION_CONFIG).forEach((key) => {
    const rows = Array.isArray(normalized[key]) ? normalized[key] : [];
    cleaned[key] = rows.filter((row) => !isLegacyDemoCrmRow(row));
  });
  return normalizeCrmData(cleaned);
}

function readCrmDataFromStorage() {
  try {
    const activeKey = String(window.localStorage.getItem(CRM_STORAGE_KEY_ACTIVE) || "").trim();
    if (!activeKey) {
      return normalizeCrmData(null);
    }
    const keysToTry = [activeKey];
    for (const key of keysToTry) {
      const raw = window.localStorage.getItem(key);
      if (!raw) {
        continue;
      }
      const parsed = JSON.parse(raw);
      if (!isValidCrmData(parsed)) {
        continue;
      }
      return stripLegacyDemoCrmData(parsed);
    }
    return normalizeCrmData(null);
  } catch (_error) {
    return normalizeCrmData(null);
  }
}

function normalizeCrmContactTag(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "customer" || normalized === "client") {
    return "Client";
  }
  if (normalized === "prospect") {
    return "Prospect";
  }
  if (normalized === "vendor" || normalized === "vendors") {
    return "Vendor";
  }
  return String(value || "").trim();
}

function normalizeCrmContactRecord(row = {}) {
  return {
    ...row,
    tag: normalizeCrmContactTag(row.tag),
  };
}

function normalizeCrmLeadRecord(row = {}) {
  const leadName = String(row.name || row.lead_name || "").trim();
  const leadAmount = row.leadAmount ?? row.lead_amount ?? "";
  const leadSource = String(row.leadSource || row.lead_source || "").trim();
  const normalizedStatus = String(row.status || "").trim().toLowerCase();
  const status = normalizedStatus === "converted"
    ? "Closed"
    : normalizedStatus === "on hold" || normalizedStatus === "onhold"
      ? "Onhold"
      : String(row.status || "").trim();
  const normalizedAssignType = String(row.assignType || row.assign_type || "").trim().toLowerCase();
  const assignType = normalizedAssignType === "team" ? "Team" : "Users";
  const assignedUser = Array.isArray(row.assignedUser)
    ? row.assignedUser.map((item) => String(item || "").trim()).filter(Boolean)
    : String(
      row.assignedUser
      || row.assigned_user_name
      || (assignType.toLowerCase() !== "team" ? row.assignedTo || "" : "")
    )
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  const assignedTeam = String(
    row.assignedTeam
    || row.assigned_team
    || (assignType.toLowerCase() === "team" ? row.assignedTo || "" : "")
  ).trim();
  return {
    ...row,
    name: leadName,
    contactPerson: String(row.contactPerson || row.contact_person || "").trim(),
    leadAmount: String(leadAmount ?? "").trim(),
    leadSource,
    status,
    statusUpdatedAt: String(row.statusUpdatedAt || row.status_updated_at || "").trim(),
    createdAt: String(row.createdAt || row.created_at || "").trim(),
    updatedAt: String(row.updatedAt || row.updated_at || "").trim(),
    assignType,
    assignedUser,
    assignedTeam,
    assignedTo: String(row.assignedTo || (assignType.toLowerCase() === "team" ? assignedTeam : assignedUser.join(", "))).trim(),
    createdBy: String(row.createdBy || row.created_by_name || row.owner || "").trim(),
  };
}

function normalizeCrmDealRecord(row = {}) {
  const dealName = String(row.dealName || row.deal_name || "").trim();
  const expectedValue = row.dealValueExpected ?? row.deal_value ?? row.dealValue ?? "";
  const wonValue = row.wonAmountFinal ?? row.won_amount_final ?? row.won_amount ?? row.amount ?? "";
  return {
    ...row,
    dealName,
    dealValueExpected: String(expectedValue ?? "").trim(),
    wonAmountFinal: String(wonValue ?? "").trim(),
    assignedTeam: String(row.assignedTeam || row.assigned_team || "").trim(),
    assignedTo: String(row.assignedTo || row.assigned_user_name || row.assigned_team || "").trim(),
    createdBy: String(row.createdBy || row.created_by_name || "").trim(),
  };
}

function normalizeCrmMeetingRecord(row = {}) {
  const reminderChannels = Array.isArray(row.reminderChannel)
    ? row.reminderChannel
    : Array.isArray(row.reminder_channel)
      ? row.reminder_channel
      : typeof row.reminderChannel === "string"
        ? row.reminderChannel.split(",").map((item) => item.trim()).filter(Boolean)
        : [];
  const reminderDays = parseCrmMeetingReminderDayValues(row.reminderDays ?? row.reminder_days);
  const reminderMinutes = parseCrmMeetingReminderMinuteValues(row.reminderMinutes ?? row.reminder_minutes);
  const meetingDate = normalizeMeetingDateValue(row.meetingDate ?? row.meeting_date ?? "");
  const meetingTime = normalizeMeetingTimeValue(row.meetingTime ?? row.meeting_time ?? "");
  return {
    ...row,
    serverMeetingId: row.serverMeetingId || row.id || "",
    title: String(row.title || "").trim(),
    companyOrClientName: String(row.companyOrClientName || row.company_or_client_name || "").trim(),
    relatedTo: String(row.relatedTo || row.related_to || "").trim(),
    meetingDate: meetingDate || "",
    meetingTime: meetingTime || "",
    owner: String(row.owner || "").trim(),
    ownerUserIds: Array.isArray(row.ownerUserIds)
      ? row.ownerUserIds.map((item) => String(item || "").trim()).filter(Boolean)
      : Array.isArray(row.owner_user_ids)
        ? row.owner_user_ids.map((item) => String(item || "").trim()).filter(Boolean)
        : [],
    meetingMode: String(row.meetingMode || row.meeting_mode || "").trim(),
    reminderChannel: reminderChannels,
    reminderDays,
    reminderMinutes,
    reminderSummary: String(
      row.reminderSummary
      || row.reminder_summary
      || buildCrmMeetingReminderSummary(reminderChannels, reminderDays, reminderMinutes)
      || ""
    ).trim(),
    status: String(row.status || "").trim() || "Scheduled",
    isDeleted: Boolean(row.isDeleted || row.is_deleted),
    deletedAt: row.deletedAt || row.deleted_at || "",
  };
}

function normalizeDedupToken(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizePhoneForDedup(countryCode, phone) {
  const code = String(countryCode || "").trim();
  const number = String(phone || "").replace(/\D+/g, "");
  return `${code}|${number}`;
}

function buildCrmImportDedupKey(sectionKey, row = {}) {
  const key = String(sectionKey || "").trim();
  if (key === "leads") {
    return [
      normalizeDedupToken(row.name),
      normalizeDedupToken(row.company),
      normalizePhoneForDedup(row.phoneCountryCode, row.phone),
    ].join("|");
  }
  if (key === "contacts") {
    return [
      normalizeDedupToken(row.name),
      normalizeDedupToken(row.company),
      normalizeDedupToken(row.email),
      normalizePhoneForDedup(row.phoneCountryCode, row.phone),
    ].join("|");
  }
  if (key === "teams") {
    return normalizeDedupToken(row.name);
  }
  if (key === "deals") {
    return [
      normalizeDedupToken(row.dealName),
      normalizeDedupToken(row.company),
      normalizeDedupToken(row.amount),
    ].join("|");
  }
  if (key === "followUps") {
    return [
      normalizeDedupToken(row.subject),
      normalizeDedupToken(row.relatedTo),
      normalizeDedupToken(row.dueDate),
    ].join("|");
  }
  if (key === "meetings") {
    return [
      normalizeDedupToken(row.title),
      normalizeDedupToken(row.relatedTo),
      normalizeDedupToken(row.meetingDate),
      normalizeDedupToken(row.meetingTime),
    ].join("|");
  }
  if (key === "activities") {
    return [
      normalizeDedupToken(row.activityType),
      normalizeDedupToken(row.relatedTo),
      normalizeDedupToken(row.date),
      normalizeDedupToken(row.owner),
    ].join("|");
  }
  return "";
}

function buildCustomerImportDedupKey(row = {}) {
  const company = normalizeDedupToken(row.companyName || row.name);
  const gstin = normalizeDedupToken(row.gstin);
  const primaryPhone = normalizePhoneForDedup(row.phoneCountryCode || "+91", row.phone);
  const primaryEmail = normalizeDedupToken(row.email);
  return [company, gstin, primaryPhone, primaryEmail].join("|");
}

function normalizeCrmTeamRecord(row = {}) {
  const members = Array.isArray(row.members)
    ? row.members.map((item) => String(item || "").trim()).filter(Boolean)
    : String(row.members || "")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  const departmentFilters = Array.isArray(row.departmentFilters)
    ? row.departmentFilters.map((item) => String(item || "").trim()).filter(Boolean)
    : String(row.departmentFilters || "")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  const employeeRoleFilters = Array.isArray(row.employeeRoleFilters)
    ? row.employeeRoleFilters.map((item) => String(item || "").trim()).filter(Boolean)
    : String(row.employeeRoleFilters || "")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  const departmentSummary = departmentFilters.join(", ");
  return {
    ...row,
    members,
    departmentFilters,
    employeeRoleFilters,
    departmentSummary,
    employeeCount: members.length,
    createdBy: String(row.createdBy || "").trim(),
  };
}

function normalizeCrmDirectoryEntry(row = {}) {
  const name = String(row.name || row.employeeName || "").trim();
  if (!name) {
    return null;
  }
  return {
    id: String(row.id || row.sourceUserId || name).trim(),
    name,
    department: String(row.department || "").trim(),
    employeeRole: String(row.employee_role || row.employeeRole || row.designation || "").trim(),
    email: String(row.email || row.sourceUserEmail || "").trim(),
  };
}

function isValidCustomTabData(value, config) {
  return value && typeof value === "object" && Object.keys(config).every((key) => Array.isArray(value[key]));
}

function isValidAccountsData(value) {
  return value
    && typeof value === "object"
    && Array.isArray(value.customers)
    && Array.isArray(value.itemMasters)
    && Array.isArray(value.gstTemplates)
    && Array.isArray(value.billingTemplates)
    && Array.isArray(value.estimates)
    && Array.isArray(value.invoices);
}

function normalizeSharedCustomerRecord(row = {}) {
  const companyName = String(row.companyName || row.name || "").trim();
  const clientName = String(row.clientName || "").trim();
  const primaryPhone = String(row.phone || "").trim();
  const primaryEmail = String(row.email || "").trim();
  const additionalPhones = (Array.isArray(row.additionalPhones) ? row.additionalPhones : [])
    .map((item) => ({
      countryCode: String(item?.countryCode || "+91").trim() || "+91",
      number: String(item?.number || "").trim(),
    }))
    .filter((item) => item.number);
  const additionalEmails = (Array.isArray(row.additionalEmails) ? row.additionalEmails : [])
    .map((item) => String(item || "").trim())
    .filter(Boolean);
  const phoneList = Array.isArray(row.phoneList) && row.phoneList.length
    ? row.phoneList
      .map((item) => ({
        countryCode: String(item?.countryCode || "+91").trim() || "+91",
        number: String(item?.number || "").trim(),
      }))
      .filter((item) => item.number)
    : [
      ...(primaryPhone ? [{ countryCode: String(row.phoneCountryCode || "+91").trim() || "+91", number: primaryPhone }] : []),
      ...additionalPhones,
    ];
  const emailList = Array.isArray(row.emailList) && row.emailList.length
    ? row.emailList.map((item) => String(item || "").trim()).filter(Boolean)
    : [primaryEmail, ...additionalEmails].filter(Boolean);

  return {
    ...row,
    id: row.id || `cust_${Date.now()}`,
    companyName,
    clientName,
    name: companyName || clientName,
    gstin: String(row.gstin || "").trim(),
    phoneCountryCode: String(row.phoneCountryCode || phoneList[0]?.countryCode || "+91").trim() || "+91",
    phone: primaryPhone || phoneList[0]?.number || "",
    additionalPhones: phoneList.slice(1),
    email: primaryEmail || emailList[0] || "",
    additionalEmails: emailList.slice(1),
    phoneList,
    emailList,
    billingAddress: String(row.billingAddress || "").trim(),
    shippingAddress: String(row.shippingAddress || "").trim(),
    billingCountry: String(row.billingCountry || row.country || "India").trim() || "India",
    billingState: String(row.billingState || row.state || "").trim(),
    billingPincode: String(row.billingPincode || row.pincode || "").trim(),
    shippingCountry: String(row.shippingCountry || row.country || "India").trim() || "India",
    shippingState: String(row.shippingState || row.state || "").trim(),
    shippingPincode: String(row.shippingPincode || row.pincode || "").trim(),
    billingShippingSame: Boolean(row.billingShippingSame),
    country: String(row.billingCountry || row.country || "India").trim() || "India",
    state: String(row.billingState || row.state || "").trim(),
    pincode: String(row.billingPincode || row.pincode || "").trim(),
  };
}

function formatSharedCustomerPhones(row = {}) {
  const list = [];
  if (String(row.phone || "").trim()) {
    list.push(`${row.phoneCountryCode || "+91"} ${row.phone}`.trim());
  }
  if (Array.isArray(row.phoneList)) {
    row.phoneList.forEach((item, index) => {
      if (index === 0) return;
      if (String(item?.number || "").trim()) {
        list.push(`${item.countryCode || "+91"} ${item.number}`.trim());
      }
    });
  }
  if (!list.length && Array.isArray(row.additionalPhones)) {
    row.additionalPhones.forEach((item) => {
      if (String(item?.number || "").trim()) {
        list.push(`${item.countryCode || "+91"} ${item.number}`.trim());
      }
    });
  }
  return list.filter(Boolean);
}

function formatSharedCustomerEmails(row = {}) {
  const list = [];
  if (String(row.email || "").trim()) {
    list.push(String(row.email).trim());
  }
  if (Array.isArray(row.emailList)) {
    row.emailList.forEach((item, index) => {
      if (index === 0) return;
      if (String(item || "").trim()) {
        list.push(String(item).trim());
      }
    });
  }
  if (!list.length && Array.isArray(row.additionalEmails)) {
    row.additionalEmails.forEach((item) => {
      if (String(item || "").trim()) {
        list.push(String(item).trim());
      }
    });
  }
  return list.filter(Boolean);
}

function getSharedCustomerDisplayName(row = {}) {
  const companyName = String(row.companyName || row.name || "").trim();
  const clientName = String(row.clientName || "").trim();
  if (companyName && clientName) {
    return `${companyName} / ${clientName}`;
  }
  return companyName || clientName;
}

function readSharedAccountsData() {
  try {
    const raw = window.localStorage.getItem(ACCOUNTS_STORAGE_KEY);
    if (!raw) {
      return DEFAULT_ACCOUNTS_DATA;
    }
    const parsed = JSON.parse(raw);
    return isValidAccountsData(parsed) ? parsed : DEFAULT_ACCOUNTS_DATA;
  } catch (_error) {
    return DEFAULT_ACCOUNTS_DATA;
  }
}

function readSharedAccountsCustomers() {
  return (readSharedAccountsData().customers || []).map((row) => normalizeSharedCustomerRecord(row));
}

function normalizeSharedVendorDisplayName(row = {}) {
  const vendorName = String(
    row.vendorName
      || row.companyName
      || row.name
      || row.contactName
      || row.clientName
      || ""
  ).trim();
  if (!vendorName) {
    return "";
  }
  return vendorName;
}

function readSharedAccountsVendors() {
  const accountData = readSharedAccountsData();
  const rows = Array.isArray(accountData?.vendors) ? accountData.vendors : [];
  return rows
    .map((row) => normalizeSharedVendorDisplayName(row))
    .filter(Boolean);
}

function readSharedCrmContacts() {
  return readCrmDataFromStorage().contacts || [];
}

function readSharedCrmTeams() {
  return (readCrmDataFromStorage().teams || []).map((row) => normalizeCrmTeamRecord(row));
}

function readSharedHrEmployees() {
  try {
    const raw = window.localStorage.getItem(HR_STORAGE_KEY);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed.employees) ? parsed.employees : [];
  } catch (_error) {
    return [];
  }
}

function findDirectoryItemBySourceUser(users = [], sourceUserId = "", fallbackName = "") {
  const normalizedUserId = String(sourceUserId || "").trim();
  const normalizedName = String(fallbackName || "").trim().toLowerCase();
  return (users || []).find((item) => (
    (normalizedUserId && String(item?.id || "").trim() === normalizedUserId)
    || (normalizedName && String(item?.name || "").trim().toLowerCase() === normalizedName)
  )) || null;
}

function splitCombinedPhoneValue(value) {
  const raw = String(value || "").trim();
  if (!raw) {
    return { countryCode: "+91", number: "" };
  }
  const match = raw.match(/^(\+\d{1,4})\s*(.*)$/);
  if (match) {
    return {
      countryCode: String(match[1] || "+91").trim() || "+91",
      number: String(match[2] || "").trim(),
    };
  }
  return { countryCode: "+91", number: raw };
}

function HrPayrollWorkspacePanel({ activeTab, hrEmployees = [] }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState("");
  const [saveError, setSaveError] = useState("");
  const [workspace, setWorkspace] = useState(() => createEmptyPayrollWorkspaceState());
  const [organizationProfileForm, setOrganizationProfileForm] = useState(() => createEmptyPayrollOrganizationProfile());
  const [payrollSettingsForm, setPayrollSettingsForm] = useState(() => createEmptyPayrollSettingsForm());
  const [salaryStructureForm, setSalaryStructureForm] = useState(() => createEmptySalaryStructureForm());
  const [salaryHistoryForm, setSalaryHistoryForm] = useState(() => createEmptySalaryHistoryForm());
  const [payrollRunForm, setPayrollRunForm] = useState(() => createEmptyPayrollRunForm());
  const [payslipFilters, setPayslipFilters] = useState({
    monthPicker: "",
    year: "all",
    month: "all",
    user: "all",
  });
  const [editingStructureId, setEditingStructureId] = useState("");
  const [editingHistoryId, setEditingHistoryId] = useState("");
  const [salaryHistoryEmployeeSearch, setSalaryHistoryEmployeeSearch] = useState("");
  const [salaryHistoryEmployeeResults, setSalaryHistoryEmployeeResults] = useState([]);
  const [salaryHistoryEmployeeSearchOpen, setSalaryHistoryEmployeeSearchOpen] = useState(false);
  const [salaryHistoryEmployeeSearchLoading, setSalaryHistoryEmployeeSearchLoading] = useState(false);
  const [salaryHistoryEmployeeSearchError, setSalaryHistoryEmployeeSearchError] = useState("");
  const [salaryHistoryDetailsModal, setSalaryHistoryDetailsModal] = useState({
    open: false,
    loading: false,
    error: "",
    employeeId: "",
    employeeCode: "",
    employeeName: "",
    rows: [],
  });
  const salaryHistoryEmployeeSearchRequestRef = useRef(0);
  const currencyOptions = useMemo(() => getCurrencyCodeOptions(), []);
  const timezoneOptions = useMemo(() => {
    const fallback = ["Asia/Kolkata", "UTC", "Asia/Dubai", "Asia/Singapore", "Europe/London", "Europe/Berlin", "America/New_York", "America/Chicago", "America/Los_Angeles", "Australia/Sydney"];
    try {
      if (typeof Intl !== "undefined" && typeof Intl.supportedValuesOf === "function") {
        const timeZones = Intl.supportedValuesOf("timeZone");
        return Array.from(new Set([Intl.DateTimeFormat().resolvedOptions().timeZone, ...timeZones, ...fallback].filter(Boolean)));
      }
    } catch (_error) {
      // Fallback below.
    }
    return Array.from(new Set([Intl.DateTimeFormat().resolvedOptions().timeZone, ...fallback].filter(Boolean)));
  }, []);

  const canManagePayroll = Boolean(workspace.permissions?.can_manage_payroll);
  const canViewSalaryHistory = Boolean(workspace.permissions?.can_view_salary_history);
  const canEditSalaryHistory = Boolean(canManagePayroll && canViewSalaryHistory);
  const payrollCurrency = String(workspace.organizationProfile?.currency || getOrgCurrency()).trim().toUpperCase() || getOrgCurrency();

  const employeeOptions = useMemo(() => {
    const map = new Map();
    (hrEmployees || []).forEach((row) => {
      const name = String(row?.name || "").trim();
      if (!name) return;
      const sourceUserId = String(row?.sourceUserId || row?.userId || "").trim();
      const key = sourceUserId ? `user:${sourceUserId}` : `name:${name.toLowerCase()}`;
      if (!map.has(key)) {
        map.set(key, {
          name,
          sourceUserId,
          employeeId: buildPayrollEmployeeCode(sourceUserId),
          department: String(row?.department || "").trim(),
          employeeRole: String(row?.designation || row?.employee_role || "").trim(),
        });
      }
    });
    (workspace.employeeDirectory || []).forEach((row) => {
      const name = String(row?.name || "").trim();
      if (!name) return;
      const sourceUserId = String(row?.id || row?.sourceUserId || "").trim();
      const key = sourceUserId ? `user:${sourceUserId}` : `name:${name.toLowerCase()}`;
      if (!map.has(key)) {
        map.set(key, {
          name,
          sourceUserId,
          employeeId: String(row?.employeeId || "").trim() || buildPayrollEmployeeCode(sourceUserId),
          department: String(row?.department || "").trim(),
          employeeRole: String(row?.employee_role || "").trim(),
        });
      }
    });
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [hrEmployees, workspace.employeeDirectory]);

  const salaryStructuresById = useMemo(
    () => new Map((workspace.salaryStructures || []).map((row) => [String(row.id || ""), row])),
    [workspace.salaryStructures]
  );
  const defaultSalaryStructure = useMemo(
    () => (workspace.salaryStructures || []).find((row) => row.isDefault) || (workspace.salaryStructures || [])[0] || null,
    [workspace.salaryStructures]
  );

  const salaryHistoryByEmployeeKey = useMemo(() => {
    const map = new Map();
    (workspace.salaryHistory || []).forEach((row) => {
      const key = payrollEmployeeKey(row);
      if (!map.has(key)) {
        map.set(key, []);
      }
      map.get(key).push(row);
    });
    map.forEach((rows) => rows.sort((a, b) => String(b.effectiveFrom || "").localeCompare(String(a.effectiveFrom || ""))));
    return map;
  }, [workspace.salaryHistory]);

  const payrollStats = useMemo(() => {
    const entries = workspace.payrollEntries || [];
    const payslips = workspace.payslips || [];
    const totalNet = entries.reduce((sum, row) => sum + parseNumber(row.netSalary), 0);
    return [
      { label: "Payroll Entries", value: String(entries.length), icon: "bi-calculator" },
      { label: "Payslips", value: String(payslips.length), icon: "bi-file-earmark-text" },
      { label: "Net Payout", value: formatCurrencyAmount(totalNet, payrollCurrency), icon: "bi-cash-stack" },
    ];
  }, [payrollCurrency, workspace.payrollEntries, workspace.payslips]);

  const payslipYearOptions = useMemo(() => {
    const years = Array.from(
      new Set(
        (workspace.payslips || [])
          .map((row) => splitPayrollMonthParts(row.generatedForMonth).year)
          .filter(Boolean)
      )
    );
    return years.sort((a, b) => b.localeCompare(a));
  }, [workspace.payslips]);

  const payslipEmployeeOptions = useMemo(() => {
    const map = new Map();
    (workspace.payslips || []).forEach((row) => {
      const employeeName = String(row.employeeName || "").trim();
      const sourceUserId = String(row.sourceUserId || "").trim();
      const key = sourceUserId ? `user:${sourceUserId}` : `name:${employeeName.toLowerCase()}`;
      if (!employeeName || map.has(key)) {
        return;
      }
      map.set(key, {
        key,
        label: buildPayrollEmployeeLabel({
          employeeName,
          employeeId: buildPayrollEmployeeCode(sourceUserId),
          sourceUserId,
        }),
      });
    });
    return Array.from(map.values()).sort((a, b) => a.label.localeCompare(b.label));
  }, [workspace.payslips]);

  const filteredPayslips = useMemo(() => {
    const monthPickerValue = String(payslipFilters.monthPicker || "").trim();
    const selectedYear = String(payslipFilters.year || "all").trim();
    const selectedMonth = String(payslipFilters.month || "all").trim();
    const selectedUser = String(payslipFilters.user || "all").trim();

    return (workspace.payslips || []).filter((row) => {
      const generatedMonth = String(row.generatedForMonth || "").trim();
      const monthParts = splitPayrollMonthParts(generatedMonth);
      const employeeKey = String(row.sourceUserId || "").trim()
        ? `user:${String(row.sourceUserId || "").trim()}`
        : `name:${String(row.employeeName || "").trim().toLowerCase()}`;

      if (monthPickerValue && generatedMonth !== monthPickerValue) {
        return false;
      }
      if (selectedYear !== "all" && monthParts.year !== selectedYear) {
        return false;
      }
      if (selectedMonth !== "all" && monthParts.month !== selectedMonth) {
        return false;
      }
      if (selectedUser !== "all" && employeeKey !== selectedUser) {
        return false;
      }
      return true;
    });
  }, [payslipFilters, workspace.payslips]);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const data = await apiFetch("/api/business-autopilot/payroll/workspace");
        if (!active) return;
        const nextWorkspace = {
          organizationProfile: data?.organization_profile || createEmptyPayrollOrganizationProfile(),
          payrollSettings: data?.payroll_settings || createEmptyPayrollSettingsForm(),
          salaryStructures: Array.isArray(data?.salary_structures) ? data.salary_structures : [],
          salaryHistory: Array.isArray(data?.salary_history) ? data.salary_history : [],
          payrollEntries: Array.isArray(data?.payroll_entries) ? data.payroll_entries : [],
          payslips: Array.isArray(data?.payslips) ? data.payslips : [],
          employeeDirectory: Array.isArray(data?.employee_directory) ? data.employee_directory : [],
          permissions: data?.permissions || { can_manage_payroll: false, can_view_all_payroll: false, can_view_salary_history: false },
        };
        setWorkspace(nextWorkspace);
        setOrganizationProfileForm(nextWorkspace.organizationProfile);
        setPayrollSettingsForm(nextWorkspace.payrollSettings);
        setPayrollRunForm((prev) => ({ ...prev, month: prev.month || createEmptyPayrollRunForm().month }));
      } catch (error) {
        if (!active) return;
        setSaveError(error?.message || "Unable to load payroll workspace.");
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    function refreshRoleAccessFromStorage() {
      setCrmRoleAccessMap(readCrmRoleAccessMapFromStorage());
    }
    window.addEventListener("storage", refreshRoleAccessFromStorage);
    window.addEventListener("focus", refreshRoleAccessFromStorage);
    window.addEventListener("wz:business-autopilot-role-access-changed", refreshRoleAccessFromStorage);
    return () => {
      window.removeEventListener("storage", refreshRoleAccessFromStorage);
      window.removeEventListener("focus", refreshRoleAccessFromStorage);
      window.removeEventListener("wz:business-autopilot-role-access-changed", refreshRoleAccessFromStorage);
    };
  }, []);

  useEffect(() => {
    if (!defaultSalaryStructure) {
      return;
    }
    setSalaryHistoryForm((prev) => (
      prev.salaryStructureId
        ? prev
        : { ...prev, salaryStructureId: String(defaultSalaryStructure.id || "") }
    ));
    setSalaryStructureForm((prev) => (
      prev.id || String(prev.name || "").trim()
        ? prev
        : { ...prev, ...defaultSalaryStructure }
    ));
  }, [defaultSalaryStructure]);

  useEffect(() => {
    const query = String(salaryHistoryEmployeeSearch || "").trim();
    if (!canEditSalaryHistory || !salaryHistoryEmployeeSearchOpen) {
      setSalaryHistoryEmployeeSearchLoading(false);
      setSalaryHistoryEmployeeSearchError("");
      setSalaryHistoryEmployeeResults([]);
      return undefined;
    }
    if (!query) {
      setSalaryHistoryEmployeeSearchLoading(false);
      setSalaryHistoryEmployeeSearchError("");
      setSalaryHistoryEmployeeResults([]);
      return undefined;
    }

    const requestId = salaryHistoryEmployeeSearchRequestRef.current + 1;
    salaryHistoryEmployeeSearchRequestRef.current = requestId;
    const timerId = window.setTimeout(async () => {
      setSalaryHistoryEmployeeSearchLoading(true);
      setSalaryHistoryEmployeeSearchError("");
      try {
        const data = await apiFetch(`/api/employees/search?q=${encodeURIComponent(query)}`);
        if (salaryHistoryEmployeeSearchRequestRef.current !== requestId) {
          return;
        }
        setSalaryHistoryEmployeeResults(Array.isArray(data) ? data : []);
      } catch (error) {
        if (salaryHistoryEmployeeSearchRequestRef.current !== requestId) {
          return;
        }
        setSalaryHistoryEmployeeResults([]);
        setSalaryHistoryEmployeeSearchError(error?.message || "Unable to search employees.");
      } finally {
        if (salaryHistoryEmployeeSearchRequestRef.current === requestId) {
          setSalaryHistoryEmployeeSearchLoading(false);
        }
      }
    }, 250);

    return () => {
      window.clearTimeout(timerId);
    };
  }, [canEditSalaryHistory, salaryHistoryEmployeeSearch, salaryHistoryEmployeeSearchOpen]);

  async function persistWorkspace(nextWorkspace, successText = "Saved successfully.") {
    setSaving(true);
    setSaveError("");
    setSaveMessage("");
    try {
      const data = await apiFetch("/api/business-autopilot/payroll/workspace", {
        method: "PUT",
        body: JSON.stringify({
          organization_profile: nextWorkspace.organizationProfile,
          payroll_settings: nextWorkspace.payrollSettings,
          salary_structures: nextWorkspace.salaryStructures,
          salary_history: nextWorkspace.salaryHistory,
          payroll_entries: nextWorkspace.payrollEntries,
          payslips: nextWorkspace.payslips,
        }),
      });
      const normalized = {
        organizationProfile: data?.organization_profile || createEmptyPayrollOrganizationProfile(),
        payrollSettings: data?.payroll_settings || createEmptyPayrollSettingsForm(),
        salaryStructures: Array.isArray(data?.salary_structures) ? data.salary_structures : [],
        salaryHistory: Array.isArray(data?.salary_history) ? data.salary_history : [],
        payrollEntries: Array.isArray(data?.payroll_entries) ? data.payroll_entries : [],
        payslips: Array.isArray(data?.payslips) ? data.payslips : [],
        employeeDirectory: Array.isArray(data?.employee_directory) ? data.employee_directory : [],
        permissions: data?.permissions || nextWorkspace.permissions || { can_manage_payroll: false, can_view_all_payroll: false, can_view_salary_history: false },
      };
      setWorkspace(normalized);
      setOrganizationProfileForm(normalized.organizationProfile);
      setPayrollSettingsForm(normalized.payrollSettings);
      setSaveMessage(successText);
      return normalized;
    } catch (error) {
      setSaveError(error?.message || "Unable to save payroll workspace.");
      throw error;
    } finally {
      setSaving(false);
    }
  }

  function resetSalaryStructureForm() {
    setEditingStructureId("");
    setSalaryStructureForm(createEmptySalaryStructureForm());
  }

  function resetSalaryHistoryForm() {
    setEditingHistoryId("");
    setSalaryHistoryForm({
      ...createEmptySalaryHistoryForm(payrollRunForm.month),
      salaryStructureId: defaultSalaryStructure?.id ? String(defaultSalaryStructure.id) : "",
    });
    setSalaryHistoryEmployeeSearch("");
    setSalaryHistoryEmployeeResults([]);
    setSalaryHistoryEmployeeSearchOpen(false);
    setSalaryHistoryEmployeeSearchError("");
  }

  async function saveOrganizationProfile(event) {
    event.preventDefault();
    if (!canManagePayroll) return;
    applyOrgCurrency(organizationProfileForm.currency || getOrgCurrency());
    await persistWorkspace(
      {
        ...workspace,
        organizationProfile: {
          ...organizationProfileForm,
          organizationName: String(organizationProfileForm.organizationName || "").trim(),
          country: String(organizationProfileForm.country || "India").trim() || "India",
          currency: String(organizationProfileForm.currency || getOrgCurrency()).trim().toUpperCase() || getOrgCurrency(),
          timezone: String(organizationProfileForm.timezone || "UTC").trim() || "UTC",
        },
      },
      "Organization payroll settings saved."
    );
  }

  async function savePayrollSettings(event) {
    event.preventDefault();
    if (!canManagePayroll) return;
    await persistWorkspace(
      { ...workspace, payrollSettings: payrollSettingsForm },
      "Payroll settings saved."
    );
  }

  async function saveSalaryStructure(event) {
    event.preventDefault();
    if (!canManagePayroll) return;
    if (!String(salaryStructureForm.name || "").trim()) {
      setSaveError("Salary structure name is required.");
      return;
    }
    const payload = {
      ...salaryStructureForm,
      id: editingStructureId || salaryStructureForm.id || "",
      name: String(salaryStructureForm.name || "").trim(),
    };
    if (payload.isDefault) {
      payload.isDefault = true;
    }
    const nextRows = editingStructureId
      ? (workspace.salaryStructures || []).map((row) => (String(row.id) === String(editingStructureId) ? { ...row, ...payload } : (payload.isDefault ? { ...row, isDefault: false } : row)))
      : [{ ...payload, id: `tmp_structure_${Date.now()}` }, ...(workspace.salaryStructures || []).map((row) => (payload.isDefault ? { ...row, isDefault: false } : row))];
    await persistWorkspace({ ...workspace, salaryStructures: nextRows }, editingStructureId ? "Salary structure updated." : "Salary structure created.");
    resetSalaryStructureForm();
  }

  async function deleteSalaryStructure(structureId) {
    if (!canManagePayroll) return;
    const nextRows = (workspace.salaryStructures || []).filter((row) => String(row.id) !== String(structureId));
    await persistWorkspace({ ...workspace, salaryStructures: nextRows }, "Salary structure deleted.");
    if (String(editingStructureId) === String(structureId)) {
      resetSalaryStructureForm();
    }
  }

  async function saveSalaryHistory(event) {
    event.preventDefault();
    if (!canEditSalaryHistory) return;
    if (!String(salaryHistoryForm.employeeName || "").trim() || !String(salaryHistoryForm.salaryStructureId || "").trim()) {
      setSaveError("Employee name and salary structure are required.");
      return;
    }
    if (!String(salaryHistoryForm.sourceUserId || "").trim()) {
      setSaveError("Select an employee from the auto search results.");
      return;
    }
    const payload = {
      ...salaryHistoryForm,
      id: editingHistoryId || salaryHistoryForm.id || "",
      employeeName: String(salaryHistoryForm.employeeName || "").trim(),
      sourceUserId: salaryHistoryForm.sourceUserId || "",
      employeeId: String(salaryHistoryForm.employeeId || "").trim() || buildPayrollEmployeeCode(salaryHistoryForm.sourceUserId),
      currentSalary: salaryHistoryForm.currentSalary || salaryHistoryForm.monthlySalaryAmount || "",
      monthlySalaryAmount: salaryHistoryForm.monthlySalaryAmount || "",
      incrementType: salaryHistoryForm.incrementType || "percentage",
      incrementValue: salaryHistoryForm.incrementValue || "",
      effectiveFrom: salaryHistoryForm.effectiveFrom || getTodayIsoDate(),
      newSalary: salaryHistoryForm.newSalary || salaryHistoryForm.monthlySalaryAmount || "",
    };
    const nextRows = editingHistoryId
      ? (workspace.salaryHistory || []).map((row) => (String(row.id) === String(editingHistoryId) ? { ...row, ...payload } : row))
      : [{ ...payload, id: `tmp_history_${Date.now()}` }, ...(workspace.salaryHistory || [])];
    await persistWorkspace({ ...workspace, salaryHistory: nextRows }, editingHistoryId ? "Salary history updated." : "Salary history created.");
    resetSalaryHistoryForm();
  }

  async function deleteSalaryHistory(historyId) {
    if (!canEditSalaryHistory) return;
    const nextRows = (workspace.salaryHistory || []).filter((row) => String(row.id) !== String(historyId));
    await persistWorkspace({ ...workspace, salaryHistory: nextRows }, "Salary history deleted.");
    if (String(editingHistoryId) === String(historyId)) {
      resetSalaryHistoryForm();
    }
  }

  function selectSalaryHistoryEmployee(employee) {
    const employeeName = String(employee?.name || "").trim();
    const sourceUserId = String(employee?.id || employee?.sourceUserId || "").trim();
    const employeeId = String(employee?.employee_id || employee?.employeeId || "").trim() || buildPayrollEmployeeCode(sourceUserId);
    setSalaryHistoryForm((prev) => ({
      ...prev,
      employeeName,
      sourceUserId,
      employeeId,
    }));
    setSalaryHistoryEmployeeSearch(buildPayrollEmployeeLabel({ employeeName, employeeId, sourceUserId }));
    setSalaryHistoryEmployeeResults([]);
    setSalaryHistoryEmployeeSearchOpen(false);
    setSalaryHistoryEmployeeSearchError("");
  }

  async function openSalaryHistoryDetails(row) {
    if (!canViewSalaryHistory) return;
    const employeeId = String(row?.sourceUserId || "").trim();
    const fallbackEmployeeName = String(row?.employeeName || "").trim();
    const fallbackEmployeeCode = String(row?.employeeId || "").trim() || buildPayrollEmployeeCode(employeeId);
    setSalaryHistoryDetailsModal({
      open: true,
      loading: true,
      error: "",
      employeeId,
      employeeCode: fallbackEmployeeCode,
      employeeName: fallbackEmployeeName,
      rows: [],
    });
    if (!employeeId) {
      setSalaryHistoryDetailsModal((prev) => ({
        ...prev,
        loading: false,
        error: "Employee ID is missing for this salary record.",
      }));
      return;
    }
    try {
      const data = await apiFetch(`/api/hr/employee/${encodeURIComponent(employeeId)}/salary-history/`);
      setSalaryHistoryDetailsModal({
        open: true,
        loading: false,
        error: "",
        employeeId: String(data?.employee_id || employeeId),
        employeeCode: String(data?.employee_code || fallbackEmployeeCode),
        employeeName: String(data?.employee_name || fallbackEmployeeName),
        rows: Array.isArray(data?.history) ? data.history : [],
      });
    } catch (error) {
      setSalaryHistoryDetailsModal((prev) => ({
        ...prev,
        loading: false,
        error: error?.message || "Unable to load salary history.",
      }));
    }
  }

  function closeSalaryHistoryDetailsModal() {
    setSalaryHistoryDetailsModal({
      open: false,
      loading: false,
      error: "",
      employeeId: "",
      employeeCode: "",
      employeeName: "",
      rows: [],
    });
  }

  async function runPayroll(event) {
    event.preventDefault();
    if (!canManagePayroll) return;
    const payrollMonth = String(payrollRunForm.month || "").trim();
    if (!/^\d{4}-\d{2}$/.test(payrollMonth)) {
      setSaveError("Payroll month is required.");
      return;
    }
    const nextEntries = [...(workspace.payrollEntries || [])];
    const nextPayslips = [...(workspace.payslips || [])];

    employeeOptions.forEach((employee, index) => {
      const key = payrollEmployeeKey({
        employeeName: employee.name,
        sourceUserId: employee.sourceUserId,
      });
      const historyRows = salaryHistoryByEmployeeKey.get(key) || salaryHistoryByEmployeeKey.get(`name:${String(employee.name || "").trim().toLowerCase()}`) || [];
      const latestHistory = historyRows.find((row) => String(row.effectiveFrom || "").trim() <= `${payrollMonth}-31`) || historyRows[0];
      const structure = latestHistory ? salaryStructuresById.get(String(latestHistory.salaryStructureId || "")) : null;
      const computed = calculatePayrollFromStructure({
        employeeName: employee.name,
        sourceUserId: employee.sourceUserId,
        payrollMonth,
        structure,
        salaryHistory: latestHistory,
        payrollSettings: workspace.payrollSettings,
        currency: payrollCurrency,
      });
      if (!computed) {
        return;
      }
      const existingIndex = nextEntries.findIndex((row) => (
        String(row.month || "") === payrollMonth
        && payrollEmployeeKey({ employeeName: row.employeeName, sourceUserId: row.sourceUserId }) === payrollEmployeeKey(computed)
      ));
      const existingRow = existingIndex >= 0 ? nextEntries[existingIndex] : null;
      const nextRow = {
        ...existingRow,
        ...computed,
        id: existingRow?.id || `tmp_payroll_${Date.now()}_${index}`,
      };
      if (existingIndex >= 0) {
        nextEntries[existingIndex] = nextRow;
      } else {
        nextEntries.unshift(nextRow);
      }
      const payslipPayload = {
        id: nextPayslips.find((row) => String(row.payrollEntryId || "") === String(nextRow.id || ""))?.id || `tmp_payslip_${Date.now()}_${index}`,
        payrollEntryId: nextRow.id,
        slipNumber: buildPayrollSlipNumber(payrollMonth, nextRow, index + 1),
        generatedForMonth: payrollMonth,
        employeeName: nextRow.employeeName,
        sourceUserId: nextRow.sourceUserId || "",
        currency: payrollCurrency,
      };
      const existingPayslipIndex = nextPayslips.findIndex((row) => (
        String(row.generatedForMonth || "") === payrollMonth
        && payrollEmployeeKey({ employeeName: row.employeeName, sourceUserId: row.sourceUserId }) === payrollEmployeeKey(nextRow)
      ));
      if (existingPayslipIndex >= 0) {
        nextPayslips[existingPayslipIndex] = { ...nextPayslips[existingPayslipIndex], ...payslipPayload };
      } else {
        nextPayslips.unshift(payslipPayload);
      }
    });

    await persistWorkspace(
      { ...workspace, payrollEntries: nextEntries, payslips: nextPayslips },
      `Payroll calculated for ${monthToLabel(payrollMonth)}.`
    );
  }

  async function deletePayrollEntry(entryId) {
    if (!canManagePayroll) return;
    const nextEntries = (workspace.payrollEntries || []).filter((row) => String(row.id) !== String(entryId));
    const nextPayslips = (workspace.payslips || []).filter((row) => String(row.payrollEntryId) !== String(entryId));
    await persistWorkspace({ ...workspace, payrollEntries: nextEntries, payslips: nextPayslips }, "Payroll entry deleted.");
  }

  async function deletePayslip(payslipId) {
    if (!canManagePayroll) return;
    const nextRows = (workspace.payslips || []).filter((row) => String(row.id) !== String(payslipId));
    await persistWorkspace({ ...workspace, payslips: nextRows }, "Payslip deleted.");
  }

  function editSalaryStructure(row) {
    setEditingStructureId(String(row.id || ""));
    setSalaryStructureForm({
      id: row.id || "",
      name: row.name || "",
      isDefault: Boolean(row.isDefault),
      basicSalaryPercent: row.basicSalaryPercent || "",
      hraPercent: row.hraPercent || "",
      conveyanceFixed: row.conveyanceFixed || "",
      autoSpecialAllowance: Boolean(row.autoSpecialAllowance),
      basicSalary: row.basicSalary || "",
      hra: row.hra || "",
      conveyance: row.conveyance || "",
      specialAllowance: row.specialAllowance || "",
      bonus: row.bonus || "",
      otherAllowances: row.otherAllowances || "",
      applyPf: Boolean(row.applyPf),
      applyEsi: Boolean(row.applyEsi),
      professionalTax: row.professionalTax || "",
      otherDeduction: row.otherDeduction || "",
      notes: row.notes || "",
    });
  }

  function editSalaryHistory(row) {
    setEditingHistoryId(String(row.id || ""));
    setSalaryHistoryForm({
      id: row.id || "",
      employeeName: row.employeeName || "",
      sourceUserId: row.sourceUserId || "",
      employeeId: row.employeeId || buildPayrollEmployeeCode(row.sourceUserId),
      salaryStructureId: row.salaryStructureId || "",
      currentSalary: row.currentSalary || row.monthlySalaryAmount || "",
      monthlySalaryAmount: row.monthlySalaryAmount || "",
      incrementType: row.incrementType || "percentage",
      incrementValue: row.incrementValue || "",
      effectiveFrom: row.effectiveFrom || getTodayIsoDate(),
      incrementAmount: row.incrementAmount || "",
      newSalary: row.newSalary || row.monthlySalaryAmount || "",
      notes: row.notes || "",
    });
    setSalaryHistoryEmployeeSearch(buildPayrollEmployeeLabel({
      employeeName: row.employeeName || "",
      employeeId: row.employeeId || buildPayrollEmployeeCode(row.sourceUserId),
      sourceUserId: row.sourceUserId || "",
    }));
    setSalaryHistoryEmployeeResults([]);
    setSalaryHistoryEmployeeSearchOpen(false);
    setSalaryHistoryEmployeeSearchError("");
  }

  function downloadPayslipPdf(payslipId) {
    window.open(`/api/business-autopilot/payroll/payslips/${payslipId}/pdf`, "_blank", "noopener,noreferrer");
  }

  function onPayslipMonthPickerChange(value) {
    const monthValue = String(value || "").trim();
    const monthParts = splitPayrollMonthParts(monthValue);
    setPayslipFilters((prev) => ({
      ...prev,
      monthPicker: monthValue,
      year: monthParts.year || "all",
      month: monthParts.month || "all",
    }));
  }

  function onPayslipYearFilterChange(value) {
    const nextYear = String(value || "all").trim() || "all";
    setPayslipFilters((prev) => ({
      ...prev,
      year: nextYear,
      monthPicker: nextYear !== "all" && prev.month !== "all" ? `${nextYear}-${prev.month}` : "",
    }));
  }

  function onPayslipMonthFilterChange(value) {
    const nextMonth = String(value || "all").trim() || "all";
    setPayslipFilters((prev) => ({
      ...prev,
      month: nextMonth,
      monthPicker: prev.year !== "all" && nextMonth !== "all" ? `${prev.year}-${nextMonth}` : "",
    }));
  }

  function resetPayslipFilters() {
    setPayslipFilters({
      monthPicker: "",
      year: "all",
      month: "all",
      user: "all",
    });
  }

  if (loading) {
    return <div className="card p-3 text-secondary">Loading payroll workspace...</div>;
  }

  const readOnlyNotice = !canManagePayroll ? (
    <div className="card p-3 text-secondary">Payroll is read-only for this account. You can view your payslips here.</div>
  ) : null;
  const salaryHistoryAccessNotice = canManagePayroll && !canViewSalaryHistory ? (
    <div className="card p-3 text-secondary">Salary history is restricted to Org Admin and HR Manager accounts.</div>
  ) : null;
  const openCompanyProfileSettings = () => {
    const basePath = typeof window !== "undefined"
      ? `${window.location.origin}/app/business-autopilot/profile?tab=companyProfile`
      : "/app/business-autopilot/profile?tab=companyProfile";
    window.location.href = basePath;
  };
  const selectedPreviewStructure = salaryStructuresById.get(String(salaryHistoryForm.salaryStructureId || "")) || defaultSalaryStructure;
  const salaryBreakdownPreview = calculateSalaryBreakdownPreview(salaryHistoryForm.monthlySalaryAmount, selectedPreviewStructure);
  const salaryIncrementPreview = calculateSalaryIncrementPreview(
    salaryHistoryForm.currentSalary || salaryHistoryForm.monthlySalaryAmount,
    salaryHistoryForm.incrementType,
    salaryHistoryForm.incrementValue
  );

  if (activeTab === "payrollSettings") {
    return (
      <div className="d-flex flex-column gap-3">
        {readOnlyNotice}
        <div className="row g-3">
          <div className="col-12 col-xl-6">
            <div className="card p-3 h-100">
              <div className="d-flex align-items-center justify-content-between gap-2 mb-3">
                <h6 className="mb-0">Organization Profile</h6>
                {saveMessage ? <span className="small text-success">{saveMessage}</span> : null}
              </div>
              <div className="row g-3">
                <div className="col-12">
                  <div className="small text-secondary mb-1">Company Name</div>
                  <div className="fw-semibold">{organizationProfileForm.organizationName || "-"}</div>
                </div>
                <div className="col-12 col-md-6">
                  <div className="small text-secondary mb-1">Country</div>
                  <div className="fw-semibold">{organizationProfileForm.country || "-"}</div>
                </div>
                <div className="col-12 col-md-6">
                  <div className="small text-secondary mb-1">Currency</div>
                  <div className="fw-semibold">{organizationProfileForm.currency || "-"}</div>
                </div>
                <div className="col-12">
                  <div className="small text-secondary mb-1">Timezone</div>
                  <div className="fw-semibold">{organizationProfileForm.timezone || "-"}</div>
                </div>
              </div>
              <div className="mt-3" style={{ paddingTop: "25px" }}>
                <button type="button" className="btn btn-outline-light btn-sm" onClick={openCompanyProfileSettings}>
                  Edit in Company Profile
                </button>
              </div>
            </div>
          </div>
          <div className="col-12 col-xl-6">
            <div className="card p-3 h-100">
              <h6 className="mb-3">Payroll Settings</h6>
              <form className="d-flex flex-column gap-3" onSubmit={savePayrollSettings}>
                <div className="d-flex flex-wrap gap-3">
                  <label className="form-check-label d-flex align-items-center gap-2">
                    <input type="checkbox" className="form-check-input mt-0" checked={Boolean(payrollSettingsForm.enablePf)} onChange={(e) => setPayrollSettingsForm((prev) => ({ ...prev, enablePf: e.target.checked }))} disabled={!canManagePayroll} />
                    Enable PF
                  </label>
                  <label className="form-check-label d-flex align-items-center gap-2">
                    <input type="checkbox" className="form-check-input mt-0" checked={Boolean(payrollSettingsForm.enableEsi)} onChange={(e) => setPayrollSettingsForm((prev) => ({ ...prev, enableEsi: e.target.checked }))} disabled={!canManagePayroll} />
                    Enable ESI
                  </label>
                </div>
                <div className="row g-3">
                  <div className="col-12 col-md-6">
                    <label className="form-label small text-secondary mb-1">PF Employee %</label>
                    <input className="form-control" value={payrollSettingsForm.pfEmployeePercent || ""} onChange={(e) => setPayrollSettingsForm((prev) => ({ ...prev, pfEmployeePercent: e.target.value }))} disabled={!canManagePayroll || !payrollSettingsForm.enablePf} />
                  </div>
                  <div className="col-12 col-md-6">
                    <label className="form-label small text-secondary mb-1">PF Employer %</label>
                    <input className="form-control" value={payrollSettingsForm.pfEmployerPercent || ""} onChange={(e) => setPayrollSettingsForm((prev) => ({ ...prev, pfEmployerPercent: e.target.value }))} disabled={!canManagePayroll || !payrollSettingsForm.enablePf} />
                  </div>
                  <div className="col-12 col-md-6">
                    <label className="form-label small text-secondary mb-1">ESI Employee %</label>
                    <input className="form-control" value={payrollSettingsForm.esiEmployeePercent || ""} onChange={(e) => setPayrollSettingsForm((prev) => ({ ...prev, esiEmployeePercent: e.target.value }))} disabled={!canManagePayroll || !payrollSettingsForm.enableEsi} />
                  </div>
                  <div className="col-12 col-md-6">
                    <label className="form-label small text-secondary mb-1">ESI Employer %</label>
                    <input className="form-control" value={payrollSettingsForm.esiEmployerPercent || ""} onChange={(e) => setPayrollSettingsForm((prev) => ({ ...prev, esiEmployerPercent: e.target.value }))} disabled={!canManagePayroll || !payrollSettingsForm.enableEsi} />
                  </div>
                </div>
                {canManagePayroll ? <button type="submit" className="btn btn-success btn-sm" disabled={saving}>Save Payroll Settings</button> : null}
              </form>
            </div>
          </div>
        </div>
        {saveError ? <div className="small text-danger">{saveError}</div> : null}
      </div>
    );
  }

  if (activeTab === "salaryStructures") {
    return (
      <div className="d-flex flex-column gap-3">
        {readOnlyNotice}
        {salaryHistoryAccessNotice}
        <div className="row g-3">
          <div className="col-12 col-xl-6">
            <div className="card p-3 h-100">
              <h6 className="mb-3">{editingStructureId ? "Edit Salary Structure" : "Create Salary Structure"}</h6>
              <form className="d-flex flex-column gap-3" onSubmit={saveSalaryStructure}>
                <div className="row g-3">
                  <div className="col-12 col-md-8">
                    <label className="form-label small text-secondary mb-1">Template Name</label>
                    <input className="form-control" value={salaryStructureForm.name || ""} onChange={(e) => setSalaryStructureForm((prev) => ({ ...prev, name: e.target.value }))} disabled={!canManagePayroll} />
                  </div>
                  <div className="col-12 col-md-4 d-flex align-items-end">
                    <label className="form-check-label d-flex align-items-center gap-2 mb-2">
                      <input type="checkbox" className="form-check-input mt-0" checked={Boolean(salaryStructureForm.isDefault)} onChange={(e) => setSalaryStructureForm((prev) => ({ ...prev, isDefault: e.target.checked }))} disabled={!canManagePayroll} />
                      Set as default template
                    </label>
                  </div>
                  {[
                    ["basicSalaryPercent", "Basic Salary %"],
                    ["hraPercent", "HRA %"],
                    ["conveyanceFixed", "Conveyance (Fixed)"],
                    ["bonus", "Bonus"],
                    ["otherAllowances", "Other Allowances"],
                    ["professionalTax", "Professional Tax"],
                    ["otherDeduction", "Other Deduction"],
                  ].map(([key, label]) => (
                    <div className="col-12 col-md-6" key={`salary-structure-${key}`}>
                      <label className="form-label small text-secondary mb-1">{label}</label>
                      <input className="form-control" value={salaryStructureForm[key] || ""} onChange={(e) => setSalaryStructureForm((prev) => ({ ...prev, [key]: e.target.value }))} disabled={!canManagePayroll} />
                    </div>
                  ))}
                  <div className="col-12 col-md-6">
                    <label className="form-label small text-secondary mb-1">Special Allowance</label>
                    <input className="form-control" value={Boolean(salaryStructureForm.autoSpecialAllowance) ? "AUTO (remaining amount)" : (salaryStructureForm.specialAllowance || "")} disabled />
                  </div>
                  <div className="col-12 d-flex flex-wrap gap-3">
                    <label className="form-check-label d-flex align-items-center gap-2">
                      <input type="checkbox" className="form-check-input mt-0" checked={Boolean(salaryStructureForm.applyPf)} onChange={(e) => setSalaryStructureForm((prev) => ({ ...prev, applyPf: e.target.checked }))} disabled={!canManagePayroll} />
                      Apply PF
                    </label>
                    <label className="form-check-label d-flex align-items-center gap-2">
                      <input type="checkbox" className="form-check-input mt-0" checked={Boolean(salaryStructureForm.applyEsi)} onChange={(e) => setSalaryStructureForm((prev) => ({ ...prev, applyEsi: e.target.checked }))} disabled={!canManagePayroll} />
                      Apply ESI
                    </label>
                  </div>
                  <div className="col-12">
                    <label className="form-label small text-secondary mb-1">Notes</label>
                    <input className="form-control" value={salaryStructureForm.notes || ""} onChange={(e) => setSalaryStructureForm((prev) => ({ ...prev, notes: e.target.value }))} disabled={!canManagePayroll} />
                  </div>
                  <div className="col-12">
                    <div className="small text-secondary">Standard split example: Basic 40%, HRA 20%, Conveyance 1600 fixed, Special Allowance auto remaining.</div>
                  </div>
                </div>
                {canManagePayroll ? (
                  <div className="d-flex gap-2">
                    <button type="submit" className="btn btn-success btn-sm" disabled={saving}>{editingStructureId ? "Update" : "Create"}</button>
                    {editingStructureId ? <button type="button" className="btn btn-outline-light btn-sm" onClick={resetSalaryStructureForm}>Cancel</button> : null}
                  </div>
                ) : null}
              </form>
            </div>
          </div>
          <div className="col-12 col-xl-6">
            <div className="card p-3 h-100">
              <h6 className="mb-3">{editingHistoryId ? "Edit Salary History" : "Employee Salary History"}</h6>
              <form className="d-flex flex-column gap-3" onSubmit={saveSalaryHistory}>
                <div className="row g-3">
                  <div className="col-12">
                    <label className="form-label small text-secondary mb-1">Employee</label>
                    <div className="crm-inline-suggestions-wrap">
                      <input
                        type="text"
                        className="form-control"
                        autoComplete="off"
                        placeholder="Search employee name"
                        value={salaryHistoryEmployeeSearch}
                        onFocus={() => {
                          if (canEditSalaryHistory) {
                            setSalaryHistoryEmployeeSearchOpen(true);
                          }
                        }}
                        onClick={() => {
                          if (canEditSalaryHistory) {
                            setSalaryHistoryEmployeeSearchOpen(true);
                          }
                        }}
                        onBlur={() => window.setTimeout(() => setSalaryHistoryEmployeeSearchOpen(false), 120)}
                        onChange={(event) => {
                          const nextValue = event.target.value;
                          setSalaryHistoryEmployeeSearch(nextValue);
                          setSalaryHistoryEmployeeSearchOpen(true);
                          setSalaryHistoryEmployeeSearchError("");
                          setSalaryHistoryForm((prev) => ({
                            ...prev,
                            employeeName: nextValue,
                            sourceUserId: "",
                            employeeId: "",
                          }));
                        }}
                        disabled={!canEditSalaryHistory}
                      />
                      {salaryHistoryEmployeeSearchOpen && String(salaryHistoryEmployeeSearch || "").trim() ? (
                        <div className="crm-inline-suggestions">
                          <div className="crm-inline-suggestions__group">
                            <div className="crm-inline-suggestions__title">Employees</div>
                            {salaryHistoryEmployeeSearchLoading ? (
                              <div className="crm-inline-suggestions__item">
                                <span className="crm-inline-suggestions__item-main">Searching...</span>
                              </div>
                            ) : null}
                            {!salaryHistoryEmployeeSearchLoading && salaryHistoryEmployeeSearchError ? (
                              <div className="crm-inline-suggestions__item">
                                <span className="crm-inline-suggestions__item-main text-danger">{salaryHistoryEmployeeSearchError}</span>
                              </div>
                            ) : null}
                            {!salaryHistoryEmployeeSearchLoading && !salaryHistoryEmployeeSearchError && !salaryHistoryEmployeeResults.length ? (
                              <div className="crm-inline-suggestions__item">
                                <span className="crm-inline-suggestions__item-main">No employees found</span>
                              </div>
                            ) : null}
                            {!salaryHistoryEmployeeSearchLoading && !salaryHistoryEmployeeSearchError ? salaryHistoryEmployeeResults.map((employee) => (
                              <button
                                key={`salary-history-search-${employee.id}`}
                                type="button"
                                className="crm-inline-suggestions__item"
                                onMouseDown={(event) => {
                                  event.preventDefault();
                                  selectSalaryHistoryEmployee(employee);
                                }}
                              >
                                <span className="crm-inline-suggestions__item-main">
                                  {String(employee.name || "").trim() || "-"}
                                </span>
                              </button>
                            )) : null}
                          </div>
                        </div>
                      ) : null}
                    </div>
                    {salaryHistoryForm.sourceUserId ? (
                      <div className="small text-secondary mt-1">
                        Selected: {buildPayrollEmployeeLabel({
                          employeeName: salaryHistoryForm.employeeName,
                          employeeId: salaryHistoryForm.employeeId,
                          sourceUserId: salaryHistoryForm.sourceUserId,
                        })}
                      </div>
                    ) : null}
                  </div>
                  <div className="col-12">
                    <label className="form-label small text-secondary mb-1">Salary Structure</label>
                    <select className="form-select" value={salaryHistoryForm.salaryStructureId || ""} onChange={(e) => setSalaryHistoryForm((prev) => ({ ...prev, salaryStructureId: e.target.value }))} disabled={!canEditSalaryHistory}>
                      <option value="">Select Salary Structure</option>
                      {(workspace.salaryStructures || []).map((row) => (
                        <option key={`salary-structure-option-${row.id}`} value={row.id}>{row.name}{row.isDefault ? " (Default)" : ""}</option>
                      ))}
                    </select>
                  </div>
                  <div className="col-12 col-md-6">
                    <label className="form-label small text-secondary mb-1">Monthly Salary Amount</label>
                    <input
                      className="form-control"
                      value={salaryHistoryForm.monthlySalaryAmount || ""}
                      onChange={(e) => setSalaryHistoryForm((prev) => {
                        const nextValue = e.target.value;
                        const preview = calculateSalaryIncrementPreview(nextValue, prev.incrementType, prev.incrementValue);
                        return {
                          ...prev,
                          currentSalary: nextValue,
                          monthlySalaryAmount: nextValue,
                          incrementAmount: preview.incrementAmount ? preview.incrementAmount.toFixed(2) : "",
                          newSalary: preview.newSalary ? preview.newSalary.toFixed(2) : nextValue,
                        };
                      })}
                      disabled={!canEditSalaryHistory}
                      placeholder="Enter total monthly salary"
                    />
                  </div>
                  <div className="col-12 col-md-6">
                    <label className="form-label small text-secondary mb-1">Effective From</label>
                    <input type="date" className="form-control" value={salaryHistoryForm.effectiveFrom || ""} onChange={(e) => setSalaryHistoryForm((prev) => ({ ...prev, effectiveFrom: e.target.value }))} disabled={!canEditSalaryHistory} />
                  </div>
                  <div className="col-12 col-md-6">
                    <label className="form-label small text-secondary mb-1">Increment Type</label>
                    <select
                      className="form-select"
                      value={salaryHistoryForm.incrementType || "percentage"}
                      onChange={(e) => setSalaryHistoryForm((prev) => {
                        const nextType = e.target.value;
                        const preview = calculateSalaryIncrementPreview(prev.currentSalary || prev.monthlySalaryAmount, nextType, prev.incrementValue);
                        return {
                          ...prev,
                          incrementType: nextType,
                          incrementAmount: preview.incrementAmount ? preview.incrementAmount.toFixed(2) : "",
                          newSalary: preview.newSalary ? preview.newSalary.toFixed(2) : prev.monthlySalaryAmount,
                        };
                      })}
                      disabled={!canEditSalaryHistory}
                    >
                      <option value="percentage">Percentage (%)</option>
                      <option value="fixed">Fixed Amount</option>
                    </select>
                  </div>
                  <div className="col-12 col-md-6">
                    <label className="form-label small text-secondary mb-1">Increment Value</label>
                    <input
                      className="form-control"
                      value={salaryHistoryForm.incrementValue || ""}
                      onChange={(e) => setSalaryHistoryForm((prev) => {
                        const nextValue = e.target.value;
                        const preview = calculateSalaryIncrementPreview(prev.currentSalary || prev.monthlySalaryAmount, prev.incrementType, nextValue);
                        return {
                          ...prev,
                          incrementValue: nextValue,
                          incrementAmount: preview.incrementAmount ? preview.incrementAmount.toFixed(2) : "",
                          newSalary: preview.newSalary ? preview.newSalary.toFixed(2) : prev.monthlySalaryAmount,
                        };
                      })}
                      disabled={!canEditSalaryHistory}
                      placeholder={salaryHistoryForm.incrementType === "fixed" ? "Enter fixed amount" : "Enter percentage"}
                    />
                  </div>
                  <div className="col-12">
                    <label className="form-label small text-secondary mb-1">Notes</label>
                    <input className="form-control" value={salaryHistoryForm.notes || ""} onChange={(e) => setSalaryHistoryForm((prev) => ({ ...prev, notes: e.target.value }))} disabled={!canEditSalaryHistory} />
                  </div>
                  <div className="col-12">
                    <div className="border rounded p-3">
                      <div className="fw-semibold mb-2">Increment Preview</div>
                      <div className="row g-2 small">
                        <div className="col-12 col-md-4">Current Salary: <span className="fw-semibold">{formatCurrencyAmount(salaryIncrementPreview.currentSalary, payrollCurrency)}</span></div>
                        <div className="col-12 col-md-4">Increment Amount: <span className="fw-semibold">{formatCurrencyAmount(salaryIncrementPreview.incrementAmount, payrollCurrency)}</span></div>
                        <div className="col-12 col-md-4">New Salary: <span className="fw-semibold">{formatCurrencyAmount(salaryIncrementPreview.newSalary, payrollCurrency)}</span></div>
                      </div>
                    </div>
                  </div>
                  {salaryBreakdownPreview ? (
                    <div className="col-12">
                      <div className="border rounded p-3">
                        <div className="fw-semibold mb-2">Salary Breakdown</div>
                        <div className="row g-2 small">
                          <div className="col-12 col-md-4">Basic Salary: <span className="fw-semibold">{formatCurrencyAmount(salaryBreakdownPreview.basicSalary, payrollCurrency)}</span></div>
                          <div className="col-12 col-md-4">HRA: <span className="fw-semibold">{formatCurrencyAmount(salaryBreakdownPreview.hra, payrollCurrency)}</span></div>
                          <div className="col-12 col-md-4">Conveyance: <span className="fw-semibold">{formatCurrencyAmount(salaryBreakdownPreview.conveyance, payrollCurrency)}</span></div>
                          <div className="col-12 col-md-6">Special Allowance: <span className="fw-semibold">{formatCurrencyAmount(salaryBreakdownPreview.specialAllowance, payrollCurrency)}</span></div>
                          <div className="col-12 col-md-3">Gross Salary: <span className="fw-semibold">{formatCurrencyAmount(salaryBreakdownPreview.grossSalary, payrollCurrency)}</span></div>
                          <div className="col-12 col-md-3">Net Salary: <span className="fw-semibold">{formatCurrencyAmount(salaryBreakdownPreview.netSalary, payrollCurrency)}</span></div>
                        </div>
                      </div>
                    </div>
                  ) : null}
                </div>
                {canEditSalaryHistory ? (
                  <div className="d-flex gap-2">
                    <button type="submit" className="btn btn-success btn-sm" disabled={saving}>{editingHistoryId ? "Update" : "Create"}</button>
                    {editingHistoryId ? <button type="button" className="btn btn-outline-light btn-sm" onClick={resetSalaryHistoryForm}>Cancel</button> : null}
                  </div>
                ) : null}
              </form>
            </div>
          </div>
        </div>
        <SearchablePaginatedTableCard
          title="Salary Structure Templates"
          badgeLabel={`${(workspace.salaryStructures || []).length} items`}
          rows={workspace.salaryStructures || []}
          columns={[
            { key: "name", label: "Template" },
            { key: "split", label: "Auto Split" },
            { key: "professionalTax", label: "Professional Tax" },
            { key: "otherDeduction", label: "Other Deduction" },
          ]}
          searchPlaceholder="Search salary structures"
          noRowsText="No salary structures yet."
          searchBy={(row) => [row.name, row.notes].join(" ")}
          renderCells={(row) => [
            <span className="fw-semibold">{row.name}{row.isDefault ? " (Default)" : ""}</span>,
            `${parseNumber(row.basicSalaryPercent || 0)}% / ${parseNumber(row.hraPercent || 0)}% / ${formatCurrencyAmount(row.conveyanceFixed || 0, payrollCurrency)}`,
            formatCurrencyAmount(row.professionalTax, payrollCurrency),
            formatCurrencyAmount(row.otherDeduction, payrollCurrency),
          ]}
          renderActions={(row) => canManagePayroll ? (
            <div className="d-inline-flex gap-2">
              <button type="button" className="btn btn-sm btn-outline-info" onClick={() => editSalaryStructure(row)}>Edit</button>
              <button type="button" className="btn btn-sm btn-outline-danger" onClick={() => deleteSalaryStructure(row.id)}>Delete</button>
            </div>
          ) : null}
        />
        <SearchablePaginatedTableCard
          title="Salary History"
          badgeLabel={`${(workspace.salaryHistory || []).length} items`}
          rows={workspace.salaryHistory || []}
          columns={[
            { key: "employeeName", label: "Employee" },
            { key: "monthlySalaryAmount", label: "Monthly Salary" },
            { key: "incrementType", label: "Increment Type" },
            { key: "incrementValue", label: "Increment Value" },
            { key: "salaryStructureName", label: "Salary Structure" },
            { key: "effectiveFrom", label: "Effective From" },
            { key: "incrementAmount", label: "Increment Amount" },
            { key: "newSalary", label: "New Salary" },
          ]}
          searchPlaceholder="Search salary history"
          noRowsText="No salary history yet."
          searchBy={(row) => [row.employeeName, row.salaryStructureName, row.effectiveFrom, row.notes].join(" ")}
          renderCells={(row) => [
            <span className="fw-semibold">
              {buildPayrollEmployeeLabel({
                employeeName: row.employeeName,
                employeeId: row.employeeId,
                sourceUserId: row.sourceUserId,
              }) || "-"}
            </span>,
            formatCurrencyAmount(row.monthlySalaryAmount, payrollCurrency),
            row.incrementType === "fixed" ? "Fixed Amount" : "Percentage (%)",
            row.incrementType === "fixed" ? formatCurrencyAmount(row.incrementValue, payrollCurrency) : `${parseNumber(row.incrementValue).toFixed(2)}%`,
            row.salaryStructureName || salaryStructuresById.get(String(row.salaryStructureId || ""))?.name || "-",
            formatIsoDateForDisplay(row.effectiveFrom),
            formatCurrencyAmount(row.incrementAmount, payrollCurrency),
            formatCurrencyAmount(row.newSalary, payrollCurrency),
          ]}
          renderActions={(row) => canViewSalaryHistory ? (
            <div className="d-inline-flex gap-2">
              {canEditSalaryHistory ? <button type="button" className="btn btn-sm btn-outline-info" onClick={() => editSalaryHistory(row)}>Edit</button> : null}
              {canEditSalaryHistory ? <button type="button" className="btn btn-sm btn-outline-danger" onClick={() => deleteSalaryHistory(row.id)}>Delete</button> : null}
              <button type="button" className="btn btn-sm btn-outline-primary" onClick={() => openSalaryHistoryDetails(row)}>Details</button>
            </div>
          ) : null}
        />
        {salaryHistoryDetailsModal.open ? (
          <div
            role="dialog"
            aria-modal="true"
            className="position-fixed top-0 start-0 w-100 h-100 d-flex align-items-center justify-content-center"
            style={{ background: "rgba(0,0,0,0.65)", zIndex: 1050, padding: "1rem" }}
            onClick={closeSalaryHistoryDetailsModal}
          >
            <div
              className="card p-3"
              style={{ width: "min(980px, 100%)" }}
              onClick={(event) => event.stopPropagation()}
            >
              <div className="d-flex align-items-start justify-content-between gap-3 mb-3">
                <div>
                  <h5 className="mb-1">Employee Salary History</h5>
                  <div className="small text-secondary">
                    {buildPayrollEmployeeLabel({
                      employeeName: salaryHistoryDetailsModal.employeeName,
                      employeeId: salaryHistoryDetailsModal.employeeCode,
                      sourceUserId: salaryHistoryDetailsModal.employeeId,
                    }) || "-"} - Salary Increment History
                  </div>
                </div>
                <button type="button" className="btn btn-sm btn-outline-light" onClick={closeSalaryHistoryDetailsModal}>
                  <i className="bi bi-x-lg" aria-hidden="true" />
                </button>
              </div>
              {salaryHistoryDetailsModal.loading ? (
                <div className="text-secondary">Loading salary history...</div>
              ) : salaryHistoryDetailsModal.error ? (
                <div className="text-danger small">{salaryHistoryDetailsModal.error}</div>
              ) : (
                <div className="table-responsive border rounded" style={{ maxHeight: "360px", overflowY: "auto" }}>
                  <table className="table table-sm align-middle mb-0">
                    <thead className="table-dark position-sticky top-0">
                      <tr>
                        <th>Effective Date</th>
                        <th>Previous Salary</th>
                        <th>Increment Type</th>
                        <th>Increment Value</th>
                        <th>Increment Amount</th>
                        <th>New Salary</th>
                      </tr>
                    </thead>
                    <tbody>
                      {salaryHistoryDetailsModal.rows.length ? salaryHistoryDetailsModal.rows.map((historyRow) => {
                        const incrementValue = parseNumber(historyRow.incrementValue);
                        const incrementAmount = parseNumber(historyRow.incrementAmount);
                        const isInitialSalary = incrementValue <= 0 && incrementAmount <= 0;
                        const incrementValueLabel = Number.isInteger(incrementValue)
                          ? String(incrementValue)
                          : incrementValue.toFixed(2);
                        return (
                          <tr key={`salary-history-detail-${historyRow.id}`}>
                            <td>{formatIsoDateForDisplay(historyRow.effectiveDate)}</td>
                            <td>{formatCurrencyAmount(historyRow.previousSalary, payrollCurrency)}</td>
                            <td>
                              {isInitialSalary
                                ? "-"
                                : historyRow.incrementType === "fixed"
                                  ? formatCurrencyAmount(historyRow.incrementValue, payrollCurrency)
                                  : `${parseNumber(historyRow.incrementValue).toFixed(2)}%`}
                            </td>
                            <td>{isInitialSalary ? "-" : incrementValueLabel}</td>
                            <td>{isInitialSalary ? "-" : formatCurrencyAmount(historyRow.incrementAmount, payrollCurrency)}</td>
                            <td>{formatCurrencyAmount(historyRow.newSalary, payrollCurrency)}</td>
                          </tr>
                        );
                      }) : (
                        <tr>
                          <td colSpan={6} className="text-center text-secondary py-4">No salary increment history found.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}
              <div className="mt-3" style={{ paddingTop: "25px" }}>
                <button type="button" className="btn btn-outline-light btn-sm" onClick={closeSalaryHistoryDetailsModal}>Close</button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    );
  }

  if (activeTab === "payslips") {
    return (
      <div className="d-flex flex-column gap-3">
        {saveError ? <div className="small text-danger">{saveError}</div> : null}
        <SearchablePaginatedTableCard
          title="Payslips"
          badgeLabel={`${filteredPayslips.length}/${(workspace.payslips || []).length} items`}
          rows={filteredPayslips}
          columns={[
            { key: "slipNumber", label: "Slip Number" },
            { key: "employeeName", label: "Employee" },
            { key: "generatedForMonth", label: "Month" },
            { key: "currency", label: "Currency" },
            { key: "generatedAt", label: "Generated At" },
          ]}
          headerBottom={(
            <div className="row g-2">
              <div className="col-12 col-md-3">
                <label className="form-label small text-secondary mb-1">Month Picker</label>
                <input
                  type="month"
                  className="form-control"
                  value={payslipFilters.monthPicker}
                  onChange={(event) => onPayslipMonthPickerChange(event.target.value)}
                />
              </div>
              <div className="col-6 col-md-2">
                <label className="form-label small text-secondary mb-1">Year</label>
                <select
                  className="form-select"
                  value={payslipFilters.year}
                  onChange={(event) => onPayslipYearFilterChange(event.target.value)}
                >
                  <option value="all">All Years</option>
                  {payslipYearOptions.map((year) => (
                    <option key={`payslip-year-${year}`} value={year}>{year}</option>
                  ))}
                </select>
              </div>
              <div className="col-6 col-md-2">
                <label className="form-label small text-secondary mb-1">Month</label>
                <select
                  className="form-select"
                  value={payslipFilters.month}
                  onChange={(event) => onPayslipMonthFilterChange(event.target.value)}
                >
                  <option value="all">All Months</option>
                  {PAYSLIP_MONTH_FILTER_OPTIONS.map((option) => (
                    <option key={`payslip-month-${option.value}`} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </div>
              <div className="col-12 col-md-3">
                <label className="form-label small text-secondary mb-1">User</label>
                <select
                  className="form-select"
                  value={payslipFilters.user}
                  onChange={(event) => setPayslipFilters((prev) => ({ ...prev, user: event.target.value }))}
                >
                  <option value="all">All Users</option>
                  {payslipEmployeeOptions.map((option) => (
                    <option key={`payslip-user-${option.key}`} value={option.key}>{option.label}</option>
                  ))}
                </select>
              </div>
              <div className="col-12 col-md-2 d-flex align-items-end">
                <button type="button" className="btn btn-outline-light btn-sm w-100" onClick={resetPayslipFilters}>
                  Reset Filters
                </button>
              </div>
            </div>
          )}
          searchPlaceholder="Search payslips"
          noRowsText={(workspace.payslips || []).length ? "No payslips match the selected filters." : "No payslips generated yet."}
          searchBy={(row) => [
            row.slipNumber,
            row.employeeName,
            buildPayrollEmployeeCode(row.sourceUserId),
            row.generatedForMonth,
            monthToLabel(row.generatedForMonth),
            row.currency,
          ].join(" ")}
          renderCells={(row) => [
            <span className="fw-semibold">{row.slipNumber || "-"}</span>,
            <div>
              <div>{row.employeeName || "-"}</div>
              <div className="small text-secondary">{buildPayrollEmployeeCode(row.sourceUserId) || "-"}</div>
            </div>,
            monthToLabel(row.generatedForMonth),
            row.currency || payrollCurrency,
            row.generatedAt ? new Date(row.generatedAt).toLocaleString() : "-",
          ]}
          renderActions={(row) => (
            <div className="d-inline-flex gap-2">
              <button type="button" className="btn btn-sm btn-outline-success" onClick={() => downloadPayslipPdf(row.id)}>PDF</button>
              {canManagePayroll ? <button type="button" className="btn btn-sm btn-outline-danger" onClick={() => deletePayslip(row.id)}>Delete</button> : null}
            </div>
          )}
        />
      </div>
    );
  }

  return (
    <div className="d-flex flex-column gap-3">
      {readOnlyNotice}
      <div className="row g-3">
        {payrollStats.map((item) => (
          <div className="col-12 col-md-4" key={item.label}>
            <div className="card p-3 h-100 d-flex flex-column align-items-center justify-content-center text-center">
              <div className="stat-icon stat-icon-primary mb-2">
                <i className={`bi ${item.icon}`} aria-hidden="true" />
              </div>
              <div className="text-secondary small">{item.label}</div>
              <h5 className="mb-0 mt-1">{item.value}</h5>
            </div>
          </div>
        ))}
      </div>
	            <div className="card p-3">
        <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-3">
          <div>
            <h6 className="mb-1">Run Payroll</h6>
            <p className="text-secondary mb-0">Select month, fetch employees, and calculate salary using latest structure + payroll settings.</p>
          </div>
          {saveMessage ? <span className="small text-success">{saveMessage}</span> : null}
        </div>
        <form className="row g-3 align-items-end" onSubmit={runPayroll}>
          <div className="col-12 col-md-4">
            <label className="form-label small text-secondary mb-1">Month</label>
            <input type="month" className="form-control" value={payrollRunForm.month || ""} onChange={(e) => setPayrollRunForm((prev) => ({ ...prev, month: e.target.value }))} disabled={!canManagePayroll} />
          </div>
          <div className="col-12 col-md-4">
            <div className="small text-secondary mb-1">Employees Fetched</div>
            <div className="fw-semibold">{employeeOptions.length}</div>
          </div>
          <div className="col-12 col-md-4 d-flex gap-2">
            {canManagePayroll ? <button type="submit" className="btn btn-success btn-sm" disabled={saving}>Calculate Salary</button> : null}
            <button type="button" className="btn btn-outline-light btn-sm" onClick={() => setPayrollRunForm(createEmptyPayrollRunForm())}>Reset</button>
          </div>
        </form>
      </div>
      {saveError ? <div className="small text-danger">{saveError}</div> : null}
      <SearchablePaginatedTableCard
        title="Payroll Entries"
        badgeLabel={`${(workspace.payrollEntries || []).length} items`}
        rows={workspace.payrollEntries || []}
        columns={[
          { key: "employeeName", label: "Employee" },
          { key: "month", label: "Month" },
          { key: "grossSalary", label: "Gross" },
          { key: "totalDeductions", label: "Deductions" },
          { key: "netSalary", label: "Net Salary" },
          { key: "status", label: "Status" },
        ]}
        searchPlaceholder="Search payroll"
        noRowsText="No payroll entries yet."
        searchBy={(row) => [row.employeeName, row.month, row.status, row.salaryStructureName].join(" ")}
        renderCells={(row) => [
          <span className="fw-semibold">{row.employeeName || "-"}</span>,
          monthToLabel(row.month),
          formatCurrencyAmount(row.grossSalary, row.currency || payrollCurrency),
          formatCurrencyAmount(row.totalDeductions, row.currency || payrollCurrency),
          formatCurrencyAmount(row.netSalary, row.currency || payrollCurrency),
          row.status || "processed",
        ]}
        renderActions={(row) => (
          <div className="d-inline-flex gap-2">
            {row.slipNumber ? (
              <button
                type="button"
                className="btn btn-sm btn-outline-success"
                onClick={() => {
                  const payslip = (workspace.payslips || []).find((item) => String(item.payrollEntryId) === String(row.id));
                  if (payslip) {
                    downloadPayslipPdf(payslip.id);
                  }
                }}
              >
                Payslip
              </button>
            ) : null}
            {canManagePayroll ? <button type="button" className="btn btn-sm btn-outline-danger" onClick={() => deletePayrollEntry(row.id)}>Delete</button> : null}
          </div>
        )}
      />
    </div>
  );
}

async function persistSharedAccountsCustomers(nextCustomers) {
  const currentData = readSharedAccountsData();
  const nextData = {
    ...currentData,
    customers: nextCustomers.map((row) => normalizeSharedCustomerRecord(row)),
  };
  window.localStorage.setItem(ACCOUNTS_STORAGE_KEY, JSON.stringify(nextData));
  try {
    await apiFetch("/api/business-autopilot/accounts/workspace", {
      method: "PUT",
      body: JSON.stringify({ data: nextData }),
    });
  } catch (_error) {
    // Keep local cache updated even if server sync fails.
  }
}

function formatTimeToAmPm(value) {
  const raw = String(value || "").trim();
  if (!raw) {
    return "-";
  }
  const match = raw.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) {
    return raw;
  }
  let hours = Number(match[1]);
  const minutes = match[2];
  if (!Number.isFinite(hours)) {
    return raw;
  }
  const suffix = hours >= 12 ? "PM" : "AM";
  hours = hours % 12 || 12;
  return `${hours}:${minutes} ${suffix}`;
}

function normalizeMeetingTimeValue(value) {
  const raw = String(value || "").trim();
  if (!raw) {
    return "";
  }
  const hmMatch = raw.match(/^(\d{1,2}):(\d{2})$/);
  if (hmMatch) {
    const hours = Number(hmMatch[1]);
    const minutes = Number(hmMatch[2]);
    if (Number.isFinite(hours) && Number.isFinite(minutes) && hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59) {
      return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
    }
    return raw;
  }
  const twelveHourMatch = raw.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (twelveHourMatch) {
    let hours = Number(twelveHourMatch[1]);
    const minutes = Number(twelveHourMatch[2]);
    const suffix = String(twelveHourMatch[3] || "").toUpperCase();
    if (!Number.isFinite(hours) || !Number.isFinite(minutes) || hours < 1 || hours > 12 || minutes < 0 || minutes > 59) {
      return raw;
    }
    if (suffix === "PM" && hours < 12) hours += 12;
    if (suffix === "AM" && hours === 12) hours = 0;
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
  }
  return raw;
}

function normalizeMeetingDateValue(value) {
  const raw = String(value || "").trim();
  if (!raw) {
    return "";
  }
  const isoMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) {
    const year = Number(isoMatch[1]);
    const month = Number(isoMatch[2]);
    const day = Number(isoMatch[3]);
    const parsed = new Date(year, month - 1, day);
    if (parsed.getFullYear() === year && parsed.getMonth() === month - 1 && parsed.getDate() === day) {
      return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    }
    return "";
  }
  const dmyMatch = raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (dmyMatch) {
    const day = Number(dmyMatch[1]);
    const month = Number(dmyMatch[2]);
    const year = Number(dmyMatch[3]);
    const parsed = new Date(year, month - 1, day);
    if (parsed.getFullYear() === year && parsed.getMonth() === month - 1 && parsed.getDate() === day) {
      return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    }
    return "";
  }
  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) {
    const yyyy = parsed.getFullYear();
    const mm = String(parsed.getMonth() + 1).padStart(2, "0");
    const dd = String(parsed.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  }
  return "";
}

function syncDateTimeFieldValuesFromForm(form, fields, values) {
  if (!(form instanceof HTMLFormElement) || !Array.isArray(fields)) {
    return { values, changed: false };
  }
  const nextValues = { ...(values || {}) };
  let changed = false;
  fields.forEach((field) => {
    if (!field || (field.type !== "date" && field.type !== "time")) {
      return;
    }
    const fieldKey = String(field.key || "").trim();
    if (!fieldKey) {
      return;
    }
    const input = form.querySelector(`input[name="${fieldKey}"]`);
    if (!(input instanceof HTMLInputElement)) {
      return;
    }
    const picker = input.__wzFlatpickrInstance;
    const rawValue = String(picker?.altInput?.value ?? input.value ?? nextValues[fieldKey] ?? "").trim();
    const normalizedValue = field.type === "date"
      ? normalizeMeetingDateValue(rawValue)
      : normalizeMeetingTimeValue(rawValue);
    if (String(nextValues[fieldKey] || "") !== normalizedValue) {
      nextValues[fieldKey] = normalizedValue;
      changed = true;
    }
  });
  return { values: nextValues, changed };
}

function clearFlatpickrDisplayValues(root = document) {
  if (!root || typeof root.querySelectorAll !== "function") {
    return;
  }
  root.querySelectorAll("input[type='date'], input[type='time']").forEach((input) => {
    if (!(input instanceof HTMLInputElement)) {
      return;
    }
    const picker = input.__wzFlatpickrInstance;
    if (!picker) {
      return;
    }
    const rawValue = String(input.value || "").trim();
    if (rawValue) {
      return;
    }
    picker.clear(false);
    if (picker.altInput) {
      picker.altInput.value = "";
    }
  });
}

function syncFlatpickrValuesFromState(root, fields, values) {
  if (!root || typeof root.querySelectorAll !== "function" || !Array.isArray(fields)) {
    return;
  }
  fields.forEach((field) => {
    if (!field || (field.type !== "date" && field.type !== "time")) {
      return;
    }
    const fieldKey = String(field.key || "").trim();
    if (!fieldKey) {
      return;
    }
    const input = root.querySelector(`input[name="${fieldKey}"]`);
    if (!(input instanceof HTMLInputElement)) {
      return;
    }
    const picker = input.__wzFlatpickrInstance;
    if (!picker) {
      return;
    }
    const rawValue = String(values?.[fieldKey] || "").trim();
    if (!rawValue) {
      picker.clear(false);
      if (picker.altInput) {
        picker.altInput.value = "";
      }
      return;
    }
    if (field.type === "date") {
      const normalizedDate = normalizeMeetingDateValue(rawValue);
      if (normalizedDate) {
        picker.setDate(normalizedDate, false, "Y-m-d");
      }
      return;
    }
    const normalizedTime = normalizeMeetingTimeValue(rawValue);
    if (normalizedTime) {
      picker.setDate(normalizedTime, false, "H:i");
    }
  });
}

function getTodayIsoDate() {
  const now = new Date();
  const year = String(now.getFullYear());
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getCurrentTimeHm() {
  const now = new Date();
  const hh = String(now.getHours()).padStart(2, "0");
  const mm = String(now.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

function getFollowUpCompletedDate(row) {
  return (
    row && (
      row.completedDate
      || row.completedOn
      || row.completedAt
      || (String(row.status || "").trim().toLowerCase() === "completed" ? row.dueDate : "")
    )
  );
}

function getFollowUpEffectiveStatus(row) {
  const normalizedStatus = String(row?.status || "").trim().toLowerCase();
  if (normalizedStatus === "completed") {
    return "completed";
  }
  const dueDate = normalizeMeetingDateValue(String(row?.dueDate || "").trim());
  if (dueDate && dueDate < getTodayIsoDate()) {
    return "missed";
  }
  if (normalizedStatus === "ongoing" || normalizedStatus === "pending") {
    return normalizedStatus;
  }
  return "pending";
}

function computeWorkedDuration(inTime, outTime) {
  const start = String(inTime || "").trim();
  const end = String(outTime || "").trim();
  const toMinutes = (value) => {
    const match = value.match(/^(\d{1,2}):(\d{2})$/);
    if (!match) return null;
    const h = Number(match[1]);
    const m = Number(match[2]);
    if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
    return (h * 60) + m;
  };
  const startMin = toMinutes(start);
  const endMin = toMinutes(end);
  if (startMin === null || endMin === null || endMin < startMin) {
    return "";
  }
  const total = endMin - startMin;
  const hours = Math.floor(total / 60);
  const minutes = total % 60;
  if (!hours && !minutes) {
    return "0h 0m";
  }
  return `${hours}h ${minutes}m`;
}

function normalizeImportHeader(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function collectImportHeaderMap(rows) {
  const headerMap = new Map();
  (Array.isArray(rows) ? rows : []).forEach((row) => {
    Object.keys(row || {}).forEach((header) => {
      const rawHeader = String(header || "").trim();
      const normalizedHeader = normalizeImportHeader(rawHeader);
      if (!rawHeader || !normalizedHeader || headerMap.has(normalizedHeader)) {
        return;
      }
      headerMap.set(normalizedHeader, rawHeader);
    });
  });
  return headerMap;
}

function validateImportHeaders(rows, expectedHeaders = []) {
  const expectedMap = new Map();
  (Array.isArray(expectedHeaders) ? expectedHeaders : []).forEach((header) => {
    const rawHeader = String(header || "").trim();
    const normalizedHeader = normalizeImportHeader(rawHeader);
    if (!rawHeader || !normalizedHeader || expectedMap.has(normalizedHeader)) {
      return;
    }
    expectedMap.set(normalizedHeader, rawHeader);
  });
  const actualMap = collectImportHeaderMap(rows);
  const missing = Array.from(expectedMap.entries())
    .filter(([normalizedHeader]) => !actualMap.has(normalizedHeader))
    .map(([, rawHeader]) => rawHeader);
  const unexpected = Array.from(actualMap.entries())
    .filter(([normalizedHeader]) => !expectedMap.has(normalizedHeader))
    .map(([, rawHeader]) => rawHeader);
  return {
    isValid: missing.length === 0 && unexpected.length === 0,
    missing,
    unexpected,
  };
}

function buildHeaderValidationMessage(sectionLabel, missingHeaders = [], unexpectedHeaders = []) {
  const chunks = [`Excel columns do not match ${sectionLabel} template.`];
  if (missingHeaders.length) {
    chunks.push(`Missing: ${missingHeaders.join(", ")}`);
  }
  if (unexpectedHeaders.length) {
    chunks.push(`Extra: ${unexpectedHeaders.join(", ")}`);
  }
  chunks.push("Use the Export template headers and import again.");
  return chunks.join(" ");
}

function parseCsvRows(text) {
  const source = String(text || "").replace(/^\uFEFF/, "");
  const rows = [];
  let currentCell = "";
  let currentRow = [];
  let inQuotes = false;

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    const nextChar = source[index + 1];

    if (char === "\"") {
      if (inQuotes && nextChar === "\"") {
        currentCell += "\"";
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      currentRow.push(currentCell);
      currentCell = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && nextChar === "\n") {
        index += 1;
      }
      currentRow.push(currentCell);
      if (currentRow.some((value) => String(value || "").trim() !== "")) {
        rows.push(currentRow);
      }
      currentCell = "";
      currentRow = [];
      continue;
    }

    currentCell += char;
  }

  currentRow.push(currentCell);
  if (currentRow.some((value) => String(value || "").trim() !== "")) {
    rows.push(currentRow);
  }

  if (!rows.length) {
    return [];
  }

  const headers = rows[0].map((header) => String(header || "").trim());
  return rows
    .slice(1)
    .filter((row) => row.some((value) => String(value || "").trim() !== ""))
    .map((row) =>
      headers.reduce((acc, header, columnIndex) => {
        acc[header] = String(row[columnIndex] || "").trim();
        return acc;
      }, {})
    );
}

function parseMultiSelectImportValue(value) {
  if (Array.isArray(value)) {
    return value
      .map((item) => String(item || "").trim())
      .filter(Boolean);
  }
  if (typeof value !== "string") {
    return [];
  }
  const normalized = value.trim();
  if (!normalized) {
    return [];
  }
  if ((normalized.startsWith("[") && normalized.endsWith("]")) || normalized.includes("|")) {
    try {
      const parsed = JSON.parse(normalized);
      return parseMultiSelectImportValue(parsed);
    } catch (_error) {
      // Fallback to delimiter split.
    }
  }
  return normalized
    .split(/[\n;,]/)
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => item.replace(/^"|"$/g, "").trim())
    .filter(Boolean);
}

function normalizeSpreadsheetRows(rows) {
  if (!Array.isArray(rows) || rows.length < 2) {
    return [];
  }
  const headers = rows[0].map((header) => String(header || "").trim());
  return rows
    .slice(1)
    .filter((row) => Array.isArray(row) && row.some((value) => String(value || "").trim() !== ""))
    .map((row) =>
      headers.reduce((acc, header, columnIndex) => {
        acc[header] = String(row[columnIndex] || "").trim();
        return acc;
      }, {})
    );
}

function SearchablePaginatedTableCard({
  title,
  badgeLabel = "",
  rows = [],
  columns = [],
  renderCells,
  renderActions,
  noRowsText = "No rows found.",
  searchPlaceholder = "Search",
  searchBy,
  pageSize = DEFAULT_TABLE_PAGE_SIZE,
  withoutOuterCard = false,
  headerBottom = null,
  enableExport = false,
  enableImport = false,
  exportFileName = "table-data",
  exportCellValue,
  onImportRows,
  actionHeaderStyle = null,
  actionCellStyle = null,
}) {
  const [searchTerm, setSearchTerm] = useState("");
  const [page, setPage] = useState(1);
  const importInputRef = useRef(null);
  const [importSummary, setImportSummary] = useState({
    open: false,
    title: "",
    message: "",
    isError: false,
    totalRows: 0,
    newRows: 0,
    replacedRows: 0,
    skippedRows: 0,
  });

  const filteredRows = useMemo(() => {
    const term = String(searchTerm || "").trim().toLowerCase();
    if (!term) {
      return rows;
    }
    return rows.filter((row) => {
      const haystack = typeof searchBy === "function"
        ? String(searchBy(row) || "")
        : Object.values(row || {}).join(" ");
      return haystack.toLowerCase().includes(term);
    });
  }, [rows, searchBy, searchTerm]);

  const totalItems = filteredRows.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const safePage = Math.min(page, totalPages);
  const startIndex = (safePage - 1) * pageSize;
  const pagedRows = filteredRows.slice(startIndex, startIndex + pageSize);
  const startEntry = totalItems ? startIndex + 1 : 0;
  const endEntry = totalItems ? startIndex + pagedRows.length : 0;

  useEffect(() => {
    setPage(1);
  }, [searchTerm, rows.length]);

  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages);
    }
  }, [page, totalPages]);

  function getExportValue(row, column) {
    if (typeof exportCellValue === "function") {
      return String(exportCellValue(row, column) ?? "");
    }
    const value = row?.[column.key];
    if (value === null || value === undefined) {
      return "";
    }
    if (typeof value === "object") {
      try {
        return JSON.stringify(value);
      } catch (_error) {
        return String(value);
      }
    }
    return String(formatDateLikeCellValue(column?.key, value, ""));
  }

  function exportAsExcelCsv() {
    const headers = columns.map((column) => String(column.label || column.key || ""));
    const csvEscape = (value) => {
      const raw = String(value ?? "");
      if (/[",\n]/.test(raw)) {
        return `"${raw.replace(/"/g, "\"\"")}"`;
      }
      return raw;
    };
    const lines = [
      headers.map(csvEscape).join(","),
      ...filteredRows.map((row) =>
        columns.map((column) => csvEscape(getExportValue(row, column))).join(",")
      ),
    ];
    const blob = new Blob([`\uFEFF${lines.join("\n")}`], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${exportFileName}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  function exportAsPdf() {
    const win = window.open("", "_blank", "width=1000,height=700");
    if (!win) {
      window.alert("Popup blocked. Please allow popups to export PDF.");
      return;
    }
    const escapeHtml = (value) => String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
    const headCells = columns.map((column) => `<th>${escapeHtml(column.label || column.key || "")}</th>`).join("");
    const bodyRows = filteredRows.length
      ? filteredRows.map((row) => {
          const cells = columns.map((column) => `<td>${escapeHtml(getExportValue(row, column))}</td>`).join("");
          return `<tr>${cells}</tr>`;
        }).join("")
      : `<tr><td colspan="${columns.length}">No rows found.</td></tr>`;
    win.document.write(`
      <!doctype html>
      <html>
        <head>
          <title>${escapeHtml(title)} - Export</title>
          <style>
            body { font-family: Arial, sans-serif; margin: 24px; color: #111; }
            h2 { margin: 0 0 12px 0; font-size: 20px; }
            p { margin: 0 0 12px 0; color: #555; font-size: 12px; }
            table { width: 100%; border-collapse: collapse; }
            th, td { border: 1px solid #ccc; padding: 8px; text-align: left; font-size: 12px; vertical-align: top; }
            th { background: #f1f1f1; }
          </style>
        </head>
        <body>
          <h2>${escapeHtml(title)}</h2>
          <p>Exported ${escapeHtml(new Date().toLocaleString())}</p>
          <table>
            <thead><tr>${headCells}</tr></thead>
            <tbody>${bodyRows}</tbody>
          </table>
        </body>
      </html>
    `);
    win.document.close();
    const triggerPrint = () => {
      try {
        win.focus();
        win.print();
      } catch (_error) {
        // ignore print trigger issues
      }
    };
    // Safari/WebKit often needs a render delay before print is triggered.
    win.onload = () => {
      win.setTimeout(triggerPrint, 250);
    };
    win.setTimeout(triggerPrint, 500);
  }

  function triggerImportPicker() {
    importInputRef.current?.click();
  }

  function openImportSummaryPopup(summary = {}) {
    const totalRows = Number(summary.totalRows || 0);
    const newRows = Number(summary.newRows || 0);
    const replacedRows = Number(summary.replacedRows || 0);
    const skippedRows = Number(summary.skippedRows || 0);
    const isError = Boolean(summary.isError);
    const defaultMessage = isError
      ? "Unable to process import file."
      : `Import completed for ${title}.`;
    setImportSummary({
      open: true,
      title: String(summary.title || `${title} Import Summary`).trim(),
      message: String(summary.message || defaultMessage).trim(),
      isError,
      totalRows,
      newRows,
      replacedRows,
      skippedRows,
    });
  }

  async function onImportFileChange(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || typeof onImportRows !== "function") {
      return;
    }
    try {
      let parsedRows = [];
      const fileName = String(file.name || "").toLowerCase();
      if (fileName.endsWith(".xlsx") || fileName.endsWith(".xls")) {
        const buffer = await file.arrayBuffer();
        const workbook = XLSX.read(buffer, { type: "array" });
        const firstSheetName = workbook.SheetNames[0];
        const sheet = firstSheetName ? workbook.Sheets[firstSheetName] : null;
        parsedRows = sheet ? normalizeSpreadsheetRows(XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" })) : [];
      } else {
        const content = await file.text();
        parsedRows = parseCsvRows(content);
      }
      if (!parsedRows.length) {
        openImportSummaryPopup({
          title: `${title} Import`,
          message: "Imported file is empty or invalid.",
          isError: true,
          totalRows: 0,
          newRows: 0,
          replacedRows: 0,
          skippedRows: 0,
        });
        return;
      }
      const result = await Promise.resolve(onImportRows(parsedRows));
      if (result && typeof result === "object") {
        openImportSummaryPopup({
          title: `${title} Import Summary`,
          message: result.message || "",
          isError: Boolean(result.isError),
          totalRows: Number(result.totalRows ?? parsedRows.length),
          newRows: Number(result.newRows || 0),
          replacedRows: Number(result.replacedRows || 0),
          skippedRows: Number(result.skippedRows || 0),
        });
      } else {
        openImportSummaryPopup({
          title: `${title} Import Summary`,
          message: `Imported ${parsedRows.length} row(s).`,
          totalRows: parsedRows.length,
          newRows: parsedRows.length,
          replacedRows: 0,
          skippedRows: 0,
        });
      }
    } catch (_error) {
      openImportSummaryPopup({
        title: `${title} Import`,
        message: "Unable to import this file. Use the exported template structure in CSV or Excel format.",
        isError: true,
        totalRows: 0,
        newRows: 0,
        replacedRows: 0,
        skippedRows: 0,
      });
    }
  }

  const toolbarControls = (
    <div className="d-flex flex-wrap align-items-center justify-content-end gap-2">
      {badgeLabel ? <span className="badge bg-secondary table-count-badge">{badgeLabel}</span> : null}
      {enableExport ? (
        <>
          {enableImport ? (
            <>
              <input
                ref={importInputRef}
                type="file"
                accept=".csv,text/csv,.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,.xls,application/vnd.ms-excel"
                className="d-none"
                onChange={onImportFileChange}
              />
              <button type="button" className="btn btn-sm btn-outline-success" onClick={triggerImportPicker}>
                <i className="bi bi-file-earmark-excel me-1" aria-hidden="true" />
                Import
              </button>
            </>
          ) : null}
          <button type="button" className="btn btn-sm btn-outline-success" onClick={exportAsExcelCsv}>
            <i className="bi bi-file-earmark-excel me-1" aria-hidden="true" />
            Export
          </button>
          <button type="button" className="btn btn-sm btn-outline-success" onClick={exportAsPdf}>
            <i className="bi bi-file-earmark-pdf me-1" aria-hidden="true" />
            Export
          </button>
        </>
      ) : null}
      <label className="table-search mb-0">
        <i className="bi bi-search" aria-hidden="true" />
        <input
          type="search"
          placeholder={searchPlaceholder}
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </label>
    </div>
  );

  return (
    <div className={withoutOuterCard ? "" : "card p-3"}>
      <div className={`d-flex flex-wrap align-items-center justify-content-between gap-2 ${headerBottom ? "mb-2" : "mb-3"}`}>
        <h6 className="mb-0">{title}</h6>
        {headerBottom ? null : toolbarControls}
      </div>
      {headerBottom ? (
        <div className="d-flex flex-wrap align-items-start justify-content-between gap-2 mb-3">
          <div className="flex-grow-1" style={{ minWidth: "320px" }}>{headerBottom}</div>
          {toolbarControls}
        </div>
      ) : null}
      <div className="table-responsive">
        <table className="table table-dark table-borderless align-middle mb-0">
          <thead>
            <tr>
              {columns.map((column) => (
                <th
                  key={column.key || column.label}
                  className={column.headerClassName || ""}
                  style={column.thStyle || undefined}
                >
                  {column.label}
                </th>
              ))}
              {renderActions ? <th className="text-end" style={actionHeaderStyle || undefined}>Action</th> : null}
            </tr>
          </thead>
          <tbody>
            {pagedRows.length === 0 ? (
              <tr>
                <td colSpan={columns.length + (renderActions ? 1 : 0)} className="text-secondary">
                  {noRowsText}
                </td>
              </tr>
            ) : (
              pagedRows.map((row, rowIndex) => (
                <tr key={row.id || row.key || JSON.stringify(row)}>
                  {renderCells(row).map((cell, index) => (
                    (() => {
                      const column = columns[index] || {};
                      return (
                    <td
                      key={`${row.id || "row"}-${index}`}
                      className={column.cellClassName || ""}
                      style={{
                        backgroundColor: rowIndex % 2 === 0 ? "rgba(255,255,255,0.02)" : "rgba(255,255,255,0.06)",
                        ...(column.tdStyle || {}),
                      }}
                    >
                      {cell}
                    </td>
                      );
                    })()
                  ))}
                  {renderActions ? (
                    <td
                      className="text-end"
                      style={{
                        backgroundColor: rowIndex % 2 === 0 ? "rgba(255,255,255,0.02)" : "rgba(255,255,255,0.06)",
                        ...(actionCellStyle || {}),
                      }}
                    >
                      {renderActions(row)}
                    </td>
                  ) : null}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <div className="table-footer mt-2">
        <div className="table-info">
          Showing {startEntry} to {endEntry} of {totalItems} entries
        </div>
        <TablePagination
          page={safePage}
          totalPages={totalPages}
          onPageChange={setPage}
          showPageLinks
          showPageLabel={false}
          maxPageLinks={5}
        />
      </div>
      {importSummary.open ? (
        <div className="modal-overlay" role="dialog" aria-modal="true" onClick={() => setImportSummary((prev) => ({ ...prev, open: false }))}>
          <div className="modal-panel wz-import-summary-modal" onClick={(event) => event.stopPropagation()}>
            <div className="wz-import-summary-modal__header">
              <div className="wz-import-summary-modal__title-wrap">
                <span className={`wz-import-summary-modal__icon ${importSummary.isError ? "is-error" : "is-success"}`} aria-hidden="true">
                  <i className={`bi ${importSummary.isError ? "bi-exclamation-triangle-fill" : "bi-check-circle-fill"}`} />
                </span>
                <div>
                  <h5>{importSummary.title || "Import Summary"}</h5>
                  <div className={`wz-import-summary-modal__message ${importSummary.isError ? "text-danger" : "text-secondary"}`}>
                    {importSummary.message}
                  </div>
                </div>
              </div>
              <button
                type="button"
                className="btn btn-sm btn-outline-light"
                onClick={() => setImportSummary((prev) => ({ ...prev, open: false }))}
              >
                <i className="bi bi-x-lg" aria-hidden="true" />
              </button>
            </div>

            <div className="wz-import-summary-modal__stats">
              <div className="wz-import-summary-modal__stat">
                <div className="wz-import-summary-modal__stat-label">Total Rows</div>
                <div className="wz-import-summary-modal__stat-value">{importSummary.totalRows}</div>
              </div>
              <div className="wz-import-summary-modal__stat">
                <div className="wz-import-summary-modal__stat-label text-success">New Added</div>
                <div className="wz-import-summary-modal__stat-value text-success">{importSummary.newRows}</div>
              </div>
              <div className="wz-import-summary-modal__stat">
                <div className="wz-import-summary-modal__stat-label text-info">Replaced</div>
                <div className="wz-import-summary-modal__stat-value text-info">{importSummary.replacedRows}</div>
              </div>
              <div className="wz-import-summary-modal__stat">
                <div className="wz-import-summary-modal__stat-label text-warning">Skipped</div>
                <div className="wz-import-summary-modal__stat-value text-warning">{importSummary.skippedRows}</div>
              </div>
            </div>

            <div className="d-flex justify-content-end mt-3">
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={() => setImportSummary((prev) => ({ ...prev, open: false }))}
              >
                OK
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function CrmOnePageModule() {
  const sectionOrder = ["leads", "contacts", "teams", "deals", "salesOrders", "followUps", "meetings", "activities"];
  const [moduleData, setModuleData] = useState(() => normalizeCrmData(null));
  const [activeSection, setActiveSection] = useState(sectionOrder[0]);
  const [calendarMonthDate, setCalendarMonthDate] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [meetingPopup, setMeetingPopup] = useState(null);
  const [leadStatusTab, setLeadStatusTab] = useState("all");
  const [contactTagTab, setContactTagTab] = useState("all");
  const [dealStatusTab, setDealStatusTab] = useState("all");
  const [meetingStatusTab, setMeetingStatusTab] = useState("all");
  const [followUpStatusTab, setFollowUpStatusTab] = useState("all");
  const [forms, setForms] = useState(() =>
    Object.fromEntries(
      Object.entries(CRM_SECTION_CONFIG).map(([key, config]) => [key, buildEmptyValues(config.fields)])
    )
  );
  const [sectionFormErrors, setSectionFormErrors] = useState(() =>
    Object.fromEntries(Object.keys(CRM_SECTION_CONFIG).map((key) => [key, ""]))
  );
  const [sectionFieldErrors, setSectionFieldErrors] = useState(() =>
    Object.fromEntries(Object.keys(CRM_SECTION_CONFIG).map((key) => [key, {}]))
  );
  const [editingIds, setEditingIds] = useState(() =>
    Object.fromEntries(Object.keys(CRM_SECTION_CONFIG).map((key) => [key, ""]))
  );
  const [crmUserDirectory, setCrmUserDirectory] = useState([]);
  const [crmDepartmentDirectory, setCrmDepartmentDirectory] = useState([]);
  const [crmEmployeeRoleDirectory, setCrmEmployeeRoleDirectory] = useState([]);
  const [currentUserName, setCurrentUserName] = useState("Current User");
  const [currentUserEmail, setCurrentUserEmail] = useState("");
  const [currentUserRole, setCurrentUserRole] = useState("");
  const [currentUserEmployeeRole, setCurrentUserEmployeeRole] = useState("");
  const [crmRoleAccessMap, setCrmRoleAccessMap] = useState(() => readCrmRoleAccessMapFromStorage());
  const [crmStorageKey, setCrmStorageKey] = useState("");
  const [selectedTeamDepartments, setSelectedTeamDepartments] = useState([]);
  const [selectedTeamEmployeeRoles, setSelectedTeamEmployeeRoles] = useState([]);
  const [teamMembersPopup, setTeamMembersPopup] = useState(null);
  const [teamCategorySearch, setTeamCategorySearch] = useState("");
  const [teamCategorySearchOpen, setTeamCategorySearchOpen] = useState(false);
  const [teamMemberSearch, setTeamMemberSearch] = useState("");
  const [teamMemberSearchOpen, setTeamMemberSearchOpen] = useState(false);
  const [dealQuickEditPopup, setDealQuickEditPopup] = useState(null);
  const [meetingCompanySearchOpen, setMeetingCompanySearchOpen] = useState(false);
  const [dealCompanySearchOpen, setDealCompanySearchOpen] = useState(false);
  const [activityClientSearchOpen, setActivityClientSearchOpen] = useState(false);
  const [meetingReminderChannelSearch, setMeetingReminderChannelSearch] = useState("");
  const [meetingReminderChannelSearchOpen, setMeetingReminderChannelSearchOpen] = useState(false);
  const [meetingReminderDaySearch, setMeetingReminderDaySearch] = useState("");
  const [meetingReminderDaySearchOpen, setMeetingReminderDaySearchOpen] = useState(false);
  const [meetingReminderMinuteSearch, setMeetingReminderMinuteSearch] = useState("");
  const [meetingReminderMinuteSearchOpen, setMeetingReminderMinuteSearchOpen] = useState(false);
  const [meetingEmployeeSearch, setMeetingEmployeeSearch] = useState("");
  const [meetingEmployeeSearchOpen, setMeetingEmployeeSearchOpen] = useState(false);
  const [activityEmployeeSearch, setActivityEmployeeSearch] = useState("");
  const [activityEmployeeSearchOpen, setActivityEmployeeSearchOpen] = useState(false);
  const [leadCompanySearchOpen, setLeadCompanySearchOpen] = useState(false);
  const [leadPhoneLockedFromClient, setLeadPhoneLockedFromClient] = useState(false);
  const [leadAssignedUserSearch, setLeadAssignedUserSearch] = useState("");
  const [leadAssignedUserSearchOpen, setLeadAssignedUserSearchOpen] = useState(false);
  const [followUpRelatedToType, setFollowUpRelatedToType] = useState(CRM_FOLLOWUP_RELATED_TO_TYPES[0]);
  const [followUpRelatedToSearch, setFollowUpRelatedToSearch] = useState("");
  const [followUpRelatedToSearchOpen, setFollowUpRelatedToSearchOpen] = useState(false);
  const [followUpOwnerSearch, setFollowUpOwnerSearch] = useState("");
  const [followUpOwnerSearchOpen, setFollowUpOwnerSearchOpen] = useState(false);
  const [crmSelectedRowIds, setCrmSelectedRowIds] = useState(() =>
    Object.fromEntries(Object.keys(CRM_SECTION_CONFIG).map((key) => [key, []]))
  );
  const [deletedViewSection, setDeletedViewSection] = useState("");
  const [crmActionPopup, setCrmActionPopup] = useState({ open: false, title: "", message: "" });
  const sectionFormRef = useRef(null);
  const crmCurrencyCode = String(getOrgCurrency() || "INR").trim().toUpperCase() || "INR";
  const crmCurrencySymbol = getCurrencySymbol(crmCurrencyCode);

  const normalizedCurrentUserName = String(currentUserName || "").trim().toLowerCase();
  const normalizedCurrentUserEmail = String(currentUserEmail || "").trim().toLowerCase();
  const normalizedCurrentUserRole = String(currentUserRole || "").trim().toLowerCase();
  const isCrmAdmin = normalizedCurrentUserRole === "company_admin" || normalizedCurrentUserRole === "org_admin";
  const crmRoleAccessRecord = useMemo(
    () => resolveCrmRoleAccessRecord(crmRoleAccessMap, currentUserRole, currentUserEmployeeRole),
    [crmRoleAccessMap, currentUserRole, currentUserEmployeeRole]
  );
  const crmSectionAccessLevel = String(crmRoleAccessRecord?.sections?.crm || "No Access").trim();
  const hasCrmFullAccess = isCrmAdmin || crmSectionAccessLevel === "Full Access";

  function isSoftDeletedCrmRow(row) {
    return Boolean(row?.isDeleted || row?.is_deleted) || Boolean(row?.deletedAt || row?.deleted_at);
  }

  function parseOwnerNames(value) {
    if (Array.isArray(value)) {
      return value.map((item) => String(item || "").trim()).filter(Boolean);
    }
    return String(value || "")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }

  function isRowAssignedToCurrentUser(sectionKey, row) {
    if (!row || isCrmAdmin) {
      return true;
    }
    const createdBy = String(row.createdBy || "").trim().toLowerCase();
    if (createdBy && normalizedCurrentUserName && createdBy === normalizedCurrentUserName) {
      return true;
    }
    if (sectionKey === "leads") {
      const assignType = String(row.assignType || "Users").trim().toLowerCase();
      if (assignType === "team") {
        const assignedTeamName = String(row.assignedTeam || row.assignedTo || "").trim();
        if (!assignedTeamName) {
          return false;
        }
        const matchedTeam = (moduleData.teams || []).find(
          (team) => String(team?.name || "").trim().toLowerCase() === assignedTeamName.toLowerCase()
        );
        const teamMembers = parseTeamMemberList(matchedTeam?.members);
        return teamMembers.some((member) => String(member || "").trim().toLowerCase() === normalizedCurrentUserName);
      }
      const assignedUsers = Array.isArray(row.assignedUser)
        ? row.assignedUser
        : String(row.assignedUser || row.assignedTo || "").split(",");
      return assignedUsers.some((userName) => String(userName || "").trim().toLowerCase() === normalizedCurrentUserName);
    }
    if (sectionKey === "meetings" || sectionKey === "activities" || sectionKey === "followUps") {
      return parseOwnerNames(row.owner).some((owner) => owner.toLowerCase() === normalizedCurrentUserName);
    }
    return true;
  }

  function canEditCrmRow(sectionKey, row) {
    return isRowAssignedToCurrentUser(sectionKey, row);
  }

  function canDeleteCrmRow(sectionKey, row) {
    if (isCrmAdmin) {
      return true;
    }
    if (!hasCrmFullAccess) {
      return false;
    }
    return isRowAssignedToCurrentUser(sectionKey, row);
  }

  useEffect(() => {
    if (!crmStorageKey) {
      return;
    }
    try {
      const raw = window.localStorage.getItem(crmStorageKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (isValidCrmData(parsed)) {
          setModuleData(stripLegacyDemoCrmData(parsed));
          window.localStorage.setItem(CRM_STORAGE_KEY_ACTIVE, crmStorageKey);
          return;
        }
      }

      const legacyRaw = window.localStorage.getItem(CRM_STORAGE_KEY);
      if (legacyRaw) {
        const legacyParsed = JSON.parse(legacyRaw);
        if (isValidCrmData(legacyParsed)) {
          const migrated = stripLegacyDemoCrmData(legacyParsed);
          setModuleData(migrated);
          window.localStorage.setItem(crmStorageKey, JSON.stringify(migrated));
        } else {
          setModuleData(normalizeCrmData(null));
        }
        window.localStorage.removeItem(CRM_STORAGE_KEY);
      } else {
        setModuleData(normalizeCrmData(null));
      }
      window.localStorage.setItem(CRM_STORAGE_KEY_ACTIVE, crmStorageKey);
    } catch (_error) {
      setModuleData(normalizeCrmData(null));
    }
  }, [crmStorageKey]);

  useEffect(() => {
    if (!crmStorageKey) {
      return;
    }
    const cleaned = stripLegacyDemoCrmData(moduleData);
    window.localStorage.setItem(crmStorageKey, JSON.stringify(cleaned));
    window.localStorage.setItem(CRM_STORAGE_KEY_ACTIVE, crmStorageKey);
  }, [moduleData, crmStorageKey]);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const [usersData, authData, roleAccessData] = await Promise.all([
          apiFetch("/api/business-autopilot/users"),
          apiFetch("/api/auth/me"),
          apiFetch("/api/business-autopilot/role-access").catch(() => null),
        ]);
        if (!active) return;
        setCrmUserDirectory(Array.isArray(usersData?.users) ? usersData.users : []);
        setCrmDepartmentDirectory(Array.isArray(usersData?.departments) ? usersData.departments : []);
        setCrmEmployeeRoleDirectory(Array.isArray(usersData?.employee_roles) ? usersData.employee_roles : []);
        const name = String(
          authData?.user?.first_name
          || authData?.user?.username
          || authData?.profile?.name
          || "Current User"
        ).trim();
        setCurrentUserName(name || "Current User");
        setCurrentUserEmail(String(authData?.user?.email || "").trim());
        setCurrentUserRole(String(authData?.profile?.role || "").trim());
        const normalizedEmail = String(authData?.user?.email || "").trim().toLowerCase();
        const matchedDirectoryUser = (Array.isArray(usersData?.users) ? usersData.users : []).find(
          (row) => String(row?.email || "").trim().toLowerCase() === normalizedEmail
        );
        setCurrentUserEmployeeRole(
          String(
            matchedDirectoryUser?.employee_role
            || authData?.user?.employee_role
            || ""
          ).trim()
        );
        const nextRoleAccessMap = (roleAccessData?.role_access_map && typeof roleAccessData.role_access_map === "object" && !Array.isArray(roleAccessData.role_access_map))
          ? roleAccessData.role_access_map
          : readCrmRoleAccessMapFromStorage();
        setCrmRoleAccessMap(nextRoleAccessMap);
        window.localStorage.setItem(CRM_ROLE_ACCESS_STORAGE_KEY, JSON.stringify(nextRoleAccessMap));
        setCrmStorageKey(buildScopedCrmStorageKey(authData));
        await refreshCrmMeetingsFromBackend();
      } catch {
        if (!active) return;
        setCrmUserDirectory([]);
        setCrmDepartmentDirectory([]);
        setCrmEmployeeRoleDirectory([]);
        setCurrentUserName("Current User");
        setCurrentUserEmail("");
        setCurrentUserRole("");
        setCurrentUserEmployeeRole("");
        setCrmRoleAccessMap(readCrmRoleAccessMapFromStorage());
        setCrmStorageKey("");
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    setDeletedViewSection("");
  }, [activeSection]);

  useEffect(() => {
    let hasChanges = false;
    const now = Date.now();
    const nextData = { ...moduleData };
    ["leads", "contacts", "teams", "deals", "salesOrders", "followUps", "meetings", "activities"].forEach((sectionKey) => {
      const rows = Array.isArray(moduleData[sectionKey]) ? moduleData[sectionKey] : [];
      const nextRows = rows.filter((row) => {
        const deletedAtRaw = row?.deletedAt;
        if (!deletedAtRaw) {
          return true;
        }
        const deletedAtMs = new Date(deletedAtRaw).getTime();
        if (!Number.isFinite(deletedAtMs)) {
          return true;
        }
        const ageDays = (now - deletedAtMs) / (24 * 60 * 60 * 1000);
        const keep = ageDays <= CRM_SOFT_DELETE_RETENTION_DAYS;
        if (!keep) {
          hasChanges = true;
        }
        return keep;
      });
      if (nextRows.length !== rows.length) {
        nextData[sectionKey] = nextRows;
      }
    });
    if (hasChanges) {
      setModuleData(nextData);
    }
  }, [moduleData]);

  useEffect(() => {
    if (activeSection !== "meetings") {
      setMeetingPopup(null);
    }
  }, [activeSection]);

  useEffect(() => {
    if (activeSection !== "teams") {
      resetCrmTeamBuilderState();
    }
  }, [activeSection]);

  useEffect(() => {
    if (activeSection !== "leads") {
      setLeadCompanySearchOpen(false);
      setLeadPhoneLockedFromClient(false);
      setLeadAssignedUserSearch("");
      setLeadAssignedUserSearchOpen(false);
    }
  }, [activeSection]);

  useEffect(() => {
    if (activeSection !== "meetings") {
      setMeetingCompanySearchOpen(false);
      setMeetingReminderChannelSearch("");
      setMeetingReminderChannelSearchOpen(false);
      setMeetingReminderDaySearch("");
      setMeetingReminderDaySearchOpen(false);
      setMeetingReminderMinuteSearch("");
      setMeetingReminderMinuteSearchOpen(false);
      setMeetingEmployeeSearch("");
      setMeetingEmployeeSearchOpen(false);
    }
  }, [activeSection]);

  useEffect(() => {
    if (activeSection !== "activities") {
      setActivityClientSearchOpen(false);
      setActivityEmployeeSearch("");
      setActivityEmployeeSearchOpen(false);
    }
  }, [activeSection]);

  useEffect(() => {
    const reminderDayOptions = getCrmMeetingReminderDayOptions(forms.meetings?.meetingDate);
    const selectedReminderDays = parseCrmMeetingReminderDayValues(forms.meetings?.reminderDays);
    if (!selectedReminderDays.length) {
      return;
    }
    const reminderDayOptionSet = new Set(reminderDayOptions.map((option) => option.value));
    const nextReminderDays = selectedReminderDays.filter((value) => reminderDayOptionSet.has(value));
    if (nextReminderDays.length !== selectedReminderDays.length) {
      setForms((prev) => ({
        ...prev,
        meetings: {
          ...prev.meetings,
          reminderDays: nextReminderDays,
        },
      }));
    }
  }, [forms.meetings?.meetingDate, forms.meetings?.reminderDays]);

  const stats = useMemo(() => {
    const leads = (moduleData.leads || []).filter((row) => isRowAssignedToCurrentUser("leads", row) && !isSoftDeletedCrmRow(row));
    const deals = (moduleData.deals || []).filter((row) => isRowAssignedToCurrentUser("deals", row) && !isSoftDeletedCrmRow(row));
    const followUps = (moduleData.followUps || []).filter((row) => isRowAssignedToCurrentUser("followUps", row) && !isSoftDeletedCrmRow(row));
    const meetings = (moduleData.meetings || []).filter((row) => isRowAssignedToCurrentUser("meetings", row) && !isSoftDeletedCrmRow(row));
    const activities = (moduleData.activities || []).filter((row) => isRowAssignedToCurrentUser("activities", row) && !isSoftDeletedCrmRow(row));
    const teams = (moduleData.teams || []).filter((row) => isRowAssignedToCurrentUser("teams", row) && !isSoftDeletedCrmRow(row));
    const openLeads = leads.filter((row) => !["closed", "onhold"].includes(String(row.status || "").toLowerCase())).length;
    // Pipeline should be based on Lead Amount total to avoid duplicate counting from linked deals.
    const pipelineValue = leads.reduce((sum, row) => sum + parseNumber(row.leadAmount), 0);
    const today = new Date().toISOString().slice(0, 10);
    const followupsToday = followUps.filter((row) => {
      if (String(row.dueDate || "") !== today) return false;
      const status = String(row.status || "").toLowerCase();
      return status !== "done" && status !== "completed";
    }).length;
    const upcomingMeetings = meetings.filter((row) => {
      const meetingDate = String(row.meetingDate || "");
      const status = String(row.status || "").toLowerCase();
      return meetingDate >= today && !["cancelled", "missed", "completed"].includes(status);
    }).length;
    return [
      { label: "Open Leads", value: String(openLeads), icon: "bi-person-plus" },
      { label: "Pipeline Value", value: formatCurrencyAmount(pipelineValue, getOrgCurrency()), icon: "bi-graph-up-arrow" },
      { label: "Followups Today", value: String(followupsToday), icon: "bi-telephone-forward" },
      { label: "Upcoming Meetings", value: String(upcomingMeetings), icon: "bi-calendar-event" },
      { label: "Activities", value: String(activities.length), icon: "bi-activity" },
      { label: "Teams", value: String(teams.length), icon: "bi-people-fill" },
    ];
  }, [isCrmAdmin, moduleData, normalizedCurrentUserEmail, normalizedCurrentUserName]);

  const crmTeamOptions = useMemo(
    () => Array.from(new Set((moduleData.teams || []).map((row) => String(row?.name || "").trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b)),
    [moduleData.teams]
  );
  const crmDirectoryOptions = useMemo(() => {
    const map = new Map();
    const sharedHrEmployees = readSharedHrEmployees();
    [...(crmUserDirectory || []), ...sharedHrEmployees].forEach((row) => {
      const normalized = normalizeCrmDirectoryEntry(row);
      if (!normalized) {
        return;
      }
      const key = normalized.email || normalized.id || normalized.name.toLowerCase();
      if (!map.has(key)) {
        map.set(key, normalized);
      }
    });
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [crmUserDirectory]);
  const crmUserOptions = useMemo(
    () => Array.from(new Set(crmDirectoryOptions.map((row) => row.name))).sort((a, b) => a.localeCompare(b)),
    [crmDirectoryOptions]
  );
  const crmDepartmentOptions = useMemo(
    () => Array.from(new Set([
      ...(crmDepartmentDirectory || []).map((row) => String(row?.name || "").trim()),
      ...crmDirectoryOptions.map((row) => row.department),
    ].filter(Boolean))).sort((a, b) => a.localeCompare(b)),
    [crmDepartmentDirectory, crmDirectoryOptions]
  );
  const crmEmployeeRoleOptions = useMemo(
    () => Array.from(new Set([
      ...(crmEmployeeRoleDirectory || []).map((row) => String(row?.name || "").trim()),
      ...crmDirectoryOptions.map((row) => row.employeeRole),
    ].filter(Boolean))).sort((a, b) => a.localeCompare(b)),
    [crmDirectoryOptions, crmEmployeeRoleDirectory]
  );
  const sharedCustomerOptions = useMemo(() => readSharedAccountsCustomers(), [activeSection, moduleData.contacts, moduleData.teams, crmUserDirectory]);
  const sharedCustomerDatalistOptions = useMemo(
    () => sharedCustomerOptions
      .flatMap((row) => [
        String(row.companyName || row.name || "").trim(),
        String(row.clientName || "").trim(),
        getSharedCustomerDisplayName(row),
      ])
      .filter(Boolean)
      .filter((value, index, list) => list.indexOf(value) === index),
    [sharedCustomerOptions]
  );

  function buildMeetingOwnerUserIds(ownerNames = []) {
    const normalizedNames = Array.isArray(ownerNames)
      ? ownerNames.map((item) => String(item || "").trim()).filter(Boolean)
      : [];
    if (!normalizedNames.length) {
      return [];
    }
    const nameSet = new Set(normalizedNames.map((item) => item.toLowerCase()));
    const matchedIds = crmDirectoryOptions
      .filter((item) => nameSet.has(String(item.name || "").trim().toLowerCase()))
      .map((item) => String(item.id || "").trim())
      .filter(Boolean);
    return Array.from(new Set(matchedIds));
  }

  async function refreshCrmMeetingsFromBackend() {
    try {
      const data = await apiFetch("/api/business-autopilot/meetings");
      const meetings = Array.isArray(data?.meetings)
        ? data.meetings
            .map((row) => normalizeCrmMeetingRecord(row))
            .filter((row) => !isLegacyDemoCrmRow(row))
        : [];
      setModuleData((prev) => ({ ...prev, meetings }));
    } catch (_error) {
      // Keep local meetings when backend is unavailable.
    }
  }

  function setField(sectionKey, fieldKey, value) {
    const fieldMeta = (CRM_SECTION_CONFIG[sectionKey]?.fields || []).find((field) => field.key === fieldKey);
    let normalizedValue = typeof value === "string"
      ? clampBusinessAutopilotText(fieldKey, value, { isTextarea: fieldMeta?.type === "textarea" })
      : value;
    if (sectionKey === "meetings" && fieldKey === "meetingDate") {
      const normalizedMeetingDate = normalizeMeetingDateValue(normalizedValue);
      if (normalizedMeetingDate) {
        normalizedValue = normalizedMeetingDate;
      }
    }
    if (sectionKey === "meetings" && fieldKey === "meetingTime") {
      const normalizedMeetingTime = normalizeMeetingTimeValue(normalizedValue);
      if (normalizedMeetingTime) {
        normalizedValue = normalizedMeetingTime;
      }
    }
    if (isAmountFieldKey(fieldKey)) {
      normalizedValue = formatCurrencyNumberInput(sanitizeCurrencyInput(normalizedValue), crmCurrencyCode);
    }
    const normalizedFieldKey = String(fieldKey || "").toLowerCase();
    const isEmailInput = normalizedFieldKey.includes("email");
    const trimmedValue = String(normalizedValue || "").trim();
    const hasInvalidEmail = isEmailInput && trimmedValue && !EMAIL_ADDRESS_RE.test(trimmedValue);
    setSectionFormErrors((prev) => ({
      ...prev,
      [sectionKey]: hasInvalidEmail ? "Please enter a valid email address." : "",
    }));
    setSectionFieldErrors((prev) => ({
      ...prev,
      [sectionKey]: {
        ...(prev[sectionKey] || {}),
        [fieldKey]: hasInvalidEmail,
      },
    }));
    setForms((prev) => ({
      ...prev,
      [sectionKey]: {
        ...prev[sectionKey],
        [fieldKey]: normalizedValue,
      },
    }));
  }

  function resetCrmTeamBuilderState() {
    setSelectedTeamDepartments([]);
    setSelectedTeamEmployeeRoles([]);
    setTeamCategorySearch("");
    setTeamCategorySearchOpen(false);
    setTeamMemberSearch("");
    setTeamMemberSearchOpen(false);
  }

  function resetSectionForm(sectionKey) {
    setEditingIds((prev) => ({ ...prev, [sectionKey]: "" }));
    setSectionFormErrors((prev) => ({ ...prev, [sectionKey]: "" }));
    setSectionFieldErrors((prev) => ({ ...prev, [sectionKey]: {} }));
    setForms((prev) => ({
      ...prev,
      [sectionKey]: buildEmptyValues(CRM_SECTION_CONFIG[sectionKey].fields),
    }));
    if (sectionKey === "teams") {
      resetCrmTeamBuilderState();
    }
    if (sectionKey === "leads") {
      setLeadCompanySearchOpen(false);
      setLeadPhoneLockedFromClient(false);
      setLeadAssignedUserSearch("");
      setLeadAssignedUserSearchOpen(false);
    }
    if (sectionKey === "meetings") {
      setMeetingCompanySearchOpen(false);
      setMeetingReminderChannelSearch("");
      setMeetingReminderChannelSearchOpen(false);
      setMeetingReminderDaySearch("");
      setMeetingReminderDaySearchOpen(false);
      setMeetingReminderMinuteSearch("");
      setMeetingReminderMinuteSearchOpen(false);
      setMeetingEmployeeSearch("");
      setMeetingEmployeeSearchOpen(false);
    }
    if (sectionKey === "activities") {
      setActivityClientSearchOpen(false);
      setActivityEmployeeSearch("");
      setActivityEmployeeSearchOpen(false);
    }
    if (sectionKey === "followUps") {
      setFollowUpRelatedToType(CRM_FOLLOWUP_RELATED_TO_TYPES[0]);
      setFollowUpRelatedToSearch("");
      setFollowUpRelatedToSearchOpen(false);
      setFollowUpOwnerSearch("");
      setFollowUpOwnerSearchOpen(false);
    }
    window.requestAnimationFrame(() => {
      clearFlatpickrDisplayValues(sectionFormRef.current || document);
    });
  }

  function onEdit(sectionKey, row) {
    if (!canEditCrmRow(sectionKey, row)) {
      return;
    }
    setEditingIds((prev) => ({ ...prev, [sectionKey]: row.id }));
    setSectionFormErrors((prev) => ({ ...prev, [sectionKey]: "" }));
    setSectionFieldErrors((prev) => ({ ...prev, [sectionKey]: {} }));
    const normalizedRow = sectionKey === "leads"
      ? normalizeCrmLeadRecord(row)
      : sectionKey === "contacts"
      ? normalizeCrmContactRecord(row)
      : sectionKey === "teams"
      ? normalizeCrmTeamRecord(row)
      : row;
    const nextValues = {};
    CRM_SECTION_CONFIG[sectionKey].fields.forEach((field) => {
      const rowValue = normalizedRow[field.key];
      if (field.type === "multiselect") {
        if (Array.isArray(rowValue)) {
          nextValues[field.key] = rowValue;
        } else if (typeof rowValue === "string" && rowValue.trim()) {
          nextValues[field.key] = rowValue.split(",").map((v) => v.trim()).filter(Boolean);
        } else if (Array.isArray(field.defaultValue)) {
          nextValues[field.key] = [...field.defaultValue];
        } else {
          nextValues[field.key] = [];
        }
      } else if (sectionKey === "meetings" && field.key === "meetingTime") {
        const timeValue = rowValue ?? field.defaultValue ?? "";
        const formattedTime = formatTimeToAmPm(timeValue);
        nextValues[field.key] = formattedTime === "-" ? "" : formattedTime;
      } else if (field.type === "date") {
        const normalizedDate = normalizeMeetingDateValue(rowValue ?? field.defaultValue ?? "");
        nextValues[field.key] = normalizedDate || "";
      } else {
        nextValues[field.key] = rowValue ?? field.defaultValue ?? "";
      }
    });
    setForms((prev) => ({ ...prev, [sectionKey]: nextValues }));
    if (sectionKey === "teams") {
      setSelectedTeamDepartments(Array.isArray(normalizedRow.departmentFilters) ? normalizedRow.departmentFilters : []);
      setSelectedTeamEmployeeRoles(Array.isArray(normalizedRow.employeeRoleFilters) ? normalizedRow.employeeRoleFilters : []);
      setTeamCategorySearch("");
      setTeamCategorySearchOpen(false);
      setTeamMemberSearch("");
      setTeamMemberSearchOpen(false);
    }
    if (sectionKey === "leads") {
      setLeadCompanySearchOpen(false);
      setLeadPhoneLockedFromClient(false);
      setLeadAssignedUserSearch("");
      setLeadAssignedUserSearchOpen(false);
    }
    if (sectionKey === "meetings") {
      setMeetingCompanySearchOpen(false);
      setMeetingReminderChannelSearch("");
      setMeetingReminderChannelSearchOpen(false);
      setMeetingReminderDaySearch("");
      setMeetingReminderDaySearchOpen(false);
      setMeetingReminderMinuteSearch("");
      setMeetingReminderMinuteSearchOpen(false);
      setMeetingEmployeeSearch("");
      setMeetingEmployeeSearchOpen(false);
    }
    if (sectionKey === "activities") {
      setActivityClientSearchOpen(false);
      setActivityEmployeeSearch("");
      setActivityEmployeeSearchOpen(false);
    }
    if (sectionKey === "followUps") {
      const normalizedRelatedTo = String(normalizedRow.relatedTo || "").trim();
      const normalizedRelatedToLower = normalizedRelatedTo.toLowerCase();
      const isLeadMatch = (moduleData.leads || []).some((lead) => {
        const leadMatch = String(lead.name || "").trim().toLowerCase() === normalizedRelatedToLower
          || String(lead.company || "").trim().toLowerCase() === normalizedRelatedToLower;
        return leadMatch;
      });
      const isContactMatch = (moduleData.contacts || []).some((contact) => {
        const contactMatch = String(contact.name || "").trim().toLowerCase() === normalizedRelatedToLower
          || String(contact.company || "").trim().toLowerCase() === normalizedRelatedToLower;
        return contactMatch;
      });
      const isClientMatch = sharedCustomerOptions.some((customer) => {
        const name = String(getSharedCustomerDisplayName(customer) || "").trim().toLowerCase();
        const company = String(customer.companyName || "").trim().toLowerCase();
        const client = String(customer.clientName || "").trim().toLowerCase();
        return normalizedRelatedToLower === name || normalizedRelatedToLower === company || normalizedRelatedToLower === client;
      });
      setFollowUpRelatedToType(
        isLeadMatch
          ? CRM_FOLLOWUP_RELATED_TO_TYPES[0]
          : isContactMatch
            ? CRM_FOLLOWUP_RELATED_TO_TYPES[1]
            : isClientMatch
              ? CRM_FOLLOWUP_RELATED_TO_TYPES[2]
              : CRM_FOLLOWUP_RELATED_TO_TYPES[0]
      );
      setFollowUpRelatedToSearch(normalizedRelatedTo);
      setFollowUpRelatedToSearchOpen(false);
      setFollowUpOwnerSearch(String(normalizedRow.owner || "").trim());
      setFollowUpOwnerSearchOpen(false);
    }
    window.requestAnimationFrame(() => {
      const sectionRoot = sectionFormRef.current || document;
      syncFlatpickrValuesFromState(sectionRoot, CRM_SECTION_CONFIG[sectionKey].fields, nextValues);
      sectionFormRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  function isCrmFieldRequired(sectionKey, field, values) {
    if (!field) {
      return false;
    }
    if (field.required === false) {
      return false;
    }
    if (sectionKey === "meetings" && field.key === "reminderDays") {
      return false;
    }
    if (sectionKey === "leads" && field.key === "assignedUser") {
      return String(values?.assignType || "Users").trim().toLowerCase() !== "team";
    }
    if (sectionKey === "leads" && field.key === "assignedTeam") {
      return String(values?.assignType || "Users").trim().toLowerCase() === "team";
    }
    return true;
  }

  function toggleCrmRowSelection(sectionKey, rowId, checked) {
    const normalizedSection = String(sectionKey || "").trim();
    const normalizedRowId = String(rowId || "").trim();
    if (!normalizedSection || !normalizedRowId) {
      return;
    }
    setCrmSelectedRowIds((prev) => {
      const currentIds = Array.isArray(prev[normalizedSection]) ? prev[normalizedSection] : [];
      const nextSet = new Set(currentIds.map((value) => String(value || "").trim()).filter(Boolean));
      if (checked) {
        nextSet.add(normalizedRowId);
      } else {
        nextSet.delete(normalizedRowId);
      }
      return {
        ...prev,
        [normalizedSection]: Array.from(nextSet),
      };
    });
  }

  function toggleCrmSelectAllRows(sectionKey, rowIds, checked) {
    const normalizedSection = String(sectionKey || "").trim();
    if (!normalizedSection) {
      return;
    }
    const normalizedIds = Array.isArray(rowIds)
      ? rowIds.map((value) => String(value || "").trim()).filter(Boolean)
      : [];
    setCrmSelectedRowIds((prev) => {
      const currentIds = Array.isArray(prev[normalizedSection]) ? prev[normalizedSection] : [];
      const nextSet = new Set(currentIds.map((value) => String(value || "").trim()).filter(Boolean));
      normalizedIds.forEach((id) => {
        if (checked) {
          nextSet.add(id);
        } else {
          nextSet.delete(id);
        }
      });
      return {
        ...prev,
        [normalizedSection]: Array.from(nextSet),
      };
    });
  }

  function clearCrmSelection(sectionKey) {
    const normalizedSection = String(sectionKey || "").trim();
    if (!normalizedSection) {
      return;
    }
    setCrmSelectedRowIds((prev) => ({
      ...prev,
      [normalizedSection]: [],
    }));
  }

  function onBulkSoftDelete(sectionKey, rowIds) {
    const normalizedSection = String(sectionKey || "").trim();
    const normalizedIds = Array.isArray(rowIds)
      ? rowIds.map((value) => String(value || "").trim()).filter(Boolean)
      : [];
    if (!normalizedSection || !normalizedIds.length) {
      return;
    }
    const eligibleIds = normalizedIds.filter((rowId) => {
      const row = (moduleData?.[normalizedSection] || []).find((item) => String(item?.id || "").trim() === rowId);
      return canDeleteCrmRow(normalizedSection, row);
    });
    if (!eligibleIds.length) {
      return;
    }
    const rowIdSet = new Set(eligibleIds);
    const nowIso = new Date().toISOString();
    setModuleData((prev) => ({
      ...prev,
      [normalizedSection]: (prev[normalizedSection] || []).map((row) => (
        rowIdSet.has(String(row.id || "").trim())
          ? {
              ...row,
              isDeleted: true,
              is_deleted: true,
              deletedAt: nowIso,
              deleted_at: nowIso,
              deletedBy: currentUserName || "Current User",
            }
          : row
      )),
    }));
    if (editingIds[normalizedSection] && rowIdSet.has(String(editingIds[normalizedSection] || "").trim())) {
      resetSectionForm(normalizedSection);
    }
    clearCrmSelection(normalizedSection);
  }

  function onBulkRestore(sectionKey, rowIds) {
    if (!isCrmAdmin) {
      return;
    }
    const normalizedSection = String(sectionKey || "").trim();
    const normalizedIds = Array.isArray(rowIds)
      ? rowIds.map((value) => String(value || "").trim()).filter(Boolean)
      : [];
    if (!normalizedSection || !normalizedIds.length) {
      return;
    }
    const rowIdSet = new Set(normalizedIds);
    setModuleData((prev) => ({
      ...prev,
      [normalizedSection]: (prev[normalizedSection] || []).map((row) => (
        rowIdSet.has(String(row.id || "").trim())
          ? {
              ...row,
              isDeleted: false,
              is_deleted: false,
              deletedAt: "",
              deleted_at: "",
              deletedBy: "",
            }
          : row
      )),
    }));
    clearCrmSelection(normalizedSection);
  }

  function onBulkPermanentDelete(sectionKey, rowIds) {
    if (!isCrmAdmin) {
      return;
    }
    const normalizedSection = String(sectionKey || "").trim();
    const normalizedIds = Array.isArray(rowIds)
      ? rowIds.map((value) => String(value || "").trim()).filter(Boolean)
      : [];
    if (!normalizedSection || !normalizedIds.length) {
      return;
    }
    const rowIdSet = new Set(normalizedIds);
    setModuleData((prev) => ({
      ...prev,
      [normalizedSection]: (prev[normalizedSection] || []).filter((row) => !rowIdSet.has(String(row.id || "").trim())),
    }));
    clearCrmSelection(normalizedSection);
  }

  function onDelete(sectionKey, rowId) {
    const targetRow = (moduleData?.[sectionKey] || []).find((row) => String(row?.id) === String(rowId)) || null;
    if (!canDeleteCrmRow(sectionKey, targetRow)) {
      return;
    }
    setModuleData((prev) => ({
      ...prev,
      [sectionKey]: (prev[sectionKey] || []).map((row) => (
        String(row.id) === String(rowId)
          ? {
              ...row,
              isDeleted: true,
              is_deleted: true,
              deletedAt: new Date().toISOString(),
              deleted_at: new Date().toISOString(),
              deletedBy: currentUserName || "Current User",
            }
          : row
      )),
    }));
    if (editingIds[sectionKey] === rowId) {
      resetSectionForm(sectionKey);
    }
    const sectionLabelMap = {
      leads: "Lead",
      deals: "Deal",
      salesOrders: "Sales Order",
      contacts: "Contact",
      followUps: "Follow-up",
      meetings: "Meeting",
      activities: "Activity",
      teams: "Team",
    };
    const rowLabel = sectionLabelMap[String(sectionKey || "").trim()] || "CRM Item";
    const primaryName = String(
      targetRow?.name
      || targetRow?.leadName
      || targetRow?.dealName
      || targetRow?.customerName
      || targetRow?.subject
      || targetRow?.title
      || targetRow?.company
      || ""
    ).trim();
    const details = primaryName
      ? `${rowLabel} deleted: ${primaryName}`
      : `${rowLabel} deleted (ID: ${rowId})`;
    apiFetch("/api/business-autopilot/crm/activity-log", {
      method: "POST",
      body: JSON.stringify({
        action: `Delete CRM ${rowLabel}`,
        details,
      }),
    }).catch(() => {});
    if (sectionKey === "meetings") {
      const serverMeetingId = String(targetRow?.serverMeetingId || targetRow?.id || "").trim();
      if (serverMeetingId) {
        apiFetch(`/api/business-autopilot/meetings/${encodeURIComponent(serverMeetingId)}`, {
          method: "DELETE",
        }).catch(() => {});
      }
    }
    toggleCrmRowSelection(sectionKey, rowId, false);
  }

  function onRestore(sectionKey, rowId) {
    if (!isCrmAdmin) {
      return;
    }
    const targetRow = (moduleData?.[sectionKey] || []).find((row) => String(row?.id) === String(rowId)) || null;
    setModuleData((prev) => ({
      ...prev,
      [sectionKey]: (prev[sectionKey] || []).map((row) => (
        String(row.id) === String(rowId)
          ? {
              ...row,
              isDeleted: false,
              is_deleted: false,
              deletedAt: "",
              deleted_at: "",
              deletedBy: "",
            }
          : row
      )),
    }));
    const sectionLabelMap = {
      leads: "Lead",
      deals: "Deal",
      salesOrders: "Sales Order",
      contacts: "Contact",
      followUps: "Follow-up",
      meetings: "Meeting",
      activities: "Activity",
      teams: "Team",
    };
    const rowLabel = sectionLabelMap[String(sectionKey || "").trim()] || "CRM Item";
    const primaryName = String(
      targetRow?.name
      || targetRow?.leadName
      || targetRow?.dealName
      || targetRow?.customerName
      || targetRow?.subject
      || targetRow?.title
      || targetRow?.company
      || ""
    ).trim();
    const details = primaryName
      ? `${rowLabel} restored: ${primaryName}`
      : `${rowLabel} restored (ID: ${rowId})`;
    apiFetch("/api/business-autopilot/crm/activity-log", {
      method: "POST",
      body: JSON.stringify({
        action: `Restore CRM ${rowLabel}`,
        details,
      }),
    }).catch(() => {});
    if (sectionKey === "meetings") {
      const serverMeetingId = String(targetRow?.serverMeetingId || targetRow?.id || "").trim();
      if (serverMeetingId) {
        apiFetch(`/api/business-autopilot/meetings/${encodeURIComponent(serverMeetingId)}`, {
          method: "PATCH",
          body: JSON.stringify({ is_deleted: false }),
        }).catch(() => {});
      }
    }
    toggleCrmRowSelection(sectionKey, rowId, false);
  }

  function onPermanentDelete(sectionKey, rowId) {
    if (!isCrmAdmin) {
      return;
    }
    const targetRow = (moduleData?.[sectionKey] || []).find((row) => String(row?.id) === String(rowId)) || null;
    setModuleData((prev) => ({
      ...prev,
      [sectionKey]: (prev[sectionKey] || []).filter((row) => String(row.id) !== String(rowId)),
    }));
    if (sectionKey === "meetings") {
      const serverMeetingId = String(targetRow?.serverMeetingId || targetRow?.id || "").trim();
      if (serverMeetingId) {
        apiFetch(`/api/business-autopilot/meetings/${encodeURIComponent(serverMeetingId)}?permanent=1`, {
          method: "DELETE",
        }).catch(() => {});
      }
    }
    toggleCrmRowSelection(sectionKey, rowId, false);
  }

  function openDeletedItemsView(sectionKey, event) {
    if (!isCrmAdmin) {
      return;
    }
    const normalizedSection = String(sectionKey || "").trim();
    setDeletedViewSection(normalizedSection);
    window.requestAnimationFrame(() => {
      setDeletedViewSection(normalizedSection);
    });
    if (normalizedSection === "leads") {
      setLeadStatusTab("all");
    } else if (normalizedSection === "contacts") {
      setContactTagTab("all");
    } else if (normalizedSection === "deals") {
      setDealStatusTab("all");
    } else if (normalizedSection === "meetings") {
      setMeetingStatusTab("all");
    } else if (normalizedSection === "followUps") {
      setFollowUpStatusTab("all");
    }
  }

  function onConvertLeadToDeal(leadRow) {
    const leadId = String(leadRow?.id || "").trim();
    if (!leadId) {
      return;
    }
    setModuleData((prev) => {
      const leads = Array.isArray(prev.leads) ? prev.leads : [];
      const deals = Array.isArray(prev.deals) ? prev.deals : [];
      const sourceLead = leads.find((row) => String(row.id) === leadId);
      if (!sourceLead) {
        return prev;
      }
      const nowIso = new Date().toISOString();
      const existingDeal = deals.find((row) => String(row.sourceLeadId || "").trim() === leadId);
      const nextLeads = leads.map((row) => (
        String(row.id) === leadId
          ? {
              ...row,
              status: "Closed",
              stage: row.stage || "Qualified",
              updatedAt: nowIso,
              statusUpdatedAt: nowIso,
            }
          : row
      ));
      if (existingDeal) {
        return { ...prev, leads: nextLeads };
      }
      const expectedValue = String(sourceLead.leadAmount || "").trim();
      const normalizedLeadName = String(sourceLead.name || sourceLead.company || "Lead").trim() || "Lead";
      const normalizedAssignedUsers = Array.isArray(sourceLead.assignedUser)
        ? sourceLead.assignedUser.map((item) => String(item || "").trim()).filter(Boolean)
        : [];
      const dealPayload = {
        id: `deals_${Date.now()}`,
        sourceLeadId: leadId,
        dealName: normalizedLeadName,
        company: String(sourceLead.company || "").trim(),
        dealValueExpected: expectedValue,
        phoneCountryCode: String(sourceLead.phoneCountryCode || "+91").trim(),
        phone: String(sourceLead.phone || "").trim(),
        stage: String(sourceLead.stage || "").trim(),
        assignType: String(sourceLead.assignType || "Users").trim(),
        assignedUser: normalizedAssignedUsers,
        assignedTeam: String(sourceLead.assignedTeam || "").trim(),
        assignedTo: String(sourceLead.assignedTo || "").trim(),
        leadSource: String(sourceLead.leadSource || "").trim(),
        sourceLeadName: String(sourceLead.name || "").trim(),
        sourceLeadStatus: String(sourceLead.status || "").trim(),
        sourceLeadAmount: expectedValue,
        wonAmountFinal: "",
        status: "Open",
        createdBy: String(currentUserName || "Current User").trim(),
      };
      return {
        ...prev,
        leads: nextLeads,
        deals: [dealPayload, ...deals],
      };
    });
    setActiveSection("deals");
  }

  function buildLeadSyncedDealPatch(leadRow = {}) {
    const normalizedLeadName = String(leadRow?.name || leadRow?.company || "Lead").trim() || "Lead";
    const expectedValue = String(leadRow?.leadAmount || "").trim();
    const normalizedAssignedUsers = Array.isArray(leadRow?.assignedUser)
      ? leadRow.assignedUser.map((item) => String(item || "").trim()).filter(Boolean)
      : [];
    return {
      dealName: normalizedLeadName,
      company: String(leadRow?.company || "").trim(),
      dealValueExpected: expectedValue,
      phoneCountryCode: String(leadRow?.phoneCountryCode || "+91").trim(),
      phone: String(leadRow?.phone || "").trim(),
      stage: String(leadRow?.stage || "").trim(),
      assignType: String(leadRow?.assignType || "Users").trim(),
      assignedUser: normalizedAssignedUsers,
      assignedTeam: String(leadRow?.assignedTeam || "").trim(),
      assignedTo: String(leadRow?.assignedTo || "").trim(),
      leadSource: String(leadRow?.leadSource || "").trim(),
      sourceLeadName: String(leadRow?.name || "").trim(),
      sourceLeadStatus: String(leadRow?.status || "").trim(),
      sourceLeadAmount: expectedValue,
      updatedAt: new Date().toISOString(),
    };
  }

  function onConvertDealToSalesOrder(dealRow) {
    const dealId = String(dealRow?.id || "").trim();
    if (!dealId) {
      return;
    }
    setModuleData((prev) => {
      const deals = Array.isArray(prev.deals) ? prev.deals : [];
      const salesOrders = Array.isArray(prev.salesOrders) ? prev.salesOrders : [];
      const sourceDeal = deals.find((row) => String(row.id) === dealId);
      if (!sourceDeal) {
        return prev;
      }
      const existingOrder = salesOrders.find((row) => String(row.sourceDealId || "").trim() === dealId);
      if (existingOrder) {
        return prev;
      }
      const now = new Date();
      const monthCode = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}`;
      const orderId = `SO-${monthCode}-${String(salesOrders.length + 1).padStart(4, "0")}`;
      const finalAmount = parseNumber(sourceDeal.wonAmountFinal);
      const expectedAmount = parseNumber(sourceDeal.dealValueExpected);
      const orderAmount = finalAmount || expectedAmount || 0;
      const sourceLead = (Array.isArray(prev.leads) ? prev.leads : []).find((lead) => String(lead.id || "").trim() === String(sourceDeal.sourceLeadId || "").trim());
      const salesOrderRow = {
        id: `salesOrders_${Date.now()}`,
        sourceDealId: dealId,
        orderId,
        customerName: String(sourceLead?.name || sourceDeal.dealName || "Customer").trim(),
        company: String(sourceDeal.company || sourceLead?.company || "").trim(),
        phone: String(sourceLead?.phone || "").trim(),
        amount: String(orderAmount || ""),
        quantity: "1",
        price: String(orderAmount || ""),
        tax: "0",
        status: "Pending",
        createdBy: String(currentUserName || "Current User").trim(),
      };
      return {
        ...prev,
        salesOrders: [salesOrderRow, ...salesOrders],
      };
    });
    setActiveSection("salesOrders");
  }

  async function onSubmit(sectionKey, event) {
    event.preventDefault();
    const config = CRM_SECTION_CONFIG[sectionKey];
    const values = forms[sectionKey] || {};
    const syncedValuesResult = syncDateTimeFieldValuesFromForm(event.currentTarget, config.fields, values);
    const effectiveValues = syncedValuesResult.values;
    if (syncedValuesResult.changed) {
      setForms((prev) => ({
        ...prev,
        [sectionKey]: {
          ...prev[sectionKey],
          ...effectiveValues,
        },
      }));
    }
    const invalidEmailFields = config.fields.filter((field) => {
      if (!isCrmFieldRequired(sectionKey, field, effectiveValues)) {
        return false;
      }
      const hasEmailFieldKey = String(field?.key || "").toLowerCase().includes("email");
      if (!hasEmailFieldKey) {
        return false;
      }
      const fieldValue = String(effectiveValues[field.key] || "").trim();
      if (!fieldValue) {
        return false;
      }
      return !EMAIL_ADDRESS_RE.test(fieldValue);
    });
    const missingFields = config.fields.filter((field) => {
      if (!isCrmFieldRequired(sectionKey, field, effectiveValues)) {
        return false;
      }
      if (field.type === "date") {
        return !normalizeMeetingDateValue(effectiveValues[field.key]);
      }
      if (field.type === "time") {
        return !normalizeMeetingTimeValue(effectiveValues[field.key]);
      }
      if (field.type === "multiselect") {
        return !Array.isArray(effectiveValues[field.key]) || effectiveValues[field.key].length === 0;
      }
      return !String(effectiveValues[field.key] || "").trim();
    });
    if (sectionKey === "teams" && !selectedTeamDepartments.length && !selectedTeamEmployeeRoles.length) {
      missingFields.push({ key: "departmentFilters", label: "Select Department or Employee Role" });
    }
    if (missingFields.length || invalidEmailFields.length) {
      const missingFieldMap = {};
      missingFields.forEach((field) => {
        missingFieldMap[field.key] = true;
      });
      invalidEmailFields.forEach((field) => {
        missingFieldMap[field.key] = true;
      });
      const formErrors = [];
      if (missingFields.length) {
        formErrors.push(`Please fill mandatory fields: ${missingFields.map((field) => field.label).join(", ")}`);
      }
      if (invalidEmailFields.length) {
        formErrors.push(`Please enter valid email in: ${invalidEmailFields.map((field) => field.label).join(", ")}`);
      }
      setSectionFieldErrors((prev) => ({ ...prev, [sectionKey]: missingFieldMap }));
      setSectionFormErrors((prev) => ({
        ...prev,
        [sectionKey]: formErrors.join(". "),
      }));
      return;
    }
    if (sectionKey === "meetings") {
      const meetingDate = normalizeMeetingDateValue(effectiveValues.meetingDate);
      const meetingTime = normalizeMeetingTimeValue(effectiveValues.meetingTime);
      const todayDate = getTodayIsoDate();
      if (meetingDate && meetingDate < todayDate) {
        setSectionFieldErrors((prev) => ({
          ...prev,
          [sectionKey]: {
            ...(prev[sectionKey] || {}),
            meetingDate: true,
          },
        }));
        setSectionFormErrors((prev) => ({
          ...prev,
          [sectionKey]: "Meeting Date cannot be in the past.",
        }));
        return;
      }
      if (meetingDate === todayDate && meetingTime) {
        const currentTime = getCurrentTimeHm();
        if (meetingTime < currentTime) {
          setSectionFieldErrors((prev) => ({
            ...prev,
            [sectionKey]: {
              ...(prev[sectionKey] || {}),
              meetingTime: true,
            },
          }));
          setSectionFormErrors((prev) => ({
            ...prev,
            [sectionKey]: "Meeting Time cannot be in the past for today's date.",
          }));
          return;
        }
      }
    }
    setSectionFieldErrors((prev) => ({ ...prev, [sectionKey]: {} }));
    setSectionFormErrors((prev) => ({ ...prev, [sectionKey]: "" }));
    const editingId = editingIds[sectionKey];
    const isEditFlow = Boolean(editingId);
    const existingRowForEdit = editingId
      ? (moduleData[sectionKey] || []).find((row) => String(row.id) === String(editingId))
      : null;
    if (editingId && existingRowForEdit && !canEditCrmRow(sectionKey, existingRowForEdit)) {
      setSectionFormErrors((prev) => ({
        ...prev,
        [sectionKey]: "You can edit only records assigned to you.",
      }));
      return;
    }
    let payload = {};
    config.fields.forEach((field) => {
      if (field.type === "multiselect") {
        payload[field.key] = Array.isArray(effectiveValues[field.key]) ? effectiveValues[field.key].map((v) => String(v).trim()).filter(Boolean) : [];
      } else if (field.type === "date") {
        payload[field.key] = normalizeMeetingDateValue(effectiveValues[field.key]);
      } else if (field.type === "time") {
        payload[field.key] = normalizeMeetingTimeValue(effectiveValues[field.key]);
      } else {
        payload[field.key] = String(effectiveValues[field.key] || "").trim();
      }
    });
    if (sectionKey === "leads") {
      const nowIso = new Date().toISOString();
      const previousLead = editingId
        ? (moduleData.leads || []).find((row) => String(row.id || "").trim() === String(editingId || "").trim())
        : null;
      const previousStatus = String(previousLead?.status || "").trim().toLowerCase();
      const nextStatus = String(payload.status || "").trim().toLowerCase();
      const isClosedLike = ["closed", "onhold"].includes(nextStatus);
      const assignType = String(payload.assignType || "Users").trim();
      payload.assignedTo = assignType.toLowerCase() === "team"
        ? String(payload.assignedTeam || "").trim()
        : (Array.isArray(payload.assignedUser) ? payload.assignedUser.join(", ") : String(payload.assignedUser || "").trim());
      payload.createdBy = String(currentUserName || "Current User").trim();
      payload.updatedAt = nowIso;
      if (!editingId) {
        payload.createdAt = nowIso;
      } else if (previousLead?.createdAt) {
        payload.createdAt = String(previousLead.createdAt || "").trim();
      }
      if (isClosedLike) {
        payload.statusUpdatedAt = previousStatus !== nextStatus
          ? nowIso
          : String(previousLead?.statusUpdatedAt || previousLead?.updatedAt || nowIso).trim();
      } else {
        payload.statusUpdatedAt = "";
      }
      payload = normalizeCrmLeadRecord(payload);
    }
    if (sectionKey === "contacts") {
      payload = normalizeCrmContactRecord(payload);
    }
    if (sectionKey === "teams") {
      payload.createdBy = String(currentUserName || "Current User").trim();
      payload.departmentFilters = [...selectedTeamDepartments];
      payload.employeeRoleFilters = [...selectedTeamEmployeeRoles];
      payload = normalizeCrmTeamRecord(payload);
    }
    if (sectionKey === "meetings") {
      const meetingOwners = Array.isArray(payload.owner)
        ? payload.owner.map((item) => String(item || "").trim()).filter(Boolean)
        : String(payload.owner || "")
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean);
      const reminderChannels = Array.isArray(payload.reminderChannel) ? payload.reminderChannel : [payload.reminderChannel].filter(Boolean);
      payload.meetingDate = normalizeMeetingDateValue(payload.meetingDate);
      payload.meetingTime = normalizeMeetingTimeValue(payload.meetingTime);
      payload.owner = meetingOwners.join(", ");
      payload.ownerUserIds = buildMeetingOwnerUserIds(meetingOwners);
      payload.reminderChannel = reminderChannels;
      payload.reminderDays = parseCrmMeetingReminderDayValues(payload.reminderDays);
      payload.reminderMinutes = parseCrmMeetingReminderMinuteValues(payload.reminderMinutes);
      payload.reminderSummary = buildCrmMeetingReminderSummary(reminderChannels, payload.reminderDays, payload.reminderMinutes);
    }
    if (sectionKey === "activities") {
      const activityOwners = Array.isArray(payload.owner)
        ? payload.owner.map((item) => String(item || "").trim()).filter(Boolean)
        : String(payload.owner || "")
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean);
      payload.owner = activityOwners.join(", ");
    }
    if (sectionKey === "followUps") {
      const normalizedStatus = String(payload.status || "").trim().toLowerCase();
      const existingFollowUp = editingId ? (moduleData.followUps || []).find((row) => String(row.id) === String(editingId)) : null;
      const existingCompletedDate = existingFollowUp ? String(getFollowUpCompletedDate(existingFollowUp) || "").trim() : "";
      if (normalizedStatus === "completed") {
        payload.completedDate = existingCompletedDate || getTodayIsoDate();
      } else {
        payload.completedDate = "";
      }
    }
    let meetingServerId = "";
    if (sectionKey === "meetings") {
      const meetingApiPayload = {
        title: payload.title || "",
        company_or_client_name: payload.companyOrClientName || "",
        related_to: payload.relatedTo || "",
        meeting_date: payload.meetingDate || "",
        meeting_time: payload.meetingTime || "",
        owner: payload.owner || "",
        owner_user_ids: Array.isArray(payload.ownerUserIds) ? payload.ownerUserIds : [],
        meeting_mode: payload.meetingMode || "",
        reminder_channel: Array.isArray(payload.reminderChannel) ? payload.reminderChannel : [],
        reminder_days: Array.isArray(payload.reminderDays) ? payload.reminderDays : [],
        reminder_minutes: Array.isArray(payload.reminderMinutes) ? payload.reminderMinutes : [],
        reminder_summary: payload.reminderSummary || "",
        status: payload.status || "Scheduled",
        is_deleted: false,
      };
      try {
        const existingServerId = String(existingRowForEdit?.serverMeetingId || existingRowForEdit?.id || "").trim();
        const response = existingServerId
          ? await apiFetch(`/api/business-autopilot/meetings/${encodeURIComponent(existingServerId)}`, {
              method: "PATCH",
              body: JSON.stringify(meetingApiPayload),
            })
          : await apiFetch("/api/business-autopilot/meetings", {
              method: "POST",
              body: JSON.stringify(meetingApiPayload),
            });
        const backendMeeting = response?.meeting ? normalizeCrmMeetingRecord(response.meeting) : null;
        if (backendMeeting) {
          meetingServerId = String(backendMeeting.serverMeetingId || backendMeeting.id || "").trim();
          payload = {
            ...payload,
            ...backendMeeting,
            serverMeetingId: meetingServerId || payload.serverMeetingId || "",
            id: String(backendMeeting.id || existingRowForEdit?.id || "").trim() || payload.id,
          };
        }
      } catch (_error) {
        setSectionFormErrors((prev) => ({
          ...prev,
          [sectionKey]: "Unable to save meeting reminder settings. Please try again.",
        }));
        return;
      }
    }
    setModuleData((prev) => {
      const rows = prev[sectionKey] || [];
      if (editingId) {
        const nextRows = rows.map((row) => (
          String(row.id) === String(editingId)
            ? { ...row, ...payload, createdBy: row.createdBy || payload.createdBy || currentUserName }
            : row
        ));
        if (sectionKey === "leads") {
          const syncedLead = nextRows.find((row) => String(row.id) === String(editingId));
          const syncedDealPatch = buildLeadSyncedDealPatch(syncedLead || {});
          const nextDeals = (prev.deals || []).map((row) => (
            String(row.sourceLeadId || "").trim() === String(editingId).trim()
              ? {
                  ...row,
                  ...syncedDealPatch,
                }
              : row
          ));
          return {
            ...prev,
            [sectionKey]: nextRows,
            deals: nextDeals,
          };
        }
        return {
          ...prev,
          [sectionKey]: nextRows,
        };
      }
      const newRowId = sectionKey === "meetings"
        ? (String(meetingServerId || payload.serverMeetingId || payload.id || "").trim() || `${sectionKey}_${Date.now()}`)
        : `${sectionKey}_${Date.now()}`;
      return {
        ...prev,
        [sectionKey]: [{ id: newRowId, ...payload, serverMeetingId: meetingServerId || payload.serverMeetingId || "" }, ...rows],
      };
    });
    resetSectionForm(sectionKey);
    setCrmActionPopup({
      open: true,
      title: isEditFlow ? "Edit Completed" : "Created",
      message: isEditFlow
        ? `${config.itemLabel} updated successfully.`
        : `${config.itemLabel} created successfully.`,
    });
  }

  function toggleCrmTeamCategory(categoryType, value) {
    const normalizedValue = String(value || "").trim();
    if (!normalizedValue) {
      return;
    }
    const isDepartment = categoryType === "department";
    const currentValues = isDepartment ? selectedTeamDepartments : selectedTeamEmployeeRoles;
    const nextCategoryValues = currentValues.includes(normalizedValue)
      ? currentValues.filter((item) => item !== normalizedValue)
      : [...currentValues, normalizedValue];
    if (isDepartment) {
      setSelectedTeamDepartments(nextCategoryValues);
    } else {
      setSelectedTeamEmployeeRoles(nextCategoryValues);
    }

    setForms((prev) => {
      const currentMembers = Array.isArray(prev.teams?.members) ? prev.teams.members : [];
      const matches = crmDirectoryOptions
        .filter((item) => (
          isDepartment
            ? nextCategoryValues.includes(String(item.department || "").trim())
            : nextCategoryValues.includes(String(item.employeeRole || "").trim())
        ))
        .map((item) => item.name);
      return {
        ...prev,
        teams: {
          ...prev.teams,
          members: Array.from(new Set([...currentMembers, ...matches])),
        },
      };
    });
    setSectionFieldErrors((prev) => {
      const teamErrors = { ...(prev.teams || {}) };
      delete teamErrors.members;
      delete teamErrors.departmentFilters;
      return { ...prev, teams: teamErrors };
    });
  }

  function toggleCrmTeamMember(value) {
    const normalizedValue = String(value || "").trim();
    if (!normalizedValue) {
      return;
    }
    setForms((prev) => {
      const currentMembers = Array.isArray(prev.teams?.members) ? prev.teams.members : [];
      const nextMembers = currentMembers.includes(normalizedValue)
        ? currentMembers.filter((member) => member !== normalizedValue)
        : [...currentMembers, normalizedValue];
      return {
        ...prev,
        teams: {
          ...prev.teams,
          members: nextMembers,
        },
      };
    });
    setSectionFieldErrors((prev) => {
      const teamErrors = { ...(prev.teams || {}) };
      delete teamErrors.members;
      return { ...prev, teams: teamErrors };
    });
  }

  function toggleLeadAssignedUser(value) {
    const normalizedValue = String(value || "").trim();
    if (!normalizedValue) {
      return;
    }
    setForms((prev) => {
      const currentUsers = Array.isArray(prev.leads?.assignedUser)
        ? prev.leads.assignedUser
        : String(prev.leads?.assignedUser || "")
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean);
      const nextUsers = currentUsers.includes(normalizedValue)
        ? currentUsers.filter((item) => item !== normalizedValue)
        : [...currentUsers, normalizedValue];
      return {
        ...prev,
        leads: {
          ...prev.leads,
          assignedUser: nextUsers,
        },
      };
    });
  }

  function toggleFollowUpOwner(value) {
    const normalizedValue = String(value || "").trim();
    if (!normalizedValue) {
      return;
    }
    const currentOwner = String(forms.followUps?.owner || "").trim();
    const nextOwner = currentOwner === normalizedValue ? "" : normalizedValue;
    setForms((prev) => ({
      ...prev,
      followUps: {
        ...prev.followUps,
        owner: nextOwner,
      },
    }));
    setFollowUpOwnerSearch(nextOwner);
    setFollowUpOwnerSearchOpen(false);
  }

  function toggleMeetingEmployee(value) {
    const normalizedValue = String(value || "").trim();
    if (!normalizedValue) {
      return;
    }
    setForms((prev) => {
      const currentOwners = Array.isArray(prev.meetings?.owner)
        ? prev.meetings.owner
        : String(prev.meetings?.owner || "")
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean);
      const nextOwners = currentOwners.includes(normalizedValue)
        ? currentOwners.filter((item) => item !== normalizedValue)
        : [...currentOwners, normalizedValue];
      return {
        ...prev,
        meetings: {
          ...prev.meetings,
          owner: nextOwners,
        },
      };
    });
  }

  function toggleActivityEmployee(value) {
    const normalizedValue = String(value || "").trim();
    if (!normalizedValue) {
      return;
    }
    setForms((prev) => {
      const currentOwners = Array.isArray(prev.activities?.owner)
        ? prev.activities.owner
        : String(prev.activities?.owner || "")
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean);
      const nextOwners = currentOwners.includes(normalizedValue)
        ? currentOwners.filter((item) => item !== normalizedValue)
        : [...currentOwners, normalizedValue];
      return {
        ...prev,
        activities: {
          ...prev.activities,
          owner: nextOwners,
        },
      };
    });
  }

  function toggleMeetingReminderChannel(value) {
    const normalizedValue = String(value || "").trim();
    if (!normalizedValue) {
      return;
    }
    setForms((prev) => {
      const currentChannels = Array.isArray(prev.meetings?.reminderChannel) ? prev.meetings.reminderChannel : [];
      const nextChannels = currentChannels.includes(normalizedValue)
        ? currentChannels.filter((item) => item !== normalizedValue)
        : [...currentChannels, normalizedValue];
      return {
        ...prev,
        meetings: {
          ...prev.meetings,
          reminderChannel: nextChannels,
        },
      };
    });
  }

  function toggleMeetingReminderDay(value) {
    const normalizedValue = String(value || "").trim();
    if (!normalizedValue) {
      return;
    }
    setForms((prev) => {
      const currentDays = parseCrmMeetingReminderDayValues(prev.meetings?.reminderDays);
      const nextDays = currentDays.includes(normalizedValue)
        ? currentDays.filter((item) => item !== normalizedValue)
        : parseCrmMeetingReminderDayValues([...currentDays, normalizedValue]);
      return {
        ...prev,
        meetings: {
          ...prev.meetings,
          reminderDays: nextDays,
        },
      };
    });
  }

  function toggleMeetingReminderMinute(value) {
    const normalizedValue = String(value || "").trim();
    if (!normalizedValue) {
      return;
    }
    setForms((prev) => {
      const currentMinutes = parseCrmMeetingReminderMinuteValues(prev.meetings?.reminderMinutes);
      const nextMinutes = currentMinutes.includes(normalizedValue)
        ? currentMinutes.filter((item) => item !== normalizedValue)
        : parseCrmMeetingReminderMinuteValues([...currentMinutes, normalizedValue]);
      return {
        ...prev,
        meetings: {
          ...prev.meetings,
          reminderMinutes: nextMinutes,
        },
      };
    });
  }

  function importRows(sectionKey, importedRows) {
    const config = CRM_SECTION_CONFIG[sectionKey];
    const expectedHeaders = (config.columns || []).map((column) => column.label);
    const headerValidation = validateImportHeaders(importedRows, expectedHeaders);
    if (!headerValidation.isValid) {
      return {
        isError: true,
        totalRows: Array.isArray(importedRows) ? importedRows.length : 0,
        newRows: 0,
        replacedRows: 0,
        skippedRows: Array.isArray(importedRows) ? importedRows.length : 0,
        message: buildHeaderValidationMessage(
          `${config.label} table`,
          headerValidation.missing,
          headerValidation.unexpected
        ),
      };
    }
    const columnByHeader = new Map();
    config.columns.forEach((column) => {
      columnByHeader.set(normalizeImportHeader(column.label), column);
      columnByHeader.set(normalizeImportHeader(column.key), column);
    });
    const fieldByHeader = new Map();
    config.fields.forEach((field) => {
      fieldByHeader.set(normalizeImportHeader(field.label), field);
      fieldByHeader.set(normalizeImportHeader(field.key), field);
    });

    const defaultValues = buildEmptyValues(config.fields);
    const nextRows = importedRows
      .map((row, rowIndex) => {
        const payload = {
          ...defaultValues,
          id: `${sectionKey}_import_${Date.now()}_${rowIndex}`,
        };

        Object.entries(row || {}).forEach(([header, rawValue]) => {
          const column = columnByHeader.get(normalizeImportHeader(header));
          const field = fieldByHeader.get(normalizeImportHeader(header));
          if (!column && !field) {
            return;
          }
          const value = String(rawValue || "").trim();
          const fieldMeta = field?.type === "multiselect" ? field : field || column;
          const fieldKey = fieldMeta?.key || column?.key;
          if (!fieldKey) {
            return;
          }
          if (sectionKey === "teams" && fieldKey === "members" && /^\d+$/.test(value)) {
            payload.members = [];
            payload.employeeCount = value;
            return;
          }
          if (fieldKey === "phone") {
            const phoneMatch = value.match(/^(\+\d{1,4})\s+(.+)$/);
            if (phoneMatch) {
              payload.phoneCountryCode = phoneMatch[1].trim();
              payload.phone = phoneMatch[2].trim();
            } else {
              payload.phone = value;
            }
            return;
          }
          if (sectionKey === "meetings" && fieldKey === "meetingTime") {
            const twelveHourMatch = value.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
            if (twelveHourMatch) {
              let hours = Number(twelveHourMatch[1]);
              const minutes = twelveHourMatch[2];
              const suffix = twelveHourMatch[3].toUpperCase();
              if (suffix === "PM" && hours < 12) hours += 12;
              if (suffix === "AM" && hours === 12) hours = 0;
              payload.meetingTime = `${String(hours).padStart(2, "0")}:${minutes}`;
            } else {
              payload.meetingTime = value;
            }
            return;
          }
          if (fieldKey === "reminderSummary") {
            payload.reminderSummary = value;
            const reminderSegments = value.split("•").map((item) => item.trim()).filter(Boolean);
            if (reminderSegments.length) {
              payload.reminderChannel = reminderSegments[0]
                .split(",")
                .map((item) => item.trim())
                .filter(Boolean);
              const reminderMeta = reminderSegments.slice(1).join(" • ").toLowerCase();
              const parsedReminderDays = [];
              if (/\bsame day\b/i.test(reminderMeta)) {
                parsedReminderDays.push("0");
              }
              if (/\b1\s*week\b/i.test(reminderMeta)) {
                parsedReminderDays.push("7");
              }
              for (const match of reminderMeta.matchAll(/(\d+)\s*day/gi)) {
                parsedReminderDays.push(match[1]);
              }
              if (parsedReminderDays.length) {
                payload.reminderDays = parseCrmMeetingReminderDayValues(parsedReminderDays);
              }
              const reminderMinuteOption = CRM_MEETING_REMINDER_MINUTE_OPTIONS.find((option) => reminderMeta.includes(option.label.toLowerCase()));
              if (reminderMinuteOption) {
                payload.reminderMinutes = [reminderMinuteOption.value];
              } else {
                const reminderMatch = reminderMeta.match(/(\d+)\s*min/i);
                if (reminderMatch) {
                  payload.reminderMinutes = [reminderMatch[1]];
                }
              }
            }
            return;
          }
          payload[fieldKey] = fieldMeta?.type === "multiselect" ? parseMultiSelectImportValue(value) : value;
        });

        if (sectionKey === "meetings") {
          const reminderChannels = Array.isArray(payload.reminderChannel)
            ? payload.reminderChannel
            : String(payload.reminderChannel || "")
              .split(",")
              .map((item) => item.trim())
              .filter(Boolean);
          payload.reminderChannel = reminderChannels.length ? reminderChannels : defaultValues.reminderChannel;
          payload.reminderDays = parseCrmMeetingReminderDayValues(payload.reminderDays);
          payload.reminderMinutes = parseCrmMeetingReminderMinuteValues(payload.reminderMinutes);
          payload.reminderSummary = payload.reminderSummary
            || buildCrmMeetingReminderSummary(payload.reminderChannel, payload.reminderDays, payload.reminderMinutes);
        }

        return payload;
      })
      .filter((row) =>
        config.columns.some((column) => String(row[column.key] || "").trim() !== "")
          || config.fields.some((field) => {
            if (field.type === "multiselect") {
              return Array.isArray(row[field.key]) && row[field.key].length > 0;
            }
            return String(row[field.key] || "").trim() !== "";
          })
      );

    if (!nextRows.length) {
      return {
        isError: true,
        totalRows: Array.isArray(importedRows) ? importedRows.length : 0,
        newRows: 0,
        replacedRows: 0,
        skippedRows: Array.isArray(importedRows) ? importedRows.length : 0,
        message: "No valid rows found in the imported file.",
      };
    }

    const existingRows = Array.isArray(moduleData[sectionKey]) ? moduleData[sectionKey] : [];
    const updatedExistingRows = [...existingRows];
    const existingKeyToIndex = new Map();
    updatedExistingRows.forEach((row, index) => {
      const key = buildCrmImportDedupKey(sectionKey, row);
      if (key && !existingKeyToIndex.has(key)) {
        existingKeyToIndex.set(key, index);
      }
    });
    const newImportedRows = [];
    const newKeyToIndex = new Map();
    let replacedRows = 0;
    let newRows = 0;

    nextRows.forEach((row) => {
      const dedupKey = buildCrmImportDedupKey(sectionKey, row);
      if (!dedupKey) {
        newImportedRows.push(row);
        newRows += 1;
        return;
      }
      if (existingKeyToIndex.has(dedupKey)) {
        const rowIndex = existingKeyToIndex.get(dedupKey);
        const previous = updatedExistingRows[rowIndex] || {};
        updatedExistingRows[rowIndex] = {
          ...previous,
          ...row,
          id: previous.id || row.id,
        };
        replacedRows += 1;
        return;
      }
      if (newKeyToIndex.has(dedupKey)) {
        const rowIndex = newKeyToIndex.get(dedupKey);
        const previous = newImportedRows[rowIndex] || {};
        newImportedRows[rowIndex] = {
          ...previous,
          ...row,
          id: previous.id || row.id,
        };
        replacedRows += 1;
        return;
      }
      newKeyToIndex.set(dedupKey, newImportedRows.length);
      newImportedRows.push(row);
      newRows += 1;
    });

    const skippedRows = Math.max(0, nextRows.length - (newRows + replacedRows));
    if (!newRows && !replacedRows) {
      return {
        isError: true,
        totalRows: nextRows.length,
        newRows: 0,
        replacedRows: 0,
        skippedRows: nextRows.length,
        message: "No records were imported.",
      };
    }

    setModuleData((prev) => ({
      ...prev,
      [sectionKey]: [...newImportedRows, ...updatedExistingRows],
    }));
    return {
      totalRows: nextRows.length,
      newRows,
      replacedRows,
      skippedRows,
      message: `${newRows} new row(s) added, ${replacedRows} existing row(s) replaced.`,
    };
  }

  const meetingCalendar = useMemo(() => {
    const meetings = moduleData.meetings || [];
    const monthStart = new Date(calendarMonthDate.getFullYear(), calendarMonthDate.getMonth(), 1);
    const monthEnd = new Date(calendarMonthDate.getFullYear(), calendarMonthDate.getMonth() + 1, 0);
    const startOffset = (monthStart.getDay() + 6) % 7;
    const gridStart = new Date(monthStart);
    gridStart.setDate(monthStart.getDate() - startOffset);
    const cells = [];
    for (let i = 0; i < 42; i += 1) {
      const current = new Date(gridStart);
      current.setDate(gridStart.getDate() + i);
      const isoDate = `${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, "0")}-${String(current.getDate()).padStart(2, "0")}`;
      cells.push({
        isoDate,
        day: current.getDate(),
        inMonth: current >= monthStart && current <= monthEnd,
        meetings: meetings
          .filter((row) => String(row.meetingDate || "") === isoDate)
          .sort((a, b) => String(a.meetingTime || "").localeCompare(String(b.meetingTime || ""))),
      });
    }
    return {
      monthLabel: monthStart.toLocaleString("en-US", { month: "long", year: "numeric" }),
      cells,
    };
  }, [calendarMonthDate, moduleData.meetings]);

  function changeCalendarMonth(offset) {
    setCalendarMonthDate((prev) => new Date(prev.getFullYear(), prev.getMonth() + offset, 1));
  }

  function isMeetingOverdue(row) {
    const status = String(row?.status || "").trim().toLowerCase();
    const meetingDate = String(row?.meetingDate || "").trim();
    if (status !== "scheduled") return false;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(meetingDate)) return false;
    return meetingDate < getTodayIsoDate();
  }

  function getMeetingCalendarPillClass(row) {
    if (isMeetingOverdue(row)) {
      return "crm-meeting-pill-overdue";
    }
    const normalizedStatus = String(row?.status || "").trim().toLowerCase();
    if (normalizedStatus === "completed") {
      return "crm-meeting-pill-completed";
    }
    if (normalizedStatus === "rescheduled") {
      return "crm-meeting-pill-rescheduled";
    }
    if (normalizedStatus === "cancelled") {
      return "crm-meeting-pill-cancelled";
    }
    if (normalizedStatus === "missed") {
      return "crm-meeting-pill-missed";
    }
    return "crm-meeting-pill-scheduled";
  }

  function openMeetingPopup(row) {
    setMeetingPopup(row);
  }

  function closeMeetingPopup() {
    setMeetingPopup(null);
  }

  function updateMeetingStatus(meetingId, nextStatus) {
    const status = String(nextStatus || "").trim();
    if (!meetingId || !status) return;
    setModuleData((prev) => ({
      ...prev,
      meetings: (prev.meetings || []).map((row) => (
        String(row.id) === String(meetingId) ? { ...row, status } : row
      )),
    }));
    setMeetingPopup((prev) => (
      prev && String(prev.id) === String(meetingId) ? { ...prev, status } : prev
    ));
  }

  function openTeamMembersPopup(row) {
    const members = Array.from(new Set(parseTeamMemberList(row?.members)));
    const count = Number.isFinite(parseInt(String(row?.employeeCount || "").trim(), 10))
      ? parseInt(String(row?.employeeCount || "").trim(), 10)
      : members.length;
    setTeamMembersPopup({
      title: "Team Employees",
      name: String(row?.name || "Team").trim(),
      members,
      count,
    });
  }

  function openLeadAssignedEmployeesPopup(row) {
    const assignType = String(row?.assignType || "").trim().toLowerCase();
    if (assignType === "team") {
      const assignedTeamName = String(row?.assignedTeam || row?.assignedTo || "").trim();
      const matchedTeam = (moduleData.teams || []).find(
        (team) => String(team?.name || "").trim().toLowerCase() === assignedTeamName.toLowerCase()
      );
      const members = Array.from(new Set(parseTeamMemberList(matchedTeam?.members)));
      setTeamMembersPopup({
        title: "Assigned Employees",
        name: assignedTeamName || "Assigned Team",
        members,
        count: members.length,
      });
      return;
    }
    const members = Array.isArray(row?.assignedUser)
      ? row.assignedUser.map((item) => String(item || "").trim()).filter(Boolean)
      : String(row?.assignedUser || row?.assignedTo || "")
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);
    setTeamMembersPopup({
      title: "Assigned Employees",
      name: String(row?.name || row?.company || "Lead").trim(),
      members: Array.from(new Set(members)),
      count: members.length,
    });
  }

  function closeTeamMembersPopup() {
    setTeamMembersPopup(null);
  }

  function openDealQuickEditPopup(row) {
    const dealId = String(row?.id || "").trim();
    if (!dealId) {
      return;
    }
    setDealQuickEditPopup({
      id: dealId,
      dealName: String(row?.dealName || row?.name || "").trim() || "Deal",
      dealValueExpected: String(row?.dealValueExpected || row?.dealValue || "").trim(),
      wonAmountFinal: String(row?.wonAmountFinal || "").trim(),
      status: String(row?.status || "Open").trim() || "Open",
      error: "",
    });
  }

  function closeDealQuickEditPopup() {
    setDealQuickEditPopup(null);
  }

  function saveDealQuickEditPopup(event) {
    event.preventDefault();
    if (!dealQuickEditPopup?.id) {
      setDealQuickEditPopup((prev) => (prev ? { ...prev, error: "Invalid deal selected." } : prev));
      return;
    }
    const normalizedWonAmount = formatCurrencyNumberInput(
      sanitizeCurrencyInput(dealQuickEditPopup.wonAmountFinal || ""),
      crmCurrencyCode
    );
    const wonAmountNumber = parseNumber(normalizedWonAmount);
    const expectedAmountNumber = parseNumber(dealQuickEditPopup.dealValueExpected || "");
    if (expectedAmountNumber > 0 && wonAmountNumber > expectedAmountNumber) {
      setDealQuickEditPopup((prev) => (
        prev
          ? {
              ...prev,
              error: `Won Amount cannot exceed Deal Value (${formatCurrencyAmount(expectedAmountNumber, crmCurrencyCode)}).`,
            }
          : prev
      ));
      return;
    }
    const nextStatus = String(dealQuickEditPopup.status || "").trim();
    if (!nextStatus) {
      setDealQuickEditPopup((prev) => (prev ? { ...prev, error: "Status is required." } : prev));
      return;
    }
    setModuleData((prev) => ({
      ...prev,
      deals: (prev.deals || []).map((row) => (
        String(row.id || "").trim() === dealQuickEditPopup.id
          ? {
              ...row,
              wonAmountFinal: normalizedWonAmount,
              status: nextStatus,
              updatedAt: new Date().toISOString(),
            }
          : row
      )),
    }));
    setDealQuickEditPopup(null);
  }

  return (
    <div className="d-flex flex-column gap-3">
      <div>
        <h4 className="mb-2">CRM</h4>
        <p className="text-secondary mb-3">Manage leads, contacts, deals, follow-ups, and activity timeline in one page.</p>
        <div className="d-flex flex-wrap gap-2">
          {sectionOrder.map((sectionKey) => {
            const config = CRM_SECTION_CONFIG[sectionKey];
            const count = (Array.isArray(moduleData[sectionKey]) ? moduleData[sectionKey] : [])
              .filter((row) => isRowAssignedToCurrentUser(sectionKey, row))
              .filter((row) => !isSoftDeletedCrmRow(row))
              .length;
            return (
              <button
                key={`crm-tab-${sectionKey}`}
                type="button"
                className={`btn btn-sm ${activeSection === sectionKey ? "btn-success" : "btn-outline-light"}`}
                onClick={() => setActiveSection(sectionKey)}
              >
                {config.label} ({count})
              </button>
            );
          })}
        </div>
      </div>

      {activeSection === "leads" ? (
        <div className="row g-3">
          {stats.map((item) => (
            <div className="col-12 col-md-6 col-xl-2" key={item.label}>
              <div className="card p-3 h-100 d-flex flex-column align-items-center justify-content-center text-center">
                <div className="stat-icon stat-icon-primary mb-2">
                  <i className={`bi ${item.icon}`} aria-hidden="true" />
                </div>
                <div className="text-secondary small">{item.label}</div>
                <h5 className="mb-0 mt-1">{item.value}</h5>
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {sectionOrder.filter((sectionKey) => sectionKey === activeSection).map((sectionKey) => {
        const config = CRM_SECTION_CONFIG[sectionKey];
        const rows = moduleData[sectionKey] || [];
        const accessibleRows = rows.filter((row) => isRowAssignedToCurrentUser(sectionKey, row));
        const activeRows = accessibleRows.filter((row) => !isSoftDeletedCrmRow(row));
        const deletedRows = accessibleRows.filter((row) => isSoftDeletedCrmRow(row));
        const isDeletedSectionView = isCrmAdmin && deletedViewSection === sectionKey;
        const tableRows = isDeletedSectionView ? deletedRows : activeRows;
        const deletedItemsNotice = isDeletedSectionView
          ? `Deleted ${config.label.toLowerCase()} items older than ${CRM_SOFT_DELETE_RETENTION_DAYS} days will be automatically deleted.`
          : "";
        const leadStatusTabs = [
          { key: "all", label: "All" },
          { key: "open", label: "Open" },
          { key: "closed", label: "Closed" },
          { key: "onhold", label: "Onhold" },
        ];
        const contactTagTabs = [
          { key: "all", label: "All" },
          { key: "client", label: "Clients" },
          { key: "prospect", label: "Prospect" },
          { key: "vendor", label: "Vendors" },
        ];
        const dealStatusTabs = [
          { key: "all", label: "All" },
          { key: "open", label: "Open" },
          { key: "won", label: "Won" },
          { key: "lost", label: "Lost" },
        ];
        const meetingStatusTabs = [
          { key: "all", label: "All" },
          { key: "scheduled", label: "Scheduled" },
          { key: "completed", label: "Completed" },
          { key: "rescheduled", label: "Rescheduled" },
          { key: "cancelled", label: "Cancelled" },
          { key: "missed", label: "Missed" },
        ];
        const followUpStatusTabs = [
          { key: "all", label: "All" },
          ...CRM_FOLLOWUP_STATUS_TABS.map((status) => ({ key: status, label: `${status[0].toUpperCase()}${status.slice(1)}` })),
        ];
        const filteredRows = sectionKey === "leads"
          ? tableRows.filter((row) => {
              if (isDeletedSectionView || leadStatusTab === "all") {
                return true;
              }
              return String(row.status || "").trim().toLowerCase() === leadStatusTab;
            })
          : sectionKey === "contacts"
          ? tableRows.filter((row) => {
              if (isDeletedSectionView || contactTagTab === "all") {
                return true;
              }
              return normalizeCrmContactTag(row.tag).toLowerCase() === contactTagTab;
            })
          : sectionKey === "deals"
          ? tableRows.filter((row) => {
              if (dealStatusTab === "all") {
                return true;
              }
              return String(row.status || "").trim().toLowerCase() === dealStatusTab;
            })
          : sectionKey === "meetings"
          ? tableRows.filter((row) => {
              if (meetingStatusTab === "all") {
                return true;
              }
              return String(row.status || "").trim().toLowerCase() === meetingStatusTab;
            })
          : sectionKey === "followUps"
          ? tableRows.filter((row) => {
              if (followUpStatusTab === "all") {
                return true;
              }
              return getFollowUpEffectiveStatus(row) === followUpStatusTab;
            })
          : tableRows;
        const tableColumns = config.columns.map((column) => {
          if (sectionKey === "leads" && column.key === "leadAmount") {
            return {
              ...column,
              label: `Lead Amount (${crmCurrencyCode})`,
            };
          }
          if (sectionKey === "deals" && (column.key === "dealValueExpected" || column.key === "wonAmountFinal")) {
            return {
              ...column,
              label: `${column.label} (${crmCurrencyCode})`,
            };
          }
          if (sectionKey === "salesOrders" && column.key === "amount") {
            return {
              ...column,
              label: `Amount (${crmCurrencyCode})`,
            };
          }
          return column;
        });
        const leadTabRowsForCount = sectionKey === "leads" ? activeRows : [];
        const contactTabRowsForCount = sectionKey === "contacts" ? activeRows : [];
        const dealTabRowsForCount = sectionKey === "deals" ? activeRows : [];
        const meetingTabRowsForCount = sectionKey === "meetings" ? activeRows : [];
        const followUpTabRowsForCount = sectionKey === "followUps" ? activeRows : [];
        const leadTabCounts = sectionKey === "leads"
          ? leadStatusTabs.reduce((acc, tab) => {
              acc[tab.key] = tab.key === "all"
                ? leadTabRowsForCount.length
                : leadTabRowsForCount.filter((row) => String(row.status || "").trim().toLowerCase() === tab.key).length;
              return acc;
            }, {})
          : {};
        const contactTagCounts = sectionKey === "contacts"
          ? contactTagTabs.reduce((acc, tab) => {
              acc[tab.key] = tab.key === "all"
                ? contactTabRowsForCount.length
                : contactTabRowsForCount.filter((row) => normalizeCrmContactTag(row.tag).toLowerCase() === tab.key).length;
              return acc;
            }, {})
          : {};
        const meetingTabCounts = sectionKey === "meetings"
          ? meetingStatusTabs.reduce((acc, tab) => {
              acc[tab.key] = tab.key === "all"
                ? meetingTabRowsForCount.length
                : meetingTabRowsForCount.filter((row) => String(row.status || "").trim().toLowerCase() === tab.key).length;
              return acc;
            }, {})
          : {};
        const dealTabCounts = sectionKey === "deals"
          ? dealStatusTabs.reduce((acc, tab) => {
              acc[tab.key] = tab.key === "all"
                ? dealTabRowsForCount.length
                : dealTabRowsForCount.filter((row) => String(row.status || "").trim().toLowerCase() === tab.key).length;
              return acc;
            }, {})
          : {};
        const followUpTabCounts = sectionKey === "followUps"
          ? followUpStatusTabs.reduce((acc, tab) => {
              acc[tab.key] = tab.key === "all"
                ? followUpTabRowsForCount.length
                : followUpTabRowsForCount.filter((row) => getFollowUpEffectiveStatus(row) === tab.key).length;
              return acc;
            }, {})
          : {};
        const selectedIdsForSection = Array.isArray(crmSelectedRowIds[sectionKey]) ? crmSelectedRowIds[sectionKey] : [];
        const selectedIdSet = new Set(selectedIdsForSection.map((value) => String(value || "").trim()).filter(Boolean));
        const selectableRowIds = filteredRows
          .filter((row) => {
            if (isDeletedSectionView) {
              return isCrmAdmin;
            }
            return canDeleteCrmRow(sectionKey, row);
          })
          .map((row) => String(row.id || "").trim())
          .filter(Boolean);
        const selectedVisibleCount = selectableRowIds.reduce((count, rowId) => (selectedIdSet.has(rowId) ? count + 1 : count), 0);
        const hasSelectableRows = selectableRowIds.length > 0;
        const allVisibleSelected = hasSelectableRows && selectedVisibleCount === selectableRowIds.length;
        const bulkActions = (
          <div className="d-flex flex-wrap gap-2">
            {hasSelectableRows ? (
              <button
                type="button"
                className="btn btn-sm btn-outline-light"
                onClick={() => toggleCrmSelectAllRows(sectionKey, selectableRowIds, !allVisibleSelected)}
              >
                {allVisibleSelected ? "Unselect All" : "Select All"}
              </button>
            ) : null}
            {selectedVisibleCount > 0 ? (
              isDeletedSectionView ? (
                <>
                  {isCrmAdmin ? (
                    <button
                      type="button"
                      className="btn btn-sm btn-outline-success"
                      onClick={() => onBulkRestore(sectionKey, selectableRowIds.filter((rowId) => selectedIdSet.has(rowId)))}
                    >
                      Restore Selected ({selectedVisibleCount})
                    </button>
                  ) : null}
                  {isCrmAdmin ? (
                    <button
                      type="button"
                      className="btn btn-sm btn-outline-danger"
                      onClick={() => onBulkPermanentDelete(sectionKey, selectableRowIds.filter((rowId) => selectedIdSet.has(rowId)))}
                    >
                      Delete Selected ({selectedVisibleCount})
                    </button>
                  ) : null}
                </>
              ) : (
                <button
                  type="button"
                  className="btn btn-sm btn-outline-danger"
                  onClick={() => onBulkSoftDelete(sectionKey, selectableRowIds.filter((rowId) => selectedIdSet.has(rowId)))}
                >
                  Delete Selected ({selectedVisibleCount})
                </button>
              )
            ) : null}
          </div>
        );
        const formValues = forms[sectionKey] || {};
        const editingId = editingIds[sectionKey] || "";
        const hasPhoneCountryCodeField = config.fields.some((field) => field.key === "phoneCountryCode");
        const leadCompanyQuery = sectionKey === "leads" ? String(formValues.company || "").trim().toLowerCase() : "";
        const dealCompanyQuery = sectionKey === "deals" ? String(formValues.company || "").trim().toLowerCase() : "";
        const meetingCompanyQuery = sectionKey === "meetings" ? String(formValues.companyOrClientName || "").trim().toLowerCase() : "";
        const activityClientQuery = sectionKey === "activities" ? String(formValues.relatedTo || "").trim().toLowerCase() : "";
        const crmContactMatches = sectionKey === "leads"
          ? (moduleData.contacts || []).filter((contact) => {
              if (!leadCompanyQuery) {
                return true;
              }
              const haystack = `${contact.name || ""} ${contact.company || ""} ${contact.email || ""}`.toLowerCase();
              return haystack.includes(leadCompanyQuery);
            }).slice(0, 6)
          : [];
        const dealCrmContactMatches = sectionKey === "deals"
          ? (moduleData.contacts || []).filter((contact) => {
              if (!dealCompanyQuery) {
                return true;
              }
              const haystack = `${contact.name || ""} ${contact.company || ""} ${contact.email || ""}`.toLowerCase();
              return haystack.includes(dealCompanyQuery);
            }).slice(0, 6)
          : [];
        const followUpRelatedToQuery = sectionKey === "followUps" ? String(followUpRelatedToSearch || formValues.relatedTo || "").trim().toLowerCase() : "";
        const hasFollowUpRelatedToQuery = Boolean(followUpRelatedToQuery);
        const followUpRelatedToMatches = sectionKey === "followUps"
          ? followUpRelatedToType === CRM_FOLLOWUP_RELATED_TO_TYPES[0]
            ? (moduleData.leads || []).map((lead) => ({
              id: lead.id,
              label: String(lead.name || lead.company || "").trim() || "Unnamed Lead",
              subText: String(lead.company || lead.name || "").trim() || "-",
              value: String(lead.name || lead.company || "").trim(),
              haystack: `${String(lead.name || "").trim()} ${String(lead.company || "").trim()} ${String(lead.phone || "").trim()}`.toLowerCase(),
            }))
              .filter((lead) => !hasFollowUpRelatedToQuery || lead.haystack.includes(followUpRelatedToQuery))
              .slice(0, 6)
            : followUpRelatedToType === CRM_FOLLOWUP_RELATED_TO_TYPES[1]
              ? (moduleData.contacts || []).map((contact) => ({
                id: contact.id,
                label: String(contact.name || "").trim() || "Unnamed Contact",
                subText: String(contact.company || contact.email || "").trim() || "-",
                value: String(contact.name || contact.company || "").trim(),
                haystack: `${String(contact.name || "").trim()} ${String(contact.company || "").trim()} ${String(contact.email || "").trim()}`.toLowerCase(),
              })).filter((contact) => !hasFollowUpRelatedToQuery || contact.haystack.includes(followUpRelatedToQuery)).slice(0, 6)
              : sharedCustomerOptions.map((customer) => {
                const label = getSharedCustomerDisplayName(customer);
                const haystack = `${label || ""} ${String(customer.companyName || "").trim()} ${String(customer.clientName || "").trim()} ${String(customer.email || "").trim()}`.toLowerCase();
                return {
                  id: customer.id,
                  label,
                  subText: String(customer.companyName || customer.clientName || "").trim() || "-",
                  value: String(label || customer.companyName || customer.clientName || "").trim(),
                  haystack,
                };
              }).filter((customer) => !hasFollowUpRelatedToQuery || customer.haystack.includes(followUpRelatedToQuery)).slice(0, 6)
          : [];
        const customerMatches = sectionKey === "leads"
          ? sharedCustomerOptions.filter((customer) => {
              if (!leadCompanyQuery) {
                return true;
              }
              const haystack = `${customer.companyName || ""} ${customer.clientName || ""} ${customer.email || ""}`.toLowerCase();
              return haystack.includes(leadCompanyQuery);
            }).slice(0, 6)
          : [];
        const dealCustomerMatches = sectionKey === "deals"
          ? sharedCustomerOptions.filter((customer) => {
              if (!dealCompanyQuery) {
                return true;
              }
              const haystack = `${customer.companyName || ""} ${customer.clientName || ""} ${customer.email || ""}`.toLowerCase();
              return haystack.includes(dealCompanyQuery);
            }).slice(0, 6)
          : [];
        const showLeadCompanySuggestions = sectionKey === "leads" && leadCompanySearchOpen;
        const showDealCompanySuggestions = sectionKey === "deals" && dealCompanySearchOpen;
        const meetingCrmContactMatches = sectionKey === "meetings"
          ? (moduleData.contacts || []).filter((contact) => {
              const haystack = `${contact.name || ""} ${contact.company || ""} ${contact.email || ""}`.toLowerCase();
              if (!meetingCompanyQuery) {
                return true;
              }
              return haystack.includes(meetingCompanyQuery);
            }).slice(0, 6)
          : [];
        const meetingCustomerMatches = sectionKey === "meetings"
          ? sharedCustomerOptions.filter((customer) => {
              const haystack = `${customer.companyName || ""} ${customer.clientName || ""} ${customer.email || ""}`.toLowerCase();
              if (!meetingCompanyQuery) {
                return true;
              }
              return haystack.includes(meetingCompanyQuery);
            }).slice(0, 6)
          : [];
        const activityContactMatches = sectionKey === "activities"
          ? (moduleData.contacts || []).filter((contact) => {
              const haystack = `${contact.name || ""} ${contact.company || ""} ${contact.email || ""}`.toLowerCase();
              if (!activityClientQuery) {
                return true;
              }
              return haystack.includes(activityClientQuery);
            }).slice(0, 6)
          : [];
        const activityCustomerMatches = sectionKey === "activities"
          ? sharedCustomerOptions.filter((customer) => {
              const haystack = `${customer.companyName || ""} ${customer.clientName || ""} ${customer.email || ""}`.toLowerCase();
              if (!activityClientQuery) {
                return true;
              }
              return haystack.includes(activityClientQuery);
            }).slice(0, 6)
          : [];
        const selectedLeadAssignedUsers = sectionKey === "leads"
          ? (
              Array.isArray(formValues.assignedUser)
                ? formValues.assignedUser
                : String(formValues.assignedUser || "").split(",")
            ).map((item) => String(item || "").trim()).filter(Boolean)
          : [];
        const filteredLeadAssignedUsers = sectionKey === "leads"
          ? crmDirectoryOptions.filter((item) => {
              const normalizedSearch = String(leadAssignedUserSearch || "").trim().toLowerCase();
              if (!normalizedSearch) {
                return true;
              }
              return [item.name, item.department, item.employeeRole, item.email].join(" ").toLowerCase().includes(normalizedSearch);
            })
          : [];
        const showLeadAssignedUserSuggestions = sectionKey === "leads" && leadAssignedUserSearchOpen;
        const selectedMeetingEmployees = sectionKey === "meetings"
          ? (
              Array.isArray(formValues.owner)
                ? formValues.owner
                : String(formValues.owner || "").split(",")
            ).map((item) => String(item || "").trim()).filter(Boolean)
          : [];
        const filteredMeetingEmployees = sectionKey === "meetings"
          ? crmDirectoryOptions.filter((item) => {
              const normalizedSearch = String(meetingEmployeeSearch || "").trim().toLowerCase();
              if (!normalizedSearch) {
                return true;
              }
              return [item.name, item.department, item.employeeRole, item.email].join(" ").toLowerCase().includes(normalizedSearch);
            })
          : [];
        const selectedActivityEmployees = sectionKey === "activities"
          ? (
              Array.isArray(formValues.owner)
                ? formValues.owner
                : String(formValues.owner || "").split(",")
            ).map((item) => String(item || "").trim()).filter(Boolean)
          : [];
        const filteredActivityEmployees = sectionKey === "activities"
          ? crmDirectoryOptions.filter((item) => {
              const normalizedSearch = String(activityEmployeeSearch || "").trim().toLowerCase();
              if (!normalizedSearch) {
                return true;
              }
              return [item.name, item.department, item.employeeRole, item.email].join(" ").toLowerCase().includes(normalizedSearch);
            })
          : [];
        const selectedFollowUpOwner = sectionKey === "followUps" ? String(formValues.owner || "").trim() : "";
        const filteredFollowUpOwners = sectionKey === "followUps"
          ? crmDirectoryOptions.filter((item) => {
              const normalizedSearch = String(followUpOwnerSearch || "").trim().toLowerCase();
              if (!normalizedSearch) {
                return true;
              }
              return [item.name, item.department, item.employeeRole, item.email].join(" ").toLowerCase().includes(normalizedSearch);
            })
          : [];
        const showFollowUpRelatedToSuggestions = sectionKey === "followUps" && followUpRelatedToSearchOpen;
        const showFollowUpOwnerSuggestions = sectionKey === "followUps" && followUpOwnerSearchOpen;
        const selectedMeetingReminderChannels = sectionKey === "meetings"
          ? (Array.isArray(formValues.reminderChannel) ? formValues.reminderChannel : [])
            .map((item) => String(item || "").trim())
            .filter(Boolean)
          : [];
        const selectedMeetingReminderDays = sectionKey === "meetings"
          ? parseCrmMeetingReminderDayValues(formValues.reminderDays)
          : [];
        const selectedMeetingReminderMinutes = sectionKey === "meetings"
          ? parseCrmMeetingReminderMinuteValues(formValues.reminderMinutes)
          : [];
        const filteredMeetingReminderChannels = sectionKey === "meetings"
          ? CRM_MEETING_REMINDER_CHANNEL_OPTIONS.filter((option) => {
              const normalizedSearch = String(meetingReminderChannelSearch || "").trim().toLowerCase();
              if (!normalizedSearch) {
                return true;
              }
              return option.toLowerCase().includes(normalizedSearch);
            })
          : [];
        const meetingReminderDayOptions = sectionKey === "meetings"
          ? getCrmMeetingReminderDayOptions(formValues.meetingDate)
          : [];
        const filteredMeetingReminderDayOptions = sectionKey === "meetings"
          ? meetingReminderDayOptions.filter((option) => {
              const normalizedSearch = String(meetingReminderDaySearch || "").trim().toLowerCase();
              if (!normalizedSearch) {
                return true;
              }
              return option.label.toLowerCase().includes(normalizedSearch);
            })
          : [];
        const filteredMeetingReminderMinuteOptions = sectionKey === "meetings"
          ? CRM_MEETING_REMINDER_MINUTE_OPTIONS.filter((option) => {
              const normalizedSearch = String(meetingReminderMinuteSearch || "").trim().toLowerCase();
              if (!normalizedSearch) {
                return true;
              }
              return option.label.toLowerCase().includes(normalizedSearch);
            })
          : [];
        const selectedTeamMembers = sectionKey === "teams" && Array.isArray(formValues.members)
          ? formValues.members.map((item) => String(item || "").trim()).filter(Boolean)
          : [];
        const normalizedTeamCategorySearch = String(teamCategorySearch || "").trim().toLowerCase();
        const filteredTeamDepartments = sectionKey === "teams"
          ? crmDepartmentOptions.filter((option) => {
              if (!normalizedTeamCategorySearch) {
                return true;
              }
              return option.toLowerCase().includes(normalizedTeamCategorySearch);
            })
          : [];
        const filteredTeamEmployeeRoles = sectionKey === "teams"
          ? crmEmployeeRoleOptions.filter((option) => {
              if (!normalizedTeamCategorySearch) {
                return true;
              }
              return option.toLowerCase().includes(normalizedTeamCategorySearch);
            })
          : [];
        const showTeamCategorySuggestions = sectionKey === "teams" && teamCategorySearchOpen;
        const showTeamMemberSuggestions = sectionKey === "teams" && teamMemberSearchOpen;
        const availableTeamMembers = sectionKey === "teams"
          ? crmDirectoryOptions.filter((item) => {
              const normalizedSearch = String(teamMemberSearch || "").trim().toLowerCase();
              const matchesDepartment = !selectedTeamDepartments.length || selectedTeamDepartments.includes(String(item.department || "").trim());
              const matchesRole = !selectedTeamEmployeeRoles.length || selectedTeamEmployeeRoles.includes(String(item.employeeRole || "").trim());
              if (!matchesDepartment) {
                return false;
              }
              if (!matchesRole) {
                return false;
              }
              if (!normalizedSearch) {
                return true;
              }
              const haystack = [
                item.name,
                item.department,
                item.employeeRole,
                item.email,
              ].join(" ").toLowerCase();
              return haystack.includes(normalizedSearch);
            })
          : [];
        const selectedTeamMemberCards = sectionKey === "teams"
          ? selectedTeamMembers.map((member) => ({ name: member }))
          : [];
        return (
		          <div key={sectionKey} className={sectionKey === "teams" ? "row g-3 align-items-start" : "d-flex flex-column gap-3"}>
		            {sectionKey !== "deals" ? (
		            <div className={sectionKey === "teams" ? "col-12 col-xl-3" : ""}>
            <div className={`card p-3 ${editingId ? "crm-form-editing-highlight" : ""}`}>
              <h6 className="mb-3">{editingId ? `Edit ${config.itemLabel}` : `Create ${config.itemLabel}`}</h6>
              <form className="d-flex flex-column gap-3" onSubmit={(event) => onSubmit(sectionKey, event)}>
                {sectionFormErrors[sectionKey] ? (
                  <div className="alert alert-danger py-2 mb-0">
                    {sectionFormErrors[sectionKey]}
                  </div>
                ) : null}
                {sectionKey === "teams" ? (
                  <div className="d-flex flex-column gap-3">
                    <div>
                      <label className={`form-label small mb-1 ${sectionFieldErrors[sectionKey]?.name ? "text-danger" : "text-secondary"}`}>
                        Team Name *
                      </label>
                      <input
                        type="text"
                        className={`form-control ${sectionFieldErrors[sectionKey]?.name ? "is-invalid" : ""}`}
                        placeholder="Type a new team name"
                        value={formValues.name || ""}
                        onChange={(event) => setField(sectionKey, "name", event.target.value)}
                      />
                    </div>

                    <div>
                      <label className={`form-label small mb-2 ${sectionFieldErrors[sectionKey]?.departmentFilters ? "text-danger" : "text-secondary"}`}>
                        Select Department
                      </label>
                      <div className="crm-inline-suggestions-wrap">
                        <input
                          type="search"
                          className={`form-control ${sectionFieldErrors[sectionKey]?.departmentFilters ? "is-invalid" : ""}`}
                          autoComplete="off"
                          placeholder="Search department or employee role"
                          value={teamCategorySearch}
                          onFocus={() => setTeamCategorySearchOpen(true)}
                          onClick={() => setTeamCategorySearchOpen(true)}
                          onBlur={() => window.setTimeout(() => setTeamCategorySearchOpen(false), 120)}
                          onChange={(event) => {
                            setTeamCategorySearch(event.target.value);
                            setTeamCategorySearchOpen(true);
                          }}
                        />
                        {showTeamCategorySuggestions ? (
                          <div className="crm-inline-suggestions" style={{ maxHeight: "320px", overflowY: "auto" }}>
                            <div className="crm-inline-suggestions__group">
                              <div className="crm-inline-suggestions__title">Department List</div>
                              {filteredTeamDepartments.length ? filteredTeamDepartments.map((option) => (
                                <button
                                  key={`crm-team-department-checkbox-${option}`}
                                  type="button"
                                  className="crm-inline-suggestions__item"
                                  onMouseDown={(event) => event.preventDefault()}
                                  onClick={() => toggleCrmTeamCategory("department", option)}
                                >
                                  <span className="d-flex align-items-center gap-2">
                                    <input
                                      type="checkbox"
                                      className="form-check-input mt-0"
                                      checked={selectedTeamDepartments.includes(option)}
                                      readOnly
                                    />
                                    <span className="crm-inline-suggestions__item-main">{option}</span>
                                  </span>
                                </button>
                              )) : (
                                <div className="crm-inline-suggestions__item">
                                  <span className="crm-inline-suggestions__item-main">No departments found</span>
                                </div>
                              )}
                            </div>
                            <div className="crm-inline-suggestions__group">
                              <div className="crm-inline-suggestions__title">Employee Role List</div>
                              {filteredTeamEmployeeRoles.length ? filteredTeamEmployeeRoles.map((option) => (
                                <button
                                  key={`crm-team-role-checkbox-${option}`}
                                  type="button"
                                  className="crm-inline-suggestions__item"
                                  onMouseDown={(event) => event.preventDefault()}
                                  onClick={() => toggleCrmTeamCategory("employeeRole", option)}
                                >
                                  <span className="d-flex align-items-center gap-2">
                                    <input
                                      type="checkbox"
                                      className="form-check-input mt-0"
                                      checked={selectedTeamEmployeeRoles.includes(option)}
                                      readOnly
                                    />
                                    <span className="crm-inline-suggestions__item-main">{option}</span>
                                  </span>
                                </button>
                              )) : (
                                <div className="crm-inline-suggestions__item">
                                  <span className="crm-inline-suggestions__item-main">No employee roles found</span>
                                </div>
                              )}
                            </div>
                          </div>
                        ) : null}
                      </div>
                      {(selectedTeamDepartments.length || selectedTeamEmployeeRoles.length) ? (
                        <div className="d-flex flex-wrap gap-2 mt-2">
                          {selectedTeamDepartments.map((option) => (
                            <span
                              key={`selected-team-department-${option}`}
                              className="badge text-bg-light border d-inline-flex align-items-center gap-2 wz-selected-chip"
                            >
                              <button
                                type="button"
                                className="btn btn-sm p-0 border text-secondary bg-transparent rounded-circle d-inline-flex align-items-center justify-content-center wz-selected-chip-remove"
                                aria-label={`Remove department ${option}`}
                                onClick={() => toggleCrmTeamCategory("department", option)}
                              >
                                &times;
                              </button>
                              <span>Dept: {option}</span>
                            </span>
                          ))}
                          {selectedTeamEmployeeRoles.map((option) => (
                            <span
                              key={`selected-team-role-${option}`}
                              className="badge text-bg-light border d-inline-flex align-items-center gap-2 wz-selected-chip"
                            >
                              <button
                                type="button"
                                className="btn btn-sm p-0 border text-secondary bg-transparent rounded-circle d-inline-flex align-items-center justify-content-center wz-selected-chip-remove"
                                aria-label={`Remove employee role ${option}`}
                                onClick={() => toggleCrmTeamCategory("employeeRole", option)}
                              >
                                &times;
                              </button>
                              <span>Role: {option}</span>
                            </span>
                          ))}
                        </div>
                      ) : null}
                      <div className="small text-secondary mt-2">
                        Selecting categories will add matching employees to this team. You can still remove any employee below.
                      </div>
                    </div>

                    <div>
                      <label className={`form-label small mb-1 ${sectionFieldErrors[sectionKey]?.members ? "text-danger" : "text-secondary"}`}>
                        Available Employees *
                      </label>
                      <div className="crm-inline-suggestions-wrap">
                        <input
                          type="search"
                          className={`form-control ${sectionFieldErrors[sectionKey]?.members ? "is-invalid" : ""}`}
                          autoComplete="off"
                          placeholder="Search and select employees"
                          value={teamMemberSearch}
                          onFocus={() => setTeamMemberSearchOpen(true)}
                          onClick={() => setTeamMemberSearchOpen(true)}
                          onBlur={() => window.setTimeout(() => setTeamMemberSearchOpen(false), 120)}
                          onChange={(event) => {
                            setTeamMemberSearch(event.target.value);
                            setTeamMemberSearchOpen(true);
                          }}
                        />
                        {showTeamMemberSuggestions ? (
                          <div className="crm-inline-suggestions" style={{ maxHeight: "280px", overflowY: "auto" }}>
                            <div className="crm-inline-suggestions__group">
                              <div className="crm-inline-suggestions__title">Employee List</div>
                              {availableTeamMembers.length ? availableTeamMembers.map((employee) => (
                                <button
                                  key={`crm-team-available-${employee.id}`}
                                  type="button"
                                  className="crm-inline-suggestions__item"
                                  onMouseDown={(event) => event.preventDefault()}
                                  onClick={() => toggleCrmTeamMember(employee.name)}
                                >
                                  <span className="d-flex align-items-start gap-2">
                                    <input
                                      type="checkbox"
                                      className="form-check-input mt-1"
                                      checked={selectedTeamMembers.includes(employee.name)}
                                      readOnly
                                    />
                                    <span>
                                      <span className="crm-inline-suggestions__item-main d-block">{employee.name}</span>
                                      <span className="crm-inline-suggestions__item-sub">
                                        {[employee.department, employee.employeeRole].filter(Boolean).join(" / ") || employee.email || "-"}
                                      </span>
                                    </span>
                                  </span>
                                </button>
                              )) : (
                                <div className="crm-inline-suggestions__item">
                                  <span className="crm-inline-suggestions__item-main">No employees found</span>
                                  <span className="crm-inline-suggestions__item-sub">Try another search or change the selected categories.</span>
                                </div>
                              )}
                            </div>
                          </div>
                        ) : null}
                      </div>
                      {sectionFieldErrors[sectionKey]?.members ? (
                        <div className="text-danger small mt-1">Employees is required.</div>
                      ) : null}
                    </div>

                    <div>
                      <label className="form-label small text-secondary mb-2">Selected Employees</label>
                      <div className="d-flex flex-wrap gap-2">
                        {selectedTeamMemberCards.length ? selectedTeamMemberCards.map((member) => {
                          return (
                            <span
                              key={`crm-team-selected-${member.name}`}
                              className="badge text-bg-light border d-inline-flex align-items-center gap-2 wz-selected-chip"
                            >
                              <button
                                type="button"
                                className="btn btn-sm p-0 border text-secondary bg-transparent rounded-circle d-inline-flex align-items-center justify-content-center wz-selected-chip-remove"
                                aria-label={`Remove ${member.name}`}
                                onClick={() => toggleCrmTeamMember(member.name)}
                              >
                                &times;
                              </button>
                              <span className="fw-semibold">{member.name}</span>
                            </span>
                          );
                        }) : (
                          <div className="small text-secondary">No employees selected yet.</div>
                        )}
                      </div>
                    </div>

                    <div className={sectionKey === "leads" ? "d-flex gap-2 align-items-center" : "d-flex gap-2 flex-wrap"}>
                      <button
                        type="submit"
                        className={sectionKey === "leads" ? "btn btn-success btn-sm" : "btn btn-success btn-sm single-row-form-submit-btn"}
                      >
                        {editingId ? "Update" : "Create"}
                      </button>
                      {editingId ? (
                        <button type="button" className="btn btn-outline-light btn-sm" onClick={() => resetSectionForm(sectionKey)}>
                          Cancel
                        </button>
                      ) : null}
                    </div>
                  </div>
                ) : (
                  <Fragment>
                    <div className="row g-3">
                      {config.fields.map((field) => (
                        <Fragment key={`${sectionKey}-${field.key}`}>
                          {hasPhoneCountryCodeField && field.key === "phoneCountryCode"
                            ? null
                            : sectionKey === "leads" && field.key === "assignedUser" && String(formValues.assignType || "Users").trim().toLowerCase() === "team"
                            ? null
                            : sectionKey === "leads" && field.key === "assignedTeam" && String(formValues.assignType || "Users").trim().toLowerCase() !== "team"
                            ? null
                            : (
                          <div
                            className={
                              sectionKey === "leads"
                                ? (
                                    field.key === "name" || field.key === "company"
                                      ? "col-12 col-md-6 col-xl-3"
                                      : field.key === "contactPerson"
                                      ? "col-12 col-md-6 col-xl-2"
                                      : field.key === "phone"
                                      ? "col-12 col-md-6 col-xl-2"
                                      : field.key === "leadAmount"
                                      ? "col-12 col-md-6 col-xl-2"
                                      : field.key === "leadSource"
                                      ? "col-12 col-md-6 col-xl-2"
                                      : field.key === "assignType"
                                      ? "col-12 col-md-6 col-xl-2"
                                      : field.key === "assignedUser" || field.key === "assignedTeam"
                                      ? "col-12 col-md-6 col-xl-2"
                                      : field.key === "stage" || field.key === "status"
                                      ? "col-12 col-md-6 col-xl-2"
                                      : "col-12 col-md-6 col-xl-4"
                                  )
                                : sectionKey === "activities"
                                ? (
                                    field.key === "activityType"
                                      ? "col-12 col-md-6 col-xl-2"
                                      : field.key === "relatedTo"
                                      ? "col-12 col-md-6 col-xl-3"
                                      : field.key === "date"
                                      ? "col-12 col-md-6 col-xl-2"
                                      : field.key === "owner"
                                      ? "col-12 col-md-6 col-xl-3"
                                      : field.key === "notes"
                                      ? "col-12 col-md-6 col-xl-2"
                                      : "col-12 col-md-6 col-xl-4"
                                  )
                                : sectionKey === "contacts"
                                ? (
                                    field.key === "name" || field.key === "company"
                                      ? "col-12 col-md-6 col-xl-2"
                                      : field.key === "email"
                                      ? "col-12 col-md-6 col-xl-3"
                                      : field.key === "phone"
                                      ? "col-12 col-md-6 col-xl-3"
                                      : field.key === "tag"
                                      ? "col-12 col-md-6 col-xl-2"
                                      : "col-12 col-md-6 col-xl-4"
                                  )
                                : sectionKey === "deals"
                                ? (
                                    field.key === "dealName" || field.key === "company"
                                      ? "col-12 col-md-6 col-xl-3"
                                      : field.key === "stage"
                                      ? "col-12 col-md-6 col-xl-1"
                                      : field.key === "dealValueExpected" || field.key === "wonAmountFinal"
                                      ? "col-12 col-md-6 col-xl-2"
                                      : field.key === "status"
                                      ? "col-12 col-md-6 col-xl-2"
                                      : "col-12 col-md-6 col-xl-4"
                                  )
                                  : sectionKey === "followUps"
                                ? (
                                    field.key === "subject" || field.key === "relatedTo"
                                      ? field.key === "relatedTo"
                                        ? "col-12 col-md-6 col-xl-4"
                                        : "col-12 col-md-6 col-xl-2"
                                      : field.key === "dueDate"
                                      ? "col-12 col-md-6 col-xl-2"
                                      : field.key === "owner"
                                      ? "col-12 col-md-6 col-xl-2"
                                      : field.key === "status"
                                      ? "col-12 col-md-6 col-xl-1"
                                      : "col-12 col-md-6 col-xl-4"
                                  )
                                : sectionKey === "meetings"
                                ? (
                                    field.key === "title" || field.key === "companyOrClientName"
                                      ? "col-12 col-md-6 col-xl-3"
                                    : field.key === "relatedTo"
                                      ? "col-12 col-md-6 col-xl-2"
                                    : field.key === "meetingDate" || field.key === "meetingTime"
                                      ? "col-12 col-md-6 col-xl-2"
                                    : field.key === "owner"
                                      ? "col-12 col-md-6 col-xl-2"
                                      : field.key === "meetingMode" || field.key === "reminderChannel" || field.key === "reminderDays" || field.key === "reminderMinutes" || field.key === "status"
                                      ? "col-12 col-md-6 col-xl-2"
                                      : "col-12 col-md-6 col-xl-4"
                                  )
                                : "col-12 col-md-6 col-xl-4"
                            }
                            key={`${sectionKey}-${field.key}`}
                          >
                            <label className={`form-label small mb-1 ${sectionFieldErrors[sectionKey]?.[field.key] ? "text-danger" : "text-secondary"}`}>
                              {sectionKey === "leads" && field.key === "leadAmount"
                                ? `Lead Amount (${crmCurrencyCode} ${crmCurrencySymbol})`
                                : field.label}
                              {isCrmFieldRequired(sectionKey, field, formValues) ? " *" : ""}
                            </label>
                            {(() => {
                              if (hasPhoneCountryCodeField && field.key === "phone") {
                                return (
                                  <div className="input-group">
                                    <PhoneCountryCodePicker
                                      value={formValues.phoneCountryCode || "+91"}
                                      onChange={(code) => setField(sectionKey, "phoneCountryCode", code)}
                                      options={DIAL_COUNTRY_PICKER_OPTIONS}
                                      style={{ maxWidth: (sectionKey === "leads" || sectionKey === "contacts") ? "120px" : "220px" }}
                                      ariaLabel="CRM country code"
                                      disabled={sectionKey === "leads" && leadPhoneLockedFromClient}
                                    />
                                    <input
                                      type="text"
                                      className="form-control"
                                      placeholder={field.placeholder}
                                      value={formValues.phone || ""}
                                      required={isCrmFieldRequired(sectionKey, field, formValues)}
                                      readOnly={sectionKey === "leads" && leadPhoneLockedFromClient}
                                      onChange={(event) => setField(sectionKey, "phone", event.target.value)}
                                    />
                                  </div>
                                );
                              }
                              if (sectionKey === "leads" && field.key === "company") {
                                return (
                                  <div className="crm-inline-suggestions-wrap">
                                    <input
                                      type="text"
                                      className="form-control"
                                      placeholder={field.placeholder}
                                      value={formValues[field.key] || ""}
                                      required={isCrmFieldRequired(sectionKey, field, formValues)}
                                      onFocus={() => setLeadCompanySearchOpen(true)}
                          onClick={() => setLeadCompanySearchOpen(true)}
                                      onBlur={() => window.setTimeout(() => setLeadCompanySearchOpen(false), 120)}
                                      onChange={(event) => {
                                        setField(sectionKey, field.key, event.target.value);
                                        setField(sectionKey, "contactPerson", "");
                                        setLeadPhoneLockedFromClient(false);
                                        setLeadCompanySearchOpen(true);
                                      }}
                                    />
                                    {showLeadCompanySuggestions ? (
                                      (crmContactMatches.length || customerMatches.length) ? (
                                        <div className="crm-inline-suggestions">
                                          {crmContactMatches.length ? (
                                            <div className="crm-inline-suggestions__group">
                                              <div className="crm-inline-suggestions__title">CRM Contacts</div>
                                              {crmContactMatches.map((contact) => (
                                                <button
                                                  key={`crm-contact-${contact.id}`}
                                                  type="button"
                                                  className="crm-inline-suggestions__item"
                                                  onMouseDown={(event) => event.preventDefault()}
                                                  onClick={() => {
                                                    const autoPhone = String(contact.phone || "").trim();
                                                    setForms((prev) => ({
                                                      ...prev,
                                                      leads: {
                                                        ...prev.leads,
                                                        company: String(contact.company || "").trim(),
                                                        contactPerson: String(contact.name || "").trim(),
                                                        phoneCountryCode: String(contact.phoneCountryCode || "+91").trim() || "+91",
                                                        phone: autoPhone,
                                                      },
                                                    }));
                                                    setLeadPhoneLockedFromClient(Boolean(autoPhone));
                                                    setLeadCompanySearchOpen(false);
                                                  }}
                                                >
                                                  <span className="crm-inline-suggestions__item-main">{contact.name || "-"}</span>
                                                  <span className="crm-inline-suggestions__item-sub">{contact.company || "-"}</span>
                                                </button>
                                              ))}
                                            </div>
                                          ) : null}
                                          {customerMatches.length ? (
                                            <div className="crm-inline-suggestions__group">
                                              <div className="crm-inline-suggestions__title">Clients</div>
                                              {customerMatches.map((customer) => (
                                                <button
                                                  key={`crm-customer-${customer.id}`}
                                                  type="button"
                                                  className="crm-inline-suggestions__item"
                                                  onMouseDown={(event) => event.preventDefault()}
                                                  onClick={() => {
                                                    const autoPhone = String(customer.phone || "").trim();
                                                    setForms((prev) => ({
                                                      ...prev,
                                                      leads: {
                                                        ...prev.leads,
                                                        company: String(customer.companyName || customer.name || "").trim(),
                                                        contactPerson: String(customer.clientName || customer.name || "").trim(),
                                                        phoneCountryCode: String(customer.phoneCountryCode || "+91").trim() || "+91",
                                                        phone: autoPhone,
                                                      },
                                                    }));
                                                    setLeadPhoneLockedFromClient(Boolean(autoPhone));
                                                    setLeadCompanySearchOpen(false);
                                                  }}
                                                >
                                                  <span className="crm-inline-suggestions__item-main">{customer.clientName || customer.companyName || "-"}</span>
                                                  <span className="crm-inline-suggestions__item-sub">{customer.companyName || "-"}</span>
                                                </button>
                                              ))}
                                            </div>
                                          ) : null}
                                        </div>
                                      ) : (
                                        <div className="crm-inline-suggestions">
                                          <div className="crm-inline-suggestions__item">
                                            <span className="crm-inline-suggestions__item-main">No company results found</span>
                                          </div>
                                        </div>
                                      )
                                    ) : null}
                                  </div>
                                );
                              }
                              if (sectionKey === "deals" && field.key === "company") {
                                return (
                                  <div className="crm-inline-suggestions-wrap">
                                    <input
                                      type="text"
                                      className="form-control"
                                      placeholder={field.placeholder}
                                      value={formValues[field.key] || ""}
                                      required={isCrmFieldRequired(sectionKey, field, formValues)}
                                      onFocus={() => setDealCompanySearchOpen(true)}
                                      onClick={() => setDealCompanySearchOpen(true)}
                                      onBlur={() => window.setTimeout(() => setDealCompanySearchOpen(false), 120)}
                                      onChange={(event) => {
                                        setField(sectionKey, field.key, event.target.value);
                                        setDealCompanySearchOpen(true);
                                      }}
                                    />
                                    {showDealCompanySuggestions ? (
                                      (dealCrmContactMatches.length || dealCustomerMatches.length) ? (
                                        <div className="crm-inline-suggestions">
                                          {dealCrmContactMatches.length ? (
                                            <div className="crm-inline-suggestions__group">
                                              <div className="crm-inline-suggestions__title">CRM Contacts</div>
                                              {dealCrmContactMatches.map((contact) => (
                                                <button
                                                  key={`deal-crm-contact-${contact.id}`}
                                                  type="button"
                                                  className="crm-inline-suggestions__item"
                                                  onMouseDown={(event) => event.preventDefault()}
                                                  onClick={() => {
                                                    setField(sectionKey, field.key, String(contact.company || contact.name || "").trim());
                                                    setDealCompanySearchOpen(false);
                                                  }}
                                                >
                                                  <span className="crm-inline-suggestions__item-main">{contact.name || "-"}</span>
                                                  <span className="crm-inline-suggestions__item-sub">{contact.company || "-"}</span>
                                                </button>
                                              ))}
                                            </div>
                                          ) : null}
                                          {dealCustomerMatches.length ? (
                                            <div className="crm-inline-suggestions__group">
                                              <div className="crm-inline-suggestions__title">Clients</div>
                                              {dealCustomerMatches.map((customer) => (
                                                <button
                                                  key={`deal-customer-${customer.id}`}
                                                  type="button"
                                                  className="crm-inline-suggestions__item"
                                                  onMouseDown={(event) => event.preventDefault()}
                                                  onClick={() => {
                                                    setField(sectionKey, field.key, String(customer.companyName || customer.clientName || customer.name || "").trim());
                                                    setDealCompanySearchOpen(false);
                                                  }}
                                                >
                                                  <span className="crm-inline-suggestions__item-main">{customer.clientName || customer.companyName || "-"}</span>
                                                  <span className="crm-inline-suggestions__item-sub">{customer.companyName || "-"}</span>
                                                </button>
                                              ))}
                                            </div>
                                          ) : null}
                                        </div>
                                      ) : (
                                        <div className="crm-inline-suggestions">
                                          <div className="crm-inline-suggestions__item">
                                            <span className="crm-inline-suggestions__item-main">No client or company results found</span>
                                          </div>
                                        </div>
                                      )
                                    ) : null}
                                  </div>
                                );
                              }
                              if (sectionKey === "leads" && field.key === "assignedUser") {
                                return (
                                  <div className="d-flex flex-column gap-2">
                                    <div className="crm-inline-suggestions-wrap">
                                      <input
                                        type="search"
                                        className="form-control"
                                        autoComplete="off"
                                        placeholder="Search users"
                                        value={leadAssignedUserSearch}
                                        onFocus={() => setLeadAssignedUserSearchOpen(true)}
                          onClick={() => setLeadAssignedUserSearchOpen(true)}
                                        onBlur={() => window.setTimeout(() => setLeadAssignedUserSearchOpen(false), 120)}
                                        onChange={(event) => {
                                          setLeadAssignedUserSearch(event.target.value);
                                          setLeadAssignedUserSearchOpen(true);
                                        }}
                                      />
                                      {showLeadAssignedUserSuggestions ? (
                                        <div className="crm-inline-suggestions" style={{ maxHeight: "280px", overflowY: "auto" }}>
                                          <div className="crm-inline-suggestions__group">
                                            <div className="crm-inline-suggestions__title">Users</div>
                                            {filteredLeadAssignedUsers.length ? filteredLeadAssignedUsers.map((user) => (
                                              <button
                                                key={`lead-assigned-user-${user.id}`}
                                                type="button"
                                                className="crm-inline-suggestions__item"
                                                onMouseDown={(event) => event.preventDefault()}
                                                onClick={() => {
                                                  toggleLeadAssignedUser(user.name);
                                                  setLeadAssignedUserSearch("");
                                                  setLeadAssignedUserSearchOpen(true);
                                                }}
                                              >
                                                <span className="d-flex align-items-start gap-2">
                                                  <input
                                                    type="checkbox"
                                                    className="form-check-input mt-1"
                                                    checked={selectedLeadAssignedUsers.includes(user.name)}
                                                    readOnly
                                                  />
                                                  <span>
                                                    <span className="crm-inline-suggestions__item-main d-block">{user.name}</span>
                                                    <span className="crm-inline-suggestions__item-sub">
                                                      {[user.department, user.employeeRole].filter(Boolean).join(" / ") || user.email || "-"}
                                                    </span>
                                                  </span>
                                                </span>
                                              </button>
                                            )) : (
                                              <div className="crm-inline-suggestions__item">
                                                <span className="crm-inline-suggestions__item-main">No users found</span>
                                              </div>
                                            )}
                                          </div>
                                        </div>
                                      ) : null}
                                    </div>
                                    <div className="d-flex flex-wrap gap-2">
                                      {selectedLeadAssignedUsers.length ? selectedLeadAssignedUsers.map((userName) => (
                                        <span
                                          key={`lead-selected-user-${userName}`}
                                          className="badge text-bg-light border d-inline-flex align-items-center gap-2 wz-selected-chip"
                                        >
                                          <button
                                            type="button"
                                            className="btn btn-sm p-0 border text-secondary bg-transparent rounded-circle d-inline-flex align-items-center justify-content-center wz-selected-chip-remove"
                                            aria-label={`Remove ${userName}`}
                                            onClick={() => toggleLeadAssignedUser(userName)}
                                          >
                                            &times;
                                          </button>
                                          <span>{userName}</span>
                                        </span>
                                      )) : null}
                                    </div>
                                  </div>
                                );
                              }
                              if (sectionKey === "followUps" && field.key === "relatedTo") {
                                return (
                                  <div className="d-flex flex-column gap-2">
                                    <div className="input-group">
                                      <select
                                        className="form-select"
                                        style={{ maxWidth: "170px" }}
                                        value={followUpRelatedToType}
                                        onChange={(event) => {
                                          setFollowUpRelatedToType(event.target.value);
                                          setFollowUpRelatedToSearch("");
                                          setField(sectionKey, "relatedTo", "");
                                        }}
                                      >
                                        {CRM_FOLLOWUP_RELATED_TO_TYPES.map((type) => (
                                          <option key={`follow-up-related-to-type-${type}`} value={type}>{type}</option>
                                        ))}
                                      </select>
                                      <input
                                        type="text"
                                        className="form-control"
                                        placeholder={field.placeholder}
                                        value={followUpRelatedToSearch}
                                        required={isCrmFieldRequired(sectionKey, field, formValues)}
                                        onFocus={() => setFollowUpRelatedToSearchOpen(true)}
                          onClick={() => setFollowUpRelatedToSearchOpen(true)}
                                        onBlur={() => window.setTimeout(() => setFollowUpRelatedToSearchOpen(false), 120)}
                                        onChange={(event) => {
                                          setFollowUpRelatedToSearch(event.target.value);
                                          setField(sectionKey, field.key, event.target.value);
                                          setFollowUpRelatedToSearchOpen(true);
                                        }}
                                      />
                                    </div>
                                    <div className="crm-inline-suggestions-wrap">
                                      {showFollowUpRelatedToSuggestions && followUpRelatedToMatches.length ? (
                                        <div className="crm-inline-suggestions" style={{ maxHeight: "280px", overflowY: "auto" }}>
                                          <div className="crm-inline-suggestions__group">
                                            <div className="crm-inline-suggestions__title">{followUpRelatedToType}</div>
                                            {followUpRelatedToMatches.map((item) => (
                                              <button
                                                key={`follow-up-related-to-${item.id}`}
                                                type="button"
                                                className="crm-inline-suggestions__item"
                                                onMouseDown={(event) => event.preventDefault()}
                                                onClick={() => {
                                                  setField(sectionKey, "relatedTo", item.value);
                                                  setFollowUpRelatedToSearch(item.value);
                                                  setFollowUpRelatedToSearchOpen(false);
                                                }}
                                              >
                                                <span className="crm-inline-suggestions__item-main">{item.label}</span>
                                                <span className="crm-inline-suggestions__item-sub">{item.subText}</span>
                                              </button>
                                            ))}
                                          </div>
                                        </div>
                                      ) : null}
                                    </div>
                                  </div>
                                );
                              }
                              if (sectionKey === "followUps" && field.key === "owner") {
                                return (
                                  <div className="d-flex flex-column gap-2">
                                    <div className="crm-inline-suggestions-wrap">
                                      <input
                                        type="search"
                                        className="form-control"
                                        autoComplete="off"
                                        placeholder="Search employees"
                                        value={followUpOwnerSearch}
                                        required={isCrmFieldRequired(sectionKey, field, formValues)}
                                        onFocus={() => setFollowUpOwnerSearchOpen(true)}
                          onClick={() => setFollowUpOwnerSearchOpen(true)}
                                        onBlur={() => window.setTimeout(() => setFollowUpOwnerSearchOpen(false), 120)}
                                        onChange={(event) => {
                                          setFollowUpOwnerSearch(event.target.value);
                                          setField(sectionKey, field.key, event.target.value);
                                          setFollowUpOwnerSearchOpen(true);
                                        }}
                                      />
                                      {showFollowUpOwnerSuggestions ? (
                                        <div className="crm-inline-suggestions" style={{ maxHeight: "280px", overflowY: "auto" }}>
                                          <div className="crm-inline-suggestions__group">
                                            <div className="crm-inline-suggestions__title">Employees</div>
                                            {filteredFollowUpOwners.length ? filteredFollowUpOwners.map((employee) => (
                                              <button
                                                key={`follow-up-owner-${employee.id}`}
                                                type="button"
                                                className="crm-inline-suggestions__item"
                                                onMouseDown={(event) => event.preventDefault()}
                                                onClick={() => toggleFollowUpOwner(employee.name)}
                                              >
                                                <span className="d-flex align-items-start gap-2">
                                                  <input
                                                    type="checkbox"
                                                    className="form-check-input mt-1"
                                                    checked={selectedFollowUpOwner === employee.name}
                                                    readOnly
                                                  />
                                                  <span>
                                                    <span className="crm-inline-suggestions__item-main d-block">{employee.name}</span>
                                                    <span className="crm-inline-suggestions__item-sub">
                                                      {[employee.department, employee.employeeRole].filter(Boolean).join(" / ") || employee.email || "-"}
                                                    </span>
                                                  </span>
                                                </span>
                                              </button>
                                            )) : (
                                              <div className="crm-inline-suggestions__item">
                                                <span className="crm-inline-suggestions__item-main">No employees found</span>
                                              </div>
                                            )}
                                          </div>
                                        </div>
                                      ) : null}
                                    </div>
                                    <div className="d-flex flex-wrap gap-2">
                                      {selectedFollowUpOwner ? (
                                        <span
                                          className="badge text-bg-light border d-inline-flex align-items-center gap-2 wz-selected-chip"
                                        >
                                          <button
                                            type="button"
                                            className="btn btn-sm p-0 border text-secondary bg-transparent rounded-circle d-inline-flex align-items-center justify-content-center wz-selected-chip-remove"
                                            aria-label={`Remove ${selectedFollowUpOwner}`}
                                            onClick={() => toggleFollowUpOwner(selectedFollowUpOwner)}
                                          >
                                            &times;
                                          </button>
                                          <span>{selectedFollowUpOwner}</span>
                                        </span>
                                      ) : null}
                                    </div>
                                  </div>
                                );
                              }
                              if (sectionKey === "activities" && field.key === "relatedTo") {
                                return (
                                  <div className="crm-inline-suggestions-wrap">
                                    <input
                                      type="text"
                                      className="form-control"
                                      autoComplete="off"
                                      placeholder={field.placeholder}
                                      value={formValues[field.key] || ""}
                                      required={isCrmFieldRequired(sectionKey, field, formValues)}
                                      onFocus={() => setActivityClientSearchOpen(true)}
                                      onClick={() => setActivityClientSearchOpen(true)}
                                      onBlur={() => window.setTimeout(() => setActivityClientSearchOpen(false), 120)}
                                      onChange={(event) => {
                                        setField(sectionKey, field.key, event.target.value);
                                        setActivityClientSearchOpen(true);
                                      }}
                                    />
                                    {activityClientSearchOpen && (activityContactMatches.length || activityCustomerMatches.length) ? (
                                      <div className="crm-inline-suggestions">
                                        {activityContactMatches.length ? (
                                          <div className="crm-inline-suggestions__group">
                                            <div className="crm-inline-suggestions__title">CRM Contacts</div>
                                            {activityContactMatches.map((contact) => (
                                              <button
                                                key={`activity-crm-contact-${contact.id}`}
                                                type="button"
                                                className="crm-inline-suggestions__item"
                                                onMouseDown={(event) => event.preventDefault()}
                                                onClick={() => {
                                                  setField(sectionKey, field.key, String(contact.company || contact.name || "").trim());
                                                  setActivityClientSearchOpen(false);
                                                }}
                                              >
                                                <span className="crm-inline-suggestions__item-main">{contact.name || "-"}</span>
                                                <span className="crm-inline-suggestions__item-sub">{contact.company || "-"}</span>
                                              </button>
                                            ))}
                                          </div>
                                        ) : null}
                                        {activityCustomerMatches.length ? (
                                          <div className="crm-inline-suggestions__group">
                                            <div className="crm-inline-suggestions__title">Clients</div>
                                            {activityCustomerMatches.map((customer) => (
                                              <button
                                                key={`activity-customer-${customer.id}`}
                                                type="button"
                                                className="crm-inline-suggestions__item"
                                                onMouseDown={(event) => event.preventDefault()}
                                                onClick={() => {
                                                  setField(sectionKey, field.key, String(customer.companyName || customer.clientName || customer.name || "").trim());
                                                  setActivityClientSearchOpen(false);
                                                }}
                                              >
                                                <span className="crm-inline-suggestions__item-main">{customer.clientName || customer.companyName || "-"}</span>
                                                <span className="crm-inline-suggestions__item-sub">{customer.companyName || "-"}</span>
                                              </button>
                                            ))}
                                          </div>
                                        ) : null}
                                      </div>
                                    ) : null}
                                  </div>
                                );
                              }
                              if (sectionKey === "activities" && field.key === "owner") {
                                return (
                                  <div className="d-flex flex-column gap-2">
                                    <div className="crm-inline-suggestions-wrap">
                                      <input
                                        type="search"
                                        className="form-control"
                                        autoComplete="off"
                                        placeholder="Search users"
                                        value={activityEmployeeSearch}
                                        onFocus={() => setActivityEmployeeSearchOpen(true)}
                                        onClick={() => setActivityEmployeeSearchOpen(true)}
                                        onBlur={() => window.setTimeout(() => setActivityEmployeeSearchOpen(false), 120)}
                                        onChange={(event) => {
                                          setActivityEmployeeSearch(event.target.value);
                                          setActivityEmployeeSearchOpen(true);
                                        }}
                                      />
                                      {activityEmployeeSearchOpen ? (
                                        <div className="crm-inline-suggestions" style={{ maxHeight: "280px", overflowY: "auto" }}>
                                          <div className="crm-inline-suggestions__group">
                                            <div className="crm-inline-suggestions__title">Users</div>
                                            {filteredActivityEmployees.length ? filteredActivityEmployees.map((employee) => (
                                              <button
                                                key={`activity-employee-${employee.id}`}
                                                type="button"
                                                className="crm-inline-suggestions__item"
                                                onMouseDown={(event) => event.preventDefault()}
                                                onClick={() => toggleActivityEmployee(employee.name)}
                                              >
                                                <span className="d-flex align-items-start gap-2">
                                                  <input
                                                    type="checkbox"
                                                    className="form-check-input mt-1"
                                                    checked={selectedActivityEmployees.includes(employee.name)}
                                                    readOnly
                                                  />
                                                  <span>
                                                    <span className="crm-inline-suggestions__item-main d-block">{employee.name}</span>
                                                    <span className="crm-inline-suggestions__item-sub">
                                                      {[employee.department, employee.employeeRole].filter(Boolean).join(" / ") || employee.email || "-"}
                                                    </span>
                                                  </span>
                                                </span>
                                              </button>
                                            )) : (
                                              <div className="crm-inline-suggestions__item">
                                                <span className="crm-inline-suggestions__item-main">No users found</span>
                                              </div>
                                            )}
                                          </div>
                                        </div>
                                      ) : null}
                                    </div>
                                    <div className="d-flex flex-wrap gap-2">
                                      {selectedActivityEmployees.length ? selectedActivityEmployees.map((employeeName) => (
                                        <span
                                          key={`activity-selected-employee-${employeeName}`}
                                          className="badge text-bg-light border d-inline-flex align-items-center gap-2 wz-selected-chip"
                                        >
                                          <button
                                            type="button"
                                            className="btn btn-sm p-0 border text-secondary bg-transparent rounded-circle d-inline-flex align-items-center justify-content-center wz-selected-chip-remove"
                                            aria-label={`Remove ${employeeName}`}
                                            onClick={() => toggleActivityEmployee(employeeName)}
                                          >
                                            &times;
                                          </button>
                                          <span>{employeeName}</span>
                                        </span>
                                      )) : null}
                                    </div>
                                  </div>
                                );
                              }
                              if (sectionKey === "meetings" && field.key === "companyOrClientName") {
                                return (
                                  <div className="crm-inline-suggestions-wrap">
                                    <input
                                      type="text"
                                      className="form-control"
                                      autoComplete="off"
                                      placeholder={field.placeholder}
                                      value={formValues[field.key] || ""}
                                      required={isCrmFieldRequired(sectionKey, field, formValues)}
                                      onFocus={() => setMeetingCompanySearchOpen(true)}
                          onClick={() => setMeetingCompanySearchOpen(true)}
                                      onBlur={() => window.setTimeout(() => setMeetingCompanySearchOpen(false), 120)}
                                      onChange={(event) => {
                                        setField(sectionKey, field.key, event.target.value);
                                        setMeetingCompanySearchOpen(true);
                                      }}
                                    />
                                    {meetingCompanySearchOpen && (meetingCrmContactMatches.length || meetingCustomerMatches.length) ? (
                                      <div className="crm-inline-suggestions">
                                        {meetingCrmContactMatches.length ? (
                                          <div className="crm-inline-suggestions__group">
                                            <div className="crm-inline-suggestions__title">CRM Contacts</div>
                                            {meetingCrmContactMatches.map((contact) => (
                                              <button
                                                key={`meeting-crm-contact-${contact.id}`}
                                                type="button"
                                                className="crm-inline-suggestions__item"
                                                onMouseDown={(event) => event.preventDefault()}
                                                onClick={() => {
                                                  setField(sectionKey, field.key, String(contact.company || contact.name || "").trim());
                                                  setMeetingCompanySearchOpen(false);
                                                }}
                                              >
                                                <span className="crm-inline-suggestions__item-main">{contact.name || "-"}</span>
                                                <span className="crm-inline-suggestions__item-sub">{contact.company || "-"}</span>
                                              </button>
                                            ))}
                                          </div>
                                        ) : null}
                                        {meetingCustomerMatches.length ? (
                                          <div className="crm-inline-suggestions__group">
                                            <div className="crm-inline-suggestions__title">Clients</div>
                                            {meetingCustomerMatches.map((customer) => (
                                              <button
                                                key={`meeting-customer-${customer.id}`}
                                                type="button"
                                                className="crm-inline-suggestions__item"
                                                onMouseDown={(event) => event.preventDefault()}
                                                onClick={() => {
                                                  setField(sectionKey, field.key, String(customer.companyName || customer.clientName || customer.name || "").trim());
                                                  setMeetingCompanySearchOpen(false);
                                                }}
                                              >
                                                <span className="crm-inline-suggestions__item-main">{customer.clientName || customer.companyName || "-"}</span>
                                                <span className="crm-inline-suggestions__item-sub">{customer.companyName || "-"}</span>
                                              </button>
                                            ))}
                                          </div>
                                        ) : null}
                                      </div>
                                    ) : null}
                                  </div>
                                );
                              }
                              if (sectionKey === "meetings" && field.key === "owner") {
                                return (
                                  <div className="d-flex flex-column gap-2">
                                    <div className="crm-inline-suggestions-wrap">
                                      <input
                                        type="search"
                                        className="form-control"
                                        autoComplete="off"
                                        placeholder="Search employees"
                                        value={meetingEmployeeSearch}
                                        onFocus={() => setMeetingEmployeeSearchOpen(true)}
                          onClick={() => setMeetingEmployeeSearchOpen(true)}
                                        onBlur={() => window.setTimeout(() => setMeetingEmployeeSearchOpen(false), 120)}
                                        onChange={(event) => {
                                          setMeetingEmployeeSearch(event.target.value);
                                          setMeetingEmployeeSearchOpen(true);
                                        }}
                                      />
                                      {meetingEmployeeSearchOpen ? (
                                        <div className="crm-inline-suggestions" style={{ maxHeight: "280px", overflowY: "auto" }}>
                                          <div className="crm-inline-suggestions__group">
                                            <div className="crm-inline-suggestions__title">Employees</div>
                                            {filteredMeetingEmployees.length ? filteredMeetingEmployees.map((employee) => (
                                              <button
                                                key={`meeting-employee-${employee.id}`}
                                                type="button"
                                                className="crm-inline-suggestions__item"
                                                onMouseDown={(event) => event.preventDefault()}
                                                onClick={() => toggleMeetingEmployee(employee.name)}
                                              >
                                                <span className="d-flex align-items-start gap-2">
                                                  <input
                                                    type="checkbox"
                                                    className="form-check-input mt-1"
                                                    checked={selectedMeetingEmployees.includes(employee.name)}
                                                    readOnly
                                                  />
                                                  <span>
                                                    <span className="crm-inline-suggestions__item-main d-block">{employee.name}</span>
                                                    <span className="crm-inline-suggestions__item-sub">
                                                      {[employee.department, employee.employeeRole].filter(Boolean).join(" / ") || employee.email || "-"}
                                                    </span>
                                                  </span>
                                                </span>
                                              </button>
                                            )) : (
                                              <div className="crm-inline-suggestions__item">
                                                <span className="crm-inline-suggestions__item-main">No employees found</span>
                                              </div>
                                            )}
                                          </div>
                                        </div>
                                      ) : null}
                                    </div>
                                    <div className="d-flex flex-wrap gap-2">
                                      {selectedMeetingEmployees.length ? selectedMeetingEmployees.map((employeeName) => (
                                        <span
                                          key={`meeting-selected-employee-${employeeName}`}
                                          className="badge text-bg-light border d-inline-flex align-items-center gap-2 wz-selected-chip"
                                        >
                                          <button
                                            type="button"
                                            className="btn btn-sm p-0 border text-secondary bg-transparent rounded-circle d-inline-flex align-items-center justify-content-center wz-selected-chip-remove"
                                            aria-label={`Remove ${employeeName}`}
                                            onClick={() => toggleMeetingEmployee(employeeName)}
                                          >
                                            &times;
                                          </button>
                                          <span>{employeeName}</span>
                                        </span>
                                      )) : null}
                                    </div>
                                  </div>
                                );
                              }
                              if (sectionKey === "meetings" && field.key === "reminderChannel") {
                                return (
                                  <div className="d-flex flex-column gap-2">
                                    <div className="crm-inline-suggestions-wrap">
                                      <input
                                        type="search"
                                        className="form-control"
                                        autoComplete="off"
                                        placeholder="Reminder channel"
                                        value={meetingReminderChannelSearch}
                                        onFocus={() => setMeetingReminderChannelSearchOpen(true)}
                          onClick={() => setMeetingReminderChannelSearchOpen(true)}
                                        onBlur={() => window.setTimeout(() => setMeetingReminderChannelSearchOpen(false), 120)}
                                        onChange={(event) => {
                                          setMeetingReminderChannelSearch(event.target.value);
                                          setMeetingReminderChannelSearchOpen(true);
                                        }}
                                      />
                                      {meetingReminderChannelSearchOpen ? (
                                        <div className="crm-inline-suggestions">
                                          <div className="crm-inline-suggestions__group">
                                            <div className="crm-inline-suggestions__title">Reminder Channels</div>
                                            {filteredMeetingReminderChannels.length ? filteredMeetingReminderChannels.map((option) => (
                                              <button
                                                key={`meeting-reminder-channel-${option}`}
                                                type="button"
                                                className="crm-inline-suggestions__item"
                                                onMouseDown={(event) => event.preventDefault()}
                                                onClick={() => toggleMeetingReminderChannel(option)}
                                              >
                                                <span className="d-flex align-items-center gap-2">
                                                  <input
                                                    type="checkbox"
                                                    className="form-check-input mt-0"
                                                    checked={selectedMeetingReminderChannels.includes(option)}
                                                    readOnly
                                                  />
                                                  <span className="crm-inline-suggestions__item-main">{option}</span>
                                                </span>
                                              </button>
                                            )) : (
                                              <div className="crm-inline-suggestions__item">
                                                <span className="crm-inline-suggestions__item-main">No reminder channels found</span>
                                              </div>
                                            )}
                                          </div>
                                        </div>
                                      ) : null}
                                    </div>
                                    <div className="d-flex flex-wrap gap-2">
                                      {selectedMeetingReminderChannels.length ? selectedMeetingReminderChannels.map((option) => (
                                        <span
                                          key={`meeting-selected-reminder-channel-${option}`}
                                          className="badge text-bg-light border d-inline-flex align-items-center gap-2 wz-selected-chip"
                                        >
                                          <button
                                            type="button"
                                            className="btn btn-sm p-0 border text-secondary bg-transparent rounded-circle d-inline-flex align-items-center justify-content-center wz-selected-chip-remove"
                                            aria-label={`Remove ${option}`}
                                            onClick={() => toggleMeetingReminderChannel(option)}
                                          >
                                            &times;
                                          </button>
                                          <span>{option}</span>
                                        </span>
                                      )) : null}
                                    </div>
                                  </div>
                                );
                              }
                              if (sectionKey === "meetings" && field.key === "reminderDays") {
                                return (
                                  <div className="d-flex flex-column gap-2">
                                    <div className="crm-inline-suggestions-wrap">
                                      <input
                                        type="search"
                                        className="form-control"
                                        autoComplete="off"
                                        placeholder="Remind before days"
                                        value={meetingReminderDaySearch}
                                        onFocus={() => setMeetingReminderDaySearchOpen(true)}
                                        onClick={() => setMeetingReminderDaySearchOpen(true)}
                                        onBlur={() => window.setTimeout(() => setMeetingReminderDaySearchOpen(false), 120)}
                                        onChange={(event) => {
                                          setMeetingReminderDaySearch(event.target.value);
                                          setMeetingReminderDaySearchOpen(true);
                                        }}
                                      />
                                      {meetingReminderDaySearchOpen ? (
                                        <div className="crm-inline-suggestions">
                                          <div className="crm-inline-suggestions__group">
                                            <div className="crm-inline-suggestions__title">Remind Before Days</div>
                                            {filteredMeetingReminderDayOptions.length ? filteredMeetingReminderDayOptions.map((option) => (
                                              <button
                                                key={`meeting-reminder-day-${option.value}`}
                                                type="button"
                                                className="crm-inline-suggestions__item"
                                                onMouseDown={(event) => event.preventDefault()}
                                                onClick={() => toggleMeetingReminderDay(option.value)}
                                              >
                                                <span className="d-flex align-items-center gap-2">
                                                  <input
                                                    type="checkbox"
                                                    className="form-check-input mt-0"
                                                    checked={selectedMeetingReminderDays.includes(option.value)}
                                                    readOnly
                                                  />
                                                  <span className="crm-inline-suggestions__item-main">{option.label}</span>
                                                </span>
                                              </button>
                                            )) : (
                                              <div className="crm-inline-suggestions__item">
                                                <span className="crm-inline-suggestions__item-main">No reminder day options found</span>
                                              </div>
                                            )}
                                          </div>
                                        </div>
                                      ) : null}
                                    </div>
                                    <div className="d-flex flex-wrap gap-2">
                                      {selectedMeetingReminderDays.length ? selectedMeetingReminderDays.map((value) => {
                                        const optionLabel = meetingReminderDayOptions.find((option) => option.value === value)?.label
                                          || formatCrmMeetingReminderDayLabel(value, false)
                                          || value;
                                        return (
                                          <span
                                            key={`meeting-selected-reminder-day-${value}`}
                                            className="badge text-bg-light border d-inline-flex align-items-center gap-2 wz-selected-chip"
                                          >
                                            <button
                                              type="button"
                                              className="btn btn-sm p-0 border text-secondary bg-transparent rounded-circle d-inline-flex align-items-center justify-content-center wz-selected-chip-remove"
                                              aria-label={`Remove ${optionLabel}`}
                                              onClick={() => toggleMeetingReminderDay(value)}
                                            >
                                              &times;
                                            </button>
                                            <span>{optionLabel}</span>
                                          </span>
                                        );
                                      }) : null}
                                    </div>
                                  </div>
                                );
                              }
                              if (sectionKey === "meetings" && field.key === "reminderMinutes") {
                                return (
                                  <div className="d-flex flex-column gap-2">
                                    <div className="crm-inline-suggestions-wrap">
                                      <input
                                        type="search"
                                        className="form-control"
                                        autoComplete="off"
                                        placeholder="Reminder minutes"
                                        value={meetingReminderMinuteSearch}
                                        onFocus={() => setMeetingReminderMinuteSearchOpen(true)}
                                        onClick={() => setMeetingReminderMinuteSearchOpen(true)}
                                        onBlur={() => window.setTimeout(() => setMeetingReminderMinuteSearchOpen(false), 120)}
                                        onChange={(event) => {
                                          setMeetingReminderMinuteSearch(event.target.value);
                                          setMeetingReminderMinuteSearchOpen(true);
                                        }}
                                      />
                                      {meetingReminderMinuteSearchOpen ? (
                                        <div className="crm-inline-suggestions">
                                          <div className="crm-inline-suggestions__group">
                                            <div className="crm-inline-suggestions__title">Reminder Before (Minutes)</div>
                                            {filteredMeetingReminderMinuteOptions.length ? filteredMeetingReminderMinuteOptions.map((option) => (
                                              <button
                                                key={`meeting-reminder-minute-${option.value}`}
                                                type="button"
                                                className="crm-inline-suggestions__item"
                                                onMouseDown={(event) => event.preventDefault()}
                                                onClick={() => toggleMeetingReminderMinute(option.value)}
                                              >
                                                <span className="d-flex align-items-center gap-2">
                                                  <input
                                                    type="checkbox"
                                                    className="form-check-input mt-0"
                                                    checked={selectedMeetingReminderMinutes.includes(option.value)}
                                                    readOnly
                                                  />
                                                  <span className="crm-inline-suggestions__item-main">{option.label}</span>
                                                </span>
                                              </button>
                                            )) : (
                                              <div className="crm-inline-suggestions__item">
                                                <span className="crm-inline-suggestions__item-main">No reminder minute options found</span>
                                              </div>
                                            )}
                                          </div>
                                        </div>
                                      ) : null}
                                    </div>
                                    <div className="d-flex flex-wrap gap-2">
                                      {selectedMeetingReminderMinutes.length ? selectedMeetingReminderMinutes.map((value) => {
                                        const optionLabel = getCrmMeetingReminderMinuteLabel(value) || `${value} Mins`;
                                        return (
                                          <span
                                            key={`meeting-selected-reminder-minute-${value}`}
                                            className="badge text-bg-light border d-inline-flex align-items-center gap-2 wz-selected-chip"
                                          >
                                            <button
                                              type="button"
                                              className="btn btn-sm p-0 border text-secondary bg-transparent rounded-circle d-inline-flex align-items-center justify-content-center wz-selected-chip-remove"
                                              aria-label={`Remove ${optionLabel}`}
                                              onClick={() => toggleMeetingReminderMinute(value)}
                                            >
                                              &times;
                                            </button>
                                            <span>{optionLabel}</span>
                                          </span>
                                        );
                                      }) : null}
                                    </div>
                                  </div>
                                );
                              }
                              if (field.type === "datalist") {
                                return (
                                  <Fragment>
                                    <input
                                      type="text"
                                      list={`${sectionKey}-${field.key}-datalist`}
                                      className="form-control datalist-readable-input"
                                      placeholder={field.placeholder}
                                      value={formValues[field.key] || ""}
                                      required={isCrmFieldRequired(sectionKey, field, formValues)}
                                      onChange={(event) => setField(sectionKey, field.key, event.target.value)}
                                    />
                                    <datalist id={`${sectionKey}-${field.key}-datalist`}>
                                      {field.datalistSource === "crmContacts"
                                        ? (moduleData.contacts || []).flatMap((contact) => {
                                            const options = [];
                                            if (String(contact.name || "").trim()) options.push(contact.name.trim());
                                            if (String(contact.company || "").trim()) options.push(contact.company.trim());
                                            return options;
                                          }).filter((value, index, arr) => arr.indexOf(value) === index).map((value) => (
                                            <option key={`${sectionKey}-${field.key}-${value}`} value={value} />
                                          ))
                                        : field.datalistSource === "erpUsers"
                                          ? crmUserOptions.map((value) => (
                                              <option key={`${sectionKey}-${field.key}-${value}`} value={value} />
                                            ))
                                          : field.datalistSource === "accountsCustomers"
                                            ? sharedCustomerDatalistOptions.map((value) => (
                                                <option key={`${sectionKey}-${field.key}-${value}`} value={value} />
                                              ))
                                          : null}
                                    </datalist>
                                  </Fragment>
                                );
                              }
                              if (field.type === "multiselect") {
                                return (
                                  <select
                                    className="form-select"
                                    multiple
                                    size={1}
                                    value={Array.isArray(formValues[field.key]) ? formValues[field.key] : []}
                                    required={isCrmFieldRequired(sectionKey, field, formValues)}
                                    onChange={(event) => {
                                      const selectedValues = Array.from(event.target.selectedOptions).map((option) => option.value);
                                      setField(sectionKey, field.key, selectedValues);
                                    }}
                                  >
                                    {((field.optionSource === "erpUsers" ? crmUserOptions : field.options) || []).map((option) => (
                                      <option key={option} value={option}>{option}</option>
                                    ))}
                                  </select>
                                );
                              }
                              if (field.type === "select") {
                                const emptyOptionLabel = sectionKey === "meetings" && field.key === "meetingMode"
                                  ? "Select Mode"
                                  : `Select ${field.label}`;
                                return (
                                  <select
                                    className="form-select"
                                    value={formValues[field.key] || ""}
                                    required={isCrmFieldRequired(sectionKey, field, formValues)}
                                    onChange={(event) => setField(sectionKey, field.key, event.target.value)}
                                  >
                                    <option value="">{emptyOptionLabel}</option>
                                    {((field.optionSource === "crmTeams" ? crmTeamOptions : field.options) || []).map((option) => (
                                      <option key={option} value={option}>{option}</option>
                                    ))}
                                  </select>
                                );
                              }
                              if (field.type === "date" || field.type === "time") {
                                const minValue = sectionKey === "meetings" && field.key === "meetingDate"
                                  ? getTodayIsoDate()
                                  : undefined;
                                return (
                                  <input
                                    type={field.type}
                                    name={field.key}
                                    className={`form-control ${sectionFieldErrors[sectionKey]?.[field.key] ? "is-invalid" : ""}`}
                                    value={formValues[field.key] || ""}
                                    min={minValue}
                                    required={isCrmFieldRequired(sectionKey, field, formValues)}
                                    onChange={(event) => setField(sectionKey, field.key, event.target.value)}
                                  />
                                );
                              }
                              return (
                                <input
                                  type={
                                    field.type === "email" || String(field.key || "").toLowerCase().includes("email")
                                      ? "email"
                                      : "text"
                                  }
                                  inputMode={
                                    isAmountFieldKey(field.key)
                                      ? "decimal"
                                      : field.type === "email" || String(field.key || "").toLowerCase().includes("email")
                                      ? "email"
                                      : undefined
                                  }
                                  className={`form-control ${sectionKey === "meetings" && field.key === "relatedTo" ? "crm-meeting-relatedto-input" : ""}`}
                                  placeholder={field.placeholder}
                                  value={formValues[field.key] || ""}
                                  readOnly={sectionKey === "leads" && field.key === "contactPerson"}
                                  required={isCrmFieldRequired(sectionKey, field, formValues)}
                                  onChange={(event) => setField(sectionKey, field.key, event.target.value)}
                                />
                              );
                            })()}
                          </div>
                          )}
                          {(sectionKey === "leads" || sectionKey === "deals" || sectionKey === "followUps" || sectionKey === "activities") && (field.key === "status" || (sectionKey === "activities" && field.key === "notes")) ? (
                            <div
                              className={
                                sectionKey === "leads"
                                  ? "col-12 col-md-6 col-xl-2 ms-xl-auto d-flex align-items-end justify-content-end"
                                  : sectionKey === "deals"
                                  ? "col-12 col-md-6 col-xl-1 d-flex align-items-end"
                                  : sectionKey === "followUps"
                                  ? "col-12 col-md-6 col-xl-1 d-flex align-items-start crm-submit-align-with-input"
                                  : sectionKey === "activities"
                                  ? "col-12 col-md-6 col-xl-1 d-flex align-items-end"
                                  : "col-12 col-md-6 col-xl-4 d-flex align-items-end"
                              }
                            >
                              <div className={sectionKey === "leads" ? "d-flex gap-2 align-items-center justify-content-end w-100" : "d-flex gap-2 flex-wrap w-100"}>
                                <button
                                  type="submit"
                                  className={`btn btn-success btn-sm ${
                                    ["leads", "contacts", "deals", "followUps", "meetings", "activities"].includes(sectionKey)
                                      ? (sectionKey === "leads" ? "" : "single-row-form-submit-btn")
                                      : ""
                                  }`}
                                >
                                  {editingId ? "Update" : "Create"}
                                </button>
                                {editingId ? (
                                  <button type="button" className="btn btn-outline-light btn-sm" onClick={() => resetSectionForm(sectionKey)}>
                                    Cancel
                                  </button>
                                ) : null}
                              </div>
                            </div>
                          ) : null}
                        </Fragment>
                      ))}
                    </div>
                    {sectionKey === "contacts" ? (
                      <div className="d-flex justify-content-end gap-2 mt-2">
                        <button type="submit" className="btn btn-success btn-sm">
                          {editingId ? "Update" : "Create"}
                        </button>
                        {editingId ? (
                          <button type="button" className="btn btn-outline-light btn-sm" onClick={() => resetSectionForm(sectionKey)}>
                            Cancel
                          </button>
                        ) : null}
                      </div>
                    ) : null}
                    {sectionKey === "meetings" ? (
                      <div className="d-flex justify-content-end gap-2 mt-2">
                        <button type="submit" className="btn btn-success btn-sm">
                          {editingId ? "Update" : "Create"}
                        </button>
                        {editingId ? (
                          <button type="button" className="btn btn-outline-light btn-sm" onClick={() => resetSectionForm(sectionKey)}>
                            Cancel
                          </button>
                        ) : null}
                      </div>
                    ) : null}
                    {sectionKey !== "leads" && sectionKey !== "contacts" && sectionKey !== "deals" && sectionKey !== "followUps" && sectionKey !== "meetings" && sectionKey !== "activities" ? (
                      <div className="d-flex gap-2">
                        <button type="submit" className="btn btn-success btn-sm">
                          {editingId ? "Update" : "Create"}
                        </button>
                        {editingId ? (
                          <button type="button" className="btn btn-outline-light btn-sm" onClick={() => resetSectionForm(sectionKey)}>
                            Cancel
                          </button>
                        ) : null}
                      </div>
                    ) : null}
                  </Fragment>
                )}
              </form>
            </div>
            </div>
            ) : null}

		            <div
              className={sectionKey === "teams" ? "col-12 col-xl-9" : ""}
              style={sectionKey === "leads" ? { paddingTop: "25px" } : undefined}
            >
            <SearchablePaginatedTableCard
              key={`${sectionKey}-${isDeletedSectionView ? "deleted" : "active"}`}
              title={`${config.label} List`}
              badgeLabel=""
              rows={filteredRows}
              columns={tableColumns}
              withoutOuterCard={sectionKey !== "teams"}
              searchPlaceholder={`Search ${config.label.toLowerCase()}`}
              noRowsText={isDeletedSectionView ? `No deleted ${config.label.toLowerCase()} items.` : `No ${config.label.toLowerCase()} yet.`}
              enableExport={sectionKey !== "meetings"}
              enableImport={sectionKey !== "meetings"}
              exportFileName={`crm-${config.label.toLowerCase().replace(/\s+/g, "-")}`}
              onImportRows={(importedRows) => importRows(sectionKey, importedRows)}
              headerBottom={sectionKey === "leads" ? (
                <div className="d-flex flex-column gap-2">
                  <div className="d-flex flex-wrap gap-2">
                    {leadStatusTabs.map((tab) => (
                      <button
                        key={`lead-status-tab-${tab.key}`}
                        type="button"
                        className={`btn btn-sm ${leadStatusTab === tab.key ? "btn-success" : "btn-outline-light"}`}
                        onClick={() => {
                          setLeadStatusTab(tab.key);
                          setDeletedViewSection("");
                        }}
                      >
                        {tab.label} ({leadTabCounts[tab.key] || 0})
                      </button>
                    ))}
                    {isCrmAdmin ? (
                      <button
                        type="button"
                        data-no-delete-confirm="true"
                        className={`btn btn-sm ${isDeletedSectionView ? "btn-danger" : "btn-outline-danger"}`}
                        onClick={(event) => openDeletedItemsView(sectionKey, event)}
                      >
                        Deleted Items ({deletedRows.length})
                      </button>
                    ) : null}
                    {bulkActions}
                  </div>
                  {isDeletedSectionView ? (
                    <div className="small text-secondary">
                      {deletedItemsNotice}
                    </div>
                  ) : null}
                </div>
              ) : sectionKey === "contacts" ? (
                <div className="d-flex flex-column gap-2">
                  <div className="d-flex flex-wrap gap-2">
                    {contactTagTabs.map((tab) => (
                      <button
                        key={`contact-tag-tab-${tab.key}`}
                        type="button"
                        className={`btn btn-sm ${contactTagTab === tab.key ? "btn-success" : "btn-outline-light"}`}
                        onClick={() => {
                          setContactTagTab(tab.key);
                          setDeletedViewSection("");
                        }}
                      >
                        {tab.label} ({contactTagCounts[tab.key] || 0})
                      </button>
                    ))}
                    {isCrmAdmin ? (
                      <button
                        type="button"
                        data-no-delete-confirm="true"
                        className={`btn btn-sm ${isDeletedSectionView ? "btn-danger" : "btn-outline-danger"}`}
                        onClick={(event) => openDeletedItemsView(sectionKey, event)}
                      >
                        Deleted Items ({deletedRows.length})
                      </button>
                    ) : null}
                    {bulkActions}
                  </div>
                  {isDeletedSectionView ? (
                    <div className="small text-secondary">{deletedItemsNotice}</div>
                  ) : null}
                </div>
              ) : sectionKey === "deals" ? (
                <div className="d-flex flex-column gap-2">
                  <div className="d-flex flex-wrap gap-2">
                    {dealStatusTabs.map((tab) => (
                      <button
                        key={`deal-status-tab-${tab.key}`}
                        type="button"
                        className={`btn btn-sm ${dealStatusTab === tab.key ? "btn-success" : "btn-outline-light"}`}
                        onClick={() => {
                          setDealStatusTab(tab.key);
                          setDeletedViewSection("");
                        }}
                      >
                        {tab.label} ({dealTabCounts[tab.key] || 0})
                      </button>
                    ))}
                    {isCrmAdmin ? (
                      <button
                        type="button"
                        data-no-delete-confirm="true"
                        className={`btn btn-sm ${isDeletedSectionView ? "btn-danger" : "btn-outline-danger"}`}
                        onClick={(event) => openDeletedItemsView(sectionKey, event)}
                      >
                        Deleted Items ({deletedRows.length})
                      </button>
                    ) : null}
                    {bulkActions}
                  </div>
                  {isDeletedSectionView ? (
                    <div className="small text-secondary">{deletedItemsNotice}</div>
                  ) : null}
                </div>
              ) : sectionKey === "followUps" ? (
                <div className="d-flex flex-column gap-2">
                  <div className="d-flex flex-wrap gap-2">
                    {followUpStatusTabs.map((tab) => (
                      <button
                        key={`followup-status-tab-${tab.key}`}
                        type="button"
                        className={`btn btn-sm ${followUpStatusTab === tab.key ? "btn-success" : "btn-outline-light"}`}
                        onClick={() => {
                          setFollowUpStatusTab(tab.key);
                          setDeletedViewSection("");
                        }}
                      >
                        {tab.label} ({followUpTabCounts[tab.key] || 0})
                      </button>
                    ))}
                    {isCrmAdmin ? (
                      <button
                        type="button"
                        data-no-delete-confirm="true"
                        className={`btn btn-sm ${isDeletedSectionView ? "btn-danger" : "btn-outline-danger"}`}
                        onClick={(event) => openDeletedItemsView(sectionKey, event)}
                      >
                        Deleted Items ({deletedRows.length})
                      </button>
                    ) : null}
                    {bulkActions}
                  </div>
                  {isDeletedSectionView ? (
                    <div className="small text-secondary">{deletedItemsNotice}</div>
                  ) : null}
                </div>
              ) : sectionKey === "meetings" ? (
                <div className="d-flex flex-column gap-2">
                  <div className="d-flex flex-wrap gap-2">
                    {meetingStatusTabs.map((tab) => (
                      <button
                        key={`meeting-status-tab-${tab.key}`}
                        type="button"
                        className={`btn btn-sm ${meetingStatusTab === tab.key ? "btn-success" : "btn-outline-light"}`}
                        onClick={() => {
                          setMeetingStatusTab(tab.key);
                          setDeletedViewSection("");
                        }}
                      >
                        {tab.label} ({meetingTabCounts[tab.key] || 0})
                      </button>
                    ))}
                    {isCrmAdmin ? (
                      <button
                        type="button"
                        data-no-delete-confirm="true"
                        className={`btn btn-sm ${isDeletedSectionView ? "btn-danger" : "btn-outline-danger"}`}
                        onClick={(event) => openDeletedItemsView(sectionKey, event)}
                      >
                        Deleted Items ({deletedRows.length})
                      </button>
                    ) : null}
                    {bulkActions}
                  </div>
                  {isDeletedSectionView ? (
                    <div className="small text-secondary">{deletedItemsNotice}</div>
                  ) : null}
                </div>
              ) : isCrmAdmin ? (
                <div className="d-flex flex-column gap-2">
                  <div className="d-flex flex-wrap gap-2">
                    <button
                      type="button"
                      data-no-delete-confirm="true"
                      className={`btn btn-sm ${isDeletedSectionView ? "btn-danger" : "btn-outline-danger"}`}
                      onClick={(event) => openDeletedItemsView(sectionKey, event)}
                    >
                      Deleted Items ({deletedRows.length})
                    </button>
                    {bulkActions}
                  </div>
                  {isDeletedSectionView ? (
                    <div className="small text-secondary">{deletedItemsNotice}</div>
                  ) : null}
                </div>
              ) : (
                bulkActions
              )}
              searchBy={(row) => config.columns.map((column) => row[column.key] || "").join(" ")}
              pageSize={sectionKey === "leads" ? 15 : DEFAULT_TABLE_PAGE_SIZE}
              exportCellValue={(row, column) => {
                if (column.key === "phone") {
                  const phone = String(row.phone || "").trim();
                  if (!phone) return "";
                  return `${String(row.phoneCountryCode || "+91").trim()} ${phone}`;
                }
                if (sectionKey === "meetings" && column.key === "meetingTime") {
                  return formatTimeToAmPm(row[column.key]);
                }
                if (column.key === "reminderSummary") {
                  return row.reminderSummary || buildCrmMeetingReminderSummary(row.reminderChannel, row.reminderDays, row.reminderMinutes);
                }
                return formatDateLikeCellValue(column.key, row[column.key], "");
              }}
	              renderCells={(row) =>
	                config.columns.map((column) => {
	                  if (column.key === "phone") {
	                    const phone = String(row.phone || "").trim();
	                    if (!phone) return "-";
	                    return `${String(row.phoneCountryCode || "+91").trim()} ${phone}`;
	                  }
                  if (sectionKey === "leads" && column.key === "assignedTo") {
                    const assignType = String(row.assignType || "").trim().toLowerCase();
                    const assignedUsers = Array.isArray(row.assignedUser)
                      ? row.assignedUser.map((item) => String(item || "").trim()).filter(Boolean)
                      : String(row.assignedUser || row.assignedTo || "")
                        .split(",")
                        .map((item) => item.trim())
                        .filter(Boolean);
                    if (assignType === "team") {
                      return formatDateLikeCellValue(
                        column.key,
                        String(row.assignedTeam || row.assignedTo || "").trim(),
                        "-"
                      );
                    }
                    if (assignedUsers.length) {
                      if (assignedUsers.length === 1) {
                        return assignedUsers[0];
                      }
                      const label = `${assignedUsers.length} Employees`;
                      return (
                        <button
                          type="button"
                          className="btn btn-link btn-sm p-0 align-baseline"
                          onClick={() => openLeadAssignedEmployeesPopup(row)}
                        >
                          {label}
                        </button>
                      );
                    }
                    return formatDateLikeCellValue(column.key, row[column.key], "-");
                  }
                  if (sectionKey === "teams" && column.key === "employeeCount") {
                    const members = parseTeamMemberList(row?.members);
                    const count = Number.isFinite(parseInt(String(row?.employeeCount || "").trim(), 10))
                      ? parseInt(String(row.employeeCount || "").trim(), 10)
                      : members.length;
                    const label = count === 1 ? "1 Employee" : `${count} Employees`;
                    return (
                      <button
                        type="button"
                        className="btn btn-link btn-sm p-0 align-baseline"
                        onClick={() => openTeamMembersPopup(row)}
                      >
                        {label}
                      </button>
                    );
                  }
                  if (sectionKey === "meetings" && column.key === "meetingTime") {
                    return formatTimeToAmPm(row[column.key]);
                  }
                  if (sectionKey === "followUps" && column.key === "status") {
                    const effectiveStatus = getFollowUpEffectiveStatus(row);
                    return `${effectiveStatus[0].toUpperCase()}${effectiveStatus.slice(1)}`;
                  }
                  if (sectionKey === "contacts" && column.key === "tag") {
                    return formatDateLikeCellValue(column.key, normalizeCrmContactTag(row[column.key]), "-");
                  }
                  if (sectionKey === "leads" && column.key === "leadAmount") {
                    const amount = parseNumber(row[column.key]);
                    return amount ? formatCurrencyAmount(amount, crmCurrencyCode) : "-";
                  }
                  if (sectionKey === "deals" && (column.key === "dealValueExpected" || column.key === "wonAmountFinal")) {
                    const amount = parseNumber(row[column.key]);
                    return amount ? formatCurrencyAmount(amount, crmCurrencyCode) : "-";
                  }
                  if (sectionKey === "salesOrders" && column.key === "amount") {
                    const amount = parseNumber(row[column.key]);
                    return amount ? formatCurrencyAmount(amount, crmCurrencyCode) : "-";
                  }
	                  return formatDateLikeCellValue(column.key, row[column.key], "-");
	                })
              }
              renderActions={(row) => (
                isDeletedSectionView ? (
                  <div className="d-inline-flex gap-2">
                    {isCrmAdmin ? (
                      <input
                        type="checkbox"
                        className="form-check-input mt-0 align-self-center"
                        checked={selectedIdSet.has(String(row.id || "").trim())}
                        onChange={(event) => toggleCrmRowSelection(sectionKey, row.id, event.target.checked)}
                      />
                    ) : null}
                    {isCrmAdmin ? (
                      <button type="button" className="btn btn-sm btn-outline-success" onClick={() => onRestore(sectionKey, row.id)}>
                        Restore
                      </button>
                    ) : null}
                    {isCrmAdmin ? (
                      <button type="button" className="btn btn-sm btn-outline-danger" onClick={() => onPermanentDelete(sectionKey, row.id)}>
                        Delete
                      </button>
                    ) : null}
                  </div>
                ) : (
                  <div className="d-inline-flex gap-2">
                    {canEditCrmRow(sectionKey, row) ? (
                      <input
                        type="checkbox"
                        className="form-check-input mt-0 align-self-center"
                        checked={selectedIdSet.has(String(row.id || "").trim())}
                        onChange={(event) => toggleCrmRowSelection(sectionKey, row.id, event.target.checked)}
                      />
                    ) : null}
                    {sectionKey === "leads" && canEditCrmRow(sectionKey, row) ? (
                      <button
                        type="button"
                        className="btn btn-sm btn-outline-success"
                        onClick={() => onConvertLeadToDeal(row)}
                        disabled={["closed", "onhold"].includes(String(row.status || "").trim().toLowerCase())}
                        title="Create deal from lead"
                      >
                        Convert to Deal
                      </button>
                    ) : null}
                    {sectionKey === "deals" && canEditCrmRow(sectionKey, row) ? (
                      <button
                        type="button"
                        className="btn btn-sm btn-outline-success"
                        onClick={() => onConvertDealToSalesOrder(row)}
                        disabled={String(row.status || "").trim().toLowerCase() !== "won"}
                        title="Create sales order from won deal"
                      >
                        Convert to Sales Order
                      </button>
                    ) : null}
                    {canEditCrmRow(sectionKey, row) ? (
                      <button
                        type="button"
                        className="btn btn-sm btn-outline-info"
                        onClick={() => (
                          sectionKey === "deals"
                            ? openDealQuickEditPopup(row)
                            : onEdit(sectionKey, row)
                        )}
                      >
                        Edit
                      </button>
                    ) : null}
                    {canDeleteCrmRow(sectionKey, row) ? (
                      <button type="button" className="btn btn-sm btn-outline-danger" onClick={() => onDelete(sectionKey, row.id)}>
                        Delete
                      </button>
                    ) : null}
                  </div>
                )
              )}
            />
            </div>

            {sectionKey === "meetings" ? (
              <div className="card p-3">
                <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-3">
                  <div>
                    <h6 className="mb-1">Meeting Schedule Calendar</h6>
                    <div className="small text-secondary">Click a meeting label to view reminder and schedule details.</div>
                    <div className="small text-secondary mt-1 d-flex flex-wrap align-items-center gap-2">
                      <span className="fw-semibold">Status:</span>
                      <span className="crm-meeting-legend-item"><span className="crm-meeting-legend-dot crm-meeting-pill-scheduled" /> Scheduled</span>
                      <span className="crm-meeting-legend-item"><span className="crm-meeting-legend-dot crm-meeting-pill-completed" /> Completed</span>
                      <span className="crm-meeting-legend-item"><span className="crm-meeting-legend-dot crm-meeting-pill-rescheduled" /> Rescheduled</span>
                      <span className="crm-meeting-legend-item"><span className="crm-meeting-legend-dot crm-meeting-pill-cancelled" /> Cancelled</span>
                      <span className="crm-meeting-legend-item"><span className="crm-meeting-legend-dot crm-meeting-pill-missed" /> Missed</span>
                      <span className="crm-meeting-legend-item"><span className="crm-meeting-legend-dot crm-meeting-pill-overdue" /> Overdue</span>
                    </div>
                  </div>
                  <div className="d-flex align-items-center gap-2">
                    <button type="button" className="btn btn-sm btn-outline-light" onClick={() => changeCalendarMonth(-1)}>
                      <i className="bi bi-chevron-left" aria-hidden="true" />
                    </button>
                    <div className="small fw-semibold px-2">{meetingCalendar.monthLabel}</div>
                    <button type="button" className="btn btn-sm btn-outline-light" onClick={() => changeCalendarMonth(1)}>
                      <i className="bi bi-chevron-right" aria-hidden="true" />
                    </button>
                  </div>
                </div>

                <div className="mb-2 crm-meeting-calendar-grid">
                  {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((dayLabel) => (
                    <div key={dayLabel} className="small text-secondary text-center fw-semibold py-1">
                      {dayLabel}
                    </div>
                  ))}
                  {meetingCalendar.cells.map((cell) => (
                    <div
                      key={cell.isoDate}
                      className={`crm-meeting-calendar-cell ${cell.inMonth ? "crm-meeting-calendar-cell--in-month" : "crm-meeting-calendar-cell--out-month"}`}
                    >
                      <div className="small fw-semibold mb-1">{cell.day}</div>
                      <div className="d-flex flex-column gap-1">
                        {cell.meetings.slice(0, 3).map((meeting) => (
                          <button
                            key={meeting.id}
                            type="button"
                            className={`btn btn-sm text-start ${getMeetingCalendarPillClass(meeting)}`}
                            style={{
                              fontSize: "0.7rem",
                              lineHeight: 1.2,
                              padding: "3px 6px",
                              whiteSpace: "nowrap",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                            }}
                            title={`${formatTimeToAmPm(meeting.meetingTime)} ${meeting.title || ""}`}
                            onClick={() => openMeetingPopup(meeting)}
                          >
                            {formatTimeToAmPm(meeting.meetingTime)} {meeting.title || "Meeting"}
                          </button>
                        ))}
                        {cell.meetings.length > 3 ? (
                          <div className="small text-secondary">+{cell.meetings.length - 3} more</div>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        );
      })}

      {meetingPopup ? (
        <div
          role="dialog"
          aria-modal="true"
          className="position-fixed top-0 start-0 w-100 h-100 d-flex align-items-center justify-content-center"
          style={{ background: "rgba(0,0,0,0.65)", zIndex: 1050, padding: "1rem" }}
          onClick={closeMeetingPopup}
        >
          <div
            className="card p-3"
            style={{ width: "min(560px, 100%)" }}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="d-flex align-items-start justify-content-between gap-3 mb-2">
              <div>
                <h5 className="mb-1">{meetingPopup.title || "Meeting"}</h5>
                <div className="small text-secondary">{meetingPopup.relatedTo || "-"}</div>
              </div>
              <button type="button" className="btn btn-sm btn-outline-light" onClick={closeMeetingPopup}>
                <i className="bi bi-x-lg" aria-hidden="true" />
              </button>
            </div>
            <div className="row g-3 small">
              <div className="col-6">
                <div className="text-secondary">Date</div>
                <div className="fw-semibold">{formatDateLikeCellValue("meetingDate", meetingPopup.meetingDate, "-")}</div>
              </div>
              <div className="col-6">
                <div className="text-secondary">Time</div>
                <div className="fw-semibold">{formatTimeToAmPm(meetingPopup.meetingTime)}</div>
              </div>
              <div className="col-6">
                <div className="text-secondary">Owner</div>
                <div className="fw-semibold">{meetingPopup.owner || "-"}</div>
              </div>
              <div className="col-6">
                <div className="text-secondary">Meeting Mode</div>
                <div className="fw-semibold">{meetingPopup.meetingMode || "-"}</div>
              </div>
              <div className="col-6">
                <div className="text-secondary">Reminder</div>
                <div className="fw-semibold">{meetingPopup.reminderSummary || buildCrmMeetingReminderSummary(meetingPopup.reminderChannel, meetingPopup.reminderDays, meetingPopup.reminderMinutes) || "-"}</div>
              </div>
              <div className="col-6">
                <div className="text-secondary">Status</div>
                <select
                  className="form-select form-select-sm mt-1"
                  value={meetingPopup.status || ""}
                  onChange={(event) => updateMeetingStatus(meetingPopup.id, event.target.value)}
                >
                  <option value="">Select Status</option>
                  {["Scheduled", "Completed", "Rescheduled", "Cancelled", "Missed"].map((statusOption) => (
                    <option key={`meeting-popup-status-${statusOption}`} value={statusOption}>
                      {statusOption}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        </div>
      ) : null}
      {dealQuickEditPopup ? (
        <div
          role="dialog"
          aria-modal="true"
          className="position-fixed top-0 start-0 w-100 h-100 d-flex align-items-center justify-content-center"
          style={{ background: "rgba(0,0,0,0.65)", zIndex: 1050, padding: "1rem" }}
          onClick={closeDealQuickEditPopup}
        >
          <div
            className="card p-3"
            style={{ width: "min(440px, 94vw)" }}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="d-flex align-items-start justify-content-between gap-3 mb-3">
              <div>
                <h5 className="mb-1">Edit Deal</h5>
                <div className="small text-secondary">{dealQuickEditPopup.dealName || "-"}</div>
              </div>
              <button type="button" className="btn btn-sm btn-outline-light" onClick={closeDealQuickEditPopup}>
                <i className="bi bi-x-lg" aria-hidden="true" />
              </button>
            </div>
            <form className="d-flex flex-column gap-3" onSubmit={saveDealQuickEditPopup}>
              {dealQuickEditPopup.error ? (
                <div className="alert alert-danger py-2 mb-0">{dealQuickEditPopup.error}</div>
              ) : null}
              <div>
                <label className="form-label small text-secondary mb-1">{`Won Amount (${crmCurrencyCode} ${crmCurrencySymbol})`}</label>
                <input
                  type="text"
                  inputMode="decimal"
                  className="form-control"
                  placeholder="Final Won Amount"
                  value={dealQuickEditPopup.wonAmountFinal || ""}
                  onChange={(event) => setDealQuickEditPopup((prev) => (
                    prev
                      ? {
                          ...prev,
                          wonAmountFinal: formatCurrencyNumberInput(sanitizeCurrencyInput(event.target.value), crmCurrencyCode),
                          error: "",
                        }
                      : prev
                  ))}
                />
                {parseNumber(dealQuickEditPopup.dealValueExpected || "") > 0 ? (
                  <div className="small text-secondary mt-1">
                    {`Max allowed: ${formatCurrencyAmount(parseNumber(dealQuickEditPopup.dealValueExpected || ""), crmCurrencyCode)}`}
                  </div>
                ) : null}
              </div>
              <div>
                <label className="form-label small text-secondary mb-1">Status *</label>
                <select
                  className="form-select"
                  value={dealQuickEditPopup.status || "Open"}
                  onChange={(event) => setDealQuickEditPopup((prev) => (
                    prev
                      ? { ...prev, status: event.target.value, error: "" }
                      : prev
                  ))}
                >
                  {CRM_DEAL_STATUS_OPTIONS.map((option) => (
                    <option key={`deal-edit-status-${option}`} value={option}>{option}</option>
                  ))}
                </select>
              </div>
              <div className="d-flex justify-content-end gap-2">
                <button type="button" className="btn btn-outline-light btn-sm" onClick={closeDealQuickEditPopup}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-success btn-sm">
                  Update
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
      {teamMembersPopup ? (
        <div
          role="dialog"
          aria-modal="true"
          className="position-fixed top-0 start-0 w-100 h-100 d-flex align-items-center justify-content-center"
          style={{ background: "rgba(0,0,0,0.65)", zIndex: 1050, padding: "1rem" }}
          onClick={closeTeamMembersPopup}
        >
          <div
            className="card p-3 wz-team-members-popup"
            style={{ width: "min(420px, 92vw)" }}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="d-flex align-items-start justify-content-between gap-3 mb-3">
              <div>
                <h5 className="mb-1">{teamMembersPopup.title || "Team Employees"}</h5>
                <div className="small text-secondary">{teamMembersPopup.name || "-"}</div>
              </div>
              <button type="button" className="btn btn-sm wz-team-members-popup-close" onClick={closeTeamMembersPopup}>
                <i className="bi bi-x-lg" aria-hidden="true" />
              </button>
            </div>
            <div>
              {teamMembersPopup.members.length ? (
                <div className="table-responsive">
                  <table className="table table-sm table-bordered mb-0 align-middle">
                    <tbody>
                      {(() => {
                        const half = Math.ceil(teamMembersPopup.members.length / 2);
                        const leftColumn = teamMembersPopup.members.slice(0, half);
                        const rightColumn = teamMembersPopup.members.slice(half);
                        const rows = Math.max(leftColumn.length, rightColumn.length);
                        return Array.from({ length: rows }).map((_, rowIndex) => (
                          <tr key={`team-member-row-${rowIndex}`}>
                            <td className="p-2">{leftColumn[rowIndex] || "-"}</td>
                            <td className="p-2">{rightColumn[rowIndex] || "-"}</td>
                          </tr>
                        ));
                      })()}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="small text-secondary">No employees found.</div>
              )}
            </div>
          </div>
        </div>
      ) : null}
      {crmActionPopup.open ? (
        <div
          role="dialog"
          aria-modal="true"
          className="modal-overlay"
          onClick={() => setCrmActionPopup({ open: false, title: "", message: "" })}
        >
          <div className="modal-panel" style={{ width: "min(420px, 92vw)" }} onClick={(event) => event.stopPropagation()}>
            <div className="d-flex align-items-start justify-content-between gap-3 mb-3">
              <h5 className="mb-0">{crmActionPopup.title || "Success"}</h5>
              <button
                type="button"
                className="btn btn-sm btn-outline-light"
                onClick={() => setCrmActionPopup({ open: false, title: "", message: "" })}
              >
                <i className="bi bi-x-lg" aria-hidden="true" />
              </button>
            </div>
            <div className="text-secondary mb-3">{crmActionPopup.message || "Operation completed successfully."}</div>
            <div className="d-flex justify-content-end">
              <button
                type="button"
                className="btn btn-success btn-sm"
                onClick={() => setCrmActionPopup({ open: false, title: "", message: "" })}
              >
                OK
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function ProjectManagementModule() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState("projects");
  const [moduleData, setModuleData] = useState(() => readProjectWorkspaceData());
  const [formValues, setFormValues] = useState(buildEmptyValues(PROJECT_TAB_CONFIG.projects.fields));
  const [projectFormNotice, setProjectFormNotice] = useState("");
  const [editingId, setEditingId] = useState("");
  const [showProjectClientSuggestions, setShowProjectClientSuggestions] = useState(false);
  const [projectClientForm, setProjectClientForm] = useState({
    id: "",
    companyName: "",
    clientName: "",
    name: "",
    gstin: "",
    phoneCountryCode: "+91",
    phone: "",
    additionalPhones: [],
    email: "",
    additionalEmails: [],
    billingAddress: "",
    shippingAddress: "",
    billingCountry: "India",
    billingState: "",
    billingPincode: "",
    shippingCountry: "India",
    shippingState: "",
    shippingPincode: "",
    billingShippingSame: false
  });
  const [editingProjectClientId, setEditingProjectClientId] = useState("");
  const [projectStatusTab, setProjectStatusTab] = useState("all");
  const [sharedCustomers, setSharedCustomers] = useState(() => readSharedAccountsCustomers());
  const [sharedCrmContacts, setSharedCrmContacts] = useState(() => readSharedCrmContacts());

  useEffect(() => {
    function syncSharedCustomers() {
      setSharedCustomers(readSharedAccountsCustomers());
    }
    syncSharedCustomers();
    window.addEventListener("storage", syncSharedCustomers);
    window.addEventListener("focus", syncSharedCustomers);
    return () => {
      window.removeEventListener("storage", syncSharedCustomers);
      window.removeEventListener("focus", syncSharedCustomers);
    };
  }, []);

  useEffect(() => {
    function syncSharedCrmContacts() {
      setSharedCrmContacts(readSharedCrmContacts());
    }
    syncSharedCrmContacts();
    window.addEventListener("storage", syncSharedCrmContacts);
    window.addEventListener("focus", syncSharedCrmContacts);
    return () => {
      window.removeEventListener("storage", syncSharedCrmContacts);
      window.removeEventListener("focus", syncSharedCrmContacts);
    };
  }, []);

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(normalizeProjectData(moduleData)));
  }, [moduleData]);

  useEffect(() => {
    setEditingId("");
    setProjectFormNotice("");
    setFormValues(buildEmptyValues(PROJECT_TAB_CONFIG[activeTab].fields));
  }, [activeTab]);

  const config = PROJECT_TAB_CONFIG[activeTab];
  const projectStatusTabs = [
    { key: "all", label: "All" },
    { key: "ongoing", label: "Ongoing" },
    { key: "new", label: "New" },
    { key: "hold", label: "Hold" },
    { key: "completed", label: "Completed" },
  ];
  const rawRows = activeTab === "customers" ? sharedCustomers : (moduleData[activeTab] || []);
  const currentRows = activeTab === "projects"
    ? (projectStatusTab === "all"
        ? rawRows
        : rawRows.filter((row) => String(row.status || "").trim().toLowerCase() === projectStatusTab))
    : rawRows;
  const projectInlineSubmitTabs = new Set(["projects"]);
  const accountsCustomerOptions = useMemo(
    () => sharedCustomers
      .flatMap((row) => [
        String(row.companyName || row.name || "").trim(),
        String(row.clientName || "").trim(),
        getSharedCustomerDisplayName(row),
      ])
      .filter(Boolean)
      .filter((value, index, list) => list.indexOf(value) === index),
    [sharedCustomers]
  );
  const projectClientQuery = activeTab === "projects" ? String(formValues.clientCompany || "").trim().toLowerCase() : "";
  const projectCrmContactMatches = projectClientQuery
    ? sharedCrmContacts.filter((contact) => {
        const haystack = `${contact.name || ""} ${contact.company || ""} ${contact.email || ""}`.toLowerCase();
        return haystack.includes(projectClientQuery);
      }).slice(0, 6)
    : [];
  const projectCustomerMatches = projectClientQuery
    ? sharedCustomers.filter((customer) => {
        const haystack = `${customer.companyName || ""} ${customer.clientName || ""} ${customer.email || ""}`.toLowerCase();
        return haystack.includes(projectClientQuery);
      }).slice(0, 6)
    : [];
  const projectBillingStateOptions = getStateOptionsForCountry(String(projectClientForm.billingCountry || "India"));
  const projectShippingStateOptions = getStateOptionsForCountry(String(projectClientForm.shippingCountry || "India"));

  const stats = useMemo(() => {
    const activeProjects = (moduleData.projects || []).filter((item) => String(item.status || "").toLowerCase() === "ongoing").length;
    const upcomingTasks = (moduleData.tasks || []).length;
    const overdueTasks = (moduleData.tasks || []).filter((item) => {
      const value = Date.parse(item.dueDate);
      return Number.isFinite(value) && value < Date.now();
    }).length;
    return [
      { label: "Active Projects", value: String(activeProjects), icon: "bi-diagram-3" },
      { label: "Tasks", value: String(upcomingTasks), icon: "bi-list-check" },
      { label: "Overdue Tasks", value: String(overdueTasks), icon: "bi-exclamation-triangle" }
    ];
  }, [moduleData]);
  const projectStatusCounts = useMemo(
    () =>
      projectStatusTabs.reduce((acc, tab) => {
        acc[tab.key] = tab.key === "all"
          ? (moduleData.projects || []).length
          : (moduleData.projects || []).filter(
              (item) => String(item.status || "").trim().toLowerCase() === tab.key
            ).length;
        return acc;
      }, {}),
    [moduleData.projects]
  );

  function updateSharedCustomers(updater) {
    setSharedCustomers((prev) => {
      const nextCustomers = updater(prev.map((row) => normalizeSharedCustomerRecord(row)))
        .map((row) => normalizeSharedCustomerRecord(row));
      void persistSharedAccountsCustomers(nextCustomers);
      return nextCustomers;
    });
  }

  function resetProjectClientForm() {
    setEditingProjectClientId("");
    setProjectFormNotice("");
    setProjectClientForm({
      id: "",
      companyName: "",
      clientName: "",
      name: "",
      gstin: "",
      phoneCountryCode: "+91",
      phone: "",
      additionalPhones: [],
      email: "",
      additionalEmails: [],
      billingAddress: "",
      shippingAddress: "",
      billingCountry: "India",
      billingState: "",
      billingPincode: "",
      shippingCountry: "India",
      shippingState: "",
      shippingPincode: "",
      billingShippingSame: false
    });
  }

  function getProjectClientRequiredFieldLabels(form) {
    const labels = [];
    const companyName = String(form.companyName || form.name || "").trim();
    const clientName = String(form.clientName || "").trim();
    const primaryPhone = String(form.phone || "").trim();
    const primaryEmail = String(form.email || "").trim();
    const billingAddress = String(form.billingAddress || "").trim();
    const billingState = String(form.billingState || "").trim();
    const billingPincode = String(form.billingPincode || "").trim();
    const useSameShipping = Boolean(form.billingShippingSame);
    const shippingAddress = String(form.shippingAddress || "").trim();
    const shippingState = String(form.shippingState || "").trim();
    const shippingPincode = String(form.shippingPincode || "").trim();

    if (!companyName) labels.push("Company Name");
    if (!clientName) labels.push("Client Name");
    if (!primaryPhone) labels.push("Phone Number");
    if (!primaryEmail) labels.push("Email ID");
    if (!billingAddress) labels.push("Billing Address");
    if (!billingState) labels.push("Billing State");
    if (!billingPincode) labels.push("Billing Pincode");
    if (!useSameShipping) {
      if (!shippingAddress) labels.push("Shipping Address");
      if (!shippingState) labels.push("Shipping State");
      if (!shippingPincode) labels.push("Shipping Pincode");
    }
    return labels;
  }

  function isProjectClientFieldRequired(fieldKey) {
    const alwaysRequired = new Set([
      "companyName",
      "clientName",
      "phone",
      "email",
      "billingAddress",
      "billingState",
      "billingPincode",
    ]);
    if (alwaysRequired.has(fieldKey)) {
      return true;
    }
    if (["shippingAddress", "shippingState", "shippingPincode"].includes(fieldKey)) {
      return !Boolean(projectClientForm.billingShippingSame);
    }
    return false;
  }

  function saveProjectClient(event) {
    event.preventDefault();
    const missingLabels = getProjectClientRequiredFieldLabels(projectClientForm);
    if (missingLabels.length) {
      setProjectFormNotice(`Please fill mandatory fields: ${missingLabels.join(", ")}`);
      return;
    }
    const companyName = String(projectClientForm.companyName || projectClientForm.name || "").trim();
    const clientName = String(projectClientForm.clientName || "").trim();
    const primaryPhone = String(projectClientForm.phone || "").trim();
    const primaryEmail = String(projectClientForm.email || "").trim();
    const additionalPhones = (projectClientForm.additionalPhones || [])
      .map((row) => ({ countryCode: String(row.countryCode || "+91").trim() || "+91", number: String(row.number || "").trim() }))
      .filter((row) => row.number);
    const additionalEmails = (projectClientForm.additionalEmails || [])
      .map((value) => String(value || "").trim())
      .filter(Boolean);
    const billingCountry = String(projectClientForm.billingCountry || "").trim() || "India";
    const billingState = String(projectClientForm.billingState || "").trim();
    const billingPincode = String(projectClientForm.billingPincode || "").trim();
    const useSameShipping = Boolean(projectClientForm.billingShippingSame);
    const shippingAddress = useSameShipping
      ? String(projectClientForm.billingAddress || "").trim()
      : String(projectClientForm.shippingAddress || "").trim();
    const shippingCountry = useSameShipping
      ? billingCountry
      : (String(projectClientForm.shippingCountry || "").trim() || "India");
    const shippingState = useSameShipping
      ? billingState
      : String(projectClientForm.shippingState || "").trim();
    const shippingPincode = useSameShipping
      ? billingPincode
      : String(projectClientForm.shippingPincode || "").trim();

    const payload = normalizeSharedCustomerRecord({
      ...projectClientForm,
      id: editingProjectClientId || `cust_${Date.now()}`,
      companyName,
      clientName,
      name: companyName,
      gstin: String(projectClientForm.gstin || "").trim(),
      phoneCountryCode: String(projectClientForm.phoneCountryCode || "+91").trim() || "+91",
      phone: primaryPhone,
      email: primaryEmail,
      additionalPhones,
      additionalEmails,
      phoneList: [
        ...(primaryPhone ? [{ countryCode: String(projectClientForm.phoneCountryCode || "+91").trim() || "+91", number: primaryPhone }] : []),
        ...additionalPhones
      ],
      emailList: [primaryEmail, ...additionalEmails].filter(Boolean),
      billingAddress: String(projectClientForm.billingAddress || "").trim(),
      shippingAddress,
      billingCountry,
      billingState,
      billingPincode,
      shippingCountry,
      shippingState,
      shippingPincode,
      billingShippingSame: useSameShipping,
      country: billingCountry,
      state: billingState,
      pincode: billingPincode
    });

    updateSharedCustomers((prev) => {
      if (editingProjectClientId) {
        return prev.map((row) => (row.id === editingProjectClientId ? { ...row, ...payload } : row));
      }
      return [payload, ...prev];
    });
    setProjectFormNotice("");
    resetProjectClientForm();
  }

  function editProjectClient(row) {
    const normalized = normalizeSharedCustomerRecord(row);
    setEditingProjectClientId(normalized.id);
    setProjectClientForm({
      ...normalized,
      additionalPhones: Array.isArray(normalized.additionalPhones) ? normalized.additionalPhones : [],
      additionalEmails: Array.isArray(normalized.additionalEmails) ? normalized.additionalEmails : [],
    });
    setActiveTab("customers");
  }

  function deleteProjectClient(id) {
    updateSharedCustomers((prev) => prev.filter((row) => row.id !== id));
    if (editingProjectClientId === id) {
      resetProjectClientForm();
    }
  }

  function onChangeField(fieldKey, nextValue) {
    const fieldMeta = (config.fields || []).find((field) => field.key === fieldKey);
    const normalizedValue = typeof nextValue === "string"
      ? clampBusinessAutopilotText(fieldKey, nextValue, { isTextarea: fieldMeta?.type === "textarea" })
      : nextValue;
    setFormValues((prev) => {
      const next = { ...prev, [fieldKey]: normalizedValue };
      if (activeTab === "attendance" && fieldKey === "status" && normalizedValue !== "Permission") {
        next.permissionHours = "";
      }
      return next;
    });
    if (activeTab === "projects" && fieldKey === "clientCompany") {
      setShowProjectClientSuggestions(Boolean(String(normalizedValue || "").trim()));
    }
  }

  function onEditRow(row) {
    setEditingId(row.id);
    const nextValues = buildEmptyValues(config.fields);
    if (activeTab === "customers") {
      nextValues.companyName = row.companyName || row.name || "";
      nextValues.clientName = row.clientName || "";
      nextValues.phone = row.phone || "";
      nextValues.email = row.email || "";
    } else {
      config.fields.forEach((field) => {
        nextValues[field.key] = row[field.key] || field.defaultValue || "";
      });
    }
    setFormValues(nextValues);
    setShowProjectClientSuggestions(false);
  }

  function onCancelEdit() {
    setEditingId("");
    setProjectFormNotice("");
    setFormValues(buildEmptyValues(config.fields));
    setShowProjectClientSuggestions(false);
    window.requestAnimationFrame(() => {
      clearFlatpickrDisplayValues(document);
    });
  }

  function onDeleteRow(rowId) {
    if (activeTab === "projects") {
      setModuleData((prev) => {
        const nextDetails = { ...(prev.projectDetails || {}) };
        delete nextDetails[rowId];
        return {
          ...prev,
          projects: (prev.projects || []).filter((row) => row.id !== rowId),
          projectDetails: nextDetails,
        };
      });
      if (editingId === rowId) {
        onCancelEdit();
      }
      return;
    }
    if (activeTab === "customers") {
      updateSharedCustomers((prev) => prev.filter((row) => row.id !== rowId));
      if (editingId === rowId) {
        onCancelEdit();
      }
      return;
    }
    setModuleData((prev) => ({
      ...prev,
      [activeTab]: (prev[activeTab] || []).filter((row) => row.id !== rowId)
    }));
    if (editingId === rowId) {
      onCancelEdit();
    }
  }

  async function onSubmit(event) {
    event.preventDefault();
    const syncedValuesResult = syncDateTimeFieldValuesFromForm(event.currentTarget, config.fields, formValues);
    const effectiveValues = syncedValuesResult.values;
    if (syncedValuesResult.changed) {
      setFormValues((prev) => ({ ...prev, ...effectiveValues }));
    }
    const visibleFields = config.fields.filter((field) => {
      const condition = field.conditionalOn;
      if (!condition) {
        return true;
      }
      return String(effectiveValues[condition.key] || "").trim() === String(condition.value || "").trim();
    });
    const missingFields = visibleFields.filter((field) => {
      if (field.type === "date") {
        return !normalizeMeetingDateValue(effectiveValues[field.key]);
      }
      if (field.type === "time") {
        return !normalizeMeetingTimeValue(effectiveValues[field.key]);
      }
      return !String(effectiveValues[field.key] || "").trim();
    });
    if (missingFields.length) {
      setProjectFormNotice(`Please fill mandatory fields: ${missingFields.map((field) => field.label).join(", ")}`);
      return;
    }
    if (activeTab === "customers") {
      const payload = normalizeSharedCustomerRecord({
        id: editingId || `cust_${Date.now()}`,
        companyName: String(formValues.companyName || "").trim(),
        clientName: String(formValues.clientName || "").trim(),
        phoneCountryCode: "+91",
        phone: String(formValues.phone || "").trim(),
        email: String(formValues.email || "").trim(),
      });
      updateSharedCustomers((prev) => {
        if (editingId) {
          return prev.map((row) => (row.id === editingId ? { ...row, ...payload } : row));
        }
        return [payload, ...prev];
      });
      setProjectFormNotice("");
      onCancelEdit();
      return;
    }
    const payload = {};
    config.fields.forEach((field) => {
      if (field.type === "date") {
        payload[field.key] = normalizeMeetingDateValue(effectiveValues[field.key]);
      } else if (field.type === "time") {
        payload[field.key] = normalizeMeetingTimeValue(effectiveValues[field.key]);
      } else {
        payload[field.key] = String(effectiveValues[field.key]).trim();
      }
    });
    if (activeTab === "attendance" && payload.status !== "Permission") {
      payload.permissionHours = "";
    }
    const nextRowId = editingId || `${activeTab}_${Date.now()}`;
    setModuleData((prev) => {
      const existing = prev[activeTab] || [];
      if (editingId) {
        return {
          ...prev,
          [activeTab]: existing.map((row) => (row.id === editingId ? { ...row, ...payload } : row))
        };
      }
      const nextId = `${activeTab}_${Date.now()}`;
      return {
        ...prev,
        [activeTab]: [{ id: nextId, ...payload }, ...existing],
        ...(activeTab === "projects"
          ? {
              projectDetails: {
                ...(prev.projectDetails || {}),
                [nextId]: normalizeProjectDetailRecord({}, nextId),
              },
            }
          : {}),
      };
    });
    setProjectFormNotice("");
    onCancelEdit();
  }

  function selectProjectClientCompany(nextValue) {
    onChangeField("clientCompany", nextValue);
    setShowProjectClientSuggestions(false);
  }

  return (
    <div className="d-flex flex-column gap-3">
      <div>
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
            <div className="card p-3 h-100 d-flex flex-column align-items-center justify-content-center text-center">
              <div className="stat-icon stat-icon-primary mb-2">
                <i className={`bi ${item.icon || "bi-grid"}`} aria-hidden="true" />
              </div>
              <div className="text-secondary small">{item.label}</div>
              <h5 className="mb-0 mt-1">{item.value}</h5>
            </div>
          </div>
        ))}
      </div>

      {activeTab === "customers" ? (
        <>
          <div className="card p-3" style={{ paddingTop: "20px" }}>
            <h6 className="mb-3">{editingProjectClientId ? "Edit Client" : "Create Client"}</h6>
            <form className="d-flex flex-column gap-3" onSubmit={saveProjectClient}>
              {projectFormNotice ? (
                <div className="alert alert-danger py-2 mb-0">{projectFormNotice}</div>
              ) : null}
              <div className="row g-3">
                <div className="col-12 col-xl-4">
                  <label className="form-label small text-secondary mb-1">Company Name {isProjectClientFieldRequired("companyName") ? "*" : ""}</label>
                  <input className="form-control" required={isProjectClientFieldRequired("companyName")} value={projectClientForm.companyName || ""} onChange={(e) => setProjectClientForm((p) => ({ ...p, companyName: e.target.value, name: e.target.value }))} placeholder="Company name" />
                </div>
                <div className="col-12 col-xl-4">
                  <label className="form-label small text-secondary mb-1">Client Name {isProjectClientFieldRequired("clientName") ? "*" : ""}</label>
                  <input className="form-control" required={isProjectClientFieldRequired("clientName")} value={projectClientForm.clientName || ""} onChange={(e) => setProjectClientForm((p) => ({ ...p, clientName: e.target.value }))} placeholder="Client / Contact person" />
                </div>
                <div className="col-12 col-xl-4">
                  <label className="form-label small text-secondary mb-1">GSTIN</label>
                  <input className="form-control" value={projectClientForm.gstin || ""} onChange={(e) => setProjectClientForm((p) => ({ ...p, gstin: e.target.value }))} placeholder="GSTIN" />
                </div>
                <div className="col-12 col-xl-6">
                  <label className="form-label small text-secondary mb-1">Phone Number {isProjectClientFieldRequired("phone") ? "*" : ""}</label>
                  <div className="d-flex flex-column gap-2">
                    <div className="d-flex gap-2">
                      <PhoneCountryCodePicker
                        value={projectClientForm.phoneCountryCode || "+91"}
                        onChange={(code) => setProjectClientForm((p) => ({ ...p, phoneCountryCode: code }))}
                        options={DIAL_COUNTRY_PICKER_OPTIONS}
                        style={{ maxWidth: "220px" }}
                        ariaLabel="Project client phone country code"
                      />
                      <input className="form-control" required={isProjectClientFieldRequired("phone")} value={projectClientForm.phone || ""} onChange={(e) => setProjectClientForm((p) => ({ ...p, phone: e.target.value }))} placeholder="Phone number" />
                      <button
                        type="button"
                        className="btn btn-outline-light btn-sm"
                        title="Add Contact Number"
                        onClick={() => setProjectClientForm((p) => ({ ...p, additionalPhones: [...(p.additionalPhones || []), { countryCode: "+91", number: "" }] }))}
                      >
                        +
                      </button>
                    </div>
                    {(projectClientForm.additionalPhones || []).map((row, index) => (
                      <div className="d-flex gap-2" key={`project-phone-${index}`}>
                        <PhoneCountryCodePicker
                          value={row.countryCode || "+91"}
                          onChange={(code) =>
                            setProjectClientForm((p) => ({
                              ...p,
                              additionalPhones: (p.additionalPhones || []).map((item, i) => (i === index ? { ...item, countryCode: code } : item))
                            }))
                          }
                          options={DIAL_COUNTRY_PICKER_OPTIONS}
                          style={{ maxWidth: "220px" }}
                          ariaLabel="Additional project phone country code"
                        />
                        <input className="form-control" value={row.number || ""} placeholder="Additional contact number" onChange={(e) => setProjectClientForm((p) => ({
                          ...p,
                          additionalPhones: (p.additionalPhones || []).map((item, i) => (i === index ? { ...item, number: e.target.value } : item))
                        }))} />
                        <button type="button" className="btn btn-outline-danger btn-sm" onClick={() => setProjectClientForm((p) => ({
                          ...p,
                          additionalPhones: (p.additionalPhones || []).filter((_, i) => i !== index)
                        }))}>
                          x
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="col-12 col-xl-6">
                  <label className="form-label small text-secondary mb-1">Email ID {isProjectClientFieldRequired("email") ? "*" : ""}</label>
                  <div className="d-flex flex-column gap-2">
                    <div className="d-flex gap-2">
                      <input className="form-control" required={isProjectClientFieldRequired("email")} value={projectClientForm.email || ""} onChange={(e) => setProjectClientForm((p) => ({ ...p, email: e.target.value }))} placeholder="Primary email" />
                      <button
                        type="button"
                        className="btn btn-outline-light btn-sm"
                        title="Add Email ID"
                        onClick={() => setProjectClientForm((p) => ({ ...p, additionalEmails: [...(p.additionalEmails || []), ""] }))}
                      >
                        +
                      </button>
                    </div>
                    {(projectClientForm.additionalEmails || []).map((value, index) => (
                      <div className="d-flex gap-2" key={`project-email-${index}`}>
                        <input className="form-control" value={value || ""} placeholder="Additional email ID" onChange={(e) => setProjectClientForm((p) => ({
                          ...p,
                          additionalEmails: (p.additionalEmails || []).map((item, i) => (i === index ? e.target.value : item))
                        }))} />
                        <button type="button" className="btn btn-outline-danger btn-sm" onClick={() => setProjectClientForm((p) => ({
                          ...p,
                          additionalEmails: (p.additionalEmails || []).filter((_, i) => i !== index)
                        }))}>
                          x
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="col-12 col-xl-6">
                  <div className="d-flex align-items-center justify-content-between mb-1">
                    <label className="form-label small text-secondary mb-0">Billing Address {isProjectClientFieldRequired("billingAddress") ? "*" : ""}</label>
                    <label className="form-check-label small text-secondary d-flex align-items-center gap-2 mb-0">
                      <input
                        type="checkbox"
                        className="form-check-input mt-0"
                        checked={Boolean(projectClientForm.billingShippingSame)}
                        onChange={(e) => setProjectClientForm((p) => ({ ...p, billingShippingSame: e.target.checked }))}
                      />
                      Billing and Shipping Same
                    </label>
                  </div>
                  <textarea className="form-control mb-2" required={isProjectClientFieldRequired("billingAddress")} rows="2" value={projectClientForm.billingAddress || ""} onChange={(e) => setProjectClientForm((p) => ({ ...p, billingAddress: e.target.value }))} placeholder="Billing address" />
                  <div className="d-flex flex-column gap-2">
                    <div>
                      <label className="form-label small text-secondary mb-1">Country</label>
                      <select className="form-select" value={projectClientForm.billingCountry || "India"} onChange={(e) => setProjectClientForm((p) => ({ ...p, billingCountry: e.target.value, billingState: "" }))}>
                        {COUNTRY_OPTIONS.map((country) => (
                          <option key={`project-billing-country-${country}`} value={country}>{country}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="form-label small text-secondary mb-1">State {isProjectClientFieldRequired("billingState") ? "*" : ""}</label>
                      {projectBillingStateOptions.length ? (
                        <select className="form-select" required={isProjectClientFieldRequired("billingState")} value={projectClientForm.billingState || ""} onChange={(e) => setProjectClientForm((p) => ({ ...p, billingState: e.target.value }))}>
                          <option value="">Select State</option>
                          {projectBillingStateOptions.map((state) => (
                            <option key={`project-billing-state-${state}`} value={state}>{state}</option>
                          ))}
                        </select>
                      ) : (
                        <input className="form-control" required={isProjectClientFieldRequired("billingState")} value={projectClientForm.billingState || ""} onChange={(e) => setProjectClientForm((p) => ({ ...p, billingState: e.target.value }))} placeholder="State / Province / Region" />
                      )}
                    </div>
                    <div>
                      <label className="form-label small text-secondary mb-1">Pincode {isProjectClientFieldRequired("billingPincode") ? "*" : ""}</label>
                      <input className="form-control" required={isProjectClientFieldRequired("billingPincode")} value={projectClientForm.billingPincode || ""} onChange={(e) => setProjectClientForm((p) => ({ ...p, billingPincode: e.target.value }))} placeholder="Pincode" />
                    </div>
                  </div>
                </div>
                {!projectClientForm.billingShippingSame ? (
                  <div className="col-12 col-xl-6">
                    <label className="form-label small text-secondary mb-1">Shipping Address {isProjectClientFieldRequired("shippingAddress") ? "*" : ""}</label>
                    <textarea className="form-control mb-2" required={isProjectClientFieldRequired("shippingAddress")} rows="2" value={projectClientForm.shippingAddress || ""} onChange={(e) => setProjectClientForm((p) => ({ ...p, shippingAddress: e.target.value }))} placeholder="Shipping address" />
                    <div className="d-flex flex-column gap-2">
                      <div>
                        <label className="form-label small text-secondary mb-1">Country</label>
                        <select className="form-select" value={projectClientForm.shippingCountry || "India"} onChange={(e) => setProjectClientForm((p) => ({ ...p, shippingCountry: e.target.value, shippingState: "" }))}>
                          {COUNTRY_OPTIONS.map((country) => (
                            <option key={`project-shipping-country-${country}`} value={country}>{country}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="form-label small text-secondary mb-1">State {isProjectClientFieldRequired("shippingState") ? "*" : ""}</label>
                        {projectShippingStateOptions.length ? (
                          <select className="form-select" required={isProjectClientFieldRequired("shippingState")} value={projectClientForm.shippingState || ""} onChange={(e) => setProjectClientForm((p) => ({ ...p, shippingState: e.target.value }))}>
                            <option value="">Select State</option>
                            {projectShippingStateOptions.map((state) => (
                              <option key={`project-shipping-state-${state}`} value={state}>{state}</option>
                            ))}
                          </select>
                        ) : (
                          <input className="form-control" required={isProjectClientFieldRequired("shippingState")} value={projectClientForm.shippingState || ""} onChange={(e) => setProjectClientForm((p) => ({ ...p, shippingState: e.target.value }))} placeholder="State / Province / Region" />
                        )}
                      </div>
                      <div>
                        <label className="form-label small text-secondary mb-1">Pincode {isProjectClientFieldRequired("shippingPincode") ? "*" : ""}</label>
                        <input className="form-control" required={isProjectClientFieldRequired("shippingPincode")} value={projectClientForm.shippingPincode || ""} onChange={(e) => setProjectClientForm((p) => ({ ...p, shippingPincode: e.target.value }))} placeholder="Pincode" />
                      </div>
                    </div>
                  </div>
                ) : null}
              </div>
              <div className="d-flex gap-2">
                <button type="submit" className="btn btn-success btn-sm">{editingProjectClientId ? "Update Client" : "Create Client"}</button>
                {editingProjectClientId ? <button type="button" className="btn btn-outline-light btn-sm" onClick={resetProjectClientForm}>Cancel</button> : null}
              </div>
            </form>
          </div>

          <SearchablePaginatedTableCard
            title="Client List"
            badgeLabel={`${sharedCustomers.length} clients`}
            rows={sharedCustomers}
            columns={[
              { key: "companyName", label: "Company Name" },
              { key: "clientName", label: "Client Name" },
              { key: "gstin", label: "GSTIN" },
              { key: "phones", label: "Contact Number" },
              { key: "emails", label: "Email ID" },
              { key: "location", label: "Location" },
            ]}
            searchPlaceholder="Search clients"
            noRowsText="No clients yet."
            searchBy={(row) => [
              row.companyName || row.name,
              row.clientName,
              row.gstin,
              ...(formatSharedCustomerPhones(row)),
              ...(formatSharedCustomerEmails(row)),
              row.billingCountry || row.country,
              row.billingState || row.state,
              row.billingPincode || row.pincode,
              row.shippingCountry,
              row.shippingState,
              row.shippingPincode,
            ].join(" ")}
            renderCells={(row) => [
              <span className="fw-semibold">{row.companyName || row.name || "-"}</span>,
              row.clientName || "-",
              row.gstin || "-",
              <span style={{ whiteSpace: "normal" }}>{formatSharedCustomerPhones(row).join(", ") || "-"}</span>,
              <span style={{ whiteSpace: "normal" }}>{formatSharedCustomerEmails(row).join(", ") || "-"}</span>,
              <span style={{ whiteSpace: "normal" }}>
                {[row.billingState || row.state, row.billingCountry || row.country, row.billingPincode || row.pincode].filter(Boolean).join(", ") || "-"}
              </span>,
            ]}
            renderActions={(row) => (
              <div className="d-inline-flex gap-2">
                <button type="button" className="btn btn-sm btn-outline-info" onClick={() => editProjectClient(row)}>Edit</button>
                <button type="button" className="btn btn-sm btn-outline-danger" onClick={() => deleteProjectClient(row.id)}>Delete</button>
              </div>
            )}
          />
        </>
      ) : (
        <>
      <div className="card p-3">
        <h6 className="mb-3">{editingId ? `Edit ${config.itemLabel}` : `Create ${config.itemLabel}`}</h6>
        <form className="d-flex flex-column gap-3" onSubmit={onSubmit}>
          {projectFormNotice ? (
            <div className="alert alert-danger py-2 mb-0">{projectFormNotice}</div>
          ) : null}
          <div className="row g-3">
            {config.fields.map((field) => (
              (() => {
                const condition = field.conditionalOn;
                const isVisible = !condition
                  || String(formValues[condition.key] || "").trim() === String(condition.value || "").trim();
                if (!isVisible) {
                  return null;
                }
                const isInlineProjectsTab = activeTab === "projects";
                const isTaskTab = activeTab === "tasks";
                const isRequiredField = !field.optional;
                return (
                  <div
                    className={
                      isInlineProjectsTab
                        ? (
                            field.key === "projectName" || field.key === "clientCompany"
                              ? "col-12 col-md-6 col-xl-4"
                              : field.key === "status"
                              ? "col-12 col-md-6 col-xl-3"
                              : "col-12 col-md-4"
                          )
                        : isTaskTab
                        ? "col-12 col-md-6 col-xl-3"
                        : "col-12 col-md-4"
                    }
                    key={field.key}
                  >
                    <label className="form-label small text-secondary mb-1">
                      {field.label}
                      {isRequiredField ? " *" : ""}
                    </label>
                    {field.type === "select" ? (
                      <select
                        className="form-select"
                        value={formValues[field.key] || ""}
                        required={isRequiredField}
                        onChange={(event) => onChangeField(field.key, event.target.value)}
                      >
                        <option value="">Select {field.label}</option>
                        {(field.options || []).map((option) => (
                          <option key={option} value={option}>{option}</option>
                        ))}
                      </select>
                    ) : activeTab === "projects" && field.key === "clientCompany" ? (
                      <div className="crm-inline-suggestions-wrap">
                        <input
                          type="text"
                          className="form-control"
                          placeholder={field.placeholder}
                          value={formValues[field.key] || ""}
                          required={isRequiredField}
                          maxLength={getBusinessAutopilotMaxLength(field.key)}
                          onChange={(event) => onChangeField(field.key, event.target.value)}
                          onFocus={() => setShowProjectClientSuggestions(Boolean(String(formValues[field.key] || "").trim()))}
                          onClick={() => setShowProjectClientSuggestions(Boolean(String(formValues[field.key] || "").trim()))}
                          onBlur={() => {
                            window.setTimeout(() => setShowProjectClientSuggestions(false), 120);
                          }}
                        />
                        {showProjectClientSuggestions && (projectCrmContactMatches.length || projectCustomerMatches.length) ? (
                          <div className="crm-inline-suggestions">
                            {projectCrmContactMatches.length ? (
                              <div className="crm-inline-suggestions__group">
                                <div className="crm-inline-suggestions__title">CRM Contacts</div>
                                {projectCrmContactMatches.map((contact) => (
                                  <button
                                    key={`project-crm-contact-${contact.id || `${contact.name}-${contact.company}`}`}
                                    type="button"
                                    className="crm-inline-suggestions__item"
                                    onMouseDown={(event) => event.preventDefault()}
                                    onClick={() => selectProjectClientCompany(String(contact.company || contact.name || "").trim())}
                                  >
                                    <span className="crm-inline-suggestions__item-main">{contact.name || "-"}</span>
                                    <span className="crm-inline-suggestions__item-sub">{contact.company || "-"}</span>
                                  </button>
                                ))}
                              </div>
                            ) : null}
                            {projectCustomerMatches.length ? (
                              <div className="crm-inline-suggestions__group">
                                <div className="crm-inline-suggestions__title">Clients</div>
                                {projectCustomerMatches.map((customer) => (
                                  <button
                                    key={`project-client-${customer.id}`}
                                    type="button"
                                    className="crm-inline-suggestions__item"
                                    onMouseDown={(event) => event.preventDefault()}
                                    onClick={() => selectProjectClientCompany(String(customer.companyName || customer.name || customer.clientName || "").trim())}
                                  >
                                    <span className="crm-inline-suggestions__item-main">{customer.clientName || customer.companyName || "-"}</span>
                                    <span className="crm-inline-suggestions__item-sub">{customer.companyName || "-"}</span>
                                  </button>
                                ))}
                              </div>
                            ) : null}
                          </div>
                        ) : null}
                      </div>
                    ) : field.type === "datalist" ? (
                      <>
                        <input
                          type="text"
                          list={`project-${field.key}-list`}
                          className="form-control datalist-readable-input"
                          placeholder={field.placeholder}
                          value={formValues[field.key] || ""}
                          required={isRequiredField}
                          maxLength={getBusinessAutopilotMaxLength(field.key)}
                          onChange={(event) => onChangeField(field.key, event.target.value)}
                        />
                        <datalist id={`project-${field.key}-list`}>
                          {field.datalistSource === "accountsCustomers"
                            ? accountsCustomerOptions.map((value) => (
                                <option key={`project-${field.key}-${value}`} value={value} />
                              ))
                            : null}
                        </datalist>
                      </>
                    ) : (
                      <input
                        type={field.type || "text"}
                        className="form-control"
                        placeholder={field.placeholder}
                        value={formValues[field.key] || ""}
                        required={isRequiredField}
                        maxLength={["time", "date", "number", "file"].includes(field.type) ? undefined : getBusinessAutopilotMaxLength(field.key)}
                        onChange={(event) => onChangeField(field.key, event.target.value)}
                      />
                    )}
                  </div>
                );
              })()
            ))}
            {projectInlineSubmitTabs.has(activeTab) ? (
              <div className="col-12 col-md-6 col-xl-1 d-flex align-items-end">
                <div className="w-100 d-flex gap-2 flex-wrap">
                  <button type="submit" className="btn btn-success btn-sm single-row-form-submit-btn">
                    {editingId ? "Update" : "Create"}
                  </button>
                </div>
              </div>
            ) : null}
          </div>
          {!projectInlineSubmitTabs.has(activeTab) ? (
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
          ) : null}
        </form>
      </div>

      <SearchablePaginatedTableCard
        title={config.label}
        badgeLabel={`${currentRows.length} items`}
        rows={currentRows}
        columns={config.columns}
        withoutOuterCard={activeTab === "projects"}
        searchPlaceholder={`Search ${config.label.toLowerCase()}`}
        noRowsText={`No ${config.label.toLowerCase()} yet.`}
        headerBottom={activeTab === "projects" ? (
          <div className="d-flex flex-wrap gap-2">
            {projectStatusTabs.map((tab) => (
              <button
                key={`project-status-tab-${tab.key}`}
                type="button"
                className={`btn btn-sm ${projectStatusTab === tab.key ? "btn-success" : "btn-outline-light"}`}
                onClick={() => setProjectStatusTab(tab.key)}
              >
                {tab.label} ({projectStatusCounts[tab.key] || 0})
              </button>
            ))}
          </div>
        ) : null}
        searchBy={(row) => {
          if (activeTab === "customers") {
            return [
              row.companyName || row.name,
              row.clientName,
              row.phone,
              ...(formatSharedCustomerPhones(row)),
              row.email,
              ...(formatSharedCustomerEmails(row)),
            ].join(" ");
          }
          return config.columns.map((column) => row[column.key] || "").join(" ");
        }}
        renderCells={(row) => {
          if (activeTab === "customers") {
            return [
              <span className="fw-semibold">{row.companyName || row.name || "-"}</span>,
              row.clientName || "-",
              <span style={{ whiteSpace: "normal" }}>{formatSharedCustomerPhones(row).join(", ") || "-"}</span>,
              <span style={{ whiteSpace: "normal" }}>{formatSharedCustomerEmails(row).join(", ") || "-"}</span>,
            ];
          }
          return config.columns.map((column) => formatDateLikeCellValue(column.key, row[column.key], "-"));
        }}
        renderActions={(row) => (
          <div className="d-inline-flex gap-2">
            {activeTab === "projects" ? (
              <button type="button" className="btn btn-sm btn-primary" onClick={() => navigate(`/business-autopilot/projects/${row.id}`)}>
                Details
              </button>
            ) : null}
            <button type="button" className="btn btn-sm btn-outline-info" onClick={() => onEditRow(row)}>
              Edit
            </button>
            <button type="button" className="btn btn-sm btn-outline-danger" onClick={() => onDeleteRow(row.id)}>
              Delete
            </button>
          </div>
        )}
      />
        </>
      )}
    </div>
  );
}

function ProjectDetailPage() {
  const navigate = useNavigate();
  const { projectId = "" } = useParams();
  const [moduleData, setModuleData] = useState(() => readProjectWorkspaceData());
  const [activeSection, setActiveSection] = useState("overview");
  const [expenseForm, setExpenseForm] = useState(() => createEmptyProjectExpense());
  const [editingExpenseId, setEditingExpenseId] = useState("");
  const [crmTeams, setCrmTeams] = useState(() => readSharedCrmTeams());
  const [hrEmployees, setHrEmployees] = useState(() => readSharedHrEmployees());
  const [accountsVendors, setAccountsVendors] = useState(() => readSharedAccountsVendors());
  const [erpUsers, setErpUsers] = useState([]);
  const [customTeamInput, setCustomTeamInput] = useState("");
  const [customEmployeeInput, setCustomEmployeeInput] = useState("");
  const [expensePayeeSearchOpen, setExpensePayeeSearchOpen] = useState(false);

  useEffect(() => {
    setModuleData(readProjectWorkspaceData());
  }, [projectId]);

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(normalizeProjectData(moduleData)));
  }, [moduleData]);

  useEffect(() => {
    function syncSharedDirectories() {
      setCrmTeams(readSharedCrmTeams());
      setHrEmployees(readSharedHrEmployees());
      setAccountsVendors(readSharedAccountsVendors());
    }
    syncSharedDirectories();
    window.addEventListener("storage", syncSharedDirectories);
    window.addEventListener("focus", syncSharedDirectories);
    return () => {
      window.removeEventListener("storage", syncSharedDirectories);
      window.removeEventListener("focus", syncSharedDirectories);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function loadUsers() {
      try {
        const data = await apiFetch("/api/business-autopilot/users");
        if (cancelled) return;
        setErpUsers(Array.isArray(data?.users) ? data.users : []);
      } catch (_error) {
        if (!cancelled) {
          setErpUsers([]);
        }
      }
    }
    loadUsers();
    return () => {
      cancelled = true;
    };
  }, []);

  const project = useMemo(
    () => (moduleData.projects || []).find((row) => String(row.id || "") === String(projectId || "")) || null,
    [moduleData.projects, projectId]
  );

  const projectDetail = useMemo(
    () => normalizeProjectDetailRecord(moduleData.projectDetails?.[projectId] || {}, projectId),
    [moduleData.projectDetails, projectId]
  );

  const expenseRows = projectDetail.expenses || [];
  const totalExpenses = useMemo(
    () => expenseRows.reduce((sum, row) => sum + parseNumber(row.amount), 0),
    [expenseRows]
  );
  const projectValue = parseNumber(projectDetail.projectValue);
  const utilization = projectDetail.projectValueEnabled && projectValue > 0
    ? Math.min(100, Math.round((totalExpenses / projectValue) * 100))
    : 0;

  const teamOptions = useMemo(
    () => Array.from(new Set([
      ...crmTeams.map((row) => String(row.name || "").trim()),
      ...(projectDetail.teams || []),
    ].filter(Boolean))).sort((a, b) => a.localeCompare(b)),
    [crmTeams, projectDetail.teams]
  );

  const employeeOptions = useMemo(
    () => Array.from(new Set([
      ...erpUsers.map((row) => String(row?.name || row?.full_name || row?.username || row?.email || "").trim()),
      ...hrEmployees.map((row) => String(row?.name || row?.employeeName || "").trim()),
      ...(projectDetail.employees || []),
    ].filter(Boolean))).sort((a, b) => a.localeCompare(b)),
    [erpUsers, hrEmployees, projectDetail.employees]
  );
  const vendorOptions = useMemo(
    () => Array.from(new Set([
      ...accountsVendors.map((item) => String(item || "").trim()),
      ...(projectDetail.expenses || []).map((row) => String(row?.payee || "").trim()),
    ].filter(Boolean))).sort((a, b) => a.localeCompare(b)),
    [accountsVendors, projectDetail.expenses]
  );
  const normalizedExpensePayeeSearch = String(expenseForm.payee || "").trim().toLowerCase();
  const filteredExpenseVendorOptions = useMemo(
    () => vendorOptions.filter((option) => {
      if (!normalizedExpensePayeeSearch) {
        return true;
      }
      return option.toLowerCase().includes(normalizedExpensePayeeSearch);
    }),
    [normalizedExpensePayeeSearch, vendorOptions]
  );
  const filteredExpenseEmployeeOptions = useMemo(
    () => employeeOptions.filter((option) => {
      if (!normalizedExpensePayeeSearch) {
        return true;
      }
      return option.toLowerCase().includes(normalizedExpensePayeeSearch);
    }),
    [employeeOptions, normalizedExpensePayeeSearch]
  );

  function updateProjectDetails(updater) {
    setModuleData((prev) => {
      const currentDetail = normalizeProjectDetailRecord(prev.projectDetails?.[projectId] || {}, projectId);
      const nextDetail = normalizeProjectDetailRecord({
        ...updater(currentDetail),
        updatedAt: new Date().toISOString(),
      }, projectId);
      return {
        ...prev,
        projectDetails: {
          ...(prev.projectDetails || {}),
          [projectId]: nextDetail,
        },
      };
    });
  }

  function toggleSelection(key, value) {
    const normalizedValue = String(value || "").trim();
    if (!normalizedValue) {
      return;
    }
    updateProjectDetails((prev) => {
      const currentList = Array.isArray(prev[key]) ? prev[key] : [];
      const nextList = currentList.includes(normalizedValue)
        ? currentList.filter((item) => item !== normalizedValue)
        : [...currentList, normalizedValue];
      return { ...prev, [key]: nextList };
    });
  }

  function addCustomSelection(key, value, clearInput) {
    const normalizedValue = String(value || "").trim();
    if (!normalizedValue) {
      return;
    }
    updateProjectDetails((prev) => ({
      ...prev,
      [key]: Array.from(new Set([...(Array.isArray(prev[key]) ? prev[key] : []), normalizedValue])),
    }));
    clearInput("");
  }

  function saveExpense(event) {
    event.preventDefault();
    if (!String(expenseForm.title || "").trim() || parseNumber(expenseForm.amount) <= 0) {
      return;
    }
    updateProjectDetails((prev) => {
      const normalizedExpense = normalizeProjectExpenseRecord({
        ...expenseForm,
        id: editingExpenseId || expenseForm.id || `pex_${Date.now()}`,
      });
      const currentExpenses = Array.isArray(prev.expenses) ? prev.expenses : [];
      return {
        ...prev,
        expenses: editingExpenseId
          ? currentExpenses.map((row) => (row.id === editingExpenseId ? normalizedExpense : row))
          : [normalizedExpense, ...currentExpenses],
      };
    });
    setEditingExpenseId("");
    setExpenseForm(createEmptyProjectExpense());
  }

  function handleExpenseAttachmentChange(file) {
    if (!file) {
      return;
    }
    const validation = validateBusinessAutopilotImageOrPdf(file, { label: "Expense attachment" });
    if (!validation.ok) {
      showUploadAlert(validation.message);
      return;
    }
    setExpenseForm((prev) => ({
      ...prev,
      attachmentName: file.name || "expense-attachment",
      attachmentType: file.type || "",
      attachmentSizeLabel: formatFileSizeLabel(file.size),
      attachmentSize: file.size,
    }));
  }

  function editExpense(row) {
    setEditingExpenseId(row.id);
    setActiveSection("expenses");
    setExpenseForm(normalizeProjectExpenseRecord(row));
  }

  function deleteExpense(expenseId) {
    updateProjectDetails((prev) => ({
      ...prev,
      expenses: (prev.expenses || []).filter((row) => row.id !== expenseId),
    }));
    if (editingExpenseId === expenseId) {
      setEditingExpenseId("");
      setExpenseForm(createEmptyProjectExpense());
    }
  }

  const summaryCards = [
    {
      label: "Project Value",
      value: projectDetail.projectValueEnabled ? formatInr(projectValue) : "Optional",
      icon: "bi-cash-stack",
    },
    {
      label: "Project Expenses",
      value: formatInr(totalExpenses),
      icon: "bi-receipt-cutoff",
      targetSection: "expenses",
    },
    {
      label: "Project Teams",
      value: String((projectDetail.teams || []).length),
      icon: "bi-diagram-3",
      targetSection: "resources",
    },
    {
      label: "Project Employees",
      value: String((projectDetail.employees || []).length),
      icon: "bi-people",
      targetSection: "resources",
    },
  ];

  if (!project) {
    return (
      <div className="card p-4">
        <div className="d-flex flex-column flex-md-row align-items-md-center justify-content-between gap-3">
          <div>
            <h4 className="mb-1">Project not found</h4>
            <p className="text-secondary mb-0">This project may have been deleted or is not available in the current workspace.</p>
          </div>
          <button type="button" className="btn btn-primary" onClick={() => navigate("..", { relative: "path" })}>
            Back to Projects
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="d-flex flex-column gap-3">
      <div className="card p-3 p-lg-4">
        <div className="d-flex flex-column flex-xl-row align-items-xl-center justify-content-between gap-3">
          <div>
            <div className="d-flex flex-wrap align-items-stretch gap-2 mb-3">
              <button type="button" className="btn btn-sm btn-outline-light" onClick={() => navigate("..", { relative: "path" })}>
                <i className="bi bi-arrow-left me-1" />
                Back to Projects
              </button>
              <div className="border rounded px-3 py-2 d-flex flex-column justify-content-center" style={{ minWidth: "120px" }}>
                <span className="text-secondary small text-uppercase">Status</span>
                <span className="fw-semibold">{project.status || "New"}</span>
              </div>
              <div className="border rounded px-3 py-2 d-flex flex-column justify-content-center" style={{ minWidth: "200px" }}>
                <span className="text-secondary small text-uppercase">Client / Company</span>
                <span className="fw-semibold">{project.clientCompany || "No client selected"}</span>
              </div>
            </div>
            <h4 className="mb-1">{project.name || "Project Details"}</h4>
            <p className="text-secondary mb-0">Manage project value, expenses, teams, and employees from one focused workspace.</p>
          </div>
          <div className="d-flex flex-wrap gap-2">
            {[
              { key: "overview", label: "Overview", icon: "bi-grid" },
              { key: "expenses", label: "Expenses", icon: "bi-wallet2" },
              { key: "resources", label: "Resources", icon: "bi-people-fill" },
            ].map((tab) => (
              <button
                key={tab.key}
                type="button"
                className={`btn btn-sm ${activeSection === tab.key ? "btn-success" : "btn-outline-light"}`}
                onClick={() => setActiveSection(tab.key)}
              >
                <i className={`bi ${tab.icon} me-1`} />
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {activeSection === "overview" ? (
        <>
          <div className="row g-3">
            {summaryCards.map((item) => (
              <div className="col-12 col-sm-6 col-xl-3" key={item.label}>
                <button
                  type="button"
                  className="card p-3 h-100 w-100 d-flex flex-column align-items-center justify-content-center text-center border-0"
                  onClick={() => {
                    if (item.targetSection) {
                      setActiveSection(item.targetSection);
                    }
                  }}
                  style={{ cursor: item.targetSection ? "pointer" : "default" }}
                >
                  <div className="stat-icon stat-icon-primary mb-2">
                    <i className={`bi ${item.icon}`} aria-hidden="true" />
                  </div>
                  <div className="text-secondary small">{item.label}</div>
                  <h5 className="mb-0 mt-1">{item.value}</h5>
                </button>
              </div>
            ))}
          </div>
          <div className="row g-3">
            <div className="col-12 col-xl-7">
            <div className="card p-3 h-100">
              <div className="d-flex align-items-center justify-content-between flex-wrap gap-2 mb-3">
                <h6 className="mb-0">Project Setup</h6>
                <span className="text-secondary small">Optional project value with live expense tracking</span>
              </div>
              <div className="row g-3">
                <div className="col-12">
                  <div className="form-check form-switch">
                    <input
                      id="project-value-toggle"
                      className="form-check-input"
                      type="checkbox"
                      checked={Boolean(projectDetail.projectValueEnabled)}
                      onChange={(event) => updateProjectDetails((prev) => ({
                        ...prev,
                        projectValueEnabled: event.target.checked,
                        projectValue: event.target.checked ? prev.projectValue : "",
                      }))}
                    />
                    <label className="form-check-label" htmlFor="project-value-toggle">Track project value</label>
                  </div>
                </div>
                {projectDetail.projectValueEnabled ? (
                  <div className="col-12 col-md-6">
                    <label className="form-label small text-secondary mb-1">Project Value</label>
                    <input
                      type="number"
                      min="0"
                      max={AMOUNT_MAX_NUMERIC_VALUE}
                      step="0.01"
                      className="form-control"
                      value={projectDetail.projectValue || ""}
                      placeholder="Enter project value"
                      onChange={(event) => updateProjectDetails((prev) => ({ ...prev, projectValue: sanitizeCurrencyInput(event.target.value) }))}
                    />
                  </div>
                ) : null}
                <div className="col-12">
                  <label className="form-label small text-secondary mb-1">Project Notes</label>
                  <textarea
                    className="form-control"
                    rows="4"
                    placeholder="Add project scope, approvals, or delivery notes"
                    value={projectDetail.notes || ""}
                    onChange={(event) => updateProjectDetails((prev) => ({ ...prev, notes: event.target.value }))}
                  />
                </div>
              </div>
            </div>
          </div>
            <div className="col-12 col-xl-5">
              <div className="card p-3 h-100">
                <h6 className="mb-3">Financial Snapshot</h6>
                <div className="d-flex flex-column gap-3">
                  <div className="border rounded p-3">
                    <div className="text-secondary small mb-1">Budget Utilization</div>
                    <div className="d-flex align-items-center justify-content-between gap-2 mb-2">
                      <span className="fw-semibold">
                        {projectDetail.projectValueEnabled ? `${utilization}% used` : "Enable project value to track utilization"}
                      </span>
                      {projectDetail.projectValueEnabled ? <span className="small text-secondary">{formatInr(totalExpenses)} / {formatInr(projectValue)}</span> : null}
                    </div>
                    <div className="progress" style={{ height: "10px" }}>
                      <div
                        className="progress-bar"
                        role="progressbar"
                        style={{ width: `${projectDetail.projectValueEnabled ? utilization : 0}%` }}
                        aria-valuenow={projectDetail.projectValueEnabled ? utilization : 0}
                        aria-valuemin="0"
                        aria-valuemax="100"
                      />
                    </div>
                  </div>
                  <div className="border rounded p-3">
                    <div className="text-secondary small mb-2">Assigned Teams</div>
                    <div className="d-flex flex-wrap gap-2">
                      {(projectDetail.teams || []).length ? (projectDetail.teams || []).map((team) => (
                        <span key={team} className="badge bg-primary-subtle text-primary-emphasis">{team}</span>
                      )) : <span className="text-secondary small">No teams assigned yet.</span>}
                    </div>
                  </div>
                  <div className="border rounded p-3">
                    <div className="text-secondary small mb-2">Assigned Employees</div>
                    <div className="d-flex flex-wrap gap-2">
                      {(projectDetail.employees || []).length ? (projectDetail.employees || []).map((employee) => (
                        <span key={employee} className="badge bg-info-subtle text-info-emphasis">{employee}</span>
                      )) : <span className="text-secondary small">No employees assigned yet.</span>}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </>
      ) : null}

      {activeSection === "expenses" ? (
        <>
          <div className="card p-3">
            <div className="d-flex align-items-center justify-content-between flex-wrap gap-2 mb-3">
              <h6 className="mb-0">{editingExpenseId ? "Edit Expense" : "Add Expense"}</h6>
              <span className="text-secondary small">Every expense updates the top summary instantly.</span>
            </div>
            <form className="row g-3" onSubmit={saveExpense}>
              <div className="col-12 col-md-4">
                <label className="form-label small text-secondary mb-1">Expense Title</label>
                <input className="form-control" maxLength={getBusinessAutopilotMaxLength("title")} value={expenseForm.title || ""} onChange={(event) => setExpenseForm((prev) => ({ ...prev, title: clampBusinessAutopilotText("title", event.target.value) }))} placeholder="Travel, hosting, consultation..." />
              </div>
              <div className="col-12 col-md-3">
                <label className="form-label small text-secondary mb-1">Category</label>
                <select className="form-select" value={expenseForm.category || "Operations"} onChange={(event) => setExpenseForm((prev) => ({ ...prev, category: event.target.value }))}>
                  {["Operations", "Travel", "Infrastructure", "Consulting", "Salary", "Software", "Other"].map((option) => (
                    <option key={option} value={option}>{option}</option>
                  ))}
                </select>
              </div>
              <div className="col-12 col-md-2">
                <label className="form-label small text-secondary mb-1">Amount</label>
                <input type="number" min="0" max={AMOUNT_MAX_NUMERIC_VALUE} step="0.01" className="form-control" value={expenseForm.amount || ""} onChange={(event) => setExpenseForm((prev) => ({ ...prev, amount: sanitizeCurrencyInput(event.target.value) }))} placeholder="0" />
              </div>
              <div className="col-12 col-md-3">
                <label className="form-label small text-secondary mb-1">Date</label>
                <input type="date" className="form-control" value={expenseForm.date || ""} onChange={(event) => setExpenseForm((prev) => ({ ...prev, date: event.target.value }))} />
              </div>
              <div className="col-12 col-md-4">
                <label className="form-label small text-secondary mb-1">Payee / Vendor</label>
                <div className="crm-inline-suggestions-wrap">
                  <input
                    className="form-control"
                    value={expenseForm.payee || ""}
                    maxLength={getBusinessAutopilotMaxLength("payee")}
                    onFocus={() => setExpensePayeeSearchOpen(true)}
                    onBlur={() => window.setTimeout(() => setExpensePayeeSearchOpen(false), 120)}
                    onChange={(event) => {
                      const value = clampBusinessAutopilotText("payee", event.target.value);
                      setExpenseForm((prev) => ({ ...prev, payee: value }));
                      setExpensePayeeSearchOpen(true);
                    }}
                    placeholder="Vendor or employee name"
                  />
                  {expensePayeeSearchOpen ? (
                    <div className="crm-inline-suggestions" style={{ maxHeight: "280px", overflowY: "auto" }}>
                      {filteredExpenseVendorOptions.length ? (
                        <div className="crm-inline-suggestions__group">
                          <div className="crm-inline-suggestions__title">Vendors</div>
                          {filteredExpenseVendorOptions.map((vendor) => (
                            <button
                              key={`project-expense-payee-vendor-${vendor}`}
                              type="button"
                              className="crm-inline-suggestions__item"
                              onMouseDown={(event) => event.preventDefault()}
                              onClick={() => {
                                setExpenseForm((prev) => ({ ...prev, payee: vendor }));
                                setExpensePayeeSearchOpen(false);
                              }}
                            >
                              <span className="crm-inline-suggestions__item-main">{vendor}</span>
                            </button>
                          ))}
                        </div>
                      ) : null}
                      {filteredExpenseEmployeeOptions.length ? (
                        <div className="crm-inline-suggestions__group">
                          <div className="crm-inline-suggestions__title">Employees</div>
                          {filteredExpenseEmployeeOptions.map((employee) => (
                            <button
                              key={`project-expense-payee-employee-${employee}`}
                              type="button"
                              className="crm-inline-suggestions__item"
                              onMouseDown={(event) => event.preventDefault()}
                              onClick={() => {
                                setExpenseForm((prev) => ({ ...prev, payee: employee }));
                                setExpensePayeeSearchOpen(false);
                              }}
                            >
                              <span className="crm-inline-suggestions__item-main">{employee}</span>
                            </button>
                          ))}
                        </div>
                      ) : null}
                      {(!filteredExpenseVendorOptions.length && !filteredExpenseEmployeeOptions.length) ? (
                        <div className="crm-inline-suggestions__group">
                          <div className="crm-inline-suggestions__item">
                            <span className="crm-inline-suggestions__item-main">No vendor or employee found</span>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              </div>
              <div className="col-12 col-md-4">
                <label className="form-label small text-secondary mb-1">Notes</label>
                <input className="form-control" maxLength={getBusinessAutopilotMaxLength("notes")} value={expenseForm.notes || ""} onChange={(event) => setExpenseForm((prev) => ({ ...prev, notes: clampBusinessAutopilotText("notes", event.target.value) }))} placeholder="Optional expense note" />
              </div>
              <div className="col-12 col-md-4">
                <label className="form-label small text-secondary mb-1">File Upload</label>
                <input
                  type="file"
                  className="form-control"
                  accept=".jpg,.jpeg,.png,.pdf,image/jpeg,image/png,application/pdf"
                  onChange={(event) => {
                    handleExpenseAttachmentChange(event.target.files?.[0]);
                    event.target.value = "";
                  }}
                />
                {expenseForm.attachmentName ? (
                  <div className="small text-secondary mt-2">
                    <i className="bi bi-paperclip me-1" aria-hidden="true" />
                    {expenseForm.attachmentName}
                    {expenseForm.attachmentSizeLabel ? ` (${expenseForm.attachmentSizeLabel})` : ""}
                  </div>
                ) : null}
              </div>
              <div className="col-12 d-flex gap-2">
                <button type="submit" className="btn btn-success btn-sm">{editingExpenseId ? "Update Expense" : "Add Expense"}</button>
                {editingExpenseId ? (
                  <button type="button" className="btn btn-outline-light btn-sm" onClick={() => {
                    setEditingExpenseId("");
                    setExpenseForm(createEmptyProjectExpense());
                  }}>
                    Cancel
                  </button>
                ) : null}
              </div>
            </form>
          </div>

          <SearchablePaginatedTableCard
            title="Project Expenses"
            badgeLabel={`${expenseRows.length} items`}
            rows={expenseRows}
            columns={[
              { key: "date", label: "Date" },
              { key: "title", label: "Expense" },
              { key: "category", label: "Category" },
              { key: "payee", label: "Payee / Vendor" },
              { key: "amount", label: "Amount" },
            ]}
            searchPlaceholder="Search expenses"
            noRowsText="No expenses added yet."
            searchBy={(row) => [row.date, row.title, row.category, row.payee, row.notes, row.amount].join(" ")}
            renderCells={(row) => [
              formatDateLikeCellValue("date", row.date, "-"),
              <span className="fw-semibold">{row.title || "-"}</span>,
              row.category || "-",
              row.payee || "-",
              formatInr(row.amount),
            ]}
            renderActions={(row) => (
              <div className="d-inline-flex gap-2">
                <button type="button" className="btn btn-sm btn-outline-info" onClick={() => editExpense(row)}>Edit</button>
                <button type="button" className="btn btn-sm btn-outline-danger" onClick={() => deleteExpense(row.id)}>Delete</button>
              </div>
            )}
          />
        </>
      ) : null}

      {activeSection === "resources" ? (
        <div className="row g-3">
          <div className="col-12 col-xl-6">
            <div className="card p-3 h-100">
              <div className="d-flex align-items-center justify-content-between flex-wrap gap-2 mb-3">
                <h6 className="mb-0">Project Teams</h6>
                <span className="text-secondary small">Select multiple teams or add your own.</span>
              </div>
              <div className="d-flex gap-2 mb-3">
                <input className="form-control" value={customTeamInput} onChange={(event) => setCustomTeamInput(event.target.value)} placeholder="Add custom team" />
                <button type="button" className="btn btn-outline-light btn-sm" onClick={() => addCustomSelection("teams", customTeamInput, setCustomTeamInput)}>Add</button>
              </div>
              <div className="d-flex flex-wrap gap-2">
                {teamOptions.length ? teamOptions.map((team) => (
                  <button
                    key={team}
                    type="button"
                    className={`btn btn-sm ${(projectDetail.teams || []).includes(team) ? "btn-success" : "btn-outline-light"}`}
                    onClick={() => toggleSelection("teams", team)}
                  >
                    {team}
                  </button>
                )) : <span className="text-secondary small">No team suggestions yet. Add a custom team above.</span>}
              </div>
            </div>
          </div>
          <div className="col-12 col-xl-6">
            <div className="card p-3 h-100">
              <div className="d-flex align-items-center justify-content-between flex-wrap gap-2 mb-3">
                <h6 className="mb-0">Project Employees</h6>
                <span className="text-secondary small">Assign multiple employees to this project.</span>
              </div>
              <div className="d-flex gap-2 mb-3">
                <input className="form-control" value={customEmployeeInput} onChange={(event) => setCustomEmployeeInput(event.target.value)} placeholder="Add custom employee" />
                <button type="button" className="btn btn-outline-light btn-sm" onClick={() => addCustomSelection("employees", customEmployeeInput, setCustomEmployeeInput)}>Add</button>
              </div>
              <div className="d-flex flex-wrap gap-2">
                {employeeOptions.length ? employeeOptions.map((employee) => (
                  <button
                    key={employee}
                    type="button"
                    className={`btn btn-sm ${(projectDetail.employees || []).includes(employee) ? "btn-primary" : "btn-outline-light"}`}
                    onClick={() => toggleSelection("employees", employee)}
                  >
                    {employee}
                  </button>
                )) : <span className="text-secondary small">No employee suggestions yet. Add a custom employee above.</span>}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function HrManagementModule({ embeddedEmployeeOnly = false }) {
  const [activeTab, setActiveTab] = useState("employees");
  const [moduleData, setModuleData] = useState(DEFAULT_HR_DATA);
  const [hrFormNotice, setHrFormNotice] = useState("");
  const [hrFieldErrors, setHrFieldErrors] = useState({});
  const [formValues, setFormValues] = useState({
    ...buildEmptyValues(HR_TAB_CONFIG.employees.fields),
    temporarySameAsPermanent: false,
  });
  const [hrUserDirectory, setHrUserDirectory] = useState([]);
  const [hrDepartmentOptions, setHrDepartmentOptions] = useState([]);
  const [hrEmployeeRoleOptions, setHrEmployeeRoleOptions] = useState([]);
  const [editingId, setEditingId] = useState("");
  const [hrEmployeeSuggestOpen, setHrEmployeeSuggestOpen] = useState(false);
  const [myAttendanceEmployee, setMyAttendanceEmployee] = useState("");
  const [attendanceEmployeeSuggestOpen, setAttendanceEmployeeSuggestOpen] = useState(false);
  const [attendanceTaskModal, setAttendanceTaskModal] = useState({
    open: false,
    employee: "",
    date: "",
    source: "User Side",
    outTime: "",
    completedTasks: "",
    taskNotes: "",
    mode: "edit",
  });
  const [attendanceNotesModal, setAttendanceNotesModal] = useState({
    open: false,
    rowId: "",
    employee: "",
    date: "",
    notes: "",
  });
  const [employeeViewModal, setEmployeeViewModal] = useState({ open: false, row: null });
  const [attendanceYearFilter, setAttendanceYearFilter] = useState("");
  const [attendanceMonthFilter, setAttendanceMonthFilter] = useState("");
  const showOnlyEmployeeForm = Boolean(embeddedEmployeeOnly);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(HR_STORAGE_KEY);
      if (!raw) {
        return;
      }
      const parsed = JSON.parse(raw);
      setModuleData(normalizeHrData(parsed));
    } catch (_error) {
      // Ignore invalid cached module data.
    }
  }, []);

  useEffect(() => {
    if (showOnlyEmployeeForm) {
      setActiveTab("employees");
      return undefined;
    }
    const applyHashTab = () => {
      const rawHash = String(window.location.hash || "").replace(/^#/, "").trim().toLowerCase();
      const tabByHash = {
        employees: "employees",
        attendance: "attendance",
        leaves: "leaves",
        payroll: "payroll",
        salarystructures: "salaryStructures",
        payslips: "payslips",
        payrollsettings: "payrollSettings",
      };
      if (tabByHash[rawHash]) {
        setActiveTab(tabByHash[rawHash]);
      }
    };
    applyHashTab();
    window.addEventListener("hashchange", applyHashTab);
    return () => {
      window.removeEventListener("hashchange", applyHashTab);
    };
  }, [showOnlyEmployeeForm]);

  useEffect(() => {
    window.localStorage.setItem(HR_STORAGE_KEY, JSON.stringify(moduleData));
  }, [moduleData]);

  useEffect(() => {
    let cancelled = false;
    async function loadHrUserDirectory() {
      try {
        const data = await apiFetch("/api/business-autopilot/users");
        if (cancelled) return;
        setHrUserDirectory(Array.isArray(data?.users) ? data.users : []);
        setHrDepartmentOptions(
          Array.isArray(data?.departments)
            ? data.departments
              .map((item) => ({
                id: String(item?.id || "").trim(),
                name: String(item?.name || "").trim(),
              }))
              .filter((item) => item.id && item.name)
            : []
        );
        setHrEmployeeRoleOptions(
          Array.isArray(data?.employee_roles)
            ? data.employee_roles
              .map((item) => ({
                id: String(item?.id || "").trim(),
                name: String(item?.name || "").trim(),
              }))
              .filter((item) => item.id && item.name)
            : []
        );
      } catch (_error) {
        if (!cancelled) {
          setHrUserDirectory([]);
          setHrDepartmentOptions([]);
          setHrEmployeeRoleOptions([]);
        }
      }
    }
    loadHrUserDirectory();
    window.addEventListener("focus", loadHrUserDirectory);
    return () => {
      cancelled = true;
      window.removeEventListener("focus", loadHrUserDirectory);
    };
  }, []);

  useEffect(() => {
    setEditingId("");
    setHrFormNotice("");
    setHrFieldErrors({});
    const next = buildEmptyValues(HR_TAB_CONFIG[activeTab].fields);
    if (activeTab === "employees") {
      next.temporarySameAsPermanent = false;
    }
    if (activeTab === "attendance") {
      next.date = getTodayIsoDate();
    }
    setFormValues(next);
  }, [activeTab]);

  useEffect(() => {
    if (activeTab !== "employees") {
      setEmployeeViewModal({ open: false, row: null });
    }
  }, [activeTab]);

  const config = HR_TAB_CONFIG[activeTab];
  const isPayrollManagementTab = PAYROLL_MANAGEMENT_TABS.has(activeTab);
  const hrTableColumns = useMemo(() => {
    if (activeTab !== "attendance") {
      return config.columns;
    }
    return (config.columns || []).map((column) => {
      if (column.key === "date") {
        return {
          ...column,
          thStyle: { width: "140px", minWidth: "140px", whiteSpace: "nowrap" },
          tdStyle: { width: "140px", minWidth: "140px", whiteSpace: "nowrap" },
        };
      }
      if (column.key === "inTime" || column.key === "outTime") {
        return {
          ...column,
          thStyle: { width: "120px", minWidth: "120px", whiteSpace: "nowrap" },
          tdStyle: { width: "120px", minWidth: "120px", whiteSpace: "nowrap" },
        };
      }
      return column;
    });
  }, [activeTab, config.columns]);
  const currentRows = moduleData[activeTab] || [];
  const todayIso = getTodayIsoDate();
  function normalizeIsoDateValue(rawValue) {
    const value = String(rawValue || "").trim();
    if (!value) {
      return "";
    }
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      return value;
    }
    const slashMatch = value.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/);
    if (slashMatch) {
      const day = Number(slashMatch[1]);
      const month = Number(slashMatch[2]);
      const year = Number(slashMatch[3]);
      if (day >= 1 && day <= 31 && month >= 1 && month <= 12 && year >= 1900 && year <= 9999) {
        return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      }
    }
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      const yyyy = parsed.getFullYear();
      const mm = String(parsed.getMonth() + 1).padStart(2, "0");
      const dd = String(parsed.getDate()).padStart(2, "0");
      return `${yyyy}-${mm}-${dd}`;
    }
    return value;
  }
  function isAgeAtLeastYears(dobIso, minYears = 18) {
    const value = String(dobIso || "").trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      return true;
    }
    const dob = new Date(`${value}T00:00:00`);
    if (Number.isNaN(dob.getTime())) {
      return true;
    }
    const today = new Date(`${todayIso}T00:00:00`);
    let age = today.getFullYear() - dob.getFullYear();
    const monthDiff = today.getMonth() - dob.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dob.getDate())) {
      age -= 1;
    }
    return age >= minYears;
  }
  const employeeNameOptions = useMemo(
    () => Array.from(new Set((moduleData.employees || []).map((item) => String(item.name || "").trim()).filter(Boolean))),
    [moduleData.employees]
  );
  const hrUserLookupByName = useMemo(() => {
    const map = new Map();
    (hrUserDirectory || []).forEach((item) => {
      const key = String(item?.name || "").trim().toLowerCase();
      if (!key) return;
      map.set(key, item);
    });
    return map;
  }, [hrUserDirectory]);
  const hrEmployeeLookupByName = useMemo(() => {
    const map = new Map();
    (moduleData.employees || []).forEach((item) => {
      const key = String(item?.name || "").trim().toLowerCase();
      if (!key) return;
      map.set(key, item);
    });
    return map;
  }, [moduleData.employees]);
  const hrEmployeeLookupByUserId = useMemo(() => {
    const map = new Map();
    (moduleData.employees || []).forEach((item) => {
      const key = String(item?.sourceUserId || item?.userId || "").trim();
      if (!key) return;
      map.set(key, item);
    });
    return map;
  }, [moduleData.employees]);
  const attendanceEmployeeSuggestions = useMemo(() => {
    if (activeTab !== "attendance") {
      return [];
    }
    const term = String(formValues.employee || "").trim().toLowerCase();
    const filtered = term
      ? employeeNameOptions.filter((name) => name.toLowerCase().includes(term))
      : employeeNameOptions;
    return filtered.slice(0, 8);
  }, [activeTab, employeeNameOptions, formValues.employee]);
  const hrEmployeeSuggestions = useMemo(() => {
    if (activeTab !== "employees") {
      return [];
    }
    const term = String(formValues.name || "").trim().toLowerCase();
    const rows = (hrUserDirectory || []).filter((item) => {
      const name = String(item?.name || "").trim();
      if (!name) return false;
      return term ? name.toLowerCase().includes(term) : true;
    });
    return rows.slice(0, 8);
  }, [activeTab, formValues.name, hrUserDirectory]);
  const hrDepartmentNameOptions = useMemo(
    () => hrDepartmentOptions.map((item) => item.name).filter(Boolean),
    [hrDepartmentOptions]
  );
  const hrEmployeeRoleNameOptions = useMemo(
    () => hrEmployeeRoleOptions.map((item) => item.name).filter(Boolean),
    [hrEmployeeRoleOptions]
  );

  const attendanceDateMeta = useMemo(() => {
    const rows = Array.isArray(moduleData.attendance) ? moduleData.attendance : [];
    const validDates = rows
      .map((row) => String(row?.date || "").trim())
      .filter((value) => /^\d{4}-\d{2}-\d{2}$/.test(value))
      .sort();
    if (!validDates.length) {
      const now = new Date();
      return {
        minYear: now.getFullYear(),
        maxYear: now.getFullYear(),
        minMonthByYear: new Map([[String(now.getFullYear()), now.getMonth() + 1]]),
        maxMonthByYear: new Map([[String(now.getFullYear()), now.getMonth() + 1]]),
      };
    }
    const min = validDates[0];
    const max = validDates[validDates.length - 1];
    const minYear = Number(min.slice(0, 4));
    const maxYear = Number(max.slice(0, 4));
    const minMonthByYear = new Map();
    const maxMonthByYear = new Map();
    validDates.forEach((iso) => {
      const yearKey = iso.slice(0, 4);
      const monthNum = Number(iso.slice(5, 7));
      if (!minMonthByYear.has(yearKey) || monthNum < minMonthByYear.get(yearKey)) {
        minMonthByYear.set(yearKey, monthNum);
      }
      if (!maxMonthByYear.has(yearKey) || monthNum > maxMonthByYear.get(yearKey)) {
        maxMonthByYear.set(yearKey, monthNum);
      }
    });
    return { minYear, maxYear, minMonthByYear, maxMonthByYear };
  }, [moduleData.attendance]);

  const attendanceYearOptions = useMemo(() => {
    const years = [];
    for (let y = attendanceDateMeta.minYear; y <= attendanceDateMeta.maxYear; y += 1) {
      years.push(String(y));
    }
    return years;
  }, [attendanceDateMeta]);

  const attendanceMonthOptions = useMemo(() => {
    const selectedYear = String(attendanceYearFilter || "");
    if (!selectedYear) return [];
    const minMonth = attendanceDateMeta.minMonthByYear.get(selectedYear) || 1;
    const maxMonth = attendanceDateMeta.maxMonthByYear.get(selectedYear) || 12;
    const labels = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const months = [];
    for (let month = minMonth; month <= maxMonth; month += 1) {
      months.push({ value: String(month).padStart(2, "0"), label: labels[month - 1] || String(month) });
    }
    return months;
  }, [attendanceDateMeta, attendanceYearFilter]);

  useEffect(() => {
    if (myAttendanceEmployee && employeeNameOptions.includes(myAttendanceEmployee)) {
      return;
    }
    setMyAttendanceEmployee(employeeNameOptions[0] || "");
  }, [employeeNameOptions, myAttendanceEmployee]);

  useEffect(() => {
    const yearOptions = attendanceYearOptions;
    if (!yearOptions.length) return;
    setAttendanceYearFilter((prev) => (prev && yearOptions.includes(prev) ? prev : yearOptions[0]));
  }, [attendanceYearOptions]);

  useEffect(() => {
    const monthOptions = attendanceMonthOptions;
    if (!monthOptions.length) return;
    setAttendanceMonthFilter((prev) => (prev && monthOptions.some((m) => m.value === prev) ? prev : monthOptions[0].value));
  }, [attendanceMonthOptions]);

  const stats = useMemo(() => {
    const employees = (moduleData.employees || []).length;
    const attendanceToday = (moduleData.attendance || []).filter((item) =>
      String(item.status || "").toLowerCase().includes("present")
    ).length;
    const pendingLeaves = (moduleData.leaves || []).filter((item) =>
      String(item.status || "").toLowerCase() === "pending"
    ).length;
    return [
      { label: "Employees", value: String(employees), icon: "bi-people" },
      { label: "Attendance Today", value: String(attendanceToday), icon: "bi-calendar-check" },
      { label: "Pending Leaves", value: String(pendingLeaves), icon: "bi-hourglass-split" }
    ];
  }, [moduleData]);
  const employeeFieldMap = useMemo(
    () => new Map(HR_TAB_CONFIG.employees.fields.map((field) => [field.key, field])),
    []
  );

  function syncTemporaryAddressFromPermanent(target = {}) {
    return {
      ...target,
      temporaryAddress: target.permanentAddress || "",
      temporaryCountry: target.permanentCountry || "",
      temporaryState: target.permanentState || "",
      temporaryCity: target.permanentCity || "",
      temporaryPincode: target.permanentPincode || "",
    };
  }

  function buildEmployeeFormValuesFromName(selectedName, previousValues = {}) {
    const trimmedName = String(selectedName || "").trim();
    const normalizedName = trimmedName.toLowerCase();
    const matchedUser = hrUserLookupByName.get(normalizedName) || null;
    const matchedEmployee = (
      matchedUser?.id
        ? hrEmployeeLookupByUserId.get(String(matchedUser.id))
        : null
    ) || hrEmployeeLookupByName.get(normalizedName) || null;
    const nextValues = {
      ...buildEmptyValues(HR_TAB_CONFIG.employees.fields),
      temporarySameAsPermanent: false,
      ...previousValues,
      name: trimmedName,
    };

    if (matchedUser) {
      const phoneParts = splitCombinedPhoneValue(matchedUser.phone_number || "");
      nextValues.name = String(matchedUser.name || trimmedName).trim();
      nextValues.department = String(matchedUser.department || nextValues.department || "").trim();
      nextValues.designation = String(matchedUser.employee_role || nextValues.designation || "").trim();
      nextValues.contactCountryCode = phoneParts.countryCode || nextValues.contactCountryCode || "+91";
      nextValues.contactNumber = phoneParts.number || nextValues.contactNumber || "";
      nextValues.sourceUserId = String(matchedUser.id || "");
      nextValues.sourceUserEmail = String(matchedUser.email || "");
    } else {
      nextValues.sourceUserId = "";
      nextValues.sourceUserEmail = "";
    }

    if (matchedEmployee) {
      HR_TAB_CONFIG.employees.fields.forEach((field) => {
        nextValues[field.key] = String(matchedEmployee[field.key] || nextValues[field.key] || "").trim();
      });
      nextValues.temporarySameAsPermanent = Boolean(matchedEmployee.temporarySameAsPermanent)
        || (
          String(matchedEmployee.temporaryAddress || "").trim() === String(matchedEmployee.permanentAddress || "").trim()
          && String(matchedEmployee.temporaryCountry || "").trim() === String(matchedEmployee.permanentCountry || "").trim()
          && String(matchedEmployee.temporaryState || "").trim() === String(matchedEmployee.permanentState || "").trim()
          && String(matchedEmployee.temporaryCity || "").trim() === String(matchedEmployee.permanentCity || "").trim()
          && String(matchedEmployee.temporaryPincode || "").trim() === String(matchedEmployee.permanentPincode || "").trim()
          && Boolean(String(matchedEmployee.permanentAddress || "").trim())
        );
      nextValues.sourceUserId = String(
        matchedUser?.id
        || matchedEmployee.sourceUserId
        || matchedEmployee.userId
        || nextValues.sourceUserId
        || ""
      );
      nextValues.sourceUserEmail = String(
        matchedUser?.email
        || matchedEmployee.sourceUserEmail
        || nextValues.sourceUserEmail
        || ""
      );
    }

    return {
      nextValues,
      matchedEmployeeId: matchedEmployee ? String(matchedEmployee.id || "") : "",
    };
  }

  function handleHrEmployeePhotoChange(file) {
    if (!file) {
      return;
    }
    const validation = validateBusinessAutopilotImage(file, { label: "Employee photo" });
    if (!validation.ok) {
      showUploadAlert(validation.message);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = typeof reader.result === "string" ? reader.result : "";
      setFormValues((prev) => ({
        ...prev,
        photoDataUrl: dataUrl,
        photoName: file.name || "employee-photo",
      }));
    };
    reader.readAsDataURL(file);
  }

  function handleHrEmployeeDocumentChange(file) {
    if (!file) {
      return;
    }
    const validation = validateBusinessAutopilotPdf(file, { label: "Employee document" });
    if (!validation.ok) {
      showUploadAlert(validation.message);
      return;
    }
    setFormValues((prev) => ({
      ...prev,
      documentName: file.name || "employee-document",
      documentMimeType: file.type || "",
      documentSizeLabel: formatFileSizeLabel(file.size),
    }));
  }

  function renderHrField(field, className = "col-12 col-md-4") {
    if (!field) {
      return null;
    }
    if (
      activeTab === "employees"
      && (
        field.type === "phoneNumber"
        || ["photoName", "documentMimeType", "documentSizeLabel"].includes(field.key)
      )
    ) {
      return null;
    }
    const condition = field.conditionalOn;
    const isVisible = !condition
      || String(formValues[condition.key] || "").trim() === String(condition.value || "").trim();
    if (!isVisible) {
      return null;
    }
    const isRequiredField = !field.optional;
    const linkedPhoneNumberKey = activeTab === "employees" && field.type === "phoneCode"
      ? (field.key === "secondaryContactCountryCode" ? "secondaryContactNumber" : "contactNumber")
      : "";
    const hasFieldError = Boolean(
      hrFieldErrors[field.key]
      || (linkedPhoneNumberKey && hrFieldErrors[linkedPhoneNumberKey])
    );
    const showUnderAgeWarning = activeTab === "employees"
      && field.key === "dateOfBirth"
      && String(formValues.dateOfBirth || "").trim()
      && !isAgeAtLeastYears(formValues.dateOfBirth, 18);
    return (
      <div className={className} key={field.key}>
        <label className={`form-label small mb-1 ${hasFieldError ? "text-danger" : "text-secondary"}`}>
          {field.label}
          {isRequiredField ? " *" : ""}
        </label>
        {activeTab === "attendance" && field.key === "employee" ? (
          <div className="position-relative">
            <input
              type="text"
              className={`form-control ${hasFieldError ? "is-invalid" : ""}`}
              autoComplete="off"
              placeholder={field.placeholder}
              value={formValues[field.key] || ""}
              required={isRequiredField}
              maxLength={getBusinessAutopilotMaxLength(field.key)}
              onFocus={() => setAttendanceEmployeeSuggestOpen(true)}
                          onClick={() => setAttendanceEmployeeSuggestOpen(true)}
              onBlur={() => window.setTimeout(() => setAttendanceEmployeeSuggestOpen(false), 120)}
              onChange={(event) => {
                onChangeField(field.key, event.target.value);
                setAttendanceEmployeeSuggestOpen(true);
              }}
            />
            {attendanceEmployeeSuggestOpen && attendanceEmployeeSuggestions.length ? (
              <div
                className="position-absolute start-0 end-0 mt-1 border rounded shadow-sm"
                style={{
                  zIndex: 30,
                  background: "#081528",
                  borderColor: "rgba(255,255,255,0.16)",
                  maxHeight: "220px",
                  overflowY: "auto",
                }}
              >
                {attendanceEmployeeSuggestions.map((name) => (
                  <button
                    key={`attendance-emp-suggest-${name}`}
                    type="button"
                    className="w-100 text-start border-0 bg-transparent px-3 py-2"
                    style={{ color: "#e9eef8" }}
                    onMouseDown={(event) => {
                      event.preventDefault();
                      onChangeField(field.key, name);
                      setAttendanceEmployeeSuggestOpen(false);
                    }}
                  >
                    {name}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        ) : activeTab === "employees" && field.key === "name" ? (
          <div className="crm-inline-suggestions-wrap">
            <input
              type="text"
              className={`form-control ${hasFieldError ? "is-invalid" : ""}`}
              autoComplete="off"
              placeholder={field.placeholder}
              value={formValues[field.key] || ""}
              required={isRequiredField}
              maxLength={getBusinessAutopilotMaxLength(field.key)}
              onFocus={() => setHrEmployeeSuggestOpen(true)}
                          onClick={() => setHrEmployeeSuggestOpen(true)}
              onBlur={() => window.setTimeout(() => setHrEmployeeSuggestOpen(false), 120)}
              onChange={(event) => {
                onChangeField(field.key, event.target.value);
                setHrEmployeeSuggestOpen(true);
              }}
            />
            {hrEmployeeSuggestOpen && hrEmployeeSuggestions.length ? (
              <div className="crm-inline-suggestions">
                <div className="crm-inline-suggestions__group">
                  <div className="crm-inline-suggestions__title">Office Users</div>
                  {hrEmployeeSuggestions.map((user) => (
                    <button
                      key={`hr-user-suggest-${user.id || user.name}`}
                      type="button"
                      className="crm-inline-suggestions__item"
                      onMouseDown={(event) => {
                        event.preventDefault();
                        onChangeField(field.key, String(user.name || "").trim());
                        setHrEmployeeSuggestOpen(false);
                      }}
                    >
                      <span className="crm-inline-suggestions__item-main">{user.name || "-"}</span>
                      <span className="crm-inline-suggestions__item-sub">
                        {[user.department, user.employee_role].map((value) => String(value || "").trim()).filter(Boolean).join(" • ") || (user.email || "-")}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        ) : activeTab === "employees" && field.key === "department" ? (
          <select
            className={`form-select ${hasFieldError ? "is-invalid" : ""}`}
            value={formValues[field.key] || ""}
            required={isRequiredField}
            onChange={(event) => onChangeField(field.key, event.target.value)}
          >
            <option value="">Select Department</option>
            {hrDepartmentNameOptions.map((name) => (
              <option key={`hr-department-${name}`} value={name}>
                {name}
              </option>
            ))}
            {formValues[field.key] && !hrDepartmentNameOptions.includes(formValues[field.key]) ? (
              <option value={formValues[field.key]}>{formValues[field.key]}</option>
            ) : null}
          </select>
        ) : activeTab === "employees" && field.key === "designation" ? (
          <select
            className={`form-select ${hasFieldError ? "is-invalid" : ""}`}
            value={formValues[field.key] || ""}
            required={isRequiredField}
            onChange={(event) => onChangeField(field.key, event.target.value)}
          >
            <option value="">Select Employee Role</option>
            {hrEmployeeRoleNameOptions.map((name) => (
              <option key={`hr-employee-role-${name}`} value={name}>
                {name}
              </option>
            ))}
            {formValues[field.key] && !hrEmployeeRoleNameOptions.includes(formValues[field.key]) ? (
              <option value={formValues[field.key]}>{formValues[field.key]}</option>
            ) : null}
          </select>
        ) : activeTab === "employees" && field.type === "phoneCode" ? (
          <div className="input-group">
            <PhoneCountryCodePicker
              value={formValues[field.key] || field.defaultValue || "+91"}
              onChange={(code) => onChangeField(field.key, code)}
              options={DIAL_COUNTRY_PICKER_OPTIONS}
              style={{ maxWidth: "120px" }}
              ariaLabel={field.label}
            />
            <input
              type="tel"
              className={`form-control hr-phone-input ${hasFieldError ? "is-invalid" : ""}`}
                placeholder={
                  field.key === "secondaryContactCountryCode"
                  ? employeeFieldMap.get("secondaryContactNumber")?.placeholder || "Secondary Mobile Number"
                  : employeeFieldMap.get("contactNumber")?.placeholder || "Primary Mobile Number"
                }
              value={
                field.key === "secondaryContactCountryCode"
                  ? (formValues.secondaryContactNumber || "")
                  : (formValues.contactNumber || "")
              }
              required={isRequiredField}
              maxLength={getBusinessAutopilotMaxLength(
                field.key === "secondaryContactCountryCode" ? "secondaryContactNumber" : "contactNumber"
              )}
              onChange={(event) => onChangeField(
                field.key === "secondaryContactCountryCode" ? "secondaryContactNumber" : "contactNumber",
                event.target.value
              )}
            />
          </div>
        ) : activeTab === "employees" && field.type === "imageUpload" ? (
          <div className="d-flex flex-wrap align-items-center gap-2">
            <input
              type="file"
              accept=".jpg,.jpeg,.png,image/jpeg,image/png"
              className="form-control"
              onChange={(event) => {
                handleHrEmployeePhotoChange(event.target.files?.[0]);
                event.target.value = "";
              }}
            />
            {formValues.photoDataUrl ? (
              <>
                <img
                  src={formValues.photoDataUrl}
                  alt="Employee preview"
                  style={{ width: 44, height: 44, objectFit: "cover", borderRadius: 8, border: "1px solid var(--bs-border-color)" }}
                />
                <span className="small text-secondary text-truncate" style={{ maxWidth: 220 }}>
                  {formValues.photoName || "employee-photo"}
                </span>
                <button
                  type="button"
                  className="btn btn-outline-light btn-sm"
                  onClick={() => setFormValues((prev) => ({ ...prev, photoDataUrl: "", photoName: "" }))}
                >
                  Remove
                </button>
              </>
            ) : (
              <span className="small text-secondary">JPG/JPEG/PNG only, max 500 KB.</span>
            )}
          </div>
        ) : activeTab === "employees" && field.type === "documentUpload" ? (
          <div className="d-flex flex-wrap align-items-center gap-2">
            <input
              type="file"
              accept=".pdf,application/pdf"
              className="form-control"
              onChange={(event) => {
                handleHrEmployeeDocumentChange(event.target.files?.[0]);
                event.target.value = "";
              }}
            />
            {formValues.documentName ? (
              <>
                <span className="small text-secondary text-truncate" style={{ maxWidth: 260 }}>
                  {formValues.documentName}
                  {formValues.documentSizeLabel ? ` • ${formValues.documentSizeLabel}` : ""}
                </span>
                <button
                  type="button"
                  className="btn btn-outline-light btn-sm"
                  onClick={() => setFormValues((prev) => ({
                    ...prev,
                    documentName: "",
                    documentMimeType: "",
                    documentSizeLabel: "",
                  }))}
                >
                  Remove
                </button>
              </>
            ) : (
              <span className="small text-secondary">PDF only, max 5 MB.</span>
            )}
          </div>
        ) : activeTab === "employees" && field.key.endsWith("Country") ? (
          <select
            className={`form-select ${hasFieldError ? "is-invalid" : ""}`}
            value={formValues[field.key] || ""}
            required={isRequiredField}
            onChange={(event) => onChangeField(field.key, event.target.value)}
          >
            <option value="">Select Country</option>
            {COUNTRY_OPTIONS.map((country) => (
              <option key={`hr-${field.key}-${country}`} value={country}>{country}</option>
            ))}
          </select>
        ) : activeTab === "employees" && field.key.endsWith("State") ? (
          (() => {
            const countryKey = field.key.replace(/State$/, "Country");
            const stateOptions = getStateOptionsForCountry(String(formValues[countryKey] || "India"));
            if (stateOptions.length) {
              return (
                <select
                  className={`form-select ${hasFieldError ? "is-invalid" : ""}`}
                  value={formValues[field.key] || ""}
                  required={isRequiredField}
                  onChange={(event) => onChangeField(field.key, event.target.value)}
                >
                  <option value="">Select State</option>
                  {stateOptions.map((state) => (
                    <option key={`hr-${field.key}-${state}`} value={state}>{state}</option>
                  ))}
                </select>
              );
            }
            return (
              <input
                type="text"
                className={`form-control ${hasFieldError ? "is-invalid" : ""}`}
                placeholder={field.placeholder}
                value={formValues[field.key] || ""}
                required={isRequiredField}
                maxLength={getBusinessAutopilotMaxLength(field.key)}
                onChange={(event) => onChangeField(field.key, event.target.value)}
              />
            );
          })()
        ) : activeTab === "employees" && field.type === "phoneNumber" ? null : field.type === "select" ? (
          <select
            className={`form-select ${hasFieldError ? "is-invalid" : ""}`}
            value={formValues[field.key] || ""}
            required={isRequiredField}
            onChange={(event) => onChangeField(field.key, event.target.value)}
          >
            <option value="">Select {field.label}</option>
            {(field.options || []).map((option) => (
              <option key={option} value={option}>{option}</option>
            ))}
          </select>
        ) : field.type === "textarea" ? (
          <textarea
            className={`form-control ${hasFieldError ? "is-invalid" : ""}`}
            rows={3}
            placeholder={field.placeholder}
            value={formValues[field.key] || ""}
            required={isRequiredField}
            maxLength={getBusinessAutopilotMaxLength(field.key, { isTextarea: true })}
            onChange={(event) => onChangeField(field.key, event.target.value)}
          />
        ) : field.type === "date" ? (
          <>
            <input
              type="date"
              className={`form-control ${hasFieldError ? "is-invalid" : ""}`}
              placeholder={field.placeholder}
              value={formValues[field.key] || ""}
              required={isRequiredField}
              max={activeTab === "employees" && field.key === "dateOfBirth" ? todayIso : undefined}
              onInput={(event) => onChangeField(field.key, event.target.value)}
              onChange={(event) => onChangeField(field.key, event.target.value)}
              onBlur={(event) => onChangeField(field.key, event.target.value)}
            />
            {showUnderAgeWarning ? (
              <div className="small text-danger mt-1">Candidate age below 18.</div>
            ) : null}
          </>
        ) : (
          <input
            type={field.type || "text"}
            className={`form-control ${hasFieldError ? "is-invalid" : ""}`}
            placeholder={field.placeholder}
            value={formValues[field.key] || ""}
            required={isRequiredField}
            maxLength={["time", "date", "number", "file"].includes(field.type) ? undefined : getBusinessAutopilotMaxLength(field.key)}
            onChange={(event) => onChangeField(field.key, event.target.value)}
          />
        )}
      </div>
    );
  }

  function onChangeField(fieldKey, nextValue) {
    setHrFieldErrors((prev) => {
      if (!prev[fieldKey]) {
        return prev;
      }
      const next = { ...prev };
      delete next[fieldKey];
      return next;
    });
    if (activeTab === "employees" && fieldKey === "name") {
      const { nextValues, matchedEmployeeId } = buildEmployeeFormValuesFromName(nextValue, formValues);
      setEditingId(matchedEmployeeId);
      setFormValues(nextValues);
      return;
    }
    const fieldMeta = employeeFieldMap.get(fieldKey);
    const normalizedValue = typeof nextValue === "string"
      ? (
        fieldMeta?.type === "date"
          ? normalizeIsoDateValue(nextValue)
          : clampBusinessAutopilotText(fieldKey, nextValue, { isTextarea: fieldMeta?.type === "textarea" })
      )
      : nextValue;
    setFormValues((prev) => {
      const next = { ...prev, [fieldKey]: normalizedValue };
      if (activeTab === "employees" && fieldKey.endsWith("Country")) {
        next[fieldKey.replace(/Country$/, "State")] = "";
      }
      if (activeTab === "employees" && prev.temporarySameAsPermanent && fieldKey.startsWith("permanent")) {
        return syncTemporaryAddressFromPermanent(next);
      }
      if (activeTab === "attendance" && fieldKey === "status" && normalizedValue !== "Permission") {
        next.permissionHours = "";
      }
      if (activeTab === "attendance" && fieldKey === "entryMode" && normalizedValue === "User Side") {
        next.inTime = "";
        next.outTime = "";
      }
      return next;
    });
  }

  function onEditRow(row) {
    setEditingId(row.id);
    const nextValues = {};
    config.fields.forEach((field) => {
      nextValues[field.key] = row[field.key] || field.defaultValue || "";
    });
    if (activeTab === "employees") {
      nextValues.sourceUserId = row.sourceUserId || row.userId || "";
      nextValues.sourceUserEmail = row.sourceUserEmail || "";
      const temporarySameAsPermanent = Boolean(row.temporarySameAsPermanent)
        || (
          String(row.temporaryAddress || "").trim() === String(row.permanentAddress || "").trim()
          && String(row.temporaryCountry || "").trim() === String(row.permanentCountry || "").trim()
          && String(row.temporaryState || "").trim() === String(row.permanentState || "").trim()
          && String(row.temporaryCity || "").trim() === String(row.permanentCity || "").trim()
          && String(row.temporaryPincode || "").trim() === String(row.permanentPincode || "").trim()
          && Boolean(String(row.permanentAddress || "").trim())
        );
      nextValues.temporarySameAsPermanent = temporarySameAsPermanent;
    }
    setFormValues(nextValues);
  }

  function onCancelEdit() {
    setEditingId("");
    setHrFormNotice("");
    setHrFieldErrors({});
    const next = buildEmptyValues(config.fields);
    if (activeTab === "employees") {
      next.temporarySameAsPermanent = false;
    }
    setFormValues(next);
    window.requestAnimationFrame(() => {
      clearFlatpickrDisplayValues(document);
    });
  }

  function onDeleteRow(rowOrId) {
    const targetId = String((typeof rowOrId === "object" && rowOrId !== null ? rowOrId.id : rowOrId) || "").trim();
    const targetName = String((typeof rowOrId === "object" && rowOrId !== null ? rowOrId.name : "") || "").trim().toLowerCase();
    setModuleData((prev) => ({
      ...prev,
      [activeTab]: (prev[activeTab] || []).filter((row) => {
        const rowId = String(row?.id || "").trim();
        const rowName = String(row?.name || "").trim().toLowerCase();
        if (targetId && rowId) {
          return rowId !== targetId;
        }
        if (targetName && rowName) {
          return rowName !== targetName;
        }
        return true;
      })
    }));
    if (targetId && String(editingId || "").trim() === targetId) {
      onCancelEdit();
    }
  }

  function openEmployeeViewModal(row) {
    setEmployeeViewModal({ open: true, row: row || null });
  }

  function closeEmployeeViewModal() {
    setEmployeeViewModal({ open: false, row: null });
  }

  function getEmployeeViewValue(row, key) {
    if (!row) return "-";
    if (key === "contactNumber") {
      return [row.contactCountryCode, row.contactNumber].filter(Boolean).join(" ").trim() || "-";
    }
    if (key === "secondaryContactNumber") {
      return [row.secondaryContactCountryCode, row.secondaryContactNumber].filter(Boolean).join(" ").trim() || "-";
    }
    return String(row[key] || "").trim() || "-";
  }

  function getHrRequiredFieldLabel(field) {
    const label = String(field?.label || "").trim();
    const key = String(field?.key || "").trim();
    if (!key) return label || "Field";
    if (key.startsWith("permanent")) {
      return `Permanent ${label}`.trim();
    }
    if (key.startsWith("temporary")) {
      return `Temporary ${label}`.trim();
    }
    return label || "Field";
  }

  async function onSubmit(event) {
    event.preventDefault();
    const syncedValuesResult = syncDateTimeFieldValuesFromForm(event.currentTarget, config.fields, formValues);
    const effectiveValues = syncedValuesResult.values;
    if (syncedValuesResult.changed) {
      setFormValues((prev) => ({ ...prev, ...effectiveValues }));
    }
    const visibleFields = config.fields.filter((field) => {
      const condition = field.conditionalOn;
      if (!condition) {
        if (
          activeTab === "employees"
          && effectiveValues.temporarySameAsPermanent
          && field.key.startsWith("temporary")
        ) {
          return false;
        }
        return true;
      }
      return String(effectiveValues[condition.key] || "").trim() === String(condition.value || "").trim();
    });
    const missingFields = visibleFields.filter((field) => {
      if (field.optional) {
        return false;
      }
      if (field.type === "date") {
        return !normalizeMeetingDateValue(effectiveValues[field.key]);
      }
      if (field.type === "time") {
        return !normalizeMeetingTimeValue(effectiveValues[field.key]);
      }
      return !String(effectiveValues[field.key] || "").trim();
    });
    if (missingFields.length) {
      const fieldErrorMap = {};
      missingFields.forEach((field) => {
        fieldErrorMap[field.key] = true;
      });
      const missingLabels = Array.from(new Set(missingFields.map((field) => getHrRequiredFieldLabel(field))));
      setHrFieldErrors(fieldErrorMap);
      setHrFormNotice(`Please fill mandatory fields: ${missingLabels.join(", ")}`);
      return;
    }
    setHrFieldErrors({});
    const payload = {};
    config.fields.forEach((field) => {
      if (field.type === "date") {
        payload[field.key] = normalizeMeetingDateValue(effectiveValues[field.key]);
      } else if (field.type === "time") {
        payload[field.key] = normalizeMeetingTimeValue(effectiveValues[field.key]);
      } else {
        payload[field.key] = String(effectiveValues[field.key]).trim();
      }
    });
    if (activeTab === "employees") {
      const matchedUser = hrUserLookupByName.get(String(payload.name || "").trim().toLowerCase());
      payload.sourceUserId = String(effectiveValues.sourceUserId || matchedUser?.id || "");
      payload.sourceUserEmail = String(effectiveValues.sourceUserEmail || matchedUser?.email || "");
      payload.temporarySameAsPermanent = Boolean(effectiveValues.temporarySameAsPermanent);
      if (payload.temporarySameAsPermanent) {
        Object.assign(payload, syncTemporaryAddressFromPermanent(payload));
      }
    }
    if (activeTab === "attendance") {
      payload.date = payload.date || todayIso;
      payload.entryMode = payload.entryMode || "HR Side";
      if (payload.status !== "Permission") {
        payload.permissionHours = "";
      }
      payload.workedHours = computeWorkedDuration(payload.inTime, payload.outTime);
      payload.completedTasks = String(payload.completedTasks || "").trim();
      payload.taskNotes = String(payload.taskNotes || "").trim();
    }
    if (activeTab === "employees") {
      const dob = String(payload.dateOfBirth || "").trim();
      if (dob && dob > todayIso) {
        setHrFieldErrors((prev) => ({ ...prev, dateOfBirth: true }));
        setHrFormNotice("Date of Birth cannot be a future date.");
        return;
      }
    }
    const nextRowId = editingId || `${activeTab}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
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
        [activeTab]: [{ id: nextRowId, ...payload }, ...existing]
      };
    });
    setHrFormNotice("");
    if (activeTab === "employees" && payload.sourceUserId) {
      const matchedDirectoryUser = findDirectoryItemBySourceUser(hrUserDirectory, payload.sourceUserId, payload.name);
      const membershipId = String(matchedDirectoryUser?.membership_id || "").trim();
      const departmentId = hrDepartmentOptions.find((item) => item.name === payload.department)?.id || null;
      const employeeRoleId = hrEmployeeRoleOptions.find((item) => item.name === payload.designation)?.id || null;
      if (membershipId) {
        try {
          const updateData = await apiFetch(`/api/business-autopilot/users/${membershipId}`, {
            method: "PUT",
            body: JSON.stringify({
              first_name: String(matchedDirectoryUser?.first_name || "").trim(),
              last_name: String(matchedDirectoryUser?.last_name || "").trim(),
              email: String(matchedDirectoryUser?.email || "").trim(),
              password: "",
              role: String(matchedDirectoryUser?.role || "org_user").trim() || "org_user",
              department_id: departmentId,
              employee_role_id: employeeRoleId,
              is_active: matchedDirectoryUser?.is_active !== false,
            }),
          });
          setHrUserDirectory(Array.isArray(updateData?.users) ? updateData.users : []);
          setHrDepartmentOptions(
            Array.isArray(updateData?.departments)
              ? updateData.departments
                .map((item) => ({
                  id: String(item?.id || "").trim(),
                  name: String(item?.name || "").trim(),
                }))
                .filter((item) => item.id && item.name)
              : []
          );
          setHrEmployeeRoleOptions(
            Array.isArray(updateData?.employee_roles)
              ? updateData.employee_roles
                .map((item) => ({
                  id: String(item?.id || "").trim(),
                  name: String(item?.name || "").trim(),
                }))
                .filter((item) => item.id && item.name)
              : []
          );
        } catch (_error) {
          // Keep the HR record saved even if linked user sync fails.
        }
      }
    }
    onCancelEdit();
  }

  function upsertAttendanceRecord({ employee, date = todayIso, patch = {} }) {
    const employeeName = String(employee || "").trim();
    const isoDate = String(date || todayIso).trim() || todayIso;
    if (!employeeName) {
      return;
    }
    setModuleData((prev) => {
      const rows = prev.attendance || [];
      const index = rows.findIndex((row) =>
        String(row.employee || "").trim() === employeeName
        && String(row.date || "").trim() === isoDate
      );
      const base = index >= 0 ? rows[index] : {
        id: `attendance_${Date.now()}`,
        employee: employeeName,
        date: isoDate,
        entryMode: "User Side",
        inTime: "",
        outTime: "",
        workedHours: "",
        status: "Present",
        permissionHours: "",
        notes: "",
        completedTasks: "",
        taskNotes: "",
      };
      const nextRow = { ...base, ...patch };
      nextRow.workedHours = computeWorkedDuration(nextRow.inTime, nextRow.outTime);
      if (nextRow.status !== "Permission") {
        nextRow.permissionHours = "";
      }
      if (index >= 0) {
        return {
          ...prev,
          attendance: rows.map((row, rowIndex) => (rowIndex === index ? nextRow : row))
        };
      }
      return {
        ...prev,
        attendance: [nextRow, ...rows]
      };
    });
  }

  function handleAttendancePunch(action, employeeName, source = "User Side") {
    const name = String(employeeName || "").trim();
    if (!name) {
      return;
    }
    const currentTime = getCurrentTimeHm();
    if (action === "out") {
      const existing = (moduleData.attendance || []).find((row) =>
        String(row.employee || "").trim() === name && String(row.date || "").trim() === todayIso
      );
      setAttendanceTaskModal({
        open: true,
        employee: name,
        date: todayIso,
        source,
        outTime: currentTime,
        completedTasks: String(existing?.completedTasks || "").trim(),
        taskNotes: String(existing?.taskNotes || "").trim(),
        mode: "punchOut",
      });
      return;
    }
    upsertAttendanceRecord({
      employee: name,
      date: todayIso,
      patch: action === "in"
        ? { entryMode: source, inTime: currentTime, status: "Present" }
        : { entryMode: source, outTime: currentTime, status: "Present" }
    });
  }

  function openAttendanceTaskModal(row) {
    setAttendanceTaskModal({
      open: true,
      employee: String(row?.employee || "").trim(),
      date: String(row?.date || todayIso).trim() || todayIso,
      source: String(row?.entryMode || "HR Side").trim() || "HR Side",
      outTime: String(row?.outTime || "").trim(),
      completedTasks: String(row?.completedTasks || "").trim(),
      taskNotes: String(row?.taskNotes || "").trim(),
      mode: "edit",
    });
  }

  function closeAttendanceTaskModal() {
    setAttendanceTaskModal((prev) => ({ ...prev, open: false }));
  }

  function submitAttendanceTaskModal(event) {
    event.preventDefault();
    const employee = String(attendanceTaskModal.employee || "").trim();
    const date = String(attendanceTaskModal.date || todayIso).trim() || todayIso;
    if (!employee) {
      setHrFormNotice("Employee name is required.");
      return;
    }
    const patch = {
      completedTasks: String(attendanceTaskModal.completedTasks || "").trim(),
      taskNotes: String(attendanceTaskModal.taskNotes || "").trim(),
    };
    if (attendanceTaskModal.mode === "punchOut") {
      patch.entryMode = attendanceTaskModal.source || "User Side";
      patch.outTime = attendanceTaskModal.outTime || getCurrentTimeHm();
      patch.status = "Present";
    }
    upsertAttendanceRecord({ employee, date, patch });
    setHrFormNotice("");
    closeAttendanceTaskModal();
  }

  const myAttendanceToday = useMemo(
    () => (moduleData.attendance || []).find((row) =>
      String(row.employee || "").trim() === String(myAttendanceEmployee || "").trim()
      && String(row.date || "").trim() === todayIso
    ) || null,
    [moduleData.attendance, myAttendanceEmployee, todayIso]
  );

  const attendanceFilteredRows = useMemo(() => {
    if (activeTab !== "attendance") {
      return currentRows;
    }
    return (currentRows || []).filter((row) => {
      const date = String(row?.date || "");
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return true;
      if (attendanceYearFilter && date.slice(0, 4) !== attendanceYearFilter) return false;
      if (attendanceMonthFilter && date.slice(5, 7) !== attendanceMonthFilter) return false;
      return true;
    });
  }, [activeTab, currentRows, attendanceYearFilter, attendanceMonthFilter]);

  function openAttendanceNotesModal(row) {
    setAttendanceNotesModal({
      open: true,
      rowId: String(row?.id || ""),
      employee: String(row?.employee || "").trim(),
      date: String(row?.date || todayIso).trim() || todayIso,
      notes: String(row?.notes || "").trim(),
    });
  }

  function closeAttendanceNotesModal() {
    setAttendanceNotesModal((prev) => ({ ...prev, open: false }));
  }

  function submitAttendanceNotesModal(event) {
    event.preventDefault();
    const rowId = String(attendanceNotesModal.rowId || "").trim();
    if (!rowId) return;
    const notes = String(attendanceNotesModal.notes || "").trim();
    setModuleData((prev) => ({
      ...prev,
      attendance: (prev.attendance || []).map((row) => (
        String(row.id || "") === rowId ? { ...row, notes } : row
      ))
    }));
    closeAttendanceNotesModal();
  }

  return (
    <div className="d-flex flex-column gap-3">
      {!showOnlyEmployeeForm ? (
        <div>
          <h4 className="mb-2">HR</h4>
          <p className="text-secondary mb-3">Handle employees, attendance, leave approvals, and payroll.</p>
          <div className="d-flex flex-wrap gap-2">
            {Object.entries(HR_TAB_CONFIG).map(([tabKey, tabValue]) => (
              <button
                key={tabKey}
                type="button"
                className={`btn btn-sm ${activeTab === tabKey ? "btn-success" : "btn-outline-light"}`}
                onClick={() => {
                  setActiveTab(tabKey);
                  const nextHash = String(tabKey || "").replace(/[A-Z]/g, (match) => match.toLowerCase());
                  window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}#${nextHash}`);
                }}
              >
                {tabValue.label}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {!showOnlyEmployeeForm && activeTab === "employees" ? (
        <div className="row g-3">
          {stats.map((item) => (
            <div className="col-12 col-md-4" key={item.label}>
              <div className="card p-3 h-100 d-flex flex-column align-items-center justify-content-center text-center">
                <div className="stat-icon stat-icon-primary mb-2">
                  <i className={`bi ${item.icon || "bi-bar-chart"}`} aria-hidden="true" />
                </div>
                <div className="text-secondary small">{item.label}</div>
                <h5 className="mb-0 mt-1">{item.value}</h5>
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {isPayrollManagementTab ? (
        <HrPayrollWorkspacePanel activeTab={activeTab} hrEmployees={moduleData.employees || []} />
      ) : (
        <>
      <div className="card p-3">
        <h6 className="mb-3">
          {editingId
            ? `Edit ${config.itemLabel}`
            : (showOnlyEmployeeForm && activeTab === "employees" ? config.itemLabel : `Create ${config.itemLabel}`)}
        </h6>
        <form className="d-flex flex-column gap-3" onSubmit={onSubmit}>
          {hrFormNotice ? (
            <div className="alert alert-danger py-2 mb-0">{hrFormNotice}</div>
          ) : null}
          {activeTab === "employees" ? (
            <>
              <div className="row g-3">
                {[
                  "name",
                  "gender",
                  "department",
                  "designation",
                ].map((fieldKey) => renderHrField(employeeFieldMap.get(fieldKey), "col-12 col-md-6 col-xl-3"))}
              </div>
              <div className="row g-3">
                {[
                  "dateOfJoining",
                  "dateOfBirth",
                  "bloodGroup",
                  "fatherName",
                  "motherName",
                ].map((fieldKey) => renderHrField(
                  employeeFieldMap.get(fieldKey),
                  ["dateOfJoining", "dateOfBirth", "bloodGroup"].includes(fieldKey)
                    ? "col-12 col-md-6 col-xl-2"
                    : "col-12 col-md-6 col-xl-3"
                ))}
              </div>
              <div className="row g-3 hr-upload-divider">
                {[
                  "photoDataUrl",
                  "documentName",
                ].map((fieldKey) => renderHrField(
                  employeeFieldMap.get(fieldKey),
                  "col-12 col-xl-6"
                ))}
              </div>
              <div className="row g-3">
                {[
                  "contactCountryCode",
                  "secondaryContactCountryCode",
                  "maritalStatus",
                  "wifeName",
                ].map((fieldKey) => renderHrField(
                  employeeFieldMap.get(fieldKey),
                  "col-12 col-md-6 col-xl-3"
                ))}
              </div>
              <hr className="section-divider mt-1 mb-2" />
              <div className="row g-3">
                <div className="col-12 col-xl-6">
                  <div className="h-100">
                    <h6 className="mb-3">Permanent Address</h6>
                    <div className="row g-3">
                      {["permanentAddress", "permanentCountry", "permanentState", "permanentCity", "permanentPincode"].map((fieldKey) =>
                        renderHrField(
                          employeeFieldMap.get(fieldKey),
                          fieldKey === "permanentAddress" ? "col-12" : "col-12 col-md-6 col-xl-3"
                        )
                      )}
                    </div>
                  </div>
                </div>
                <div className="col-12 col-xl-6">
                  <div className="h-100">
                    <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-3">
                      <h6 className="mb-0">Temporary Address</h6>
                      <label className="form-check-label small text-secondary d-flex align-items-center gap-2 mb-0">
                        <input
                          type="checkbox"
                          className="form-check-input mt-0"
                          checked={Boolean(formValues.temporarySameAsPermanent)}
                          onChange={(event) => {
                            const checked = event.target.checked;
                            setFormValues((prev) => {
                              const next = { ...prev, temporarySameAsPermanent: checked };
                              return checked ? syncTemporaryAddressFromPermanent(next) : next;
                            });
                          }}
                        />
                        Temporary same as permanent
                      </label>
                    </div>
                    {!formValues.temporarySameAsPermanent ? (
                      <div className="row g-3">
                        {["temporaryAddress", "temporaryCountry", "temporaryState", "temporaryCity", "temporaryPincode"].map((fieldKey) =>
                          renderHrField(
                            employeeFieldMap.get(fieldKey),
                            fieldKey === "temporaryAddress" ? "col-12" : "col-12 col-md-6 col-xl-3"
                          )
                        )}
                      </div>
                    ) : (
                      <div className="small text-secondary">Temporary address entry hidden because both addresses are same.</div>
                    )}
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div className="row g-3">
              {config.fields.map((field) => renderHrField(field, "col-12 col-md-4"))}
            </div>
          )}
          {activeTab === "attendance" ? (
            <div className="d-flex flex-wrap align-items-center gap-2">
              <span className="small text-secondary">User Login Attendance:</span>
              <button
                type="button"
                className="btn btn-outline-success btn-sm"
                disabled={!String(formValues.employee || "").trim()}
                onClick={() => handleAttendancePunch("in", formValues.employee, "User Side")}
              >
                Attendance In
              </button>
              <button
                type="button"
                className="btn btn-outline-info btn-sm"
                disabled={!String(formValues.employee || "").trim()}
                onClick={() => handleAttendancePunch("out", formValues.employee, "User Side")}
              >
                Attendance Out
              </button>
              <span className="small text-secondary">Selected employee + today date record will update.</span>
            </div>
          ) : null}
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

      {!showOnlyEmployeeForm && activeTab === "attendance" ? (
        <div className="card p-3">
          <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-2">
            <h6 className="mb-0">My Attendance (HR)</h6>
            <div className="d-flex align-items-center gap-2">
              <label className="small text-secondary mb-0">Employee</label>
              <select
                className="form-select form-select-sm"
                style={{ minWidth: "180px" }}
                value={myAttendanceEmployee}
                onChange={(e) => setMyAttendanceEmployee(e.target.value)}
              >
                <option value="">Select Employee</option>
                {employeeNameOptions.map((name) => (
                  <option key={`my-attendance-${name}`} value={name}>{name}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="row g-3 align-items-end">
            <div className="col-12 col-md-2">
              <div className="small text-secondary">Date</div>
              <div className="fw-semibold">{todayIso}</div>
            </div>
            <div className="col-12 col-md-2">
              <div className="small text-secondary">In Time</div>
              <div className="fw-semibold">{formatTimeToAmPm(myAttendanceToday?.inTime)}</div>
            </div>
            <div className="col-12 col-md-2">
              <div className="small text-secondary">Out Time</div>
              <div className="fw-semibold">{formatTimeToAmPm(myAttendanceToday?.outTime)}</div>
            </div>
            <div className="col-12 col-md-2">
              <div className="small text-secondary">Worked</div>
              <div className="fw-semibold">{myAttendanceToday?.workedHours || "-"}</div>
            </div>
            <div className="col-12 col-md-2">
              <div className="small text-secondary">Status</div>
              <div className="fw-semibold">
                {myAttendanceToday?.status === "Permission" && myAttendanceToday?.permissionHours
                  ? `Permission (${myAttendanceToday.permissionHours} hrs)`
                  : (myAttendanceToday?.status || "-")}
              </div>
            </div>
            <div className="col-12 col-md-2">
              <div className="d-flex gap-2">
                <button
                  type="button"
                  className="btn btn-outline-success btn-sm w-100"
                  disabled={!myAttendanceEmployee}
                  onClick={() => handleAttendancePunch("in", myAttendanceEmployee, "HR Self")}
                >
                  In
                </button>
                <button
                  type="button"
                  className="btn btn-outline-info btn-sm w-100"
                  disabled={!myAttendanceEmployee}
                  onClick={() => handleAttendancePunch("out", myAttendanceEmployee, "HR Self")}
                >
                  Out
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {!showOnlyEmployeeForm || activeTab === "employees" ? (
        <SearchablePaginatedTableCard
          title={showOnlyEmployeeForm && activeTab === "employees" ? "Employee List" : config.label}
          badgeLabel={`${(activeTab === "attendance" ? attendanceFilteredRows : currentRows).length} items`}
          rows={activeTab === "attendance" ? attendanceFilteredRows : currentRows}
          columns={hrTableColumns}
          withoutOuterCard={["attendance", "leaves", "payroll"].includes(activeTab)}
          headerBottom={activeTab === "attendance" ? (
            <div className="d-flex flex-wrap align-items-end gap-2">
              <div>
                <label className="form-label small text-secondary mb-1">Year</label>
                <select
                  className="form-select form-select-sm"
                  value={attendanceYearFilter}
                  onChange={(e) => setAttendanceYearFilter(e.target.value)}
                  style={{ minWidth: "110px" }}
                >
                  {attendanceYearOptions.map((year) => (
                    <option key={`attendance-year-${year}`} value={year}>{year}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="form-label small text-secondary mb-1">Month</label>
                <select
                  className="form-select form-select-sm"
                  value={attendanceMonthFilter}
                  onChange={(e) => setAttendanceMonthFilter(e.target.value)}
                  style={{ minWidth: "120px" }}
                >
                  {attendanceMonthOptions.map((month) => (
                    <option key={`attendance-month-${month.value}`} value={month.value}>{month.label}</option>
                  ))}
                </select>
              </div>
            </div>
          ) : null}
          actionHeaderStyle={activeTab === "attendance" ? { minWidth: "260px", whiteSpace: "nowrap" } : null}
          actionCellStyle={activeTab === "attendance" ? { minWidth: "260px", whiteSpace: "nowrap" } : null}
          searchPlaceholder={`Search ${config.label.toLowerCase()}`}
          noRowsText={`No ${config.label.toLowerCase()} yet.`}
          searchBy={(row) => config.columns.map((column) => row[column.key] || "").join(" ")}
          renderCells={(row) => config.columns.map((column) => {
            if (activeTab === "attendance" && (column.key === "inTime" || column.key === "outTime")) {
              return formatTimeToAmPm(row[column.key]);
            }
            if (activeTab === "attendance" && column.key === "workedHours") {
              return row.workedHours || computeWorkedDuration(row.inTime, row.outTime) || "-";
            }
            if (activeTab === "attendance" && column.key === "status") {
              const status = String(row.status || "").trim();
              if (status === "Permission" && String(row.permissionHours || "").trim()) {
                return `Permission (${String(row.permissionHours).trim()} hrs)`;
              }
              return row.entryMode ? `${status || "-"}${row.entryMode ? ` (${row.entryMode})` : ""}` : (status || "-");
            }
            return formatDateLikeCellValue(column.key, row[column.key], "-");
          })}
          renderActions={(row) => (
            <div className="d-inline-flex gap-2 flex-nowrap">
              {activeTab === "attendance" ? (() => {
                const hasTaskList = Boolean(String(row?.completedTasks || "").trim());
                return (
                  <>
                    <button
                      type="button"
                      className={`btn btn-sm ${hasTaskList ? "btn-primary" : "btn-outline-primary"}`}
                      onClick={() => openAttendanceTaskModal(row)}
                    >
                      Task
                    </button>
                    <button
                      type="button"
                      className={`btn btn-sm ${String(row?.notes || "").trim() ? "btn-outline-primary" : "btn-outline-secondary"}`}
                      onClick={() => openAttendanceNotesModal(row)}
                    >
                      Notes
                    </button>
                  </>
                );
              })() : null}
              {activeTab === "employees" ? (
                <button type="button" className="btn btn-sm btn-outline-secondary" onClick={() => openEmployeeViewModal(row)}>
                  View
                </button>
              ) : null}
              <button type="button" className="btn btn-sm btn-outline-info" onClick={() => onEditRow(row)}>
                Edit
              </button>
              <button type="button" className="btn btn-sm btn-outline-danger" onClick={() => onDeleteRow(row)}>
                Delete
              </button>
            </div>
          )}
        />
      ) : null}

      {activeTab === "employees" && employeeViewModal.open ? (
        <div
          role="dialog"
          aria-modal="true"
          className="modal-overlay wz-employee-view-overlay"
          onClick={closeEmployeeViewModal}
        >
          <div
            className="modal-panel wz-employee-view-modal"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="d-flex align-items-start justify-content-between gap-3 mb-3">
              <div>
                <h5 className="mb-1">Employee Details</h5>
                <div className="small wz-employee-view-name">{getEmployeeViewValue(employeeViewModal.row, "name")}</div>
              </div>
              <button type="button" className="btn btn-sm wz-employee-view-close" onClick={closeEmployeeViewModal}>
                <i className="bi bi-x-lg" aria-hidden="true" />
              </button>
            </div>
            <div className="row g-3">
              {[
                ["gender", "Gender"],
                ["department", "Department"],
                ["designation", "Employee Role"],
                ["dateOfJoining", "Date of Joining"],
                ["dateOfBirth", "Date of Birth"],
                ["bloodGroup", "Blood Group"],
                ["fatherName", "Father's Name"],
                ["motherName", "Mother's Name"],
                ["maritalStatus", "Marital Status"],
                ["wifeName", "Spouse Name"],
                ["contactNumber", "Contact Number"],
                ["secondaryContactNumber", "Secondary Contact Number"],
                ["permanentAddress", "Permanent Address"],
                ["permanentCountry", "Permanent Country"],
                ["permanentState", "Permanent State"],
                ["permanentCity", "Permanent City"],
                ["permanentPincode", "Permanent Pincode"],
                ["temporaryAddress", "Temporary Address"],
                ["temporaryCountry", "Temporary Country"],
                ["temporaryState", "Temporary State"],
                ["temporaryCity", "Temporary City"],
                ["temporaryPincode", "Temporary Pincode"],
              ].map(([key, label]) => (
                <div className="col-12 col-md-6 col-xl-4" key={`employee-view-${key}`}>
                  <div className="wz-employee-view-item">
                    <div className="small wz-employee-view-label mb-1">{label}</div>
                    <div className="wz-employee-view-value">{getEmployeeViewValue(employeeViewModal.row, key)}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : null}

      {!showOnlyEmployeeForm && activeTab === "attendance" && attendanceTaskModal.open ? (
        <div
          role="dialog"
          aria-modal="true"
          className="position-fixed top-0 start-0 w-100 h-100 d-flex align-items-center justify-content-center"
          style={{ background: "rgba(0,0,0,0.65)", zIndex: 1050, padding: "1rem" }}
          onClick={closeAttendanceTaskModal}
        >
          <div
            className="card p-3"
            style={{ width: "min(700px, 100%)" }}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="d-flex align-items-start justify-content-between gap-3 mb-2">
              <div>
                <h5 className="mb-1">
                  {attendanceTaskModal.mode === "punchOut" ? "Attendance Out - Completed Tasks" : "Completed Work Tasks"}
                </h5>
                <div className="small text-secondary">
                  {attendanceTaskModal.employee || "-"} • {attendanceTaskModal.date || todayIso}
                  {attendanceTaskModal.mode === "punchOut" && attendanceTaskModal.outTime ? ` • Out Time ${formatTimeToAmPm(attendanceTaskModal.outTime)}` : ""}
                </div>
              </div>
              <button type="button" className="btn btn-sm btn-outline-light" onClick={closeAttendanceTaskModal}>
                <i className="bi bi-x-lg" aria-hidden="true" />
              </button>
            </div>
            <form className="d-flex flex-column gap-3" onSubmit={submitAttendanceTaskModal}>
              <div>
                <label className="form-label small text-secondary mb-1">Completed Work Task List</label>
                <textarea
                  className="form-control"
                  rows={5}
                  placeholder="Enter completed tasks (one line per task / summary details)"
                  value={attendanceTaskModal.completedTasks}
                  onChange={(e) => setAttendanceTaskModal((prev) => ({ ...prev, completedTasks: e.target.value }))}
                />
              </div>
              <div>
                <label className="form-label small text-secondary mb-1">Notes (Optional)</label>
                <textarea
                  className="form-control"
                  rows={3}
                  placeholder="Blockers / pending follow-up / handover notes"
                  value={attendanceTaskModal.taskNotes}
                  onChange={(e) => setAttendanceTaskModal((prev) => ({ ...prev, taskNotes: e.target.value }))}
                />
              </div>
              <div className="d-flex gap-2">
                <button type="submit" className="btn btn-success btn-sm">
                  {attendanceTaskModal.mode === "punchOut" ? "Save & Attendance Out" : "Save Task Details"}
                </button>
                <button type="button" className="btn btn-outline-light btn-sm" onClick={closeAttendanceTaskModal}>
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {!showOnlyEmployeeForm && activeTab === "attendance" && attendanceNotesModal.open ? (
        <div
          role="dialog"
          aria-modal="true"
          className="position-fixed top-0 start-0 w-100 h-100 d-flex align-items-center justify-content-center"
          style={{ background: "rgba(0,0,0,0.65)", zIndex: 1050, padding: "1rem" }}
          onClick={closeAttendanceNotesModal}
        >
          <div
            className="card p-3"
            style={{ width: "min(640px, 100%)" }}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="d-flex align-items-start justify-content-between gap-3 mb-2">
              <div>
                <h5 className="mb-1">Attendance Notes / Queries</h5>
                <div className="small text-secondary">
                  {attendanceNotesModal.employee || "-"} • {attendanceNotesModal.date || "-"}
                </div>
              </div>
              <button type="button" className="btn btn-sm btn-outline-light" onClick={closeAttendanceNotesModal}>
                <i className="bi bi-x-lg" aria-hidden="true" />
              </button>
            </div>
            <form className="d-flex flex-column gap-3" onSubmit={submitAttendanceNotesModal}>
              <div>
                <label className="form-label small text-secondary mb-1">Notes / Queries</label>
                <textarea
                  className="form-control"
                  rows={6}
                  placeholder="Add notes, queries, clarifications, pending items..."
                  value={attendanceNotesModal.notes}
                  onChange={(e) => setAttendanceNotesModal((prev) => ({ ...prev, notes: e.target.value }))}
                />
              </div>
              <div className="d-flex gap-2">
                <button type="submit" className="btn btn-success btn-sm">Save Notes</button>
                <button type="button" className="btn btn-outline-light btn-sm" onClick={closeAttendanceNotesModal}>
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
        </>
      )}
    </div>
  );
}

function CategoryCrudModule({
  heading,
  subtitle,
  tabConfig,
  defaultData,
  storageKey,
  statsBuilder,
  statIcons = [],
  defaultActiveTab = ""
}) {
  const CATEGORY_ENTRY_LIMIT = 100;
  const firstTab = Object.keys(tabConfig)[0];
  const hasCombinedCategoryTabs = Boolean(tabConfig?.mainCategories && tabConfig?.subCategories);
  const preferredInitialTab = Object.prototype.hasOwnProperty.call(tabConfig || {}, defaultActiveTab)
    ? defaultActiveTab
    : (hasCombinedCategoryTabs && (firstTab === "mainCategories" || firstTab === "subCategories")
      ? "categories"
      : firstTab);
  const initialTab = preferredInitialTab;
  const [activeTab, setActiveTab] = useState(initialTab);
  const [moduleData, setModuleData] = useState(defaultData);
  const [formValues, setFormValues] = useState(buildEmptyValues(tabConfig[firstTab].fields));
  const [editingId, setEditingId] = useState("");
  const [categoryForms, setCategoryForms] = useState(() => (
    hasCombinedCategoryTabs
      ? {
          mainCategories: buildEmptyValues(tabConfig.mainCategories.fields),
          subCategories: buildEmptyValues(tabConfig.subCategories.fields),
        }
      : { mainCategories: {}, subCategories: {} }
  ));
  const [categoryEditingIds, setCategoryEditingIds] = useState({ mainCategories: "", subCategories: "" });
  const [categoryNotice, setCategoryNotice] = useState("");
  const [departmentOptions, setDepartmentOptions] = useState([]);
  const [ticketingClientSearchOpen, setTicketingClientSearchOpen] = useState(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (!raw) {
        return;
      }
      const parsed = JSON.parse(raw);
      if (isValidCustomTabData(parsed, tabConfig)) {
        setModuleData(parsed);
      }
    } catch (_error) {
      // Ignore invalid cached module data.
    }
  }, [storageKey, tabConfig]);

  useEffect(() => {
    window.localStorage.setItem(storageKey, JSON.stringify(moduleData));
  }, [moduleData, storageKey]);

  useEffect(() => {
    let active = true;
    const needsDepartmentDropdown = Object.values(tabConfig).some((tab) =>
      Array.isArray(tab?.fields) && tab.fields.some((field) => field.key === "department")
    );
    if (!needsDepartmentDropdown) {
      return () => {
        active = false;
      };
    }
    (async () => {
      try {
        const data = await apiFetch("/api/business-autopilot/departments");
        if (!active) {
          return;
        }
        const rows = Array.isArray(data?.departments) ? data.departments : [];
        const names = rows
          .map((row) => String(row?.name || "").trim())
          .filter(Boolean);
        setDepartmentOptions(Array.from(new Set(names)));
      } catch {
        if (active) {
          setDepartmentOptions([]);
        }
      }
    })();
    return () => {
      active = false;
    };
  }, [tabConfig]);

  useEffect(() => {
    setEditingId("");
    if (activeTab === "categories") {
      return;
    }
    setTicketingClientSearchOpen(false);
    setFormValues(buildEmptyValues(tabConfig[activeTab].fields));
  }, [activeTab, tabConfig]);

  useEffect(() => {
    if (!tabConfig?.tickets) {
      return undefined;
    }
    const onTicketingMenuClick = () => {
      setActiveTab("tickets");
      setEditingId("");
    };
    window.addEventListener("wz:ticketing-menu-click", onTicketingMenuClick);
    return () => window.removeEventListener("wz:ticketing-menu-click", onTicketingMenuClick);
  }, [tabConfig]);

  const visibleTabs = useMemo(() => {
    if (!hasCombinedCategoryTabs) {
      return Object.entries(tabConfig).map(([tabKey, tabValue]) => ({ key: tabKey, label: tabValue.label }));
    }
    const nonCategoryEntries = Object.entries(tabConfig)
      .filter(([tabKey]) => tabKey !== "mainCategories" && tabKey !== "subCategories")
      .map(([tabKey, tabValue]) => ({ key: tabKey, label: tabValue.label }));
    return [...nonCategoryEntries, { key: "categories", label: "Category" }];
  }, [hasCombinedCategoryTabs, tabConfig]);
  const hasOverviewTab = useMemo(
    () => Object.prototype.hasOwnProperty.call(tabConfig || {}, "overview"),
    [tabConfig]
  );

  const config = activeTab === "categories" ? null : tabConfig[activeTab];
  const currentRows = activeTab === "categories" ? [] : (moduleData[activeTab] || []);
  const isInventoryItemsTab = storageKey === STOCKS_STORAGE_KEY && activeTab === "items";
  const isTicketingTicketsTab = storageKey === TICKETING_STORAGE_KEY && activeTab === "tickets";
  const sharedTicketingCustomers = useMemo(
    () => isTicketingTicketsTab ? readSharedAccountsCustomers() : [],
    [activeTab]
  );
  const ticketingClientQuery = String(formValues.clientCompany || "").trim().toLowerCase();
  const ticketingClientMatches = useMemo(
    () => isTicketingTicketsTab
      ? (ticketingClientQuery
          ? sharedTicketingCustomers.filter((customer) => {
            const haystack = `${customer.companyName || customer.name || ""} ${customer.clientName || ""} ${customer.email || ""}`.toLowerCase();
            return haystack.includes(ticketingClientQuery);
          }).slice(0, 8)
          : sharedTicketingCustomers.slice(0, 8))
      : [],
    [isTicketingTicketsTab, sharedTicketingCustomers, ticketingClientQuery]
  );
  const inventoryMainCategoryOptions = useMemo(
    () => Array.from(new Set((moduleData.mainCategories || []).map((row) => String(row?.name || "").trim()).filter(Boolean))),
    [moduleData.mainCategories]
  );
  const inventorySubCategoryOptions = useMemo(() => {
    const selectedMain = String(formValues.mainCategory || "").trim().toLowerCase();
    return Array.from(new Set(
      (moduleData.subCategories || [])
        .filter((row) => {
          if (!selectedMain) return true;
          return String(row?.mainCategory || "").trim().toLowerCase() === selectedMain;
        })
        .map((row) => String(row?.name || "").trim())
        .filter(Boolean)
    ));
  }, [formValues.mainCategory, moduleData.subCategories]);
  const ticketingMainCategoryOptions = useMemo(
    () => Array.from(new Set((moduleData.mainCategories || []).map((row) => String(row?.name || "").trim()).filter(Boolean))),
    [moduleData.mainCategories]
  );
  const ticketingSubCategoryOptions = useMemo(() => {
    const selectedMain = String(formValues.mainCategory || "").trim().toLowerCase();
    return Array.from(new Set(
      (moduleData.subCategories || [])
        .filter((row) => {
          if (!selectedMain) return true;
          return String(row?.mainCategory || "").trim().toLowerCase() === selectedMain;
        })
        .map((row) => String(row?.name || "").trim())
        .filter(Boolean)
    ));
  }, [formValues.mainCategory, moduleData.subCategories]);
  const stats = useMemo(() => statsBuilder(moduleData), [moduleData, statsBuilder]);
  const taskAssignToOptions = useMemo(() => {
    if (activeTab !== "tasks") {
      return [];
    }
    const names = [
      ...((moduleData.team || []).map((row) => row?.name)),
      ...((moduleData.tasks || []).map((row) => row?.assignee)),
      ...((moduleData.projects || []).map((row) => row?.owner)),
      ...((DEFAULT_HR_DATA.employees || []).map((row) => row?.name)),
    ]
      .map((value) => String(value || "").trim())
      .filter(Boolean);
    return Array.from(new Set(names)).sort((a, b) => a.localeCompare(b));
  }, [activeTab, moduleData]);

  function onChangeField(fieldKey, nextValue) {
    const fieldMeta = (config.fields || []).find((field) => field.key === fieldKey);
    const normalizedValue = typeof nextValue === "string"
      ? (
        isAmountFieldKey(fieldKey)
          ? sanitizeCurrencyInput(nextValue)
          : clampBusinessAutopilotText(fieldKey, nextValue, { isTextarea: fieldMeta?.type === "textarea" })
      )
      : nextValue;
    setFormValues((prev) => ({ ...prev, [fieldKey]: normalizedValue }));
  }

  function onEditRow(row) {
    setEditingId(row.id);
    const nextValues = {};
    config.fields.forEach((field) => {
      if (isTicketingTicketsTab && (field.key === "mainCategory" || field.key === "subCategory")) {
        const [mainCategory = "", subCategory = ""] = String(row.category || "").split("/").map((v) => String(v || "").trim());
        nextValues.mainCategory = row.mainCategory || mainCategory || "";
        nextValues.subCategory = row.subCategory || subCategory || "";
        return;
      }
      if (isInventoryItemsTab && (field.key === "mainCategory" || field.key === "subCategory")) {
        const [mainCategory = "", subCategory = ""] = String(row.category || "").split("/").map((v) => String(v || "").trim());
        nextValues.mainCategory = row.mainCategory || mainCategory || "";
        nextValues.subCategory = row.subCategory || subCategory || "";
        return;
      }
      nextValues[field.key] = row[field.key] || "";
    });
    setFormValues(nextValues);
  }

  function onCancelEdit() {
    setEditingId("");
    setFormValues(buildEmptyValues(config.fields));
    window.requestAnimationFrame(() => {
      clearFlatpickrDisplayValues(document);
    });
  }

  function onDeleteRow(rowOrId) {
    const targetId = String((typeof rowOrId === "object" && rowOrId !== null ? rowOrId.id : rowOrId) || "").trim();
    const targetName = String((typeof rowOrId === "object" && rowOrId !== null ? rowOrId.name : "") || "").trim().toLowerCase();
    setModuleData((prev) => ({
      ...prev,
      [activeTab]: (prev[activeTab] || []).filter((row) => {
        const rowId = String(row?.id || "").trim();
        const rowName = String(row?.name || "").trim().toLowerCase();
        if (targetId && rowId) {
          return rowId !== targetId;
        }
        if (targetName && rowName) {
          return rowName !== targetName;
        }
        return true;
      })
    }));
    if (targetId && String(editingId || "").trim() === targetId) {
      onCancelEdit();
    }
    if (activeTab === "employees") {
      setHrFormNotice("Employee deleted.");
    }
  }

  function onSubmit(event) {
    event.preventDefault();
    const syncedValuesResult = syncDateTimeFieldValuesFromForm(event.currentTarget, config.fields, formValues);
    const effectiveValues = syncedValuesResult.values;
    if (syncedValuesResult.changed) {
      setFormValues((prev) => ({ ...prev, ...effectiveValues }));
    }
    const missingFields = config.fields.filter((field) => {
      if (field.type === "date") {
        return !normalizeMeetingDateValue(effectiveValues[field.key]);
      }
      if (field.type === "time") {
        return !normalizeMeetingTimeValue(effectiveValues[field.key]);
      }
      return !String(effectiveValues[field.key] || "").trim();
    });
    if (missingFields.length) {
      setCategoryNotice(`Please fill mandatory fields: ${missingFields.map((field) => field.label).join(", ")}`);
      return;
    }
    setCategoryNotice("");
    const payload = {};
    config.fields.forEach((field) => {
      if (field.type === "date") {
        payload[field.key] = normalizeMeetingDateValue(effectiveValues[field.key]);
      } else if (field.type === "time") {
        payload[field.key] = normalizeMeetingTimeValue(effectiveValues[field.key]);
      } else {
        payload[field.key] = String(effectiveValues[field.key]).trim();
      }
    });
    if (isInventoryItemsTab) {
      const mainCategory = String(payload.mainCategory || "").trim();
      const subCategory = String(payload.subCategory || "").trim();
      payload.mainCategory = mainCategory;
      payload.subCategory = subCategory;
      payload.category = [mainCategory, subCategory].filter(Boolean).join(" / ");
    }
    if (isTicketingTicketsTab) {
      const mainCategory = String(payload.mainCategory || "").trim();
      const subCategory = String(payload.subCategory || "").trim();
      payload.mainCategory = mainCategory;
      payload.subCategory = subCategory;
      payload.category = [mainCategory, subCategory].filter(Boolean).join(" / ");
    }
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

  function onCategoryChangeField(tabKey, fieldKey, nextValue) {
    setCategoryForms((prev) => ({
      ...prev,
      [tabKey]: { ...(prev[tabKey] || {}), [fieldKey]: nextValue }
    }));
  }

  function onCategoryEditRow(tabKey, row) {
    const cfg = tabConfig[tabKey];
    if (!cfg) {
      return;
    }
    const nextValues = {};
    cfg.fields.forEach((field) => {
      nextValues[field.key] = row[field.key] || "";
    });
    setCategoryEditingIds((prev) => ({ ...prev, [tabKey]: row.id || "" }));
    setCategoryForms((prev) => ({ ...prev, [tabKey]: nextValues }));
  }

  function onCategoryCancelEdit(tabKey) {
    const cfg = tabConfig[tabKey];
    if (!cfg) {
      return;
    }
    setCategoryEditingIds((prev) => ({ ...prev, [tabKey]: "" }));
    setCategoryForms((prev) => ({ ...prev, [tabKey]: buildEmptyValues(cfg.fields) }));
  }

  function onCategoryDeleteRow(tabKey, rowId) {
    setModuleData((prev) => ({
      ...prev,
      [tabKey]: (prev[tabKey] || []).filter((row) => row.id !== rowId)
    }));
    if (categoryEditingIds[tabKey] === rowId) {
      onCategoryCancelEdit(tabKey);
    }
  }

  function onCategorySubmit(event, tabKey) {
    event.preventDefault();
    const cfg = tabConfig[tabKey];
    if (!cfg) {
      return;
    }
    const values = categoryForms[tabKey] || {};
    const missingFields = cfg.fields.filter((field) => !String(values[field.key] || "").trim());
    if (missingFields.length) {
      setCategoryNotice(`${cfg.label}: Please fill mandatory fields: ${missingFields.map((field) => field.label).join(", ")}`);
      return;
    }
    const payload = {};
    cfg.fields.forEach((field) => {
      payload[field.key] = String(values[field.key] || "").trim();
    });
    const editId = categoryEditingIds[tabKey];
    setModuleData((prev) => {
      const existing = prev[tabKey] || [];
      if (editId) {
        setCategoryNotice("");
        return {
          ...prev,
          [tabKey]: existing.map((row) => (row.id === editId ? { ...row, ...payload } : row))
        };
      }
      if (existing.length >= CATEGORY_ENTRY_LIMIT) {
        setCategoryNotice(`${cfg.label}: Maximum ${CATEGORY_ENTRY_LIMIT} entries are allowed.`);
        return prev;
      }
      setCategoryNotice("");
      return {
        ...prev,
        [tabKey]: [{ id: `${tabKey}_${Date.now()}`, ...payload }, ...existing]
      };
    });
    onCategoryCancelEdit(tabKey);
  }

  return (
    <div className="d-flex flex-column gap-3">
      <div>
        <h4 className="mb-2">{heading}</h4>
        <p className="text-secondary mb-3">{subtitle}</p>
        <div className="d-flex flex-wrap gap-2">
          {visibleTabs.map(({ key: tabKey, label }) => (
            <button
              key={tabKey}
              type="button"
              className={`btn btn-sm ${activeTab === tabKey ? "btn-success" : "btn-outline-light"}`}
              onClick={() => setActiveTab(tabKey)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {activeTab !== "categories" && hasOverviewTab && activeTab === "overview" ? (
        <div className="row g-3">
          {stats.map((item, index) => (
            <div className="col-12 col-md-4" key={item.label}>
              <div className="card p-3 h-100 d-flex flex-column align-items-center justify-content-center text-center">
                <div className="stat-icon stat-icon-primary mb-2">
                  <i className={`bi ${statIcons[index] || "bi-grid"}`} aria-hidden="true" />
                </div>
                <div className="text-secondary small">{item.label}</div>
                <h5 className="mb-0 mt-1">{item.value}</h5>
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {activeTab === "categories" ? (
        <div>
          <h5 className="mb-2">Category</h5>
          <p className="text-secondary small mb-2">
            Maximum 100 entries are allowed for Main Category and Sub Category.
          </p>
          {categoryNotice ? <div className="alert alert-warning py-2 mb-3">{categoryNotice}</div> : null}
          <div className="row g-3">
            {["mainCategories", "subCategories"].map((tabKey) => {
              const cfg = tabConfig[tabKey];
              const rows = moduleData[tabKey] || [];
              const form = categoryForms[tabKey] || {};
              const editId = categoryEditingIds[tabKey];
              return (
                <div className="col-12 col-xl-6" key={`category-panel-${tabKey}`}>
                  <div className="h-100 d-flex flex-column gap-3">
                    <div className="card p-3">
                      <h6 className="mb-3">{editId ? `Edit ${cfg.itemLabel}` : `Create ${cfg.itemLabel}`}</h6>
                      <form className="d-flex flex-column gap-3" onSubmit={(event) => onCategorySubmit(event, tabKey)}>
                        <div className="row g-3">
                          {cfg.fields.map((field) => (
                            <div className="col-12 col-xl-4" key={`${tabKey}-${field.key}`}>
                              <label className="form-label small text-secondary mb-1">{field.label}</label>
                              {storageKey === STOCKS_STORAGE_KEY && tabKey === "subCategories" && field.key === "mainCategory" ? (
                                <select
                                  className="form-select"
                                  value={form[field.key] || ""}
                                  onChange={(event) => onCategoryChangeField(tabKey, field.key, event.target.value)}
                                >
                                  <option value="">Select Main Category</option>
                                  {inventoryMainCategoryOptions.map((name) => (
                                    <option key={`stock-sub-main-${name}`} value={name}>
                                      {name}
                                    </option>
                                  ))}
                                </select>
                              ) : (
                                <input
                                  type={field.type || "text"}
                                  className="form-control"
                                  placeholder={field.placeholder}
                                  value={form[field.key] || ""}
                                  onChange={(event) => onCategoryChangeField(tabKey, field.key, event.target.value)}
                                />
                              )}
                            </div>
                          ))}
                        </div>
                        <div className="d-flex gap-2">
                          <button type="submit" className="btn btn-success btn-sm single-row-form-submit-btn">
                            {editId ? "Update" : "Create"}
                          </button>
                          {editId ? (
                            <button
                              type="button"
                              className="btn btn-outline-light btn-sm single-row-form-submit-btn"
                              onClick={() => onCategoryCancelEdit(tabKey)}
                            >
                              Cancel
                            </button>
                          ) : null}
                        </div>
                      </form>
                    </div>

                    <SearchablePaginatedTableCard
                      title={`${cfg.label} List`}
                      badgeLabel={`${rows.length} items`}
                      rows={rows}
                      columns={cfg.columns}
                      withoutOuterCard
                      pageSize={5}
                      searchPlaceholder={`Search ${cfg.label.toLowerCase()}`}
                      noRowsText={`No ${cfg.label.toLowerCase()} added yet.`}
                      searchBy={(row) => cfg.columns.map((column) => row[column.key] || "").join(" ")}
                      renderCells={(row) => cfg.columns.map((column) => formatDateLikeCellValue(column.key, row[column.key], "-"))}
                      renderActions={(row) => (
                        <div className="d-inline-flex gap-2">
                          <button type="button" className="btn btn-sm btn-outline-info" onClick={() => onCategoryEditRow(tabKey, row)}>
                            Edit
                          </button>
                          <button type="button" className="btn btn-sm btn-outline-danger" onClick={() => onCategoryDeleteRow(tabKey, row.id)}>
                            Delete
                          </button>
                        </div>
                      )}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      {activeTab !== "categories" && activeTab !== "tickets" && !isInventoryItemsTab ? (
        <SearchablePaginatedTableCard
          title={`${config.label} List`}
          badgeLabel={`${currentRows.length} items`}
          rows={currentRows}
          columns={config.columns}
          withoutOuterCard={activeTab === "mainCategories" || activeTab === "items"}
          searchPlaceholder={`Search ${config.label.toLowerCase()}`}
          noRowsText={`No ${config.label.toLowerCase()} added yet.`}
          searchBy={(row) => config.columns.map((column) => row[column.key] || "").join(" ")}
          renderCells={(row) => config.columns.map((column) => {
            if (isInventoryItemsTab && column.key === "mainCategory") {
              const [mainCategory = ""] = String(row.category || "").split("/").map((v) => String(v || "").trim());
              return row.mainCategory || mainCategory || "-";
            }
            if (isInventoryItemsTab && column.key === "subCategory") {
              const [, subCategory = ""] = String(row.category || "").split("/").map((v) => String(v || "").trim());
              return row.subCategory || subCategory || "-";
            }
            return formatDateLikeCellValue(column.key, row[column.key], "-");
          })}
          renderActions={(row) => (
            <div className="d-inline-flex gap-2">
              <button type="button" className="btn btn-sm btn-outline-info" onClick={() => onEditRow(row)}>
                Edit
              </button>
              <button type="button" className="btn btn-sm btn-outline-danger" onClick={() => onDeleteRow(row)}>
                Delete
              </button>
            </div>
          )}
        />
      ) : null}

      {activeTab !== "categories" ? (
      <div className="card p-3">
        <h6 className="mb-3">{editingId ? `Edit ${config.itemLabel}` : `Create ${config.itemLabel}`}</h6>
        <form className="d-flex flex-column gap-3" onSubmit={onSubmit}>
          <div className="row g-3">
            {config.fields.map((field) => (
              <div
                className={
                  isInventoryItemsTab
                    ? ({
                        itemName: "col-12 col-md-6 col-xl-2",
                        sku: "col-12 col-md-6 col-xl-2",
                        mainCategory: "col-12 col-md-6 col-xl-3",
                        subCategory: "col-12 col-md-6 col-xl-3",
                        qty: "col-12 col-md-3 col-xl-1",
                      }[field.key] || "col-12 col-md-6 col-xl-2")
                  : isTicketingTicketsTab
                    ? ({
                        ticketNo: "col-12 col-md-6 col-xl-1",
                        subject: "col-12 col-md-6 col-xl-3",
                        mainCategory: "col-12 col-md-6 col-xl-2",
                        subCategory: "col-12 col-md-6 col-xl-2",
                        status: "col-12 col-md-6 col-xl-1",
                        description: "col-12",
                      }[field.key] || "col-12 col-md-6 col-xl-3")
                    : "col-12 col-md-6 col-xl-3"
                }
                key={field.key}
              >
                <label className="form-label small text-secondary mb-1">{field.label}</label>
                {field.key === "department" && departmentOptions.length ? (
                  <select
                    className="form-select"
                    value={formValues[field.key] || ""}
                    onChange={(event) => onChangeField(field.key, event.target.value)}
                  >
                    <option value="">Select Department</option>
                    {departmentOptions.map((name) => (
                      <option key={name} value={name}>
                        {name}
                      </option>
                    ))}
                    {formValues[field.key] && !departmentOptions.includes(formValues[field.key]) ? (
                      <option value={formValues[field.key]}>{formValues[field.key]}</option>
                    ) : null}
                  </select>
                ) : isTicketingTicketsTab && field.key === "mainCategory" ? (
                  <select
                    className="form-select"
                    value={formValues[field.key] || ""}
                    onChange={(event) => {
                      onChangeField(field.key, event.target.value);
                      setFormValues((prev) => ({ ...prev, subCategory: "" }));
                    }}
                  >
                    <option value="">Select Category</option>
                    {ticketingMainCategoryOptions.map((name) => (
                      <option key={`ticket-main-${name}`} value={name}>
                        {name}
                      </option>
                    ))}
                  </select>
                ) : isTicketingTicketsTab && field.key === "clientCompany" ? (
                  <div className="crm-inline-suggestions-wrap">
                    <input
                      type="text"
                      className="form-control"
                      autoComplete="off"
                      placeholder={field.placeholder}
                      value={formValues[field.key] || ""}
                      maxLength={getBusinessAutopilotMaxLength(field.key)}
                      onFocus={() => setTicketingClientSearchOpen(true)}
                          onClick={() => setTicketingClientSearchOpen(true)}
                      onBlur={() => window.setTimeout(() => setTicketingClientSearchOpen(false), 120)}
                      onChange={(event) => {
                        onChangeField(field.key, event.target.value);
                        setTicketingClientSearchOpen(true);
                      }}
                    />
                    {ticketingClientSearchOpen ? (
                      ticketingClientMatches.length ? (
                        <div className="crm-inline-suggestions">
                          <div className="crm-inline-suggestions__group">
                            <div className="crm-inline-suggestions__title">Clients</div>
                            {ticketingClientMatches.map((customer) => {
                              const label = getSharedCustomerDisplayName(customer);
                              const value = String(customer.companyName || customer.clientName || customer.name || "").trim();
                              return (
                                <button
                                  key={`ticketing-client-${customer.id || `${label}-${value}`}`}
                                  type="button"
                                  className="crm-inline-suggestions__item"
                                  onMouseDown={(event) => event.preventDefault()}
                                  onClick={() => {
                                    onChangeField(field.key, String(label || value).trim());
                                    setTicketingClientSearchOpen(false);
                                  }}
                                >
                                  <span className="crm-inline-suggestions__item-main">{label || value || "-"}</span>
                                  <span className="crm-inline-suggestions__item-sub">{value || label || "-"}</span>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      ) : (
                        <div className="crm-inline-suggestions">
                          <div className="crm-inline-suggestions__item">
                            <span className="crm-inline-suggestions__item-main">No clients found</span>
                          </div>
                        </div>
                      )
                    ) : null}
                  </div>
                ) : isTicketingTicketsTab && field.key === "subCategory" ? (
                  <select
                    className="form-select"
                    value={formValues[field.key] || ""}
                    onChange={(event) => onChangeField(field.key, event.target.value)}
                  >
                    <option value="">Select Sub Category</option>
                    {ticketingSubCategoryOptions.map((name) => (
                      <option key={`ticket-sub-${name}`} value={name}>
                        {name}
                      </option>
                    ))}
                  </select>
                ) : isTicketingTicketsTab && field.key === "status" ? (
                  <select
                    className="form-select"
                    value={formValues[field.key] || ""}
                    onChange={(event) => onChangeField(field.key, event.target.value)}
                  >
                    <option value="">Select Status</option>
                    {["Open", "Process", "Hold", "Closed"].map((statusOption) => (
                      <option key={`ticket-status-${statusOption}`} value={statusOption}>
                        {statusOption}
                      </option>
                    ))}
                  </select>
                ) : field.type === "textarea" ? (
                  <textarea
                    className="form-control"
                    rows={3}
                    placeholder={field.placeholder}
                    value={formValues[field.key] || ""}
                    maxLength={getBusinessAutopilotMaxLength(field.key, { isTextarea: true })}
                    onChange={(event) => onChangeField(field.key, event.target.value)}
                  />
                ) : (activeTab === "tasks" && field.key === "assignee") ? (
                  <>
                    <input
                      type="text"
                      className="form-control"
                      list="project-task-assign-to-list"
                      placeholder={field.placeholder}
                      value={formValues[field.key] || ""}
                      maxLength={getBusinessAutopilotMaxLength(field.key)}
                      onChange={(event) => onChangeField(field.key, event.target.value)}
                    />
                    <datalist id="project-task-assign-to-list">
                      {taskAssignToOptions.map((name) => (
                        <option key={`task-assign-${name}`} value={name} />
                      ))}
                    </datalist>
                  </>
                ) : isInventoryItemsTab && field.key === "mainCategory" ? (
                  <>
                    <input
                      type="text"
                      className="form-control datalist-readable-input inventory-category-datalist"
                      list="inventory-main-category-list"
                      placeholder={field.placeholder}
                      value={formValues[field.key] || ""}
                      maxLength={getBusinessAutopilotMaxLength(field.key)}
                      onChange={(event) => {
                        onChangeField(field.key, event.target.value);
                        setFormValues((prev) => ({ ...prev, subCategory: "" }));
                      }}
                    />
                    <datalist id="inventory-main-category-list">
                      {inventoryMainCategoryOptions.map((name) => (
                        <option key={`inventory-main-${name}`} value={name} />
                      ))}
                    </datalist>
                  </>
                ) : isInventoryItemsTab && field.key === "subCategory" ? (
                  <>
                    <input
                      type="text"
                      className="form-control datalist-readable-input inventory-category-datalist"
                      list="inventory-sub-category-list"
                      placeholder={field.placeholder}
                      value={formValues[field.key] || ""}
                      maxLength={getBusinessAutopilotMaxLength(field.key)}
                      onChange={(event) => onChangeField(field.key, event.target.value)}
                    />
                    <datalist id="inventory-sub-category-list">
                      {inventorySubCategoryOptions.map((name) => (
                        <option key={`inventory-sub-${name}`} value={name} />
                      ))}
                    </datalist>
                  </>
                ) : (
                  <input
                    type={field.type || "text"}
                    className="form-control"
                    placeholder={field.placeholder}
                    value={formValues[field.key] || ""}
                    maxLength={["time", "date", "number", "file"].includes(field.type) ? undefined : getBusinessAutopilotMaxLength(field.key)}
                    onChange={(event) => onChangeField(field.key, event.target.value)}
                  />
                )}
              </div>
            ))}
            {isInventoryItemsTab ? (
              <div className="col-12 col-md-9 col-xl-1 d-flex align-items-end">
                <div className="d-flex gap-2 w-100 flex-xl-column">
                  <button type="submit" className="btn btn-success btn-sm w-100 single-row-form-submit-btn">
                    {editingId ? "Update" : "Create"}
                  </button>
                  {editingId ? (
                    <button
                      type="button"
                      className="btn btn-outline-light btn-sm w-100 single-row-form-submit-btn"
                      onClick={onCancelEdit}
                    >
                      Cancel
                    </button>
                  ) : null}
                </div>
              </div>
            ) : null}
          </div>
          {!isInventoryItemsTab ? <div className="d-flex gap-2">
            <button type="submit" className="btn btn-success btn-sm">
              {editingId ? "Update" : "Create"}
            </button>
            {editingId ? (
              <button type="button" className="btn btn-outline-light btn-sm" onClick={onCancelEdit}>
                Cancel
              </button>
            ) : null}
          </div> : null}
        </form>
      </div>
      ) : null}

      {isInventoryItemsTab ? (
        <SearchablePaginatedTableCard
          title={`${config.label} List`}
          badgeLabel={`${currentRows.length} items`}
          rows={currentRows}
          columns={config.columns}
          withoutOuterCard
          searchPlaceholder={`Search ${config.label.toLowerCase()}`}
          noRowsText={`No ${config.label.toLowerCase()} added yet.`}
          searchBy={(row) => config.columns.map((column) => row[column.key] || "").join(" ")}
          renderCells={(row) => config.columns.map((column) => {
            if (column.key === "mainCategory") {
              const [mainCategory = ""] = String(row.category || "").split("/").map((v) => String(v || "").trim());
              return row.mainCategory || mainCategory || "-";
            }
            if (column.key === "subCategory") {
              const [, subCategory = ""] = String(row.category || "").split("/").map((v) => String(v || "").trim());
              return row.subCategory || subCategory || "-";
            }
            return formatDateLikeCellValue(column.key, row[column.key], "-");
          })}
          renderActions={(row) => (
            <div className="d-inline-flex gap-2">
              <button type="button" className="btn btn-sm btn-outline-info" onClick={() => onEditRow(row)}>
                Edit
              </button>
              <button type="button" className="btn btn-sm btn-outline-danger" onClick={() => onDeleteRow(row.id)}>
                Delete
              </button>
            </div>
          )}
        />
      ) : null}

      {activeTab === "tickets" ? (
        <SearchablePaginatedTableCard
          title={`${config.label} List`}
          badgeLabel={`${currentRows.length} items`}
          rows={currentRows}
          columns={config.columns}
          withoutOuterCard
          pageSize={15}
          searchPlaceholder={`Search ${config.label.toLowerCase()}`}
          noRowsText={`No ${config.label.toLowerCase()} added yet.`}
          searchBy={(row) => config.columns.map((column) => row[column.key] || "").join(" ")}
          renderCells={(row) => config.columns.map((column) => formatDateLikeCellValue(column.key, row[column.key], "-"))}
          renderActions={(row) => (
            <div className="d-inline-flex gap-2">
              <button type="button" className="btn btn-sm btn-outline-info" onClick={() => onEditRow(row)}>
                Edit
              </button>
              <button type="button" className="btn btn-sm btn-outline-danger" onClick={() => onDeleteRow(row.id)}>
                Delete
              </button>
            </div>
          )}
        />
      ) : null}
    </div>
  );
}

function TicketingSystemModule() {
  const statsBuilder = useMemo(() => (data) => {
    const openTickets = (data.tickets || []).filter((row) => String(row.status || "").toLowerCase() !== "closed").length;
    const pendingToday = (data.tickets || []).filter((row) => String(row.status || "").toLowerCase().includes("progress") || String(row.status || "").toLowerCase() === "open").length;
    const categoryCount = (data.mainCategories || []).length + (data.subCategories || []).length;
    return [
      { label: "Open Tickets", value: String(openTickets) },
      { label: "Pending Today", value: String(pendingToday) },
      { label: "Categories", value: String(categoryCount) }
    ];
  }, []);

  return (
    <CategoryCrudModule
      heading="Ticketing System"
      subtitle="Create main/sub categories and manage tickets with create, edit, and delete actions."
      tabConfig={TICKETING_TAB_CONFIG}
      defaultData={DEFAULT_TICKETING_DATA}
      storageKey={TICKETING_STORAGE_KEY}
      statsBuilder={statsBuilder}
      statIcons={["bi-life-preserver", "bi-hourglass-split", "bi-tags"]}
      defaultActiveTab="tickets"
    />
  );
}

function StocksManagementModule() {
  const statsBuilder = useMemo(() => (data) => {
    const itemCount = (data.items || []).length;
    const lowStockAlerts = (data.items || []).filter((row) => Number(row.qty || 0) > 0 && Number(row.qty || 0) <= 5).length;
    const categoryCount = (data.mainCategories || []).length + (data.subCategories || []).length;
    return [
      { label: "Inventory Items", value: String(itemCount) },
      { label: "Low Stock Alerts", value: String(lowStockAlerts) },
      { label: "Categories", value: String(categoryCount) }
    ];
  }, []);

  return (
    <CategoryCrudModule
      heading="Inventory"
      subtitle="Create main/sub categories and manage inventory items with create, edit, and delete actions."
      tabConfig={STOCKS_TAB_CONFIG}
      defaultData={DEFAULT_STOCKS_DATA}
      storageKey={STOCKS_STORAGE_KEY}
      statsBuilder={statsBuilder}
      statIcons={["bi-box-seam", "bi-exclamation-triangle", "bi-diagram-3"]}
    />
  );
}

function AccountsErpModule({ initialTab = "overview", subscriptionsOnly = false, headingTitle = "Accounts" }) {
  const [activeTab, setActiveTab] = useState(subscriptionsOnly ? "subscriptions" : (initialTab || "overview"));
  const [overviewDocTab, setOverviewDocTab] = useState("invoice");
  const [moduleData, setModuleData] = useState(DEFAULT_ACCOUNTS_DATA);
  const [orgBillingCountry, setOrgBillingCountry] = useState("India");
  const [isAccountsLoading, setIsAccountsLoading] = useState(true);
  const [accountsSyncStatus, setAccountsSyncStatus] = useState("Loading...");
  const [accountsSyncError, setAccountsSyncError] = useState("");
  const hasLoadedWorkspaceRef = useRef(false);
  const syncTimerRef = useRef(null);
  const [gstForm, setGstForm] = useState({
    id: "",
    name: "",
    taxScope: "Intra State",
    cgst: "",
    sgst: "",
    igst: "",
    cess: "",
    status: "Active",
    notes: ""
  });
  const [editingGstId, setEditingGstId] = useState("");
  const [templateForm, setTemplateForm] = useState({
    id: "",
    name: "",
    docType: "Invoice",
    gstTemplateId: "",
    prefix: "",
    invStartFrom: "",
    themeColor: "#22c55e",
    companyLogoDataUrl: "",
    companyLogoName: "",
    footerNote: "Thank you for your business.",
    termsText: "Payment due within 7 days. Please contact your org admin for support.",
    status: "Active"
  });
  const [editingTemplateId, setEditingTemplateId] = useState("");
  const [estimateForm, setEstimateForm] = useState(createEmptyBillingDocument("estimate"));
  const [invoiceForm, setInvoiceForm] = useState(createEmptyBillingDocument("invoice"));
  const [editingEstimateId, setEditingEstimateId] = useState("");
  const [editingInvoiceId, setEditingInvoiceId] = useState("");
  const [customerForm, setCustomerForm] = useState({
    id: "",
    companyName: "",
    clientName: "",
    name: "",
    gstin: "",
    phoneCountryCode: "+91",
    phone: "",
    additionalPhones: [],
    email: "",
    additionalEmails: [],
    billingAddress: "",
    shippingAddress: "",
    billingCountry: "India",
    billingState: "",
    billingPincode: "",
    shippingCountry: "India",
    shippingState: "",
    shippingPincode: "",
    billingShippingSame: false
  });
  const [editingCustomerId, setEditingCustomerId] = useState("");
  const [itemMasterForm, setItemMasterForm] = useState({
    id: "",
    name: "",
    itemType: "Product",
    sku: "",
    hsnSacCode: "",
    unit: "Nos",
    defaultRate: "",
    taxPercent: ""
  });
  const [editingItemMasterId, setEditingItemMasterId] = useState("");
  const [itemMasterListTypeFilter, setItemMasterListTypeFilter] = useState("Product");
  const [erpUsersForSales, setErpUsersForSales] = useState([]);
  const [inventoryWorkspace, setInventoryWorkspace] = useState(() => {
    try {
      const raw = window.localStorage.getItem(STOCKS_STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : null;
      return parsed && typeof parsed === "object" ? parsed : DEFAULT_STOCKS_DATA;
    } catch {
      return DEFAULT_STOCKS_DATA;
    }
  });
  const [orgBillingCurrency, setOrgBillingCurrency] = useState(() => getOrgCurrency());
  const [subscriptionCategories, setSubscriptionCategories] = useState([]);
  const [subscriptionSubCategories, setSubscriptionSubCategories] = useState([]);
  const [subscriptionCustomers, setSubscriptionCustomers] = useState([]);
  const [subscriptionList, setSubscriptionList] = useState([]);
  const [subscriptionCategoryForm, setSubscriptionCategoryForm] = useState(createEmptySubscriptionCategory());
  const [subscriptionSubCategoryForm, setSubscriptionSubCategoryForm] = useState(createEmptySubscriptionSubCategory());
  const [subscriptionForm, setSubscriptionForm] = useState(createEmptySubscriptionForm({ currency: orgBillingCurrency }));
  const [editingSubscriptionCategoryId, setEditingSubscriptionCategoryId] = useState("");
  const [editingSubscriptionSubCategoryId, setEditingSubscriptionSubCategoryId] = useState("");
  const [editingSubscriptionId, setEditingSubscriptionId] = useState("");
  const [subscriptionView, setSubscriptionView] = useState(null);
  const [subscriptionLoading, setSubscriptionLoading] = useState(false);
  const [subscriptionStatusTab, setSubscriptionStatusTab] = useState("all");
  const [subscriptionTopTab, setSubscriptionTopTab] = useState("subscriptions");
  const [subscriptionClientSearchOpen, setSubscriptionClientSearchOpen] = useState(false);
  const [subscriptionEmailAlertSearch, setSubscriptionEmailAlertSearch] = useState("");
  const [subscriptionEmailAlertSearchOpen, setSubscriptionEmailAlertSearchOpen] = useState(false);
  const [subscriptionWhatsappAlertSearch, setSubscriptionWhatsappAlertSearch] = useState("");
  const [subscriptionWhatsappAlertSearchOpen, setSubscriptionWhatsappAlertSearchOpen] = useState(false);
  const [subscriptionAssignSearch, setSubscriptionAssignSearch] = useState("");
  const [subscriptionAssignSearchOpen, setSubscriptionAssignSearchOpen] = useState(false);
  const [accountsFormNotice, setAccountsFormNotice] = useState("");
  const taxUi = useMemo(() => getAccountsTaxUiConfig(orgBillingCountry), [orgBillingCountry]);
  const isIndiaBillingOrg = useMemo(() => normalizeCountryName(orgBillingCountry) === "india", [orgBillingCountry]);
  const isValidAccountsTab = new Set([
    "overview",
    "invoices",
    "estimates",
    "gst",
    "templates",
    "items",
    "customers",
    "subscriptions"
  ]);

  const accountTabs = subscriptionsOnly
    ? [{ key: "subscriptions", label: "Subscriptions" }]
    : [
        { key: "overview", label: "Overview" },
        { key: "invoices", label: "Invoices" },
        { key: "estimates", label: "Estimates" },
        { key: "gst", label: taxUi.templatesLabel },
        { key: "templates", label: "Billing Templates" },
        { key: "items", label: "Items" },
        { key: "customers", label: "Clients" },
      ];

  useEffect(() => {
    const nextTab = subscriptionsOnly
      ? "subscriptions"
      : (
          isValidAccountsTab.has(String(initialTab || "overview").trim().toLowerCase())
            ? String(initialTab || "overview").trim().toLowerCase()
            : "overview"
        );
    if (nextTab !== activeTab) {
      setActiveTab(nextTab);
    }
  }, [initialTab, subscriptionsOnly]);

  useEffect(() => {
    setAccountsFormNotice("");
  }, [activeTab]);

  useEffect(() => {
    let active = true;
    (async () => {
      setIsAccountsLoading(true);
      setAccountsSyncError("");
      try {
        const res = await apiFetch("/api/business-autopilot/accounts/workspace");
        if (!active) {
          return;
        }
        const backendData = res?.data;
        if (isValidAccountsData(backendData)) {
          setModuleData(backendData);
          window.localStorage.setItem(ACCOUNTS_STORAGE_KEY, JSON.stringify(backendData));
          setAccountsSyncStatus("Synced from server");
        } else {
          try {
            const raw = window.localStorage.getItem(ACCOUNTS_STORAGE_KEY);
            if (raw) {
              const parsed = JSON.parse(raw);
              if (isValidAccountsData(parsed)) {
                setModuleData(parsed);
                setAccountsSyncStatus("Loaded local cache");
              }
            }
          } catch (_error) {
            // ignore cache parse error
          }
        }
      } catch (error) {
        if (!active) {
          return;
        }
        try {
          const raw = window.localStorage.getItem(ACCOUNTS_STORAGE_KEY);
          if (raw) {
            const parsed = JSON.parse(raw);
            if (isValidAccountsData(parsed)) {
              setModuleData(parsed);
              setAccountsSyncStatus("Loaded local cache");
            }
          }
        } catch (_error) {
          // ignore cache parse error
        }
        setAccountsSyncError(error?.message || "Unable to sync accounts workspace.");
      } finally {
        if (active) {
          hasLoadedWorkspaceRef.current = true;
          setIsAccountsLoading(false);
        }
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    function syncInventoryFromStorage() {
      try {
        const raw = window.localStorage.getItem(STOCKS_STORAGE_KEY);
        if (!raw) return;
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === "object") {
          setInventoryWorkspace(parsed);
        }
      } catch {
        // ignore invalid local cache
      }
    }
    window.addEventListener("storage", syncInventoryFromStorage);
    return () => window.removeEventListener("storage", syncInventoryFromStorage);
  }, []);

  useEffect(() => {
    if (editingGstId) return;
    setGstForm((prev) => {
      const isPristine = !String(prev.id || "").trim()
        && !String(prev.name || "").trim()
        && !String(prev.cgst || "").trim()
        && !String(prev.sgst || "").trim()
        && !String(prev.igst || "").trim()
        && !String(prev.cess || "").trim()
        && !String(prev.notes || "").trim();
      if (!isPristine) return prev;
      if (String(prev.taxScope || "") === String(taxUi.defaultScope || "")) return prev;
      return { ...prev, taxScope: taxUi.defaultScope };
    });
  }, [editingGstId, taxUi.defaultScope]);

  async function refreshSubscriptionData() {
    try {
      setSubscriptionLoading(true);
      const [categoryResponse, subCategoryResponse, subscriptionResponse] = await Promise.all([
        apiFetch("/api/business-autopilot/accounts/subscription-categories"),
        apiFetch("/api/business-autopilot/accounts/sub-categories"),
        apiFetch("/api/business-autopilot/accounts/subscriptions")
      ]);
      const categories = Array.isArray(categoryResponse?.categories) ? categoryResponse.categories : [];
      const subCategories = Array.isArray(subCategoryResponse?.subCategories) ? subCategoryResponse.subCategories : [];
      const subscriptionRows = Array.isArray(subscriptionResponse?.subscriptions) ? subscriptionResponse.subscriptions : [];
      const subscriptionCustomerRows = Array.isArray(subscriptionResponse?.customerOptions)
        ? subscriptionResponse.customerOptions
        : [];
      setSubscriptionCategories(categories);
      setSubscriptionSubCategories(subCategories);
      setSubscriptionList(subscriptionRows);
      setSubscriptionCustomers(subscriptionCustomerRows);
    } catch (_error) {
      // keep local state empty and do not block UI for empty/default response
    } finally {
      setSubscriptionLoading(false);
    }
  }

  useEffect(() => {
    (async () => {
      try {
        await refreshSubscriptionData();
      } catch (_error) {
        // keep UI resilient when backend returns no subscription rows yet
      }
    })();
    return () => {
    };
  }, []);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const data = await apiFetch("/api/dashboard/billing-profile");
        if (!active) return;
        const country = String(data?.profile?.country || "").trim();
        const currency = String(data?.profile?.currency || "").trim();
        if (country) {
          setOrgBillingCountry(country);
        }
        if (currency) {
          const nextCurrency = applyOrgCurrency(currency);
          setOrgBillingCurrency(nextCurrency);
          setSubscriptionForm((prev) => (!editingSubscriptionId && !String(prev.id || "").trim() ? { ...prev, currency: nextCurrency } : prev));
        }
      } catch {
        // keep default India when billing profile is unavailable
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    window.localStorage.setItem(ACCOUNTS_STORAGE_KEY, JSON.stringify(moduleData));
    if (!hasLoadedWorkspaceRef.current) {
      return;
    }
    if (syncTimerRef.current) {
      window.clearTimeout(syncTimerRef.current);
    }
    setAccountsSyncStatus("Saving...");
    syncTimerRef.current = window.setTimeout(async () => {
      try {
        await apiFetch("/api/business-autopilot/accounts/workspace", {
          method: "PUT",
          body: JSON.stringify({ data: moduleData })
        });
        setAccountsSyncError("");
        setAccountsSyncStatus("Saved to server");
      } catch (error) {
        setAccountsSyncError(error?.message || "Server save failed");
        setAccountsSyncStatus("Save failed");
      }
    }, 450);
    return () => {
      if (syncTimerRef.current) {
        window.clearTimeout(syncTimerRef.current);
      }
    };
  }, [moduleData]);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const data = await apiFetch("/api/business-autopilot/users");
        if (!active) return;
        setErpUsersForSales(Array.isArray(data?.users) ? data.users : []);
      } catch {
        if (active) setErpUsersForSales([]);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const activeGstTemplates = useMemo(
    () => (moduleData.gstTemplates || []).filter((row) => String(row.status || "").toLowerCase() === "active"),
    [moduleData.gstTemplates]
  );

  const overviewStats = useMemo(() => {
    const invoices = moduleData.invoices || [];
    const estimates = moduleData.estimates || [];
    const gstTemplates = moduleData.gstTemplates || [];
    const receivables = invoices
      .filter((row) => !["paid", "cancelled"].includes(String(row.status || "").toLowerCase()))
      .reduce((sum, row) => sum + computeDocumentTotals(row, gstTemplates).grandTotal, 0);
    return [
      { label: "Invoices", value: String(invoices.length), icon: "bi-receipt-cutoff" },
      { label: "Estimates", value: String(estimates.length), icon: "bi-file-earmark-text" },
      { label: "Receivables", value: formatInr(receivables), icon: "bi-cash-coin" },
      { label: taxUi.templatesLabel, value: String(gstTemplates.length), icon: "bi-file-earmark-ruled" }
    ];
  }, [moduleData, taxUi.templatesLabel]);

  const customerOptions = moduleData.customers || [];
  const itemMasterOptions = moduleData.itemMasters || [];
  const filteredItemMasterRows = useMemo(
    () => (moduleData.itemMasters || []).filter((row) => {
      const type = String(row?.itemType || "Product");
      return type === itemMasterListTypeFilter;
    }),
    [moduleData.itemMasters, itemMasterListTypeFilter]
  );
  const inventoryItems = useMemo(() => Array.isArray(inventoryWorkspace?.items) ? inventoryWorkspace.items : [], [inventoryWorkspace]);
  const inventoryItemLookup = useMemo(
    () => new Map(inventoryItems.map((row) => [String(row.id || ""), row])),
    [inventoryItems]
  );
  const billingStateOptions = getStateOptionsForCountry(String(customerForm.billingCountry || "India"));
  const shippingStateOptions = getStateOptionsForCountry(String(customerForm.shippingCountry || "India"));
  const subscriptionCustomerOptions = useMemo(
    () => {
      if (subscriptionCustomers.length) {
        return subscriptionCustomers;
      }
      return (moduleData.customers || []).map((row) => ({
        id: String(row.id || ""),
        name: String(row.companyName || row.name || row.clientName || "").trim()
      })).filter((row) => row.id && row.name);
    },
    [moduleData.customers, subscriptionCustomers]
  );
  const getCategoryName = (categoryId) => {
    const normalizedCategoryId = String(categoryId || "").trim();
    if (!normalizedCategoryId) {
      return "";
    }
    const match = (subscriptionCategories || []).find((row) => String(row?.id || "").trim() === normalizedCategoryId);
    return match ? String(match.name || "").trim() : "";
  };
  const subscriptionSubCategoryOptions = useMemo(
    () => {
      const categoryId = String(subscriptionForm.categoryId || "").trim();
      if (!categoryId) {
        return subscriptionSubCategories;
      }
      return subscriptionSubCategories.filter((row) => String(row?.categoryId || "").trim() === categoryId);
    },
    [subscriptionForm.categoryId, subscriptionSubCategories]
  );
  const subscriptionCustomerSelectOptions = useMemo(
    () => subscriptionCustomerOptions
      .map((row) => {
        const customerId = String(row?.id || "").trim();
        const customerName = String(row?.name || "").trim();
        if (!customerId || !customerName) {
          return null;
        }
        return { id: customerId, name: customerName };
      })
      .filter(Boolean),
    [subscriptionCustomerOptions]
  );
  const normalizedSubscriptionClientSearch = String(subscriptionForm.customerName || "").trim().toLowerCase();
  const filteredSubscriptionCustomerSelectOptions = useMemo(
    () => {
      if (!normalizedSubscriptionClientSearch) {
        return subscriptionCustomerSelectOptions;
      }
      return subscriptionCustomerSelectOptions.filter((row) =>
        String(row.name || "").toLowerCase().includes(normalizedSubscriptionClientSearch)
      );
    },
    [normalizedSubscriptionClientSearch, subscriptionCustomerSelectOptions]
  );
  const subscriptionAlertDepartmentOptions = useMemo(
    () => Array.from(new Set((erpUsersForSales || []).map((row) => String(row?.department || "").trim()).filter(Boolean)))
      .map((name) => ({ type: "department", value: name, label: name }))
      .sort((a, b) => a.label.localeCompare(b.label)),
    [erpUsersForSales]
  );
  const subscriptionAlertUserOptions = useMemo(
    () => (erpUsersForSales || [])
      .filter((row) => Boolean(String(row?.name || "").trim()))
      .map((row) => ({
        type: "user",
        value: String(row?.id || "").trim(),
        label: String(row?.name || "").trim(),
        email: String(row?.email || "").trim(),
        department: String(row?.department || "").trim()
      }))
      .filter((row) => Boolean(row.value))
      .sort((a, b) => a.label.localeCompare(b.label)),
    [erpUsersForSales]
  );
  const normalizedSubscriptionAssignSearch = normalizeSubscriptionAlertAssigneeSearch(subscriptionAssignSearch);
  const filteredSubscriptionAssignDepartmentOptions = useMemo(() => {
    if (!normalizedSubscriptionAssignSearch) {
      return subscriptionAlertDepartmentOptions;
    }
    return subscriptionAlertDepartmentOptions.filter((option) => option.label.toLowerCase().includes(normalizedSubscriptionAssignSearch));
  }, [normalizedSubscriptionAssignSearch, subscriptionAlertDepartmentOptions]);
  const filteredSubscriptionAssignUserOptions = useMemo(() => {
    if (!normalizedSubscriptionAssignSearch) {
      return subscriptionAlertUserOptions;
    }
    return subscriptionAlertUserOptions.filter((option) =>
      `${option.label} ${option.email} ${option.department}`.toLowerCase().includes(normalizedSubscriptionAssignSearch)
    );
  }, [normalizedSubscriptionAssignSearch, subscriptionAlertUserOptions]);
  const subscriptionCustomerNameById = useMemo(() => {
    const map = new Map();
    subscriptionCustomerSelectOptions.forEach((row) => {
      map.set(String(row.id || ""), String(row.name || ""));
    });
    return map;
  }, [subscriptionCustomerSelectOptions]);
  const normalizedSubscriptionEmailAlertSearch = String(subscriptionEmailAlertSearch || "").trim().toLowerCase();
  const normalizedSubscriptionWhatsappAlertSearch = String(subscriptionWhatsappAlertSearch || "").trim().toLowerCase();
  const filteredSubscriptionEmailAlertOptions = useMemo(
    () => SUBSCRIPTION_ALERT_OPTIONS
      .filter((option) => String(option.value || "").trim())
      .filter((option) => {
        if (!normalizedSubscriptionEmailAlertSearch) {
          return true;
        }
        return option.label.toLowerCase().includes(normalizedSubscriptionEmailAlertSearch);
      }),
    [normalizedSubscriptionEmailAlertSearch]
  );
  const filteredSubscriptionWhatsappAlertOptions = useMemo(
    () => SUBSCRIPTION_ALERT_OPTIONS
      .filter((option) => String(option.value || "").trim())
      .filter((option) => {
        if (!normalizedSubscriptionWhatsappAlertSearch) {
          return true;
        }
        return option.label.toLowerCase().includes(normalizedSubscriptionWhatsappAlertSearch);
      }),
    [normalizedSubscriptionWhatsappAlertSearch]
  );
  const normalizedSubscriptionEmailAlertDays = normalizeSubscriptionAlertDays(subscriptionForm.emailAlertDays);
  const normalizedSubscriptionWhatsappAlertDays = normalizeSubscriptionAlertDays(subscriptionForm.whatsappAlertDays);
  const normalizedSubscriptionEmailAlertAssignees = normalizeSubscriptionAlertAssignees(subscriptionForm.emailAlertAssignees);
  const normalizedSubscriptionWhatsappAlertAssignees = normalizeSubscriptionAlertAssignees(subscriptionForm.whatsappAlertAssignees);
  const defaultCurrency = String(orgBillingCurrency || "INR").trim().toUpperCase() || "INR";
  const normalizedSubscriptionStatusTab = String(subscriptionStatusTab || "all").trim().toLowerCase();
  const filteredSubscriptionList = useMemo(() => {
    if (normalizedSubscriptionStatusTab === "all") {
      return subscriptionList;
    }
    if (normalizedSubscriptionStatusTab === "expiring_30" || normalizedSubscriptionStatusTab === "expiring_15" || normalizedSubscriptionStatusTab === "expiring_7") {
      const limitDays = Number(normalizedSubscriptionStatusTab.split("_")[1]);
      return subscriptionList.filter((row) => {
        if (String(row?.status || "").trim().toLowerCase() === "cancelled") {
          return false;
        }
        const daysToExpiry = getDaysUntilDate(row?.endDate);
        return typeof daysToExpiry === "number" && daysToExpiry >= 0 && daysToExpiry <= limitDays;
      });
    }
    return subscriptionList.filter((row) => String(row?.status || "").trim().toLowerCase() === normalizedSubscriptionStatusTab);
  }, [normalizedSubscriptionStatusTab, subscriptionList]);
  const subscriptionStatusTabCounts = useMemo(() => {
    const counts = {
      all: subscriptionList.length,
      active: 0,
      expired: 0,
      cancelled: 0,
      expiring_30: 0,
      expiring_15: 0,
      expiring_7: 0
    };
    subscriptionList.forEach((row) => {
      const key = String(row?.status || "").trim().toLowerCase();
      if (key === "active" || key === "expired" || key === "cancelled") {
        counts[key] += 1;
      }
      const endDaysLeft = getDaysUntilDate(row?.endDate);
      if (row?.endDate && String(row?.status || "").trim().toLowerCase() !== "cancelled") {
        if (endDaysLeft !== null && endDaysLeft >= 0) {
          if (endDaysLeft <= 30) {
            counts.expiring_30 += 1;
          }
          if (endDaysLeft <= 15) {
            counts.expiring_15 += 1;
          }
          if (endDaysLeft <= 7) {
            counts.expiring_7 += 1;
          }
        }
      }
    });
    return counts;
  }, [subscriptionList]);

  function toggleSubscriptionAssignee(assignee) {
    setSubscriptionForm((prev) => {
      const normalizedAssignee = normalizeSubscriptionAlertAssignees([assignee]);
      if (!normalizedAssignee.length) {
        return prev;
      }
      const current = normalizeSubscriptionAlertAssignees(prev.emailAlertAssignees);
      const target = normalizedAssignee[0];
      const exists = current.some((row) => String(row.type) === String(target.type) && String(row.value) === String(target.value));
      return {
        ...prev,
        emailAlertAssignees: exists ? current.filter((row) => !(String(row.type) === String(target.type) && String(row.value) === String(target.value))) : [...current, target],
        whatsappAlertAssignees: exists ? current.filter((row) => !(String(row.type) === String(target.type) && String(row.value) === String(target.value))) : [...current, target]
      };
    });
    setSubscriptionAssignSearch("");
    setSubscriptionAssignSearchOpen(false);
  }

  function toggleSubscriptionAlertDay(key, value) {
    const targetKey = key === "whatsappAlertDays" ? "whatsappAlertDays" : "emailAlertDays";
    const normalizedValue = String(value || "").trim();
    if (!normalizedValue) {
      return;
    }
    setSubscriptionForm((prev) => {
      const current = normalizeSubscriptionAlertDays(prev[targetKey]);
      const exists = current.includes(normalizedValue);
      return {
        ...prev,
        [targetKey]: exists ? current.filter((rowValue) => rowValue !== normalizedValue) : [...current, normalizedValue],
      };
    });
  }

  function resetSubscriptionCategoryForm() {
    setEditingSubscriptionCategoryId("");
    setAccountsFormNotice("");
    setSubscriptionCategoryForm(createEmptySubscriptionCategory());
  }

  function resetSubscriptionSubCategoryForm() {
    setEditingSubscriptionSubCategoryId("");
    setAccountsFormNotice("");
    setSubscriptionSubCategoryForm(createEmptySubscriptionSubCategory());
  }

  function resetSubscriptionForm() {
    setEditingSubscriptionId("");
    setAccountsFormNotice("");
    setSubscriptionForm(createEmptySubscriptionForm({ currency: defaultCurrency }));
  }

  function updateSubscriptionFormField(key, value) {
    if (key === "emailAlertDays" || key === "whatsappAlertDays") {
      const normalized = normalizeSubscriptionAlertDays(value);
      setSubscriptionForm((prev) => ({ ...prev, [key]: normalized }));
      return;
    }
    if (key === "emailAlertAssignees" || key === "whatsappAlertAssignees") {
      setSubscriptionForm((prev) => ({
        ...prev,
        [key]: normalizeSubscriptionAlertAssignees(Array.isArray(value) ? value : []),
      }));
      return;
    }
    if (key === "startDate") {
      setSubscriptionForm((prev) => ({
        ...prev,
        startDate: value,
        nextBillingDate: getNextBillingDateFromStart(value)
      }));
      return;
    }
    if (key === "planDuration") {
      setSubscriptionForm((prev) => ({
        ...prev,
        planDuration: value,
        planDurationDays: value === "custom" ? prev.planDurationDays : ""
      }));
      return;
    }
    if (key === "categoryId") {
      setSubscriptionForm((prev) => ({
        ...prev,
        categoryId: value,
        subCategoryId: ""
      }));
      return;
    }
    if (key === "amount") {
      setSubscriptionForm((prev) => ({ ...prev, amount: sanitizeCurrencyInput(value) }));
      return;
    }
    setSubscriptionForm((prev) => ({ ...prev, [key]: value }));
  }

  async function saveSubscriptionCategory(event) {
    event.preventDefault();
    const name = String(subscriptionCategoryForm.name || "").trim();
    if (!name) {
      setAccountsFormNotice("Category name is required.");
      return;
    }
    const payload = {
      name,
      description: String(subscriptionCategoryForm.description || "").trim()
    };
    try {
      if (editingSubscriptionCategoryId) {
        const response = await apiFetch(`/api/business-autopilot/accounts/subscription-categories/${editingSubscriptionCategoryId}`, {
          method: "PUT",
          body: JSON.stringify(payload)
        });
        const saved = response?.category;
        if (saved) {
          setSubscriptionCategories((prev) => prev.map((row) => (String(row.id) === String(saved.id) ? saved : row)));
        }
      } else {
        const response = await apiFetch("/api/business-autopilot/accounts/subscription-categories", {
          method: "POST",
          body: JSON.stringify(payload)
        });
        const saved = response?.category;
        if (saved) {
          setSubscriptionCategories((prev) => [{ ...saved }, ...prev]);
        }
      }
      setAccountsFormNotice("");
      resetSubscriptionCategoryForm();
      await refreshSubscriptionData();
    } catch (error) {
      setAccountsFormNotice(error?.message || "Unable to save subscription category.");
    }
  }

  async function saveSubscriptionSubCategory(event) {
    event.preventDefault();
    const name = String(subscriptionSubCategoryForm.name || "").trim();
    const categoryId = String(subscriptionSubCategoryForm.categoryId || "").trim();
    if (!name || !categoryId) {
      setAccountsFormNotice("Category and sub-category name are required.");
      return;
    }
    const payload = {
      name,
      categoryId,
      description: String(subscriptionSubCategoryForm.description || "").trim()
    };
    try {
      if (editingSubscriptionSubCategoryId) {
        const response = await apiFetch(`/api/business-autopilot/accounts/sub-categories/${editingSubscriptionSubCategoryId}`, {
          method: "PUT",
          body: JSON.stringify(payload)
        });
        const saved = response?.subCategory;
        if (saved) {
          setSubscriptionSubCategories((prev) => prev.map((row) => (String(row.id) === String(saved.id) ? saved : row)));
        }
      } else {
        const response = await apiFetch("/api/business-autopilot/accounts/sub-categories", {
          method: "POST",
          body: JSON.stringify(payload)
        });
        const saved = response?.subCategory;
        if (saved) {
          setSubscriptionSubCategories((prev) => [{ ...saved }, ...prev]);
        }
      }
      setAccountsFormNotice("");
      resetSubscriptionSubCategoryForm();
      await refreshSubscriptionData();
    } catch (error) {
      setAccountsFormNotice(error?.message || "Unable to save subscription sub category.");
    }
  }

  async function deleteSubscriptionCategory(id) {
    if (!window.confirm("Delete this subscription category? Existing subscriptions may be unlinked automatically.")) {
      return;
    }
    try {
      await apiFetch(`/api/business-autopilot/accounts/subscription-categories/${id}`, { method: "DELETE" });
      setSubscriptionCategories((prev) => prev.filter((row) => String(row.id || "") !== String(id || "")));
      setSubscriptionSubCategories((prev) => prev.filter((row) => String(row.categoryId || "") !== String(id || "")));
      setSubscriptionList((prev) => prev.filter((row) => String(row.categoryId || "") !== String(id || "")));
      if (editingSubscriptionCategoryId === id) {
        resetSubscriptionCategoryForm();
      }
      if (String(subscriptionSubCategoryForm.categoryId || "") === String(id || "")) {
        resetSubscriptionSubCategoryForm();
      }
      setAccountsFormNotice("");
      await refreshSubscriptionData();
    } catch (error) {
      setAccountsFormNotice(error?.message || "Unable to delete subscription category.");
    }
  }

  async function deleteSubscriptionSubCategory(id) {
    if (!window.confirm("Delete this subscription sub category?")) {
      return;
    }
    try {
      await apiFetch(`/api/business-autopilot/accounts/sub-categories/${id}`, { method: "DELETE" });
      setSubscriptionSubCategories((prev) => prev.filter((row) => String(row.id || "") !== String(id || "")));
      setSubscriptionList((prev) => prev.map((row) => (
        String(row.subCategoryId || "") === String(id || "") ? { ...row, subCategoryId: "" } : row
      )));
      if (editingSubscriptionSubCategoryId === id) {
        resetSubscriptionSubCategoryForm();
      }
      setAccountsFormNotice("");
      await refreshSubscriptionData();
    } catch (error) {
      setAccountsFormNotice(error?.message || "Unable to delete subscription sub category.");
    }
  }

  async function saveSubscription(event) {
    event.preventDefault();
    const normalizedPlanDuration = String(subscriptionForm.planDuration || "").trim();
    const planDurationDays = normalizedPlanDuration === "custom"
      ? String(subscriptionForm.planDurationDays || "").trim()
      : normalizedPlanDuration;
    const payload = {
      categoryId: String(subscriptionForm.categoryId || "").trim(),
      subCategoryId: String(subscriptionForm.subCategoryId || "").trim(),
      subscriptionTitle: String(subscriptionForm.subscriptionTitle || "").trim(),
      planDurationDays,
      customerId: String(subscriptionForm.customerId || "").trim(),
      paymentDescription: String(subscriptionForm.paymentDescription || "").trim(),
      amount: sanitizeCurrencyInput(subscriptionForm.amount || "0"),
      currency: String(subscriptionForm.currency || defaultCurrency).trim().toUpperCase() || defaultCurrency,
      startDate: String(subscriptionForm.startDate || "").trim(),
      endDate: String(subscriptionForm.endDate || "").trim() || "",
      status: String(subscriptionForm.status || "Active").trim() || "Active",
      emailAlertDays: normalizeSubscriptionAlertDays(subscriptionForm.emailAlertDays),
      whatsappAlertDays: normalizeSubscriptionAlertDays(subscriptionForm.whatsappAlertDays),
      emailAlertAssignTo: normalizedSubscriptionEmailAlertAssignees,
      whatsappAlertAssignTo: normalizedSubscriptionWhatsappAlertAssignees
    };
    if (!payload.categoryId || !payload.subCategoryId || !payload.subscriptionTitle || !payload.customerId || !payload.startDate) {
      setAccountsFormNotice("Please fill mandatory fields: Category, Sub Category, Subscription Title, Client and Start Date.");
      return;
    }
    if (normalizedPlanDuration && normalizedPlanDuration !== "custom" && !/^(30|90|180|365|730|1095)$/.test(planDurationDays)) {
      setAccountsFormNotice("Select a valid plan duration.");
      return;
    }
    if (normalizedPlanDuration === "custom" && (!/^\d+$/.test(planDurationDays) || Number(planDurationDays) < 1)) {
      setAccountsFormNotice("Enter valid custom plan duration in days.");
      return;
    }
    payload.nextBillingDate = getNextBillingDateFromStart(payload.startDate);
    if (!payload.nextBillingDate) {
      setAccountsFormNotice("Invalid start date.");
      return;
    }
    try {
      if (editingSubscriptionId) {
        const response = await apiFetch(`/api/business-autopilot/accounts/subscriptions/${editingSubscriptionId}`, {
          method: "PUT",
          body: JSON.stringify(payload)
        });
        const saved = response?.subscription;
        if (saved) {
          setSubscriptionList((prev) => prev.map((row) => (String(row.id) === String(saved.id) ? saved : row)));
        }
      } else {
        const response = await apiFetch("/api/business-autopilot/accounts/subscriptions", {
          method: "POST",
          body: JSON.stringify(payload)
        });
        const saved = response?.subscription;
        if (saved) {
          setSubscriptionList((prev) => [saved, ...prev]);
        }
      }
      setAccountsFormNotice("");
      resetSubscriptionForm();
      await refreshSubscriptionData();
    } catch (error) {
      setAccountsFormNotice(error?.message || "Unable to save subscription.");
    }
  }

  function editSubscriptionCategory(row) {
    setEditingSubscriptionCategoryId(String(row.id || "").trim());
    setSubscriptionCategoryForm({
      id: row.id,
      name: row.name || "",
      description: row.description || ""
    });
    setActiveTab("subscriptions");
  }

  function editSubscriptionSubCategory(row) {
    setEditingSubscriptionSubCategoryId(String(row.id || "").trim());
    setSubscriptionSubCategoryForm({
      id: row.id,
      categoryId: String(row.categoryId || ""),
      name: row.name || "",
      description: row.description || ""
    });
    setActiveTab("subscriptions");
  }

  function editSubscription(row) {
    setEditingSubscriptionId(String(row.id || "").trim());
    const existingCustomerId = String(row.customerId || "").trim();
    const normalizedDuration = String(row.planDurationDays || row.planDuration || "").trim();
    const isPresetDuration = ["30", "90", "180", "365", "730", "1095"].includes(normalizedDuration);
    setSubscriptionForm({
      id: row.id,
      categoryId: String(row.categoryId || ""),
      subCategoryId: String(row.subCategoryId || ""),
      subscriptionTitle: row.subscriptionTitle || "",
      planDuration: isPresetDuration ? normalizedDuration : "custom",
      planDurationDays: isPresetDuration ? "" : normalizedDuration,
      customerId: existingCustomerId,
      customerName: subscriptionCustomerNameById.get(existingCustomerId) || String(row.customerName || "").trim(),
      paymentDescription: row.paymentDescription || "",
      amount: String(row.amount || ""),
      currency: String(row.currency || defaultCurrency).trim().toUpperCase() || defaultCurrency,
      startDate: row.startDate || "",
      endDate: row.endDate || "",
      nextBillingDate: row.nextBillingDate || getNextBillingDateFromStart(row.startDate),
      status: row.status || "Active",
      emailAlertDays: normalizeSubscriptionAlertDays(row.emailAlertDays),
      whatsappAlertDays: normalizeSubscriptionAlertDays(row.whatsappAlertDays),
      emailAlertAssignees: normalizeSubscriptionAlertAssignees(row.emailAlertAssignTo),
      whatsappAlertAssignees: normalizeSubscriptionAlertAssignees(row.whatsappAlertAssignTo)
    });
    setActiveTab("subscriptions");
  }

  async function deleteSubscription(id) {
    if (!window.confirm("Delete this subscription?")) {
      return;
    }
    try {
      await apiFetch(`/api/business-autopilot/accounts/subscriptions/${id}`, { method: "DELETE" });
      setSubscriptionList((prev) => prev.filter((row) => String(row.id || "") !== String(id || "")));
      if (editingSubscriptionId === String(id || "")) {
        resetSubscriptionForm();
      }
      setAccountsFormNotice("");
      await refreshSubscriptionData();
    } catch (error) {
      setAccountsFormNotice(error?.message || "Unable to delete subscription.");
    }
  }

  function openSubscriptionView(row) {
    setSubscriptionView(row);
  }

  function closeSubscriptionView() {
    setSubscriptionView(null);
  }

  function normalizeCustomerRecord(row = {}) {
    const legacyPhone = String(row.phone || "").trim();
    const legacyEmail = String(row.email || "").trim();
    const phoneList = Array.isArray(row.phoneList) ? row.phoneList : [];
    const emailList = Array.isArray(row.emailList) ? row.emailList : [];
    return {
      id: row.id || "",
      companyName: row.companyName || row.name || "",
      clientName: row.clientName || "",
      name: row.name || row.companyName || row.clientName || "",
      gstin: row.gstin || "",
      phoneCountryCode: row.phoneCountryCode || "+91",
      phone: row.phone || "",
      additionalPhones: phoneList.length
        ? phoneList.slice(1).map((p) => ({ countryCode: p.countryCode || "+91", number: p.number || "" }))
        : (legacyPhone ? [] : []),
      email: row.email || "",
      additionalEmails: emailList.length ? emailList.slice(1).map((e) => e || "") : (legacyEmail ? [] : []),
      billingAddress: row.billingAddress || "",
      shippingAddress: row.shippingAddress || "",
      billingCountry: row.billingCountry || row.country || "India",
      billingState: row.billingState || row.state || "",
      billingPincode: row.billingPincode || row.pincode || "",
      shippingCountry: row.shippingCountry || row.country || "India",
      shippingState: row.shippingState || row.state || "",
      shippingPincode: row.shippingPincode || row.pincode || "",
      billingShippingSame: Boolean(row.billingShippingSame)
    };
  }

  function formatCustomerPhones(row = {}) {
    const list = [];
    if (String(row.phone || "").trim()) {
      list.push(`${row.phoneCountryCode || "+91"} ${row.phone}`.trim());
    }
    if (Array.isArray(row.phoneList)) {
      row.phoneList.forEach((p, index) => {
        if (index === 0) return;
        if (String(p?.number || "").trim()) {
          list.push(`${p.countryCode || "+91"} ${p.number}`.trim());
        }
      });
    }
    if (!list.length && Array.isArray(row.additionalPhones)) {
      row.additionalPhones.forEach((p) => {
        if (String(p?.number || "").trim()) {
          list.push(`${p.countryCode || "+91"} ${p.number}`.trim());
        }
      });
    }
    return list.filter(Boolean);
  }

  function formatCustomerEmails(row = {}) {
    const list = [];
    if (String(row.email || "").trim()) {
      list.push(String(row.email).trim());
    }
    if (Array.isArray(row.emailList)) {
      row.emailList.forEach((e, index) => {
        if (index === 0) return;
        if (String(e || "").trim()) {
          list.push(String(e).trim());
        }
      });
    }
    if (!list.length && Array.isArray(row.additionalEmails)) {
      row.additionalEmails.forEach((e) => {
        if (String(e || "").trim()) {
          list.push(String(e).trim());
        }
      });
    }
    return list.filter(Boolean);
  }

  function resetGstForm() {
    setEditingGstId("");
    setAccountsFormNotice("");
    setGstForm({
      id: "",
      name: "",
      taxScope: taxUi.defaultScope,
      cgst: "",
      sgst: "",
      igst: "",
      cess: "",
      status: "Active",
      notes: ""
    });
  }

  function resetTemplateForm() {
    setEditingTemplateId("");
    setAccountsFormNotice("");
    setTemplateForm({
      id: "",
      name: "",
      docType: "Invoice",
      gstTemplateId: activeGstTemplates[0]?.id || "",
      prefix: "",
      invStartFrom: "",
      themeColor: "#22c55e",
      companyLogoDataUrl: "",
      companyLogoName: "",
      footerNote: "Thank you for your business.",
      termsText: "Payment due within 7 days. Please contact your org admin for support.",
      status: "Active"
    });
  }

  function handleBillingTemplateLogoChange(file) {
    if (!file) {
      return;
    }
    const validation = validateBusinessAutopilotImage(file, { label: "Company logo" });
    if (!validation.ok) {
      showUploadAlert(validation.message);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = typeof reader.result === "string" ? reader.result : "";
      setTemplateForm((prev) => ({
        ...prev,
        companyLogoDataUrl: dataUrl,
        companyLogoName: file.name || "company-logo"
      }));
    };
    reader.readAsDataURL(file);
  }

  function saveGstTemplate(event) {
    event.preventDefault();
    if (!gstForm.name.trim()) {
      setAccountsFormNotice("GST template name is required.");
      return;
    }
    const payload = {
      ...gstForm,
      name: gstForm.name.trim(),
      notes: gstForm.notes.trim()
    };
    setModuleData((prev) => {
      const rows = prev.gstTemplates || [];
      if (editingGstId) {
        return { ...prev, gstTemplates: rows.map((row) => (row.id === editingGstId ? { ...row, ...payload } : row)) };
      }
      return {
        ...prev,
        gstTemplates: [{ ...payload, id: `gst_${Date.now()}` }, ...rows]
      };
    });
    setAccountsFormNotice("");
    resetGstForm();
  }

  function editGstTemplate(row) {
    setEditingGstId(row.id);
    setGstForm({ ...row });
    setActiveTab("gst");
  }

  function deleteGstTemplate(id) {
    setModuleData((prev) => ({
      ...prev,
      gstTemplates: (prev.gstTemplates || []).filter((row) => row.id !== id),
      billingTemplates: (prev.billingTemplates || []).map((row) =>
        row.gstTemplateId === id ? { ...row, gstTemplateId: "" } : row
      ),
      estimates: (prev.estimates || []).map((row) =>
        row.gstTemplateId === id ? { ...row, gstTemplateId: "" } : row
      ),
      invoices: (prev.invoices || []).map((row) =>
        row.gstTemplateId === id ? { ...row, gstTemplateId: "" } : row
      )
    }));
    if (editingGstId === id) {
      resetGstForm();
    }
  }

  function updateGstStatus(id, status) {
    setModuleData((prev) => ({
      ...prev,
      gstTemplates: (prev.gstTemplates || []).map((row) => (row.id === id ? { ...row, status } : row))
    }));
  }

  function saveBillingTemplate(event) {
    event.preventDefault();
    if (!templateForm.name.trim()) {
      setAccountsFormNotice("Billing template name is required.");
      return;
    }
    const payload = {
      ...templateForm,
      name: templateForm.name.trim(),
      footerNote: templateForm.footerNote.trim(),
      termsText: templateForm.termsText.trim()
    };
    setModuleData((prev) => {
      const rows = prev.billingTemplates || [];
      if (editingTemplateId) {
        return { ...prev, billingTemplates: rows.map((row) => (row.id === editingTemplateId ? { ...row, ...payload } : row)) };
      }
      return {
        ...prev,
        billingTemplates: [{ ...payload, id: `bt_${Date.now()}` }, ...rows]
      };
    });
    setAccountsFormNotice("");
    resetTemplateForm();
  }

  function editBillingTemplate(row) {
    setEditingTemplateId(row.id);
    setTemplateForm({ ...row });
    setActiveTab("templates");
  }

  function deleteBillingTemplate(id) {
    setModuleData((prev) => ({
      ...prev,
      billingTemplates: (prev.billingTemplates || []).filter((row) => row.id !== id),
      estimates: (prev.estimates || []).map((row) => (row.billingTemplateId === id ? { ...row, billingTemplateId: "" } : row)),
      invoices: (prev.invoices || []).map((row) => (row.billingTemplateId === id ? { ...row, billingTemplateId: "" } : row))
    }));
    if (editingTemplateId === id) {
      resetTemplateForm();
    }
  }

  function updateBillingTemplateStatus(id, status) {
    setModuleData((prev) => ({
      ...prev,
      billingTemplates: (prev.billingTemplates || []).map((row) => (row.id === id ? { ...row, status } : row))
    }));
  }

  function resetCustomerForm() {
    setEditingCustomerId("");
    setAccountsFormNotice("");
    setCustomerForm({
      id: "",
      companyName: "",
      clientName: "",
      name: "",
      gstin: "",
      phoneCountryCode: "+91",
      phone: "",
      additionalPhones: [],
      email: "",
      additionalEmails: [],
      billingAddress: "",
      shippingAddress: "",
      billingCountry: "India",
      billingState: "",
      billingPincode: "",
      shippingCountry: "India",
      shippingState: "",
      shippingPincode: "",
      billingShippingSame: false
    });
  }

  function getCustomerRequiredFieldLabels(form) {
    const labels = [];
    const companyName = String(form.companyName || form.name || "").trim();
    const clientName = String(form.clientName || "").trim();
    const primaryPhone = String(form.phone || "").trim();
    const primaryEmail = String(form.email || "").trim();
    const billingAddress = String(form.billingAddress || "").trim();
    const billingState = String(form.billingState || "").trim();
    const billingPincode = String(form.billingPincode || "").trim();
    const useSameShipping = Boolean(form.billingShippingSame);
    const shippingAddress = useSameShipping ? billingAddress : String(form.shippingAddress || "").trim();
    const shippingState = useSameShipping ? billingState : String(form.shippingState || "").trim();
    const shippingPincode = useSameShipping ? billingPincode : String(form.shippingPincode || "").trim();

    if (!companyName) labels.push("Company Name");
    if (!clientName) labels.push("Client Name");
    if (!primaryPhone) labels.push("Phone Number");
    if (!primaryEmail) labels.push("Email ID");
    if (!billingAddress) labels.push("Billing Address");
    if (!billingState) labels.push("Billing State");
    if (!billingPincode) labels.push("Billing Pincode");
    if (!shippingAddress) labels.push("Shipping Address");
    if (!shippingState) labels.push("Shipping State");
    if (!shippingPincode) labels.push("Shipping Pincode");

    return labels;
  }

  function isCustomerFieldRequired(fieldKey) {
    const alwaysRequired = new Set([
      "companyName",
      "clientName",
      "phone",
      "email",
      "billingAddress",
      "billingState",
      "billingPincode",
    ]);
    if (alwaysRequired.has(fieldKey)) return true;
    if (fieldKey === "shippingAddress" || fieldKey === "shippingState" || fieldKey === "shippingPincode") {
      return !customerForm.billingShippingSame;
    }
    return false;
  }

  function saveCustomer(event) {
    event.preventDefault();
    const missingLabels = getCustomerRequiredFieldLabels(customerForm);
    if (missingLabels.length) {
      setAccountsFormNotice(`Please fill mandatory fields: ${missingLabels.join(", ")}`);
      return;
    }
    const companyName = String(customerForm.companyName || customerForm.name || "").trim();
    const clientName = String(customerForm.clientName || "").trim();
    const primaryPhone = String(customerForm.phone || "").trim();
    const primaryEmail = String(customerForm.email || "").trim();
    const additionalPhones = (customerForm.additionalPhones || [])
      .map((row) => ({ countryCode: String(row.countryCode || "+91").trim() || "+91", number: String(row.number || "").trim() }))
      .filter((row) => row.number);
    const additionalEmails = (customerForm.additionalEmails || [])
      .map((value) => String(value || "").trim())
      .filter(Boolean);
    const billingCountry = String(customerForm.billingCountry || "").trim() || "India";
    const billingState = String(customerForm.billingState || "").trim();
    const billingPincode = String(customerForm.billingPincode || "").trim();
    const useSameShipping = Boolean(customerForm.billingShippingSame);
    const shippingAddress = useSameShipping
      ? String(customerForm.billingAddress || "").trim()
      : String(customerForm.shippingAddress || "").trim();
    const shippingCountry = useSameShipping
      ? billingCountry
      : (String(customerForm.shippingCountry || "").trim() || "India");
    const shippingState = useSameShipping
      ? billingState
      : String(customerForm.shippingState || "").trim();
    const shippingPincode = useSameShipping
      ? billingPincode
      : String(customerForm.shippingPincode || "").trim();

    const payload = {
      ...customerForm,
      companyName,
      clientName,
      name: companyName,
      gstin: String(customerForm.gstin || "").trim(),
      phoneCountryCode: String(customerForm.phoneCountryCode || "+91").trim() || "+91",
      phone: primaryPhone,
      email: primaryEmail,
      additionalPhones,
      additionalEmails,
      phoneList: [
        ...(primaryPhone ? [{ countryCode: String(customerForm.phoneCountryCode || "+91").trim() || "+91", number: primaryPhone }] : []),
        ...additionalPhones
      ],
      emailList: [primaryEmail, ...additionalEmails].filter(Boolean),
      billingAddress: String(customerForm.billingAddress || "").trim(),
      shippingAddress,
      billingCountry,
      billingState,
      billingPincode,
      shippingCountry,
      shippingState,
      shippingPincode,
      billingShippingSame: useSameShipping,
      country: billingCountry,
      state: billingState,
      pincode: billingPincode
    };
    setModuleData((prev) => {
      const rows = prev.customers || [];
      if (editingCustomerId) {
        return { ...prev, customers: rows.map((row) => (row.id === editingCustomerId ? { ...row, ...payload } : row)) };
      }
      return { ...prev, customers: [{ ...payload, id: `cust_${Date.now()}` }, ...rows] };
    });
    setAccountsFormNotice("");
    resetCustomerForm();
  }

  function importCustomers(importedRows) {
    const expectedHeaders = [
      "Company Name",
      "Client Name",
      "GSTIN",
      "Contact Number",
      "Email ID",
      "Location",
    ];
    const headerValidation = validateImportHeaders(importedRows, expectedHeaders);
    if (!headerValidation.isValid) {
      return {
        isError: true,
        totalRows: Array.isArray(importedRows) ? importedRows.length : 0,
        newRows: 0,
        replacedRows: 0,
        skippedRows: Array.isArray(importedRows) ? importedRows.length : 0,
        message: buildHeaderValidationMessage(
          "Customers table",
          headerValidation.missing,
          headerValidation.unexpected
        ),
      };
    }
    const nextRows = importedRows
      .map((row, rowIndex) => {
        const getValue = (...keys) => {
          for (const key of keys) {
            const match = Object.entries(row || {}).find(
              ([header]) => normalizeImportHeader(header) === normalizeImportHeader(key)
            );
            if (match && String(match[1] || "").trim()) {
              return String(match[1] || "").trim();
            }
          }
          return "";
        };

        const companyName = getValue("Company Name", "Company", "Name");
        const clientName = getValue("Client Name", "Client", "Contact Person");
        const gstin = getValue("GSTIN");
        const contactNumberRaw = getValue("Contact Number", "Phone Number", "Phone", "Mobile Number");
        const emailRaw = getValue("Email ID", "Email", "Email Address");
        const locationRaw = getValue("Location", "Billing Location", "Address");

        if (!companyName && !clientName && !contactNumberRaw && !emailRaw && !locationRaw && !gstin) {
          return null;
        }

        const phoneEntries = contactNumberRaw
          .split(/[,\n/]+/)
          .map((value) => String(value || "").trim())
          .filter(Boolean)
          .map((value) => {
            const phoneMatch = value.match(/^(\+\d{1,4})\s*(.+)$/);
            if (phoneMatch) {
              return {
                countryCode: phoneMatch[1].trim(),
                number: phoneMatch[2].trim(),
              };
            }
            return {
              countryCode: "+91",
              number: value,
            };
          })
          .filter((item) => item.number);

        const emailEntries = emailRaw
          .split(/[,\n/]+/)
          .map((value) => String(value || "").trim())
          .filter(Boolean);

        const locationParts = locationRaw
          .split(",")
          .map((value) => String(value || "").trim())
          .filter(Boolean);

        const billingState = locationParts[0] || "";
        const billingCountry = locationParts[1] || "India";
        const billingPincode = locationParts[2] || "";

        return normalizeSharedCustomerRecord({
          id: `cust_import_${Date.now()}_${rowIndex}`,
          companyName,
          clientName,
          name: companyName || clientName,
          gstin,
          phoneCountryCode: phoneEntries[0]?.countryCode || "+91",
          phone: phoneEntries[0]?.number || "",
          additionalPhones: phoneEntries.slice(1),
          phoneList: phoneEntries,
          email: emailEntries[0] || "",
          additionalEmails: emailEntries.slice(1),
          emailList: emailEntries,
          billingCountry,
          billingState,
          billingPincode,
          shippingCountry: billingCountry,
          shippingState: billingState,
          shippingPincode: billingPincode,
          country: billingCountry,
          state: billingState,
          pincode: billingPincode,
        });
      })
      .filter(Boolean);

    if (!nextRows.length) {
      return {
        isError: true,
        totalRows: Array.isArray(importedRows) ? importedRows.length : 0,
        newRows: 0,
        replacedRows: 0,
        skippedRows: Array.isArray(importedRows) ? importedRows.length : 0,
        message: "Imported file is empty or invalid.",
      };
    }

    const existingRows = Array.isArray(moduleData.customers) ? moduleData.customers : [];
    const updatedExistingRows = [...existingRows];
    const existingKeyToIndex = new Map();
    updatedExistingRows.forEach((row, index) => {
      const key = buildCustomerImportDedupKey(row);
      if (key && !existingKeyToIndex.has(key)) {
        existingKeyToIndex.set(key, index);
      }
    });
    const newImportedRows = [];
    const newKeyToIndex = new Map();
    let replacedRows = 0;
    let newRows = 0;

    nextRows.forEach((row) => {
      const dedupKey = buildCustomerImportDedupKey(row);
      if (!dedupKey) {
        newImportedRows.push(row);
        newRows += 1;
        return;
      }
      if (existingKeyToIndex.has(dedupKey)) {
        const rowIndex = existingKeyToIndex.get(dedupKey);
        const previous = updatedExistingRows[rowIndex] || {};
        updatedExistingRows[rowIndex] = {
          ...previous,
          ...row,
          id: previous.id || row.id,
        };
        replacedRows += 1;
        return;
      }
      if (newKeyToIndex.has(dedupKey)) {
        const rowIndex = newKeyToIndex.get(dedupKey);
        const previous = newImportedRows[rowIndex] || {};
        newImportedRows[rowIndex] = {
          ...previous,
          ...row,
          id: previous.id || row.id,
        };
        replacedRows += 1;
        return;
      }
      newKeyToIndex.set(dedupKey, newImportedRows.length);
      newImportedRows.push(row);
      newRows += 1;
    });

    const skippedRows = Math.max(0, nextRows.length - (newRows + replacedRows));
    if (!newRows && !replacedRows) {
      return {
        isError: true,
        totalRows: nextRows.length,
        newRows: 0,
        replacedRows: 0,
        skippedRows: nextRows.length,
        message: "No customer records were imported.",
      };
    }

    setModuleData((prev) => ({
      ...prev,
      customers: [...newImportedRows, ...updatedExistingRows],
    }));
    return {
      totalRows: nextRows.length,
      newRows,
      replacedRows,
      skippedRows,
      message: `${newRows} new customer row(s) added, ${replacedRows} existing row(s) replaced.`,
    };
  }

  function editCustomer(row) {
    setEditingCustomerId(row.id);
    setCustomerForm(normalizeCustomerRecord(row));
    setActiveTab("customers");
  }

  function deleteCustomer(id) {
    setModuleData((prev) => ({
      ...prev,
      customers: (prev.customers || []).filter((row) => row.id !== id)
    }));
    if (editingCustomerId === id) {
      resetCustomerForm();
    }
  }

  function resetItemMasterForm() {
    setEditingItemMasterId("");
    setAccountsFormNotice("");
    setItemMasterForm({
      id: "",
      name: "",
      itemType: "Product",
      sku: "",
      hsnSacCode: "",
      unit: "Nos",
      defaultRate: "",
      taxPercent: ""
    });
  }

  function saveItemMaster(event) {
    event.preventDefault();
    if (!String(itemMasterForm.name || "").trim()) {
      setAccountsFormNotice("Item name is required.");
      return;
    }
    const payload = {
      ...itemMasterForm,
      name: String(itemMasterForm.name || "").trim(),
      itemType: String(itemMasterForm.itemType || "Product").trim() || "Product",
      sku: String(itemMasterForm.sku || "").trim(),
      hsnSacCode: String(itemMasterForm.hsnSacCode || "").trim(),
      unit: String(itemMasterForm.unit || "").trim(),
      defaultRate: String(itemMasterForm.defaultRate || "").trim(),
      taxPercent: String(itemMasterForm.taxPercent || "").trim()
    };
    setModuleData((prev) => {
      const rows = prev.itemMasters || [];
      if (editingItemMasterId) {
        return { ...prev, itemMasters: rows.map((row) => (row.id === editingItemMasterId ? { ...row, ...payload } : row)) };
      }
      return { ...prev, itemMasters: [{ ...payload, id: `itm_${Date.now()}` }, ...rows] };
    });
    setAccountsFormNotice("");
    resetItemMasterForm();
  }

  function editItemMaster(row) {
    setEditingItemMasterId(row.id);
    setItemMasterForm({
      ...row,
      itemType: row.itemType || "Product",
      hsnSacCode: row.hsnSacCode || ""
    });
    setItemMasterListTypeFilter(String(row.itemType || "Product"));
    setActiveTab("items");
  }

  function deleteItemMaster(id) {
    setModuleData((prev) => ({
      ...prev,
      itemMasters: (prev.itemMasters || []).filter((row) => row.id !== id)
    }));
    if (editingItemMasterId === id) {
      resetItemMasterForm();
    }
  }

  function applyCustomerToDocument(kind, customerId) {
    const selected = (moduleData.customers || []).find((row) => row.id === customerId);
    if (!selected) {
      return;
    }
    const setter = kind === "estimate" ? setEstimateForm : setInvoiceForm;
    setter((prev) => ({
      ...prev,
      customerName: selected.companyName || selected.name || selected.clientName || "",
      customerGstin: selected.gstin || "",
      billingAddress: selected.billingAddress || ""
    }));
  }

  function applyItemMasterToLine(kind, lineId, itemId) {
    const selected = (moduleData.itemMasters || []).find((row) => row.id === itemId);
    if (!selected) {
      return;
    }
    const setter = kind === "estimate" ? setEstimateForm : setInvoiceForm;
    setter((prev) => ({
      ...prev,
      items: (prev.items || []).map((row) => (
        row.id === lineId
          ? {
              ...row,
              itemMasterId: selected.id,
              description: selected.name || row.description,
              rate: String(selected.defaultRate || row.rate || ""),
              taxPercent: String(selected.taxPercent || row.taxPercent || "")
            }
          : row
      ))
    }));
  }

  function saveInventoryWorkspace(nextWorkspace) {
    setInventoryWorkspace(nextWorkspace);
    try {
      window.localStorage.setItem(STOCKS_STORAGE_KEY, JSON.stringify(nextWorkspace));
    } catch {
      // ignore local storage quota/storage errors
    }
  }

  function getInventoryReservationMap(invoices = [], excludeInvoiceId = "") {
    const map = new Map();
    (invoices || []).forEach((invoice) => {
      if (!invoice || (excludeInvoiceId && invoice.id === excludeInvoiceId)) return;
      const deliveryStatus = String(invoice.deliveryStatus || "").toLowerCase();
      const status = String(invoice.status || "").toLowerCase();
      if (deliveryStatus === "completed" || status === "cancelled") return;
      (invoice.items || []).forEach((line) => {
        const inventoryItemId = String(line?.inventoryItemId || "").trim();
        if (!inventoryItemId) return;
        const qty = parseNumber(line?.qty);
        if (qty <= 0) return;
        map.set(inventoryItemId, (map.get(inventoryItemId) || 0) + qty);
      });
    });
    return map;
  }

  const invoiceReservationMap = useMemo(
    () => getInventoryReservationMap(moduleData.invoices || []),
    [moduleData.invoices]
  );

  function availableInventoryQty(itemId, currentDoc = null, currentLineId = "") {
    const item = inventoryItemLookup.get(String(itemId || ""));
    const onHandQty = parseNumber(item?.qty);
    let reserved = parseNumber(invoiceReservationMap.get(String(itemId || "")) || 0);
    if (currentDoc && Array.isArray(currentDoc.items)) {
      currentDoc.items.forEach((line) => {
        if (String(line?.inventoryItemId || "") !== String(itemId || "")) return;
        if (currentLineId && String(line?.id || "") !== String(currentLineId)) return;
        reserved -= parseNumber(line?.qty);
      });
    }
    return Math.max(0, onHandQty - Math.max(0, reserved));
  }

  function applyInventoryItemToLine(kind, lineId, selectedValue) {
    const normalizedValue = String(selectedValue || "").trim();
    if (!normalizedValue) {
      updateDocLine(kind, lineId, "inventoryItemId", "");
      return;
    }
    const selected = inventoryItems.find((row) => (
      String(row?.id || "") === normalizedValue
      || String(row?.itemName || "").trim() === normalizedValue
    ));
    if (!selected) return;
    const setter = kind === "estimate" ? setEstimateForm : setInvoiceForm;
    setter((prev) => ({
      ...prev,
      items: (prev.items || []).map((row) => (
        row.id === lineId
          ? {
              ...row,
              inventoryItemId: selected.id,
              description: selected.itemName || row.description || "",
            }
          : row
      ))
    }));
  }

  function applyInventoryDeductionForInvoiceCompletion(previousInvoice, nextInvoice) {
    if (!nextInvoice || String(nextInvoice.deliveryStatus || "").toLowerCase() !== "completed") {
      return nextInvoice;
    }
    if (nextInvoice.inventoryCommitted) {
      return nextInvoice;
    }
    const previousDeliveryCompleted = String(previousInvoice?.deliveryStatus || "").toLowerCase() === "completed";
    if (previousDeliveryCompleted && previousInvoice?.inventoryCommitted) {
      return { ...nextInvoice, inventoryCommitted: true };
    }
    if (!inventoryWorkspace || !Array.isArray(inventoryWorkspace.items)) {
      return { ...nextInvoice, inventoryCommitted: true };
    }
    const deductionByItem = new Map();
    (nextInvoice.items || []).forEach((line) => {
      const itemId = String(line?.inventoryItemId || "").trim();
      if (!itemId) return;
      const qty = parseNumber(line?.qty);
      if (qty <= 0) return;
      deductionByItem.set(itemId, (deductionByItem.get(itemId) || 0) + qty);
    });
    if (!deductionByItem.size) {
      return { ...nextInvoice, inventoryCommitted: true };
    }
    const nextWorkspace = {
      ...inventoryWorkspace,
      items: (inventoryWorkspace.items || []).map((row) => {
        const key = String(row?.id || "");
        const deductQty = parseNumber(deductionByItem.get(key) || 0);
        if (!deductQty) return row;
        const currentQty = parseNumber(row?.qty);
        return { ...row, qty: String(Math.max(0, currentQty - deductQty)) };
      })
    };
    saveInventoryWorkspace(nextWorkspace);
    return { ...nextInvoice, inventoryCommitted: true };
  }

  function openDocumentPrint(kind, id) {
    const url = `/api/business-autopilot/accounts/documents/${kind}/${encodeURIComponent(id)}/print`;
    window.open(url, "_blank", "noopener,noreferrer");
  }

  function setDocField(kind, key, value) {
    if (kind === "estimate") {
      setEstimateForm((prev) => ({ ...prev, [key]: value }));
      return;
    }
    setInvoiceForm((prev) => ({ ...prev, [key]: value }));
  }

  function applyBillingTemplateToDocument(kind, templateId) {
    const selectedTemplate = (moduleData.billingTemplates || []).find((row) => String(row.id || "") === String(templateId || ""));
    const setter = kind === "estimate" ? setEstimateForm : setInvoiceForm;
    setter((prev) => ({
      ...prev,
      billingTemplateId: String(templateId || "").trim(),
      notes: String(selectedTemplate?.footerNote || prev.notes || "").trim(),
      termsText: String(selectedTemplate?.termsText || prev.termsText || "").trim(),
    }));
  }

  function addDocLine(kind) {
    if (kind === "estimate") {
      setEstimateForm((prev) => ({ ...prev, items: [...(prev.items || []), createEmptyDocLine()] }));
      return;
    }
    setInvoiceForm((prev) => ({ ...prev, items: [...(prev.items || []), createEmptyDocLine()] }));
  }

  function updateDocLine(kind, lineId, key, value) {
    const setter = kind === "estimate" ? setEstimateForm : setInvoiceForm;
    setter((prev) => ({
      ...prev,
      items: (prev.items || []).map((row) => (row.id === lineId ? { ...row, [key]: value } : row))
    }));
  }

  function removeDocLine(kind, lineId) {
    const setter = kind === "estimate" ? setEstimateForm : setInvoiceForm;
    setter((prev) => {
      const rows = (prev.items || []).filter((row) => row.id !== lineId);
      return { ...prev, items: rows.length ? rows : [createEmptyDocLine()] };
    });
  }

  function saveDocument(kind, event) {
    event.preventDefault();
    const form = kind === "estimate" ? estimateForm : invoiceForm;
    if (!String(form.customerName || "").trim()) {
      setAccountsFormNotice("Client / Company name is required.");
      return;
    }
    const payload = {
      ...form,
      customerName: String(form.customerName || "").trim(),
      customerGstin: String(form.customerGstin || "").trim(),
      billingAddress: String(form.billingAddress || "").trim(),
      salesperson: Array.isArray(form.salesperson)
        ? form.salesperson.map((entry) => String(entry || "").trim()).filter(Boolean).join(", ")
        : String(form.salesperson || "").trim(),
      notes: String(form.notes || "").trim(),
      termsText: String(form.termsText || "").trim(),
      paymentStatus: kind === "invoice" ? String(form.paymentStatus || "Pending").trim() : "",
      deliveryStatus: kind === "invoice" ? String(form.deliveryStatus || "Pending").trim() : "",
      inventoryCommitted: kind === "invoice" ? Boolean(form.inventoryCommitted) : false,
      items: (form.items || [])
        .map((row) => ({
          ...row,
          itemMasterId: row.itemMasterId || "",
          inventoryItemId: row.inventoryItemId || "",
          description: String(row.description || "").trim(),
          qty: String(row.qty || "").trim(),
          rate: String(row.rate || "").trim(),
          taxPercent: String(row.taxPercent || "").trim()
        }))
        .filter((row) => row.description || row.qty || row.rate)
    };
    if (!payload.items.length) {
      payload.items = [createEmptyDocLine()];
    }
    const listKey = kind === "estimate" ? "estimates" : "invoices";
    const editingId = kind === "estimate" ? editingEstimateId : editingInvoiceId;
    setModuleData((prev) => {
      const rows = prev[listKey] || [];
      if (editingId) {
        if (kind === "invoice") {
          return {
            ...prev,
            [listKey]: rows.map((row) => {
              if (row.id !== editingId) return row;
              return applyInventoryDeductionForInvoiceCompletion(row, { ...row, ...payload });
            })
          };
        }
        return { ...prev, [listKey]: rows.map((row) => (row.id === editingId ? { ...row, ...payload } : row)) };
      }
      if (kind === "invoice") {
        const nextInvoice = applyInventoryDeductionForInvoiceCompletion(null, { ...payload, id: `${kind}_${Date.now()}` });
        return { ...prev, [listKey]: [nextInvoice, ...rows] };
      }
      return { ...prev, [listKey]: [{ ...payload, id: `${kind}_${Date.now()}` }, ...rows] };
    });
    setAccountsFormNotice("");
    if (kind === "estimate") {
      setEditingEstimateId("");
      setEstimateForm(createEmptyBillingDocument("estimate"));
    } else {
      setEditingInvoiceId("");
      setInvoiceForm(createEmptyBillingDocument("invoice"));
    }
  }

  function editDocument(kind, row) {
    const parsedSalesperson = Array.isArray(row.salesperson)
      ? row.salesperson.map((entry) => String(entry || "").trim()).filter(Boolean)
      : String(row.salesperson || "")
        .split(",")
        .map((entry) => entry.trim())
        .filter(Boolean);
    const normalized = {
      ...row,
      items: (row.items && row.items.length ? row.items : [createEmptyDocLine()]).map((item) => ({
        id: item.id || createEmptyDocLine().id,
        itemMasterId: item.itemMasterId || "",
        inventoryItemId: item.inventoryItemId || "",
        description: item.description || "",
        qty: String(item.qty ?? ""),
        rate: String(item.rate ?? ""),
        taxPercent: String(item.taxPercent ?? "")
      })),
      paymentStatus: kind === "invoice" ? (row.paymentStatus || "Pending") : (row.paymentStatus || ""),
      deliveryStatus: kind === "invoice" ? (row.deliveryStatus || "Pending") : (row.deliveryStatus || ""),
      inventoryCommitted: Boolean(row.inventoryCommitted),
      salesperson: parsedSalesperson,
    };
    if (kind === "estimate") {
      setEditingEstimateId(row.id);
      setEstimateForm(normalized);
      setActiveTab("estimates");
      return;
    }
    setEditingInvoiceId(row.id);
    setInvoiceForm(normalized);
    setActiveTab("invoices");
  }

  function deleteDocument(kind, id) {
    const listKey = kind === "estimate" ? "estimates" : "invoices";
    setModuleData((prev) => ({
      ...prev,
      [listKey]: (prev[listKey] || []).filter((row) => row.id !== id)
    }));
    if (kind === "estimate" && editingEstimateId === id) {
      setEditingEstimateId("");
      setEstimateForm(createEmptyBillingDocument("estimate"));
    }
    if (kind === "invoice" && editingInvoiceId === id) {
      setEditingInvoiceId("");
      setInvoiceForm(createEmptyBillingDocument("invoice"));
    }
  }

  function updateDocumentStatus(kind, id, status) {
    const listKey = kind === "estimate" ? "estimates" : "invoices";
    setModuleData((prev) => ({
      ...prev,
      [listKey]: (prev[listKey] || []).map((row) => (row.id === id ? { ...row, status } : row))
    }));
  }

  function updateInvoicePaymentStatus(id, paymentStatus) {
    setModuleData((prev) => ({
      ...prev,
      invoices: (prev.invoices || []).map((row) => (row.id === id ? { ...row, paymentStatus } : row))
    }));
  }

  function updateInvoiceDeliveryStatus(id, deliveryStatus) {
    setModuleData((prev) => ({
      ...prev,
      invoices: (prev.invoices || []).map((row) => {
        if (row.id !== id) return row;
        return applyInventoryDeductionForInvoiceCompletion(row, { ...row, deliveryStatus });
      })
    }));
  }

  function resolveGstTemplateName(id) {
    return (moduleData.gstTemplates || []).find((row) => row.id === id)?.name || "-";
  }

  function resolveBillingTemplateName(id) {
    return (moduleData.billingTemplates || []).find((row) => row.id === id)?.name || "-";
  }

  const estimateTotals = useMemo(
    () => computeDocumentTotals(estimateForm, moduleData.gstTemplates || []),
    [estimateForm, moduleData.gstTemplates]
  );
  const invoiceTotals = useMemo(
    () => computeDocumentTotals(invoiceForm, moduleData.gstTemplates || []),
    [invoiceForm, moduleData.gstTemplates]
  );

  function BillingDocumentEditor({ kind, form, setField, totals, onSave, onCancelEdit, editingId }) {
    const kindLabel = kind === "estimate" ? "Estimate" : "Invoice";
    const [customerSearchOpen, setCustomerSearchOpen] = useState(false);
    const [salesSearchOpen, setSalesSearchOpen] = useState(false);
    const [salesSearchText, setSalesSearchText] = useState("");
    const billingTemplates = (moduleData.billingTemplates || []).filter((row) =>
      String(row.docType || "").toLowerCase() === kindLabel.toLowerCase()
    );
    const salesPeople = Array.from(new Set((erpUsersForSales || [])
      .filter((user) => Boolean(user?.name))
      .map((user) => String(user.name || "").trim())
      .filter(Boolean)));
    const selectedSalesPeople = Array.isArray(form.salesperson)
      ? form.salesperson.map((entry) => String(entry || "").trim()).filter(Boolean)
      : String(form.salesperson || "")
        .split(",")
        .map((entry) => entry.trim())
        .filter(Boolean);
    const customerSearchValue = String(form.customerName || "").trim().toLowerCase();
    const customerMatches = (customerOptions || []).filter((row) => {
      if (!customerSearchValue) return true;
      const haystack = `${row.companyName || ""} ${row.name || ""} ${row.clientName || ""} ${row.email || ""}`.toLowerCase();
      return haystack.includes(customerSearchValue);
    }).slice(0, 8);
    const salesMatches = salesPeople.filter((name) => {
      const q = String(salesSearchText || "").trim().toLowerCase();
      if (!q) return true;
      return name.toLowerCase().includes(q);
    }).slice(0, 8);
    const toggleSalesPerson = (name) => {
      const normalized = String(name || "").trim();
      if (!normalized) return;
      const nextSelected = selectedSalesPeople.includes(normalized)
        ? selectedSalesPeople.filter((entry) => entry !== normalized)
        : [...selectedSalesPeople, normalized];
      setField("salesperson", nextSelected.join(", "));
      setSalesSearchText("");
    };
    return (
      <div>
        <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-3">
          <h6 className="mb-0">{editingId ? `Edit ${kindLabel}` : `Create ${kindLabel}`}</h6>
        </div>
        <form className="d-flex flex-column gap-3" onSubmit={onSave}>
          <div className="p-0">
            <div className="row g-3">
              <div className="col-12 col-xl-3">
                <label className="form-label small text-secondary mb-1">Client / Company Name</label>
                <div className="crm-inline-suggestions-wrap">
                  <input
                    className="form-control"
                    value={form.customerName || ""}
                    onFocus={() => setCustomerSearchOpen(true)}
                    onClick={() => setCustomerSearchOpen(true)}
                    onBlur={() => window.setTimeout(() => setCustomerSearchOpen(false), 120)}
                    onChange={(e) => {
                      const nextValue = e.target.value;
                      setField("customerName", nextValue);
                      setCustomerSearchOpen(true);
                    }}
                    placeholder="Search client / company"
                  />
                  {customerSearchOpen ? (
                    <div className="crm-inline-suggestions">
                      <div className="crm-inline-suggestions__group">
                        <div className="crm-inline-suggestions__title">Clients</div>
                        {customerMatches.length ? customerMatches.map((row) => (
                          <button
                            key={`${kind}-cust-match-${row.id}`}
                            type="button"
                            className="crm-inline-suggestions__item"
                            onClick={() => {
                              setField("customerName", row.companyName || row.name || "");
                              setField("customerGstin", row.gstin || "");
                              setField("billingAddress", row.billingAddress || "");
                              setCustomerSearchOpen(false);
                            }}
                          >
                            <span className="crm-inline-suggestions__item-main">{row.companyName || row.name || "-"}</span>
                            <span className="crm-inline-suggestions__item-sub">{row.clientName || row.email || "-"}</span>
                          </button>
                        )) : (
                          <div className="crm-inline-suggestions__item">
                            <span className="crm-inline-suggestions__item-main">No clients found</span>
                          </div>
                        )}
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>
              <div className="col-12 col-xl-1">
                <label className="form-label small text-secondary mb-1">{kindLabel} No</label>
                <input className="form-control" value={form.docNo || ""} onChange={(e) => setField("docNo", e.target.value)} placeholder={kind === "estimate" ? "EST-1001" : "INV-1001"} />
              </div>
              <div className="col-12 col-xl-2">
                <label className="form-label small text-secondary mb-1">Sales Person</label>
                <div className="crm-inline-suggestions-wrap">
                  <input
                    className="form-control"
                    value={salesSearchText}
                    onFocus={() => setSalesSearchOpen(true)}
                    onClick={() => setSalesSearchOpen(true)}
                    onBlur={() => window.setTimeout(() => setSalesSearchOpen(false), 120)}
                    onChange={(e) => {
                      setSalesSearchText(e.target.value);
                      setSalesSearchOpen(true);
                    }}
                    placeholder="Search sales person"
                  />
                  {salesSearchOpen ? (
                    <div className="crm-inline-suggestions">
                      <div className="crm-inline-suggestions__group">
                        <div className="crm-inline-suggestions__title">Users</div>
                        {salesMatches.length ? salesMatches.map((name) => (
                          <button
                            key={`${kind}-sales-match-${name}`}
                            type="button"
                            className="crm-inline-suggestions__item"
                            onClick={() => toggleSalesPerson(name)}
                          >
                            <span className="crm-inline-suggestions__item-main">{name}</span>
                          </button>
                        )) : (
                          <div className="crm-inline-suggestions__item">
                            <span className="crm-inline-suggestions__item-main">No users found</span>
                          </div>
                        )}
                      </div>
                    </div>
                  ) : null}
                </div>
                <div className="d-flex flex-wrap gap-2 mt-2">
                  {selectedSalesPeople.length ? selectedSalesPeople.map((name) => (
                    <span key={`${kind}-sales-chip-${name}`} className="badge text-bg-light border d-inline-flex align-items-center gap-2 wz-selected-chip">
                      <button
                        type="button"
                        className="btn btn-sm p-0 border text-secondary bg-transparent rounded-circle d-inline-flex align-items-center justify-content-center wz-selected-chip-remove"
                        aria-label={`Remove ${name}`}
                        onClick={() => toggleSalesPerson(name)}
                      >
                        &times;
                      </button>
                      <span>{name}</span>
                    </span>
                  )) : (
                    <span className="small text-secondary">No sales person selected</span>
                  )}
                </div>
              </div>
              <div className="col-12 col-md-6 col-xl-1">
                <label className="form-label small text-secondary mb-1">Issue Date</label>
                <input type="date" className="form-control" value={form.issueDate || ""} onChange={(e) => setField("issueDate", e.target.value)} />
              </div>
              <div className="col-12 col-md-6 col-xl-1">
                <label className="form-label small text-secondary mb-1">Due Date</label>
                <input type="date" className="form-control" value={form.dueDate || ""} onChange={(e) => setField("dueDate", e.target.value)} />
              </div>
              <div className="col-12 col-md-6 col-xl-2">
                <label className="form-label small text-secondary mb-1">{taxUi.templateSingular}</label>
                <select className="form-select" value={form.gstTemplateId || ""} onChange={(e) => setField("gstTemplateId", e.target.value)}>
                  <option value="">{`Select ${taxUi.templateSingular}`}</option>
                  {(moduleData.gstTemplates || []).map((row) => (
                    <option key={row.id} value={row.id}>
                      {row.name} ({gstTemplateTotalPercent(row)}%)
                    </option>
                  ))}
                </select>
              </div>
              <div className="col-12 col-md-6 col-xl-2">
                <label className="form-label small text-secondary mb-1">Billing Template</label>
                <select className="form-select" value={form.billingTemplateId || ""} onChange={(e) => applyBillingTemplateToDocument(kind, e.target.value)}>
                  <option value="">Select Billing Template</option>
                  {billingTemplates.map((row) => (
                    <option key={row.id} value={row.id}>{row.name}</option>
                  ))}
                </select>
              </div>
              {kind === "invoice" ? (
                <>
                  <div className="col-12 col-md-6 col-xl-3">
                    <label className="form-label small text-secondary mb-1">Payment Status</label>
                    <select className="form-select" value={form.paymentStatus || "Pending"} onChange={(e) => setField("paymentStatus", e.target.value)}>
                      {INVOICE_PAYMENT_STATUS_OPTIONS.map((status) => (
                        <option key={`inv-pay-${status}`} value={status}>{status}</option>
                      ))}
                    </select>
                  </div>
                  <div className="col-12 col-md-6 col-xl-3">
                    <label className="form-label small text-secondary mb-1">Delivery Status</label>
                    <select className="form-select" value={form.deliveryStatus || "Pending"} onChange={(e) => setField("deliveryStatus", e.target.value)}>
                      {INVOICE_DELIVERY_STATUS_OPTIONS.map((status) => (
                        <option key={`inv-del-${status}`} value={status}>{status}</option>
                      ))}
                    </select>
                  </div>
                </>
              ) : null}
            </div>
          </div>

          <div className="card p-3 border">
            <div className="d-flex align-items-center justify-content-between mb-2">
              <h6 className="mb-0">Item Table</h6>
              <button type="button" className="btn btn-outline-light btn-sm" onClick={() => addDocLine(kind)}>
                Add Row
              </button>
            </div>
            <div className="table-responsive">
              <table className="table table-dark table-borderless align-middle mb-0">
                <thead>
                  <tr>
                    <th style={{ minWidth: 220 }}>Item Details</th>
                    <th style={{ width: 110 }}>Qty</th>
                    <th style={{ width: 140 }}>Rate</th>
                    <th style={{ width: 130 }}>Tax %</th>
                    <th style={{ width: 160 }}>Amount</th>
                    <th className="text-end" style={{ width: 100 }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {(form.items || []).map((line, rowIndex) => {
                    const lineAmount = parseNumber(line.qty) * parseNumber(line.rate);
                    return (
                      <tr key={line.id}>
                        <td style={{ backgroundColor: rowIndex % 2 === 0 ? "rgba(255,255,255,0.02)" : "rgba(255,255,255,0.06)" }}>
                          <input
                            className="form-control datalist-readable-input"
                            list={`${kind}-inventory-item-list-${line.id}`}
                            value={line.description || ""}
                            onChange={(e) => {
                              const nextValue = e.target.value;
                              updateDocLine(kind, line.id, "description", nextValue);
                              const matched = inventoryItems.find((item) => {
                                const label = `${item.itemName || ""} (Available: ${availableInventoryQty(item.id, form, line.id)})`;
                                return label === nextValue || String(item.itemName || "") === nextValue;
                              });
                              if (matched) {
                                applyInventoryItemToLine(kind, line.id, matched.id);
                              }
                            }}
                            placeholder="Type or click to select an item"
                          />
                          <datalist id={`${kind}-inventory-item-list-${line.id}`}>
                            {inventoryItems.map((item) => (
                              <option
                                key={`${kind}-inventory-${item.id}`}
                                value={`${item.itemName || ""} (Available: ${availableInventoryQty(item.id, form, line.id)})`}
                              />
                            ))}
                          </datalist>
                          {line.inventoryItemId ? (
                            <div className="small text-secondary mt-1">
                              Available Qty: {availableInventoryQty(line.inventoryItemId, form, line.id)}
                            </div>
                          ) : null}
                        </td>
                        <td style={{ backgroundColor: rowIndex % 2 === 0 ? "rgba(255,255,255,0.02)" : "rgba(255,255,255,0.06)" }}>
                          <input
                            className="form-control"
                            value={line.qty || ""}
                            onChange={(e) => updateDocLine(kind, line.id, "qty", e.target.value)}
                            placeholder="1"
                          />
                        </td>
                        <td style={{ backgroundColor: rowIndex % 2 === 0 ? "rgba(255,255,255,0.02)" : "rgba(255,255,255,0.06)" }}>
                          <input
                            className="form-control"
                            value={line.rate || ""}
                            onChange={(e) => updateDocLine(kind, line.id, "rate", e.target.value)}
                            placeholder="0.00"
                          />
                        </td>
                        <td style={{ backgroundColor: rowIndex % 2 === 0 ? "rgba(255,255,255,0.02)" : "rgba(255,255,255,0.06)" }}>
                          <input
                            className="form-control"
                            value={line.taxPercent || ""}
                            onChange={(e) => updateDocLine(kind, line.id, "taxPercent", e.target.value)}
                            placeholder="Auto"
                          />
                        </td>
                        <td className="fw-semibold" style={{ backgroundColor: rowIndex % 2 === 0 ? "rgba(255,255,255,0.02)" : "rgba(255,255,255,0.06)" }}>{formatInr(lineAmount)}</td>
                        <td className="text-end" style={{ backgroundColor: rowIndex % 2 === 0 ? "rgba(255,255,255,0.02)" : "rgba(255,255,255,0.06)" }}>
                          <button type="button" className="btn btn-outline-danger btn-sm" onClick={() => removeDocLine(kind, line.id)}>
                            Delete
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div className="row g-3">
            <div className="col-12 col-xl-7">
              <div className="h-100">
                <label className="form-label small text-secondary mb-1">Customer Notes</label>
                <textarea className="form-control mb-3" rows="3" value={form.notes || ""} onChange={(e) => setField("notes", e.target.value)} placeholder="Notes visible on document" />
                <label className="form-label small text-secondary mb-1">Terms & Conditions</label>
                <textarea className="form-control" rows="3" value={form.termsText || ""} onChange={(e) => setField("termsText", e.target.value)} placeholder="Terms and conditions" />
              </div>
            </div>
            <div className="col-12 col-xl-5">
              <div className="card p-3 h-100 border">
                <h6 className="mb-3">Summary</h6>
                <div className="d-flex justify-content-between mb-2"><span className="text-secondary">Sub Total</span><strong>{formatInr(totals.subtotal)}</strong></div>
                <div className="d-flex justify-content-between mb-2"><span className="text-secondary">GST / Tax</span><strong>{formatInr(totals.taxTotal)}</strong></div>
                <div className="d-flex justify-content-between pt-2 border-top">
                  <span className="fw-semibold">Total</span>
                  <strong>{formatInr(totals.grandTotal)}</strong>
                </div>
              </div>
            </div>
          </div>

          <div className="d-flex flex-wrap gap-2">
            <button type="submit" className="btn btn-success btn-sm">
              {editingId ? `Update ${kindLabel}` : `Create ${kindLabel}`}
            </button>
            {editingId ? (
              <button type="button" className="btn btn-outline-light btn-sm" onClick={onCancelEdit}>
                Cancel Edit
              </button>
            ) : null}
          </div>
        </form>
      </div>
    );
  }

  function DocumentTable({ kind, rows, statusOptions }) {
    const gstRows = moduleData.gstTemplates || [];
    return (
      <SearchablePaginatedTableCard
        title={kind === "estimate" ? "Estimate List" : "Invoice List"}
        badgeLabel={`${rows.length} items`}
        rows={rows}
        withoutOuterCard={
          activeTab === "overview"
          || (kind === "invoice" && activeTab === "invoices")
          || (kind === "estimate" && activeTab === "estimates")
        }
        columns={[
          { key: "docNo", label: kind === "estimate" ? "Estimate No" : "Invoice No" },
          { key: "customerName", label: "Customer" },
          { key: "issueDate", label: "Date" },
          { key: "dueDate", label: "Due Date" },
          { key: "total", label: "Total" },
          { key: "gstTemplateId", label: taxUi.templateSingular },
          ...(kind === "invoice" ? [
            { key: "paymentStatus", label: "Payment Status" },
            { key: "deliveryStatus", label: "Delivery Status" },
          ] : []),
          { key: "status", label: "Status" },
        ]}
        searchPlaceholder={`Search ${kind}s`}
        noRowsText="No records yet."
        searchBy={(row) => [row.docNo, row.customerName, row.status, row.issueDate, row.dueDate].join(" ")}
        renderCells={(row) => {
          const totals = computeDocumentTotals(row, gstRows);
          return [
            <span className="fw-semibold">{row.docNo || "-"}</span>,
            row.customerName || "-",
            formatDateLikeCellValue("issueDate", row.issueDate, "-"),
            formatDateLikeCellValue("dueDate", row.dueDate, "-"),
            formatInr(totals.grandTotal),
            resolveGstTemplateName(row.gstTemplateId),
            ...(kind === "invoice" ? [
              (
                <select
                  className="form-select form-select-sm"
                  value={row.paymentStatus || "Pending"}
                  onChange={(e) => updateInvoicePaymentStatus(row.id, e.target.value)}
                >
                  {INVOICE_PAYMENT_STATUS_OPTIONS.map((status) => (
                    <option key={`${row.id}-pay-${status}`} value={status}>{status}</option>
                  ))}
                </select>
              ),
              (
                <select
                  className="form-select form-select-sm"
                  value={row.deliveryStatus || "Pending"}
                  onChange={(e) => updateInvoiceDeliveryStatus(row.id, e.target.value)}
                >
                  {INVOICE_DELIVERY_STATUS_OPTIONS.map((status) => (
                    <option key={`${row.id}-delivery-${status}`} value={status}>{status}</option>
                  ))}
                </select>
              ),
            ] : []),
            (
              <select
                className="form-select form-select-sm"
                value={row.status || statusOptions[0]}
                onChange={(e) => updateDocumentStatus(kind, row.id, e.target.value)}
              >
                {statusOptions.map((status) => (
                  <option key={status} value={status}>{status}</option>
                ))}
              </select>
            ),
          ];
        }}
        renderActions={(row) => (
          <div className="d-inline-flex gap-2">
            <button type="button" className="btn btn-sm btn-outline-light" onClick={() => openDocumentPrint(kind, row.id)}>
              Print / PDF
            </button>
            <button type="button" className="btn btn-sm btn-outline-info" onClick={() => editDocument(kind, row)}>
              Edit
            </button>
            <button type="button" className="btn btn-sm btn-outline-danger" onClick={() => deleteDocument(kind, row.id)}>
              Delete
            </button>
          </div>
        )}
      />
    );
  }

  return (
    <div className="d-flex flex-column gap-3">
      {isAccountsLoading ? (
        <div className="card p-3 text-secondary">Loading accounts workspace...</div>
      ) : null}
      <div>
        <h4 className="mb-2">{headingTitle}</h4>
        <p className="text-secondary mb-3">
          {subscriptionsOnly
            ? "Manage subscription categories, sub categories, and customer subscriptions in one place."
            : "Complete billing workflow with GST templates, billing templates, estimates, invoices, and status updates."}
        </p>
        {accountsSyncError ? (
          <div className="d-flex flex-wrap align-items-center gap-2 mb-2">
            <span className="small text-danger">{accountsSyncError}</span>
          </div>
        ) : null}
        {!subscriptionsOnly ? (
          <div className="d-flex flex-wrap gap-2">
            {accountTabs.map((tab) => (
              <button
                key={tab.key}
                type="button"
                className={`btn btn-sm ${activeTab === tab.key ? "btn-success" : "btn-outline-light"}`}
                onClick={() => setActiveTab(tab.key)}
              >
                {tab.label}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      {accountsFormNotice ? (
        <div className="alert alert-danger py-2 mb-0">{accountsFormNotice}</div>
      ) : null}

      {activeTab === "overview" ? (
        <div className="row g-3">
          {overviewStats.map((item) => (
            <div className="col-12 col-md-6 col-xl-3" key={item.label}>
              <div className="card p-3 h-100 d-flex flex-column align-items-center justify-content-center text-center">
                <div className="stat-icon stat-icon-primary mb-2">
                  <i className={`bi ${item.icon || "bi-grid"}`} aria-hidden="true" />
                </div>
                <div className="text-secondary small">{item.label}</div>
                <h5 className="mb-0 mt-1">{item.value}</h5>
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {activeTab === "overview" ? (
        <>
          <div className="d-flex flex-wrap gap-2">
            <button
              type="button"
              className={`btn btn-sm ${overviewDocTab === "invoice" ? "btn-success" : "btn-outline-light"}`}
              onClick={() => setOverviewDocTab("invoice")}
            >
              Invoice List
            </button>
            <button
              type="button"
              className={`btn btn-sm ${overviewDocTab === "estimate" ? "btn-success" : "btn-outline-light"}`}
              onClick={() => setOverviewDocTab("estimate")}
            >
              Estimate List
            </button>
          </div>
          <div>
            {overviewDocTab === "invoice" ? (
              <DocumentTable kind="invoice" rows={moduleData.invoices || []} statusOptions={INVOICE_STATUS_OPTIONS} />
            ) : (
              <DocumentTable kind="estimate" rows={moduleData.estimates || []} statusOptions={ESTIMATE_STATUS_OPTIONS} />
            )}
          </div>
        </>
      ) : null}

      {activeTab === "gst" ? (
        <>
          <SearchablePaginatedTableCard
            title={taxUi.templateListTitle}
            badgeLabel={`${(moduleData.gstTemplates || []).length} templates`}
            rows={moduleData.gstTemplates || []}
            columns={[
              { key: "name", label: "Template Name" },
              { key: "taxScope", label: taxUi.scopeLabel },
              { key: "cgst", label: taxUi.cgstLabel.replace(" %", "") },
              { key: "sgst", label: taxUi.sgstLabel.replace(" %", "") },
              { key: "igst", label: taxUi.igstLabel.replace(" %", "") },
              { key: "cess", label: taxUi.cessLabel.replace(" %", "") },
              { key: "total", label: "Total" },
              { key: "status", label: "Status" },
            ]}
            searchPlaceholder={`Search ${taxUi.templatesLabel.toLowerCase()}`}
            noRowsText={`No ${taxUi.templatesLabel.toLowerCase()} yet.`}
            searchBy={(row) => [row.name, row.taxScope, row.status, row.notes].join(" ")}
            renderCells={(row) => [
              <div>
                <div className="fw-semibold">{row.name}</div>
                <div className="small text-secondary">{row.notes || "-"}</div>
              </div>,
              row.taxScope,
              `${row.cgst}%`,
              `${row.sgst}%`,
              `${row.igst}%`,
              `${row.cess}%`,
              `${gstTemplateTotalPercent(row)}%`,
              (
                <select
                  className="form-select form-select-sm"
                  value={row.status || "Active"}
                  onChange={(e) => updateGstStatus(row.id, e.target.value)}
                >
                  {GST_STATUS_OPTIONS.map((status) => (
                    <option key={status} value={status}>{status}</option>
                  ))}
                </select>
              ),
            ]}
            renderActions={(row) => (
              <div className="d-inline-flex gap-2">
                <button type="button" className="btn btn-sm btn-outline-info" onClick={() => editGstTemplate(row)}>Edit</button>
                <button type="button" className="btn btn-sm btn-outline-danger" onClick={() => deleteGstTemplate(row.id)}>Delete</button>
              </div>
            )}
          />

          <div className="card p-3">
            <h6 className="mb-1">{editingGstId ? taxUi.editTitle : taxUi.createTitle}</h6>
            <div className="small text-secondary mb-3">{taxUi.helperText}</div>
            <form className="d-flex flex-column gap-3" onSubmit={saveGstTemplate}>
              <div className="row g-3">
                <div className="col-12 col-xl-4">
                  <label className="form-label small text-secondary mb-1">Template Name</label>
                  <input className="form-control" value={gstForm.name || ""} onChange={(e) => setGstForm((p) => ({ ...p, name: e.target.value }))} placeholder={taxUi.namePlaceholder} />
                </div>
                <div className="col-12 col-xl-2">
                  <label className="form-label small text-secondary mb-1">{taxUi.scopeLabel}</label>
                  <select className="form-select" value={gstForm.taxScope || taxUi.defaultScope} onChange={(e) => setGstForm((p) => ({ ...p, taxScope: e.target.value }))}>
                    {Array.from(new Set([...(taxUi.scopeOptions || []), String(gstForm.taxScope || "").trim()].filter(Boolean))).map((scope) => (
                      <option key={scope} value={scope}>{scope}</option>
                    ))}
                  </select>
                </div>
                <div className="col-6 col-md-3 col-xl-1">
                  <label className="form-label small text-secondary mb-1">{taxUi.cgstLabel}</label>
                  <input className="form-control" value={gstForm.cgst || ""} onChange={(e) => setGstForm((p) => ({ ...p, cgst: e.target.value }))} />
                </div>
                <div className="col-6 col-md-3 col-xl-1">
                  <label className="form-label small text-secondary mb-1">{taxUi.sgstLabel}</label>
                  <input className="form-control" value={gstForm.sgst || ""} onChange={(e) => setGstForm((p) => ({ ...p, sgst: e.target.value }))} />
                </div>
                <div className="col-6 col-md-3 col-xl-1">
                  <label className="form-label small text-secondary mb-1">{taxUi.igstLabel}</label>
                  <input className="form-control" value={gstForm.igst || ""} onChange={(e) => setGstForm((p) => ({ ...p, igst: e.target.value }))} />
                </div>
                <div className="col-6 col-md-3 col-xl-1">
                  <label className="form-label small text-secondary mb-1">{taxUi.cessLabel}</label>
                  <input className="form-control" value={gstForm.cess || ""} onChange={(e) => setGstForm((p) => ({ ...p, cess: e.target.value }))} />
                </div>
                <div className="col-12 col-xl-2">
                  <label className="form-label small text-secondary mb-1">Status</label>
                  <select className="form-select" value={gstForm.status || "Active"} onChange={(e) => setGstForm((p) => ({ ...p, status: e.target.value }))}>
                    {GST_STATUS_OPTIONS.map((status) => (
                      <option key={status} value={status}>{status}</option>
                    ))}
                  </select>
                </div>
                <div className="col-12">
                  <label className="form-label small text-secondary mb-1">Notes</label>
                  <textarea className="form-control" rows="2" value={gstForm.notes || ""} onChange={(e) => setGstForm((p) => ({ ...p, notes: e.target.value }))} placeholder={taxUi.notesPlaceholder} />
                </div>
              </div>
              <div className="d-flex gap-2">
                <button type="submit" className="btn btn-success btn-sm">{editingGstId ? taxUi.editActionLabel : taxUi.createActionLabel}</button>
                {editingGstId ? <button type="button" className="btn btn-outline-light btn-sm" onClick={resetGstForm}>Cancel</button> : null}
              </div>
            </form>
          </div>
        </>
      ) : null}

      {activeTab === "customers" ? (
        <>
          <div className="card p-3">
            <h6 className="mb-3">{editingCustomerId ? "Edit Client" : "Create Client"}</h6>
            <form className="d-flex flex-column gap-3" onSubmit={saveCustomer}>
              <div className="row g-3">
                <div className="col-12 col-xl-4">
                  <label className="form-label small text-secondary mb-1">Company Name {isCustomerFieldRequired("companyName") ? "*" : ""}</label>
                  <input className="form-control" required={isCustomerFieldRequired("companyName")} value={customerForm.companyName || ""} onChange={(e) => setCustomerForm((p) => ({ ...p, companyName: e.target.value, name: e.target.value }))} placeholder="Company name" />
                </div>
                <div className="col-12 col-xl-4">
                  <label className="form-label small text-secondary mb-1">Client Name {isCustomerFieldRequired("clientName") ? "*" : ""}</label>
                  <input className="form-control" required={isCustomerFieldRequired("clientName")} value={customerForm.clientName || ""} onChange={(e) => setCustomerForm((p) => ({ ...p, clientName: e.target.value }))} placeholder="Client / Contact person" />
                </div>
                <div className="col-12 col-xl-4">
                  <label className="form-label small text-secondary mb-1">GSTIN</label>
                  <input className="form-control" value={customerForm.gstin || ""} onChange={(e) => setCustomerForm((p) => ({ ...p, gstin: e.target.value }))} placeholder="GSTIN" />
                </div>
                <div className="col-12 col-xl-6">
                  <label className="form-label small text-secondary mb-1">Phone Number {isCustomerFieldRequired("phone") ? "*" : ""}</label>
                  <div className="d-flex flex-column gap-2">
                    <div className="d-flex gap-2">
                      <PhoneCountryCodePicker
                        value={customerForm.phoneCountryCode || "+91"}
                        onChange={(code) => setCustomerForm((p) => ({ ...p, phoneCountryCode: code }))}
                        options={DIAL_COUNTRY_PICKER_OPTIONS}
                        style={{ maxWidth: "220px" }}
                        ariaLabel="Customer phone country code"
                      />
                      <input className="form-control" required={isCustomerFieldRequired("phone")} value={customerForm.phone || ""} onChange={(e) => setCustomerForm((p) => ({ ...p, phone: e.target.value }))} placeholder="Phone number" />
                      <button
                        type="button"
                        className="btn btn-outline-light btn-sm"
                        title="Add Contact Number"
                        onClick={() => setCustomerForm((p) => ({ ...p, additionalPhones: [...(p.additionalPhones || []), { countryCode: "+91", number: "" }] }))}
                      >
                        +
                      </button>
                    </div>
                    {(customerForm.additionalPhones || []).map((row, index) => (
                      <div className="d-flex gap-2" key={`phone-${index}`}>
                        <PhoneCountryCodePicker
                          value={row.countryCode || "+91"}
                          onChange={(code) =>
                            setCustomerForm((p) => ({
                              ...p,
                              additionalPhones: (p.additionalPhones || []).map((item, i) => (i === index ? { ...item, countryCode: code } : item))
                            }))
                          }
                          options={DIAL_COUNTRY_PICKER_OPTIONS}
                          style={{ maxWidth: "220px" }}
                          ariaLabel="Additional phone country code"
                        />
                        <input
                          className="form-control"
                          value={row.number || ""}
                          placeholder="Additional contact number"
                          onChange={(e) => setCustomerForm((p) => ({
                            ...p,
                            additionalPhones: (p.additionalPhones || []).map((item, i) => (i === index ? { ...item, number: e.target.value } : item))
                          }))}
                        />
                        <button
                          type="button"
                          className="btn btn-outline-danger btn-sm"
                          onClick={() => setCustomerForm((p) => ({
                            ...p,
                            additionalPhones: (p.additionalPhones || []).filter((_, i) => i !== index)
                          }))}
                        >
                          x
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="col-12 col-xl-6">
                  <label className="form-label small text-secondary mb-1">Email ID {isCustomerFieldRequired("email") ? "*" : ""}</label>
                  <div className="d-flex flex-column gap-2">
                    <div className="d-flex gap-2">
                      <input className="form-control" required={isCustomerFieldRequired("email")} value={customerForm.email || ""} onChange={(e) => setCustomerForm((p) => ({ ...p, email: e.target.value }))} placeholder="Primary email" />
                      <button
                        type="button"
                        className="btn btn-outline-light btn-sm"
                        title="Add Email ID"
                        onClick={() => setCustomerForm((p) => ({ ...p, additionalEmails: [...(p.additionalEmails || []), ""] }))}
                      >
                        +
                      </button>
                    </div>
                    {(customerForm.additionalEmails || []).map((value, index) => (
                      <div className="d-flex gap-2" key={`email-${index}`}>
                        <input
                          className="form-control"
                          value={value || ""}
                          placeholder="Additional email ID"
                          onChange={(e) => setCustomerForm((p) => ({
                            ...p,
                            additionalEmails: (p.additionalEmails || []).map((item, i) => (i === index ? e.target.value : item))
                          }))}
                        />
                        <button
                          type="button"
                          className="btn btn-outline-danger btn-sm"
                          onClick={() => setCustomerForm((p) => ({
                            ...p,
                            additionalEmails: (p.additionalEmails || []).filter((_, i) => i !== index)
                          }))}
                        >
                          x
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="col-12 col-xl-6">
                  <div className="d-flex align-items-center justify-content-between mb-1">
                    <label className="form-label small text-secondary mb-0">Billing Address {isCustomerFieldRequired("billingAddress") ? "*" : ""}</label>
                    <label className="form-check-label small text-secondary d-flex align-items-center gap-2 mb-0">
                      <input
                        type="checkbox"
                        className="form-check-input mt-0"
                        checked={Boolean(customerForm.billingShippingSame)}
                        onChange={(e) =>
                          setCustomerForm((p) => ({
                            ...p,
                            billingShippingSame: e.target.checked,
                          }))
                        }
                      />
                      Billing and Shipping Same
                    </label>
                  </div>
                  <textarea
                    className="form-control mb-2"
                    required={isCustomerFieldRequired("billingAddress")}
                    rows="2"
                    value={customerForm.billingAddress || ""}
                    onChange={(e) => setCustomerForm((p) => ({ ...p, billingAddress: e.target.value }))}
                    placeholder="Billing address"
                  />
                  <div className="d-flex flex-column gap-2">
                    <div>
                      <label className="form-label small text-secondary mb-1">Country</label>
                      <select
                        className="form-select"
                        value={customerForm.billingCountry || "India"}
                        onChange={(e) => setCustomerForm((p) => ({ ...p, billingCountry: e.target.value, billingState: "" }))}
                      >
                        {COUNTRY_OPTIONS.map((country) => (
                          <option key={`billing-country-${country}`} value={country}>{country}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="form-label small text-secondary mb-1">State {isCustomerFieldRequired("billingState") ? "*" : ""}</label>
                      {billingStateOptions.length ? (
                        <select
                          className="form-select"
                          required={isCustomerFieldRequired("billingState")}
                          value={customerForm.billingState || ""}
                          onChange={(e) => setCustomerForm((p) => ({ ...p, billingState: e.target.value }))}
                        >
                          <option value="">Select State</option>
                          {billingStateOptions.map((state) => (
                            <option key={`billing-state-${state}`} value={state}>{state}</option>
                          ))}
                        </select>
                      ) : (
                        <input
                          className="form-control"
                          required={isCustomerFieldRequired("billingState")}
                          value={customerForm.billingState || ""}
                          onChange={(e) => setCustomerForm((p) => ({ ...p, billingState: e.target.value }))}
                          placeholder="State / Province / Region"
                        />
                      )}
                    </div>
                    <div>
                      <label className="form-label small text-secondary mb-1">Pincode {isCustomerFieldRequired("billingPincode") ? "*" : ""}</label>
                      <input
                        className="form-control"
                        required={isCustomerFieldRequired("billingPincode")}
                        value={customerForm.billingPincode || ""}
                        onChange={(e) => setCustomerForm((p) => ({ ...p, billingPincode: e.target.value }))}
                        placeholder="Pincode"
                      />
                    </div>
                  </div>
                </div>
                {!customerForm.billingShippingSame ? (
                  <div className="col-12 col-xl-6">
                    <label className="form-label small text-secondary mb-1">Shipping Address {isCustomerFieldRequired("shippingAddress") ? "*" : ""}</label>
                    <textarea
                      className="form-control mb-2"
                      required={isCustomerFieldRequired("shippingAddress")}
                      rows="2"
                      value={customerForm.shippingAddress || ""}
                      onChange={(e) => setCustomerForm((p) => ({ ...p, shippingAddress: e.target.value }))}
                      placeholder="Shipping address"
                    />
                    <div className="d-flex flex-column gap-2">
                      <div>
                        <label className="form-label small text-secondary mb-1">Country</label>
                        <select
                          className="form-select"
                          value={customerForm.shippingCountry || "India"}
                          onChange={(e) => setCustomerForm((p) => ({ ...p, shippingCountry: e.target.value, shippingState: "" }))}
                        >
                          {COUNTRY_OPTIONS.map((country) => (
                            <option key={`shipping-country-${country}`} value={country}>{country}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="form-label small text-secondary mb-1">State {isCustomerFieldRequired("shippingState") ? "*" : ""}</label>
                        {shippingStateOptions.length ? (
                          <select
                            className="form-select"
                            required={isCustomerFieldRequired("shippingState")}
                            value={customerForm.shippingState || ""}
                            onChange={(e) => setCustomerForm((p) => ({ ...p, shippingState: e.target.value }))}
                          >
                            <option value="">Select State</option>
                            {shippingStateOptions.map((state) => (
                              <option key={`shipping-state-${state}`} value={state}>{state}</option>
                            ))}
                          </select>
                        ) : (
                          <input
                            className="form-control"
                            required={isCustomerFieldRequired("shippingState")}
                            value={customerForm.shippingState || ""}
                            onChange={(e) => setCustomerForm((p) => ({ ...p, shippingState: e.target.value }))}
                            placeholder="State / Province / Region"
                          />
                        )}
                      </div>
                      <div>
                        <label className="form-label small text-secondary mb-1">Pincode {isCustomerFieldRequired("shippingPincode") ? "*" : ""}</label>
                        <input
                          className="form-control"
                          required={isCustomerFieldRequired("shippingPincode")}
                          value={customerForm.shippingPincode || ""}
                          onChange={(e) => setCustomerForm((p) => ({ ...p, shippingPincode: e.target.value }))}
                          placeholder="Pincode"
                        />
                      </div>
                    </div>
                  </div>
                ) : null}
              </div>
              <div className="d-flex gap-2">
                <button type="submit" className="btn btn-success btn-sm">{editingCustomerId ? "Update Client" : "Create Client"}</button>
                {editingCustomerId ? <button type="button" className="btn btn-outline-light btn-sm" onClick={resetCustomerForm}>Cancel</button> : null}
              </div>
            </form>
          </div>

          <SearchablePaginatedTableCard
            title="Client List"
            badgeLabel={`${(moduleData.customers || []).length} clients`}
            rows={moduleData.customers || []}
            columns={[
              { key: "companyName", label: "Company Name" },
              { key: "clientName", label: "Client Name" },
              { key: "gstin", label: "GSTIN" },
              { key: "phones", label: "Contact Number" },
              { key: "emails", label: "Email ID" },
              { key: "location", label: "Location" },
            ]}
            searchPlaceholder="Search clients"
            noRowsText="No clients yet."
            enableExport
            enableImport
            exportFileName="accounts-client-list"
            onImportRows={importCustomers}
            exportCellValue={(row, column) => {
              if (column.key === "phones") {
                return formatCustomerPhones(row).join(", ");
              }
              if (column.key === "emails") {
                return formatCustomerEmails(row).join(", ");
              }
              if (column.key === "location") {
                return [row.billingState || row.state, row.billingCountry || row.country, row.billingPincode || row.pincode]
                  .filter(Boolean)
                  .join(", ");
              }
              return row?.[column.key] ?? "";
            }}
            searchBy={(row) => [
              row.companyName || row.name,
              row.clientName,
              row.gstin,
              ...(formatCustomerPhones(row)),
              ...(formatCustomerEmails(row)),
              row.billingCountry || row.country,
              row.billingState || row.state,
              row.billingPincode || row.pincode,
              row.shippingCountry,
              row.shippingState,
              row.shippingPincode,
            ].join(" ")}
            renderCells={(row) => [
              <span className="fw-semibold">{row.companyName || row.name || "-"}</span>,
              row.clientName || "-",
              row.gstin || "-",
              <span style={{ whiteSpace: "normal" }}>{formatCustomerPhones(row).join(", ") || "-"}</span>,
              <span style={{ whiteSpace: "normal" }}>{formatCustomerEmails(row).join(", ") || "-"}</span>,
              <span style={{ whiteSpace: "normal" }}>
                {[row.billingState || row.state, row.billingCountry || row.country, row.billingPincode || row.pincode].filter(Boolean).join(", ") || "-"}
              </span>,
            ]}
            renderActions={(row) => (
              <div className="d-inline-flex gap-2">
                <button type="button" className="btn btn-sm btn-outline-info" onClick={() => editCustomer(row)}>Edit</button>
                <button type="button" className="btn btn-sm btn-outline-danger" onClick={() => deleteCustomer(row.id)}>Delete</button>
              </div>
            )}
          />
        </>
      ) : null}

      {activeTab === "items" ? (
        <>
          <div className="card p-3">
            <h6 className="mb-3">{editingItemMasterId ? "Edit Item Master" : "Create Item Master"}</h6>
            <form className="d-flex flex-column gap-3" onSubmit={saveItemMaster}>
              <div className="row g-3">
                <div className="col-12 col-xl-3">
                  <label className="form-label small text-secondary mb-1">Item Name</label>
                  <input className="form-control" value={itemMasterForm.name || ""} onChange={(e) => setItemMasterForm((p) => ({ ...p, name: e.target.value }))} placeholder="Item name" />
                </div>
                <div className="col-12 col-xl-2">
                  <label className="form-label small text-secondary mb-1">Type</label>
                  <select className="form-select" value={itemMasterForm.itemType || "Product"} onChange={(e) => setItemMasterForm((p) => ({ ...p, itemType: e.target.value }))}>
                    <option value="Product">Product</option>
                    <option value="Service">Service</option>
                  </select>
                </div>
                <div className="col-12 col-xl-2">
                  <label className="form-label small text-secondary mb-1">SKU</label>
                  <input className="form-control" value={itemMasterForm.sku || ""} onChange={(e) => setItemMasterForm((p) => ({ ...p, sku: e.target.value }))} placeholder="SKU" />
                </div>
                {isIndiaBillingOrg ? (
                  <div className="col-12 col-xl-2">
                    <label className="form-label small text-secondary mb-1">
                      {String(itemMasterForm.itemType || "Product") === "Service" ? "SAC Code" : "HSN Code"}
                    </label>
                    <input
                      className="form-control"
                      value={itemMasterForm.hsnSacCode || ""}
                      onChange={(e) => setItemMasterForm((p) => ({ ...p, hsnSacCode: e.target.value }))}
                      placeholder={String(itemMasterForm.itemType || "Product") === "Service" ? "SAC" : "HSN"}
                    />
                  </div>
                ) : null}
                <div className="col-12 col-xl-1">
                  <label className="form-label small text-secondary mb-1">Unit</label>
                  <input className="form-control" value={itemMasterForm.unit || ""} onChange={(e) => setItemMasterForm((p) => ({ ...p, unit: e.target.value }))} placeholder="Nos" />
                </div>
                <div className="col-12 col-xl-1">
                  <label className="form-label small text-secondary mb-1">Default Rate</label>
                  <input className="form-control" value={itemMasterForm.defaultRate || ""} onChange={(e) => setItemMasterForm((p) => ({ ...p, defaultRate: e.target.value }))} placeholder="0.00" />
                </div>
                <div className="col-12 col-xl-1">
                  <label className="form-label small text-secondary mb-1">Tax %</label>
                  <input className="form-control" value={itemMasterForm.taxPercent || ""} onChange={(e) => setItemMasterForm((p) => ({ ...p, taxPercent: e.target.value }))} placeholder="18" />
                </div>
              </div>
              <div className="d-flex gap-2">
                <button type="submit" className="btn btn-success btn-sm">{editingItemMasterId ? "Update Item" : "Create Item"}</button>
                {editingItemMasterId ? <button type="button" className="btn btn-outline-light btn-sm" onClick={resetItemMasterForm}>Cancel</button> : null}
              </div>
            </form>
          </div>

          <div className="d-flex flex-wrap gap-2 align-items-center">
            <button
              type="button"
              className={`btn btn-sm ${itemMasterListTypeFilter === "Product" ? "btn-success" : "btn-outline-light"}`}
              onClick={() => setItemMasterListTypeFilter("Product")}
            >
              Products
            </button>
            <button
              type="button"
              className={`btn btn-sm ${itemMasterListTypeFilter === "Service" ? "btn-success" : "btn-outline-light"}`}
              onClick={() => setItemMasterListTypeFilter("Service")}
            >
              Service
            </button>
          </div>

          <SearchablePaginatedTableCard
            title={`Item Master List (${itemMasterListTypeFilter})`}
            badgeLabel={`${filteredItemMasterRows.length} items`}
            rows={filteredItemMasterRows}
            withoutOuterCard
            columns={[
              { key: "name", label: "Item Name" },
              { key: "itemType", label: "Type" },
              { key: "sku", label: "SKU" },
              ...(isIndiaBillingOrg ? [{ key: "hsnSacCode", label: "HSN / SAC" }] : []),
              { key: "unit", label: "Unit" },
              { key: "defaultRate", label: "Default Rate" },
              { key: "taxPercent", label: "Tax %" },
            ]}
            searchPlaceholder={`Search ${String(itemMasterListTypeFilter).toLowerCase()} items`}
            noRowsText={`No ${String(itemMasterListTypeFilter).toLowerCase()} item masters yet.`}
            searchBy={(row) => [row.name, row.itemType, row.sku, row.hsnSacCode, row.unit, row.defaultRate, row.taxPercent].join(" ")}
            renderCells={(row) => [
              <span className="fw-semibold">{row.name || "-"}</span>,
              row.itemType || "Product",
              row.sku || "-",
              ...(isIndiaBillingOrg ? [row.hsnSacCode || "-"] : []),
              row.unit || "-",
              row.defaultRate || "-",
              row.taxPercent || "-",
            ]}
            renderActions={(row) => (
              <div className="d-inline-flex gap-2">
                <button type="button" className="btn btn-sm btn-outline-info" onClick={() => editItemMaster(row)}>Edit</button>
                <button type="button" className="btn btn-sm btn-outline-danger" onClick={() => deleteItemMaster(row.id)}>Delete</button>
              </div>
            )}
          />
        </>
      ) : null}

      {activeTab === "templates" ? (
        <>
          <div className="card p-3">
            <div className="d-flex align-items-center justify-content-between mb-3">
              <h6 className="mb-0">{editingTemplateId ? "Edit Billing Template" : "Create Billing Template"}</h6>
              <span className="badge bg-dark border">GST Template option included</span>
            </div>
            <form className="d-flex flex-column gap-3" onSubmit={saveBillingTemplate}>
              <div className="row g-3">
                <div className="col-12 col-xl-2">
                  <label className="form-label small text-secondary mb-1">Template Name</label>
                  <input className="form-control" value={templateForm.name || ""} onChange={(e) => setTemplateForm((p) => ({ ...p, name: e.target.value }))} placeholder="Default GST Invoice Template" />
                </div>
                <div className="col-12 col-md-4 col-xl-1">
                  <label className="form-label small text-secondary mb-1">Type</label>
                  <select className="form-select" value={templateForm.docType || "Invoice"} onChange={(e) => setTemplateForm((p) => ({ ...p, docType: e.target.value }))}>
                    <option value="Invoice">Invoice</option>
                    <option value="Estimate">Estimate</option>
                  </select>
                </div>
                <div className="col-12 col-md-4 col-xl-2">
                  <label className="form-label small text-secondary mb-1">GST Template</label>
                  <select className="form-select" value={templateForm.gstTemplateId || ""} onChange={(e) => setTemplateForm((p) => ({ ...p, gstTemplateId: e.target.value }))}>
                    <option value="">Select GST Template</option>
                    {(moduleData.gstTemplates || []).map((row) => (
                      <option key={row.id} value={row.id}>{row.name}</option>
                    ))}
                  </select>
                </div>
                <div className="col-12 col-md-4 col-xl-1">
                  <label className="form-label small text-secondary mb-1">Prefix</label>
                  <input className="form-control" value={templateForm.prefix || ""} onChange={(e) => setTemplateForm((p) => ({ ...p, prefix: e.target.value }))} placeholder="INV" />
                </div>
                <div className="col-12 col-md-4 col-xl-2">
                  <label className="form-label small text-secondary mb-1">Inv Start From</label>
                  <input
                    type="number"
                    min="1"
                    step="1"
                    className="form-control"
                    value={templateForm.invStartFrom || ""}
                    onChange={(e) => setTemplateForm((p) => ({ ...p, invStartFrom: e.target.value }))}
                    placeholder="1001"
                  />
                </div>
                <div className="col-12 col-md-4 col-xl-1">
                  <label className="form-label small text-secondary mb-1">Color</label>
                  <input type="color" className="form-control form-control-color w-100" value={templateForm.themeColor || "#22c55e"} onChange={(e) => setTemplateForm((p) => ({ ...p, themeColor: e.target.value }))} />
                </div>
                <div className="col-12 col-md-4 col-xl-1">
                  <label className="form-label small text-secondary mb-1">Status</label>
                  <select className="form-select" value={templateForm.status || "Active"} onChange={(e) => setTemplateForm((p) => ({ ...p, status: e.target.value }))}>
                    {GST_STATUS_OPTIONS.map((status) => (
                      <option key={status} value={status}>{status}</option>
                    ))}
                  </select>
                </div>
                <div className="col-12 col-xl-2">
                  <label className="form-label small text-secondary mb-1">Company Logo</label>
                  <div className="d-flex flex-wrap align-items-center gap-2">
                    <input
                      type="file"
                      accept=".jpg,.jpeg,.png,image/jpeg,image/png"
                      className="form-control form-control-sm"
                      onChange={(e) => {
                        handleBillingTemplateLogoChange(e.target.files?.[0]);
                        e.target.value = "";
                      }}
                    />
                    {templateForm.companyLogoDataUrl ? (
                      <>
                        <img
                          src={templateForm.companyLogoDataUrl}
                          alt="Company logo preview"
                          style={{ width: 36, height: 36, objectFit: "contain", borderRadius: 6, border: "1px solid var(--bs-border-color)" }}
                        />
                        <span className="small text-secondary text-truncate" style={{ maxWidth: 180 }}>
                          {templateForm.companyLogoName || "logo"}
                        </span>
                        <button
                          type="button"
                          className="btn btn-outline-light btn-sm"
                          onClick={() => setTemplateForm((p) => ({ ...p, companyLogoDataUrl: "", companyLogoName: "" }))}
                        >
                          Remove
                        </button>
                      </>
                    ) : null}
                  </div>
                </div>
                <div className="col-12 col-xl-6">
                  <label className="form-label small text-secondary mb-1">Customer Notes (Default)</label>
                  <input className="form-control" value={templateForm.footerNote || ""} onChange={(e) => setTemplateForm((p) => ({ ...p, footerNote: e.target.value }))} placeholder="Thank you for your business." />
                </div>
                <div className="col-12 col-xl-6">
                  <label className="form-label small text-secondary mb-1">Terms &amp; Conditions (Default)</label>
                  <input className="form-control" value={templateForm.termsText || ""} onChange={(e) => setTemplateForm((p) => ({ ...p, termsText: e.target.value }))} placeholder="Payment due within 7 days. Please contact your org admin for support." />
                </div>
              </div>
              <div className="d-flex gap-2">
                <button type="submit" className="btn btn-success btn-sm">{editingTemplateId ? "Update Billing Template" : "Create Billing Template"}</button>
                {editingTemplateId ? <button type="button" className="btn btn-outline-light btn-sm" onClick={resetTemplateForm}>Cancel</button> : null}
              </div>
            </form>
          </div>

          <SearchablePaginatedTableCard
            title="Billing Template List"
            badgeLabel={`${(moduleData.billingTemplates || []).length} templates`}
            rows={moduleData.billingTemplates || []}
            withoutOuterCard
            columns={[
              { key: "name", label: "Template" },
              { key: "docType", label: "Type" },
              { key: "gstTemplateId", label: "GST Template" },
              { key: "companyLogoDataUrl", label: "Logo" },
              { key: "prefix", label: "Prefix" },
              { key: "themeColor", label: "Theme" },
              { key: "status", label: "Status" },
            ]}
            searchPlaceholder="Search billing templates"
            noRowsText="No billing templates yet."
            searchBy={(row) => [row.name, row.docType, row.prefix, row.status, row.footerNote].join(" ")}
            renderCells={(row) => [
              <div>
                <div className="fw-semibold">{row.name}</div>
                <div className="small text-secondary">{row.footerNote || "-"}</div>
              </div>,
              row.docType,
              resolveGstTemplateName(row.gstTemplateId),
              row.companyLogoDataUrl ? (
                <div className="d-flex align-items-center gap-2">
                  <img
                    src={row.companyLogoDataUrl}
                    alt={row.companyLogoName || "Company logo"}
                    style={{ width: 28, height: 28, objectFit: "contain", borderRadius: 4, border: "1px solid var(--bs-border-color)" }}
                  />
                  <span className="small text-secondary">{row.companyLogoName || "Logo"}</span>
                </div>
              ) : (
                <span className="small text-secondary">No logo</span>
              ),
              row.prefix || "-",
              <div className="d-flex align-items-center gap-2">
                <span style={{ width: 14, height: 14, borderRadius: 4, background: row.themeColor || "#22c55e", display: "inline-block" }} />
                <span>{row.themeColor || "-"}</span>
              </div>,
              (
                <select
                  className="form-select form-select-sm"
                  value={row.status || "Active"}
                  onChange={(e) => updateBillingTemplateStatus(row.id, e.target.value)}
                >
                  {GST_STATUS_OPTIONS.map((status) => (
                    <option key={status} value={status}>{status}</option>
                  ))}
                </select>
              ),
            ]}
            renderActions={(row) => (
              <div className="d-inline-flex gap-2">
                <button type="button" className="btn btn-sm btn-outline-info" onClick={() => editBillingTemplate(row)}>Edit</button>
                <button type="button" className="btn btn-sm btn-outline-danger" onClick={() => deleteBillingTemplate(row.id)}>Delete</button>
              </div>
            )}
          />
        </>
      ) : null}

      {activeTab === "estimates" ? (
        <>
          <DocumentTable kind="estimate" rows={moduleData.estimates || []} statusOptions={ESTIMATE_STATUS_OPTIONS} />
          <BillingDocumentEditor
            kind="estimate"
            form={estimateForm}
            setField={(key, value) => setDocField("estimate", key, value)}
            totals={estimateTotals}
            onSave={(event) => saveDocument("estimate", event)}
            onCancelEdit={() => {
              setEditingEstimateId("");
              setEstimateForm(createEmptyBillingDocument("estimate"));
            }}
            editingId={editingEstimateId}
          />
        </>
      ) : null}

      {activeTab === "invoices" ? (
        <>
          <BillingDocumentEditor
            kind="invoice"
            form={invoiceForm}
            setField={(key, value) => setDocField("invoice", key, value)}
            totals={invoiceTotals}
            onSave={(event) => saveDocument("invoice", event)}
            onCancelEdit={() => {
              setEditingInvoiceId("");
              setInvoiceForm(createEmptyBillingDocument("invoice"));
            }}
            editingId={editingInvoiceId}
          />
        </>
      ) : null}

      {activeTab === "subscriptions" ? (
        <>
          <div className="d-flex flex-wrap gap-2 mb-3">
            <button
              type="button"
              className={`btn btn-sm ${subscriptionTopTab === "subscriptions" ? "btn-primary" : "btn-outline-light"}`}
              onClick={() => setSubscriptionTopTab("subscriptions")}
            >
              Subscriptions
            </button>
            <button
              type="button"
              className={`btn btn-sm ${subscriptionTopTab === "alerts" ? "btn-primary" : "btn-outline-light"}`}
              onClick={() => setSubscriptionTopTab("alerts")}
            >
              Alert Settings
            </button>
          </div>

          {subscriptionTopTab === "subscriptions" ? (
            <>
          <div className="row g-3">
            <div className="col-12 col-xl-6">
              <div className="card p-3">
                <h6 className="mb-3">{editingSubscriptionCategoryId ? "Edit Category" : "Create Category"}</h6>
                <form className="d-flex flex-column gap-3" onSubmit={saveSubscriptionCategory}>
                  <div className="row g-3">
                    <div className="col-12">
                      <label className="form-label small text-secondary mb-1">Category Name</label>
                      <input
                        className="form-control"
                        value={subscriptionCategoryForm.name || ""}
                        onChange={(event) => setSubscriptionCategoryForm((p) => ({ ...p, name: event.target.value }))}
                        placeholder="Cloud Hosting"
                      />
                    </div>
                    <div className="col-12">
                      <label className="form-label small text-secondary mb-1">Description</label>
                      <textarea
                        className="form-control"
                        rows={3}
                        value={subscriptionCategoryForm.description || ""}
                        onChange={(event) => setSubscriptionCategoryForm((p) => ({ ...p, description: event.target.value }))}
                      />
                    </div>
                  </div>
                  <div className="d-flex gap-2">
                    <button type="submit" className="btn btn-success btn-sm">
                      {editingSubscriptionCategoryId ? "Update" : "Create"}
                    </button>
                    {editingSubscriptionCategoryId ? (
                      <button
                        type="button"
                        className="btn btn-outline-light btn-sm"
                        onClick={resetSubscriptionCategoryForm}
                      >
                        Cancel
                      </button>
                    ) : null}
                  </div>
                </form>
              </div>

              <div className="mt-3" style={{ paddingTop: "25px" }}>
                <SearchablePaginatedTableCard
                  title="Subscription Categories"
                  badgeLabel={`${subscriptionCategories.length} items`}
                  rows={subscriptionCategories}
                  withoutOuterCard
                  columns={[
                    { key: "name", label: "Category" },
                    { key: "description", label: "Description" }
                  ]}
                  searchPlaceholder="Search subscription categories"
                  noRowsText="No categories yet."
                  searchBy={(row) => `${row.name} ${row.description}`}
                  renderCells={(row) => [row.name || "-", row.description || "-"]}
                  renderActions={(row) => (
                    <div className="d-inline-flex gap-2">
                      <button type="button" className="btn btn-sm btn-outline-info" onClick={() => editSubscriptionCategory(row)}>
                        Edit
                      </button>
                      <button type="button" className="btn btn-sm btn-outline-danger" onClick={() => deleteSubscriptionCategory(row.id)}>
                        Delete
                      </button>
                    </div>
                  )}
                />
              </div>
            </div>

            <div className="col-12 col-xl-6">
              <div className="card p-3">
                <h6 className="mb-3">{editingSubscriptionSubCategoryId ? "Edit Sub Category" : "Create Sub Category"}</h6>
                <form className="d-flex flex-column gap-3" onSubmit={saveSubscriptionSubCategory}>
                  <div className="row g-3">
                    <div className="col-12 col-md-6">
                      <label className="form-label small text-secondary mb-1">Category</label>
                      <select
                        className="form-select"
                        value={subscriptionSubCategoryForm.categoryId || ""}
                        onChange={(event) => setSubscriptionSubCategoryForm((p) => ({ ...p, categoryId: event.target.value }))}
                      >
                        <option value="">Select Category</option>
                        {subscriptionCategories.map((row) => (
                          <option key={row.id} value={row.id}>{row.name}</option>
                        ))}
                      </select>
                    </div>
                    <div className="col-12 col-md-6">
                      <label className="form-label small text-secondary mb-1">Sub Category Name</label>
                      <input
                        className="form-control"
                        value={subscriptionSubCategoryForm.name || ""}
                        onChange={(event) => setSubscriptionSubCategoryForm((p) => ({ ...p, name: event.target.value }))}
                        placeholder="Basic Plan"
                      />
                    </div>
                    <div className="col-12">
                      <label className="form-label small text-secondary mb-1">Description</label>
                      <textarea
                        className="form-control"
                        rows={3}
                        value={subscriptionSubCategoryForm.description || ""}
                        onChange={(event) => setSubscriptionSubCategoryForm((p) => ({ ...p, description: event.target.value }))}
                      />
                    </div>
                  </div>
                  <div className="d-flex gap-2">
                    <button type="submit" className="btn btn-success btn-sm">
                      {editingSubscriptionSubCategoryId ? "Update" : "Create"}
                    </button>
                    {editingSubscriptionSubCategoryId ? (
                      <button
                        type="button"
                        className="btn btn-outline-light btn-sm"
                        onClick={resetSubscriptionSubCategoryForm}
                      >
                        Cancel
                      </button>
                    ) : null}
                  </div>
                </form>
              </div>

              <div className="mt-3" style={{ paddingTop: "25px" }}>
                <SearchablePaginatedTableCard
                  title="Subscription Sub Categories"
                  badgeLabel={`${subscriptionSubCategories.length} items`}
                  rows={subscriptionSubCategories}
                  withoutOuterCard
                  columns={[
                    { key: "categoryName", label: "Category" },
                    { key: "name", label: "Sub Category" },
                    { key: "description", label: "Description" }
                  ]}
                  searchPlaceholder="Search subscription sub categories"
                  noRowsText="No sub categories yet."
                  searchBy={(row) => `${row.categoryName || getCategoryName(row.categoryId)} ${row.name} ${row.description}`}
                  renderCells={(row) => [row.categoryName || getCategoryName(row.categoryId) || "-", row.name || "-", row.description || "-"]}
                  renderActions={(row) => (
                    <div className="d-inline-flex gap-2">
                      <button type="button" className="btn btn-sm btn-outline-info" onClick={() => editSubscriptionSubCategory(row)}>
                        Edit
                      </button>
                      <button type="button" className="btn btn-sm btn-outline-danger" onClick={() => deleteSubscriptionSubCategory(row.id)}>
                        Delete
                      </button>
                    </div>
                  )}
                />
              </div>
            </div>
          </div>

          <div className="card p-3">
            <h6 className="mb-3">{editingSubscriptionId ? "Edit Subscription" : "Create Subscription"}</h6>
            <form className="d-flex flex-column gap-3" onSubmit={saveSubscription}>
              <div className="row g-3">
                <div className="col-12 col-md-3">
                  <label className="form-label small text-secondary mb-1">Subscription Title</label>
                  <input
                    className="form-control"
                    value={subscriptionForm.subscriptionTitle || ""}
                    onChange={(event) => updateSubscriptionFormField("subscriptionTitle", event.target.value)}
                    placeholder="CRM Premium Plan"
                  />
                </div>
                <div className="col-12 col-md-3">
                  <label className="form-label small text-secondary mb-1">Category</label>
                  <select
                    className="form-select"
                    value={subscriptionForm.categoryId || ""}
                    onChange={(event) => updateSubscriptionFormField("categoryId", event.target.value)}
                  >
                    <option value="">Select Category</option>
                    {subscriptionCategories.map((row) => (
                      <option key={row.id} value={row.id}>{row.name}</option>
                    ))}
                  </select>
                </div>
                <div className="col-12 col-md-3">
                  <label className="form-label small text-secondary mb-1">Sub Category</label>
                  <select
                    className="form-select"
                    value={subscriptionForm.subCategoryId || ""}
                    onChange={(event) => updateSubscriptionFormField("subCategoryId", event.target.value)}
                  >
                    <option value="">Select Sub Category</option>
                    {subscriptionSubCategoryOptions.map((row) => (
                        <option key={row.id} value={row.id}>{row.name}</option>
                      ))}
                    </select>
                  </div>
                <div className="col-12 col-md-3">
                  <label className="form-label small text-secondary mb-1">Client</label>
                  <div className="crm-inline-suggestions-wrap">
                    <input
                      className="form-control"
                      autoComplete="off"
                      value={subscriptionForm.customerName || ""}
                      onFocus={() => setSubscriptionClientSearchOpen(true)}
                      onClick={() => setSubscriptionClientSearchOpen(true)}
                      onBlur={() => window.setTimeout(() => setSubscriptionClientSearchOpen(false), 120)}
                      onChange={(event) => {
                        const nextValue = event.target.value;
                        const selectedClient = subscriptionCustomerSelectOptions.find(
                          (row) => String(row.name || "").trim().toLowerCase() === String(nextValue || "").trim().toLowerCase()
                        );
                        updateSubscriptionFormField("customerName", nextValue);
                        updateSubscriptionFormField("customerId", selectedClient?.id || "");
                        setSubscriptionClientSearchOpen(true);
                      }}
                      placeholder="Search client"
                    />
                    {subscriptionClientSearchOpen ? (
                      filteredSubscriptionCustomerSelectOptions.length ? (
                        <div className="crm-inline-suggestions">
                          <div className="crm-inline-suggestions__group">
                            <div className="crm-inline-suggestions__title">Clients</div>
                            {filteredSubscriptionCustomerSelectOptions.map((row) => (
                              <button
                                key={`subscription-client-${row.id}`}
                                type="button"
                                className="crm-inline-suggestions__item"
                                onMouseDown={(event) => event.preventDefault()}
                                onClick={() => {
                                  updateSubscriptionFormField("customerName", row.name);
                                  updateSubscriptionFormField("customerId", row.id);
                                  setSubscriptionClientSearchOpen(false);
                                }}
                              >
                                <span className="crm-inline-suggestions__item-main">{row.name}</span>
                              </button>
                            ))}
                          </div>
                        </div>
                      ) : (
                        <div className="crm-inline-suggestions">
                          <div className="crm-inline-suggestions__item">
                            <span className="crm-inline-suggestions__item-main">No clients found</span>
                          </div>
                        </div>
                      )
                    ) : null}
                  </div>
                </div>
                <div className="col-12 col-md-3">
                  <label className="form-label small text-secondary mb-1">Plan Duration</label>
                  <select
                    className="form-select"
                    value={subscriptionForm.planDuration || "30"}
                    onChange={(event) => updateSubscriptionFormField("planDuration", event.target.value)}
                  >
                    {SUBSCRIPTION_PLAN_DURATION_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                  {subscriptionForm.planDuration === "custom" ? (
                    <div className="mt-2">
                      <label className="form-label small text-secondary mb-1">Duration (Days)</label>
                      <input
                        className="form-control"
                        value={subscriptionForm.planDurationDays || ""}
                        onChange={(event) => updateSubscriptionFormField("planDurationDays", event.target.value)}
                        placeholder="Enter days"
                        type="number"
                        min="1"
                        step="1"
                      />
                    </div>
                  ) : null}
                </div>
                <div className="col-12 col-md-5">
                  <label className="form-label small text-secondary mb-1">Payment Description</label>
                  <input
                    className="form-control"
                    value={subscriptionForm.paymentDescription || ""}
                    onChange={(event) => updateSubscriptionFormField("paymentDescription", event.target.value)}
                    placeholder="Monthly recurring payment"
                  />
                </div>
                <div className="col-12 col-md-2">
                  <label className="form-label small text-secondary mb-1">Amount</label>
                  <input
                    className="form-control"
                    value={subscriptionForm.amount || ""}
                    onChange={(event) => updateSubscriptionFormField("amount", event.target.value)}
                    placeholder="0.00"
                    type="number"
                    min="0"
                    max={AMOUNT_MAX_NUMERIC_VALUE}
                    step="0.01"
                  />
                </div>
                <div className="col-12 col-md-2">
                  <label className="form-label small text-secondary mb-1">Currency</label>
                  <input
                    className="form-control"
                    value={subscriptionForm.currency || defaultCurrency}
                    onChange={(event) => updateSubscriptionFormField("currency", event.target.value)}
                    placeholder={defaultCurrency}
                  />
                </div>
                <div className="col-12 col-md-3">
                  <label className="form-label small text-secondary mb-1">Start Date</label>
                  <input
                    type="date"
                    className="form-control"
                    value={subscriptionForm.startDate || ""}
                    onChange={(event) => updateSubscriptionFormField("startDate", event.target.value)}
                  />
                </div>
                <div className="col-12 col-md-3">
                  <label className="form-label small text-secondary mb-1">End Date</label>
                  <input
                    type="date"
                    className="form-control"
                    value={subscriptionForm.endDate || ""}
                    onChange={(event) => updateSubscriptionFormField("endDate", event.target.value)}
                  />
                </div>
                <div className="col-12 col-md-3">
                  <label className="form-label small text-secondary mb-1">Status</label>
                  <select
                    className="form-select"
                    value={subscriptionForm.status || "Active"}
                    onChange={(event) => updateSubscriptionFormField("status", event.target.value)}
                  >
                    {SUBSCRIPTION_STATUS_OPTIONS.map((status) => (
                      <option key={status} value={status}>{status}</option>
                    ))}
                  </select>
                </div>
                <div className="col-12 col-md-2 d-flex align-items-end">
                  <div className="d-flex gap-2 w-100">
                    <button type="submit" className="btn btn-success btn-sm w-100">
                      {editingSubscriptionId ? "Update Subscription" : "Create Subscription"}
                    </button>
                    {editingSubscriptionId ? (
                      <button type="button" className="btn btn-outline-light btn-sm" onClick={resetSubscriptionForm}>
                        Cancel
                      </button>
                    ) : null}
                  </div>
                </div>
              </div>
            </form>
          </div>

          <div className="mt-4" style={{ paddingTop: "25px" }}>
            <SearchablePaginatedTableCard
              title="Subscription List"
              badgeLabel={`${filteredSubscriptionList.length} records`}
              rows={filteredSubscriptionList}
              columns={[
                { key: "subscriptionTitle", label: "Subscription Title" },
                { key: "customerName", label: "Customer" },
                { key: "amount", label: "Amount" },
                { key: "startDate", label: "Start Date" },
                { key: "endDate", label: "End Date" },
                { key: "status", label: "Status" }
              ]}
              searchPlaceholder="Search subscriptions"
              noRowsText="No subscriptions yet."
              searchBy={(row) => `${row.subscriptionTitle} ${row.customerName} ${row.amount} ${row.startDate} ${row.endDate} ${row.status}`}
              headerBottom={(
                <div className="d-flex flex-wrap gap-2">
                  {SUBSCRIPTION_LIST_STATUS_TABS.map((tab) => (
                    <button
                      key={`subscription-status-tab-${tab.key}`}
                      type="button"
                      className={`btn btn-sm ${subscriptionStatusTab === tab.key ? "btn-success" : "btn-outline-light"}`}
                      onClick={() => setSubscriptionStatusTab(tab.key)}
                    >
                      {tab.label} ({subscriptionStatusTabCounts[tab.key] || 0})
                    </button>
                  ))}
                </div>
              )}
              renderCells={(row) => [
                <span className="fw-semibold">{row.subscriptionTitle || "-"}</span>,
                row.customerName || "-",
                `${String(row.currency || defaultCurrency).trim() || defaultCurrency} ${String(row.amount || "0").trim()}`,
                formatDateLikeCellValue("startDate", row.startDate, "-"),
                formatDateLikeCellValue("endDate", row.endDate, "-"),
                row.status || "Active"
              ]}
              renderActions={(row) => (
                <div className="d-inline-flex gap-2">
                  <button type="button" className="btn btn-sm btn-outline-info" onClick={() => openSubscriptionView(row)}>View</button>
                  <button type="button" className="btn btn-sm btn-outline-success" onClick={() => editSubscription(row)}>Edit</button>
                  <button type="button" className="btn btn-sm btn-outline-danger" onClick={() => deleteSubscription(row.id)}>Delete</button>
                </div>
              )}
            />
          </div>
            </>
          ) : null}

          {subscriptionTopTab === "alerts" ? (
          <div id="subscription-alert-setting" className="card p-3 mt-4">
            <h6 className="mb-3">Subscription Alert Setting</h6>
            <div className="row g-3">
              <div className="col-12 col-md-4">
                <label className="form-label small text-secondary mb-1">Email Alert</label>
                <div className="crm-inline-suggestions-wrap">
                  <input
                    type="search"
                    className="form-control"
                    autoComplete="off"
                    placeholder="Search email alert days"
                    value={subscriptionEmailAlertSearch}
                    onFocus={() => setSubscriptionEmailAlertSearchOpen(true)}
                          onClick={() => setSubscriptionEmailAlertSearchOpen(true)}
                    onBlur={() => window.setTimeout(() => setSubscriptionEmailAlertSearchOpen(false), 120)}
                    onChange={(event) => {
                      setSubscriptionEmailAlertSearch(event.target.value);
                      setSubscriptionEmailAlertSearchOpen(true);
                    }}
                  />
                  {subscriptionEmailAlertSearchOpen ? (
                    <div className="crm-inline-suggestions" style={{ maxHeight: "280px", overflowY: "auto" }}>
                      <div className="crm-inline-suggestions__group">
                        <div className="crm-inline-suggestions__title">Email Alert</div>
                        {filteredSubscriptionEmailAlertOptions.length ? filteredSubscriptionEmailAlertOptions.map((option) => {
                          const nextValue = String(option.value || "").trim();
                          const checked = normalizedSubscriptionEmailAlertDays.includes(nextValue);
                          return (
                            <button
                              key={`subscription-alert-email-${option.value}`}
                              type="button"
                              className="crm-inline-suggestions__item"
                              onMouseDown={(event) => event.preventDefault()}
                              onClick={() => {
                                toggleSubscriptionAlertDay("emailAlertDays", nextValue);
                                setSubscriptionEmailAlertSearch("");
                              }}
                            >
                              <span className="d-flex align-items-center gap-2">
                                <input type="checkbox" className="form-check-input mt-0" checked={checked} readOnly />
                                <span className="crm-inline-suggestions__item-main">{option.label}</span>
                              </span>
                            </button>
                          );
                        }) : (
                          <div className="crm-inline-suggestions__item">
                            <span className="crm-inline-suggestions__item-main">No alerts found</span>
                          </div>
                        )}
                      </div>
                    </div>
                  ) : null}
                </div>
                {normalizedSubscriptionEmailAlertDays.length ? (
                  <div className="d-flex flex-wrap gap-2 mt-2">
                    {normalizedSubscriptionEmailAlertDays.map((value) => (
                      <span
                        key={`selected-email-alert-${value}`}
                        className="badge text-bg-light border d-inline-flex align-items-center gap-2 wz-selected-chip"
                      >
                        <button
                          type="button"
                          className="btn btn-sm p-0 border text-secondary bg-transparent rounded-circle d-inline-flex align-items-center justify-content-center wz-selected-chip-remove"
                          aria-label={`Remove email alert ${value}`}
                          onClick={() => {
                            updateSubscriptionFormField(
                              "emailAlertDays",
                              normalizedSubscriptionEmailAlertDays.filter((rowValue) => String(rowValue) !== String(value))
                            );
                            setSubscriptionEmailAlertSearch("");
                          }}
                        >
                          &times;
                        </button>
                        <span>{getSubscriptionAlertOptionLabel(value)}</span>
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>
              <div className="col-12 col-md-4">
                <label className="form-label small text-secondary mb-1">Whatsapp Alert</label>
                <div className="crm-inline-suggestions-wrap">
                  <input
                    type="search"
                    className="form-control"
                    autoComplete="off"
                    placeholder="Search whatsapp alert days"
                    value={subscriptionWhatsappAlertSearch}
                    onFocus={() => setSubscriptionWhatsappAlertSearchOpen(true)}
                          onClick={() => setSubscriptionWhatsappAlertSearchOpen(true)}
                    onBlur={() => window.setTimeout(() => setSubscriptionWhatsappAlertSearchOpen(false), 120)}
                    onChange={(event) => {
                      setSubscriptionWhatsappAlertSearch(event.target.value);
                      setSubscriptionWhatsappAlertSearchOpen(true);
                    }}
                  />
                  {subscriptionWhatsappAlertSearchOpen ? (
                    <div className="crm-inline-suggestions" style={{ maxHeight: "280px", overflowY: "auto" }}>
                      <div className="crm-inline-suggestions__group">
                        <div className="crm-inline-suggestions__title">Whatsapp Alert</div>
                        {filteredSubscriptionWhatsappAlertOptions.length ? filteredSubscriptionWhatsappAlertOptions.map((option) => {
                          const nextValue = String(option.value || "").trim();
                          const checked = normalizedSubscriptionWhatsappAlertDays.includes(nextValue);
                          return (
                            <button
                              key={`subscription-alert-whatsapp-${option.value}`}
                              type="button"
                              className="crm-inline-suggestions__item"
                              onMouseDown={(event) => event.preventDefault()}
                              onClick={() => {
                                toggleSubscriptionAlertDay("whatsappAlertDays", nextValue);
                                setSubscriptionWhatsappAlertSearch("");
                              }}
                            >
                              <span className="d-flex align-items-center gap-2">
                                <input type="checkbox" className="form-check-input mt-0" checked={checked} readOnly />
                                <span className="crm-inline-suggestions__item-main">{option.label}</span>
                              </span>
                            </button>
                          );
                        }) : (
                          <div className="crm-inline-suggestions__item">
                            <span className="crm-inline-suggestions__item-main">No alerts found</span>
                          </div>
                        )}
                      </div>
                    </div>
                  ) : null}
                </div>
                {normalizedSubscriptionWhatsappAlertDays.length ? (
                  <div className="d-flex flex-wrap gap-2 mt-2">
                    {normalizedSubscriptionWhatsappAlertDays.map((value) => (
                      <span
                        key={`selected-whatsapp-alert-${value}`}
                        className="badge text-bg-light border d-inline-flex align-items-center gap-2 wz-selected-chip"
                      >
                        <button
                          type="button"
                          className="btn btn-sm p-0 border text-secondary bg-transparent rounded-circle d-inline-flex align-items-center justify-content-center wz-selected-chip-remove"
                          aria-label={`Remove whatsapp alert ${value}`}
                          onClick={() => {
                            updateSubscriptionFormField(
                              "whatsappAlertDays",
                              normalizedSubscriptionWhatsappAlertDays.filter((rowValue) => String(rowValue) !== String(value))
                            );
                            setSubscriptionWhatsappAlertSearch("");
                          }}
                        >
                          &times;
                        </button>
                        <span>{getSubscriptionAlertOptionLabel(value)}</span>
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>
              <div className="col-12 col-md-4">
                <label className="form-label small text-secondary mb-1">Assign To</label>
                <div className="crm-inline-suggestions-wrap">
                  <input
                    type="search"
                    className="form-control"
                    autoComplete="off"
                    placeholder="Search department or user"
                    value={subscriptionAssignSearch}
                    onFocus={() => setSubscriptionAssignSearchOpen(true)}
                          onClick={() => setSubscriptionAssignSearchOpen(true)}
                    onBlur={() => window.setTimeout(() => setSubscriptionAssignSearchOpen(false), 120)}
                    onChange={(event) => {
                      setSubscriptionAssignSearch(event.target.value);
                      setSubscriptionAssignSearchOpen(true);
                    }}
                  />
                  {subscriptionAssignSearchOpen ? (
                    <div className="crm-inline-suggestions" style={{ maxHeight: "280px", overflowY: "auto" }}>
                      {filteredSubscriptionAssignDepartmentOptions.length ? (
                        <div className="crm-inline-suggestions__group">
                          <div className="crm-inline-suggestions__title">Departments</div>
                          {filteredSubscriptionAssignDepartmentOptions.map((option) => (
                            <button
                              key={`subscription-alert-department-${option.value}`}
                              type="button"
                              className="crm-inline-suggestions__item"
                              onMouseDown={(event) => event.preventDefault()}
                              onClick={() => toggleSubscriptionAssignee(option)}
                            >
                              <span className="d-flex align-items-center gap-2">
                                <input
                                  type="checkbox"
                                  className="form-check-input mt-0"
                                  checked={normalizedSubscriptionEmailAlertAssignees.some((row) => row.type === "department" && String(row.value) === String(option.value))}
                                  readOnly
                                />
                                <span className="crm-inline-suggestions__item-main">{option.label}</span>
                              </span>
                            </button>
                          ))}
                        </div>
                      ) : null}
                      {filteredSubscriptionAssignUserOptions.length ? (
                        <div className="crm-inline-suggestions__group">
                          <div className="crm-inline-suggestions__title">Users</div>
                          {filteredSubscriptionAssignUserOptions.map((option) => (
                            <button
                              key={`subscription-alert-user-${option.type}-${option.value}`}
                              type="button"
                              className="crm-inline-suggestions__item"
                              onMouseDown={(event) => event.preventDefault()}
                              onClick={() => toggleSubscriptionAssignee(option)}
                            >
                              <span className="d-flex align-items-center gap-2">
                                <input
                                  type="checkbox"
                                  className="form-check-input mt-0"
                                  checked={normalizedSubscriptionEmailAlertAssignees.some((row) => row.type === "user" && String(row.value) === String(option.value))}
                                  readOnly
                                />
                                <span>
                                  <span className="crm-inline-suggestions__item-main d-block">{option.label}</span>
                                  <span className="crm-inline-suggestions__item-sub">
                                    {[option.department, option.email].filter(Boolean).join(" / ") || "No details"}
                                  </span>
                                </span>
                              </span>
                            </button>
                          ))}
                        </div>
                      ) : null}
                      {(!filteredSubscriptionAssignDepartmentOptions.length && !filteredSubscriptionAssignUserOptions.length) ? (
                        <div className="crm-inline-suggestions__group">
                          <div className="crm-inline-suggestions__item">
                            <span className="crm-inline-suggestions__item-main">No department or user found</span>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </div>
                <div className="d-flex flex-wrap gap-2 mt-2">
                  {normalizedSubscriptionEmailAlertAssignees.length ? normalizedSubscriptionEmailAlertAssignees.map((assignee) => (
                    <span
                      key={`selected-subscription-alert-assignee-${assignee.type}-${assignee.value}`}
                      className="badge text-bg-light border d-inline-flex align-items-center gap-2 wz-selected-chip"
                    >
                      <button
                        type="button"
                        className="btn btn-sm p-0 border text-secondary bg-transparent rounded-circle d-inline-flex align-items-center justify-content-center wz-selected-chip-remove"
                        aria-label={`Remove ${getSubscriptionAlertAssigneeLabel(assignee)}`}
                        onClick={() => toggleSubscriptionAssignee(assignee)}
                      >
                        &times;
                      </button>
                      <span>{getSubscriptionAlertAssigneeLabel(assignee)}</span>
                    </span>
                  )) : (
                    <div className="small text-secondary">No assignees selected yet.</div>
                  )}
                </div>
              </div>
            </div>
          </div>
          ) : null}

          {subscriptionLoading ? <div className="text-secondary small">Loading subscriptions...</div> : null}
        </>
      ) : null}

      {subscriptionView ? (
        <div
          className="position-fixed top-0 start-0 w-100 h-100 d-flex align-items-center justify-content-center"
          style={{ background: "rgba(0,0,0,0.65)", zIndex: 1050, padding: "1rem" }}
          onClick={closeSubscriptionView}
        >
          <div className="card p-3" style={{ width: "min(720px, 100%)" }} onClick={(event) => event.stopPropagation()}>
            <div className="d-flex align-items-center justify-content-between gap-2 mb-3">
              <h5 className="mb-0">Subscription Details</h5>
              <button type="button" className="btn btn-sm btn-outline-light" onClick={closeSubscriptionView}>
                <i className="bi bi-x-lg" aria-hidden="true" />
              </button>
            </div>
            <div className="row g-3">
              <div className="col-12 col-md-6">
                <div><strong>Title:</strong> {subscriptionView.subscriptionTitle || "-"}</div>
                <div><strong>Category:</strong> {subscriptionView.categoryName || "-"}</div>
                <div><strong>Sub Category:</strong> {subscriptionView.subCategoryName || "-"}</div>
                <div><strong>Status:</strong> {subscriptionView.status || "Active"}</div>
              </div>
              <div className="col-12 col-md-6">
                <div><strong>Customer:</strong> {subscriptionView.customerName || "-"}</div>
                <div>
                  <strong>Amount:</strong> {(subscriptionView.currency || defaultCurrency).trim() || defaultCurrency} {String(subscriptionView.amount || "0").trim()}
                </div>
                <div><strong>Start Date:</strong> {subscriptionView.startDate || "-"}</div>
                <div><strong>End Date:</strong> {subscriptionView.endDate || "-"}</div>
                <div><strong>Next Billing:</strong> {subscriptionView.nextBillingDate || "-"}</div>
              </div>
              <div className="col-12">
                <div><strong>Payment Description:</strong></div>
                <p className="mb-0 text-secondary">
                  {subscriptionView.paymentDescription || "No description added."}
                </p>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function StandardModule({ heading, moduleData }) {
  return (
    <div className="d-flex flex-column gap-3">
      <div>
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

const INPUT_TYPES_WITHOUT_CHAR_LIMIT = new Set([
  "checkbox",
  "radio",
  "hidden",
  "submit",
  "button",
  "reset",
  "range",
  "file",
  "date",
  "datetime-local",
  "month",
  "week",
  "time",
  "number",
  "color",
]);

function resolveBusinessAutopilotFieldKey(target) {
  if (!target) {
    return "text";
  }
  const dataKey = String(target.getAttribute?.("data-field-key") || "").trim();
  if (dataKey) {
    return dataKey;
  }
  const name = String(target.getAttribute?.("name") || "").trim();
  if (name) {
    return name;
  }
  const id = String(target.getAttribute?.("id") || "").trim();
  if (id) {
    return id;
  }
  const placeholder = String(target.getAttribute?.("placeholder") || "").trim();
  if (placeholder) {
    return placeholder;
  }
  return "text";
}

function applyBusinessAutopilotCharacterLimit(target) {
  if (!target || target.disabled || target.readOnly) {
    return;
  }
  const isTextArea = target instanceof HTMLTextAreaElement;
  const isInput = target instanceof HTMLInputElement;
  if (!isTextArea && !isInput) {
    return;
  }
  if (isInput) {
    const inputType = String(target.type || "text").trim().toLowerCase();
    if (INPUT_TYPES_WITHOUT_CHAR_LIMIT.has(inputType)) {
      return;
    }
  }
  const fieldKey = resolveBusinessAutopilotFieldKey(target);
  const maxLength = getBusinessAutopilotMaxLength(fieldKey, { isTextarea: isTextArea });
  if (!Number.isFinite(maxLength) || maxLength <= 0) {
    return;
  }
  if (!isInput || target.maxLength !== maxLength) {
    target.maxLength = maxLength;
  }
  const clamped = clampBusinessAutopilotText(fieldKey, target.value, { isTextarea: isTextArea });
  if (target.value !== clamped) {
    target.value = clamped;
  }
}

function BusinessAutopilotFormLimitScope({ children }) {
  return (
    <div
      data-wz-skip-global-limit="true"
      onFocusCapture={(event) => applyBusinessAutopilotCharacterLimit(event.target)}
      onInputCapture={(event) => applyBusinessAutopilotCharacterLimit(event.target)}
    >
      {children}
    </div>
  );
}

export default function BusinessAutopilotModulePage({ moduleKey = "crm", title, initialTab }) {
  const moduleData = MODULE_CONTENT[moduleKey] || MODULE_CONTENT.crm;
  const heading = title || moduleData.title;

  if (moduleKey === "crm") {
    return (
      <BusinessAutopilotFormLimitScope>
        <CrmOnePageModule />
      </BusinessAutopilotFormLimitScope>
    );
  }
  if (moduleKey === "project-details") {
    return (
      <BusinessAutopilotFormLimitScope>
        <ProjectDetailPage />
      </BusinessAutopilotFormLimitScope>
    );
  }
  if (moduleKey === "projects") {
    return (
      <BusinessAutopilotFormLimitScope>
        <ProjectManagementModule />
      </BusinessAutopilotFormLimitScope>
    );
  }
  if (moduleKey === "hrm") {
    return (
      <BusinessAutopilotFormLimitScope>
        <HrManagementModule />
      </BusinessAutopilotFormLimitScope>
    );
  }
  if (moduleKey === "ticketing") {
    return (
      <BusinessAutopilotFormLimitScope>
        <TicketingSystemModule />
      </BusinessAutopilotFormLimitScope>
    );
  }
  if (moduleKey === "stocks") {
    return (
      <BusinessAutopilotFormLimitScope>
        <StocksManagementModule />
      </BusinessAutopilotFormLimitScope>
    );
  }
  if (moduleKey === "accounts") {
    return (
      <BusinessAutopilotFormLimitScope>
        <AccountsErpModule initialTab={initialTab} headingTitle={heading} />
      </BusinessAutopilotFormLimitScope>
    );
  }
  if (moduleKey === "subscriptions") {
    return (
      <BusinessAutopilotFormLimitScope>
        <AccountsErpModule initialTab="subscriptions" subscriptionsOnly headingTitle={heading} />
      </BusinessAutopilotFormLimitScope>
    );
  }

  return (
    <BusinessAutopilotFormLimitScope>
      <StandardModule heading={heading} moduleData={moduleData} />
    </BusinessAutopilotFormLimitScope>
  );
}
