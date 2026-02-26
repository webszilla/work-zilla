import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { apiFetch } from "../lib/api.js";
import { DIAL_CODE_OPTIONS, DIAL_CODE_LABEL_OPTIONS, COUNTRY_OPTIONS, getStateOptionsForCountry } from "../lib/locationData.js";
import TablePagination from "../components/TablePagination.jsx";

const STORAGE_KEY = "wz_business_autopilot_projects_module";
const CRM_STORAGE_KEY = "wz_business_autopilot_crm_module";
const HR_STORAGE_KEY = "wz_business_autopilot_hr_module";
const TICKETING_STORAGE_KEY = "wz_business_autopilot_ticketing_module";
const STOCKS_STORAGE_KEY = "wz_business_autopilot_stocks_module";
const ACCOUNTS_STORAGE_KEY = "wz_business_autopilot_accounts_module";
const DEFAULT_TABLE_PAGE_SIZE = 5;

function normalizeCountryName(value) {
  return String(value || "").trim().toLowerCase();
}

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
      { label: "Receivables", value: "INR 3.2L" },
      { label: "GST Status", value: "Ready" }
    ],
    sections: [
      "Invoice and billing",
      "Expense tracking",
      "GST reports",
      "Vendor and purchase entries"
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

const CRM_SECTION_CONFIG = {
  leads: {
    label: "Leads",
    itemLabel: "Lead",
    icon: "bi-person-plus",
    columns: [
      { key: "name", label: "Lead Name" },
      { key: "company", label: "Company" },
      { key: "phone", label: "Phone" },
      { key: "stage", label: "Stage" },
      { key: "status", label: "Status" }
    ],
    fields: [
      { key: "name", label: "Lead Name", placeholder: "Enter lead name" },
      { key: "company", label: "Company", placeholder: "Company / Business name" },
      { key: "phoneCountryCode", label: "Country Code", type: "select", options: DIAL_CODE_OPTIONS, defaultValue: "+91" },
      { key: "phone", label: "Phone", placeholder: "Mobile number" },
      { key: "stage", label: "Stage", type: "select", options: ["New", "Qualified", "Proposal"], defaultValue: "New" },
      { key: "status", label: "Status", type: "select", options: ["Open", "Closed", "Converted"], defaultValue: "Open" }
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
      { key: "tag", label: "Tag", type: "select", options: ["Customer", "Prospect", "Vendor"], defaultValue: "Customer" }
    ]
  },
  deals: {
    label: "Deals",
    itemLabel: "Deal",
    icon: "bi-currency-rupee",
    columns: [
      { key: "dealName", label: "Deal Name" },
      { key: "company", label: "Company" },
      { key: "stage", label: "Stage" },
      { key: "amount", label: "Amount" },
      { key: "status", label: "Status" }
    ],
    fields: [
      { key: "dealName", label: "Deal Name", placeholder: "ERP rollout annual contract" },
      { key: "company", label: "Company", placeholder: "Customer company" },
      { key: "stage", label: "Stage", type: "select", options: ["Discovery", "Proposal", "Negotiation"], defaultValue: "Discovery" },
      { key: "amount", label: "Amount", placeholder: "INR amount" },
      { key: "status", label: "Status", type: "select", options: ["Open", "Won", "Lost"], defaultValue: "Open" }
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
      { key: "owner", label: "Owner" },
      { key: "status", label: "Status" }
    ],
    fields: [
      { key: "subject", label: "Subject", placeholder: "Demo callback / pricing follow-up" },
      { key: "relatedTo", label: "Related To", placeholder: "Lead / Contact / Deal name" },
      { key: "dueDate", label: "Due Date", type: "date" },
      { key: "owner", label: "Owner", placeholder: "Sales owner" },
      { key: "status", label: "Status", type: "select", options: ["Pending", "Completed", "Missed"], defaultValue: "Pending" }
    ]
  },
  activities: {
    label: "Activities",
    itemLabel: "Activity",
    icon: "bi-clock-history",
    columns: [
      { key: "activityType", label: "Activity Type" },
      { key: "relatedTo", label: "Related To" },
      { key: "date", label: "Date" },
      { key: "owner", label: "Owner" },
      { key: "notes", label: "Notes" }
    ],
    fields: [
      { key: "activityType", label: "Activity Type", placeholder: "Call / Meeting / Demo / Email" },
      { key: "relatedTo", label: "Related To", placeholder: "Lead / Deal / Contact" },
      { key: "date", label: "Date", placeholder: "YYYY-MM-DD" },
      { key: "owner", label: "Owner", placeholder: "User name" },
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
      { key: "owner", label: "Owner", placeholder: "Sales owner / Team member" },
      { key: "meetingMode", label: "Meeting Mode", type: "select", options: ["Online", "Offline", "Phone"], defaultValue: "Online" },
      { key: "reminderChannel", label: "Reminder Channel", type: "multiselect", options: ["App Alert", "Email", "SMS", "WhatsApp"], defaultValue: ["App Alert"] },
      { key: "reminderMinutes", label: "Reminder Before (Minutes)", type: "select", options: ["5", "10", "15", "30", "60", "120", "1440"], defaultValue: "15" },
      { key: "status", label: "Status", type: "select", options: ["Scheduled", "Completed", "Rescheduled", "Cancelled"], defaultValue: "Scheduled" }
    ]
  }
};

const DEFAULT_CRM_DATA = {
  leads: [
    { id: "crm_l1", name: "Ravi Kumar", company: "Ultra HD Prints", phoneCountryCode: "+91", phone: "9876543210", stage: "Qualified", status: "Open" },
    { id: "crm_l2", name: "Priya N", company: "North India Jewels", phoneCountryCode: "+91", phone: "9123456780", stage: "Proposal", status: "Open" }
  ],
  contacts: [
    { id: "crm_c1", name: "Ravi Kumar", company: "Ultra HD Prints", email: "ravi@uhdprints.example", phoneCountryCode: "+91", phone: "9876543210", tag: "Customer" },
    { id: "crm_c2", name: "Priya N", company: "North India Jewels", email: "priya@nij.example", phoneCountryCode: "+91", phone: "9123456780", tag: "Prospect" }
  ],
  deals: [
    { id: "crm_d1", dealName: "POS Billing Setup", company: "Ultra HD Prints", stage: "Negotiation", amount: "85000", status: "Open" },
    { id: "crm_d2", dealName: "WhatsApp Campaign Suite", company: "North India Jewels", stage: "Proposal", amount: "42000", status: "Open" }
  ],
  followUps: [
    { id: "crm_f1", subject: "Demo callback", relatedTo: "Ultra HD Prints", dueDate: "2026-02-25", owner: "GP Prakash", status: "Pending" },
    { id: "crm_f2", subject: "Pricing confirmation", relatedTo: "North India Jewels", dueDate: "2026-02-25", owner: "GP Prakash", status: "Pending" }
  ],
  activities: [
    { id: "crm_a1", activityType: "Call", relatedTo: "Ultra HD Prints", date: "2026-02-24", owner: "GP Prakash", notes: "Discussed rollout scope" },
    { id: "crm_a2", activityType: "Email", relatedTo: "North India Jewels", date: "2026-02-24", owner: "GP Prakash", notes: "Sent proposal PDF" }
  ],
  meetings: [
    { id: "crm_m1", title: "Ultra HD Prints Demo", relatedTo: "Ultra HD Prints", meetingDate: "2026-02-26", meetingTime: "11:00", owner: "GP Prakash", meetingMode: "Online", reminderChannel: "WhatsApp", reminderMinutes: "30", status: "Scheduled", reminderSummary: "WhatsApp • 30 min before" },
    { id: "crm_m2", title: "North India Jewels Pricing Call", relatedTo: "North India Jewels", meetingDate: "2026-02-27", meetingTime: "16:30", owner: "GP Prakash", meetingMode: "Phone", reminderChannel: "App Alert", reminderMinutes: "15", status: "Scheduled", reminderSummary: "App Alert • 15 min before" }
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
  }
};

const DEFAULT_PROJECT_DATA = {
  projects: [
    { id: "p1", name: "ERP Rollout", owner: "Guru", status: "Active" },
    { id: "p2", name: "HR Automation", owner: "Nithya", status: "Planned" }
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
  ]
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
      { key: "name", label: "Name", placeholder: "Select employee from created users" },
      { key: "department", label: "Department", placeholder: "Auto from user / editable" },
      { key: "designation", label: "Employee Role", placeholder: "Auto from user / editable" },
      { key: "dateOfBirth", label: "Date of Birth", type: "date" },
      { key: "bloodGroup", label: "Blood Group", type: "select", options: ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"] },
      { key: "fatherName", label: "Father Name", placeholder: "Father name" },
      { key: "motherName", label: "Mother Name", placeholder: "Mother name" },
      { key: "maritalStatus", label: "Marital Status", type: "select", options: ["Single", "Married", "Divorced", "Widowed"] },
      { key: "wifeName", label: "Wife Name", placeholder: "Wife name", optional: true, conditionalOn: { key: "maritalStatus", value: "Married" } },
      { key: "permanentAddress", label: "Permanent Address", placeholder: "Permanent address", type: "textarea" },
      { key: "permanentCountry", label: "Permanent Country", placeholder: "Country" },
      { key: "permanentState", label: "Permanent State", placeholder: "State" },
      { key: "permanentCity", label: "Permanent City", placeholder: "City" },
      { key: "permanentPincode", label: "Permanent Pincode", placeholder: "Pincode" },
      { key: "temporaryAddress", label: "Temporary Address", placeholder: "Temporary address", type: "textarea" },
      { key: "temporaryCountry", label: "Temporary Country", placeholder: "Country" },
      { key: "temporaryState", label: "Temporary State", placeholder: "State" },
      { key: "temporaryCity", label: "Temporary City", placeholder: "City" },
      { key: "temporaryPincode", label: "Temporary Pincode", placeholder: "Pincode" }
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
    { id: "a1", employee: "Guru", date: "2026-02-19", entryMode: "HR Side", inTime: "09:10", outTime: "18:05", workedHours: "8h 55m", status: "Present", notes: "" },
    { id: "a2", employee: "Nithya", date: "2026-02-19", entryMode: "User Side", inTime: "09:25", outTime: "17:48", workedHours: "8h 23m", status: "Present", notes: "" }
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
      { key: "subject", label: "Subject", placeholder: "Customer login issue" },
      { key: "mainCategory", label: "Category", placeholder: "Select category" },
      { key: "subCategory", label: "Sub Category", placeholder: "Select sub category" },
      { key: "status", label: "Status", placeholder: "Open / In Progress / Closed" },
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
  const n = Number(value || 0);
  return Number.isFinite(n) ? n : 0;
}

function formatInr(amount) {
  return `INR ${parseNumber(amount).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
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
    notes: "",
    termsText: "",
    paymentStatus: kind === "invoice" ? "Pending" : "",
    deliveryStatus: kind === "invoice" ? "Pending" : "",
    inventoryCommitted: false,
    items: [createEmptyDocLine()]
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
    } else {
      acc[field.key] = field.defaultValue ?? "";
    }
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
  return value && typeof value === "object" && Object.keys(CRM_SECTION_CONFIG).every((key) => Array.isArray(value[key]));
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

function getTodayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

function getCurrentTimeHm() {
  const now = new Date();
  const hh = String(now.getHours()).padStart(2, "0");
  const mm = String(now.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
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
  exportFileName = "table-data",
  exportCellValue,
  actionHeaderStyle = null,
  actionCellStyle = null,
}) {
  const [searchTerm, setSearchTerm] = useState("");
  const [page, setPage] = useState(1);

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
    return String(value);
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

  const toolbarControls = (
    <div className="d-flex flex-wrap align-items-center justify-content-end gap-2">
      {badgeLabel ? <span className="badge bg-secondary table-count-badge">{badgeLabel}</span> : null}
      {enableExport ? (
        <>
          <button type="button" className="btn btn-sm btn-outline-success" onClick={exportAsExcelCsv}>
            <i className="bi bi-file-earmark-excel me-1" aria-hidden="true" />
            Excel
          </button>
          <button type="button" className="btn btn-sm btn-outline-light" onClick={exportAsPdf}>
            <i className="bi bi-file-earmark-pdf me-1" aria-hidden="true" />
            PDF
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
    </div>
  );
}

function CrmOnePageModule() {
  const sectionOrder = ["leads", "contacts", "deals", "followUps", "meetings", "activities"];
  const [moduleData, setModuleData] = useState(DEFAULT_CRM_DATA);
  const [activeSection, setActiveSection] = useState(sectionOrder[0]);
  const [calendarMonthDate, setCalendarMonthDate] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [meetingPopup, setMeetingPopup] = useState(null);
  const [leadStatusTab, setLeadStatusTab] = useState("all");
  const [meetingStatusTab, setMeetingStatusTab] = useState("all");
  const [forms, setForms] = useState(() =>
    Object.fromEntries(
      Object.entries(CRM_SECTION_CONFIG).map(([key, config]) => [key, buildEmptyValues(config.fields)])
    )
  );
  const [editingIds, setEditingIds] = useState(() =>
    Object.fromEntries(Object.keys(CRM_SECTION_CONFIG).map((key) => [key, ""]))
  );

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
      // Ignore invalid CRM cache.
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem(CRM_STORAGE_KEY, JSON.stringify(moduleData));
  }, [moduleData]);

  useEffect(() => {
    if (activeSection !== "meetings") {
      setMeetingPopup(null);
    }
  }, [activeSection]);

  const stats = useMemo(() => {
    const leads = moduleData.leads || [];
    const deals = moduleData.deals || [];
    const followUps = moduleData.followUps || [];
    const openLeads = leads.filter((row) => !["closed", "converted"].includes(String(row.status || "").toLowerCase())).length;
    const pipelineValue = deals
      .filter((row) => !["won", "lost", "closed"].includes(String(row.status || "").toLowerCase()))
      .reduce((sum, row) => sum + parseNumber(row.amount), 0);
    const today = new Date().toISOString().slice(0, 10);
    const followupsToday = followUps.filter((row) => {
      if (String(row.dueDate || "") !== today) return false;
      const status = String(row.status || "").toLowerCase();
      return status !== "done" && status !== "completed";
    }).length;
    return [
      { label: "Open Leads", value: String(openLeads), icon: "bi-person-plus" },
      { label: "Pipeline Value", value: `INR ${pipelineValue.toLocaleString("en-IN")}`, icon: "bi-graph-up-arrow" },
      { label: "Follow-ups Today", value: String(followupsToday), icon: "bi-telephone-forward" },
    ];
  }, [moduleData]);

  function setField(sectionKey, fieldKey, value) {
    setForms((prev) => ({
      ...prev,
      [sectionKey]: {
        ...prev[sectionKey],
        [fieldKey]: value,
      },
    }));
  }

  function resetSectionForm(sectionKey) {
    setEditingIds((prev) => ({ ...prev, [sectionKey]: "" }));
    setForms((prev) => ({
      ...prev,
      [sectionKey]: buildEmptyValues(CRM_SECTION_CONFIG[sectionKey].fields),
    }));
  }

  function onEdit(sectionKey, row) {
    setEditingIds((prev) => ({ ...prev, [sectionKey]: row.id }));
    const nextValues = {};
    CRM_SECTION_CONFIG[sectionKey].fields.forEach((field) => {
      const rowValue = row[field.key];
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
      } else {
        nextValues[field.key] = rowValue ?? field.defaultValue ?? "";
      }
    });
    setForms((prev) => ({ ...prev, [sectionKey]: nextValues }));
  }

  function onDelete(sectionKey, rowId) {
    setModuleData((prev) => ({
      ...prev,
      [sectionKey]: (prev[sectionKey] || []).filter((row) => row.id !== rowId),
    }));
    if (editingIds[sectionKey] === rowId) {
      resetSectionForm(sectionKey);
    }
  }

  function onSubmit(sectionKey, event) {
    event.preventDefault();
    const config = CRM_SECTION_CONFIG[sectionKey];
    const values = forms[sectionKey] || {};
    const hasEmptyField = config.fields.some((field) => {
      if (field.type === "multiselect") {
        return !Array.isArray(values[field.key]) || values[field.key].length === 0;
      }
      return !String(values[field.key] || "").trim();
    });
    if (hasEmptyField) {
      return;
    }
    const payload = {};
    config.fields.forEach((field) => {
      if (field.type === "multiselect") {
        payload[field.key] = Array.isArray(values[field.key]) ? values[field.key].map((v) => String(v).trim()).filter(Boolean) : [];
      } else {
        payload[field.key] = String(values[field.key] || "").trim();
      }
    });
    if (sectionKey === "meetings") {
      const reminderChannels = Array.isArray(payload.reminderChannel) ? payload.reminderChannel : [payload.reminderChannel].filter(Boolean);
      payload.reminderSummary = `${reminderChannels.join(", ")} • ${payload.reminderMinutes} min before`;
    }
    const editingId = editingIds[sectionKey];
    setModuleData((prev) => {
      const rows = prev[sectionKey] || [];
      if (editingId) {
        return {
          ...prev,
          [sectionKey]: rows.map((row) => (row.id === editingId ? { ...row, ...payload } : row)),
        };
      }
      return {
        ...prev,
        [sectionKey]: [{ id: `${sectionKey}_${Date.now()}`, ...payload }, ...rows],
      };
    });
    resetSectionForm(sectionKey);
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
      const isoDate = current.toISOString().slice(0, 10);
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

  function openMeetingPopup(row) {
    setMeetingPopup(row);
  }

  function closeMeetingPopup() {
    setMeetingPopup(null);
  }

  return (
    <div className="d-flex flex-column gap-3">
      <div>
        <h4 className="mb-2">CRM</h4>
        <p className="text-secondary mb-3">Manage leads, contacts, deals, follow-ups, and activity timeline in one page.</p>
        <div className="d-flex flex-wrap gap-2">
          {sectionOrder.map((sectionKey) => {
            const config = CRM_SECTION_CONFIG[sectionKey];
            const count = Array.isArray(moduleData[sectionKey]) ? moduleData[sectionKey].length : 0;
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
      ) : null}

      {sectionOrder.filter((sectionKey) => sectionKey === activeSection).map((sectionKey) => {
        const config = CRM_SECTION_CONFIG[sectionKey];
        const rows = moduleData[sectionKey] || [];
        const leadStatusTabs = [
          { key: "all", label: "All" },
          { key: "open", label: "Open" },
          { key: "closed", label: "Closed" },
          { key: "converted", label: "Converted" },
        ];
        const meetingStatusTabs = [
          { key: "all", label: "All" },
          { key: "scheduled", label: "Scheduled" },
          { key: "completed", label: "Completed" },
          { key: "rescheduled", label: "Rescheduled" },
          { key: "cancelled", label: "Cancelled" },
        ];
        const filteredRows = sectionKey === "leads"
          ? rows.filter((row) => {
              if (leadStatusTab === "all") {
                return true;
              }
              return String(row.status || "").trim().toLowerCase() === leadStatusTab;
            })
          : sectionKey === "meetings"
          ? rows.filter((row) => {
              if (meetingStatusTab === "all") {
                return true;
              }
              return String(row.status || "").trim().toLowerCase() === meetingStatusTab;
            })
          : rows;
        const leadTabCounts = sectionKey === "leads"
          ? leadStatusTabs.reduce((acc, tab) => {
              acc[tab.key] = tab.key === "all"
                ? rows.length
                : rows.filter((row) => String(row.status || "").trim().toLowerCase() === tab.key).length;
              return acc;
            }, {})
          : {};
        const meetingTabCounts = sectionKey === "meetings"
          ? meetingStatusTabs.reduce((acc, tab) => {
              acc[tab.key] = tab.key === "all"
                ? rows.length
                : rows.filter((row) => String(row.status || "").trim().toLowerCase() === tab.key).length;
              return acc;
            }, {})
          : {};
        const formValues = forms[sectionKey] || {};
        const editingId = editingIds[sectionKey] || "";
        const hasPhoneCountryCodeField = config.fields.some((field) => field.key === "phoneCountryCode");
        return (
          <div key={sectionKey} className="d-flex flex-column gap-3">
            <div className="card p-3">
              <h6 className="mb-3">{editingId ? `Edit ${config.itemLabel}` : `Create ${config.itemLabel}`}</h6>
              <form className="d-flex flex-column gap-3" onSubmit={(event) => onSubmit(sectionKey, event)}>
                <div className="row g-3">
                  {config.fields.map((field) => (
                    <Fragment key={`${sectionKey}-${field.key}`}>
                      {hasPhoneCountryCodeField && field.key === "phoneCountryCode" ? null : (
                      <div
                        className={
                          sectionKey === "leads"
                            ? (
                                field.key === "name" || field.key === "company"
                                  ? "col-12 col-md-6 col-xl-3"
                                  : field.key === "phone"
                                  ? "col-12 col-md-6 col-xl-3"
                                  : field.key === "stage" || field.key === "status"
                                  ? "col-12 col-md-6 col-xl-1"
                                  : "col-12 col-md-6 col-xl-4"
                              )
                            : sectionKey === "activities"
                            ? (
                                field.key === "activityType" || field.key === "relatedTo"
                                  ? "col-12 col-md-6 col-xl-2"
                                  : field.key === "date"
                                  ? "col-12 col-md-6 col-xl-2"
                                  : field.key === "owner"
                                  ? "col-12 col-md-6 col-xl-2"
                                  : field.key === "notes"
                                  ? "col-12 col-md-6 col-xl-3"
                                  : "col-12 col-md-6 col-xl-4"
                              )
                            : sectionKey === "contacts"
                            ? (
                                field.key === "name" || field.key === "company" || field.key === "email"
                                  ? "col-12 col-md-6 col-xl-2"
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
                                  : field.key === "amount"
                                  ? "col-12 col-md-6 col-xl-2"
                                  : field.key === "status"
                                  ? "col-12 col-md-6 col-xl-2"
                                  : "col-12 col-md-6 col-xl-4"
                              )
                            : sectionKey === "followUps"
                            ? (
                                field.key === "subject" || field.key === "relatedTo"
                                  ? "col-12 col-md-6 col-xl-3"
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
                                  ? "col-12 col-md-6 col-xl-3"
                                  : field.key === "meetingMode" || field.key === "reminderChannel" || field.key === "reminderMinutes" || field.key === "status"
                                  ? "col-12 col-md-6 col-xl-2"
                                  : "col-12 col-md-6 col-xl-4"
                              )
                            : "col-12 col-md-6 col-xl-4"
                        }
                        key={`${sectionKey}-${field.key}`}
                      >
                        <label className="form-label small text-secondary mb-1">{field.label}</label>
                        {hasPhoneCountryCodeField && field.key === "phone" ? (
                          <div className="input-group">
                            <select
                              className="form-select"
                              style={{ maxWidth: (sectionKey === "leads" || sectionKey === "contacts") ? "120px" : "220px" }}
                              value={formValues.phoneCountryCode || "+91"}
                              onChange={(event) => setField(sectionKey, "phoneCountryCode", event.target.value)}
                            >
                              {DIAL_CODE_LABEL_OPTIONS.map((option) => (
                                <option key={`contact-phone-code-${option.value}`} value={option.value}>{option.label}</option>
                              ))}
                            </select>
                            <input
                              type="text"
                              className="form-control"
                              placeholder={field.placeholder}
                              value={formValues.phone || ""}
                              onChange={(event) => setField(sectionKey, "phone", event.target.value)}
                            />
                          </div>
                        ) : field.type === "datalist" ? (
                          <Fragment>
                            <input
                              type="text"
                              list={`${sectionKey}-${field.key}-datalist`}
                              className="form-control datalist-readable-input"
                              placeholder={field.placeholder}
                              value={formValues[field.key] || ""}
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
                                : null}
                            </datalist>
                          </Fragment>
                        ) : field.type === "multiselect" ? (
                          <select
                            className="form-select"
                            multiple
                            size={1}
                            value={Array.isArray(formValues[field.key]) ? formValues[field.key] : []}
                            onChange={(event) => {
                              const selectedValues = Array.from(event.target.selectedOptions).map((option) => option.value);
                              setField(sectionKey, field.key, selectedValues);
                            }}
                          >
                            {(field.options || []).map((option) => (
                              <option key={option} value={option}>{option}</option>
                            ))}
                          </select>
                        ) : field.type === "select" ? (
                          <select
                            className="form-select"
                            value={formValues[field.key] || field.defaultValue || ""}
                            onChange={(event) => setField(sectionKey, field.key, event.target.value)}
                          >
                            <option value="">Select {field.label}</option>
                            {(field.options || []).map((option) => (
                              <option key={option} value={option}>{option}</option>
                            ))}
                          </select>
                        ) : field.type === "date" || field.type === "time" ? (
                          <input
                            type={field.type}
                            className="form-control"
                            value={formValues[field.key] || ""}
                            onChange={(event) => setField(sectionKey, field.key, event.target.value)}
                          />
                        ) : (
                          <input
                            type="text"
                            className="form-control"
                            placeholder={field.placeholder}
                            value={formValues[field.key] || ""}
                            onChange={(event) => setField(sectionKey, field.key, event.target.value)}
                          />
                        )}
                      </div>
                      )}
                      {(sectionKey === "leads" || sectionKey === "deals" || sectionKey === "followUps" || sectionKey === "meetings" || sectionKey === "activities") && (field.key === "status" || (sectionKey === "activities" && field.key === "notes")) ? (
                        <div
                            className={
                              sectionKey === "leads"
                              ? "col-12 col-md-6 col-xl-1 d-flex align-items-end"
                              : sectionKey === "deals"
                              ? "col-12 col-md-6 col-xl-1 d-flex align-items-end"
                              : sectionKey === "followUps"
                              ? "col-12 col-md-6 col-xl-1 d-flex align-items-end"
                              : sectionKey === "activities"
                              ? "col-12 col-md-6 col-xl-1 d-flex align-items-end"
                              : sectionKey === "meetings"
                              ? "col-12 col-md-6 col-xl-1 d-flex align-items-end"
                              : "col-12 col-md-6 col-xl-4 d-flex align-items-end"
                          }
                        >
                          <div className="d-flex gap-2 flex-wrap w-100">
                            <button
                              type="submit"
                              className={`btn btn-success btn-sm ${
                                ["leads", "contacts", "deals", "followUps", "meetings", "activities"].includes(sectionKey)
                                  ? "single-row-form-submit-btn"
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
                      {sectionKey === "contacts" && field.key === "tag" ? (
                        <div className="col-12 col-md-6 col-xl-1 d-flex align-items-end">
                          <div className="d-flex gap-2 flex-wrap w-100">
                            <button type="submit" className="btn btn-success btn-sm single-row-form-submit-btn">
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
              </form>
            </div>

            <SearchablePaginatedTableCard
              title={`${config.label} List`}
              badgeLabel={`${filteredRows.length} items`}
              rows={filteredRows}
              columns={config.columns}
              withoutOuterCard
              searchPlaceholder={`Search ${config.label.toLowerCase()}`}
              noRowsText={`No ${config.label.toLowerCase()} yet.`}
              enableExport
              exportFileName={`crm-${config.label.toLowerCase().replace(/\s+/g, "-")}`}
              headerBottom={sectionKey === "leads" ? (
                <div className="d-flex flex-column gap-2">
                  <div className="d-flex flex-wrap gap-2">
                    {leadStatusTabs.map((tab) => (
                      <button
                        key={`lead-status-tab-${tab.key}`}
                        type="button"
                        className={`btn btn-sm ${leadStatusTab === tab.key ? "btn-success" : "btn-outline-light"}`}
                        onClick={() => setLeadStatusTab(tab.key)}
                      >
                        {tab.label} ({leadTabCounts[tab.key] || 0})
                      </button>
                    ))}
                  </div>
                  <div className="small text-secondary">
                    Closed and converted leads older than 180 days will be automatically deleted.
                  </div>
                </div>
              ) : sectionKey === "meetings" ? (
                <div className="d-flex flex-wrap gap-2">
                  {meetingStatusTabs.map((tab) => (
                    <button
                      key={`meeting-status-tab-${tab.key}`}
                      type="button"
                      className={`btn btn-sm ${meetingStatusTab === tab.key ? "btn-success" : "btn-outline-light"}`}
                      onClick={() => setMeetingStatusTab(tab.key)}
                    >
                      {tab.label} ({meetingTabCounts[tab.key] || 0})
                    </button>
                  ))}
                </div>
              ) : null}
              searchBy={(row) => config.columns.map((column) => row[column.key] || "").join(" ")}
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
                  const reminderChannels = Array.isArray(row.reminderChannel)
                    ? row.reminderChannel.join(", ")
                    : String(row.reminderChannel || "");
                  return row.reminderSummary || `${reminderChannels} ${row.reminderMinutes ? `• ${row.reminderMinutes} min before` : ""}`.trim();
                }
                return row[column.key] || "";
              }}
              renderCells={(row) =>
                config.columns.map((column) => {
                  if (column.key === "phone") {
                    const phone = String(row.phone || "").trim();
                    if (!phone) return "-";
                    return `${String(row.phoneCountryCode || "+91").trim()} ${phone}`;
                  }
                  if (sectionKey === "meetings" && column.key === "meetingTime") {
                    return formatTimeToAmPm(row[column.key]);
                  }
                  return row[column.key] || "-";
                })
              }
              renderActions={(row) => (
                <div className="d-inline-flex gap-2">
                  <button type="button" className="btn btn-sm btn-outline-info" onClick={() => onEdit(sectionKey, row)}>
                    Edit
                  </button>
                  <button type="button" className="btn btn-sm btn-outline-danger" onClick={() => onDelete(sectionKey, row.id)}>
                    Delete
                  </button>
                </div>
              )}
            />

            {sectionKey === "meetings" ? (
              <div className="card p-3">
                <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-3">
                  <div>
                    <h6 className="mb-1">Meeting Schedule Calendar</h6>
                    <div className="small text-secondary">Click a meeting label to view reminder and schedule details.</div>
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

                <div
                  className="mb-2"
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(7, minmax(0, 1fr))",
                    gap: "8px",
                  }}
                >
                  {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((dayLabel) => (
                    <div key={dayLabel} className="small text-secondary text-center fw-semibold py-1">
                      {dayLabel}
                    </div>
                  ))}
                  {meetingCalendar.cells.map((cell) => (
                    <div
                      key={cell.isoDate}
                      style={{
                        minHeight: "84px",
                        border: "1px solid rgba(255,255,255,0.08)",
                        borderRadius: "10px",
                        padding: "8px",
                        backgroundColor: cell.inMonth ? "rgba(255,255,255,0.02)" : "rgba(255,255,255,0.01)",
                        opacity: cell.inMonth ? 1 : 0.55,
                      }}
                    >
                      <div className="small fw-semibold mb-1">{cell.day}</div>
                      <div className="d-flex flex-column gap-1">
                        {cell.meetings.slice(0, 3).map((meeting) => (
                          <button
                            key={meeting.id}
                            type="button"
                            className="btn btn-success btn-sm text-start"
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
                <div className="fw-semibold">{meetingPopup.meetingDate || "-"}</div>
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
                <div className="fw-semibold">{meetingPopup.reminderSummary || `${Array.isArray(meetingPopup.reminderChannel) ? meetingPopup.reminderChannel.join(", ") : (meetingPopup.reminderChannel || "-")} • ${meetingPopup.reminderMinutes || "-"} min before`}</div>
              </div>
              <div className="col-6">
                <div className="text-secondary">Status</div>
                <div className="fw-semibold">{meetingPopup.status || "-"}</div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
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
  const projectInlineSubmitTabs = new Set(["projects"]);

  const stats = useMemo(() => {
    const activeProjects = (moduleData.projects || []).filter((item) => item.status.toLowerCase() === "active").length;
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

  function onChangeField(fieldKey, nextValue) {
    setFormValues((prev) => {
      const next = { ...prev, [fieldKey]: nextValue };
      if (activeTab === "attendance" && fieldKey === "status" && nextValue !== "Permission") {
        next.permissionHours = "";
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
    const visibleFields = config.fields.filter((field) => {
      const condition = field.conditionalOn;
      if (!condition) {
        return true;
      }
      return String(formValues[condition.key] || "").trim() === String(condition.value || "").trim();
    });
    const hasEmptyField = visibleFields.some((field) => !String(formValues[field.key] || "").trim());
    if (hasEmptyField) {
      return;
    }
    const payload = {};
    config.fields.forEach((field) => {
      payload[field.key] = String(formValues[field.key]).trim();
    });
    if (activeTab === "attendance" && payload.status !== "Permission") {
      payload.permissionHours = "";
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

      <div className="card p-3">
        <h6 className="mb-3">{editingId ? `Edit ${config.itemLabel}` : `Create ${config.itemLabel}`}</h6>
        <form className="d-flex flex-column gap-3" onSubmit={onSubmit}>
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
                return (
                  <div
                    className={
                      isInlineProjectsTab
                        ? (
                            field.key === "projectName" || field.key === "owner"
                              ? "col-12 col-md-6 col-xl-4"
                              : field.key === "status"
                              ? "col-12 col-md-6 col-xl-3"
                              : "col-12 col-md-4"
                          )
                        : "col-12 col-md-4"
                    }
                    key={field.key}
                  >
                    <label className="form-label small text-secondary mb-1">{field.label}</label>
                    {field.type === "select" ? (
                      <select
                        className="form-select"
                        value={formValues[field.key] || field.defaultValue || ""}
                        onChange={(event) => onChangeField(field.key, event.target.value)}
                      >
                        <option value="">Select {field.label}</option>
                        {(field.options || []).map((option) => (
                          <option key={option} value={option}>{option}</option>
                        ))}
                      </select>
                    ) : (
                      <input
                        type={field.type || "text"}
                        className="form-control"
                        placeholder={field.placeholder}
                        value={formValues[field.key] || ""}
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
        searchBy={(row) => config.columns.map((column) => row[column.key] || "").join(" ")}
        renderCells={(row) => config.columns.map((column) => row[column.key] || "-")}
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
    </div>
  );
}

function HrManagementModule() {
  const [activeTab, setActiveTab] = useState("employees");
  const [moduleData, setModuleData] = useState(DEFAULT_HR_DATA);
  const [formValues, setFormValues] = useState(buildEmptyValues(HR_TAB_CONFIG.employees.fields));
  const [hrUserDirectory, setHrUserDirectory] = useState([]);
  const [editingId, setEditingId] = useState("");
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
  const [attendanceYearFilter, setAttendanceYearFilter] = useState("");
  const [attendanceMonthFilter, setAttendanceMonthFilter] = useState("");

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
    const applyHashTab = () => {
      const rawHash = String(window.location.hash || "").replace(/^#/, "").trim().toLowerCase();
      if (rawHash === "attendance") {
        setActiveTab("attendance");
      } else if (rawHash === "employees" || rawHash === "leaves" || rawHash === "payroll") {
        setActiveTab(rawHash);
      }
    };
    applyHashTab();
    window.addEventListener("hashchange", applyHashTab);
    return () => {
      window.removeEventListener("hashchange", applyHashTab);
    };
  }, []);

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
      } catch (_error) {
        if (!cancelled) {
          setHrUserDirectory([]);
        }
      }
    }
    loadHrUserDirectory();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    setEditingId("");
    const next = buildEmptyValues(HR_TAB_CONFIG[activeTab].fields);
    if (activeTab === "attendance") {
      next.date = getTodayIsoDate();
    }
    setFormValues(next);
  }, [activeTab]);

  const config = HR_TAB_CONFIG[activeTab];
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
  const employeeNameOptions = useMemo(
    () => Array.from(new Set((moduleData.employees || []).map((item) => String(item.name || "").trim()).filter(Boolean))),
    [moduleData.employees]
  );
  const hrUserNameOptions = useMemo(
    () =>
      Array.from(
        new Set(
          (hrUserDirectory || [])
            .map((item) => String(item?.name || "").trim())
            .filter(Boolean)
        )
      ),
    [hrUserDirectory]
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

  function onChangeField(fieldKey, nextValue) {
    setFormValues((prev) => {
      const next = { ...prev, [fieldKey]: nextValue };
      if (activeTab === "employees" && fieldKey === "name") {
        const matchedUser = hrUserLookupByName.get(String(nextValue || "").trim().toLowerCase());
        if (matchedUser) {
          next.department = String(matchedUser.department || next.department || "").trim();
          next.designation = String(matchedUser.employee_role || next.designation || "").trim();
        }
      }
      if (activeTab === "attendance" && fieldKey === "status" && nextValue !== "Permission") {
        next.permissionHours = "";
      }
      if (activeTab === "attendance" && fieldKey === "entryMode" && nextValue === "User Side") {
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
    const visibleFields = config.fields.filter((field) => {
      const condition = field.conditionalOn;
      if (!condition) {
        return true;
      }
      return String(formValues[condition.key] || "").trim() === String(condition.value || "").trim();
    });
    const hasEmptyField = visibleFields.some((field) => !field.optional && !String(formValues[field.key] || "").trim());
    if (hasEmptyField) {
      return;
    }
    const payload = {};
    config.fields.forEach((field) => {
      payload[field.key] = String(formValues[field.key]).trim();
    });
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
      <div>
        <h4 className="mb-2">HR</h4>
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

      {activeTab === "employees" ? (
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

      <div className="card p-3">
        <h6 className="mb-3">{editingId ? `Edit ${config.itemLabel}` : `Create ${config.itemLabel}`}</h6>
        <form className="d-flex flex-column gap-3" onSubmit={onSubmit}>
          <div className="row g-3">
            {config.fields.map((field) => (
              (() => {
                const condition = field.conditionalOn;
                const isVisible = !condition
                  || String(formValues[condition.key] || "").trim() === String(condition.value || "").trim();
                if (!isVisible) {
                  return null;
                }
                return (
                  <div className="col-12 col-md-4" key={field.key}>
                    <label className="form-label small text-secondary mb-1">{field.label}</label>
                    {activeTab === "attendance" && field.key === "employee" ? (
                      <div className="position-relative">
                        <input
                          type="text"
                          className="form-control"
                          autoComplete="off"
                          placeholder={field.placeholder}
                          value={formValues[field.key] || ""}
                          onFocus={() => setAttendanceEmployeeSuggestOpen(true)}
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
                      <>
                        <input
                          type="text"
                          className="form-control datalist-readable-input"
                          list="hr-employee-user-list"
                          autoComplete="off"
                          placeholder={field.placeholder}
                          value={formValues[field.key] || ""}
                          onChange={(event) => onChangeField(field.key, event.target.value)}
                        />
                        <datalist id="hr-employee-user-list">
                          {hrUserNameOptions.map((name) => (
                            <option key={`hr-user-name-${name}`} value={name} />
                          ))}
                        </datalist>
                      </>
                    ) : field.type === "select" ? (
                      <select
                        className="form-select"
                        value={formValues[field.key] || field.defaultValue || ""}
                        onChange={(event) => onChangeField(field.key, event.target.value)}
                      >
                        <option value="">Select {field.label}</option>
                        {(field.options || []).map((option) => (
                          <option key={option} value={option}>{option}</option>
                        ))}
                      </select>
                    ) : field.type === "textarea" ? (
                      <textarea
                        className="form-control"
                        rows={3}
                        placeholder={field.placeholder}
                        value={formValues[field.key] || ""}
                        onChange={(event) => onChangeField(field.key, event.target.value)}
                      />
                    ) : (
                      <input
                        type={field.type || "text"}
                        className="form-control"
                        placeholder={field.placeholder}
                        value={formValues[field.key] || ""}
                        onChange={(event) => onChangeField(field.key, event.target.value)}
                      />
                    )}
                  </div>
                );
              })()
            ))}
          </div>
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

      {activeTab === "attendance" ? (
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

      <SearchablePaginatedTableCard
        title={config.label}
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
          return row[column.key] || "-";
        })}
        renderActions={(row) => (
          <div className="d-inline-flex gap-2 flex-nowrap">
            {activeTab === "attendance" ? (() => {
              const hasTaskList = Boolean(String(row?.completedTasks || "").trim());
              return (
                <>
                  <button
                    type="button"
                    className={`btn btn-sm ${hasTaskList ? "btn-primary" : "btn-secondary"}`}
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
            <button type="button" className="btn btn-sm btn-outline-info" onClick={() => onEditRow(row)}>
              Edit
            </button>
            <button type="button" className="btn btn-sm btn-outline-danger" onClick={() => onDeleteRow(row.id)}>
              Delete
            </button>
          </div>
        )}
      />

      {activeTab === "attendance" && attendanceTaskModal.open ? (
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

      {activeTab === "attendance" && attendanceNotesModal.open ? (
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
    setFormValues((prev) => ({ ...prev, [fieldKey]: nextValue }));
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
    const hasEmptyField = cfg.fields.some((field) => !String(values[field.key] || "").trim());
    if (hasEmptyField) {
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
                      renderCells={(row) => cfg.columns.map((column) => row[column.key] || "-")}
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
            return row[column.key] || "-";
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
                          ticketNo: "col-12 col-md-6 col-xl-2",
                          subject: "col-12 col-md-6 col-xl-3",
                          mainCategory: "col-12 col-md-6 col-xl-2",
                          subCategory: "col-12 col-md-6 col-xl-2",
                          status: "col-12 col-md-6 col-xl-2",
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
                ) : field.type === "textarea" ? (
                  <textarea
                    className="form-control"
                    rows={3}
                    placeholder={field.placeholder}
                    value={formValues[field.key] || ""}
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
            return row[column.key] || "-";
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
          renderCells={(row) => config.columns.map((column) => row[column.key] || "-")}
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

function AccountsErpModule() {
  const [activeTab, setActiveTab] = useState("overview");
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
    footerNote: "",
    termsText: "",
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
    country: "India",
    state: "",
    city: "",
    pincode: ""
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
  const taxUi = useMemo(() => getAccountsTaxUiConfig(orgBillingCountry), [orgBillingCountry]);
  const isIndiaBillingOrg = useMemo(() => normalizeCountryName(orgBillingCountry) === "india", [orgBillingCountry]);

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

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const data = await apiFetch("/api/dashboard/billing-profile");
        if (!active) return;
        const country = String(data?.profile?.country || "").trim();
        if (country) {
          setOrgBillingCountry(country);
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
  const customerStateOptions = getStateOptionsForCountry(String(customerForm.country || "India"));

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
      country: row.country || "India",
      state: row.state || "",
      city: row.city || "",
      pincode: row.pincode || ""
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
      footerNote: "",
      termsText: "",
      status: "Active"
    });
  }

  function handleBillingTemplateLogoChange(file) {
    if (!file) {
      return;
    }
    if (!String(file.type || "").startsWith("image/")) {
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
      country: "India",
      state: "",
      city: "",
      pincode: ""
    });
  }

  function saveCustomer(event) {
    event.preventDefault();
    const companyName = String(customerForm.companyName || customerForm.name || "").trim();
    if (!companyName) {
      return;
    }
    const clientName = String(customerForm.clientName || "").trim();
    const primaryPhone = String(customerForm.phone || "").trim();
    const primaryEmail = String(customerForm.email || "").trim();
    const additionalPhones = (customerForm.additionalPhones || [])
      .map((row) => ({ countryCode: String(row.countryCode || "+91").trim() || "+91", number: String(row.number || "").trim() }))
      .filter((row) => row.number);
    const additionalEmails = (customerForm.additionalEmails || [])
      .map((value) => String(value || "").trim())
      .filter(Boolean);
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
      shippingAddress: String(customerForm.shippingAddress || "").trim(),
      country: String(customerForm.country || "").trim(),
      state: String(customerForm.state || "").trim(),
      city: String(customerForm.city || "").trim(),
      pincode: String(customerForm.pincode || "").trim()
    };
    setModuleData((prev) => {
      const rows = prev.customers || [];
      if (editingCustomerId) {
        return { ...prev, customers: rows.map((row) => (row.id === editingCustomerId ? { ...row, ...payload } : row)) };
      }
      return { ...prev, customers: [{ ...payload, id: `cust_${Date.now()}` }, ...rows] };
    });
    resetCustomerForm();
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
      return;
    }
    const payload = {
      ...form,
      customerName: String(form.customerName || "").trim(),
      customerGstin: String(form.customerGstin || "").trim(),
      billingAddress: String(form.billingAddress || "").trim(),
      salesperson: String(form.salesperson || "").trim(),
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
    if (kind === "estimate") {
      setEditingEstimateId("");
      setEstimateForm(createEmptyBillingDocument("estimate"));
    } else {
      setEditingInvoiceId("");
      setInvoiceForm(createEmptyBillingDocument("invoice"));
    }
  }

  function editDocument(kind, row) {
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
      inventoryCommitted: Boolean(row.inventoryCommitted)
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
    const billingTemplates = (moduleData.billingTemplates || []).filter((row) =>
      String(row.docType || "").toLowerCase() === kindLabel.toLowerCase()
    );
    const salesPeople = (erpUsersForSales || [])
      .filter((user) => Boolean(user?.name))
      .map((user) => user.name);
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
                <input
                  className="form-control datalist-readable-input"
                  list={`${kind}-client-company-list`}
                  value={form.customerName || ""}
                  onChange={(e) => {
                    const nextValue = e.target.value;
                    setField("customerName", nextValue);
                    const matched = (moduleData.customers || []).find((row) => {
                      const label = `${row.companyName || row.name || ""}${row.clientName ? ` (${row.clientName})` : ""}`;
                      return label === nextValue || (row.companyName || row.name || "") === nextValue;
                    });
                    if (matched) {
                      setField("customerName", matched.companyName || matched.name || "");
                      setField("customerGstin", matched.gstin || "");
                      setField("billingAddress", matched.billingAddress || "");
                    }
                  }}
                  placeholder="Search client / company"
                />
                <datalist id={`${kind}-client-company-list`}>
                  {customerOptions.map((row) => (
                    <option key={`${kind}-${row.id}`} value={`${row.companyName || row.name || ""}${row.clientName ? ` (${row.clientName})` : ""}`} />
                  ))}
                </datalist>
              </div>
              <div className="col-12 col-xl-1">
                <label className="form-label small text-secondary mb-1">{kindLabel} No</label>
                <input className="form-control" value={form.docNo || ""} onChange={(e) => setField("docNo", e.target.value)} placeholder={kind === "estimate" ? "EST-1001" : "INV-1001"} />
              </div>
              <div className="col-12 col-xl-2">
                <label className="form-label small text-secondary mb-1">Sales Person</label>
                <input
                  className="form-control datalist-readable-input"
                  list={`${kind}-salesperson-list`}
                  value={form.salesperson || ""}
                  onChange={(e) => setField("salesperson", e.target.value)}
                  placeholder="Select Sales Person"
                />
                <datalist id={`${kind}-salesperson-list`}>
                  {salesPeople.map((name) => (
                    <option key={`${kind}-sales-${name}`} value={name} />
                  ))}
                </datalist>
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
                <select className="form-select" value={form.billingTemplateId || ""} onChange={(e) => setField("billingTemplateId", e.target.value)}>
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
            row.issueDate || "-",
            row.dueDate || "-",
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
        <h4 className="mb-2">Accounts</h4>
        <p className="text-secondary mb-3">
          Complete billing workflow with GST templates, billing templates, estimates, invoices, and status updates.
        </p>
        {accountsSyncError ? (
          <div className="d-flex flex-wrap align-items-center gap-2 mb-2">
            <span className="small text-danger">{accountsSyncError}</span>
          </div>
        ) : null}
        <div className="d-flex flex-wrap gap-2">
          {[
            { key: "overview", label: "Overview" },
            { key: "invoices", label: "Invoices" },
            { key: "estimates", label: "Estimates" },
            { key: "gst", label: taxUi.templatesLabel },
            { key: "templates", label: "Billing Templates" },
            { key: "customers", label: "Customers" },
            { key: "items", label: "Items" }
          ].map((tab) => (
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
      </div>

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
            <h6 className="mb-3">{editingCustomerId ? "Edit Customer" : "Create Customer"}</h6>
            <form className="d-flex flex-column gap-3" onSubmit={saveCustomer}>
              <div className="row g-3">
                <div className="col-12 col-xl-4">
                  <label className="form-label small text-secondary mb-1">Company Name</label>
                  <input className="form-control" value={customerForm.companyName || ""} onChange={(e) => setCustomerForm((p) => ({ ...p, companyName: e.target.value, name: e.target.value }))} placeholder="Company name" />
                </div>
                <div className="col-12 col-xl-4">
                  <label className="form-label small text-secondary mb-1">Client Name</label>
                  <input className="form-control" value={customerForm.clientName || ""} onChange={(e) => setCustomerForm((p) => ({ ...p, clientName: e.target.value }))} placeholder="Client / Contact person" />
                </div>
                <div className="col-12 col-xl-4">
                  <label className="form-label small text-secondary mb-1">GSTIN</label>
                  <input className="form-control" value={customerForm.gstin || ""} onChange={(e) => setCustomerForm((p) => ({ ...p, gstin: e.target.value }))} placeholder="GSTIN" />
                </div>
                <div className="col-12 col-xl-6">
                  <label className="form-label small text-secondary mb-1">Phone Number</label>
                  <div className="d-flex gap-2">
                    <select
                      className="form-select"
                      style={{ maxWidth: "220px" }}
                      value={customerForm.phoneCountryCode || "+91"}
                      onChange={(e) => setCustomerForm((p) => ({ ...p, phoneCountryCode: e.target.value }))}
                    >
                      {DIAL_CODE_LABEL_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                    <input className="form-control" value={customerForm.phone || ""} onChange={(e) => setCustomerForm((p) => ({ ...p, phone: e.target.value }))} placeholder="Phone number" />
                    <button
                      type="button"
                      className="btn btn-outline-light btn-sm"
                      title="Add Contact Number"
                      onClick={() => setCustomerForm((p) => ({ ...p, additionalPhones: [...(p.additionalPhones || []), { countryCode: "+91", number: "" }] }))}
                    >
                      +
                    </button>
                  </div>
                </div>
                <div className="col-12 col-xl-6">
                  <label className="form-label small text-secondary mb-1">Email ID</label>
                  <div className="d-flex gap-2">
                    <input className="form-control" value={customerForm.email || ""} onChange={(e) => setCustomerForm((p) => ({ ...p, email: e.target.value }))} placeholder="Primary email" />
                    <button
                      type="button"
                      className="btn btn-outline-light btn-sm"
                      title="Add Email ID"
                      onClick={() => setCustomerForm((p) => ({ ...p, additionalEmails: [...(p.additionalEmails || []), ""] }))}
                    >
                      +
                    </button>
                  </div>
                </div>
                <div className="col-12 col-xl-6">
                  {(customerForm.additionalEmails || []).map((value, index) => (
                    <div className="d-flex gap-2 mb-2" key={`email-${index}`}>
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
                <div className="col-12">
                  {(customerForm.additionalPhones || []).map((row, index) => (
                    <div className="d-flex gap-2 mb-2" key={`phone-${index}`}>
                      <select
                        className="form-select"
                        style={{ maxWidth: "220px" }}
                        value={row.countryCode || "+91"}
                        onChange={(e) => setCustomerForm((p) => ({
                          ...p,
                          additionalPhones: (p.additionalPhones || []).map((item, i) => (i === index ? { ...item, countryCode: e.target.value } : item))
                        }))}
                      >
                        {DIAL_CODE_LABEL_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>{option.label}</option>
                        ))}
                      </select>
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
                <div className="col-12 col-xl-6">
                  <label className="form-label small text-secondary mb-1">Billing Address</label>
                  <textarea className="form-control" rows="2" value={customerForm.billingAddress || ""} onChange={(e) => setCustomerForm((p) => ({ ...p, billingAddress: e.target.value }))} placeholder="Billing address" />
                </div>
                <div className="col-12 col-xl-6">
                  <label className="form-label small text-secondary mb-1">Shipping Address</label>
                  <textarea className="form-control" rows="2" value={customerForm.shippingAddress || ""} onChange={(e) => setCustomerForm((p) => ({ ...p, shippingAddress: e.target.value }))} placeholder="Shipping address" />
                </div>
                <div className="col-12 col-md-3">
                  <label className="form-label small text-secondary mb-1">Country</label>
                  <select
                    className="form-select"
                    value={customerForm.country || "India"}
                    onChange={(e) => setCustomerForm((p) => ({ ...p, country: e.target.value, state: "" }))}
                  >
                    {COUNTRY_OPTIONS.map((country) => (
                      <option key={country} value={country}>{country}</option>
                    ))}
                  </select>
                </div>
                <div className="col-12 col-md-3">
                  <label className="form-label small text-secondary mb-1">State</label>
                  {customerStateOptions.length ? (
                    <select
                      className="form-select"
                      value={customerForm.state || ""}
                      onChange={(e) => setCustomerForm((p) => ({ ...p, state: e.target.value }))}
                    >
                      <option value="">Select State</option>
                      {customerStateOptions.map((state) => (
                        <option key={state} value={state}>{state}</option>
                      ))}
                    </select>
                  ) : (
                    <>
                      <input
                        className="form-control"
                        list="baerp-state-options"
                        value={customerForm.state || ""}
                        onChange={(e) => setCustomerForm((p) => ({ ...p, state: e.target.value }))}
                        placeholder="State / Province / Region"
                      />
                      <datalist id="baerp-state-options">
                        {customerStateOptions.map((state) => (
                          <option key={state} value={state} />
                        ))}
                      </datalist>
                    </>
                  )}
                </div>
                <div className="col-12 col-md-3">
                  <label className="form-label small text-secondary mb-1">City</label>
                  <input className="form-control" value={customerForm.city || ""} onChange={(e) => setCustomerForm((p) => ({ ...p, city: e.target.value }))} placeholder="City" />
                </div>
                <div className="col-12 col-md-3">
                  <label className="form-label small text-secondary mb-1">Pincode</label>
                  <input className="form-control" value={customerForm.pincode || ""} onChange={(e) => setCustomerForm((p) => ({ ...p, pincode: e.target.value }))} placeholder="Pincode" />
                </div>
              </div>
              <div className="d-flex gap-2">
                <button type="submit" className="btn btn-success btn-sm">{editingCustomerId ? "Update Customer" : "Create Customer"}</button>
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
            searchBy={(row) => [
              row.companyName || row.name,
              row.clientName,
              row.gstin,
              ...(formatCustomerPhones(row)),
              ...(formatCustomerEmails(row)),
              row.country,
              row.state,
              row.city,
              row.pincode,
            ].join(" ")}
            renderCells={(row) => [
              <span className="fw-semibold">{row.companyName || row.name || "-"}</span>,
              row.clientName || "-",
              row.gstin || "-",
              <span style={{ whiteSpace: "normal" }}>{formatCustomerPhones(row).join(", ") || "-"}</span>,
              <span style={{ whiteSpace: "normal" }}>{formatCustomerEmails(row).join(", ") || "-"}</span>,
              <span style={{ whiteSpace: "normal" }}>{[row.city, row.state, row.country, row.pincode].filter(Boolean).join(", ") || "-"}</span>,
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
                  <label className="form-label small text-secondary mb-1">Document Type</label>
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
                      accept="image/*"
                      className="form-control form-control-sm"
                      onChange={(e) => handleBillingTemplateLogoChange(e.target.files?.[0])}
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
                  <label className="form-label small text-secondary mb-1">Footer Note</label>
                  <input className="form-control" value={templateForm.footerNote || ""} onChange={(e) => setTemplateForm((p) => ({ ...p, footerNote: e.target.value }))} placeholder="Thank you for your business" />
                </div>
                <div className="col-12 col-xl-6">
                  <label className="form-label small text-secondary mb-1">Terms Text</label>
                  <input className="form-control" value={templateForm.termsText || ""} onChange={(e) => setTemplateForm((p) => ({ ...p, termsText: e.target.value }))} placeholder="Payment terms and conditions" />
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

export default function BusinessAutopilotModulePage({ moduleKey = "crm", title }) {
  const moduleData = MODULE_CONTENT[moduleKey] || MODULE_CONTENT.crm;
  const heading = title || moduleData.title;

  if (moduleKey === "crm") {
    return <CrmOnePageModule />;
  }
  if (moduleKey === "projects") {
    return <ProjectManagementModule />;
  }
  if (moduleKey === "hrm") {
    return <HrManagementModule />;
  }
  if (moduleKey === "ticketing") {
    return <TicketingSystemModule />;
  }
  if (moduleKey === "stocks") {
    return <StocksManagementModule />;
  }
  if (moduleKey === "accounts") {
    return <AccountsErpModule />;
  }

  return <StandardModule heading={heading} moduleData={moduleData} />;
}
