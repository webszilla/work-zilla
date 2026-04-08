import { Suspense, lazy, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import * as XLSX from "xlsx";
import { apiFetch } from "../lib/api.js";
import TablePagination from "../components/TablePagination.jsx";
import PhoneCountryCodePicker from "../components/PhoneCountryCodePicker.jsx";
import { DIAL_CODE_LABEL_OPTIONS, COUNTRY_OPTIONS, getStateOptionsForCountry } from "../lib/locationData.js";
import { clampBusinessAutopilotText, getBusinessAutopilotMaxLength } from "../lib/businessAutopilotFormRules.js";

const HrManagementModule = lazy(() =>
  import("./BusinessAutopilotModulePage.jsx").then((module) => ({ default: module.HrManagementModule }))
);

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

const defaultEmailCheckState = {
  checking: false,
  checkedEmail: "",
  exists: false,
  message: "",
  status: "idle",
  existingUser: false,
  samePasswordAllowed: false,
  passwordRequired: true,
  alreadyBusinessAutopilotUser: false,
  belongsToAnotherOrganization: false,
  existingProducts: [],
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
  base_included_users: 0,
  extra_included_users: 0,
  allow_addons: false,
  has_unlimited_users: false,
  can_add_users: false,
  has_subscription: false,
  limit_message: "",
};

const ROLE_ACCESS_STORAGE_KEY = "wz_business_autopilot_role_access";
const USER_DIRECTORY_STORAGE_KEY = "wz_business_autopilot_user_directory";
const ACCOUNTS_STORAGE_KEY = "wz_business_autopilot_accounts_module";
const ACCOUNTS_STORAGE_KEY_PREFIX = "wz_business_autopilot_accounts_module_scope";
const BA_ACTIVE_ORG_STORAGE_KEY = "wz_business_autopilot_active_org_id";
const HR_STORAGE_KEY = "wz_business_autopilot_hr_module";
const CRM_STORAGE_KEY = "wz_business_autopilot_crm_module";
const CRM_STORAGE_KEY_ACTIVE = "wz_business_autopilot_crm_active_key";
const CRM_STORAGE_KEY_PREFIX = "wz_business_autopilot_crm_module_scope";
const CRM_SHARED_CONTACTS_KEY_PREFIX = "wz_business_autopilot_crm_contacts_scope";
const CRM_SHARED_CONTACTS_GLOBAL_KEY = `${CRM_SHARED_CONTACTS_KEY_PREFIX}__global`;
const CRM_CONTACT_TO_CLIENT_DRAFT_KEY_PREFIX = "wz_business_autopilot_crm_contact_to_client_scope";
const CRM_CONTACT_TO_CLIENT_DRAFT_GLOBAL_KEY = `${CRM_CONTACT_TO_CLIENT_DRAFT_KEY_PREFIX}__global`;
const CRM_SALES_ORDER_DRAFT_KEY_PREFIX = "wz_business_autopilot_crm_sales_order_scope";
const CRM_SALES_ORDER_DRAFT_GLOBAL_KEY = `${CRM_SALES_ORDER_DRAFT_KEY_PREFIX}__global`;
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
const ROLE_ACCESS_SECTION_MODULE_SLUG = {
  crm: "crm",
  hr: "hrm",
  projects: "projects",
  accounts: "accounts",
  subscriptions: "subscriptions",
  ticketing: "ticketing",
  stocks: "stocks",
};
const ACCESS_LEVEL_OPTIONS = ["No Access", "View", "View and Edit", "Create, View and Edit", "Full Access"];
const USER_SUB_ACCESS_OPTIONS = [
  { key: "employee", label: "Employee" },
  { key: "clients", label: "Clients" },
  { key: "vendors", label: "Vendor Registration" },
];
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
const TOP_TAB_KEYS = ["users", "create-employee", "role-access", "clients", "vendors"];
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

function normalizeRoleAccessLevel(level) {
  const value = String(level || "").trim();
  if (value === "Create/Edit") {
    return "View and Edit";
  }
  return ACCESS_LEVEL_OPTIONS.includes(value) ? value : "No Access";
}

function createDefaultUserSubSections() {
  return USER_SUB_ACCESS_OPTIONS.reduce((acc, item) => {
    acc[item.key] = { enabled: false, access_level: "No Access" };
    return acc;
  }, {});
}

function normalizeUserSubSections(value, fallbackAccessLevel = "No Access") {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const fallbackLevel = normalizeRoleAccessLevel(fallbackAccessLevel);
  return USER_SUB_ACCESS_OPTIONS.reduce((acc, item) => {
    const raw = source[item.key];
    const safe = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
    const accessLevel = normalizeRoleAccessLevel(safe.access_level || "No Access");
    const enabled = Boolean(safe.enabled) && accessLevel !== "No Access";
    acc[item.key] = {
      enabled,
      access_level: enabled ? accessLevel : (fallbackLevel === "No Access" ? "No Access" : fallbackLevel),
    };
    return acc;
  }, {});
}

function normalizeRoleAccessMap(value) {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const normalized = {};
  Object.entries(source).forEach(([key, record]) => {
    const safeRecord = record && typeof record === "object" && !Array.isArray(record) ? record : {};
    const sections = safeRecord.sections && typeof safeRecord.sections === "object" && !Array.isArray(safeRecord.sections)
      ? safeRecord.sections
      : {};
    normalized[key] = {
      ...createDefaultRoleAccessRecord(),
      ...safeRecord,
      sections: ROLE_ACCESS_SECTIONS.reduce((acc, section) => {
        acc[section.key] = normalizeRoleAccessLevel(sections[section.key] || "No Access");
        return acc;
      }, {}),
      user_sub_sections: normalizeUserSubSections(
        safeRecord.user_sub_sections,
        sections.users || "No Access"
      ),
    };
  });
  return normalized;
}

function extractEnabledModuleSlugs(payload) {
  const toSlugList = (source) => {
    if (!Array.isArray(source)) {
      return [];
    }
    const collected = source
      .map((item) => {
        if (typeof item === "string") {
          return item;
        }
        if (item && typeof item === "object") {
          return item.slug;
        }
        return "";
      })
      .map((value) => String(value || "").trim().toLowerCase())
      .filter(Boolean);
    return Array.from(new Set(collected));
  };

  const fromEnabledModules = toSlugList(payload?.enabled_modules);
  if (fromEnabledModules.length) {
    return fromEnabledModules;
  }

  if (Array.isArray(payload?.modules)) {
    const enabledFromModules = payload.modules
      .filter((module) => Boolean(module?.enabled))
      .map((module) => module?.slug);
    const fromModules = toSlugList(enabledFromModules);
    if (fromModules.length) {
      return fromModules;
    }
  }

  return [];
}

function encodeRoleAccessBlob(value) {
  try {
    const serialized = JSON.stringify(value || {});
    const encoder = typeof TextEncoder !== "undefined" ? new TextEncoder() : null;
    if (encoder && typeof window !== "undefined" && typeof window.btoa === "function") {
      const bytes = encoder.encode(serialized);
      let binary = "";
      bytes.forEach((byte) => {
        binary += String.fromCharCode(byte);
      });
      return window.btoa(binary);
    }
    if (typeof window !== "undefined" && typeof window.btoa === "function") {
      return window.btoa(unescape(encodeURIComponent(serialized)));
    }
  } catch (_error) {
    return "";
  }
  return "";
}

function normalizeRoleToken(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
}

function resolveRoleAccessRecord(roleAccessMap, profileRole, employeeRole) {
  const safeMap = roleAccessMap && typeof roleAccessMap === "object" ? roleAccessMap : {};
  const normalizedProfileRole = normalizeRoleToken(profileRole);
  const normalizedEmployeeRole = normalizeRoleToken(employeeRole);
  const entries = Object.entries(safeMap).filter(([, value]) => value && typeof value === "object");

  if (normalizedEmployeeRole) {
    for (const [key, value] of entries) {
      const [scope, rawRole] = String(key || "").split(":", 2);
      if (scope === "employee_role" && normalizeRoleToken(rawRole) === normalizedEmployeeRole) {
        return value;
      }
    }
  }
  if (normalizedProfileRole) {
    for (const [key, value] of entries) {
      const [scope, rawRole] = String(key || "").split(":", 2);
      if (scope === "system" && normalizeRoleToken(rawRole) === normalizedProfileRole) {
        return value;
      }
    }
  }
  return null;
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
    user_sub_sections: createDefaultUserSubSections(),
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

function isLegacyDemoAccountCustomer(row = {}) {
  const company = String(row.companyName || row.name || "").trim().toLowerCase();
  const email = String(row.email || "").trim().toLowerCase();
  return (
    company === "ultra hd prints"
    || email === "accounts@ultrahdprints.example"
    || String(row.id || "").trim() === "cust_1"
  );
}

function sanitizeAccountsWorkspaceData(data = { customers: [], vendors: [] }) {
  const safeData = data && typeof data === "object" ? data : { customers: [], vendors: [] };
  return {
    ...safeData,
    customers: (Array.isArray(safeData.customers) ? safeData.customers : []).filter((row) => !isLegacyDemoAccountCustomer(row)),
    vendors: Array.isArray(safeData.vendors) ? safeData.vendors : [],
  };
}

function setActiveBusinessAutopilotOrgId(orgId = "") {
  const normalizedOrgId = String(orgId || "").replace(/[^a-z0-9_.-]/gi, "_");
  if (!normalizedOrgId) {
    return;
  }
  window.localStorage.setItem(BA_ACTIVE_ORG_STORAGE_KEY, normalizedOrgId);
}

function getActiveBusinessAutopilotOrgId() {
  return String(window.localStorage.getItem(BA_ACTIVE_ORG_STORAGE_KEY) || "").trim();
}

function buildScopedAccountsStorageKey(orgId = "") {
  const normalizedOrgId = String(orgId || "").replace(/[^a-z0-9_.-]/gi, "_");
  return normalizedOrgId
    ? `${ACCOUNTS_STORAGE_KEY_PREFIX}__${normalizedOrgId}`
    : ACCOUNTS_STORAGE_KEY;
}

function resolveScopedAccountsStorageKey(preferredOrgId = "") {
  const resolvedOrgId = String(preferredOrgId || "").trim()
    || getActiveBusinessAutopilotOrgId()
    || getActiveCrmScopeOrgId();
  return buildScopedAccountsStorageKey(resolvedOrgId);
}

function readLegacyAccountsData() {
  try {
    const raw = window.localStorage.getItem(ACCOUNTS_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return sanitizeAccountsWorkspaceData(parsed);
  } catch {
    return { customers: [], vendors: [] };
  }
}

function readSharedAccountsData(storageKey = "") {
  try {
    const resolvedKey = String(storageKey || "").trim() || resolveScopedAccountsStorageKey();
    const raw = window.localStorage.getItem(resolvedKey);
    if (raw) {
      const parsed = JSON.parse(raw);
      return sanitizeAccountsWorkspaceData(parsed);
    }
    return resolvedKey === ACCOUNTS_STORAGE_KEY ? readLegacyAccountsData() : { customers: [], vendors: [] };
  } catch {
    return { customers: [], vendors: [] };
  }
}

function readSharedAccountsCustomers(storageKey = "") {
  return (readSharedAccountsData(storageKey).customers || []).map((row) => normalizeSharedCustomerRecord(row));
}

function readSharedAccountsVendors(storageKey = "") {
  return (readSharedAccountsData(storageKey).vendors || []).map((row) => normalizeSharedCustomerRecord(row));
}

async function persistSharedAccountsCustomers(nextCustomers) {
  const accountsStorageKey = resolveScopedAccountsStorageKey();
  const currentData = readSharedAccountsData(accountsStorageKey);
  const nextData = {
    ...currentData,
    customers: nextCustomers.map((row) => normalizeSharedCustomerRecord(row)),
  };
  window.localStorage.setItem(accountsStorageKey, JSON.stringify(nextData));
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

function normalizeCrmContactRecord(row = {}) {
  return {
    id: String(row?.id || "").trim(),
    name: String(row?.name || row?.clientName || "").trim(),
    company: String(row?.company || row?.companyName || row?.name || "").trim(),
    email: String(row?.email || "").trim(),
    phoneCountryCode: String(row?.phoneCountryCode || "+91").trim() || "+91",
    phone: String(row?.phone || row?.mobile || row?.contactNumber || "").trim(),
  };
}

function getActiveCrmScopeOrgId() {
  try {
    const activeKey = String(window.localStorage.getItem(CRM_STORAGE_KEY_ACTIVE) || "").trim();
    if (!activeKey.startsWith(`${CRM_STORAGE_KEY_PREFIX}__`)) {
      return "";
    }
    const parts = activeKey.replace(`${CRM_STORAGE_KEY_PREFIX}__`, "").split("__").filter(Boolean);
    return String(parts[0] || "").trim();
  } catch {
    return "";
  }
}

function readSharedCrmContacts() {
  try {
    const orgId = getActiveCrmScopeOrgId();
    const sharedKey = orgId ? `${CRM_SHARED_CONTACTS_KEY_PREFIX}__${String(orgId).replace(/[^a-z0-9_.-]/gi, "_")}` : "";
    const keysToTry = [sharedKey, CRM_SHARED_CONTACTS_GLOBAL_KEY, CRM_STORAGE_KEY].filter(Boolean);
    for (const key of keysToTry) {
      const raw = window.localStorage.getItem(key);
      if (!raw) {
        continue;
      }
      const parsed = JSON.parse(raw);
      const contacts = Array.isArray(parsed)
        ? parsed
        : Array.isArray(parsed?.contacts)
          ? parsed.contacts
          : [];
      const normalized = contacts
        .map((row) => normalizeCrmContactRecord(row))
        .filter((row) => row.name || row.company || row.email || row.phone);
      if (normalized.length || key === sharedKey) {
        return normalized;
      }
    }
    return [];
  } catch {
    return [];
  }
}

function sanitizeScopedStorageKeyPart(value = "") {
  return String(value || "").replace(/[^a-z0-9_.-]/gi, "_");
}

function buildScopedCrmContactToClientDraftStorageKey(orgId = "") {
  const normalizedOrgId = sanitizeScopedStorageKeyPart(orgId);
  return normalizedOrgId
    ? `${CRM_CONTACT_TO_CLIENT_DRAFT_KEY_PREFIX}__${normalizedOrgId}`
    : CRM_CONTACT_TO_CLIENT_DRAFT_GLOBAL_KEY;
}

function resolveCrmContactToClientDraftStorageKeys(preferredOrgId = "") {
  const resolvedOrgId = String(preferredOrgId || "").trim()
    || getActiveBusinessAutopilotOrgId()
    || getActiveCrmScopeOrgId();
  const scopedKey = buildScopedCrmContactToClientDraftStorageKey(resolvedOrgId);
  return Array.from(new Set([scopedKey, CRM_CONTACT_TO_CLIENT_DRAFT_GLOBAL_KEY].filter(Boolean)));
}

function normalizeCrmContactConversionDraft(value = {}) {
  const normalizedContact = normalizeCrmContactRecord(value);
  const sourceContactId = String(value?.sourceContactId || normalizedContact.id || "").trim();
  const hasContactData = sourceContactId
    || normalizedContact.name
    || normalizedContact.company
    || normalizedContact.email
    || normalizedContact.phone;
  if (!hasContactData) {
    return null;
  }
  return {
    sourceContactId,
    orgId: String(value?.orgId || "").trim(),
    id: sourceContactId || normalizedContact.id,
    name: normalizedContact.name,
    company: normalizedContact.company,
    email: normalizedContact.email,
    phoneCountryCode: normalizedContact.phoneCountryCode || "+91",
    phone: normalizedContact.phone,
  };
}

function readCrmContactToClientDraft(preferredOrgId = "") {
  try {
    const keysToTry = resolveCrmContactToClientDraftStorageKeys(preferredOrgId);
    for (const key of keysToTry) {
      const raw = window.localStorage.getItem(key);
      if (!raw) {
        continue;
      }
      const parsed = JSON.parse(raw);
      const normalizedDraft = normalizeCrmContactConversionDraft(parsed);
      if (normalizedDraft) {
        return normalizedDraft;
      }
    }
  } catch {
    // Ignore invalid draft payload and continue with standard flow.
  }
  return null;
}

function clearCrmContactToClientDraft(preferredOrgId = "") {
  try {
    resolveCrmContactToClientDraftStorageKeys(preferredOrgId).forEach((key) => {
      window.localStorage.removeItem(key);
    });
  } catch {
    // Ignore storage clear failures.
  }
}

function buildScopedCrmSalesOrderDraftStorageKey(orgId = "") {
  const normalizedOrgId = sanitizeScopedStorageKeyPart(orgId);
  return normalizedOrgId
    ? `${CRM_SALES_ORDER_DRAFT_KEY_PREFIX}__${normalizedOrgId}`
    : CRM_SALES_ORDER_DRAFT_GLOBAL_KEY;
}

function resolveCrmSalesOrderDraftStorageKeys(preferredOrgId = "") {
  const resolvedOrgId = String(preferredOrgId || "").trim()
    || getActiveBusinessAutopilotOrgId()
    || getActiveCrmScopeOrgId();
  const scopedKey = buildScopedCrmSalesOrderDraftStorageKey(resolvedOrgId);
  return Array.from(new Set([scopedKey, CRM_SALES_ORDER_DRAFT_GLOBAL_KEY].filter(Boolean)));
}

function readPendingCrmSalesOrderDraft(preferredOrgId = "") {
  try {
    const keysToTry = resolveCrmSalesOrderDraftStorageKeys(preferredOrgId);
    for (const key of keysToTry) {
      const raw = window.localStorage.getItem(key);
      if (!raw) {
        continue;
      }
      const parsed = JSON.parse(raw);
      if (parsed?.sourceDeal?.id) {
        return parsed;
      }
    }
  } catch {
    // Ignore invalid pending sales-order drafts.
  }
  return null;
}

function clearPendingCrmSalesOrderDraft(preferredOrgId = "") {
  try {
    resolveCrmSalesOrderDraftStorageKeys(preferredOrgId).forEach((key) => {
      window.localStorage.removeItem(key);
    });
  } catch {
    // Ignore storage clear failures.
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

function readBusinessAutopilotUserDirectoryRole(email = "") {
  if (typeof window === "undefined") {
    return "";
  }
  const lookupEmail = String(email || "").trim().toLowerCase();
  if (!lookupEmail) {
    return "";
  }
  try {
    const raw = window.localStorage.getItem(USER_DIRECTORY_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) {
      return "";
    }
    const matched = parsed.find(
      (row) => String(row?.email || "").trim().toLowerCase() === lookupEmail
    );
    return String(matched?.employee_role || "").trim();
  } catch {
    return "";
  }
}

function writeSharedHrEmployees(rows = []) {
  try {
    const existingRaw = window.localStorage.getItem(HR_STORAGE_KEY);
    const existingData = existingRaw ? JSON.parse(existingRaw) : {};
    const nextData = (existingData && typeof existingData === "object")
      ? { ...existingData, employees: Array.isArray(rows) ? rows : [] }
      : { employees: Array.isArray(rows) ? rows : [] };
    window.localStorage.setItem(HR_STORAGE_KEY, JSON.stringify(nextData));
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
  const fallbackTotalUsers = Array.isArray(userRows) ? userRows.length : 0;
  const employeeLimitRaw = Number(source.employee_limit);
  const hasFiniteLimit = Number.isFinite(employeeLimitRaw) && employeeLimitRaw > 0;
  const usedUsersRaw = Number(source.used_users);
  const employeeLimit = hasFiniteLimit ? Math.max(0, employeeLimitRaw) : 0;
  const usedUsers = Number.isFinite(usedUsersRaw)
    ? Math.max(0, usedUsersRaw)
    : (hasFiniteLimit ? Math.min(fallbackTotalUsers, employeeLimit) : fallbackTotalUsers);
  const hasUnlimitedUsers = Boolean(source.has_unlimited_users) && !hasFiniteLimit;
  const remainingUsers = hasUnlimitedUsers ? null : Math.max(0, employeeLimit - usedUsers);
  const addonCountRaw = Number(source.addon_count);
  const addonCount = Number.isFinite(addonCountRaw) ? Math.max(0, addonCountRaw) : 0;
  const baseIncludedUsersRaw = Number(source.base_included_users);
  const extraIncludedUsersRaw = Number(source.extra_included_users);
  const baseIncludedUsers = Number.isFinite(baseIncludedUsersRaw)
    ? Math.max(0, baseIncludedUsersRaw)
    : Math.max(0, employeeLimit - addonCount);
  const extraIncludedUsers = Number.isFinite(extraIncludedUsersRaw)
    ? Math.max(0, extraIncludedUsersRaw)
    : Math.max(0, employeeLimit - baseIncludedUsers);
  const canAddUsers = typeof source.can_add_users === "boolean"
    ? source.can_add_users
    : (hasUnlimitedUsers || usedUsers < employeeLimit);

  return {
    employee_limit: employeeLimit,
    used_users: usedUsers,
    remaining_users: remainingUsers,
    addon_count: addonCount,
    base_included_users: baseIncludedUsers,
    extra_included_users: extraIncludedUsers,
    allow_addons: Boolean(source.allow_addons),
    has_unlimited_users: hasUnlimitedUsers,
    can_add_users: Boolean(canAddUsers),
    has_subscription: Boolean(source.has_subscription),
    limit_message: String(source.limit_message || ""),
  };
}

export default function BusinessAutopilotUsersPage() {
  const navigate = useNavigate();
  const [activeTopTab, setActiveTopTab] = useState(() => {
    if (typeof window === "undefined") {
      return "users";
    }
    const params = new URLSearchParams(String(window.location.search || ""));
    const requestedTab = String(params.get("tab") || params.get("section") || "").trim().toLowerCase();
    return TOP_TAB_KEYS.includes(requestedTab) ? requestedTab : "users";
  });
  const [userSearch, setUserSearch] = useState("");
  const [userListTab, setUserListTab] = useState("all");
  const [userPage, setUserPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [canManageUsers, setCanManageUsers] = useState(false);
  const [users, setUsers] = useState([]);
  const [deletedUsers, setDeletedUsers] = useState([]);
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
  const [restoringMembershipId, setRestoringMembershipId] = useState("");
  const [permanentlyDeletingMembershipId, setPermanentlyDeletingMembershipId] = useState("");
  const [togglingMembershipId, setTogglingMembershipId] = useState("");
  const [verifyingMembershipId, setVerifyingMembershipId] = useState("");
  const [sendingCredentialMembershipId, setSendingCredentialMembershipId] = useState("");
  const [notice, setNotice] = useState("");
  const [roleAccessMap, setRoleAccessMap] = useState({});
  const [enabledModuleSlugs, setEnabledModuleSlugs] = useState([]);
  const [hasResolvedEnabledModules, setHasResolvedEnabledModules] = useState(false);
  const [currentProfileRole, setCurrentProfileRole] = useState("");
  const [currentUserId, setCurrentUserId] = useState("");
  const [currentUserDisplayName, setCurrentUserDisplayName] = useState("");
  const [currentUserEmail, setCurrentUserEmail] = useState("");
  const [currentUserEmployeeRole, setCurrentUserEmployeeRole] = useState("");
  const [currentUserMembershipRole, setCurrentUserMembershipRole] = useState("");
  const [selectedRoleAccessKey, setSelectedRoleAccessKey] = useState(SYSTEM_ROLE_OPTIONS[0].key);
  const [roleAccessSaving, setRoleAccessSaving] = useState(false);
  const [roleAccessDirty, setRoleAccessDirty] = useState(false);
  const [clientSearch, setClientSearch] = useState("");
  const [clientPage, setClientPage] = useState(1);
  const [vendorSearch, setVendorSearch] = useState("");
  const [vendorPage, setVendorPage] = useState(1);
  const [createEmailCheck, setCreateEmailCheck] = useState(defaultEmailCheckState);
  const [hrEmployees, setHrEmployees] = useState(() => readSharedHrEmployees());
  const [crmContacts, setCrmContacts] = useState(() => readSharedCrmContacts());
  const [crmContactToClientDraft, setCrmContactToClientDraft] = useState(() => readCrmContactToClientDraft());
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
  const [clientCompanySearchOpen, setClientCompanySearchOpen] = useState(false);
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
  const emailCheckDebounceRef = useRef(null);
  const emailCheckRequestRef = useRef(0);
  const clientImportInputRef = useRef(null);
  const vendorImportInputRef = useRef(null);
  const userFormRef = useRef(null);
  const createPasswordInputRef = useRef(null);
  const crmContactToClientDraftAppliedRef = useRef(false);
  const pageSize = 5;
  const isEditingUser = Boolean(editForm.membership_id);

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

  function applyUsersResponse(data, options = {}) {
    const nextUsers = Array.isArray(data?.users) ? data.users : [];
    const nextDeletedUsers = Array.isArray(data?.deleted_users) ? data.deleted_users : (options.preserveDeletedUsers ? deletedUsers : []);
    const activeOrgId = String(data?.organization_id || "").trim();
    setUsers(nextUsers);
    setDeletedUsers(nextDeletedUsers);
    setUserMeta(normalizeUserMeta(data?.meta, nextUsers));
    writeBusinessAutopilotUserDirectory(nextUsers);
    setEmployeeRoles(Array.isArray(data?.employee_roles) ? data.employee_roles : []);
    setDepartments(Array.isArray(data?.departments) ? data.departments : []);
    const syncedHrEmployees = syncHrEmployeeDirectoryFromUsers(nextUsers, readSharedHrEmployees());
    setHrEmployees(syncedHrEmployees);
    writeSharedHrEmployees(syncedHrEmployees);
    if (typeof data?.can_manage_users === "boolean") {
      setCanManageUsers(Boolean(data.can_manage_users));
    }
    if (activeOrgId) {
      setActiveBusinessAutopilotOrgId(activeOrgId);
      setSharedCustomers(readSharedAccountsCustomers(buildScopedAccountsStorageKey(activeOrgId)));
      setSharedVendors(readSharedAccountsVendors(buildScopedAccountsStorageKey(activeOrgId)));
    }
  }

  async function loadUsers() {
    setLoading(true);
    setNotice("");
    try {
      const data = await apiFetch("/api/business-autopilot/users");
      applyUsersResponse(data);
    } catch (error) {
      setNotice(error?.message || "Unable to load users.");
      setUsers([]);
      setDeletedUsers([]);
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
      const normalizedRoleMap = normalizeRoleAccessMap(nextMap);
      setRoleAccessMap(normalizedRoleMap);
      setRoleAccessDirty(false);
      window.localStorage.setItem(ROLE_ACCESS_STORAGE_KEY, JSON.stringify(normalizedRoleMap));
    } catch {
      try {
        const raw = window.localStorage.getItem(ROLE_ACCESS_STORAGE_KEY);
        const parsed = raw ? JSON.parse(raw) : {};
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          setRoleAccessMap(normalizeRoleAccessMap(parsed));
        }
      } catch {
        // Ignore invalid local role access cache.
      }
    }
  }

  async function loadEnabledModules() {
    try {
      const data = await apiFetch("/api/business-autopilot/modules");
      setEnabledModuleSlugs(extractEnabledModuleSlugs(data));
      setHasResolvedEnabledModules(true);
    } catch {
      setEnabledModuleSlugs([]);
      setHasResolvedEnabledModules(false);
    }
  }

  async function loadCurrentUserProfile() {
    try {
      const data = await apiFetch("/api/auth/me");
      const userId = String(data?.user?.id || "").trim();
      const firstName = String(data?.user?.first_name || "").trim();
      const lastName = String(data?.user?.last_name || "").trim();
      const displayName = [firstName, lastName].filter(Boolean).join(" ").trim();
      const email = String(data?.user?.email || "").trim();
      const profileRole = String(data?.profile?.role || data?.user?.role || "").trim();
      const hintedEmployeeRole = String(data?.profile?.employee_role || data?.user?.employee_role || "").trim();
      const hintedMembershipRole = String(data?.profile?.membership_role || data?.user?.membership_role || "").trim();
      setCurrentUserId(userId);
      setCurrentUserDisplayName(displayName);
      setCurrentUserEmail(email);
      setCurrentProfileRole(profileRole);
      if (hintedEmployeeRole) {
        setCurrentUserEmployeeRole(hintedEmployeeRole);
      }
      if (hintedMembershipRole) {
        setCurrentUserMembershipRole(hintedMembershipRole);
      }
    } catch {
      setCurrentUserId("");
      setCurrentUserDisplayName("");
      setCurrentUserEmail("");
      setCurrentProfileRole("");
    }
  }

  useEffect(() => {
    if (isEditingUser) {
      return;
    }
    const email = String(form.email || "").trim().toLowerCase();
    if (emailCheckDebounceRef.current) {
      window.clearTimeout(emailCheckDebounceRef.current);
    }
    if (!email) {
      setCreateEmailCheck(defaultEmailCheckState);
      return;
    }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      setCreateEmailCheck({
        ...defaultEmailCheckState,
        checkedEmail: email,
        status: "error",
        message: "Enter a valid email.",
      });
      return;
    }
    setCreateEmailCheck((prev) => ({
      ...prev,
      checking: true,
      checkedEmail: email,
      status: "neutral",
      message: "Checking email availability...",
    }));
    emailCheckDebounceRef.current = window.setTimeout(async () => {
      const requestId = emailCheckRequestRef.current + 1;
      emailCheckRequestRef.current = requestId;
      try {
        const payload = await apiFetch(`/api/business-autopilot/users/check-email?email=${encodeURIComponent(email)}`);
        if (emailCheckRequestRef.current !== requestId) {
          return;
        }
        setCreateEmailCheck({
          checking: false,
          checkedEmail: email,
          exists: !payload?.available,
          message: String(payload?.message || "Email is available."),
          status: payload?.available ? "success" : "warning",
          existingUser: Boolean(payload?.existing_user),
          samePasswordAllowed: Boolean(payload?.same_password_allowed),
          passwordRequired: Boolean(payload?.password_required),
          alreadyBusinessAutopilotUser: Boolean(payload?.already_assigned_to_business_autopilot),
          belongsToAnotherOrganization: Boolean(payload?.belongs_to_another_organization),
          existingProducts: Array.isArray(payload?.existing_products) ? payload.existing_products : [],
        });
        if (payload?.existing_user && payload?.same_password_allowed) {
          setForm((prev) => ({ ...prev, password: "" }));
        }
      } catch (error) {
        if (emailCheckRequestRef.current !== requestId) {
          return;
        }
        const payload = error?.data || {};
        setCreateEmailCheck({
          checking: false,
          checkedEmail: email,
          exists: true,
          message: String(payload?.message || error?.message || "Unable to validate email right now."),
          status: "error",
          existingUser: Boolean(payload?.existing_user),
          samePasswordAllowed: Boolean(payload?.same_password_allowed),
          passwordRequired: !Boolean(payload?.existing_user && payload?.same_password_allowed),
          alreadyBusinessAutopilotUser: Boolean(payload?.already_assigned_to_business_autopilot),
          belongsToAnotherOrganization: Boolean(payload?.belongs_to_another_organization),
          existingProducts: Array.isArray(payload?.existing_products) ? payload.existing_products : [],
        });
        if (payload?.existing_user && payload?.same_password_allowed) {
          setForm((prev) => ({ ...prev, password: "" }));
        }
      }
    }, 350);
    return () => {
      if (emailCheckDebounceRef.current) {
        window.clearTimeout(emailCheckDebounceRef.current);
      }
    };
  }, [form.email, isEditingUser]);

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
    if (!canManageUsersTab) {
      return;
    }
    if (!editForm.membership_id || savingEdit) {
      return;
    }
    if (!String(editForm.phone_number_input || "").trim()) {
      setNotice("Phone number is required.");
      await openAlertDialog("Phone number is required to update this user.", { title: "Update Failed" });
      return;
    }
    setSavingEdit(true);
    setNotice("");
    try {
      const targetMembershipId = String(editForm.membership_id || "");
      const requestedEmail = String(editForm.email || "").trim().toLowerCase();
      const data = await apiFetch(`/api/business-autopilot/users/${editForm.membership_id}`, {
        method: "POST",
        body: JSON.stringify({
          action: "update",
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
      applyUsersResponse(data, { preserveDeletedUsers: true });
      const savedUser = Array.isArray(data?.users)
        ? data.users.find((user) => String(user?.membership_id || "") === targetMembershipId)
        : null;
      const savedEmail = String(savedUser?.email || "").trim().toLowerCase();
      if (savedEmail && requestedEmail && savedEmail !== requestedEmail) {
        const mismatchMessage = `Update response mismatch. Requested email: ${requestedEmail}, but saved email is ${savedEmail}.`;
        setNotice(mismatchMessage);
        await openAlertDialog(mismatchMessage, { title: "Update Check" });
      } else {
        setNotice("User updated successfully.");
        await openAlertDialog(
          `User updated successfully.${savedEmail ? `\nSaved login email: ${savedEmail}` : ""}`,
          { title: "Updated" }
        );
      }
      cancelEdit();
    } catch (error) {
      if (error?.status === 403 && String(error?.data?.detail || "").trim().toLowerCase() === "employee_limit_reached") {
        await showAddonRequiredPopup(error?.data?.message);
      } else {
        const message = error?.message || "Unable to update user.";
        setNotice(message);
        await openAlertDialog(message, { title: "Update Failed" });
      }
    } finally {
      setSavingEdit(false);
    }
  }

  async function handleDeleteUser(membershipId) {
    if (!canManageUsersTab) {
      return;
    }
    if (!membershipId || deletingMembershipId) {
      return;
    }
    const targetUser = users.find((user) => String(user?.membership_id || "") === String(membershipId));
    const confirmed = await openConfirmDialog(
      `Deleting ${String(targetUser?.name || targetUser?.email || "this user")} will remove their Business Autopilot access. Their CRM records will be retained for admin view, but the user account will no longer access the workspace. Do you want to continue?`,
      {
        title: "Delete User",
        confirmText: "Delete",
        cancelText: "Cancel",
      }
    );
    if (!confirmed) {
      return;
    }
    setDeletingMembershipId(String(membershipId));
    setNotice("");
    try {
      const data = await apiFetch(`/api/business-autopilot/users/${membershipId}`, {
        method: "DELETE"
      });
      applyUsersResponse(data);
      if (String(editForm.membership_id) === String(membershipId)) {
        cancelEdit();
      }
      setNotice(String(data?.message || "User deleted successfully."));
    } catch (error) {
      setNotice(error?.message || "Unable to delete user.");
    } finally {
      setDeletingMembershipId("");
    }
  }

  async function handleRestoreUser(membershipId) {
    if (!canManageUsersTab || !membershipId || restoringMembershipId) {
      return;
    }
    setRestoringMembershipId(String(membershipId));
    setNotice("");
    try {
      const data = await apiFetch(`/api/business-autopilot/users/${membershipId}`, {
        method: "POST",
        body: JSON.stringify({ action: "restore" }),
      });
      applyUsersResponse(data);
      setNotice(String(data?.message || "User restored successfully."));
    } catch (error) {
      if (error?.status === 403 && String(error?.data?.detail || "").trim().toLowerCase() === "employee_limit_reached") {
        await showAddonRequiredPopup(error?.data?.message);
      } else {
        setNotice(error?.message || "Unable to restore user.");
      }
    } finally {
      setRestoringMembershipId("");
    }
  }

  async function handlePermanentDeleteUser(membershipId) {
    if (!canManageUsersTab || !membershipId || permanentlyDeletingMembershipId) {
      return;
    }
    const targetUser = deletedUsers.find((user) => String(user?.membership_id || "") === String(membershipId));
    const confirmed = await openConfirmDialog(
      `Permanently deleting ${String(targetUser?.name || targetUser?.email || "this user")} cannot be undone and may cause permanent user data loss. Do you want to continue?`,
      {
        title: "Permanent Delete User",
        confirmText: "Delete",
        cancelText: "Cancel",
      }
    );
    if (!confirmed) {
      return;
    }
    setPermanentlyDeletingMembershipId(String(membershipId));
    setNotice("");
    try {
      const data = await apiFetch(`/api/business-autopilot/users/${membershipId}?permanent=1`, {
        method: "DELETE",
      });
      applyUsersResponse(data);
      setNotice(String(data?.message || "User permanently deleted."));
    } catch (error) {
      setNotice(error?.message || "Unable to permanently delete user.");
    } finally {
      setPermanentlyDeletingMembershipId("");
    }
  }

  async function showAddonRequiredPopup(message) {
    await openAlertDialog(
      String(message || userMeta.limit_message || "User limit reached. Add-on users required to continue."),
      { title: "Add-on Users Required", confirmText: "OK" }
    );
  }

  async function handleToggleUserStatus(user, nextEnabled) {
    if (!canManageUsersTab) {
      return;
    }
    const membershipId = String(user?.membership_id || "").trim();
    if (!membershipId || togglingMembershipId) {
      return;
    }
    if (user?.is_locked) {
      await showAddonRequiredPopup();
      return;
    }
    const confirmMessage = nextEnabled
      ? "Do you want to activate this user?"
      : "Do you want to deactivate this user?";
    const confirmed = await openConfirmDialog(confirmMessage, {
      title: "Confirm User Status",
      confirmText: "Yes",
      cancelText: "No",
    });
    if (!confirmed) {
      return;
    }
    setTogglingMembershipId(membershipId);
    setNotice("");
    try {
      const data = await apiFetch(`/api/business-autopilot/users/${membershipId}/toggle-status`, {
        method: "POST",
        body: JSON.stringify({ enabled: Boolean(nextEnabled) }),
      });
      applyUsersResponse(data, { preserveDeletedUsers: true });
      setNotice(String(data?.message || (nextEnabled ? "User activated." : "User deactivated.")));
    } catch (error) {
      if (error?.status === 403 && String(error?.data?.detail || "").trim().toLowerCase() === "employee_limit_reached") {
        await showAddonRequiredPopup(error?.data?.message);
      } else {
        setNotice(error?.message || "Unable to update user status.");
      }
    } finally {
      setTogglingMembershipId("");
    }
  }

  async function handleResendCredentials(user) {
    if (!canManageUsersTab) {
      return;
    }
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

  async function handleVerifyUserEmail(user) {
    if (!canManageUsersTab) {
      return;
    }
    const membershipId = String(user?.membership_id || "").trim();
    if (!membershipId || verifyingMembershipId) {
      return;
    }
    if (Boolean(user?.email_verified)) {
      setNotice("User email is already verified.");
      return;
    }
    const confirmed = await openConfirmDialog(
      `Verify email for ${String(user?.email || "this user")} now?`,
      { title: "Confirm Email Verification", confirmText: "Verify", cancelText: "Cancel" }
    );
    if (!confirmed) {
      return;
    }
    setVerifyingMembershipId(membershipId);
    setNotice("");
    try {
      const data = await apiFetch(`/api/business-autopilot/users/${membershipId}/verify-email`, {
        method: "POST",
        body: JSON.stringify({}),
      });
      applyUsersResponse(data, { preserveDeletedUsers: true });
      setNotice(String(data?.message || "User email verified successfully."));
    } catch (error) {
      setNotice(error?.message || "Unable to verify user email.");
    } finally {
      setVerifyingMembershipId("");
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
    loadEnabledModules();
    loadCurrentUserProfile();
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
  }, [userSearch, userListTab, users.length, deletedUsers.length]);

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
    if (!canManageUsersTab || saving) {
      return;
    }
    if (!userMeta.can_add_users) {
      await showAddonRequiredPopup();
      return;
    }
    if (!String(form.phone_number_input || "").trim()) {
      setNotice("Phone number is required.");
      return;
    }
    if (createEmailCheck.checking) {
      setNotice("Email availability is still checking. Please wait.");
      return;
    }
    if (createEmailCheck.alreadyBusinessAutopilotUser) {
      setNotice(createEmailCheck.message || "This user is already created in Business Autopilot.");
      return;
    }
    if (createEmailCheck.belongsToAnotherOrganization) {
      setNotice(createEmailCheck.message || "This email is already assigned to another organization.");
      return;
    }
    if (!createEmailCheck.passwordRequired) {
      setForm((prev) => ({ ...prev, password: "" }));
    }
    const basePayload = {
      ...form,
      name: buildDisplayName(form.first_name, form.last_name),
      phone_number: buildCombinedPhoneValue(form.phone_country_code, form.phone_number_input),
      confirm_existing_user: Boolean(createEmailCheck.existingUser && createEmailCheck.samePasswordAllowed),
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
      applyUsersResponse(data, { preserveDeletedUsers: true });
      setForm(defaultForm);
      setCreateEmailCheck(defaultEmailCheckState);
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
      if (error?.status === 403 && String(error?.data?.detail || "").trim().toLowerCase() === "employee_limit_reached") {
        await showAddonRequiredPopup(error?.data?.message);
      } else {
        setNotice(error?.message || "Unable to create user.");
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleCreateEmployeeRole(event) {
    event.preventDefault();
    if (!canManageUsersTab || savingEmployeeRole) {
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
    if (!canManageUsersTab || savingDepartment) {
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
    if (!canManageUsersTab) {
      return;
    }
    const name = editingEmployeeRoleName.trim();
    if (!roleId || !name || savingEmployeeRoleRowId) {
      return;
    }
    setSavingEmployeeRoleRowId(String(roleId));
    setNotice("");
    try {
      const data = await apiFetch(`/api/business-autopilot/employee-roles/${roleId}`, {
        method: "POST",
        body: JSON.stringify({ action: "update", name })
      });
      setEmployeeRoles(data.employee_roles || []);
      if (data.departments) {
        setDepartments(data.departments || []);
      }
      cancelEditEmployeeRole();
      setNotice("Employee role updated.");
      await openAlertDialog("Employee role updated successfully.", { title: "Updated" });
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
    if (!canManageUsersTab) {
      return;
    }
    if (!roleId || deletingEmployeeRoleId) {
      return;
    }
    const matchedRole = employeeRoles.find((item) => String(item.id) === String(roleId));
    const assignedUsers = users.filter((user) => (
      String(user?.employee_role || "").trim().toLowerCase()
      === String(matchedRole?.name || "").trim().toLowerCase()
    ));
    const confirmed = await openConfirmDialog(
      assignedUsers.length
        ? `This employee role is assigned to ${assignedUsers.map((user) => user.name || user.email || "User").join(", ")}. If you delete it, it will be removed from those users as well.`
        : "Delete this employee role?",
      {
        title: "Delete Employee Role",
        confirmText: "Delete",
        cancelText: "Cancel",
      }
    );
    if (!confirmed) {
      return;
    }
    setDeletingEmployeeRoleId(String(roleId));
    setNotice("");
    try {
      const data = await apiFetch(`/api/business-autopilot/employee-roles/${roleId}`, {
        method: "POST",
        body: JSON.stringify({ action: "delete" })
      });
      setEmployeeRoles(data.employee_roles || []);
      if (data.departments) {
        setDepartments(data.departments || []);
      }
      if (data.users || data.deleted_users) {
        applyUsersResponse(data, { preserveDeletedUsers: !Array.isArray(data?.deleted_users) });
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
    if (!canManageUsersTab) {
      return;
    }
    const name = editingDepartmentName.trim();
    if (!departmentId || !name || savingDepartmentRowId) {
      return;
    }
    setSavingDepartmentRowId(String(departmentId));
    setNotice("");
    try {
      const data = await apiFetch(`/api/business-autopilot/departments/${departmentId}`, {
        method: "POST",
        body: JSON.stringify({ action: "update", name })
      });
      setDepartments(data.departments || []);
      if (data.employee_roles) {
        setEmployeeRoles(data.employee_roles || []);
      }
      if (data.users || data.deleted_users) {
        applyUsersResponse(data, { preserveDeletedUsers: !Array.isArray(data?.deleted_users) });
      }
      cancelEditDepartment();
      setNotice("Department updated.");
      await openAlertDialog("Department updated successfully.", { title: "Updated" });
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
    if (!canManageUsersTab) {
      return;
    }
    if (!departmentId || deletingDepartmentId) {
      return;
    }
    const matchedDepartment = departments.find((item) => String(item.id) === String(departmentId));
    const assignedUsers = users.filter((user) => (
      String(user?.department || "").trim().toLowerCase()
      === String(matchedDepartment?.name || "").trim().toLowerCase()
    ));
    const confirmed = await openConfirmDialog(
      assignedUsers.length
        ? `This department is assigned to ${assignedUsers.map((user) => user.name || user.email || "User").join(", ")}. If you delete it, it will be removed from those users as well.`
        : "Delete this department?",
      {
        title: "Delete Department",
        confirmText: "Delete",
        cancelText: "Cancel",
      }
    );
    if (!confirmed) {
      return;
    }
    setDeletingDepartmentId(String(departmentId));
    setNotice("");
    try {
      const data = await apiFetch(`/api/business-autopilot/departments/${departmentId}`, {
        method: "POST",
        body: JSON.stringify({ action: "delete" })
      });
      setDepartments(data.departments || []);
      if (data.employee_roles) {
        setEmployeeRoles(data.employee_roles || []);
      }
      if (data.users || data.deleted_users) {
        applyUsersResponse(data, { preserveDeletedUsers: !Array.isArray(data?.deleted_users) });
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
  const filteredDeletedUsers = useMemo(() => {
    const q = userSearch.trim().toLowerCase();
    if (!q) {
      return deletedUsers;
    }
    return deletedUsers.filter((user) =>
      [
        user.name,
        user.first_name,
        user.last_name,
        user.email,
        user.department,
        user.role,
        user.employee_role,
        "deleted",
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(q)
    );
  }, [deletedUsers, userSearch]);
  const pendingEmailVerificationUsers = useMemo(
    () => users.filter((user) => !Boolean(user?.email_verified)),
    [users]
  );
  const filteredPendingEmailVerificationUsers = useMemo(() => {
    const q = userSearch.trim().toLowerCase();
    if (!q) {
      return pendingEmailVerificationUsers;
    }
    return pendingEmailVerificationUsers.filter((user) =>
      [
        user.name,
        user.first_name,
        user.last_name,
        user.email,
        user.department,
        user.employee_role,
        "pending",
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(q)
    );
  }, [pendingEmailVerificationUsers, userSearch]);

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

  const currentUserListRows = userListTab === "deleted" ? filteredDeletedUsers : filteredUsers;
  const totalUserPages = Math.max(1, Math.ceil(currentUserListRows.length / pageSize));
  const normalizedUserPage = Math.min(userPage, totalUserPages);
  const paginatedUsers = currentUserListRows.slice((normalizedUserPage - 1) * pageSize, normalizedUserPage * pageSize);
  const userStartIndex = currentUserListRows.length ? (normalizedUserPage - 1) * pageSize + 1 : 0;
  const userEndIndex = Math.min(normalizedUserPage * pageSize, currentUserListRows.length);
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
  const visibleRoleAccessSections = useMemo(() => {
    if (!hasResolvedEnabledModules) {
      return ROLE_ACCESS_SECTIONS.filter((section) => section.key !== "users");
    }
    const enabledSet = new Set(enabledModuleSlugs.map((slug) => String(slug || "").trim().toLowerCase()));
    return ROLE_ACCESS_SECTIONS.filter((section) => {
      if (section.key === "users") {
        return false;
      }
      const moduleSlug = ROLE_ACCESS_SECTION_MODULE_SLUG[section.key];
      if (!moduleSlug) {
        return true;
      }
      return enabledSet.has(moduleSlug);
    });
  }, [enabledModuleSlugs, hasResolvedEnabledModules]);
  const createUserFormDisabled = !isEditingUser && !userMeta.can_add_users;
  const shouldDisableCreatePassword = !isEditingUser && createEmailCheck.existingUser && createEmailCheck.samePasswordAllowed;
  const createEmailStatusClass = createEmailCheck.status === "error"
    ? "text-danger"
    : createEmailCheck.status === "success"
      ? "text-success"
      : createEmailCheck.status === "warning"
        ? "text-warning"
        : "text-secondary";
  const availableUsersLabel = userMeta.has_unlimited_users
    ? "Unlimited"
    : `${Math.max(0, Number(userMeta.employee_limit) || 0)} (Base ${Math.max(0, Number(userMeta.base_included_users) || 0)} + Extra ${Math.max(0, Number(userMeta.extra_included_users) || 0)})`;
  const usedUsersLabel = String(userMeta.used_users || 0);
  const createPasswordStrength = useMemo(() => {
    const score = evaluatePasswordStrength(form.password);
    return {
      score,
      ...getPasswordStrengthMeta(score),
    };
  }, [form.password]);

  useEffect(() => {
    if (!createUserFormDisabled || isEditingUser) {
      return;
    }
    setForm((prev) => {
      const hasValues = [
        prev.first_name,
        prev.last_name,
        prev.email,
        prev.password,
        prev.phone_number_input,
        prev.department_id,
        prev.employee_role_id,
      ].some((value) => String(value || "").trim());
      if (!hasValues) {
        return prev;
      }
      return defaultForm;
    });
  }, [createUserFormDisabled, isEditingUser]);

  useEffect(() => {
    const input = createPasswordInputRef.current;
    if (!input) {
      return;
    }
    if (isEditingUser || shouldDisableCreatePassword || !String(form.password || "").trim()) {
      input.setCustomValidity("");
      return;
    }
    if (createPasswordStrength.score < 4) {
      input.setCustomValidity("Use a strong password to continue.");
      return;
    }
    input.setCustomValidity("");
  }, [createPasswordStrength.score, form.password, isEditingUser, shouldDisableCreatePassword]);

  useEffect(() => {
    const refreshCrmContacts = () => setCrmContacts(readSharedCrmContacts());
    window.addEventListener("storage", refreshCrmContacts);
    window.addEventListener("focus", refreshCrmContacts);
    return () => {
      window.removeEventListener("storage", refreshCrmContacts);
      window.removeEventListener("focus", refreshCrmContacts);
    };
  }, []);

  useEffect(() => {
    if (activeTopTab === "clients") {
      setCrmContacts(readSharedCrmContacts());
    }
  }, [activeTopTab]);

  useEffect(() => {
    if (roleAccessRoleOptions.some((item) => item.key === selectedRoleAccessKey)) {
      return;
    }
    setSelectedRoleAccessKey(roleAccessRoleOptions[0]?.key || SYSTEM_ROLE_OPTIONS[0].key);
  }, [roleAccessRoleOptions, selectedRoleAccessKey]);

  useEffect(() => {
    const normalizedCurrentEmail = String(currentUserEmail || "").trim().toLowerCase();
    const normalizedCurrentId = String(currentUserId || "").trim();
    const normalizedCurrentName = String(currentUserDisplayName || "").trim().toLowerCase();
    const normalizedProfileRole = normalizeRoleToken(currentProfileRole);

    const matchedUser = (users || []).find((user) => {
      const userId = String(user?.id || "").trim();
      const userEmail = String(user?.email || "").trim().toLowerCase();
      const userName = String(user?.name || "").trim().toLowerCase();
      if (normalizedCurrentId && userId && userId === normalizedCurrentId) {
        return true;
      }
      if (normalizedCurrentEmail && userEmail && userEmail === normalizedCurrentEmail) {
        return true;
      }
      if (normalizedCurrentName && userName && userName === normalizedCurrentName) {
        return true;
      }
      return false;
    });

    const roleCandidates = Array.from(
      new Set(
        (users || [])
          .map((row) => String(row?.employee_role || "").trim())
          .filter(Boolean)
      )
    );
    const inferredOrgRole =
      !matchedUser
      && roleCandidates.length === 1
      && normalizedProfileRole === "org_user"
        ? roleCandidates[0]
        : "";
    const fallbackEmployeeRole = readBusinessAutopilotUserDirectoryRole(currentUserEmail) || inferredOrgRole;
    setCurrentUserEmployeeRole(
      String(matchedUser?.employee_role || fallbackEmployeeRole || "").trim()
    );
    setCurrentUserMembershipRole(String(matchedUser?.role || "").trim());
  }, [currentProfileRole, currentUserDisplayName, currentUserEmail, currentUserId, users]);

  const selectedRoleAccess = roleAccessMap[selectedRoleAccessKey] || createDefaultRoleAccessRecord();
  const normalizedCurrentProfileRole = normalizeRoleToken(currentProfileRole);
  const normalizedCurrentMembershipRole = normalizeRoleToken(currentUserMembershipRole);
  const hasResolvedMembershipRole = Boolean(normalizedCurrentMembershipRole);
  const isOrgAdminUser = canManageUsers
    || normalizedCurrentMembershipRole === "company_admin"
    || (!hasResolvedMembershipRole && ["company_admin", "org_admin", "superadmin", "super_admin"].includes(normalizedCurrentProfileRole));
  const usersRoleAccessRecord = useMemo(
    () => resolveRoleAccessRecord(roleAccessMap, currentProfileRole, currentUserEmployeeRole),
    [roleAccessMap, currentProfileRole, currentUserEmployeeRole]
  );
  const usersSectionAccessLevel = isOrgAdminUser
    ? "Full Access"
    : normalizeRoleAccessLevel(usersRoleAccessRecord?.sections?.users || "No Access");
  const usersSubSections = normalizeUserSubSections(
    usersRoleAccessRecord?.user_sub_sections,
    usersSectionAccessLevel
  );
  const employeeAccessLevel = isOrgAdminUser
    ? "Full Access"
    : normalizeRoleAccessLevel(
      usersSubSections.employee?.enabled
        ? usersSubSections.employee?.access_level
        : usersSectionAccessLevel
    );
  const clientsAccessLevel = isOrgAdminUser
    ? "Full Access"
    : normalizeRoleAccessLevel(
      usersSubSections.clients?.enabled
        ? usersSubSections.clients?.access_level
        : usersSectionAccessLevel
    );
  const vendorsAccessLevel = isOrgAdminUser
    ? "Full Access"
    : normalizeRoleAccessLevel(
      usersSubSections.vendors?.enabled
        ? usersSubSections.vendors?.access_level
        : usersSectionAccessLevel
    );
  const canViewUsersSection = isOrgAdminUser
    || usersSectionAccessLevel !== "No Access"
    || employeeAccessLevel !== "No Access"
    || clientsAccessLevel !== "No Access"
    || vendorsAccessLevel !== "No Access";
  const canManageUsersTab = isOrgAdminUser;
  const canManageRoleAccessTab = isOrgAdminUser;
  const canViewEmployeeTab = isOrgAdminUser || employeeAccessLevel !== "No Access";
  const canManageEmployeeTab = isOrgAdminUser || employeeAccessLevel === "View and Edit" || employeeAccessLevel === "Create, View and Edit" || employeeAccessLevel === "Full Access";
  const canViewClientsTab = isOrgAdminUser || clientsAccessLevel !== "No Access";
  const canEditClientsTab = isOrgAdminUser || clientsAccessLevel === "View and Edit" || clientsAccessLevel === "Create, View and Edit" || clientsAccessLevel === "Full Access";
  const canCreateClientsTab = isOrgAdminUser || clientsAccessLevel === "Create, View and Edit" || clientsAccessLevel === "Full Access";
  const canDeleteClientsTab = isOrgAdminUser || clientsAccessLevel === "Full Access";
  const canViewVendorsTab = isOrgAdminUser || vendorsAccessLevel !== "No Access";
  const canEditVendorsTab = isOrgAdminUser || vendorsAccessLevel === "View and Edit" || vendorsAccessLevel === "Create, View and Edit" || vendorsAccessLevel === "Full Access";
  const canCreateVendorsTab = isOrgAdminUser || vendorsAccessLevel === "Create, View and Edit" || vendorsAccessLevel === "Full Access";
  const canDeleteVendorsTab = isOrgAdminUser || vendorsAccessLevel === "Full Access";

  const allowedTopTabs = useMemo(() => {
    const nextTabs = [];
    if (canManageUsersTab) {
      nextTabs.push("users");
      nextTabs.push("role-access");
    }
    if (canViewEmployeeTab) {
      nextTabs.push("create-employee");
    }
    if (canViewClientsTab) {
      nextTabs.push("clients");
    }
    if (canViewVendorsTab) {
      nextTabs.push("vendors");
    }
    return nextTabs;
  }, [canManageUsersTab, canViewClientsTab, canViewEmployeeTab, canViewVendorsTab]);

  function activateTopTab(nextTab, options = {}) {
    const normalizedTab = String(nextTab || "").trim().toLowerCase();
    if (!TOP_TAB_KEYS.includes(normalizedTab)) {
      return;
    }
    setActiveTopTab(normalizedTab);
    if (typeof window === "undefined") {
      return;
    }
    const currentUrl = new URL(window.location.href);
    const params = currentUrl.searchParams;
    params.set("tab", normalizedTab);
    if (!options.preserveSource) {
      params.delete("source");
    }
    const nextSearch = params.toString();
    const nextUrl = `${currentUrl.pathname}${nextSearch ? `?${nextSearch}` : ""}${currentUrl.hash || ""}`;
    const currentFullPath = `${currentUrl.pathname}${currentUrl.search || ""}${currentUrl.hash || ""}`;
    if (nextUrl !== currentFullPath) {
      window.history.replaceState(window.history.state, "", nextUrl);
    }
  }

  useEffect(() => {
    if (!allowedTopTabs.length) {
      return;
    }
    if (!allowedTopTabs.includes(activeTopTab)) {
      activateTopTab(allowedTopTabs[0]);
    }
  }, [activeTopTab, allowedTopTabs]);

  useEffect(() => {
    if (!crmContactToClientDraft) {
      crmContactToClientDraftAppliedRef.current = false;
      return;
    }
    if (!canViewClientsTab || crmContactToClientDraftAppliedRef.current) {
      return;
    }
    const normalizedContact = normalizeCrmContactRecord(crmContactToClientDraft);
    const hasContactData = [
      normalizedContact.company,
      normalizedContact.name,
      normalizedContact.email,
      normalizedContact.phone,
    ].some((value) => String(value || "").trim());
    if (!hasContactData) {
      clearCrmContactToClientDraft(crmContactToClientDraft.orgId);
      setCrmContactToClientDraft(null);
      crmContactToClientDraftAppliedRef.current = false;
      return;
    }
    crmContactToClientDraftAppliedRef.current = true;
    const companyName = normalizedContact.company || normalizedContact.name || "";
    activateTopTab("clients", { preserveSource: true });
    setEditingClientId("");
    setClientForm({
      ...createEmptySharedPartyForm(),
      companyName,
      name: companyName,
      clientName: normalizedContact.name || "",
      phoneCountryCode: normalizedContact.phoneCountryCode || "+91",
      phone: normalizedContact.phone || "",
      email: normalizedContact.email || "",
    });
    setClientCompanySearchOpen(false);
    setNotice("CRM contact loaded in client form. Complete remaining fields and create client.");
  }, [canViewClientsTab, crmContactToClientDraft]);

  useEffect(() => {
    setNotice("");
  }, [activeTopTab, userListTab]);
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
  const crmClientMatches = useMemo(() => {
    const q = String(clientForm.companyName || "").trim().toLowerCase();
    return crmContacts
      .filter((row) => {
        if (!q) {
          return true;
        }
        const haystack = [
          row.company,
          row.name,
          row.email,
          row.phone,
        ].filter(Boolean).join(" ").toLowerCase();
        return haystack.includes(q);
      })
      .slice(0, 8);
  }, [clientForm.companyName, crmContacts]);
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
    if (!canManageRoleAccessTab) {
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
    if (!canManageRoleAccessTab || roleAccessSaving) {
      return;
    }
    setRoleAccessSaving(true);
    setNotice("");
    try {
      const encodedRoleAccess = encodeRoleAccessBlob(roleAccessMap);
      const data = await apiFetch("/api/business-autopilot/role-access", {
        method: "POST",
        body: JSON.stringify(encodedRoleAccess ? { role_access_blob: encodedRoleAccess } : { role_access_map: roleAccessMap }),
      });
      const nextMap = (data?.role_access_map && typeof data.role_access_map === "object" && !Array.isArray(data.role_access_map))
        ? data.role_access_map
        : {};
      const normalizedRoleMap = normalizeRoleAccessMap(nextMap);
      setRoleAccessMap(normalizedRoleMap);
      setRoleAccessDirty(false);
      window.localStorage.setItem(ROLE_ACCESS_STORAGE_KEY, JSON.stringify(normalizedRoleMap));
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
    setClientCompanySearchOpen(false);
  }

  function resetVendorForm() {
    setEditingVendorId("");
    setVendorForm(createEmptySharedPartyForm());
  }

  function clearActiveCrmContactToClientDraft() {
    if (!crmContactToClientDraft) {
      return;
    }
    clearCrmContactToClientDraft(crmContactToClientDraft.orgId);
    setCrmContactToClientDraft(null);
    crmContactToClientDraftAppliedRef.current = false;
  }

  async function removeConvertedCrmContact(sourceDraft = null) {
    const normalizedSource = normalizeCrmContactConversionDraft(sourceDraft || {});
    if (!normalizedSource) {
      return { localRemoved: false, serverRemoved: false };
    }
    const sourceContactId = String(normalizedSource.sourceContactId || normalizedSource.id || "").trim();
    const sourceCompany = String(normalizedSource.company || "").trim().toLowerCase();
    const sourceName = String(normalizedSource.name || "").trim().toLowerCase();
    const sourceEmail = String(normalizedSource.email || "").trim().toLowerCase();
    const sourcePhoneCode = String(normalizedSource.phoneCountryCode || "+91").trim() || "+91";
    const sourcePhone = String(normalizedSource.phone || "").trim();
    const matchesSourceContact = (row) => {
      const normalizedRow = normalizeCrmContactRecord(row);
      const rowId = String(normalizedRow.id || "").trim();
      if (sourceContactId && rowId && rowId === sourceContactId) {
        return true;
      }
      const rowCompany = String(normalizedRow.company || "").trim().toLowerCase();
      const rowName = String(normalizedRow.name || "").trim().toLowerCase();
      const rowEmail = String(normalizedRow.email || "").trim().toLowerCase();
      const rowPhoneCode = String(normalizedRow.phoneCountryCode || "+91").trim() || "+91";
      const rowPhone = String(normalizedRow.phone || "").trim();
      if (sourceEmail && rowEmail && rowEmail === sourceEmail) {
        return true;
      }
      if (sourcePhone && rowPhone && sourcePhone === rowPhone && sourcePhoneCode === rowPhoneCode) {
        return true;
      }
      if (sourceCompany && sourceName && rowCompany === sourceCompany && rowName === sourceName) {
        return true;
      }
      return false;
    };

    let localRemoved = false;
    const removeFromStorageKey = (storageKey, contactsOnly = false) => {
      const normalizedKey = String(storageKey || "").trim();
      if (!normalizedKey) {
        return;
      }
      const raw = window.localStorage.getItem(normalizedKey);
      if (!raw) {
        return;
      }
      try {
        const parsed = JSON.parse(raw);
        if (contactsOnly || Array.isArray(parsed)) {
          const rows = Array.isArray(parsed) ? parsed.map((row) => normalizeCrmContactRecord(row)) : [];
          const filteredRows = rows.filter((row) => !matchesSourceContact(row));
          if (filteredRows.length !== rows.length) {
            localRemoved = true;
            window.localStorage.setItem(normalizedKey, JSON.stringify(filteredRows));
          }
          return;
        }
        if (parsed && typeof parsed === "object" && Array.isArray(parsed.contacts)) {
          const rows = parsed.contacts.map((row) => normalizeCrmContactRecord(row));
          const filteredRows = rows.filter((row) => !matchesSourceContact(row));
          if (filteredRows.length !== rows.length) {
            localRemoved = true;
            window.localStorage.setItem(normalizedKey, JSON.stringify({
              ...parsed,
              contacts: filteredRows,
            }));
          }
        }
      } catch {
        // Ignore malformed CRM cache entries.
      }
    };

    const orgIdForDraft = sanitizeScopedStorageKeyPart(
      normalizedSource.orgId || getActiveBusinessAutopilotOrgId() || getActiveCrmScopeOrgId()
    );
    const scopedCrmContactsKey = orgIdForDraft ? `${CRM_SHARED_CONTACTS_KEY_PREFIX}__${orgIdForDraft}` : "";
    const activeCrmStorageKey = String(window.localStorage.getItem(CRM_STORAGE_KEY_ACTIVE) || "").trim();
    const activeScopedCrmStorageKey = activeCrmStorageKey.startsWith(`${CRM_STORAGE_KEY_PREFIX}__`) ? activeCrmStorageKey : "";
    [scopedCrmContactsKey, CRM_SHARED_CONTACTS_GLOBAL_KEY].forEach((key) => removeFromStorageKey(key, true));
    [activeScopedCrmStorageKey, CRM_STORAGE_KEY].forEach((key) => removeFromStorageKey(key, false));

    let serverRemoved = false;
    if (/^\d+$/.test(sourceContactId)) {
      try {
        await apiFetch(`/api/business-autopilot/contacts/${encodeURIComponent(sourceContactId)}`, {
          method: "DELETE",
        });
        serverRemoved = true;
      } catch {
        // Keep client creation success even if contact API delete fails.
      }
    }

    if (localRemoved || serverRemoved) {
      window.dispatchEvent(new Event("storage"));
    }
    setCrmContacts(readSharedCrmContacts());
    return { localRemoved, serverRemoved };
  }

  async function saveClient(event) {
    event.preventDefault();
    if (editingClientId ? !canEditClientsTab : !canCreateClientsTab) {
      return;
    }
    const companyName = String(clientForm.companyName || "").trim();
    const clientName = String(clientForm.clientName || "").trim();
    if (!clientName) {
      setNotice("Client name is required.");
      return;
    }
    const primaryPhone = String(clientForm.phone || "").trim();
    if (!primaryPhone) {
      setNotice("Phone number is required.");
      return;
    }
    const primaryEmail = String(clientForm.email || "").trim();
    if (!primaryEmail) {
      setNotice("Email ID is required.");
      return;
    }
    const additionalPhones = (clientForm.additionalPhones || [])
      .map((row) => ({ countryCode: String(row.countryCode || "+91").trim() || "+91", number: String(row.number || "").trim() }))
      .filter((row) => row.number);
    const additionalEmails = (clientForm.additionalEmails || [])
      .map((value) => String(value || "").trim())
      .filter(Boolean);
    const billingAddress = String(clientForm.billingAddress || "").trim();
    if (!billingAddress) {
      setNotice("Billing address is required.");
      return;
    }
    const billingCountry = String(clientForm.billingCountry || "").trim() || "India";
    if (!billingCountry) {
      setNotice("Billing country is required.");
      return;
    }
    const billingState = String(clientForm.billingState || "").trim();
    if (!billingState) {
      setNotice("Billing state is required.");
      return;
    }
    const billingPincode = String(clientForm.billingPincode || "").trim();
    if (!billingPincode) {
      setNotice("Billing pincode is required.");
      return;
    }
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
    const missingClientFields = [];
    if (!companyName) missingClientFields.push("Company Name");
    if (!clientName) missingClientFields.push("Client Name");
    if (!primaryPhone) missingClientFields.push("Phone Number");
    if (!primaryEmail) missingClientFields.push("Email ID");
    if (!billingAddress) missingClientFields.push("Billing Address");
    if (!billingCountry) missingClientFields.push("Billing Country");
    if (!billingState) missingClientFields.push("Billing State");
    if (!billingPincode) missingClientFields.push("Billing Pincode");
    if (!shippingAddress) missingClientFields.push("Shipping Address");
    if (!shippingCountry) missingClientFields.push("Shipping Country");
    if (!shippingState) missingClientFields.push("Shipping State");
    if (!shippingPincode) missingClientFields.push("Shipping Pincode");
    if (missingClientFields.length) {
      const message = `${missingClientFields.join(", ")} ${missingClientFields.length === 1 ? "is" : "are"} required. GSTIN is optional.`;
      setNotice(message);
      await openAlertDialog(message, { title: "Required Fields Missing" });
      return;
    }
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
      billingAddress,
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
    const conversionDraftForThisSave = editingClientId ? null : crmContactToClientDraft;
    setSharedCustomers(nextCustomers);
    await persistSharedAccountsCustomers(nextCustomers);
    let successMessage = editingClientId ? "Client updated successfully." : "Client created successfully.";
    if (conversionDraftForThisSave) {
      const conversionResult = await removeConvertedCrmContact(conversionDraftForThisSave);
      clearActiveCrmContactToClientDraft();
      if (conversionResult.localRemoved || conversionResult.serverRemoved) {
        successMessage = "Client created successfully and contact converted from CRM.";
      }
    }
    const pendingSalesOrderDraft = conversionDraftForThisSave
      ? readPendingCrmSalesOrderDraft(conversionDraftForThisSave.orgId)
      : null;
    setNotice("");
    resetClientForm();
    await openAlertDialog(successMessage, {
      title: editingClientId ? "Client Updated" : "Client Created",
      confirmText: "OK",
    });
    if (pendingSalesOrderDraft?.sourceDeal?.id) {
      clearPendingCrmSalesOrderDraft(conversionDraftForThisSave?.orgId);
      navigate("../crm?tab=sales-orders&resume-sales-order=1", { relative: "path" });
    }
  }

  function editClient(row) {
    clearActiveCrmContactToClientDraft();
    const normalized = normalizeSharedCustomerRecord(row);
    setEditingClientId(normalized.id);
    setClientForm({
      ...normalized,
      additionalPhones: Array.isArray(normalized.additionalPhones) ? normalized.additionalPhones : [],
      additionalEmails: Array.isArray(normalized.additionalEmails) ? normalized.additionalEmails : [],
    });
    setClientCompanySearchOpen(false);
    activateTopTab("clients");
  }

  function selectCrmContactForClient(row) {
    const normalized = normalizeCrmContactRecord(row);
    setClientForm((prev) => {
      const companyName = normalized.company || normalized.name || prev.companyName || "";
      return {
        ...prev,
        companyName,
        name: companyName,
        clientName: normalized.name || prev.clientName || "",
        phoneCountryCode: normalized.phoneCountryCode || prev.phoneCountryCode || "+91",
        phone: normalized.phone || prev.phone || "",
        email: normalized.email || prev.email || "",
      };
    });
    setClientCompanySearchOpen(false);
  }

  async function deleteClient(clientId) {
    if (!canDeleteClientsTab) {
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
    if (!file || !canCreateClientsTab) {
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
    if (editingVendorId ? !canEditVendorsTab : !canCreateVendorsTab) {
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
    const accountsStorageKey = buildScopedAccountsStorageKey(getActiveBusinessAutopilotOrgId());
    const currentData = readSharedAccountsData(accountsStorageKey);
    const nextData = {
      ...currentData,
      vendors: nextVendors.map((row) => normalizeSharedCustomerRecord(row)),
    };
    setSharedVendors(nextVendors);
    window.localStorage.setItem(accountsStorageKey, JSON.stringify(nextData));
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
    activateTopTab("vendors");
  }

  async function deleteVendor(vendorId) {
    if (!canDeleteVendorsTab) {
      return;
    }
    const nextVendors = sharedVendors.filter((row) => String(row.id) !== String(vendorId));
    const accountsStorageKey = buildScopedAccountsStorageKey(getActiveBusinessAutopilotOrgId());
    const currentData = readSharedAccountsData(accountsStorageKey);
    const nextData = {
      ...currentData,
      vendors: nextVendors.map((row) => normalizeSharedCustomerRecord(row)),
    };
    setSharedVendors(nextVendors);
    window.localStorage.setItem(accountsStorageKey, JSON.stringify(nextData));
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
    if (!file || !canCreateVendorsTab) {
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
      const accountsStorageKey = buildScopedAccountsStorageKey(getActiveBusinessAutopilotOrgId());
      const currentData = readSharedAccountsData(accountsStorageKey);
      const nextData = {
        ...currentData,
        vendors: nextVendors.map((row) => normalizeSharedCustomerRecord(row)),
      };
      setSharedVendors(nextVendors);
      window.localStorage.setItem(accountsStorageKey, JSON.stringify(nextData));
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
          {canManageUsersTab ? (
            <button
              type="button"
              className={`btn btn-sm ${activeTopTab === "users" ? "btn-success" : "btn-outline-light"}`}
              onClick={() => activateTopTab("users")}
            >
              Users
            </button>
          ) : null}
          {canViewEmployeeTab ? (
            <button
              type="button"
              className={`btn btn-sm ${activeTopTab === "create-employee" ? "btn-success" : "btn-outline-light"}`}
              onClick={() => activateTopTab("create-employee")}
            >
              Employee
            </button>
          ) : null}
          {canManageRoleAccessTab ? (
            <button
              type="button"
              className={`btn btn-sm ${activeTopTab === "role-access" ? "btn-success" : "btn-outline-light"}`}
              onClick={() => activateTopTab("role-access")}
            >
              Role Based Access
            </button>
          ) : null}
          {canViewClientsTab ? (
            <button
              type="button"
              className={`btn btn-sm ${activeTopTab === "clients" ? "btn-success" : "btn-outline-light"}`}
              onClick={() => activateTopTab("clients")}
            >
              Clients
            </button>
          ) : null}
          {canViewVendorsTab ? (
            <button
              type="button"
              className={`btn btn-sm ${activeTopTab === "vendors" ? "btn-success" : "btn-outline-light"}`}
              onClick={() => activateTopTab("vendors")}
            >
              Vendor Registration
            </button>
          ) : null}
        </div>
      </div>

      {notice ? <div className="alert alert-info py-2 mb-0">{notice}</div> : null}

      {!canViewUsersSection && !canViewEmployeeTab && !canViewClientsTab && !canViewVendorsTab ? (
        <div className="card p-3">
          <div className="text-secondary">You do not have access to this section.</div>
        </div>
      ) : activeTopTab === "create-employee" ? (
        <Suspense
          fallback={(
            <div className="card p-3">
              <div className="text-secondary">Loading HR module...</div>
            </div>
          )}
        >
          <HrManagementModule embeddedEmployeeOnly />
        </Suspense>
      ) : activeTopTab === "users" ? (
        <>
          {canManageUsersTab ? (
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
                                  <button type="button" className="btn btn-sm btn-outline-danger" data-no-delete-confirm="true" disabled={deletingDepartmentId === String(item.id)} onClick={() => handleDeleteDepartment(item.id)}>
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
                                  <button type="button" className="btn btn-sm btn-outline-danger" data-no-delete-confirm="true" disabled={deletingEmployeeRoleId === String(item.id)} onClick={() => handleDeleteEmployeeRole(item.id)}>
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
                <h6 className="mb-3">
                  {createUserFormDisabled
                    ? "Create User (Need to Buy Addon Users)"
                    : "Create User"}
                </h6>
                <form ref={userFormRef} className="d-flex flex-column gap-3 wz-users-create-form" onSubmit={isEditingUser ? handleUpdateUser : handleCreate}>
                  <fieldset disabled={createUserFormDisabled} className="m-0 p-0 border-0 d-flex flex-column gap-3 wz-users-create-fieldset">
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
                        data-skip-email-validation="true"
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
                      {!isEditingUser && createEmailCheck.message ? (
                        <small className={`d-block mt-2 ${createEmailStatusClass}`}>
                          {createEmailCheck.message}
                          {createEmailCheck.existingProducts?.length ? ` Existing products: ${formatExistingProductList(createEmailCheck.existingProducts)}.` : ""}
                        </small>
                      ) : null}
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
                          disabled={createUserFormDisabled}
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
                        placeholder={shouldDisableCreatePassword ? "Existing password will continue" : "Password"}
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
                        required={!isEditingUser && !shouldDisableCreatePassword}
                        disabled={!isEditingUser && shouldDisableCreatePassword}
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
                            {shouldDisableCreatePassword
                              ? "This user already exists in another product. Their existing password will continue to work."
                              : `Password strength: ${createPasswordStrength.label}`}
                          </small>
                        </div>
                      ) : null}
                    </div>
                    <div className="col-12 col-md-6 col-xl-4">
                      <div className="d-grid d-xl-flex gap-2 wz-form-actions">
                        <button
                          type="submit"
                          className="btn btn-primary flex-fill"
                          disabled={
                            createUserFormDisabled
                            || (isEditingUser ? savingEdit : saving)
                            || (!isEditingUser && createEmailCheck.checking)
                            || (!isEditingUser && createEmailCheck.alreadyBusinessAutopilotUser)
                            || (!isEditingUser && createEmailCheck.belongsToAnotherOrganization)
                          }
                          title={isEditingUser ? "Update User" : "Create User"}
                        >
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
                  </fieldset>
                </form>
              </div>
            </>
          ) : (
            <div className="card p-3">
              <div className="text-secondary">Only company admin can create users.</div>
            </div>
          )}

          <div className="wz-users-list-section">
            <div className="d-flex flex-wrap align-items-center gap-2 mb-2 wz-users-tabs-row">
              <button
                type="button"
                className={`btn btn-sm ${userListTab === "all" ? "btn-primary" : "btn-outline-light"}`}
                onClick={() => setUserListTab("all")}
              >
                All Users
              </button>
              <button
                type="button"
                className={`btn btn-sm ${userListTab === "email_verification" ? "btn-primary" : "btn-outline-light"}`}
                onClick={() => setUserListTab("email_verification")}
              >
                Email Verification
              </button>
              {canManageUsersTab ? (
                <button
                  type="button"
                  className={`btn btn-sm ${userListTab === "deleted" ? "btn-danger" : "btn-outline-danger"}`}
                  onClick={() => setUserListTab("deleted")}
                >
                  Deleted Items ({filteredDeletedUsers.length})
                </button>
              ) : null}
            </div>
            {userListTab === "all" ? (
            <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-2">
              <div className="d-flex flex-wrap align-items-center gap-2">
                <h6 className="mb-0">User List (Available User Limit {availableUsersLabel} - Used {usedUsersLabel})</h6>
              </div>
              <div className="d-flex flex-wrap align-items-center justify-content-end gap-2">
                <button
                  type="button"
                  className="btn btn-sm btn-primary"
                  onClick={() => {
                    window.location.href = "/app/business-autopilot/billing";
                  }}
                >
                  Increase User Limit
                </button>
                <div className="table-search">
                  <i className="bi bi-search" aria-hidden="true" />
                  <input type="search" className="form-control form-control-sm" placeholder="Search users" value={userSearch} onChange={(event) => setUserSearch(event.target.value)} />
                </div>
              </div>
            </div>
            ) : userListTab === "deleted" ? (
              <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-2">
                <h6 className="mb-0">Deleted Users ({filteredDeletedUsers.length})</h6>
                <div className="table-search">
                  <i className="bi bi-search" aria-hidden="true" />
                  <input type="search" className="form-control form-control-sm" placeholder="Search users" value={userSearch} onChange={(event) => setUserSearch(event.target.value)} />
                </div>
              </div>
            ) : (
              <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-2">
                <h6 className="mb-0">Pending Email Verification Users ({filteredPendingEmailVerificationUsers.length})</h6>
                <div className="table-search">
                  <i className="bi bi-search" aria-hidden="true" />
                  <input type="search" className="form-control form-control-sm" placeholder="Search users" value={userSearch} onChange={(event) => setUserSearch(event.target.value)} />
                </div>
              </div>
            )}
            <div className="table-responsive">
              {userListTab === "all" ? (
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
                          <td>{user.is_locked ? "Locked" : (user.is_active ? "Active" : "Deactive")}</td>
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
                              <button
                                type="button"
                                className={`btn btn-sm ${
                                  user.is_locked
                                    ? "btn-outline-secondary"
                                    : (user.is_active ? "btn-outline-success" : "btn-outline-primary")
                                }`}
                                onClick={() => handleToggleUserStatus(user, !user.is_active)}
                                disabled={!user.membership_id || togglingMembershipId === String(user.membership_id)}
                              >
                                {togglingMembershipId === String(user.membership_id)
                                  ? "Updating..."
                                  : (user.is_locked ? "Locked" : (user.is_active ? "Active" : "Deactive"))}
                              </button>
                              <button type="button" className="btn btn-sm btn-outline-danger" data-no-delete-confirm="true" onClick={() => handleDeleteUser(user.membership_id)} disabled={deletingMembershipId === String(user.membership_id)}>
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
              ) : userListTab === "deleted" ? (
                <table className="table table-dark table-hover align-middle mb-0">
                  <thead>
                    <tr>
                      <th>First Name</th>
                      <th>Last Name</th>
                      <th>Official Email</th>
                      <th>Department</th>
                      <th>Employee Role</th>
                      <th>Deleted At</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loading ? (
                      <tr><td colSpan={7}>Loading users...</td></tr>
                    ) : paginatedUsers.length ? (
                      paginatedUsers.map((user) => (
                        <tr key={`deleted-${user.membership_id || user.id}`}>
                          <td>{user.first_name || splitDisplayName(user.name || "").first_name || "-"}</td>
                          <td>{user.last_name || splitDisplayName(user.name || "").last_name || "-"}</td>
                          <td>{user.email || "-"}</td>
                          <td>{user.department || "-"}</td>
                          <td>{user.employee_role || "-"}</td>
                          <td>{user.deleted_at ? new Date(user.deleted_at).toLocaleString() : "-"}</td>
                          <td>
                            <div className="d-inline-flex gap-2">
                              <button
                                type="button"
                                className="btn btn-sm btn-outline-success"
                                onClick={() => handleRestoreUser(user.membership_id)}
                                disabled={restoringMembershipId === String(user.membership_id)}
                              >
                                {restoringMembershipId === String(user.membership_id) ? "Restoring..." : "Restore"}
                              </button>
                              <button
                                type="button"
                                className="btn btn-sm btn-outline-danger"
                                data-no-delete-confirm="true"
                                onClick={() => handlePermanentDeleteUser(user.membership_id)}
                                disabled={permanentlyDeletingMembershipId === String(user.membership_id)}
                              >
                                {permanentlyDeletingMembershipId === String(user.membership_id) ? "Deleting..." : "Delete"}
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr><td colSpan={7}>No deleted users found.</td></tr>
                    )}
                  </tbody>
                </table>
              ) : (
                <table className="table table-dark table-hover align-middle mb-0">
                  <thead>
                    <tr>
                      <th>First Name</th>
                      <th>Last Name</th>
                      <th>Official Email</th>
                      <th>Department</th>
                      <th>Employee Role</th>
                      <th>Email Status</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loading ? (
                      <tr><td colSpan={7}>Loading users...</td></tr>
                    ) : filteredPendingEmailVerificationUsers.length ? (
                      filteredPendingEmailVerificationUsers.map((user) => (
                        <tr key={`pending-${user.membership_id || user.id}`}>
                          <td>{user.first_name || splitDisplayName(user.name || "").first_name || "-"}</td>
                          <td>{user.last_name || splitDisplayName(user.name || "").last_name || "-"}</td>
                          <td>{user.email || "-"}</td>
                          <td>{user.department || "-"}</td>
                          <td>{user.employee_role || "-"}</td>
                          <td>Pending</td>
                          <td>
                            <button
                              type="button"
                              className="btn btn-sm btn-primary"
                              onClick={() => handleVerifyUserEmail(user)}
                              disabled={!user.membership_id || verifyingMembershipId === String(user.membership_id)}
                            >
                              {verifyingMembershipId === String(user.membership_id) ? "Verifying..." : "Verify"}
                            </button>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr><td colSpan={7}>No pending email verification users.</td></tr>
                    )}
                  </tbody>
                </table>
              )}
            </div>
            {!loading && (userListTab === "all" || userListTab === "deleted") ? (
              <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 mt-2">
                <div className="small text-secondary">
                  Showing {userStartIndex} to {userEndIndex} of {currentUserListRows.length} entries
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
                disabled={!canManageRoleAccessTab || roleAccessSaving || !roleAccessDirty}
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

          {!canManageRoleAccessTab ? (
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
                {visibleRoleAccessSections.map((section) => (
                  <tr key={section.key}>
                    <td>{section.label}</td>
                    <td>
                      <select
                        className="form-select form-select-sm"
                        value={selectedRoleAccess.sections?.[section.key] || "No Access"}
                        disabled={!canManageRoleAccessTab}
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

          <div className="card p-3 mb-3">
            <div className="small text-secondary mb-2">Users: Sub Access Controls</div>
            <div className="d-flex flex-column gap-2">
              {USER_SUB_ACCESS_OPTIONS.map((item) => {
                const subRecord = selectedRoleAccess.user_sub_sections?.[item.key] || { enabled: false, access_level: "No Access" };
                const enabled = Boolean(subRecord.enabled);
                const currentLevel = normalizeRoleAccessLevel(subRecord.access_level || "No Access");
                return (
                  <div key={`rbac-user-sub-${item.key}`} className="row g-2 align-items-center">
                    <div className="col-12 col-md-5">
                      <div className="form-check">
                        <input
                          id={`rbac-user-sub-check-${item.key}`}
                          className="form-check-input"
                          type="checkbox"
                          checked={enabled}
                          disabled={!canManageRoleAccessTab}
                          onChange={(event) => {
                            const nextEnabled = event.target.checked;
                            updateRoleAccess((prev) => ({
                              ...prev,
                              user_sub_sections: {
                                ...(prev.user_sub_sections || {}),
                                [item.key]: {
                                  enabled: nextEnabled,
                                  access_level: nextEnabled
                                    ? (currentLevel === "No Access" ? "View" : currentLevel)
                                    : "No Access",
                                },
                              },
                            }));
                          }}
                        />
                        <label className="form-check-label small text-secondary mb-0" htmlFor={`rbac-user-sub-check-${item.key}`}>
                          {item.label}
                        </label>
                      </div>
                    </div>
                    <div className="col-12 col-md-7">
                      <select
                        className="form-select form-select-sm"
                        disabled={!canManageRoleAccessTab || !enabled}
                        value={enabled ? currentLevel : "No Access"}
                        onChange={(event) => {
                          updateRoleAccess((prev) => ({
                            ...prev,
                            user_sub_sections: {
                              ...(prev.user_sub_sections || {}),
                              [item.key]: {
                                enabled: true,
                                access_level: normalizeRoleAccessLevel(event.target.value),
                              },
                            },
                          }));
                        }}
                      >
                        {ACCESS_LEVEL_OPTIONS.filter((level) => level !== "No Access").map((level) => (
                          <option key={`rbac-user-sub-level-${item.key}-${level}`} value={level}>{level}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="row g-3">
            <div className="col-12 col-md-4">
              <div className="form-check form-switch">
                <input id="rbac-export" className="form-check-input" type="checkbox" checked={Boolean(selectedRoleAccess.can_export)} disabled={!canManageRoleAccessTab} onChange={(event) => updateRoleAccess((prev) => ({ ...prev, can_export: event.target.checked }))} />
                <label className="form-check-label" htmlFor="rbac-export">Allow Export</label>
              </div>
            </div>
            <div className="col-12 col-md-4">
              <div className="form-check form-switch">
                <input id="rbac-delete" className="form-check-input" type="checkbox" checked={Boolean(selectedRoleAccess.can_delete)} disabled={!canManageRoleAccessTab} onChange={(event) => updateRoleAccess((prev) => ({ ...prev, can_delete: event.target.checked }))} />
                <label className="form-check-label" htmlFor="rbac-delete">Allow Delete</label>
              </div>
            </div>
            <div className="col-12 col-md-4">
              <div className="form-check form-switch">
                <input id="rbac-self-att" className="form-check-input" type="checkbox" checked={Boolean(selectedRoleAccess.attendance_self_service)} disabled={!canManageRoleAccessTab} onChange={(event) => updateRoleAccess((prev) => ({ ...prev, attendance_self_service: event.target.checked }))} />
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
                disabled={!canManageRoleAccessTab}
                onChange={(event) => updateRoleAccess((prev) => ({ ...prev, remarks: limitedTextarea("remarks", event.target.value) }))}
              />
            </div>
          </div>

          <hr />
          <div>
            <div className="small text-secondary mb-2">Enabled Access Preview</div>
            <div className="d-flex flex-wrap gap-2">
              {visibleRoleAccessSections.filter((section) => (selectedRoleAccess.sections?.[section.key] || "No Access") !== "No Access").map((section) => (
                <span key={`rbac-preview-${section.key}`} className="badge text-bg-success">
                  {section.label}: {selectedRoleAccess.sections?.[section.key]}
                </span>
              ))}
              {USER_SUB_ACCESS_OPTIONS
                .filter((item) => Boolean(selectedRoleAccess.user_sub_sections?.[item.key]?.enabled))
                .map((item) => (
                  <span key={`rbac-sub-preview-${item.key}`} className="badge text-bg-primary">
                    Users/{item.label}: {selectedRoleAccess.user_sub_sections?.[item.key]?.access_level || "No Access"}
                  </span>
                ))}
              {!visibleRoleAccessSections.some((section) => (selectedRoleAccess.sections?.[section.key] || "No Access") !== "No Access")
              && !USER_SUB_ACCESS_OPTIONS.some((item) => Boolean(selectedRoleAccess.user_sub_sections?.[item.key]?.enabled)) ? (
                <span className="text-secondary small">No access sections configured.</span>
              ) : null}
            </div>
          </div>
        </div>
      ) : activeTopTab === "clients" ? (
        <>
          {canCreateClientsTab || editingClientId ? (
            <div className="card p-3">
              <h6 className="mb-3">{editingClientId ? "Edit Client" : "Create Client"}</h6>
              <form className="d-flex flex-column gap-3" onSubmit={saveClient}>
              <div className="row g-3">
                <div className="col-12 col-xl-4">
                  <label className="form-label small text-secondary mb-1">Company Name *</label>
                  <div className="crm-inline-suggestions-wrap">
                    <input
                      className="form-control"
                      required
                      maxLength={getBusinessAutopilotMaxLength("companyName")}
                      value={clientForm.companyName || ""}
                      onFocus={() => setClientCompanySearchOpen(true)}
                      onClick={() => setClientCompanySearchOpen(true)}
                      onBlur={() => window.setTimeout(() => setClientCompanySearchOpen(false), 120)}
                      onChange={(event) => {
                        const nextValue = limitedInput("companyName", event.target.value);
                        setClientForm((prev) => ({ ...prev, companyName: nextValue, name: nextValue }));
                        setClientCompanySearchOpen(true);
                      }}
                      placeholder="Company name"
                    />
                    {clientCompanySearchOpen ? (
                      <div className="crm-inline-suggestions">
                        <div className="crm-inline-suggestions__group">
                          <div className="crm-inline-suggestions__title">CRM Clients</div>
                          {crmClientMatches.length ? crmClientMatches.map((row, index) => (
                            <button
                              key={`users-client-crm-match-${row.id || row.email || row.phone || index}`}
                              type="button"
                              className="crm-inline-suggestions__item"
                              onMouseDown={(event) => event.preventDefault()}
                              onClick={() => selectCrmContactForClient(row)}
                            >
                              <span className="crm-inline-suggestions__item-main">{row.company || row.name || "-"}</span>
                              <span className="crm-inline-suggestions__item-sub">
                                {[row.name, row.email, row.phone ? `${row.phoneCountryCode || "+91"} ${row.phone}` : ""].filter(Boolean).join(" | ") || "-"}
                              </span>
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
                <div className="col-12 col-xl-4">
                  <label className="form-label small text-secondary mb-1">Client Name *</label>
                  <input className="form-control" required maxLength={getBusinessAutopilotMaxLength("clientName")} value={clientForm.clientName || ""} onChange={(event) => setClientForm((prev) => ({ ...prev, clientName: limitedInput("clientName", event.target.value) }))} placeholder="Client / Contact person" />
                </div>
                <div className="col-12 col-xl-4">
                  <label className="form-label small text-secondary mb-1">GSTIN</label>
                  <input className="form-control" maxLength={getBusinessAutopilotMaxLength("gstin")} value={clientForm.gstin || ""} onChange={(event) => setClientForm((prev) => ({ ...prev, gstin: limitedInput("gstin", event.target.value) }))} placeholder="GSTIN" />
                </div>
                <div className="col-12 col-xl-6">
                  <label className="form-label small text-secondary mb-1">Phone Number *</label>
                  <div className="d-flex flex-column gap-2">
                    <div className="d-flex gap-2">
                      <PhoneCountryCodePicker
                        value={clientForm.phoneCountryCode || "+91"}
                        onChange={(code) => setClientForm((prev) => ({ ...prev, phoneCountryCode: code }))}
                        options={DIAL_COUNTRY_PICKER_OPTIONS}
                        style={{ maxWidth: "220px" }}
                        ariaLabel="Client phone country code"
                      />
                      <input className="form-control" required maxLength={getBusinessAutopilotMaxLength("phone")} value={clientForm.phone || ""} onChange={(event) => setClientForm((prev) => ({ ...prev, phone: limitedInput("phone", event.target.value) }))} placeholder="Phone number" />
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
                  <label className="form-label small text-secondary mb-1">Email ID *</label>
                  <div className="d-flex flex-column gap-2">
                    <div className="d-flex gap-2">
                      <input className="form-control" required maxLength={getBusinessAutopilotMaxLength("email")} value={clientForm.email || ""} onChange={(event) => setClientForm((prev) => ({ ...prev, email: limitedInput("email", event.target.value) }))} placeholder="Primary email" />
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
                    <label className="form-label small text-secondary mb-0">Billing Address *</label>
                    <label className="form-check-label small text-secondary d-flex align-items-center gap-2 mb-0">
                      <input
                        type="checkbox"
                        className="form-check-input mt-0"
                        checked={Boolean(clientForm.billingShippingSame)}
                        onChange={(event) => setClientForm((prev) => ({ ...prev, billingShippingSame: event.target.checked }))}
                      />
                      Billing And Shipping Same
                    </label>
                  </div>
                  <textarea className="form-control mb-2" required rows="2" maxLength={getBusinessAutopilotMaxLength("billingAddress", { isTextarea: true })} value={clientForm.billingAddress || ""} onChange={(event) => setClientForm((prev) => ({ ...prev, billingAddress: limitedTextarea("billingAddress", event.target.value) }))} placeholder="Billing address" />
                  <div className="d-flex flex-column gap-2">
                    <div>
                      <label className="form-label small text-secondary mb-1">Country *</label>
                      <select className="form-select" required value={clientForm.billingCountry || "India"} onChange={(event) => setClientForm((prev) => ({ ...prev, billingCountry: event.target.value, billingState: "" }))}>
                        {COUNTRY_OPTIONS.map((country) => <option key={`users-client-country-${country}`} value={country}>{country}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="form-label small text-secondary mb-1">State *</label>
                      {billingStateOptions.length ? (
                        <select className="form-select" required value={clientForm.billingState || ""} onChange={(event) => setClientForm((prev) => ({ ...prev, billingState: event.target.value }))}>
                          <option value="">Select State</option>
                          {billingStateOptions.map((state) => <option key={`users-client-state-${state}`} value={state}>{state}</option>)}
                        </select>
                      ) : (
                        <input className="form-control" required maxLength={getBusinessAutopilotMaxLength("billingState")} value={clientForm.billingState || ""} onChange={(event) => setClientForm((prev) => ({ ...prev, billingState: limitedInput("billingState", event.target.value) }))} placeholder="State / Province / Region" />
                      )}
                    </div>
                    <div>
                      <label className="form-label small text-secondary mb-1">Pincode *</label>
                      <input className="form-control" required maxLength={getBusinessAutopilotMaxLength("billingPincode")} value={clientForm.billingPincode || ""} onChange={(event) => setClientForm((prev) => ({ ...prev, billingPincode: limitedInput("billingPincode", event.target.value) }))} placeholder="Pincode" />
                    </div>
                  </div>
                </div>
                {!clientForm.billingShippingSame ? (
                  <div className="col-12 col-xl-6">
                    <label className="form-label small text-secondary mb-1">Shipping Address *</label>
                    <textarea className="form-control mb-2" required rows="2" maxLength={getBusinessAutopilotMaxLength("shippingAddress", { isTextarea: true })} value={clientForm.shippingAddress || ""} onChange={(event) => setClientForm((prev) => ({ ...prev, shippingAddress: limitedTextarea("shippingAddress", event.target.value) }))} placeholder="Shipping address" />
                    <div className="d-flex flex-column gap-2">
                      <div>
                        <label className="form-label small text-secondary mb-1">Country *</label>
                        <select className="form-select" required value={clientForm.shippingCountry || "India"} onChange={(event) => setClientForm((prev) => ({ ...prev, shippingCountry: event.target.value, shippingState: "" }))}>
                          {COUNTRY_OPTIONS.map((country) => <option key={`users-client-shipping-country-${country}`} value={country}>{country}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="form-label small text-secondary mb-1">State *</label>
                        {shippingStateOptions.length ? (
                          <select className="form-select" required value={clientForm.shippingState || ""} onChange={(event) => setClientForm((prev) => ({ ...prev, shippingState: event.target.value }))}>
                            <option value="">Select State</option>
                            {shippingStateOptions.map((state) => <option key={`users-client-shipping-state-${state}`} value={state}>{state}</option>)}
                          </select>
                        ) : (
                          <input className="form-control" required maxLength={getBusinessAutopilotMaxLength("shippingState")} value={clientForm.shippingState || ""} onChange={(event) => setClientForm((prev) => ({ ...prev, shippingState: limitedInput("shippingState", event.target.value) }))} placeholder="State / Province / Region" />
                        )}
                      </div>
                      <div>
                        <label className="form-label small text-secondary mb-1">Pincode *</label>
                        <input className="form-control" required maxLength={getBusinessAutopilotMaxLength("shippingPincode")} value={clientForm.shippingPincode || ""} onChange={(event) => setClientForm((prev) => ({ ...prev, shippingPincode: limitedInput("shippingPincode", event.target.value) }))} placeholder="Pincode" />
                      </div>
                    </div>
                  </div>
                ) : null}
              </div>
                <div className="d-flex gap-2">
                  <button type="submit" className="btn btn-success btn-sm" disabled={editingClientId ? !canEditClientsTab : !canCreateClientsTab}>{editingClientId ? "Update Client" : "Create Client"}</button>
                  {editingClientId ? <button type="button" className="btn btn-outline-light btn-sm" onClick={resetClientForm}>Cancel</button> : null}
                </div>
              </form>
            </div>
          ) : null}

          <div style={{ paddingTop: "25px" }}>
            <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-2">
              <h6 className="mb-0">Client List</h6>
              <div className="d-flex flex-wrap align-items-center justify-content-end gap-2">
                <input
                  ref={clientImportInputRef}
                  type="file"
                  accept=".csv,text/csv,.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,.xls,application/vnd.ms-excel"
                  className="d-none"
                  onChange={onClientImportFileChange}
                />
                <button type="button" className="btn btn-sm btn-outline-success" onClick={triggerClientImportPicker} disabled={!canCreateClientsTab}>
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
                            <button type="button" className="btn btn-sm btn-outline-info" disabled={!canEditClientsTab} onClick={() => editClient(row)}>Edit</button>
                            <button type="button" className="btn btn-sm btn-outline-danger" disabled={!canDeleteClientsTab} onClick={() => deleteClient(row.id)}>Delete</button>
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
          {canCreateVendorsTab || editingVendorId ? (
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
                  <button type="submit" className="btn btn-success btn-sm" disabled={editingVendorId ? !canEditVendorsTab : !canCreateVendorsTab}>{editingVendorId ? "Update Vendor" : "Create Vendor"}</button>
                  {editingVendorId ? <button type="button" className="btn btn-outline-light btn-sm" onClick={resetVendorForm}>Cancel</button> : null}
                </div>
              </form>
            </div>
          ) : null}

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
              <button type="button" className="btn btn-sm btn-outline-success" onClick={triggerVendorImportPicker} disabled={!canCreateVendorsTab}>
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
                            <button type="button" className="btn btn-sm btn-outline-info" disabled={!canEditVendorsTab} onClick={() => editVendor(row)}>Edit</button>
                            <button type="button" className="btn btn-sm btn-outline-danger" disabled={!canDeleteVendorsTab} onClick={() => deleteVendor(row.id)}>Delete</button>
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
          <div className="modal-panel" data-confirm-dialog="true" style={{ width: "min(520px, 94vw)" }} onClick={(event) => event.stopPropagation()}>
            <div className="mb-3">
              <h5 className="mb-1">{actionDialog.title}</h5>
              <div className="text-secondary" style={{ whiteSpace: "pre-wrap" }}>
                {actionDialog.message}
              </div>
            </div>
            <div className="d-flex flex-wrap justify-content-end gap-2">
              {actionDialog.variant === "confirm" ? (
                <button type="button" className="btn btn-outline-light btn-sm" data-no-delete-confirm="true" onClick={() => closeActionDialog(false)}>
                  {actionDialog.cancelText}
                </button>
              ) : null}
              <button type="button" className="btn btn-primary btn-sm" data-no-delete-confirm="true" onClick={() => closeActionDialog(true)}>
                {actionDialog.confirmText}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
