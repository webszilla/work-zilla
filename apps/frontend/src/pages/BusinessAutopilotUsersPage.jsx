import { useEffect, useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import { apiFetch } from "../lib/api.js";
import TablePagination from "../components/TablePagination.jsx";
import PhoneCountryCodePicker from "../components/PhoneCountryCodePicker.jsx";
import { DIAL_CODE_LABEL_OPTIONS, COUNTRY_OPTIONS, getStateOptionsForCountry } from "../lib/locationData.js";
import { HrManagementModule } from "./BusinessAutopilotModulePage.jsx";
import { clampBusinessAutopilotText, getBusinessAutopilotMaxLength } from "../lib/businessAutopilotFormRules.js";

const defaultForm = {
  first_name: "",
  last_name: "",
  email: "",
  password: "",
  phone_country_code: "+91",
  phone_number_input: "",
  role: "org_user",
  department_id: "",
  employee_role_id: ""
};

const defaultEditForm = {
  membership_id: "",
  first_name: "",
  last_name: "",
  email: "",
  password: "",
  phone_country_code: "+91",
  phone_number_input: "",
  role: "org_user",
  department_id: "",
  employee_role_id: "",
  is_active: true
};

const DEFAULT_USER_META = {
  employee_limit: 0,
  used_users: 0,
  remaining_users: null,
  addon_count: 0,
  allow_addons: false,
  has_unlimited_users: true,
  can_add_users: true,
};

const ROLE_ACCESS_STORAGE_KEY = "wz_business_autopilot_role_access";
const USER_DIRECTORY_STORAGE_KEY = "wz_business_autopilot_user_directory";
const ACCOUNTS_STORAGE_KEY = "wz_business_autopilot_accounts_module";
const HR_STORAGE_KEY = "wz_business_autopilot_hr_module";
const DIAL_COUNTRY_PICKER_OPTIONS = DIAL_CODE_LABEL_OPTIONS.map((option) => ({
  code: option.value,
  label: option.label,
  flag: option.flag,
}));
const SYSTEM_ROLE_OPTIONS = [
  { key: "system:org_user", label: "Org User" },
  { key: "system:hr_view", label: "HR View" },
];
const ROLE_ACCESS_SECTIONS = [
  { key: "dashboard", label: "Dashboard" },
  { key: "inbox", label: "Inbox" },
  { key: "crm", label: "CRM" },
  { key: "hr", label: "HR" },
  { key: "projects", label: "Projects" },
  { key: "accounts", label: "Accounts" },
  { key: "subscriptions", label: "Subscriptions" },
  { key: "ticketing", label: "Ticketing" },
  { key: "stocks", label: "Inventory" },
  { key: "users", label: "Users" },
  { key: "billing", label: "Billing" },
  { key: "plans", label: "Plans" },
  { key: "profile", label: "Profile" },
];
const ACCESS_LEVEL_OPTIONS = ["No Access", "View", "Create/Edit", "Full Access"];
const USER_DETAIL_FIELDS = [
  { key: "first_name", label: "First Name" },
  { key: "last_name", label: "Last Name" },
  { key: "email", label: "Official Email" },
  { key: "phone_number", label: "Phone Number" },
  { key: "employeeId", label: "Employee ID" },
  { key: "role", label: "Role" },
  { key: "department", label: "Department" },
  { key: "employee_role", label: "Employee Role" },
  { key: "is_active", label: "Status" },
];
const HR_EMPLOYEE_DETAIL_FIELDS = [
  { key: "name", label: "Employee Name" },
  { key: "gender", label: "Gender" },
  { key: "department", label: "Department" },
  { key: "designation", label: "Employee Role" },
  { key: "dateOfJoining", label: "Date of Joining" },
  { key: "dateOfBirth", label: "Date of Birth" },
  { key: "bloodGroup", label: "Blood Group" },
  { key: "fatherName", label: "Father's Name" },
  { key: "motherName", label: "Mother's Name" },
  { key: "maritalStatus", label: "Marital Status" },
  { key: "wifeName", label: "Spouse Name" },
  { key: "contactCountryCode", label: "Contact Country Code" },
  { key: "contactNumber", label: "Contact Number" },
  { key: "secondaryContactCountryCode", label: "Secondary Contact Country Code" },
  { key: "secondaryContactNumber", label: "Secondary Contact Number" },
  { key: "permanentAddress", label: "Permanent Address" },
  { key: "permanentCountry", label: "Permanent Country" },
  { key: "permanentState", label: "Permanent State" },
  { key: "permanentCity", label: "Permanent City" },
  { key: "permanentPincode", label: "Permanent Pincode" },
  { key: "temporaryAddress", label: "Temporary Address" },
  { key: "temporaryCountry", label: "Temporary Country" },
  { key: "temporaryState", label: "Temporary State" },
  { key: "temporaryCity", label: "Temporary City" },
  { key: "temporaryPincode", label: "Temporary Pincode" },
  { key: "temporarySameAsPermanent", label: "Temporary Same As Permanent" },
  { key: "sourceUserEmail", label: "Linked User Email" },
];

function buildCredentialShareText(credentials = {}) {
  const lines = [
    "Work Zilla Login Credentials",
    `Name: ${String(credentials.name || "-").trim()}`,
    `Email: ${String(credentials.email || "-").trim()}`,
    `Password: ${String(credentials.password || "-").trim()}`,
    `Login URL: ${String(credentials.login_url || "-").trim()}`,
  ];
  return lines.join("\n");
}

function limitedInput(fieldKey, value) {
  return clampBusinessAutopilotText(fieldKey, value, { isTextarea: false });
}

function limitedTextarea(fieldKey, value) {
  return clampBusinessAutopilotText(fieldKey, value, { isTextarea: true });
}

function evaluatePasswordStrength(value) {
  const raw = String(value || "");
  let score = 0;
  if (raw.length >= 8) score += 1;
  if (/[A-Z]/.test(raw)) score += 1;
  if (/[a-z]/.test(raw)) score += 1;
  if (/[0-9]/.test(raw)) score += 1;
  if (/[^A-Za-z0-9]/.test(raw)) score += 1;
  return score;
}

function getPasswordStrengthMeta(score) {
  if (score >= 5) return { label: "Very strong", color: "#16a34a", width: 100 };
  if (score >= 4) return { label: "Strong", color: "#22c55e", width: 80 };
  if (score >= 3) return { label: "Medium", color: "#eab308", width: 60 };
  if (score >= 2) return { label: "Weak", color: "#f97316", width: 40 };
  if (score >= 1) return { label: "Too weak", color: "#ef4444", width: 20 };
  return { label: "Too weak", color: "#ef4444", width: 0 };
}

function createEmptySharedPartyForm() {
  return {
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
    billingShippingSame: false,
  };
}

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
    ? row.phoneList.map((item) => ({
      countryCode: String(item?.countryCode || "+91").trim() || "+91",
      number: String(item?.number || "").trim(),
    })).filter((item) => item.number)
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

function readSharedAccountsData() {
  try {
    const raw = window.localStorage.getItem(ACCOUNTS_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed === "object" ? parsed : { customers: [], vendors: [] };
  } catch {
    return { customers: [], vendors: [] };
  }
}

function readSharedAccountsCustomers() {
  return (readSharedAccountsData().customers || []).map((row) => normalizeSharedCustomerRecord(row));
}

function readSharedAccountsVendors() {
  return (readSharedAccountsData().vendors || []).map((row) => normalizeSharedCustomerRecord(row));
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
  } catch {
    // Keep local cache updated even if server sync fails.
  }
}

function formatExistingProductList(products = []) {
  return products
    .map((item) => String(item?.name || item?.slug || "").trim())
    .filter(Boolean)
    .join(", ");
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

function normalizeImportHeader(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
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

function readSharedHrEmployees() {
  try {
    const raw = window.localStorage.getItem(HR_STORAGE_KEY);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed?.employees) ? parsed.employees : [];
  } catch {
    return [];
  }
}

function writeBusinessAutopilotUserDirectory(users) {
  if (typeof window === "undefined") {
    return;
  }
  const rows = Array.isArray(users) ? users : [];
  const normalized = rows
    .map((row) => ({
      email: String(row?.email || "").trim(),
      employee_role: String(row?.employee_role || "").trim(),
    }))
    .filter((row) => row.email);
  window.localStorage.setItem(USER_DIRECTORY_STORAGE_KEY, JSON.stringify(normalized));
  window.dispatchEvent(new CustomEvent("wz:business-autopilot-user-directory-changed"));
}

function writeSharedHrEmployees(rows = []) {
  try {
    const existingRaw = window.localStorage.getItem(HR_STORAGE_KEY);
    const existingData = existingRaw ? JSON.parse(existingRaw) : {};
    const nextData = (existingData && typeof existingData === "object")
      ? { ...existingData, employees: Array.isArray(rows) ? rows : [] }
      : { employees: Array.isArray(rows) ? rows : [] };
    window.localStorage.setItem(HR_STORAGE_KEY, JSON.stringify(nextData));
    window.dispatchEvent(new Event("storage"));
  } catch {
    // Ignore local sync failures.
  }
}

function syncHrEmployeeDirectoryFromUsers(userRows = [], currentHrEmployees = []) {
  const rows = Array.isArray(currentHrEmployees) ? [...currentHrEmployees] : [];
  let changed = false;
  const nextRows = rows.map((employee) => {
    const employeeUserId = String(employee?.sourceUserId || employee?.userId || "").trim();
    const employeeEmail = String(employee?.sourceUserEmail || "").trim().toLowerCase();
    const employeeName = String(employee?.name || "").trim().toLowerCase();
    const linkedUser = (Array.isArray(userRows) ? userRows : []).find((user) => {
      const userName = buildDisplayName(user?.first_name, user?.last_name) || String(user?.name || "").trim();
      return (
        (employeeUserId && String(user?.id || "").trim() === employeeUserId)
        || (employeeEmail && String(user?.email || "").trim().toLowerCase() === employeeEmail)
        || (employeeName && userName.toLowerCase() === employeeName)
      );
    });
    if (!linkedUser) {
      return employee;
    }
    const nextDepartment = String(linkedUser.department || "").trim();
    const nextDesignation = String(linkedUser.employee_role || "").trim();
    const nextName = buildDisplayName(linkedUser.first_name, linkedUser.last_name) || String(linkedUser.name || employee?.name || "").trim();
    const phoneParts = splitCombinedPhoneValue(linkedUser.phone_number || "");
    if (
      nextDepartment === String(employee?.department || "").trim()
      && nextDesignation === String(employee?.designation || employee?.employee_role || "").trim()
      && nextName === String(employee?.name || "").trim()
      && phoneParts.countryCode === String(employee?.contactCountryCode || "+91").trim()
      && phoneParts.number === String(employee?.contactNumber || "").trim()
    ) {
      return employee;
    }
    changed = true;
    return {
      ...employee,
      name: nextName,
      department: nextDepartment,
      designation: nextDesignation,
      employee_role: nextDesignation,
      sourceUserId: String(linkedUser.id || employee?.sourceUserId || employee?.userId || "").trim(),
      sourceUserEmail: String(linkedUser.email || employee?.sourceUserEmail || "").trim(),
      contactCountryCode: phoneParts.number
        ? (phoneParts.countryCode || String(employee?.contactCountryCode || "+91").trim() || "+91")
        : (String(employee?.contactCountryCode || "+91").trim() || "+91"),
      contactNumber: phoneParts.number || String(employee?.contactNumber || "").trim(),
    };
  });
  return changed ? nextRows : rows;
}

function splitDisplayName(value) {
  const parts = String(value || "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) {
    return { first_name: "", last_name: "" };
  }
  return {
    first_name: parts[0] || "",
    last_name: parts.slice(1).join(" "),
  };
}

function buildDisplayName(firstName, lastName) {
  return [String(firstName || "").trim(), String(lastName || "").trim()].filter(Boolean).join(" ").trim();
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

function buildCombinedPhoneValue(countryCode, number) {
  const code = String(countryCode || "").trim();
  const phone = String(number || "").trim();
  return [code, phone].filter(Boolean).join(" ").trim();
}

function findHrEmployeeForUser(user, hrEmployees = []) {
  const userId = String(user?.id || "").trim();
  const email = String(user?.email || "").trim().toLowerCase();
  const firstName = String(user?.first_name || "").trim();
  const lastName = String(user?.last_name || "").trim();
  const fullName = buildDisplayName(firstName, lastName) || String(user?.name || "").trim();
  const normalizedName = fullName.toLowerCase();

  return hrEmployees.find((row) =>
    String(row?.sourceUserId || row?.userId || "").trim() === userId
    || (email && String(row?.sourceUserEmail || "").trim().toLowerCase() === email)
    || (normalizedName && String(row?.name || "").trim().toLowerCase() === normalizedName)
  ) || null;
}

function formatDetailValue(key, value) {
  if (typeof value === "boolean") {
    if (key === "is_active") {
      return value ? "Active" : "Inactive";
    }
    return value ? "Yes" : "No";
  }
  if (Array.isArray(value)) {
    return value.length ? value.join(", ") : "-";
  }
  const normalized = String(value || "").trim();
  return normalized || "-";
}

function normalizeUserMeta(meta, userRows = []) {
  const source = (meta && typeof meta === "object" && !Array.isArray(meta)) ? meta : {};
  const fallbackUsedUsers = (Array.isArray(userRows) ? userRows : []).filter((row) => row?.is_active).length;
  const employeeLimitRaw = Number(source.employee_limit);
  const hasFiniteLimit = Number.isFinite(employeeLimitRaw) && employeeLimitRaw > 0;
  const usedUsersRaw = Number(source.used_users);
  const usedUsers = Number.isFinite(usedUsersRaw) ? Math.max(0, usedUsersRaw) : fallbackUsedUsers;
  const employeeLimit = hasFiniteLimit ? Math.max(0, employeeLimitRaw) : 0;
  const hasUnlimitedUsers = !hasFiniteLimit;
  const remainingUsers = hasUnlimitedUsers ? null : Math.max(0, employeeLimit - usedUsers);
  const addonCountRaw = Number(source.addon_count);

  return {
    employee_limit: employeeLimit,
    used_users: usedUsers,
    remaining_users: remainingUsers,
    addon_count: Number.isFinite(addonCountRaw) ? Math.max(0, addonCountRaw) : 0,
    allow_addons: Boolean(source.allow_addons),
    has_unlimited_users: hasUnlimitedUsers,
    can_add_users: hasUnlimitedUsers || usedUsers < employeeLimit,
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
  const [userMeta, setUserMeta] = useState(DEFAULT_USER_META);
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
  const [sendingCredentialMembershipId, setSendingCredentialMembershipId] = useState("");
  const [notice, setNotice] = useState("");
  const [roleAccessMap, setRoleAccessMap] = useState({});
  const [selectedRoleAccessKey, setSelectedRoleAccessKey] = useState(SYSTEM_ROLE_OPTIONS[0].key);
  const [roleAccessSaving, setRoleAccessSaving] = useState(false);
  const [roleAccessDirty, setRoleAccessDirty] = useState(false);
  const [clientSearch, setClientSearch] = useState("");
  const [clientPage, setClientPage] = useState(1);
  const [vendorSearch, setVendorSearch] = useState("");
  const [vendorPage, setVendorPage] = useState(1);
  const [hrEmployees, setHrEmployees] = useState(() => readSharedHrEmployees());
  const [sharedCustomers, setSharedCustomers] = useState(() => readSharedAccountsCustomers());
  const [sharedVendors, setSharedVendors] = useState(() => readSharedAccountsVendors());
  const [viewUserModal, setViewUserModal] = useState({ open: false, user: null, employee: null });
  const [credentialModal, setCredentialModal] = useState({
    open: false,
    credentials: null,
    emailSent: false,
    emailStatus: "not_applicable",
    copyNotice: "",
  });
  const [clientForm, setClientForm] = useState(() => createEmptySharedPartyForm());
  const [editingClientId, setEditingClientId] = useState("");
  const [vendorForm, setVendorForm] = useState(() => createEmptySharedPartyForm());
  const [editingVendorId, setEditingVendorId] = useState("");
  const [actionDialog, setActionDialog] = useState({
    open: false,
    variant: "alert",
    title: "Notice",
    message: "",
    confirmText: "OK",
    cancelText: "Cancel",
  });
  const actionDialogResolveRef = useRef(null);
  const clientImportInputRef = useRef(null);
  const vendorImportInputRef = useRef(null);
  const userFormRef = useRef(null);
  const createPasswordInputRef = useRef(null);
  const pageSize = 5;

  function closeActionDialog(result) {
    const resolver = actionDialogResolveRef.current;
    actionDialogResolveRef.current = null;
    setActionDialog((prev) => ({ ...prev, open: false }));
    if (typeof resolver === "function") {
      resolver(Boolean(result));
    }
  }

  function openAlertDialog(message, options = {}) {
    if (typeof actionDialogResolveRef.current === "function") {
      actionDialogResolveRef.current(false);
    }
    return new Promise((resolve) => {
      actionDialogResolveRef.current = () => resolve(true);
      setActionDialog({
        open: true,
        variant: "alert",
        title: String(options.title || "Notice"),
        message: String(message || ""),
        confirmText: String(options.confirmText || "OK"),
        cancelText: "Cancel",
      });
    });
  }

  function openConfirmDialog(message, options = {}) {
    if (typeof actionDialogResolveRef.current === "function") {
      actionDialogResolveRef.current(false);
    }
    return new Promise((resolve) => {
      actionDialogResolveRef.current = (nextValue) => resolve(Boolean(nextValue));
      setActionDialog({
        open: true,
        variant: "confirm",
        title: String(options.title || "Please Confirm"),
        message: String(message || ""),
        confirmText: String(options.confirmText || "Continue"),
        cancelText: String(options.cancelText || "Cancel"),
      });
    });
  }

  async function loadUsers() {
    setLoading(true);
    setNotice("");
    try {
      const data = await apiFetch("/api/business-autopilot/users");
      const nextUsers = data.users || [];
      setUsers(nextUsers);
      setUserMeta(normalizeUserMeta(data.meta, nextUsers));
      writeBusinessAutopilotUserDirectory(nextUsers);
      setEmployeeRoles(data.employee_roles || []);
      setDepartments(data.departments || []);
      setCanManageUsers(Boolean(data.can_manage_users));
      const syncedHrEmployees = syncHrEmployeeDirectoryFromUsers(nextUsers, readSharedHrEmployees());
      setHrEmployees(syncedHrEmployees);
      writeSharedHrEmployees(syncedHrEmployees);
    } catch (error) {
      setNotice(error?.message || "Unable to load users.");
      setUsers([]);
      setUserMeta(DEFAULT_USER_META);
      writeBusinessAutopilotUserDirectory([]);
      setEmployeeRoles([]);
      setDepartments([]);
      setCanManageUsers(false);
    } finally {
      setLoading(false);
    }
  }

  async function loadRoleAccess() {
    try {
      const data = await apiFetch("/api/business-autopilot/role-access");
      const nextMap = (data?.role_access_map && typeof data.role_access_map === "object" && !Array.isArray(data.role_access_map))
        ? data.role_access_map
        : {};
      setRoleAccessMap(nextMap);
      setRoleAccessDirty(false);
      window.localStorage.setItem(ROLE_ACCESS_STORAGE_KEY, JSON.stringify(nextMap));
    } catch {
      try {
        const raw = window.localStorage.getItem(ROLE_ACCESS_STORAGE_KEY);
        const parsed = raw ? JSON.parse(raw) : {};
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          setRoleAccessMap(parsed);
        }
      } catch {
        // Ignore invalid local role access cache.
      }
    }
  }

  function openEdit(user) {
    const matchedRole = employeeRoles.find((role) => role.name === (user.employee_role || ""));
    const matchedDepartment = departments.find((department) => department.name === (user.department || ""));
    const splitName = splitDisplayName(user.name || "");
    const phoneParts = splitCombinedPhoneValue(user.phone_number || "");
    setEditForm({
      membership_id: user.membership_id,
      first_name: String(user.first_name || splitName.first_name || "").trim(),
      last_name: String(user.last_name || splitName.last_name || "").trim(),
      email: String(user.email || "").trim(),
      password: "",
      phone_country_code: phoneParts.countryCode,
      phone_number_input: phoneParts.number,
      role: user.role || "org_user",
      department_id: matchedDepartment ? String(matchedDepartment.id) : "",
      employee_role_id: matchedRole ? String(matchedRole.id) : "",
      is_active: Boolean(user.is_active)
    });
    setNotice("");
    window.requestAnimationFrame(() => {
      userFormRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  }

  function cancelEdit() {
    setEditForm(defaultEditForm);
  }

  async function handleUpdateUser(event) {
    event.preventDefault();
    if (!editForm.membership_id || savingEdit) {
      return;
    }
    if (!String(editForm.phone_number_input || "").trim()) {
      setNotice("Phone number is required.");
      return;
    }
    setSavingEdit(true);
    setNotice("");
    try {
      const data = await apiFetch(`/api/business-autopilot/users/${editForm.membership_id}`, {
        method: "PUT",
        body: JSON.stringify({
          first_name: editForm.first_name,
          last_name: editForm.last_name,
          email: editForm.email,
          password: editForm.password,
          phone_number: buildCombinedPhoneValue(editForm.phone_country_code, editForm.phone_number_input),
          role: editForm.role,
          department_id: editForm.department_id || null,
          employee_role_id: editForm.employee_role_id || null,
          is_active: Boolean(editForm.is_active)
        })
      });
      const nextUsers = data.users || [];
      setUsers(nextUsers);
      setUserMeta(normalizeUserMeta(data.meta, nextUsers));
      writeBusinessAutopilotUserDirectory(nextUsers);
      setEmployeeRoles(data.employee_roles || []);
      setDepartments(data.departments || []);
      const syncedHrEmployees = syncHrEmployeeDirectoryFromUsers(nextUsers, readSharedHrEmployees());
      setHrEmployees(syncedHrEmployees);
      writeSharedHrEmployees(syncedHrEmployees);
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
      const nextUsers = data.users || [];
      setUsers(nextUsers);
      setUserMeta(normalizeUserMeta(data.meta, nextUsers));
      writeBusinessAutopilotUserDirectory(nextUsers);
      setEmployeeRoles(data.employee_roles || []);
      setDepartments(data.departments || []);
      const syncedHrEmployees = syncHrEmployeeDirectoryFromUsers(nextUsers, readSharedHrEmployees());
      setHrEmployees(syncedHrEmployees);
      writeSharedHrEmployees(syncedHrEmployees);
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

  async function handleResendCredentials(user) {
    const membershipId = String(user?.membership_id || "").trim();
    if (!membershipId || sendingCredentialMembershipId) {
      return;
    }
    const confirmed = await openConfirmDialog(
      "Email login details again to this user? The password will be reset and changed. Do you want to continue?",
      { title: "Confirm Credential Reset", confirmText: "Continue", cancelText: "Cancel" }
    );
    if (!confirmed) {
      setNotice("Credentials resend cancelled.");
      return;
    }
    setSendingCredentialMembershipId(membershipId);
    setNotice("");
    try {
      const data = await apiFetch(`/api/business-autopilot/users/${membershipId}/resend-credentials`, {
        method: "POST",
        body: JSON.stringify({})
      });
      const credentials = data?.credentials || null;
      const emailSent = Boolean(data?.email_sent);
      const emailStatus = String(data?.status || "not_applicable");
      if (credentials?.email && credentials?.password) {
        setCredentialModal({
          open: true,
          credentials,
          emailSent,
          emailStatus,
          copyNotice: "",
        });
      }
      setNotice(
        emailSent
          ? "Login credentials sent to user email."
          : "Email sending failed. Credentials generated, please copy and share manually."
      );
    } catch (error) {
      setNotice(error?.message || "Unable to send credentials email.");
    } finally {
      setSendingCredentialMembershipId("");
    }
  }

  function openViewUser(user) {
    setViewUserModal({
      open: true,
      user,
      employee: findHrEmployeeForUser(user, hrEmployees),
    });
  }

  useEffect(() => {
    loadUsers();
    loadRoleAccess();
  }, []);

  useEffect(() => {
    window.localStorage.setItem(ROLE_ACCESS_STORAGE_KEY, JSON.stringify(roleAccessMap));
  }, [roleAccessMap]);

  useEffect(() => {
    function syncSharedCustomers() {
      setSharedCustomers(readSharedAccountsCustomers());
      setSharedVendors(readSharedAccountsVendors());
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
    function syncHrEmployees() {
      setHrEmployees(readSharedHrEmployees());
    }
    syncHrEmployees();
    window.addEventListener("storage", syncHrEmployees);
    window.addEventListener("focus", syncHrEmployees);
    return () => {
      window.removeEventListener("storage", syncHrEmployees);
      window.removeEventListener("focus", syncHrEmployees);
    };
  }, []);

  useEffect(() => {
    setUserPage(1);
  }, [userSearch, users.length]);

  useEffect(() => {
    setEmployeeRolePage(1);
  }, [employeeRoleSearch, employeeRoles.length]);

  useEffect(() => {
    setDepartmentPage(1);
  }, [departmentSearch, departments.length]);

  useEffect(() => {
    setClientPage(1);
  }, [clientSearch, sharedCustomers.length]);

  useEffect(() => {
    setVendorPage(1);
  }, [vendorSearch, sharedVendors.length]);

  async function handleCreate(event) {
    event.preventDefault();
    if (!canManageUsers || saving) {
      return;
    }
    if (!String(form.phone_number_input || "").trim()) {
      setNotice("Phone number is required.");
      return;
    }
    const basePayload = {
      ...form,
      name: buildDisplayName(form.first_name, form.last_name),
      phone_number: buildCombinedPhoneValue(form.phone_country_code, form.phone_number_input),
    };
    setSaving(true);
    setNotice("");
    try {
      let data;
      try {
        data = await apiFetch("/api/business-autopilot/users", {
          method: "POST",
          body: JSON.stringify(basePayload)
        });
      } catch (error) {
        if (error?.status === 409 && error?.data?.detail === "existing_org_user_requires_confirmation") {
          const existingProductNames = formatExistingProductList(error?.data?.existing_products || []);
          const confirmationMessage = existingProductNames
            ? `This user is already assigned to ${existingProductNames}. The same password will continue to work for Business Autopilot too. Do you want to continue?`
            : "This user is already assigned in this organization. The same password will continue to work for Business Autopilot too. Do you want to continue?";
          const confirmed = await openConfirmDialog(confirmationMessage, {
            title: "Existing User Found",
            confirmText: "Continue",
            cancelText: "Cancel",
          });
          if (!confirmed) {
            setNotice("User creation cancelled.");
            return;
          }
          data = await apiFetch("/api/business-autopilot/users", {
            method: "POST",
            body: JSON.stringify({
              ...basePayload,
              confirm_existing_user: true,
            })
          });
        } else {
          throw error;
        }
      }
      const nextUsers = data.users || [];
      setUsers(nextUsers);
      setUserMeta(normalizeUserMeta(data.meta, nextUsers));
      writeBusinessAutopilotUserDirectory(nextUsers);
      setEmployeeRoles(data.employee_roles || []);
      setDepartments(data.departments || []);
      const syncedHrEmployees = syncHrEmployeeDirectoryFromUsers(nextUsers, readSharedHrEmployees());
      setHrEmployees(syncedHrEmployees);
      writeSharedHrEmployees(syncedHrEmployees);
      setForm(defaultForm);
      const createdCredentials = data?.created_user_credentials || null;
      const credentialDelivery = data?.credential_delivery || {};
      if (createdCredentials?.email && createdCredentials?.password) {
        setCredentialModal({
          open: true,
          credentials: createdCredentials,
          emailSent: Boolean(credentialDelivery.email_sent),
          emailStatus: String(credentialDelivery.status || "not_applicable"),
          copyNotice: "",
        });
        setNotice(
          credentialDelivery?.email_sent
            ? "User created successfully. Login credentials email sent."
            : "User created successfully. Email sending failed, please copy and share credentials manually."
        );
      } else {
        setNotice("User created successfully.");
      }
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
      setNotice("Employee role name is required.");
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
      const detail = String(error?.data?.detail || error?.message || "").trim().toLowerCase();
      if (detail === "employee_role_exists") {
        setNotice("This employee role already exists.");
      } else if (detail === "employee_role_matches_department_name") {
        setNotice("This name already exists as a department. Please choose a different employee role name.");
      } else if (detail === "name_required") {
        setNotice("Employee role name is required.");
      } else {
        setNotice(error?.message || "Unable to create employee role.");
      }
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
      setNotice("Department name is required.");
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
      const detail = String(error?.data?.detail || error?.message || "").trim().toLowerCase();
      if (detail === "department_exists") {
        setNotice("This department already exists.");
      } else if (detail === "department_matches_employee_role_name") {
        setNotice("This name already exists as an employee role. Please choose a different department name.");
      } else if (detail === "name_required") {
        setNotice("Department name is required.");
      } else {
        setNotice(error?.message || "Unable to create department.");
      }
    } finally {
      setSavingDepartment(false);
    }
  }

  async function handleCopyCredentials() {
    if (!credentialModal.credentials) {
      return;
    }
    const shareText = buildCredentialShareText(credentialModal.credentials);
    try {
      if (navigator?.clipboard?.writeText && window.isSecureContext) {
        await navigator.clipboard.writeText(shareText);
      } else {
        const textarea = document.createElement("textarea");
        textarea.value = shareText;
        textarea.setAttribute("readonly", "true");
        textarea.style.position = "fixed";
        textarea.style.left = "-9999px";
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand("copy");
        document.body.removeChild(textarea);
      }
      setCredentialModal((prev) => ({ ...prev, copyNotice: "Credentials copied." }));
    } catch {
      setCredentialModal((prev) => ({ ...prev, copyNotice: "Unable to copy automatically. Please copy manually." }));
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
      const detail = String(error?.data?.detail || error?.message || "").trim().toLowerCase();
      if (error?.status === 403) {
        cancelEditEmployeeRole();
        setNotice("You do not have permission to update employee roles.");
      } else if (detail === "employee_role_matches_department_name") {
        setNotice("This name already exists as a department. Please choose a different employee role name.");
      } else if (detail === "employee_role_exists") {
        setNotice("This employee role already exists.");
      } else {
        setNotice(error?.message || "Unable to update employee role.");
      }
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
      const detail = String(error?.data?.detail || error?.message || "").trim().toLowerCase();
      if (error?.status === 403) {
        cancelEditDepartment();
        setNotice("You do not have permission to update departments.");
      } else if (detail === "department_matches_employee_role_name") {
        setNotice("This name already exists as an employee role. Please choose a different department name.");
      } else if (detail === "department_exists") {
        setNotice("This department already exists.");
      } else {
        setNotice(error?.message || "Unable to update department.");
      }
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
        user.first_name,
        user.last_name,
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
  const isEditingUser = Boolean(editForm.membership_id);
  const availableUsersLabel = userMeta.has_unlimited_users ? "Unlimited" : String(userMeta.employee_limit || 0);
  const usedUsersLabel = String(userMeta.used_users || 0);
  const createPasswordStrength = useMemo(() => {
    const score = evaluatePasswordStrength(form.password);
    return {
      score,
      ...getPasswordStrengthMeta(score),
    };
  }, [form.password]);

  useEffect(() => {
    const input = createPasswordInputRef.current;
    if (!input) {
      return;
    }
    if (isEditingUser || !String(form.password || "").trim()) {
      input.setCustomValidity("");
      return;
    }
    if (createPasswordStrength.score < 4) {
      input.setCustomValidity("Use a strong password to continue.");
      return;
    }
    input.setCustomValidity("");
  }, [createPasswordStrength.score, form.password, isEditingUser]);

  useEffect(() => {
    if (roleAccessRoleOptions.some((item) => item.key === selectedRoleAccessKey)) {
      return;
    }
    setSelectedRoleAccessKey(roleAccessRoleOptions[0]?.key || SYSTEM_ROLE_OPTIONS[0].key);
  }, [roleAccessRoleOptions, selectedRoleAccessKey]);

  const selectedRoleAccess = roleAccessMap[selectedRoleAccessKey] || createDefaultRoleAccessRecord();
  const billingStateOptions = getStateOptionsForCountry(String(clientForm.billingCountry || "India"));
  const shippingStateOptions = getStateOptionsForCountry(String(clientForm.shippingCountry || "India"));
  const vendorBillingStateOptions = getStateOptionsForCountry(String(vendorForm.billingCountry || "India"));
  const vendorShippingStateOptions = getStateOptionsForCountry(String(vendorForm.shippingCountry || "India"));
  const filteredClients = useMemo(() => {
    const q = clientSearch.trim().toLowerCase();
    if (!q) {
      return sharedCustomers;
    }
    return sharedCustomers.filter((row) =>
      [
        row.companyName,
        row.clientName,
        row.gstin,
        row.phone,
        ...formatSharedCustomerPhones(row),
        row.email,
        ...formatSharedCustomerEmails(row),
        row.billingCountry,
        row.billingState,
        row.billingPincode,
        row.shippingCountry,
        row.shippingState,
        row.shippingPincode,
      ].filter(Boolean).join(" ").toLowerCase().includes(q)
    );
  }, [clientSearch, sharedCustomers]);
  const totalClientPages = Math.max(1, Math.ceil(filteredClients.length / pageSize));
  const normalizedClientPage = Math.min(clientPage, totalClientPages);
  const paginatedClients = filteredClients.slice((normalizedClientPage - 1) * pageSize, normalizedClientPage * pageSize);
  const clientStartIndex = filteredClients.length ? (normalizedClientPage - 1) * pageSize + 1 : 0;
  const clientEndIndex = Math.min(normalizedClientPage * pageSize, filteredClients.length);
  const filteredVendors = useMemo(() => {
    const q = vendorSearch.trim().toLowerCase();
    if (!q) {
      return sharedVendors;
    }
    return sharedVendors.filter((row) =>
      [
        row.companyName,
        row.clientName,
        row.gstin,
        row.phone,
        ...formatSharedCustomerPhones(row),
        row.email,
        ...formatSharedCustomerEmails(row),
        row.billingCountry,
        row.billingState,
        row.billingPincode,
        row.shippingCountry,
        row.shippingState,
        row.shippingPincode,
      ].filter(Boolean).join(" ").toLowerCase().includes(q)
    );
  }, [sharedVendors, vendorSearch]);
  const totalVendorPages = Math.max(1, Math.ceil(filteredVendors.length / pageSize));
  const normalizedVendorPage = Math.min(vendorPage, totalVendorPages);
  const paginatedVendors = filteredVendors.slice((normalizedVendorPage - 1) * pageSize, normalizedVendorPage * pageSize);
  const vendorStartIndex = filteredVendors.length ? (normalizedVendorPage - 1) * pageSize + 1 : 0;
  const vendorEndIndex = Math.min(normalizedVendorPage * pageSize, filteredVendors.length);

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
    setRoleAccessDirty(true);
  }

  async function handleSaveRoleAccess() {
    if (!canManageUsers || roleAccessSaving) {
      return;
    }
    setRoleAccessSaving(true);
    setNotice("");
    try {
      const data = await apiFetch("/api/business-autopilot/role-access", {
        method: "POST",
        body: JSON.stringify({ role_access_map: roleAccessMap }),
      });
      const nextMap = (data?.role_access_map && typeof data.role_access_map === "object" && !Array.isArray(data.role_access_map))
        ? data.role_access_map
        : {};
      setRoleAccessMap(nextMap);
      setRoleAccessDirty(false);
      window.localStorage.setItem(ROLE_ACCESS_STORAGE_KEY, JSON.stringify(nextMap));
      window.dispatchEvent(new CustomEvent("wz:business-autopilot-role-access-changed"));
      setNotice("Role access settings saved.");
    } catch (error) {
      setNotice(error?.message || "Unable to save role access settings.");
    } finally {
      setRoleAccessSaving(false);
    }
  }

  function resetClientForm() {
    setEditingClientId("");
    setClientForm(createEmptySharedPartyForm());
  }

  function resetVendorForm() {
    setEditingVendorId("");
    setVendorForm(createEmptySharedPartyForm());
  }

  async function saveClient(event) {
    event.preventDefault();
    if (!canManageUsers) {
      return;
    }
    const companyName = String(clientForm.companyName || "").trim();
    if (!companyName) {
      setNotice("Client company name is required.");
      return;
    }
    const clientName = String(clientForm.clientName || "").trim();
    const primaryPhone = String(clientForm.phone || "").trim();
    const primaryEmail = String(clientForm.email || "").trim();
    const additionalPhones = (clientForm.additionalPhones || [])
      .map((row) => ({ countryCode: String(row.countryCode || "+91").trim() || "+91", number: String(row.number || "").trim() }))
      .filter((row) => row.number);
    const additionalEmails = (clientForm.additionalEmails || [])
      .map((value) => String(value || "").trim())
      .filter(Boolean);
    const billingCountry = String(clientForm.billingCountry || "").trim() || "India";
    const billingState = String(clientForm.billingState || "").trim();
    const billingPincode = String(clientForm.billingPincode || "").trim();
    const useSameShipping = Boolean(clientForm.billingShippingSame);
    const shippingAddress = useSameShipping
      ? String(clientForm.billingAddress || "").trim()
      : String(clientForm.shippingAddress || "").trim();
    const shippingCountry = useSameShipping
      ? billingCountry
      : (String(clientForm.shippingCountry || "").trim() || "India");
    const shippingState = useSameShipping
      ? billingState
      : String(clientForm.shippingState || "").trim();
    const shippingPincode = useSameShipping
      ? billingPincode
      : String(clientForm.shippingPincode || "").trim();
    const payload = normalizeSharedCustomerRecord({
      id: editingClientId || `cust_${Date.now()}`,
      companyName,
      clientName,
      name: companyName,
      gstin: String(clientForm.gstin || "").trim(),
      phoneCountryCode: String(clientForm.phoneCountryCode || "+91").trim() || "+91",
      phone: primaryPhone,
      additionalPhones,
      phoneList: [
        ...(primaryPhone ? [{ countryCode: String(clientForm.phoneCountryCode || "+91").trim() || "+91", number: primaryPhone }] : []),
        ...additionalPhones,
      ],
      email: primaryEmail,
      additionalEmails,
      emailList: [primaryEmail, ...additionalEmails].filter(Boolean),
      billingAddress: String(clientForm.billingAddress || "").trim(),
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
      pincode: billingPincode,
    });
    const nextCustomers = editingClientId
      ? sharedCustomers.map((row) => (row.id === editingClientId ? { ...row, ...payload } : row))
      : [payload, ...sharedCustomers];
    setSharedCustomers(nextCustomers);
    await persistSharedAccountsCustomers(nextCustomers);
    setNotice(editingClientId ? "Client updated successfully." : "Client created successfully.");
    resetClientForm();
  }

  function editClient(row) {
    const normalized = normalizeSharedCustomerRecord(row);
    setEditingClientId(normalized.id);
    setClientForm({
      ...normalized,
      additionalPhones: Array.isArray(normalized.additionalPhones) ? normalized.additionalPhones : [],
      additionalEmails: Array.isArray(normalized.additionalEmails) ? normalized.additionalEmails : [],
    });
    setActiveTopTab("clients");
  }

  async function deleteClient(clientId) {
    if (!canManageUsers) {
      return;
    }
    const nextCustomers = sharedCustomers.filter((row) => String(row.id) !== String(clientId));
    setSharedCustomers(nextCustomers);
    await persistSharedAccountsCustomers(nextCustomers);
    if (editingClientId === String(clientId)) {
      resetClientForm();
    }
    setNotice("Client deleted successfully.");
  }

  function exportClientsAsExcelCsv() {
    const headers = ["Company Name", "Client Name", "GSTIN", "Contact Number", "Email ID", "Location"];
    const csvEscape = (value) => {
      const raw = String(value ?? "");
      if (/[",\n]/.test(raw)) {
        return `"${raw.replace(/"/g, "\"\"")}"`;
      }
      return raw;
    };
    const lines = [
      headers.map(csvEscape).join(","),
      ...filteredClients.map((row) => [
        row.companyName || row.name || "",
        row.clientName || "",
        row.gstin || "",
        formatSharedCustomerPhones(row).join(", "),
        formatSharedCustomerEmails(row).join(", "),
        [row.billingState || row.state, row.billingCountry || row.country, row.billingPincode || row.pincode].filter(Boolean).join(", "),
      ].map(csvEscape).join(",")),
    ];
    const blob = new Blob([`\uFEFF${lines.join("\n")}`], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "accounts-client-list.csv";
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  function exportClientsAsPdf() {
    const win = window.open("", "_blank", "width=1000,height=700");
    if (!win) {
      void openAlertDialog("Popup blocked. Please allow popups to export PDF.", { title: "Export Failed" });
      return;
    }
    const escapeHtml = (value) => String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
    const rows = filteredClients.length
      ? filteredClients.map((row) => `
          <tr>
            <td>${escapeHtml(row.companyName || row.name || "-")}</td>
            <td>${escapeHtml(row.clientName || "-")}</td>
            <td>${escapeHtml(row.gstin || "-")}</td>
            <td>${escapeHtml(formatSharedCustomerPhones(row).join(", ") || "-")}</td>
            <td>${escapeHtml(formatSharedCustomerEmails(row).join(", ") || "-")}</td>
            <td>${escapeHtml([row.billingState || row.state, row.billingCountry || row.country, row.billingPincode || row.pincode].filter(Boolean).join(", ") || "-")}</td>
          </tr>
        `).join("")
      : `<tr><td colspan="6">No clients found.</td></tr>`;
    win.document.write(`
      <!doctype html>
      <html>
        <head>
          <title>Client List - Export</title>
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
          <h2>Client List</h2>
          <p>Exported ${escapeHtml(new Date().toLocaleString())}</p>
          <table>
            <thead>
              <tr>
                <th>Company Name</th>
                <th>Client Name</th>
                <th>GSTIN</th>
                <th>Contact Number</th>
                <th>Email ID</th>
                <th>Location</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </body>
      </html>
    `);
    win.document.close();
    const triggerPrint = () => {
      try {
        win.focus();
        win.print();
      } catch {
        // ignore print trigger issues
      }
    };
    win.onload = () => {
      win.setTimeout(triggerPrint, 250);
    };
    win.setTimeout(triggerPrint, 500);
  }

  function triggerClientImportPicker() {
    clientImportInputRef.current?.click();
  }

  async function onClientImportFileChange(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !canManageUsers) {
      return;
    }
    try {
      let importedRows = [];
      const fileName = String(file.name || "").toLowerCase();
      if (fileName.endsWith(".xlsx") || fileName.endsWith(".xls")) {
        const buffer = await file.arrayBuffer();
        const workbook = XLSX.read(buffer, { type: "array" });
        const firstSheetName = workbook.SheetNames[0];
        const sheet = firstSheetName ? workbook.Sheets[firstSheetName] : null;
        importedRows = sheet ? normalizeSpreadsheetRows(XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" })) : [];
      } else {
        importedRows = parseCsvRows(await file.text());
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
                return { countryCode: phoneMatch[1].trim(), number: phoneMatch[2].trim() };
              }
              return { countryCode: "+91", number: value };
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
        await openAlertDialog("Imported file is empty or invalid.", { title: "Import Failed" });
        return;
      }
      const nextCustomers = [...nextRows, ...sharedCustomers];
      setSharedCustomers(nextCustomers);
      await persistSharedAccountsCustomers(nextCustomers);
      setNotice("Clients imported successfully.");
    } catch {
      await openAlertDialog("Unable to import this file. Use the exported template structure in CSV or Excel format.", { title: "Import Failed" });
    }
  }

  async function saveVendor(event) {
    event.preventDefault();
    if (!canManageUsers) {
      return;
    }
    const companyName = String(vendorForm.companyName || "").trim();
    if (!companyName) {
      setNotice("Vendor company name is required.");
      return;
    }
    const vendorName = String(vendorForm.clientName || "").trim();
    const primaryPhone = String(vendorForm.phone || "").trim();
    const primaryEmail = String(vendorForm.email || "").trim();
    const additionalPhones = (vendorForm.additionalPhones || [])
      .map((row) => ({ countryCode: String(row.countryCode || "+91").trim() || "+91", number: String(row.number || "").trim() }))
      .filter((row) => row.number);
    const additionalEmails = (vendorForm.additionalEmails || [])
      .map((value) => String(value || "").trim())
      .filter(Boolean);
    const billingCountry = String(vendorForm.billingCountry || "").trim() || "India";
    const billingState = String(vendorForm.billingState || "").trim();
    const billingPincode = String(vendorForm.billingPincode || "").trim();
    const useSameShipping = Boolean(vendorForm.billingShippingSame);
    const shippingAddress = useSameShipping
      ? String(vendorForm.billingAddress || "").trim()
      : String(vendorForm.shippingAddress || "").trim();
    const shippingCountry = useSameShipping
      ? billingCountry
      : (String(vendorForm.shippingCountry || "").trim() || "India");
    const shippingState = useSameShipping
      ? billingState
      : String(vendorForm.shippingState || "").trim();
    const shippingPincode = useSameShipping
      ? billingPincode
      : String(vendorForm.shippingPincode || "").trim();
    const payload = normalizeSharedCustomerRecord({
      id: editingVendorId || `vendor_${Date.now()}`,
      companyName,
      clientName: vendorName,
      name: companyName,
      gstin: String(vendorForm.gstin || "").trim(),
      phoneCountryCode: String(vendorForm.phoneCountryCode || "+91").trim() || "+91",
      phone: primaryPhone,
      additionalPhones,
      phoneList: [
        ...(primaryPhone ? [{ countryCode: String(vendorForm.phoneCountryCode || "+91").trim() || "+91", number: primaryPhone }] : []),
        ...additionalPhones,
      ],
      email: primaryEmail,
      additionalEmails,
      emailList: [primaryEmail, ...additionalEmails].filter(Boolean),
      billingAddress: String(vendorForm.billingAddress || "").trim(),
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
      pincode: billingPincode,
    });
    const nextVendors = editingVendorId
      ? sharedVendors.map((row) => (row.id === editingVendorId ? { ...row, ...payload } : row))
      : [payload, ...sharedVendors];
    const currentData = readSharedAccountsData();
    const nextData = {
      ...currentData,
      vendors: nextVendors.map((row) => normalizeSharedCustomerRecord(row)),
    };
    setSharedVendors(nextVendors);
    window.localStorage.setItem(ACCOUNTS_STORAGE_KEY, JSON.stringify(nextData));
    try {
      await apiFetch("/api/business-autopilot/accounts/workspace", {
        method: "PUT",
        body: JSON.stringify({ data: nextData }),
      });
    } catch {
      // Keep vendor registration data locally even if server sync fails.
    }
    setNotice(editingVendorId ? "Vendor updated successfully." : "Vendor created successfully.");
    resetVendorForm();
  }

  function editVendor(row) {
    const normalized = normalizeSharedCustomerRecord(row);
    setEditingVendorId(normalized.id);
    setVendorForm({
      ...normalized,
      additionalPhones: Array.isArray(normalized.additionalPhones) ? normalized.additionalPhones : [],
      additionalEmails: Array.isArray(normalized.additionalEmails) ? normalized.additionalEmails : [],
    });
    setActiveTopTab("vendors");
  }

  async function deleteVendor(vendorId) {
    if (!canManageUsers) {
      return;
    }
    const nextVendors = sharedVendors.filter((row) => String(row.id) !== String(vendorId));
    const currentData = readSharedAccountsData();
    const nextData = {
      ...currentData,
      vendors: nextVendors.map((row) => normalizeSharedCustomerRecord(row)),
    };
    setSharedVendors(nextVendors);
    window.localStorage.setItem(ACCOUNTS_STORAGE_KEY, JSON.stringify(nextData));
    try {
      await apiFetch("/api/business-autopilot/accounts/workspace", {
        method: "PUT",
        body: JSON.stringify({ data: nextData }),
      });
    } catch {
      // Keep vendor registration data locally even if server sync fails.
    }
    if (editingVendorId === String(vendorId)) {
      resetVendorForm();
    }
    setNotice("Vendor deleted successfully.");
  }

  function exportVendorsAsExcelCsv() {
    const headers = ["Company Name", "Vendor Name", "GSTIN", "Contact Number", "Email ID", "Location"];
    const csvEscape = (value) => {
      const raw = String(value ?? "");
      if (/[",\n]/.test(raw)) {
        return `"${raw.replace(/"/g, "\"\"")}"`;
      }
      return raw;
    };
    const lines = [
      headers.map(csvEscape).join(","),
      ...filteredVendors.map((row) => [
        row.companyName || row.name || "",
        row.clientName || "",
        row.gstin || "",
        formatSharedCustomerPhones(row).join(", "),
        formatSharedCustomerEmails(row).join(", "),
        [row.billingState || row.state, row.billingCountry || row.country, row.billingPincode || row.pincode].filter(Boolean).join(", "),
      ].map(csvEscape).join(",")),
    ];
    const blob = new Blob([`\uFEFF${lines.join("\n")}`], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "vendor-registration-list.csv";
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  function exportVendorsAsPdf() {
    const win = window.open("", "_blank", "width=1000,height=700");
    if (!win) {
      void openAlertDialog("Popup blocked. Please allow popups to export PDF.", { title: "Export Failed" });
      return;
    }
    const escapeHtml = (value) => String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
    const rows = filteredVendors.length
      ? filteredVendors.map((row) => `
          <tr>
            <td>${escapeHtml(row.companyName || row.name || "-")}</td>
            <td>${escapeHtml(row.clientName || "-")}</td>
            <td>${escapeHtml(row.gstin || "-")}</td>
            <td>${escapeHtml(formatSharedCustomerPhones(row).join(", ") || "-")}</td>
            <td>${escapeHtml(formatSharedCustomerEmails(row).join(", ") || "-")}</td>
            <td>${escapeHtml([row.billingState || row.state, row.billingCountry || row.country, row.billingPincode || row.pincode].filter(Boolean).join(", ") || "-")}</td>
          </tr>
        `).join("")
      : `<tr><td colspan="6">No vendors found.</td></tr>`;
    win.document.write(`
      <!doctype html>
      <html>
        <head>
          <title>Vendor Registration List - Export</title>
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
          <h2>Vendor Registration List</h2>
          <p>Exported ${escapeHtml(new Date().toLocaleString())}</p>
          <table>
            <thead>
              <tr>
                <th>Company Name</th>
                <th>Vendor Name</th>
                <th>GSTIN</th>
                <th>Contact Number</th>
                <th>Email ID</th>
                <th>Location</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </body>
      </html>
    `);
    win.document.close();
    const triggerPrint = () => {
      try {
        win.focus();
        win.print();
      } catch {
        // ignore print trigger issues
      }
    };
    win.onload = () => {
      win.setTimeout(triggerPrint, 250);
    };
    win.setTimeout(triggerPrint, 500);
  }

  function triggerVendorImportPicker() {
    vendorImportInputRef.current?.click();
  }

  async function onVendorImportFileChange(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !canManageUsers) {
      return;
    }
    try {
      let importedRows = [];
      const fileName = String(file.name || "").toLowerCase();
      if (fileName.endsWith(".xlsx") || fileName.endsWith(".xls")) {
        const buffer = await file.arrayBuffer();
        const workbook = XLSX.read(buffer, { type: "array" });
        const firstSheetName = workbook.SheetNames[0];
        const sheet = firstSheetName ? workbook.Sheets[firstSheetName] : null;
        importedRows = sheet ? normalizeSpreadsheetRows(XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" })) : [];
      } else {
        importedRows = parseCsvRows(await file.text());
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
          const vendorName = getValue("Vendor Name", "Client Name", "Vendor", "Contact Person");
          const gstin = getValue("GSTIN");
          const contactNumberRaw = getValue("Contact Number", "Phone Number", "Phone", "Mobile Number");
          const emailRaw = getValue("Email ID", "Email", "Email Address");
          const locationRaw = getValue("Location", "Billing Location", "Address");
          if (!companyName && !vendorName && !contactNumberRaw && !emailRaw && !locationRaw && !gstin) {
            return null;
          }
          const phoneEntries = contactNumberRaw
            .split(/[,\n/]+/)
            .map((value) => String(value || "").trim())
            .filter(Boolean)
            .map((value) => {
              const phoneMatch = value.match(/^(\+\d{1,4})\s*(.+)$/);
              if (phoneMatch) {
                return { countryCode: phoneMatch[1].trim(), number: phoneMatch[2].trim() };
              }
              return { countryCode: "+91", number: value };
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
            id: `vendor_import_${Date.now()}_${rowIndex}`,
            companyName,
            clientName: vendorName,
            name: companyName || vendorName,
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
        await openAlertDialog("Imported file is empty or invalid.", { title: "Import Failed" });
        return;
      }
      const nextVendors = [...nextRows, ...sharedVendors];
      const currentData = readSharedAccountsData();
      const nextData = {
        ...currentData,
        vendors: nextVendors.map((row) => normalizeSharedCustomerRecord(row)),
      };
      setSharedVendors(nextVendors);
      window.localStorage.setItem(ACCOUNTS_STORAGE_KEY, JSON.stringify(nextData));
      try {
        await apiFetch("/api/business-autopilot/accounts/workspace", {
          method: "PUT",
          body: JSON.stringify({ data: nextData }),
        });
      } catch {
        // Keep vendor registration data locally even if server sync fails.
      }
      setNotice("Vendors imported successfully.");
    } catch {
      await openAlertDialog("Unable to import this file. Use the exported template structure in CSV or Excel format.", { title: "Import Failed" });
    }
  }

  return (
    <div className="d-flex flex-column gap-3">
      <div>
        <h4 className="mb-2">Users</h4>
        <p className="text-secondary mb-0">Create and manage users for Business Autopilot.</p>
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
            className={`btn btn-sm ${activeTopTab === "create-employee" ? "btn-success" : "btn-outline-light"}`}
            onClick={() => setActiveTopTab("create-employee")}
          >
            Employee
          </button>
          <button
            type="button"
            className={`btn btn-sm ${activeTopTab === "role-access" ? "btn-success" : "btn-outline-light"}`}
            onClick={() => setActiveTopTab("role-access")}
          >
            Role Based Access
          </button>
          <button
            type="button"
            className={`btn btn-sm ${activeTopTab === "clients" ? "btn-success" : "btn-outline-light"}`}
            onClick={() => setActiveTopTab("clients")}
          >
            Clients
          </button>
          <button
            type="button"
            className={`btn btn-sm ${activeTopTab === "vendors" ? "btn-success" : "btn-outline-light"}`}
            onClick={() => setActiveTopTab("vendors")}
          >
            Vendor Registration
          </button>
        </div>
      </div>

      {notice ? <div className="alert alert-info py-2 mb-0">{notice}</div> : null}

      {activeTopTab === "create-employee" ? (
        <HrManagementModule embeddedEmployeeOnly />
      ) : activeTopTab === "users" ? (
        <>
          {canManageUsers ? (
            <>
              <div className="row g-3">
                <div className="col-12 col-xl-6">
                  <div className="card p-3 h-100">
                    <h6 className="mb-3">Create Department</h6>
                    <form className="row g-2" onSubmit={handleCreateDepartment}>
                      <div className="col-12 col-md-8">
                        <input
                          type="text"
                          className="form-control"
                          placeholder="Create Department (e.g. Accounts)"
                          value={newDepartment}
                          maxLength={getBusinessAutopilotMaxLength("department")}
                          onChange={(event) => setNewDepartment(limitedInput("department", event.target.value))}
                        />
                      </div>
                <div className="col-12 col-md-4 d-grid">
                  <button type="submit" className="btn btn-outline-success" disabled={savingDepartment}>
                    {savingDepartment ? "Adding..." : "Create Department"}
                  </button>
                </div>
              </form>
              <hr className="my-3" />
              <div className="d-flex flex-wrap align-items-center justify-content-end gap-2 mt-3 mb-2">
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
                <table className="table table-dark table-hover align-middle mb-0 wz-priority-header-table">
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
                                maxLength={getBusinessAutopilotMaxLength("department")}
                                onChange={(event) => setEditingDepartmentName(limitedInput("department", event.target.value))}
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
                <div className="col-12 col-xl-6">
                  <div className="card p-3 h-100">
                    <h6 className="mb-3">Create Employee Role</h6>
                    <form className="row g-2" onSubmit={handleCreateEmployeeRole}>
                      <div className="col-12 col-md-8">
                        <input
                          type="text"
                          className="form-control"
                          placeholder="Create Employee Role (e.g. Accountant)"
                          value={newEmployeeRole}
                          maxLength={getBusinessAutopilotMaxLength("employee_role")}
                          onChange={(event) => setNewEmployeeRole(limitedInput("employee_role", event.target.value))}
                        />
                      </div>
                <div className="col-12 col-md-4 d-grid">
                  <button type="submit" className="btn btn-outline-success" disabled={savingEmployeeRole}>
                    {savingEmployeeRole ? "Adding..." : "Create Role"}
                  </button>
                </div>
              </form>
              <hr className="my-3" />
              <div className="d-flex flex-wrap align-items-center justify-content-end gap-2 mt-3 mb-2">
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
                <table className="table table-dark table-hover align-middle mb-0 wz-priority-header-table">
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
                                maxLength={getBusinessAutopilotMaxLength("employee_role")}
                                onChange={(event) => setEditingEmployeeRoleName(limitedInput("employee_role", event.target.value))}
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
              </div>

              <div className="card p-3">
                <h6 className="mb-3">Create User</h6>
                <form ref={userFormRef} className="d-flex flex-column gap-3" onSubmit={isEditingUser ? handleUpdateUser : handleCreate}>
                  <div className="row g-2">
                    <div className="col-12 col-md-6 col-xl-2">
                      <input
                        type="text"
                        className="form-control"
                        placeholder="First Name"
                        value={isEditingUser ? editForm.first_name : form.first_name}
                        maxLength={getBusinessAutopilotMaxLength("first_name")}
                        onChange={(event) => {
                          const value = limitedInput("first_name", event.target.value);
                          if (isEditingUser) {
                            setEditForm((prev) => ({ ...prev, first_name: value }));
                            return;
                          }
                          setForm((prev) => ({ ...prev, first_name: value }));
                        }}
                        required
                      />
                    </div>
                    <div className="col-12 col-md-6 col-xl-2">
                      <input
                        type="text"
                        className="form-control"
                        placeholder="Last Name"
                        value={isEditingUser ? editForm.last_name : form.last_name}
                        maxLength={getBusinessAutopilotMaxLength("last_name")}
                        onChange={(event) => {
                          const value = limitedInput("last_name", event.target.value);
                          if (isEditingUser) {
                            setEditForm((prev) => ({ ...prev, last_name: value }));
                            return;
                          }
                          setForm((prev) => ({ ...prev, last_name: value }));
                        }}
                      />
                    </div>
                    <div className="col-12 col-md-6 col-xl-4">
                      <input
                        type="email"
                        className="form-control"
                        placeholder="Official Email"
                        value={isEditingUser ? editForm.email : form.email}
                        maxLength={getBusinessAutopilotMaxLength("email")}
                        onChange={(event) => {
                          const value = limitedInput("email", event.target.value);
                          if (isEditingUser) {
                            setEditForm((prev) => ({ ...prev, email: value }));
                            return;
                          }
                          setForm((prev) => ({ ...prev, email: value }));
                        }}
                        required
                      />
                    </div>
                    <div className="col-12 col-md-6 col-xl-2">
                      <select
                        className="form-select"
                        value={isEditingUser ? editForm.department_id : form.department_id}
                        onChange={(event) => {
                          const value = event.target.value;
                          if (isEditingUser) {
                            setEditForm((prev) => ({ ...prev, department_id: value }));
                            return;
                          }
                          setForm((prev) => ({ ...prev, department_id: value }));
                        }}
                      >
                        <option value="">Department</option>
                        {departments.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                      </select>
                    </div>
                    <div className="col-12 col-md-6 col-xl-2">
                      <select
                        className="form-select"
                        value={isEditingUser ? editForm.employee_role_id : form.employee_role_id}
                        onChange={(event) => {
                          const value = event.target.value;
                          if (isEditingUser) {
                            setEditForm((prev) => ({ ...prev, employee_role_id: value }));
                            return;
                          }
                          setForm((prev) => ({ ...prev, employee_role_id: value }));
                        }}
                      >
                        <option value="">Employee Role</option>
                        {employeeRoles.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                      </select>
                    </div>
                  </div>
                  <div className="row g-2">
                    <div className="col-12 col-md-6 col-xl-4">
                      <div className="input-group">
                        <PhoneCountryCodePicker
                          value={isEditingUser ? editForm.phone_country_code : form.phone_country_code}
                          onChange={(code) => {
                            if (isEditingUser) {
                              setEditForm((prev) => ({ ...prev, phone_country_code: code }));
                              return;
                            }
                            setForm((prev) => ({ ...prev, phone_country_code: code }));
                          }}
                          options={DIAL_COUNTRY_PICKER_OPTIONS}
                          style={{ maxWidth: "120px" }}
                          ariaLabel="User phone country code"
                        />
                        <input
                          type="tel"
                          className="form-control"
                          placeholder="Phone Number"
                          value={isEditingUser ? editForm.phone_number_input : form.phone_number_input}
                          onChange={(event) => {
                            const value = event.target.value;
                            if (isEditingUser) {
                              setEditForm((prev) => ({ ...prev, phone_number_input: value }));
                              return;
                            }
                            setForm((prev) => ({ ...prev, phone_number_input: value }));
                          }}
                          required
                        />
                      </div>
                    </div>
                    <div className="col-12 col-md-6 col-xl-4">
                      <input
                        type="password"
                        ref={createPasswordInputRef}
                        className="form-control"
                        placeholder="Password"
                        value={isEditingUser ? editForm.password : form.password}
                        maxLength={getBusinessAutopilotMaxLength("password")}
                        onChange={(event) => {
                          const value = limitedInput("password", event.target.value);
                          if (isEditingUser) {
                            setEditForm((prev) => ({ ...prev, password: value }));
                            return;
                          }
                          setForm((prev) => ({ ...prev, password: value }));
                        }}
                        minLength={6}
                        required={!isEditingUser}
                      />
                      {!isEditingUser ? (
                        <div className="mt-2">
                          <div
                            style={{
                              width: "100%",
                              height: "6px",
                              borderRadius: "999px",
                              background: "rgba(148, 163, 184, 0.22)",
                              overflow: "hidden",
                            }}
                          >
                            <span
                              style={{
                                display: "block",
                                height: "100%",
                                width: `${createPasswordStrength.width}%`,
                                background: createPasswordStrength.color,
                                transition: "width 140ms ease, background-color 140ms ease",
                              }}
                            />
                          </div>
                          <small className="text-secondary">
                            Password strength: {createPasswordStrength.label}
                          </small>
                        </div>
                      ) : null}
                    </div>
                    <div className="col-12 col-md-6 col-xl-4">
                      <div className="d-grid d-xl-flex gap-2 wz-form-actions">
                        <button type="submit" className="btn btn-primary flex-fill" disabled={isEditingUser ? savingEdit : saving} title={isEditingUser ? "Update User" : "Create User"}>
                          {isEditingUser ? (savingEdit ? "Updating..." : "Update") : (saving ? "Creating..." : "Create")}
                        </button>
                        {isEditingUser ? (
                          <button type="button" className="btn btn-outline-light flex-fill" onClick={cancelEdit}>
                            Cancel
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="btn btn-outline-light flex-fill invisible d-none d-xl-block"
                            disabled
                            tabIndex={-1}
                            aria-hidden="true"
                          >
                            Cancel
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </form>
              </div>
            </>
          ) : (
            <div className="card p-3">
              <div className="text-secondary">Only company admin can create users.</div>
            </div>
          )}

          <div>
            <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-2">
              <div className="d-flex flex-wrap align-items-center gap-2">
                <h6 className="mb-0">User List (Available User {availableUsersLabel} - Used {usedUsersLabel})</h6>
                <button
                  type="button"
                  className="btn btn-sm btn-outline-success"
                  onClick={() => {
                    window.location.href = "/app/business-autopilot/billing";
                  }}
                >
                  Add on users
                </button>
              </div>
              <div className="d-flex flex-wrap align-items-center justify-content-end gap-2">
                <span className="badge bg-secondary">{filteredUsers.length} items</span>
                <div className="table-search">
                  <i className="bi bi-search" aria-hidden="true" />
                  <input type="search" className="form-control form-control-sm" placeholder="Search users" value={userSearch} onChange={(event) => setUserSearch(event.target.value)} />
                </div>
              </div>
            </div>
            <div className="table-responsive">
              <table className="table table-dark table-hover align-middle mb-0">
                <thead>
                  <tr>
                    <th>First Name</th>
                    <th>Last Name</th>
                    <th>Official Email</th>
                    <th>Department</th>
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
                        <td>{user.first_name || splitDisplayName(user.name || "").first_name || "-"}</td>
                        <td>{user.last_name || splitDisplayName(user.name || "").last_name || "-"}</td>
                        <td>{user.email || "-"}</td>
                        <td>{user.department || "-"}</td>
                        <td>{user.employee_role || "-"}</td>
                        <td>{user.is_active ? "Active" : "Inactive"}</td>
                        <td>
                          <div className="d-inline-flex gap-2">
                            <button type="button" className="btn btn-sm btn-outline-secondary" onClick={() => openViewUser(user)}>View</button>
                            <button
                              type="button"
                              className="btn btn-sm btn-outline-success"
                              onClick={() => handleResendCredentials(user)}
                              disabled={!user.membership_id || sendingCredentialMembershipId === String(user.membership_id)}
                            >
                              {sendingCredentialMembershipId === String(user.membership_id) ? "Emailing..." : "Email"}
                            </button>
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

          {viewUserModal.open ? (
            <div className="modal-overlay" onClick={() => setViewUserModal({ open: false, user: null, employee: null })}>
              <div className="modal-panel" style={{ width: "min(960px, 96vw)", maxHeight: "88vh", overflowY: "auto" }} onClick={(event) => event.stopPropagation()}>
                <div className="d-flex flex-wrap justify-content-between align-items-start gap-2 mb-3">
                  <div>
                    <h5 className="mb-1">User Details</h5>
                    <div className="text-secondary">
                      {buildDisplayName(viewUserModal.user?.first_name, viewUserModal.user?.last_name) || viewUserModal.user?.name || "User"}
                    </div>
                  </div>
                  <button type="button" className="btn btn-outline-light btn-sm" onClick={() => setViewUserModal({ open: false, user: null, employee: null })}>
                    Close
                  </button>
                </div>

                <div className="card p-3 mb-3">
                  <h6 className="mb-3">User List Details</h6>
                  <div className="row g-3">
                    {USER_DETAIL_FIELDS.map((field) => (
                      <div className="col-12 col-md-6 col-xl-3" key={`user-detail-${field.key}`}>
                        <div className="small text-secondary mb-1">{field.label}</div>
                        <div>{formatDetailValue(field.key, viewUserModal.user?.[field.key])}</div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="card p-3">
                  <h6 className="mb-3">Employee Details</h6>
                  {viewUserModal.employee ? (
                    <>
                      {viewUserModal.employee.photoDataUrl ? (
                        <div className="mb-3">
                          <div className="small text-secondary mb-1">Employee Photo</div>
                          <img
                            src={viewUserModal.employee.photoDataUrl}
                            alt={viewUserModal.employee.name || "Employee"}
                            style={{ width: "96px", height: "96px", objectFit: "cover", borderRadius: "12px", border: "1px solid rgba(255,255,255,0.12)" }}
                          />
                        </div>
                      ) : null}

                      <div className="row g-3">
                        {HR_EMPLOYEE_DETAIL_FIELDS.map((field) => (
                          <div className="col-12 col-md-6 col-xl-4" key={`employee-detail-${field.key}`}>
                            <div className="small text-secondary mb-1">{field.label}</div>
                            <div>{formatDetailValue(field.key, viewUserModal.employee?.[field.key])}</div>
                          </div>
                        ))}
                        <div className="col-12 col-md-6 col-xl-4">
                          <div className="small text-secondary mb-1">Employee Document</div>
                          <div>
                            {[
                              viewUserModal.employee.documentName,
                              viewUserModal.employee.documentSizeLabel,
                              viewUserModal.employee.documentMimeType
                            ].filter(Boolean).join(" • ") || "-"}
                          </div>
                        </div>
                      </div>
                    </>
                  ) : (
                    <div className="text-secondary">No HR employee profile found for this user.</div>
                  )}
                </div>
              </div>
            </div>
          ) : null}

          {credentialModal.open ? (
            <div className="modal-overlay" onClick={() => setCredentialModal((prev) => ({ ...prev, open: false, copyNotice: "" }))}>
              <div className="modal-panel" style={{ width: "min(560px, 94vw)" }} onClick={(event) => event.stopPropagation()}>
                <div className="d-flex flex-wrap align-items-start justify-content-between gap-2 mb-3">
                  <div>
                    <h5 className="mb-1">Login Credentials</h5>
                    <div className="small text-secondary">
                      {credentialModal.emailSent ? "Credentials email sent to user." : "Email failed. Share these credentials manually."}
                    </div>
                  </div>
                  <button
                    type="button"
                    className="btn btn-outline-light btn-sm"
                    onClick={() => setCredentialModal((prev) => ({ ...prev, open: false, copyNotice: "" }))}
                  >
                    Close
                  </button>
                </div>
                <div className="card p-3 mb-3">
                  <div className="small text-secondary mb-1">Name</div>
                  <div className="mb-2">{credentialModal.credentials?.name || "-"}</div>
                  <div className="small text-secondary mb-1">Email</div>
                  <div className="mb-2">{credentialModal.credentials?.email || "-"}</div>
                  <div className="small text-secondary mb-1">Password</div>
                  <div className="mb-2">{credentialModal.credentials?.password || "-"}</div>
                  <div className="small text-secondary mb-1">Login URL</div>
                  <div style={{ wordBreak: "break-all" }}>{credentialModal.credentials?.login_url || "-"}</div>
                </div>
                <div className="d-flex flex-wrap gap-2">
                  <button type="button" className="btn btn-primary btn-sm" onClick={handleCopyCredentials}>
                    Copy Credentials
                  </button>
                </div>
                {credentialModal.copyNotice ? (
                  <div className="small text-secondary mt-2">{credentialModal.copyNotice}</div>
                ) : null}
              </div>
            </div>
          ) : null}
        </>
      ) : activeTopTab === "role-access" ? (
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
            <div className="d-flex flex-column align-items-end gap-1">
              <button
                type="button"
                className="btn btn-sm btn-success"
                onClick={handleSaveRoleAccess}
                disabled={!canManageUsers || roleAccessSaving || !roleAccessDirty}
              >
                {roleAccessSaving ? "Saving..." : "Save Access"}
              </button>
              {roleAccessDirty ? (
                <div className="small text-warning">Unsaved changes</div>
              ) : (
                <div className="small text-secondary">Saved</div>
              )}
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
                maxLength={getBusinessAutopilotMaxLength("remarks", { isTextarea: true })}
                disabled={!canManageUsers}
                onChange={(event) => updateRoleAccess((prev) => ({ ...prev, remarks: limitedTextarea("remarks", event.target.value) }))}
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
      ) : activeTopTab === "clients" ? (
        <>
          <div className="card p-3">
            <h6 className="mb-3">{editingClientId ? "Edit Client" : "Create Client"}</h6>
            <form className="d-flex flex-column gap-3" onSubmit={saveClient}>
              <div className="row g-3">
                <div className="col-12 col-xl-4">
                  <label className="form-label small text-secondary mb-1">Company Name</label>
                  <input className="form-control" maxLength={getBusinessAutopilotMaxLength("companyName")} value={clientForm.companyName || ""} onChange={(event) => setClientForm((prev) => ({ ...prev, companyName: limitedInput("companyName", event.target.value), name: limitedInput("companyName", event.target.value) }))} placeholder="Company name" />
                </div>
                <div className="col-12 col-xl-4">
                  <label className="form-label small text-secondary mb-1">Client Name</label>
                  <input className="form-control" maxLength={getBusinessAutopilotMaxLength("clientName")} value={clientForm.clientName || ""} onChange={(event) => setClientForm((prev) => ({ ...prev, clientName: limitedInput("clientName", event.target.value) }))} placeholder="Client / Contact person" />
                </div>
                <div className="col-12 col-xl-4">
                  <label className="form-label small text-secondary mb-1">GSTIN</label>
                  <input className="form-control" maxLength={getBusinessAutopilotMaxLength("gstin")} value={clientForm.gstin || ""} onChange={(event) => setClientForm((prev) => ({ ...prev, gstin: limitedInput("gstin", event.target.value) }))} placeholder="GSTIN" />
                </div>
                <div className="col-12 col-xl-6">
                  <label className="form-label small text-secondary mb-1">Phone Number</label>
                  <div className="d-flex flex-column gap-2">
                    <div className="d-flex gap-2">
                      <PhoneCountryCodePicker
                        value={clientForm.phoneCountryCode || "+91"}
                        onChange={(code) => setClientForm((prev) => ({ ...prev, phoneCountryCode: code }))}
                        options={DIAL_COUNTRY_PICKER_OPTIONS}
                        style={{ maxWidth: "220px" }}
                        ariaLabel="Client phone country code"
                      />
                      <input className="form-control" maxLength={getBusinessAutopilotMaxLength("phone")} value={clientForm.phone || ""} onChange={(event) => setClientForm((prev) => ({ ...prev, phone: limitedInput("phone", event.target.value) }))} placeholder="Phone number" />
                      <button
                        type="button"
                        className="btn btn-outline-light btn-sm"
                        title="Add Contact Number"
                        onClick={() => setClientForm((prev) => ({ ...prev, additionalPhones: [...(prev.additionalPhones || []), { countryCode: "+91", number: "" }] }))}
                      >
                        +
                      </button>
                    </div>
                    {(clientForm.additionalPhones || []).map((row, index) => (
                      <div className="d-flex gap-2" key={`users-client-phone-${index}`}>
                        <PhoneCountryCodePicker
                          value={row.countryCode || "+91"}
                          onChange={(code) => setClientForm((prev) => ({
                            ...prev,
                            additionalPhones: (prev.additionalPhones || []).map((item, i) => (i === index ? { ...item, countryCode: code } : item))
                          }))}
                          options={DIAL_COUNTRY_PICKER_OPTIONS}
                          style={{ maxWidth: "220px" }}
                          ariaLabel="Additional phone country code"
                        />
                        <input
                          className="form-control"
                          value={row.number || ""}
                          placeholder="Additional contact number"
                          onChange={(event) => setClientForm((prev) => ({
                            ...prev,
                            additionalPhones: (prev.additionalPhones || []).map((item, i) => (i === index ? { ...item, number: limitedInput("phone", event.target.value) } : item))
                          }))}
                        />
                        <button
                          type="button"
                          className="btn btn-outline-danger btn-sm"
                          onClick={() => setClientForm((prev) => ({
                            ...prev,
                            additionalPhones: (prev.additionalPhones || []).filter((_, i) => i !== index)
                          }))}
                        >
                          x
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="col-12 col-xl-6">
                  <label className="form-label small text-secondary mb-1">Email ID</label>
                  <div className="d-flex flex-column gap-2">
                    <div className="d-flex gap-2">
                      <input className="form-control" maxLength={getBusinessAutopilotMaxLength("email")} value={clientForm.email || ""} onChange={(event) => setClientForm((prev) => ({ ...prev, email: limitedInput("email", event.target.value) }))} placeholder="Primary email" />
                      <button
                        type="button"
                        className="btn btn-outline-light btn-sm"
                        title="Add Email ID"
                        onClick={() => setClientForm((prev) => ({ ...prev, additionalEmails: [...(prev.additionalEmails || []), ""] }))}
                      >
                        +
                      </button>
                    </div>
                    {(clientForm.additionalEmails || []).map((value, index) => (
                      <div className="d-flex gap-2" key={`users-client-email-${index}`}>
                        <input
                          className="form-control"
                          value={value || ""}
                          placeholder="Additional email ID"
                          onChange={(event) => setClientForm((prev) => ({
                            ...prev,
                            additionalEmails: (prev.additionalEmails || []).map((item, i) => (i === index ? limitedInput("email", event.target.value) : item))
                          }))}
                        />
                        <button
                          type="button"
                          className="btn btn-outline-danger btn-sm"
                          onClick={() => setClientForm((prev) => ({
                            ...prev,
                            additionalEmails: (prev.additionalEmails || []).filter((_, i) => i !== index)
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
                    <label className="form-label small text-secondary mb-0">Billing Address</label>
                    <label className="form-check-label small text-secondary d-flex align-items-center gap-2 mb-0">
                      <input
                        type="checkbox"
                        className="form-check-input mt-0"
                        checked={Boolean(clientForm.billingShippingSame)}
                        onChange={(event) => setClientForm((prev) => ({ ...prev, billingShippingSame: event.target.checked }))}
                      />
                      Billing and Shipping Same
                    </label>
                  </div>
                  <textarea className="form-control mb-2" rows="2" maxLength={getBusinessAutopilotMaxLength("billingAddress", { isTextarea: true })} value={clientForm.billingAddress || ""} onChange={(event) => setClientForm((prev) => ({ ...prev, billingAddress: limitedTextarea("billingAddress", event.target.value) }))} placeholder="Billing address" />
                  <div className="d-flex flex-column gap-2">
                    <div>
                      <label className="form-label small text-secondary mb-1">Country</label>
                      <select className="form-select" value={clientForm.billingCountry || "India"} onChange={(event) => setClientForm((prev) => ({ ...prev, billingCountry: event.target.value, billingState: "" }))}>
                        {COUNTRY_OPTIONS.map((country) => <option key={`users-client-country-${country}`} value={country}>{country}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="form-label small text-secondary mb-1">State</label>
                      {billingStateOptions.length ? (
                        <select className="form-select" value={clientForm.billingState || ""} onChange={(event) => setClientForm((prev) => ({ ...prev, billingState: event.target.value }))}>
                          <option value="">Select State</option>
                          {billingStateOptions.map((state) => <option key={`users-client-state-${state}`} value={state}>{state}</option>)}
                        </select>
                      ) : (
                        <input className="form-control" maxLength={getBusinessAutopilotMaxLength("billingState")} value={clientForm.billingState || ""} onChange={(event) => setClientForm((prev) => ({ ...prev, billingState: limitedInput("billingState", event.target.value) }))} placeholder="State / Province / Region" />
                      )}
                    </div>
                    <div>
                      <label className="form-label small text-secondary mb-1">Pincode</label>
                      <input className="form-control" maxLength={getBusinessAutopilotMaxLength("billingPincode")} value={clientForm.billingPincode || ""} onChange={(event) => setClientForm((prev) => ({ ...prev, billingPincode: limitedInput("billingPincode", event.target.value) }))} placeholder="Pincode" />
                    </div>
                  </div>
                </div>
                {!clientForm.billingShippingSame ? (
                  <div className="col-12 col-xl-6">
                    <label className="form-label small text-secondary mb-1">Shipping Address</label>
                    <textarea className="form-control mb-2" rows="2" maxLength={getBusinessAutopilotMaxLength("shippingAddress", { isTextarea: true })} value={clientForm.shippingAddress || ""} onChange={(event) => setClientForm((prev) => ({ ...prev, shippingAddress: limitedTextarea("shippingAddress", event.target.value) }))} placeholder="Shipping address" />
                    <div className="d-flex flex-column gap-2">
                      <div>
                        <label className="form-label small text-secondary mb-1">Country</label>
                        <select className="form-select" value={clientForm.shippingCountry || "India"} onChange={(event) => setClientForm((prev) => ({ ...prev, shippingCountry: event.target.value, shippingState: "" }))}>
                          {COUNTRY_OPTIONS.map((country) => <option key={`users-client-shipping-country-${country}`} value={country}>{country}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="form-label small text-secondary mb-1">State</label>
                        {shippingStateOptions.length ? (
                          <select className="form-select" value={clientForm.shippingState || ""} onChange={(event) => setClientForm((prev) => ({ ...prev, shippingState: event.target.value }))}>
                            <option value="">Select State</option>
                            {shippingStateOptions.map((state) => <option key={`users-client-shipping-state-${state}`} value={state}>{state}</option>)}
                          </select>
                        ) : (
                          <input className="form-control" maxLength={getBusinessAutopilotMaxLength("shippingState")} value={clientForm.shippingState || ""} onChange={(event) => setClientForm((prev) => ({ ...prev, shippingState: limitedInput("shippingState", event.target.value) }))} placeholder="State / Province / Region" />
                        )}
                      </div>
                      <div>
                        <label className="form-label small text-secondary mb-1">Pincode</label>
                        <input className="form-control" maxLength={getBusinessAutopilotMaxLength("shippingPincode")} value={clientForm.shippingPincode || ""} onChange={(event) => setClientForm((prev) => ({ ...prev, shippingPincode: limitedInput("shippingPincode", event.target.value) }))} placeholder="Pincode" />
                      </div>
                    </div>
                  </div>
                ) : null}
              </div>
              <div className="d-flex gap-2">
                <button type="submit" className="btn btn-success btn-sm" disabled={!canManageUsers}>{editingClientId ? "Update Client" : "Create Client"}</button>
                {editingClientId ? <button type="button" className="btn btn-outline-light btn-sm" onClick={resetClientForm}>Cancel</button> : null}
              </div>
            </form>
          </div>

          <div>
            <h6 className="mb-3">Client List</h6>
            <div className="d-flex flex-wrap align-items-center justify-content-end gap-2 mb-2">
              <span className="badge bg-secondary">{filteredClients.length} clients</span>
              <input
                ref={clientImportInputRef}
                type="file"
                accept=".csv,text/csv,.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,.xls,application/vnd.ms-excel"
                className="d-none"
                onChange={onClientImportFileChange}
              />
              <button type="button" className="btn btn-sm btn-outline-success" onClick={triggerClientImportPicker} disabled={!canManageUsers}>
                <i className="bi bi-file-earmark-excel me-1" aria-hidden="true" />
                Import
              </button>
              <button type="button" className="btn btn-sm btn-outline-success" onClick={exportClientsAsExcelCsv}>
                <i className="bi bi-file-earmark-excel me-1" aria-hidden="true" />
                Export
              </button>
              <button type="button" className="btn btn-sm btn-outline-success" onClick={exportClientsAsPdf}>
                <i className="bi bi-file-earmark-pdf me-1" aria-hidden="true" />
                Export
              </button>
              <div className="table-search">
                <i className="bi bi-search" aria-hidden="true" />
                <input type="search" className="form-control form-control-sm" placeholder="Search clients" value={clientSearch} onChange={(event) => setClientSearch(event.target.value)} />
              </div>
            </div>
            <div className="table-responsive">
              <table className="table table-dark table-hover align-middle mb-0">
                <thead>
                  <tr>
                    <th>Company Name</th>
                    <th>Client Name</th>
                    <th>GSTIN</th>
                    <th>Contact Number</th>
                    <th>Email ID</th>
                    <th>Location</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedClients.length ? (
                    paginatedClients.map((row) => (
                      <tr key={row.id}>
                        <td>{row.companyName || "-"}</td>
                        <td>{row.clientName || "-"}</td>
                        <td>{row.gstin || "-"}</td>
                        <td style={{ whiteSpace: "normal" }}>{formatSharedCustomerPhones(row).join(", ") || "-"}</td>
                        <td style={{ whiteSpace: "normal" }}>{formatSharedCustomerEmails(row).join(", ") || "-"}</td>
                        <td>{[row.billingState || row.state, row.billingCountry || row.country, row.billingPincode || row.pincode].filter(Boolean).join(", ") || "-"}</td>
                        <td>
                          <div className="d-inline-flex gap-2">
                            <button type="button" className="btn btn-sm btn-outline-info" onClick={() => editClient(row)}>Edit</button>
                            <button type="button" className="btn btn-sm btn-outline-danger" disabled={!canManageUsers} onClick={() => deleteClient(row.id)}>Delete</button>
                          </div>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr><td colSpan={7}>No clients found.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 mt-2">
              <div className="small text-secondary">
                Showing {clientStartIndex} to {clientEndIndex} of {filteredClients.length} entries
              </div>
              <TablePagination page={normalizedClientPage} totalPages={totalClientPages} onPageChange={setClientPage} />
            </div>
          </div>
        </>
      ) : (
        <>
          <div className="card p-3">
            <h6 className="mb-3">{editingVendorId ? "Edit Vendor" : "Create Vendor"}</h6>
            <form className="d-flex flex-column gap-3" onSubmit={saveVendor}>
              <div className="row g-3">
                <div className="col-12 col-xl-4">
                  <label className="form-label small text-secondary mb-1">Company Name</label>
                  <input className="form-control" maxLength={getBusinessAutopilotMaxLength("companyName")} value={vendorForm.companyName || ""} onChange={(event) => setVendorForm((prev) => ({ ...prev, companyName: limitedInput("companyName", event.target.value), name: limitedInput("companyName", event.target.value) }))} placeholder="Company name" />
                </div>
                <div className="col-12 col-xl-4">
                  <label className="form-label small text-secondary mb-1">Vendor Name</label>
                  <input className="form-control" maxLength={getBusinessAutopilotMaxLength("clientName")} value={vendorForm.clientName || ""} onChange={(event) => setVendorForm((prev) => ({ ...prev, clientName: limitedInput("clientName", event.target.value) }))} placeholder="Vendor / Contact person" />
                </div>
                <div className="col-12 col-xl-4">
                  <label className="form-label small text-secondary mb-1">GSTIN</label>
                  <input className="form-control" maxLength={getBusinessAutopilotMaxLength("gstin")} value={vendorForm.gstin || ""} onChange={(event) => setVendorForm((prev) => ({ ...prev, gstin: limitedInput("gstin", event.target.value) }))} placeholder="GSTIN" />
                </div>
                <div className="col-12 col-xl-6">
                  <label className="form-label small text-secondary mb-1">Phone Number</label>
                  <div className="d-flex flex-column gap-2">
                    <div className="d-flex gap-2">
                      <PhoneCountryCodePicker
                        value={vendorForm.phoneCountryCode || "+91"}
                        onChange={(code) => setVendorForm((prev) => ({ ...prev, phoneCountryCode: code }))}
                        options={DIAL_COUNTRY_PICKER_OPTIONS}
                        style={{ maxWidth: "220px" }}
                        ariaLabel="Vendor phone country code"
                      />
                      <input className="form-control" maxLength={getBusinessAutopilotMaxLength("phone")} value={vendorForm.phone || ""} onChange={(event) => setVendorForm((prev) => ({ ...prev, phone: limitedInput("phone", event.target.value) }))} placeholder="Phone number" />
                      <button
                        type="button"
                        className="btn btn-outline-light btn-sm"
                        title="Add Contact Number"
                        onClick={() => setVendorForm((prev) => ({ ...prev, additionalPhones: [...(prev.additionalPhones || []), { countryCode: "+91", number: "" }] }))}
                      >
                        +
                      </button>
                    </div>
                    {(vendorForm.additionalPhones || []).map((row, index) => (
                      <div className="d-flex gap-2" key={`users-vendor-phone-${index}`}>
                        <PhoneCountryCodePicker
                          value={row.countryCode || "+91"}
                          onChange={(code) => setVendorForm((prev) => ({
                            ...prev,
                            additionalPhones: (prev.additionalPhones || []).map((item, i) => (i === index ? { ...item, countryCode: code } : item))
                          }))}
                          options={DIAL_COUNTRY_PICKER_OPTIONS}
                          style={{ maxWidth: "220px" }}
                          ariaLabel="Additional vendor phone country code"
                        />
                        <input
                          className="form-control"
                          value={row.number || ""}
                          placeholder="Additional contact number"
                          onChange={(event) => setVendorForm((prev) => ({
                            ...prev,
                            additionalPhones: (prev.additionalPhones || []).map((item, i) => (i === index ? { ...item, number: limitedInput("phone", event.target.value) } : item))
                          }))}
                        />
                        <button
                          type="button"
                          className="btn btn-outline-danger btn-sm"
                          onClick={() => setVendorForm((prev) => ({
                            ...prev,
                            additionalPhones: (prev.additionalPhones || []).filter((_, i) => i !== index)
                          }))}
                        >
                          x
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="col-12 col-xl-6">
                  <label className="form-label small text-secondary mb-1">Email ID</label>
                  <div className="d-flex flex-column gap-2">
                    <div className="d-flex gap-2">
                      <input className="form-control" maxLength={getBusinessAutopilotMaxLength("email")} value={vendorForm.email || ""} onChange={(event) => setVendorForm((prev) => ({ ...prev, email: limitedInput("email", event.target.value) }))} placeholder="Primary email" />
                      <button
                        type="button"
                        className="btn btn-outline-light btn-sm"
                        title="Add Email ID"
                        onClick={() => setVendorForm((prev) => ({ ...prev, additionalEmails: [...(prev.additionalEmails || []), ""] }))}
                      >
                        +
                      </button>
                    </div>
                    {(vendorForm.additionalEmails || []).map((value, index) => (
                      <div className="d-flex gap-2" key={`users-vendor-email-${index}`}>
                        <input
                          className="form-control"
                          value={value || ""}
                          placeholder="Additional email ID"
                          onChange={(event) => setVendorForm((prev) => ({
                            ...prev,
                            additionalEmails: (prev.additionalEmails || []).map((item, i) => (i === index ? limitedInput("email", event.target.value) : item))
                          }))}
                        />
                        <button
                          type="button"
                          className="btn btn-outline-danger btn-sm"
                          onClick={() => setVendorForm((prev) => ({
                            ...prev,
                            additionalEmails: (prev.additionalEmails || []).filter((_, i) => i !== index)
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
                    <label className="form-label small text-secondary mb-0">Billing Address</label>
                    <label className="form-check-label small text-secondary d-flex align-items-center gap-2 mb-0">
                      <input
                        type="checkbox"
                        className="form-check-input mt-0"
                        checked={Boolean(vendorForm.billingShippingSame)}
                        onChange={(event) => setVendorForm((prev) => ({ ...prev, billingShippingSame: event.target.checked }))}
                      />
                      Billing and Shipping Same
                    </label>
                  </div>
                  <textarea className="form-control mb-2" rows="2" maxLength={getBusinessAutopilotMaxLength("billingAddress", { isTextarea: true })} value={vendorForm.billingAddress || ""} onChange={(event) => setVendorForm((prev) => ({ ...prev, billingAddress: limitedTextarea("billingAddress", event.target.value) }))} placeholder="Billing address" />
                  <div className="d-flex flex-column gap-2">
                    <div>
                      <label className="form-label small text-secondary mb-1">Country</label>
                      <select className="form-select" value={vendorForm.billingCountry || "India"} onChange={(event) => setVendorForm((prev) => ({ ...prev, billingCountry: event.target.value, billingState: "" }))}>
                        {COUNTRY_OPTIONS.map((country) => <option key={`users-vendor-country-${country}`} value={country}>{country}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="form-label small text-secondary mb-1">State</label>
                      {vendorBillingStateOptions.length ? (
                        <select className="form-select" value={vendorForm.billingState || ""} onChange={(event) => setVendorForm((prev) => ({ ...prev, billingState: event.target.value }))}>
                          <option value="">Select State</option>
                          {vendorBillingStateOptions.map((state) => <option key={`users-vendor-state-${state}`} value={state}>{state}</option>)}
                        </select>
                      ) : (
                        <input className="form-control" maxLength={getBusinessAutopilotMaxLength("billingState")} value={vendorForm.billingState || ""} onChange={(event) => setVendorForm((prev) => ({ ...prev, billingState: limitedInput("billingState", event.target.value) }))} placeholder="State / Province / Region" />
                      )}
                    </div>
                    <div>
                      <label className="form-label small text-secondary mb-1">Pincode</label>
                      <input className="form-control" maxLength={getBusinessAutopilotMaxLength("billingPincode")} value={vendorForm.billingPincode || ""} onChange={(event) => setVendorForm((prev) => ({ ...prev, billingPincode: limitedInput("billingPincode", event.target.value) }))} placeholder="Pincode" />
                    </div>
                  </div>
                </div>
                {!vendorForm.billingShippingSame ? (
                  <div className="col-12 col-xl-6">
                    <label className="form-label small text-secondary mb-1">Shipping Address</label>
                    <textarea className="form-control mb-2" rows="2" maxLength={getBusinessAutopilotMaxLength("shippingAddress", { isTextarea: true })} value={vendorForm.shippingAddress || ""} onChange={(event) => setVendorForm((prev) => ({ ...prev, shippingAddress: limitedTextarea("shippingAddress", event.target.value) }))} placeholder="Shipping address" />
                    <div className="d-flex flex-column gap-2">
                      <div>
                        <label className="form-label small text-secondary mb-1">Country</label>
                        <select className="form-select" value={vendorForm.shippingCountry || "India"} onChange={(event) => setVendorForm((prev) => ({ ...prev, shippingCountry: event.target.value, shippingState: "" }))}>
                          {COUNTRY_OPTIONS.map((country) => <option key={`users-vendor-shipping-country-${country}`} value={country}>{country}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="form-label small text-secondary mb-1">State</label>
                        {vendorShippingStateOptions.length ? (
                          <select className="form-select" value={vendorForm.shippingState || ""} onChange={(event) => setVendorForm((prev) => ({ ...prev, shippingState: event.target.value }))}>
                            <option value="">Select State</option>
                            {vendorShippingStateOptions.map((state) => <option key={`users-vendor-shipping-state-${state}`} value={state}>{state}</option>)}
                          </select>
                        ) : (
                          <input className="form-control" maxLength={getBusinessAutopilotMaxLength("shippingState")} value={vendorForm.shippingState || ""} onChange={(event) => setVendorForm((prev) => ({ ...prev, shippingState: limitedInput("shippingState", event.target.value) }))} placeholder="State / Province / Region" />
                        )}
                      </div>
                      <div>
                        <label className="form-label small text-secondary mb-1">Pincode</label>
                        <input className="form-control" maxLength={getBusinessAutopilotMaxLength("shippingPincode")} value={vendorForm.shippingPincode || ""} onChange={(event) => setVendorForm((prev) => ({ ...prev, shippingPincode: limitedInput("shippingPincode", event.target.value) }))} placeholder="Pincode" />
                      </div>
                    </div>
                  </div>
                ) : null}
              </div>
              <div className="d-flex gap-2">
                <button type="submit" className="btn btn-success btn-sm" disabled={!canManageUsers}>{editingVendorId ? "Update Vendor" : "Create Vendor"}</button>
                {editingVendorId ? <button type="button" className="btn btn-outline-light btn-sm" onClick={resetVendorForm}>Cancel</button> : null}
              </div>
            </form>
          </div>

          <div>
            <h6 className="mb-3">Vendor Registration List</h6>
            <div className="d-flex flex-wrap align-items-center justify-content-end gap-2 mb-2">
              <span className="badge bg-secondary">{filteredVendors.length} vendors</span>
              <input
                ref={vendorImportInputRef}
                type="file"
                accept=".csv,text/csv,.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,.xls,application/vnd.ms-excel"
                className="d-none"
                onChange={onVendorImportFileChange}
              />
              <button type="button" className="btn btn-sm btn-outline-success" onClick={triggerVendorImportPicker} disabled={!canManageUsers}>
                <i className="bi bi-file-earmark-excel me-1" aria-hidden="true" />
                Import
              </button>
              <button type="button" className="btn btn-sm btn-outline-success" onClick={exportVendorsAsExcelCsv}>
                <i className="bi bi-file-earmark-excel me-1" aria-hidden="true" />
                Export
              </button>
              <button type="button" className="btn btn-sm btn-outline-success" onClick={exportVendorsAsPdf}>
                <i className="bi bi-file-earmark-pdf me-1" aria-hidden="true" />
                Export
              </button>
              <div className="table-search">
                <i className="bi bi-search" aria-hidden="true" />
                <input type="search" className="form-control form-control-sm" placeholder="Search vendors" value={vendorSearch} onChange={(event) => setVendorSearch(event.target.value)} />
              </div>
            </div>
            <div className="table-responsive">
              <table className="table table-dark table-hover align-middle mb-0">
                <thead>
                  <tr>
                    <th>Company Name</th>
                    <th>Vendor Name</th>
                    <th>GSTIN</th>
                    <th>Contact Number</th>
                    <th>Email ID</th>
                    <th>Location</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedVendors.length ? (
                    paginatedVendors.map((row) => (
                      <tr key={row.id}>
                        <td>{row.companyName || "-"}</td>
                        <td>{row.clientName || "-"}</td>
                        <td>{row.gstin || "-"}</td>
                        <td style={{ whiteSpace: "normal" }}>{formatSharedCustomerPhones(row).join(", ") || "-"}</td>
                        <td style={{ whiteSpace: "normal" }}>{formatSharedCustomerEmails(row).join(", ") || "-"}</td>
                        <td>{[row.billingState || row.state, row.billingCountry || row.country, row.billingPincode || row.pincode].filter(Boolean).join(", ") || "-"}</td>
                        <td>
                          <div className="d-inline-flex gap-2">
                            <button type="button" className="btn btn-sm btn-outline-info" onClick={() => editVendor(row)}>Edit</button>
                            <button type="button" className="btn btn-sm btn-outline-danger" disabled={!canManageUsers} onClick={() => deleteVendor(row.id)}>Delete</button>
                          </div>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr><td colSpan={7}>No vendors found.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 mt-2">
              <div className="small text-secondary">
                Showing {vendorStartIndex} to {vendorEndIndex} of {filteredVendors.length} entries
              </div>
              <TablePagination page={normalizedVendorPage} totalPages={totalVendorPages} onPageChange={setVendorPage} />
            </div>
          </div>
        </>
      )}
      {actionDialog.open ? (
        <div className="modal-overlay" onClick={() => closeActionDialog(actionDialog.variant !== "confirm")}>
          <div className="modal-panel" style={{ width: "min(520px, 94vw)" }} onClick={(event) => event.stopPropagation()}>
            <div className="mb-3">
              <h5 className="mb-1">{actionDialog.title}</h5>
              <div className="text-secondary" style={{ whiteSpace: "pre-wrap" }}>
                {actionDialog.message}
              </div>
            </div>
            <div className="d-flex flex-wrap justify-content-end gap-2">
              {actionDialog.variant === "confirm" ? (
                <button type="button" className="btn btn-outline-light btn-sm" onClick={() => closeActionDialog(false)}>
                  {actionDialog.cancelText}
                </button>
              ) : null}
              <button type="button" className="btn btn-primary btn-sm" onClick={() => closeActionDialog(true)}>
                {actionDialog.confirmText}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
