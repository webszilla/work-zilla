import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "../lib/api.js";
import { PHONE_COUNTRIES } from "../lib/phoneCountries.js";
import PhoneCountryCodePicker from "../components/PhoneCountryCodePicker.jsx";
import TablePagination from "../components/TablePagination.jsx";
import { setOrgTimezone as applyOrgTimezone } from "../lib/datetime.js";
import { TIMEZONE_OPTIONS, getBrowserTimezone } from "../lib/timezones.js";
import { createOrgTicket } from "../api/orgTickets.js";
import { showUploadAlert } from "../lib/uploadAlert.js";

const emptyState = {
  loading: true,
  error: "",
  data: null
};
const PROFILE_WHATSAPP_CONFIG_KEY = "wz_profile_whatsapp_api_config";
const PROFILE_WHATSAPP_RULES_KEY = "wz_profile_whatsapp_event_rules";
const HR_STORAGE_KEY = "wz_business_autopilot_hr_module";
const PROFILE_OPENAI_DEFAULT_FORM = {
  api_key: "",
  account_email: "",
  model: "gpt-4o-mini",
  agent_name: "Work Zilla AI Assistant",
  enabled: false,
};
const WHATSAPP_DEPARTMENTS = ["HR", "Sales", "Accounts", "Support", "Projects", "Operations", "Client"];
const WHATSAPP_COMPANY_EVENT_OPTIONS = [
  "New Lead Assigned",
  "Payment Pending",
  "Invoice Generated",
  "Support Ticket Created",
  "Attendance Alert",
  "Low Stock Alert",
  "Leave Request",
];
const WHATSAPP_CLIENT_EVENT_OPTIONS = [
  "Welcome Message",
  "Invoice Shared",
  "Payment Reminder",
  "Payment Received Confirmation",
  "Order / Service Status Update",
  "Appointment Reminder",
  "Support Response Update",
  "Delivery / Dispatch Update",
  "Custom Client Notification",
];
const THEME_OVERRIDE_KEY = "wz_brand_theme_override";
const PROFILE_TICKET_MAX_ATTACHMENTS = 5;
const PROFILE_TICKET_MAX_ATTACHMENT_BYTES = 2 * 1024 * 1024;
const PROFILE_PHOTO_MAX_BYTES = 500 * 1024;
const COMPANY_PROFILE_CURRENCIES = ["INR", "USD", "EUR", "AED", "SGD", "GBP", "AUD", "CAD"];
const PROFILE_EMPLOYEE_DETAILS_FIELDS = [
  ["Department", "department"],
  ["Employee Role", "designation"],
  ["Gender", "gender"],
  ["Date of Joining", "dateOfJoining"],
  ["Date of Birth", "dateOfBirth"],
  ["Blood Group", "bloodGroup"],
  ["Father's Name", "fatherName"],
  ["Mother's Name", "motherName"],
  ["Primary Mobile", "contactNumberFull"],
  ["Secondary Mobile", "secondaryContactNumberFull"],
  ["Marital Status", "maritalStatus"],
  ["Permanent Address", "permanentAddress"],
  ["Permanent Country", "permanentCountry"],
  ["Permanent State", "permanentState"],
  ["Permanent City", "permanentCity"],
  ["Permanent Pincode", "permanentPincode"],
  ["Temporary Address", "temporaryAddress"],
  ["Temporary Country", "temporaryCountry"],
  ["Temporary State", "temporaryState"],
  ["Temporary City", "temporaryCity"],
  ["Temporary Pincode", "temporaryPincode"],
];

function buildEmptyCompanyProfile() {
  return {
    company_name: "",
    address_line1: "",
    city: "",
    state: "",
    postal_code: "",
    country: "India",
    gstin: "",
    currency: "INR",
    mobile_phone_country: "+91",
    mobile_phone: "",
    phone_country: "+91",
    phone: "",
    timezone: "UTC",
  };
}

function normalizeTimeoutMinutes(value, fallback = 30) {
  const parsed = Number.parseInt(String(value || ""), 10);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  if (parsed < 1) {
    return 1;
  }
  if (parsed > 1440) {
    return 1440;
  }
  return parsed;
}

function normalizeHexColor(value, fallback = "") {
  const color = String(value || "").trim();
  return /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(color) ? color.toLowerCase() : fallback;
}

function applyOrgThemePreview(theme) {
  if (typeof document === "undefined") {
    return;
  }
  const root = document.documentElement;
  const vars = [
    "--color-primary",
    "--color-primary-hover",
    "--color-accent",
    "--color-highlight",
    "--color-accent-rgb",
    "--color-primary-rgb",
  ];
  if (!theme?.primary) {
    vars.forEach((name) => root.style.removeProperty(name));
    return;
  }
  const hexToRgb = (value) => {
    const hex = String(value || "").replace("#", "").trim();
    if (hex.length === 3) {
      return `${parseInt(hex[0] + hex[0], 16)}, ${parseInt(hex[1] + hex[1], 16)}, ${parseInt(hex[2] + hex[2], 16)}`;
    }
    if (hex.length === 6) {
      return `${parseInt(hex.slice(0, 2), 16)}, ${parseInt(hex.slice(2, 4), 16)}, ${parseInt(hex.slice(4, 6), 16)}`;
    }
    return "";
  };
  const primary = normalizeHexColor(theme.primary);
  const secondary = normalizeHexColor(theme.secondary, primary) || primary;
  if (!primary) {
    vars.forEach((name) => root.style.removeProperty(name));
    return;
  }
  root.style.setProperty("--color-primary", primary);
  root.style.setProperty("--color-primary-hover", primary);
  root.style.setProperty("--color-accent", secondary);
  root.style.setProperty("--color-highlight", secondary);
  const primaryRgb = hexToRgb(primary);
  const accentRgb = hexToRgb(secondary);
  if (primaryRgb) root.style.setProperty("--color-primary-rgb", primaryRgb);
  if (accentRgb) root.style.setProperty("--color-accent-rgb", accentRgb);
}

function buildDefaultWhatsappApiConfig() {
  return {
    providerName: "Meta WhatsApp Cloud API",
    apiBaseUrl: "",
    phoneNumberId: "",
    accessToken: "",
    webhookVerifyToken: "",
    status: "Disconnected",
  };
}

function buildEmptyWhatsappRule(adminName = "") {
  return {
    eventName: "",
    department: "HR",
    assignedOrgAdmin: adminName || "",
    priority: "High",
    triggerStatus: "Active",
    clientMessageTemplate: "",
    internalNotes: "",
  };
}

function readThemeOverride() {
  if (typeof window === "undefined") {
    return null;
  }
  const raw = window.localStorage.getItem(THEME_OVERRIDE_KEY);
  if (!raw || raw === "default") {
    return null;
  }
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function validateTicketImages(files) {
  const rows = Array.from(files || []);
  if (rows.length > PROFILE_TICKET_MAX_ATTACHMENTS) {
    return `Maximum ${PROFILE_TICKET_MAX_ATTACHMENTS} images allowed.`;
  }
  for (const file of rows) {
    if (file.size > PROFILE_TICKET_MAX_ATTACHMENT_BYTES) {
      return "Each image must be 2MB or smaller.";
    }
    if (file.type && !file.type.startsWith("image/")) {
      return "Only image files are allowed.";
    }
  }
  return "";
}

function splitCombinedPhoneValue(value) {
  const raw = String(value || "").trim();
  if (!raw) {
    return { countryCode: "", number: "" };
  }
  const parts = raw.split(/\s+/);
  if (parts[0]?.startsWith("+")) {
    return {
      countryCode: parts[0],
      number: parts.slice(1).join(" ").trim(),
    };
  }
  return { countryCode: "", number: raw };
}

function readHrEmployeeProfileForUser(user = {}) {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    const raw = window.localStorage.getItem(HR_STORAGE_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw);
    const employees = Array.isArray(parsed?.employees) ? parsed.employees : [];
    const userId = String(user?.id || "").trim();
    const email = String(user?.email || "").trim().toLowerCase();
    const fullName = `${String(user?.first_name || "").trim()} ${String(user?.last_name || "").trim()}`.trim().toLowerCase();
    const matched = employees.find((row) => {
      const sourceUserId = String(row?.sourceUserId || row?.userId || "").trim();
      const sourceUserEmail = String(row?.sourceUserEmail || "").trim().toLowerCase();
      const employeeName = String(row?.name || "").trim().toLowerCase();
      return (
        (userId && sourceUserId === userId)
        || (email && sourceUserEmail === email)
        || (fullName && employeeName === fullName)
      );
    });
    if (!matched) {
      return null;
    }
    const primaryPhone = [String(matched.contactCountryCode || "").trim(), String(matched.contactNumber || "").trim()].filter(Boolean).join(" ").trim();
    const secondaryPhone = [String(matched.secondaryContactCountryCode || "").trim(), String(matched.secondaryContactNumber || "").trim()].filter(Boolean).join(" ").trim();
    return {
      ...matched,
      contactNumberFull: primaryPhone || "-",
      secondaryContactNumberFull: secondaryPhone || "-",
    };
  } catch {
    return null;
  }
}

function getProfilePhotoFallbackLabel(user = {}) {
  const fullName = `${String(user?.first_name || "").trim()} ${String(user?.last_name || "").trim()}`.trim();
  if (fullName) {
    return fullName.slice(0, 1).toUpperCase();
  }
  const username = String(user?.username || "").trim();
  if (username) {
    return username.slice(0, 1).toUpperCase();
  }
  const email = String(user?.email || "").trim();
  if (email) {
    return email.slice(0, 1).toUpperCase();
  }
  return "U";
}

const phoneCountries = PHONE_COUNTRIES;
export default function ProfilePage() {
  const initialProfileTab = (() => {
    if (typeof window === "undefined") {
      return "profile";
    }
    const params = new URLSearchParams(window.location.search);
    const requestedTab = String(params.get("tab") || "").trim();
    const allowedTabs = new Set(["profile", "companyProfile", "uiTheme", "backup", "referral", "whatsappApi", "openAiApi", "security", "tickets"]);
    return allowedTabs.has(requestedTab) ? requestedTab : "profile";
  })();
  const [state, setState] = useState(emptyState);
  const [notice, setNotice] = useState("");
  const [adminPage, setAdminPage] = useState(1);
  const [tableSearchTerm, setTableSearchTerm] = useState("");
  const [tableSearchQuery, setTableSearchQuery] = useState("");
  const [usersModal, setUsersModal] = useState({ open: false, users: [] });
  const [email, setEmail] = useState("");
  const [phoneCountry, setPhoneCountry] = useState("+91");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [orgTimezone, setOrgTimezone] = useState("UTC");
  const [themePrimary, setThemePrimary] = useState("#e11d48");
  const [themeSecondary, setThemeSecondary] = useState("#f59e0b");
  const [themeDefaults, setThemeDefaults] = useState({ primary: "#e11d48", secondary: "#f59e0b" });
  const [sidebarMenuStyle, setSidebarMenuStyle] = useState("default");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [profileTopTab, setProfileTopTab] = useState(initialProfileTab);
  const [orgUserTab, setOrgUserTab] = useState("profile");
  const [companyProfileForm, setCompanyProfileForm] = useState(buildEmptyCompanyProfile());
  const [companyProfileLoading, setCompanyProfileLoading] = useState(true);
  const [companyProfileError, setCompanyProfileError] = useState("");
  const [ticketForm, setTicketForm] = useState({
    category: "support",
    subject: "",
    message: "",
    files: [],
  });
  const [ticketState, setTicketState] = useState({
    saving: false,
    error: "",
    success: "",
  });
  const [securityTimeoutMinutes, setSecurityTimeoutMinutes] = useState(30);
  const [securitySaving, setSecuritySaving] = useState(false);
  const [securityRetentionDays, setSecurityRetentionDays] = useState(30);
  const [securityActivityLoading, setSecurityActivityLoading] = useState(false);
  const [securityActivityRows, setSecurityActivityRows] = useState([]);
  const [backupLoading, setBackupLoading] = useState(true);
  const [backupError, setBackupError] = useState("");
  const [backupItems, setBackupItems] = useState([]);
  const [backupProducts, setBackupProducts] = useState([]);
  const [backupProductSlug, setBackupProductSlug] = useState("");
  const [backupActionLoading, setBackupActionLoading] = useState(false);
  const [backupNotice, setBackupNotice] = useState("");
  const [whatsappApiConfig, setWhatsappApiConfig] = useState(buildDefaultWhatsappApiConfig());
  const [whatsappApiNotice, setWhatsappApiNotice] = useState("");
  const [whatsappEventRules, setWhatsappEventRules] = useState([]);
  const [whatsappRuleForm, setWhatsappRuleForm] = useState(buildEmptyWhatsappRule(""));
  const [editingWhatsappRuleId, setEditingWhatsappRuleId] = useState("");
  const [viewWhatsappRule, setViewWhatsappRule] = useState(null);
  const [whatsappRulesTab, setWhatsappRulesTab] = useState("company");
  const [openAiState, setOpenAiState] = useState({
    loading: false,
    error: "",
    success: "",
    data: null,
    form: { ...PROFILE_OPENAI_DEFAULT_FORM },
  });
  const [openAiTestState, setOpenAiTestState] = useState({ loading: false, message: "", ok: null });
  const [employeeProfile, setEmployeeProfile] = useState(null);
  const [profilePhotoUrl, setProfilePhotoUrl] = useState("");
  const [photoUploadState, setPhotoUploadState] = useState({ loading: false, error: "", success: "" });
  const [passwordResetModalOpen, setPasswordResetModalOpen] = useState(false);
  const rawPath = typeof window !== "undefined" ? window.location.pathname : "";
  const globalSlug = typeof window !== "undefined" ? window.__WZ_PRODUCT_SLUG__ : "";
  const currentProductSlug = globalSlug
    || (rawPath.includes("/ai-chatbot")
      ? "ai-chatbot"
      : rawPath.includes("/storage")
      ? "storage"
      : rawPath.includes("/business-autopilot")
      ? "business-autopilot-erp"
      : rawPath.includes("/whatsapp-automation")
      ? "whatsapp-automation"
      : rawPath.includes("/work-suite") || rawPath.includes("/worksuite") || rawPath.includes("/monitor")
      ? "worksuite"
      : "");

  useEffect(() => {
    const overrideTheme = readThemeOverride();
    if (!overrideTheme) {
      return;
    }
    if (overrideTheme.primary) {
      setThemePrimary(normalizeHexColor(overrideTheme.primary, "#e11d48"));
    }
    if (overrideTheme.secondary) {
      setThemeSecondary(normalizeHexColor(overrideTheme.secondary, "#f59e0b"));
    }
    if (overrideTheme.sidebarMenuStyle) {
      setSidebarMenuStyle(overrideTheme.sidebarMenuStyle === "compact" ? "compact" : "default");
    }
  }, []);

  useEffect(() => {
    let active = true;
    async function loadProfile() {
      setNotice("");
      try {
        const params = new URLSearchParams();
        if (adminPage) {
          params.set("admin_page", String(adminPage));
        }
        if (tableSearchQuery) {
          params.set("q", tableSearchQuery);
        }
        if (currentProductSlug) {
          params.set("product", currentProductSlug);
        }
        const browserTimezone = getBrowserTimezone();
        if (browserTimezone) {
          params.set("browser_timezone", browserTimezone);
        }
        const url = params.toString()
          ? `/api/dashboard/profile?${params.toString()}`
          : "/api/dashboard/profile";
        const data = await apiFetch(url);
        if (!active) {
          return;
        }
        setState({ loading: false, error: "", data });
        setEmail(data.user?.email || "");
        setPhoneCountry(data.phone_country || "+91");
        setPhoneNumber(data.phone_number || "");
        setProfilePhotoUrl(data.user?.profile_photo_url || "");
        const timezone = data.org_timezone || "UTC";
        setOrgTimezone(timezone);
        applyOrgTimezone(timezone);
        const defaults = {
          primary: normalizeHexColor(data.theme_defaults?.primary, "#e11d48"),
          secondary: normalizeHexColor(data.theme_defaults?.secondary, "#f59e0b"),
        };
        setThemeDefaults(defaults);
        setThemePrimary(normalizeHexColor(data.theme_primary, defaults.primary));
        setThemeSecondary(normalizeHexColor(data.theme_secondary, defaults.secondary));
        setSidebarMenuStyle(data.sidebar_menu_style === "compact" ? "compact" : "default");
        const securitySettings = data.security || {};
        setSecurityTimeoutMinutes(normalizeTimeoutMinutes(securitySettings.session_timeout_minutes, 30));
        setSecurityRetentionDays(normalizeTimeoutMinutes(securitySettings.login_activity_retention_days, 30));
      } catch (error) {
        if (error?.data?.redirect) {
          window.location.href = error.data.redirect;
          return;
        }
        if (active) {
          setState({
            loading: false,
            error: error?.message || "Unable to load profile.",
            data: null
          });
        }
      }
    }

    loadProfile();
    return () => {
      active = false;
    };
  }, [adminPage, tableSearchQuery, currentProductSlug]);

  useEffect(() => {
    let active = true;
    async function loadCompanyProfile() {
      setCompanyProfileLoading(true);
      setCompanyProfileError("");
      try {
        const data = await apiFetch("/api/dashboard/billing-profile");
        if (!active) {
          return;
        }
        setCompanyProfileForm({
          ...buildEmptyCompanyProfile(),
          ...(data?.profile || {}),
          mobile_phone_country: String(data?.profile?.mobile_phone || "").trim().startsWith("+")
            ? String(data.profile.mobile_phone).trim().split(/\s+/)[0]
            : "+91",
          mobile_phone: String(data?.profile?.mobile_phone || "").trim().startsWith("+")
            ? String(data.profile.mobile_phone).trim().split(/\s+/).slice(1).join(" ")
            : (data?.profile?.mobile_phone || ""),
          phone_country: String(data?.profile?.phone || "").trim().startsWith("+")
            ? String(data.profile.phone).trim().split(/\s+/)[0]
            : "+91",
          phone: String(data?.profile?.phone || "").trim().startsWith("+")
            ? String(data.profile.phone).trim().split(/\s+/).slice(1).join(" ")
            : (data?.profile?.phone || ""),
        });
      } catch (error) {
        if (!active) {
          return;
        }
        setCompanyProfileError(error?.message || "Unable to load company profile.");
      } finally {
        if (active) {
          setCompanyProfileLoading(false);
        }
      }
    }
    loadCompanyProfile();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const handle = setTimeout(() => {
      setTableSearchQuery(tableSearchTerm.trim());
      setAdminPage(1);
    }, 300);
    return () => clearTimeout(handle);
  }, [tableSearchTerm]);

  useEffect(() => {
    let active = true;
    async function loadBackupProducts() {
      try {
        const subs = await apiFetch("/api/auth/subscriptions");
        if (!active) {
          return;
        }
        const products = (subs.subscriptions || [])
          .map((entry) => ({
            slug: entry.product_slug,
            name: entry.product_name || entry.product_slug
          }));
        setBackupProducts(products);
        if (!backupProductSlug && products.length) {
          setBackupProductSlug(products[0].slug);
        }
      } catch (error) {
        if (!active) {
          return;
        }
        setBackupError(error?.message || "Unable to load products for backups.");
      }
    }

    loadBackupProducts();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    async function loadBackups() {
      if (!backupProductSlug) {
        setBackupLoading(false);
        return;
      }
      setBackupLoading(true);
      setBackupError("");
      try {
        const params = new URLSearchParams();
        params.set("limit", "10");
        params.set("product_slug", backupProductSlug);
        const data = await apiFetch(`/api/backup/list?${params.toString()}`);
        if (!active) {
          return;
        }
        setBackupItems(Array.isArray(data.items) ? data.items : []);
        setBackupLoading(false);
      } catch (error) {
        if (!active) {
          return;
        }
        setBackupError(error?.message || "Unable to load backups.");
        setBackupLoading(false);
      }
    }

    loadBackups();
    return () => {
      active = false;
    };
  }, [backupProductSlug]);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(PROFILE_WHATSAPP_CONFIG_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") {
        setWhatsappApiConfig((prev) => ({ ...prev, ...parsed }));
      }
    } catch {
      // ignore invalid cache
    }
  }, []);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(PROFILE_WHATSAPP_RULES_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        setWhatsappEventRules(parsed);
      }
    } catch {
      // ignore invalid cache
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem(PROFILE_WHATSAPP_CONFIG_KEY, JSON.stringify(whatsappApiConfig));
  }, [whatsappApiConfig]);

  useEffect(() => {
    window.localStorage.setItem(PROFILE_WHATSAPP_RULES_KEY, JSON.stringify(whatsappEventRules));
  }, [whatsappEventRules]);

  async function handleEmailSubmit(event) {
    event.preventDefault();
    setNotice("");
    try {
      await apiFetch("/api/dashboard/profile/email", {
        method: "POST",
        body: JSON.stringify({
          email,
          phone_country: phoneCountry,
          phone_number: phoneNumber,
          org_timezone: orgTimezone,
          theme_primary: normalizeHexColor(themePrimary, themeDefaults.primary),
          theme_secondary: normalizeHexColor(themeSecondary, themeDefaults.secondary),
          sidebar_menu_style: sidebarMenuStyle === "compact" ? "compact" : "default",
        })
      });
      applyOrgTimezone(orgTimezone || "UTC");
      if (typeof window !== "undefined") {
        window.localStorage.removeItem(THEME_OVERRIDE_KEY);
      }
      applyOrgThemePreview({
        primary: normalizeHexColor(themePrimary, themeDefaults.primary),
        secondary: normalizeHexColor(themeSecondary, themeDefaults.secondary),
      });
      if (typeof window !== "undefined") {
        window.dispatchEvent(
          new CustomEvent("wz:sidebar-menu-style-change", {
            detail: { style: sidebarMenuStyle === "compact" ? "compact" : "default" }
          })
        );
      }
      setNotice("Profile and UI theme updated successfully.");
    } catch (error) {
      setState((prev) => ({
        ...prev,
        error: error?.message || "Unable to update email."
      }));
    }
  }

  async function handleUiThemeSubmit(event) {
    event.preventDefault();
    setNotice("");
    try {
      await apiFetch("/api/dashboard/profile/email", {
        method: "POST",
        body: JSON.stringify({
          email,
          phone_country: phoneCountry,
          phone_number: phoneNumber,
          org_timezone: orgTimezone,
          theme_primary: normalizeHexColor(themePrimary, themeDefaults.primary),
          theme_secondary: normalizeHexColor(themeSecondary, themeDefaults.secondary),
          sidebar_menu_style: sidebarMenuStyle === "compact" ? "compact" : "default",
        })
      });
      applyOrgTimezone(orgTimezone || "UTC");
      if (typeof window !== "undefined") {
        window.localStorage.removeItem(THEME_OVERRIDE_KEY);
      }
      applyOrgThemePreview({
        primary: normalizeHexColor(themePrimary, themeDefaults.primary),
        secondary: normalizeHexColor(themeSecondary, themeDefaults.secondary),
      });
      if (typeof window !== "undefined") {
        window.dispatchEvent(
          new CustomEvent("wz:sidebar-menu-style-change", {
            detail: { style: sidebarMenuStyle === "compact" ? "compact" : "default" }
          })
        );
      }
      setNotice("UI theme settings updated successfully.");
      if (typeof window !== "undefined") {
        window.setTimeout(() => {
          window.location.reload();
        }, 120);
      }
    } catch (error) {
      setState((prev) => ({
        ...prev,
        error: error?.message || "Unable to update UI theme."
      }));
    }
  }

  function handlePersonalThemeSubmit(event) {
    event.preventDefault();
    setNotice("");
    const nextTheme = {
      primary: normalizeHexColor(themePrimary, themeDefaults.primary),
      secondary: normalizeHexColor(themeSecondary, themeDefaults.secondary),
      sidebarMenuStyle: sidebarMenuStyle === "compact" ? "compact" : "default",
    };
    if (typeof window !== "undefined") {
      window.localStorage.setItem(THEME_OVERRIDE_KEY, JSON.stringify(nextTheme));
      window.dispatchEvent(
        new CustomEvent("wz:sidebar-menu-style-change", {
          detail: { style: nextTheme.sidebarMenuStyle }
        })
      );
    }
    applyOrgThemePreview({
      primary: nextTheme.primary,
      secondary: nextTheme.secondary,
    });
    setNotice("Your personal theme settings were saved.");
  }

  function handleResetPersonalTheme() {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(THEME_OVERRIDE_KEY, "default");
      window.dispatchEvent(
        new CustomEvent("wz:sidebar-menu-style-change", {
          detail: { style: "default" }
        })
      );
    }
    setThemePrimary(themeDefaults.primary);
    setThemeSecondary(themeDefaults.secondary);
    setSidebarMenuStyle("default");
    applyOrgThemePreview(null);
    setNotice("Your personal theme settings were reset.");
  }

  async function handlePasswordSubmit(event) {
    event.preventDefault();
    setNotice("");
    try {
      await apiFetch("/api/dashboard/profile/password", {
        method: "POST",
        body: JSON.stringify({
          current_password: currentPassword,
          new_password: newPassword,
          confirm_password: confirmPassword
        })
      });
      setNotice("Password updated successfully.");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setPasswordResetModalOpen(false);
    } catch (error) {
      setState((prev) => ({
        ...prev,
        error: error?.message || "Unable to update password."
      }));
    }
  }

  async function handleProfilePhotoChange(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) {
      return;
    }
    if (file.size > PROFILE_PHOTO_MAX_BYTES) {
      const message = "Profile photo must be 500KB or smaller.";
      setPhotoUploadState({ loading: false, error: message, success: "" });
      showUploadAlert(message);
      return;
    }
    setPhotoUploadState({ loading: true, error: "", success: "" });
    try {
      const formData = new FormData();
      formData.set("photo", file);
      const response = await apiFetch("/api/dashboard/profile/photo", {
        method: "POST",
        body: formData,
      });
      setProfilePhotoUrl(response?.profile_photo_url || "");
      setState((prev) => ({
        ...prev,
        data: prev.data
          ? {
              ...prev.data,
              user: {
                ...(prev.data.user || {}),
                profile_photo_url: response?.profile_photo_url || "",
              },
              profile: {
                ...(prev.data.profile || {}),
                profile_photo_url: response?.profile_photo_url || "",
              },
            }
          : prev.data,
      }));
      setPhotoUploadState({ loading: false, error: "", success: "Profile photo updated successfully." });
    } catch (error) {
      setPhotoUploadState({ loading: false, error: error?.message || "Unable to upload profile photo.", success: "" });
    }
  }

  async function handleSaveOpenAiSettings(event) {
    event.preventDefault();
    setOpenAiState((prev) => ({ ...prev, loading: true, error: "", success: "" }));
    try {
      const response = await apiFetch("/api/business-autopilot/openai/settings", {
        method: "POST",
        body: JSON.stringify({
          api_key: openAiState.form.api_key,
          account_email: openAiState.form.account_email,
          model: openAiState.form.model,
          enabled: Boolean(openAiState.form.enabled),
        }),
      });
      setOpenAiState((prev) => ({
        ...prev,
        loading: false,
        error: "",
        success: "Open AI settings saved successfully.",
        data: response,
        form: {
          ...prev.form,
          api_key: "",
          account_email: response?.account_email || "",
          model: response?.model || prev.form.model,
          agent_name: response?.agent_name || prev.form.agent_name,
          enabled: Boolean(response?.enabled),
        },
      }));
    } catch (error) {
      setOpenAiState((prev) => ({
        ...prev,
        loading: false,
        error: error?.message || "Unable to save Open AI settings.",
      }));
    }
  }

  async function handleTestOpenAiConnection() {
    setOpenAiTestState({ loading: true, message: "", ok: null });
    try {
      const response = await apiFetch("/api/business-autopilot/openai/test", {
        method: "POST",
        body: JSON.stringify({
          api_key: openAiState.form.api_key,
          model: openAiState.form.model,
        }),
      });
      setOpenAiTestState({
        loading: false,
        message: `Connection OK (${response?.model || openAiState.form.model})`,
        ok: true,
      });
    } catch (error) {
      setOpenAiTestState({
        loading: false,
        message: error?.message || "Connection failed.",
        ok: false,
      });
    }
  }

  async function handleCompanyProfileSubmit(event) {
    event.preventDefault();
    setNotice("");
    setCompanyProfileError("");
    try {
      const response = await apiFetch("/api/dashboard/billing-profile", {
        method: "POST",
        body: JSON.stringify({
          contact_name: user.username || companyProfileForm.company_name || "Org Admin",
          company_name: companyProfileForm.company_name,
          email: email || user.email || "",
          mobile_phone: companyProfileForm.mobile_phone || "",
          mobile_phone_country: companyProfileForm.mobile_phone_country || "+91",
          phone: companyProfileForm.phone || "",
          phone_country: companyProfileForm.phone_country || "+91",
          address_line1: companyProfileForm.address_line1,
          city: companyProfileForm.city,
          state: companyProfileForm.state,
          postal_code: companyProfileForm.postal_code,
          country: companyProfileForm.country,
          gstin: companyProfileForm.gstin,
          currency: companyProfileForm.currency,
          timezone: companyProfileForm.timezone,
        }),
      });
      const nextProfile = {
        ...buildEmptyCompanyProfile(),
        ...(response?.profile || {}),
        mobile_phone_country: String(response?.profile?.mobile_phone || "").trim().startsWith("+")
          ? String(response.profile.mobile_phone).trim().split(/\s+/)[0]
          : (companyProfileForm.mobile_phone_country || "+91"),
        mobile_phone: String(response?.profile?.mobile_phone || "").trim().startsWith("+")
          ? String(response.profile.mobile_phone).trim().split(/\s+/).slice(1).join(" ")
          : (response?.profile?.mobile_phone || ""),
        phone_country: String(response?.profile?.phone || "").trim().startsWith("+")
          ? String(response.profile.phone).trim().split(/\s+/)[0]
          : (companyProfileForm.phone_country || "+91"),
        phone: String(response?.profile?.phone || "").trim().startsWith("+")
          ? String(response.profile.phone).trim().split(/\s+/).slice(1).join(" ")
          : (response?.profile?.phone || ""),
      };
      setCompanyProfileForm(nextProfile);
      setOrgTimezone(nextProfile.timezone || "UTC");
      applyOrgTimezone(nextProfile.timezone || "UTC");
      setState((prev) => ({
        ...prev,
        data: prev.data
          ? {
              ...prev.data,
              org: {
                ...(prev.data.org || {}),
                name: nextProfile.company_name || prev.data.org?.name || "",
              },
              org_timezone: nextProfile.timezone || prev.data.org_timezone || "UTC",
            }
          : prev.data,
      }));
      setNotice("Company profile updated successfully.");
    } catch (error) {
      setCompanyProfileError(error?.message || "Unable to update company profile.");
    }
  }

  async function handleGenerateBackup() {
    if (!data.org?.id || !backupProductSlug) {
      setBackupError("Organization or product missing.");
      return;
    }
    setBackupNotice("");
    setBackupError("");
    setBackupActionLoading(true);
    try {
      await apiFetch("/api/backup/request", {
        method: "POST",
        body: JSON.stringify({
          organization_id: data.org.id,
          product_slug: backupProductSlug
        })
      });
      setBackupNotice("Backup request queued. It will appear here once ready.");
      setBackupActionLoading(false);
    } catch (error) {
      setBackupError(error?.message || "Unable to request backup.");
      setBackupActionLoading(false);
    }
  }

  async function handleCreateSupportTicket(event) {
    event.preventDefault();
    const subject = String(ticketForm.subject || "").trim();
    const message = String(ticketForm.message || "").trim();
    if (!subject || !message) {
      setTicketState({ saving: false, error: "Subject and message are required.", success: "" });
      return;
    }
    const fileError = validateTicketImages(ticketForm.files);
    if (fileError) {
      showUploadAlert(fileError);
      setTicketState({ saving: false, error: fileError, success: "" });
      return;
    }
    setTicketState({ saving: true, error: "", success: "" });
    try {
      const formData = new FormData();
      formData.set("category", ticketForm.category || "support");
      formData.set("subject", subject);
      formData.set("message", message);
      if (currentProductSlug) {
        formData.set("product_slug", currentProductSlug);
      }
      Array.from(ticketForm.files || []).forEach((file) => formData.append("attachments", file));
      await createOrgTicket(formData);
      setTicketForm({ category: "support", subject: "", message: "", files: [] });
      setTicketState({ saving: false, error: "", success: "Ticket created successfully. You can track it in Inbox > Ticket." });
    } catch (error) {
      setTicketState({ saving: false, error: error?.message || "Unable to create ticket.", success: "" });
    }
  }

  async function handleSecuritySettingsSubmit(event) {
    event.preventDefault();
    setNotice("");
    setState((prev) => ({ ...prev, error: "" }));
    const timeout = normalizeTimeoutMinutes(securityTimeoutMinutes, 30);
    setSecuritySaving(true);
    try {
      const response = await apiFetch("/api/dashboard/profile/security", {
        method: "POST",
        body: JSON.stringify({
          session_timeout_minutes: timeout,
        }),
      });
      const savedTimeout = normalizeTimeoutMinutes(response?.session_timeout_minutes, timeout);
      setSecurityTimeoutMinutes(savedTimeout);
      setSecurityRetentionDays(normalizeTimeoutMinutes(response?.login_activity_retention_days, 30));
      setNotice(`Security settings updated. Auto logout timeout is ${savedTimeout} minutes.`);
    } catch (error) {
      setState((prev) => ({
        ...prev,
        error: error?.message || "Unable to update security settings.",
      }));
    } finally {
      setSecuritySaving(false);
    }
  }

  const data = state.data || {};
  const user = data.user || {};
  const normalizedProfileRole = String(data.profile?.role || "").trim().toLowerCase();
  const isOrgAdminProfile = normalizedProfileRole === "company_admin" || normalizedProfileRole === "org_admin";
  const isBusinessAutopilotOrgUser = currentProductSlug === "business-autopilot-erp" && normalizedProfileRole === "org_user";
  const isBusinessAutopilotOrgAdmin =
    currentProductSlug === "business-autopilot-erp" &&
    (normalizedProfileRole === "company_admin" || normalizedProfileRole === "org_admin");
  const recentActions = data.recent_actions || [];
  const profilePhoneDisplay = `${phoneCountry || ""} ${phoneNumber || ""}`.trim();
  const profilePhotoFallback = getProfilePhotoFallbackLabel(user);
  const referral = data.referral || {};
  const referralEarnings = Array.isArray(referral.earnings) ? referral.earnings : [];
  const tzList = TIMEZONE_OPTIONS.some((item) => item.value === orgTimezone)
    ? TIMEZONE_OPTIONS
    : [{ value: orgTimezone || "UTC", label: `${orgTimezone || "UTC"}` }, ...TIMEZONE_OPTIONS];
  const showTimezone = Boolean(data.org?.id);
  const pagination = data.pagination || {};
  const currentPage = pagination.page || adminPage;
  const pageSize = pagination.page_size || 50;
  const totalItems =
    typeof pagination.total_items === "number"
      ? pagination.total_items
      : recentActions.length;
  const startEntry = totalItems ? (currentPage - 1) * pageSize + 1 : 0;
  const endEntry = totalItems
    ? Math.min(currentPage * pageSize, totalItems)
    : 0;
  const orgAdminAssigneeOptions = useMemo(() => {
    const options = [
      user.username,
      user.email,
      data.org?.owner_name,
      data.org?.admin_name,
      "Org Admin",
    ]
      .map((value) => String(value || "").trim())
      .filter(Boolean);
    return Array.from(new Set(options));
  }, [data.org, user.email, user.username]);
  const filteredWhatsappEventRules = useMemo(() => {
    const rows = Array.isArray(whatsappEventRules) ? whatsappEventRules : [];
    if (whatsappRulesTab === "client") {
      return rows.filter((row) => String(row?.department || "").trim().toLowerCase() === "client");
    }
    return rows.filter((row) => String(row?.department || "").trim().toLowerCase() !== "client");
  }, [whatsappEventRules, whatsappRulesTab]);

  useEffect(() => {
    if (profileTopTab !== "security" || !isOrgAdminProfile || !data.org?.id) {
      return undefined;
    }
    let active = true;
    async function loadLoginActivity() {
      setSecurityActivityLoading(true);
      try {
        const response = await apiFetch("/api/dashboard/profile/login-activity");
        if (!active) {
          return;
        }
        setSecurityRetentionDays(normalizeTimeoutMinutes(response?.retention_days, 30));
        setSecurityActivityRows(Array.isArray(response?.rows) ? response.rows : []);
      } catch (error) {
        if (!active) {
          return;
        }
        setSecurityActivityRows([]);
        setState((prev) => ({
          ...prev,
          error: error?.message || "Unable to load login activity.",
        }));
      } finally {
        if (active) {
          setSecurityActivityLoading(false);
        }
      }
    }
    loadLoginActivity();
    return () => {
      active = false;
    };
  }, [data.org?.id, isOrgAdminProfile, profileTopTab]);

  useEffect(() => {
    if (!isBusinessAutopilotOrgUser) {
      setEmployeeProfile(null);
      return undefined;
    }
    const syncEmployeeProfile = () => {
      setEmployeeProfile(readHrEmployeeProfileForUser(data.user || {}));
    };
    syncEmployeeProfile();
    window.addEventListener("storage", syncEmployeeProfile);
    window.addEventListener("focus", syncEmployeeProfile);
    return () => {
      window.removeEventListener("storage", syncEmployeeProfile);
      window.removeEventListener("focus", syncEmployeeProfile);
    };
  }, [data.user, isBusinessAutopilotOrgUser]);

  useEffect(() => {
    setWhatsappRuleForm((prev) => {
      if (prev.assignedOrgAdmin) {
        return prev;
      }
      return {
        ...prev,
        assignedOrgAdmin: orgAdminAssigneeOptions[0] || "Org Admin",
      };
    });
  }, [orgAdminAssigneeOptions]);

  useEffect(() => {
    if (!isBusinessAutopilotOrgAdmin) {
      return undefined;
    }
    let active = true;
    async function loadOpenAiSettings() {
      setOpenAiState((prev) => ({ ...prev, loading: true, error: "", success: "" }));
      try {
        const response = await apiFetch("/api/business-autopilot/openai/settings");
        if (!active) {
          return;
        }
        setOpenAiState({
          loading: false,
          error: "",
          success: "",
          data: response,
          form: {
            api_key: "",
            account_email: response?.account_email || "",
            model: response?.model || "gpt-4o-mini",
            agent_name: response?.agent_name || "Work Zilla AI Assistant",
            enabled: Boolean(response?.enabled),
          },
        });
      } catch (error) {
        if (!active) {
          return;
        }
        setOpenAiState((prev) => ({
          ...prev,
          loading: false,
          error: error?.message || "Unable to load Open AI settings.",
        }));
      }
    }
    loadOpenAiSettings();
    return () => {
      active = false;
    };
  }, [isBusinessAutopilotOrgAdmin]);

  if (state.loading) {
    return (
      <div className="card p-4 text-center">
        <div className="spinner" />
        <p className="mb-0">Loading profile...</p>
      </div>
    );
  }

  function openUsersModal(users) {
    setUsersModal({ open: true, users });
  }

  function handleSaveWhatsappApiConfig(event) {
    event.preventDefault();
    setWhatsappApiNotice("WhatsApp API connection settings saved.");
    setWhatsappApiConfig((prev) => ({
      ...prev,
      status: prev.apiBaseUrl && prev.phoneNumberId && prev.accessToken ? "Connected" : "Disconnected",
    }));
  }

  function resetWhatsappRuleForm() {
    setEditingWhatsappRuleId("");
    setWhatsappRuleForm(buildEmptyWhatsappRule(orgAdminAssigneeOptions[0] || "Org Admin"));
  }

  function handleWhatsappRuleSubmit(event) {
    event.preventDefault();
    const payload = {
      ...whatsappRuleForm,
      eventName: String(whatsappRuleForm.eventName || "").trim(),
      department: String(whatsappRuleForm.department || "").trim(),
      assignedOrgAdmin: String(whatsappRuleForm.assignedOrgAdmin || "").trim(),
      priority: String(whatsappRuleForm.priority || "High").trim(),
      triggerStatus: String(whatsappRuleForm.triggerStatus || "Active").trim(),
      clientMessageTemplate: String(whatsappRuleForm.clientMessageTemplate || "").trim(),
      internalNotes: String(whatsappRuleForm.internalNotes || "").trim(),
    };
    if (!payload.eventName || !payload.department || !payload.assignedOrgAdmin) {
      setState((prev) => ({ ...prev, error: "Event, department, and assigned org admin are required." }));
      return;
    }
    if (payload.department === "Client" && !payload.clientMessageTemplate) {
      setState((prev) => ({ ...prev, error: "Client WhatsApp message is required when department is Client." }));
      return;
    }
    setState((prev) => ({ ...prev, error: "" }));
    setWhatsappEventRules((prev) => {
      if (editingWhatsappRuleId) {
        return prev.map((row) =>
          row.id === editingWhatsappRuleId ? { ...row, ...payload, updatedAt: new Date().toISOString() } : row
        );
      }
      return [
        {
          id: `wa_rule_${Date.now()}`,
          ...payload,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        ...prev,
      ];
    });
    resetWhatsappRuleForm();
  }

  function handleEditWhatsappRule(row) {
    setEditingWhatsappRuleId(row.id);
    setWhatsappRuleForm({
      eventName: row.eventName || "",
      department: row.department || "HR",
      assignedOrgAdmin: row.assignedOrgAdmin || (orgAdminAssigneeOptions[0] || "Org Admin"),
      priority: row.priority || "High",
      triggerStatus: row.triggerStatus || "Active",
      clientMessageTemplate: row.clientMessageTemplate || "",
      internalNotes: row.internalNotes || "",
    });
  }

  function handleDeleteWhatsappRule(rowId) {
    setWhatsappEventRules((prev) => prev.filter((row) => row.id !== rowId));
    if (editingWhatsappRuleId === rowId) {
      resetWhatsappRuleForm();
    }
    if (viewWhatsappRule?.id === rowId) {
      setViewWhatsappRule(null);
    }
  }

  return (
    <div className="wz-profile-workspace">
      <h2 className="page-title">Profile</h2>
      <hr className="section-divider" />
      {!isBusinessAutopilotOrgUser ? (
        <div className="d-flex flex-wrap gap-2 mb-3">
          <button
            type="button"
            className={`btn btn-sm ${profileTopTab === "profile" ? "btn-primary" : "btn-outline-light"}`}
            onClick={() => setProfileTopTab("profile")}
          >
            Profile
          </button>
          <button
            type="button"
            className={`btn btn-sm ${profileTopTab === "companyProfile" ? "btn-primary" : "btn-outline-light"}`}
            onClick={() => setProfileTopTab("companyProfile")}
          >
            Company Profile
          </button>
          <button
            type="button"
            className={`btn btn-sm ${profileTopTab === "uiTheme" ? "btn-primary" : "btn-outline-light"}`}
            onClick={() => setProfileTopTab("uiTheme")}
          >
            UI Theme
          </button>
          <button
            type="button"
            className={`btn btn-sm ${profileTopTab === "backup" ? "btn-primary" : "btn-outline-light"}`}
            onClick={() => setProfileTopTab("backup")}
          >
            Backup
          </button>
          <button
            type="button"
            className={`btn btn-sm ${profileTopTab === "referral" ? "btn-primary" : "btn-outline-light"}`}
            onClick={() => setProfileTopTab("referral")}
          >
            Referral Program
          </button>
          <button
            type="button"
            className={`btn btn-sm ${profileTopTab === "whatsappApi" ? "btn-primary" : "btn-outline-light"}`}
            onClick={() => setProfileTopTab("whatsappApi")}
          >
            WhatsApp API
          </button>
          {isBusinessAutopilotOrgAdmin ? (
            <button
              type="button"
              className={`btn btn-sm ${profileTopTab === "openAiApi" ? "btn-primary" : "btn-outline-light"}`}
              onClick={() => setProfileTopTab("openAiApi")}
            >
              Open AI API
            </button>
          ) : null}
          {isOrgAdminProfile && data.org?.id ? (
            <button
              type="button"
              className={`btn btn-sm ${profileTopTab === "security" ? "btn-primary" : "btn-outline-light"}`}
              onClick={() => setProfileTopTab("security")}
            >
              Security
            </button>
          ) : null}
          <button
            type="button"
            className={`btn btn-sm ${profileTopTab === "tickets" ? "btn-primary" : "btn-outline-light"}`}
            onClick={() => setProfileTopTab("tickets")}
          >
            Create Ticket
          </button>
        </div>
      ) : null}

      {notice ? <div className="alert alert-success">{notice}</div> : null}
      {state.error ? <div className="alert alert-danger">{state.error}</div> : null}
      {companyProfileError ? <div className="alert alert-danger">{companyProfileError}</div> : null}

      {isBusinessAutopilotOrgUser ? (
        <div className="row g-3 mt-1">
          <div className="col-12 col-xl-5">
            <div className="d-flex flex-column gap-3 h-100">
              <div className="card p-3">
                <div className="wz-profile-photo-card">
                  <div className="wz-profile-photo-card__preview">
                    {profilePhotoUrl ? (
                      <img src={profilePhotoUrl} alt="Profile" className="wz-profile-photo-card__image" />
                    ) : (
                      <div className="wz-profile-photo-card__fallback">{profilePhotoFallback}</div>
                    )}
                  </div>
                  <div className="wz-profile-photo-card__body">
                    <h5 className="mb-1">Profile Photo <span className="text-secondary">(Recommended size: 250x250px. Maximum file size: 500KB.)</span></h5>
                    <div className="wz-profile-photo-card__actions">
                      <label className="btn btn-primary btn-sm wz-profile-photo-card__upload-btn">
                        {photoUploadState.loading ? "Uploading..." : "Upload Photo"}
                        <input type="file" accept="image/*" className="d-none" onChange={handleProfilePhotoChange} disabled={photoUploadState.loading} />
                      </label>
                    </div>
                    {photoUploadState.error ? <div className="text-danger small mt-2">{photoUploadState.error}</div> : null}
                    {photoUploadState.success ? <div className="text-success small mt-2">{photoUploadState.success}</div> : null}
                  </div>
                </div>
              </div>
              <div className="card p-3 h-100">
                <h5>Update Password</h5>
                <p className="text-secondary mb-3">Use this page to change your login password.</p>
                <form onSubmit={handlePasswordSubmit}>
                  <div className="mb-2">
                    <label className="form-label">Current Password</label>
                    <input
                      type="password"
                      className="form-control"
                      value={currentPassword}
                      onChange={(event) => setCurrentPassword(event.target.value)}
                      required
                    />
                  </div>
                  <div className="mb-2">
                    <label className="form-label">New Password</label>
                    <input
                      type="password"
                      className="form-control"
                      value={newPassword}
                      onChange={(event) => setNewPassword(event.target.value)}
                      required
                    />
                  </div>
                  <div className="mb-3">
                    <label className="form-label">Confirm New Password</label>
                    <input
                      type="password"
                      className="form-control"
                      value={confirmPassword}
                      onChange={(event) => setConfirmPassword(event.target.value)}
                      required
                    />
                  </div>
                  <button className="btn btn-warning btn-sm">Update Password</button>
                </form>
              </div>
            </div>
          </div>
          <div className="col-12 col-xl-7">
            <div className="d-flex flex-column gap-3 h-100">
              <div className="d-flex flex-wrap gap-2">
                <button
                  type="button"
                  className={`btn btn-sm ${orgUserTab === "profile" ? "btn-primary" : "btn-outline-light"}`}
                  onClick={() => setOrgUserTab("profile")}
                >
                  Profile Details
                </button>
                <button
                  type="button"
                  className={`btn btn-sm ${orgUserTab === "employee" ? "btn-primary" : "btn-outline-light"}`}
                  onClick={() => setOrgUserTab("employee")}
                >
                  Employee Details
                </button>
              </div>
              {orgUserTab === "profile" ? (
                <>
                  <div className="card p-3">
                    <h5>Profile Details</h5>
                    <div className="row g-3 mt-1">
                      <div className="col-12 col-md-6">
                        <label className="form-label small mb-1">First Name</label>
                        <input className="form-control" value={user.first_name || employeeProfile?.name?.split(" ")?.[0] || "-"} readOnly />
                      </div>
                      <div className="col-12 col-md-6">
                        <label className="form-label small mb-1">Last Name</label>
                        <input className="form-control" value={user.last_name || employeeProfile?.name?.split(" ").slice(1).join(" ") || "-"} readOnly />
                      </div>
                      <div className="col-12 col-md-6">
                        <label className="form-label small mb-1">Email</label>
                        <input className="form-control" value={user.email || employeeProfile?.sourceUserEmail || "-"} readOnly />
                      </div>
                      <div className="col-12 col-md-6">
                        <label className="form-label small mb-1">Phone Number</label>
                        <input
                          className="form-control"
                          value={(phoneNumber ? profilePhoneDisplay : "") || employeeProfile?.contactNumberFull || "-"}
                          readOnly
                        />
                      </div>
                      <div className="col-12 col-md-6">
                        <label className="form-label small mb-1">Role</label>
                        <input className="form-control" value={data.profile?.role_label || "Org User"} readOnly />
                      </div>
                      <div className="col-12 col-md-6">
                        <label className="form-label small mb-1">Organization</label>
                        <input className="form-control" value={data.profile?.organization?.name || data.org?.name || "-"} readOnly />
                      </div>
                    </div>
                  </div>
                  <div className="card p-3">
                    <div className="d-flex align-items-center justify-content-between gap-2 mb-2">
                      <div>
                        <h5 className="mb-1">Personal Theme</h5>
                        <p className="text-secondary mb-0">These color and menu settings work only for your login.</p>
                      </div>
                      <button type="button" className="btn btn-outline-light btn-sm" onClick={handleResetPersonalTheme}>
                        Reset
                      </button>
                    </div>
                    <form onSubmit={handlePersonalThemeSubmit}>
                      <div className="row g-3">
                        <div className="col-12 col-md-6">
                          <label className="form-label small mb-1">Primary Color</label>
                          <div className="input-group">
                            <input
                              type="color"
                              className="form-control form-control-color"
                              value={normalizeHexColor(themePrimary, themeDefaults.primary)}
                              onChange={(event) => setThemePrimary(event.target.value)}
                              title="Primary color"
                            />
                            <input
                              type="text"
                              className="form-control"
                              value={themePrimary}
                              onChange={(event) => setThemePrimary(event.target.value)}
                              placeholder="#e11d48"
                            />
                          </div>
                        </div>
                        <div className="col-12 col-md-6">
                          <label className="form-label small mb-1">Secondary Color</label>
                          <div className="input-group">
                            <input
                              type="color"
                              className="form-control form-control-color"
                              value={normalizeHexColor(themeSecondary, themeDefaults.secondary)}
                              onChange={(event) => setThemeSecondary(event.target.value)}
                              title="Secondary color"
                            />
                            <input
                              type="text"
                              className="form-control"
                              value={themeSecondary}
                              onChange={(event) => setThemeSecondary(event.target.value)}
                              placeholder="#f59e0b"
                            />
                          </div>
                        </div>
                        <div className="col-12">
                          <label className="form-label small mb-2">Menu Style</label>
                          <div className="d-flex flex-wrap gap-2">
                            <button
                              type="button"
                              className={`btn btn-sm ${sidebarMenuStyle === "default" ? "btn-primary" : "btn-outline-light"}`}
                              onClick={() => setSidebarMenuStyle("default")}
                            >
                              Default Menu
                            </button>
                            <button
                              type="button"
                              className={`btn btn-sm ${sidebarMenuStyle === "compact" ? "btn-primary" : "btn-outline-light"}`}
                              onClick={() => setSidebarMenuStyle("compact")}
                            >
                              Compact Center Menu
                            </button>
                          </div>
                        </div>
                      </div>
                      <div className="mt-3">
                        <button className="btn btn-primary btn-sm" type="submit">Save My Theme</button>
                      </div>
                    </form>
                  </div>
                </>
              ) : (
                <div className="card p-3">
                  <div className="d-flex align-items-center justify-content-between gap-2 mb-2">
                    <div>
                      <h5 className="mb-1">Employee Details</h5>
                      <p className="text-secondary mb-0">These details come from the HR employee entry form.</p>
                    </div>
                  </div>
                  {employeeProfile ? (
                    <div className="row g-3 mt-1">
                      {PROFILE_EMPLOYEE_DETAILS_FIELDS.map(([label, key]) => (
                        <div key={key} className="col-12 col-md-6">
                          <label className="form-label small mb-1">{label}</label>
                          <input className="form-control" value={String(employeeProfile?.[key] || "-")} readOnly />
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-secondary">HR employee details are not available yet. Once the employee form is completed in the HR section, the details will appear here.</div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {!isBusinessAutopilotOrgUser && profileTopTab === "profile" ? (
      <div className="row g-3 mt-1">
        <div className="col-12">
          <div className="card p-3 h-100">
            <h5>Account</h5>
            <p>
              <strong>Username:</strong> {user.username || "-"}
            </p>

            <div className="wz-profile-photo-card mb-3">
              <div className="wz-profile-photo-card__preview">
                {profilePhotoUrl ? (
                  <img src={profilePhotoUrl} alt="Profile" className="wz-profile-photo-card__image" />
                ) : (
                  <div className="wz-profile-photo-card__fallback">{profilePhotoFallback}</div>
                )}
              </div>
              <div className="wz-profile-photo-card__body">
                <h6 className="mb-1">Profile Photo <span className="text-secondary">(Recommended size: 250x250px. Maximum file size: 500KB.)</span></h6>
                <div className="wz-profile-photo-card__actions">
                  <label className="btn btn-primary btn-sm wz-profile-photo-card__upload-btn">
                    {photoUploadState.loading ? "Uploading..." : "Upload Photo"}
                    <input type="file" accept="image/*" className="d-none" onChange={handleProfilePhotoChange} disabled={photoUploadState.loading} />
                  </label>
                </div>
                {photoUploadState.error ? <div className="text-danger small mt-2">{photoUploadState.error}</div> : null}
                {photoUploadState.success ? <div className="text-success small mt-2">{photoUploadState.success}</div> : null}
              </div>
            </div>

            <form className="mt-3" onSubmit={handleEmailSubmit}>
              <div className="row g-2 align-items-end">
                <div className={`col-12 ${showTimezone ? "col-xl-4" : "col-xl-6"}`}>
                  <label className="form-label">Email</label>
                  <input
                    type="email"
                    className="form-control"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    required
                  />
                </div>
                <div className={`col-12 ${showTimezone ? "col-xl-4" : "col-xl-6"}`}>
                  <label className="form-label">Mobile Number</label>
                  <div className="input-group">
                    <PhoneCountryCodePicker
                      value={phoneCountry}
                      onChange={(code) => setPhoneCountry(code)}
                      options={phoneCountries}
                      style={{ maxWidth: "170px" }}
                      ariaLabel="Profile phone country code"
                    />
                    <input
                      type="tel"
                      className="form-control"
                      value={phoneNumber}
                      onChange={(event) => setPhoneNumber(event.target.value)}
                      placeholder="Phone number"
                    />
                  </div>
                </div>
                {showTimezone ? (
                  <div className="col-12 col-xl-4">
                    <label className="form-label">Organization Timezone</label>
                    <select
                      className="form-select"
                      value={orgTimezone}
                      onChange={(event) => setOrgTimezone(event.target.value)}
                    >
                      {tzList.map((tz) => (
                        <option key={tz.value} value={tz.value}>
                          {tz.label}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : null}
              </div>
              <div className="d-flex flex-wrap gap-2 mt-3">
                <button className="btn btn-primary btn-sm">Update Details</button>
                <button
                  type="button"
                  className="btn btn-outline-primary btn-sm"
                  onClick={() => setPasswordResetModalOpen(true)}
                >
                  Password Reset
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
      ) : null}

      {passwordResetModalOpen ? (
        <div className="modal-overlay" role="dialog" aria-modal="true" onClick={() => setPasswordResetModalOpen(false)}>
          <div className="modal-panel" style={{ width: "min(520px, 92vw)" }} onClick={(event) => event.stopPropagation()}>
            <div className="d-flex align-items-start justify-content-between gap-3 mb-3">
              <div>
                <h5 className="mb-1">Password Reset</h5>
                <div className="small text-secondary">Update your login password.</div>
              </div>
              <button type="button" className="btn btn-sm btn-outline-light" onClick={() => setPasswordResetModalOpen(false)}>
                <i className="bi bi-x-lg" aria-hidden="true" />
              </button>
            </div>
            <form onSubmit={handlePasswordSubmit}>
              <div className="mb-2">
                <label className="form-label">Current Password</label>
                <input
                  type="password"
                  className="form-control"
                  value={currentPassword}
                  onChange={(event) => setCurrentPassword(event.target.value)}
                  required
                />
              </div>
              <div className="mb-2">
                <label className="form-label">New Password</label>
                <input
                  type="password"
                  className="form-control"
                  value={newPassword}
                  onChange={(event) => setNewPassword(event.target.value)}
                  required
                />
              </div>
              <div className="mb-3">
                <label className="form-label">Confirm New Password</label>
                <input
                  type="password"
                  className="form-control"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  required
                />
              </div>
              <div className="d-flex justify-content-end gap-2">
                <button type="button" className="btn btn-outline-light btn-sm" onClick={() => setPasswordResetModalOpen(false)}>
                  Cancel
                </button>
                <button className="btn btn-warning btn-sm" type="submit">Update Password</button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {profileTopTab === "companyProfile" ? (
      <div className="mt-3">
        <div className="card p-3">
          <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-3">
            <div>
              <h5 className="mb-1">Company Profile</h5>
              <p className="text-secondary mb-0">Manage company identity, address, GST, currency, and timezone for your organization.</p>
            </div>
          </div>
          {companyProfileLoading ? (
            <div className="text-secondary">Loading company profile...</div>
          ) : (
            <form className="d-flex flex-column gap-3" onSubmit={handleCompanyProfileSubmit}>
              <div className="row g-3">
                <div className="col-12 col-xl-6">
                  <label className="form-label">Company Name</label>
                  <input
                    className="form-control"
                    value={companyProfileForm.company_name || ""}
                    onChange={(event) => setCompanyProfileForm((prev) => ({ ...prev, company_name: event.target.value }))}
                    required
                  />
                </div>
                <div className="col-12 col-xl-3">
                  <label className="form-label">GST</label>
                  <input
                    className="form-control"
                    value={companyProfileForm.gstin || ""}
                    onChange={(event) => setCompanyProfileForm((prev) => ({ ...prev, gstin: event.target.value.toUpperCase() }))}
                    placeholder="GSTIN"
                  />
                </div>
                <div className="col-12 col-xl-3">
                  <label className="form-label">Currency</label>
                  <select
                    className="form-select"
                    value={companyProfileForm.currency || "INR"}
                    onChange={(event) => setCompanyProfileForm((prev) => ({ ...prev, currency: event.target.value }))}
                  >
                    {COMPANY_PROFILE_CURRENCIES.map((currency) => (
                      <option key={`company-currency-${currency}`} value={currency}>{currency}</option>
                    ))}
                  </select>
                </div>
                <div className="col-12">
                  <label className="form-label">Address</label>
                  <input
                    className="form-control"
                    value={companyProfileForm.address_line1 || ""}
                    onChange={(event) => setCompanyProfileForm((prev) => ({ ...prev, address_line1: event.target.value }))}
                    placeholder="Company address"
                    required
                  />
                </div>
                <div className="col-12 col-md-6 col-xl-3">
                  <label className="form-label">Country</label>
                  <input
                    className="form-control"
                    value={companyProfileForm.country || ""}
                    onChange={(event) => setCompanyProfileForm((prev) => ({ ...prev, country: event.target.value }))}
                    required
                  />
                </div>
                <div className="col-12 col-md-6 col-xl-3">
                  <label className="form-label">State</label>
                  <input
                    className="form-control"
                    value={companyProfileForm.state || ""}
                    onChange={(event) => setCompanyProfileForm((prev) => ({ ...prev, state: event.target.value }))}
                    required
                  />
                </div>
                <div className="col-12 col-md-6 col-xl-3">
                  <label className="form-label">City</label>
                  <input
                    className="form-control"
                    value={companyProfileForm.city || ""}
                    onChange={(event) => setCompanyProfileForm((prev) => ({ ...prev, city: event.target.value }))}
                    required
                  />
                </div>
                <div className="col-12 col-md-6 col-xl-3">
                  <label className="form-label">Pincode</label>
                  <input
                    className="form-control"
                    value={companyProfileForm.postal_code || ""}
                    onChange={(event) => setCompanyProfileForm((prev) => ({ ...prev, postal_code: event.target.value }))}
                    required
                  />
                </div>
                <div className="col-12 col-md-6">
                  <label className="form-label">Mobile Number</label>
                  <div className="input-group">
                    <PhoneCountryCodePicker
                      value={companyProfileForm.mobile_phone_country || "+91"}
                      onChange={(code) => setCompanyProfileForm((prev) => ({ ...prev, mobile_phone_country: code }))}
                      options={phoneCountries}
                      style={{ maxWidth: "170px" }}
                      ariaLabel="Company mobile country code"
                    />
                    <input
                      type="tel"
                      className="form-control"
                      value={companyProfileForm.mobile_phone || ""}
                      onChange={(event) => setCompanyProfileForm((prev) => ({ ...prev, mobile_phone: event.target.value }))}
                      placeholder="Mobile number"
                    />
                  </div>
                </div>
                <div className="col-12 col-md-6">
                  <label className="form-label">Phone Number</label>
                  <div className="input-group">
                    <PhoneCountryCodePicker
                      value={companyProfileForm.phone_country || "+91"}
                      onChange={(code) => setCompanyProfileForm((prev) => ({ ...prev, phone_country: code }))}
                      options={phoneCountries}
                      style={{ maxWidth: "170px" }}
                      ariaLabel="Company phone country code"
                    />
                    <input
                      type="tel"
                      className="form-control"
                      value={companyProfileForm.phone || ""}
                      onChange={(event) => setCompanyProfileForm((prev) => ({ ...prev, phone: event.target.value }))}
                      placeholder="Phone number"
                    />
                  </div>
                </div>
                <div className="col-12">
                  <label className="form-label">Timezone</label>
                  <select
                    className="form-select"
                    value={companyProfileForm.timezone || "UTC"}
                    onChange={(event) => setCompanyProfileForm((prev) => ({ ...prev, timezone: event.target.value }))}
                  >
                    {tzList.map((tz) => (
                      <option key={`company-profile-tz-${tz.value}`} value={tz.value}>{tz.label}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="d-flex gap-2">
                <button className="btn btn-primary btn-sm" type="submit">Save Company Profile</button>
              </div>
            </form>
          )}
        </div>
      </div>
      ) : null}

      {profileTopTab === "uiTheme" ? (
      <div className="mt-3">
        <div className="card p-3">
          <h5 className="mb-2">UI Theme</h5>
          <p className="text-secondary mb-3">Manage theme colors and sidebar menu selection globally for your organization.</p>
          <form onSubmit={handleUiThemeSubmit}>
            <div className="d-flex align-items-center justify-content-between gap-2 mb-2">
              <label className="form-label mb-0">UI Theme Colors (All Products)</label>
              <button
                type="button"
                className="btn btn-outline-light btn-sm"
                onClick={() => {
                  setThemePrimary(themeDefaults.primary);
                  setThemeSecondary(themeDefaults.secondary);
                }}
              >
                Use Defaults
              </button>
            </div>
            <div className="row g-2">
              <div className="col-12 col-md-6">
                <label className="form-label small mb-1">Primary Color</label>
                <div className="input-group">
                  <input
                    type="color"
                    className="form-control form-control-color"
                    value={normalizeHexColor(themePrimary, themeDefaults.primary)}
                    onChange={(event) => setThemePrimary(event.target.value)}
                    title="Primary color"
                  />
                  <input
                    type="text"
                    className="form-control"
                    value={themePrimary}
                    onChange={(event) => setThemePrimary(event.target.value)}
                    placeholder="#e11d48"
                  />
                </div>
              </div>
              <div className="col-12 col-md-6">
                <label className="form-label small mb-1">Secondary Color</label>
                <div className="input-group">
                  <input
                    type="color"
                    className="form-control form-control-color"
                    value={normalizeHexColor(themeSecondary, themeDefaults.secondary)}
                    onChange={(event) => setThemeSecondary(event.target.value)}
                    title="Secondary color"
                  />
                  <input
                    type="text"
                    className="form-control"
                    value={themeSecondary}
                    onChange={(event) => setThemeSecondary(event.target.value)}
                    placeholder="#f59e0b"
                  />
                </div>
              </div>
            </div>
            <div className="form-text text-secondary mt-2">
              Org admin-selected colors apply globally across your organization dashboards in all products.
            </div>
            <div className="mt-3 pt-2 border-top">
              <label className="form-label mb-2">React UI Side Menu Style</label>
              <div className="d-flex flex-wrap gap-2">
                <button
                  type="button"
                  className={`btn btn-sm ${sidebarMenuStyle === "default" ? "btn-primary" : "btn-outline-light"}`}
                  onClick={() => setSidebarMenuStyle("default")}
                >
                  Default Menu
                </button>
                <button
                  type="button"
                  className={`btn btn-sm ${sidebarMenuStyle === "compact" ? "btn-primary" : "btn-outline-light"}`}
                  onClick={() => setSidebarMenuStyle("compact")}
                >
                  Compact Center Menu
                </button>
              </div>
              <div className="form-text text-secondary mt-2 mb-3">
                Option 2 uses reduced sidebar width, bigger centered icons/text, and icon-only light/dark toggle buttons.
              </div>
            </div>
            <button className="btn btn-primary btn-sm" type="submit">Save UI Theme</button>
          </form>
        </div>
      </div>
      ) : null}

      {profileTopTab === "openAiApi" && isBusinessAutopilotOrgAdmin ? (
      <div className="mt-3">
        <div className="card p-3">
          <div className="d-flex flex-wrap align-items-start justify-content-between gap-2 mb-3">
            <div>
              <h5 className="mb-1">Open AI API Connection</h5>
              <p className="text-secondary mb-0">
                Connect your OpenAI API key and OpenAI account email to enable the Business Autopilot dashboard chat helper.
              </p>
            </div>
            {openAiState.data?.masked_api_key ? (
              <span className="badge bg-secondary">Saved Key: {openAiState.data.masked_api_key}</span>
            ) : null}
          </div>
          {openAiState.error ? <div className="alert alert-danger py-2">{openAiState.error}</div> : null}
          {openAiState.success ? <div className="alert alert-success py-2">{openAiState.success}</div> : null}
          {openAiTestState.message ? (
            <div className={`alert py-2 ${openAiTestState.ok ? "alert-success" : "alert-danger"}`}>
              {openAiTestState.message}
            </div>
          ) : null}
          <form className="d-flex flex-column gap-3" onSubmit={handleSaveOpenAiSettings}>
            <div className="row g-3">
              <div className="col-12 col-md-6">
                <label className="form-label">AI Agent Name</label>
                <input
                  className="form-control"
                  value={openAiState.form.agent_name}
                  readOnly
                  disabled
                />
                <div className="form-text">This assistant name is fixed for all organizations.</div>
              </div>
              <div className="col-12 col-md-6">
                <label className="form-label">Model</label>
                <input
                  className="form-control"
                  value={openAiState.form.model}
                  onChange={(event) => setOpenAiState((prev) => ({
                    ...prev,
                    form: { ...prev.form, model: event.target.value },
                  }))}
                  placeholder="gpt-4o-mini"
                  required
                />
              </div>
              <div className="col-12 col-md-6">
                <label className="form-label">OpenAI Account Email</label>
                <input
                  type="email"
                  className="form-control"
                  value={openAiState.form.account_email}
                  onChange={(event) => setOpenAiState((prev) => ({
                    ...prev,
                    form: { ...prev.form, account_email: event.target.value },
                  }))}
                  placeholder="name@example.com"
                />
              </div>
              <div className="col-12 col-md-6">
                <label className="form-label">OpenAI API Key</label>
                <input
                  type="password"
                  className="form-control"
                  value={openAiState.form.api_key}
                  onChange={(event) => setOpenAiState((prev) => ({
                    ...prev,
                    form: { ...prev.form, api_key: event.target.value },
                  }))}
                  placeholder={openAiState.data?.has_api_key ? "Leave blank to keep existing key" : "sk-..."}
                />
              </div>
              <div className="col-12">
                <div className="form-check">
                  <input
                    id="ba-openai-enabled"
                    className="form-check-input"
                    type="checkbox"
                    checked={Boolean(openAiState.form.enabled)}
                    onChange={(event) => setOpenAiState((prev) => ({
                      ...prev,
                      form: { ...prev.form, enabled: event.target.checked },
                    }))}
                  />
                  <label className="form-check-label" htmlFor="ba-openai-enabled">
                    Mark dashboard AI assistant as enabled
                  </label>
                </div>
                <div className="form-text">Even without API credentials, the dashboard chat button can appear and guide you to configure OpenAI.</div>
              </div>
            </div>
            <div className="d-flex flex-wrap gap-2">
              <button className="btn btn-primary btn-sm" type="submit" disabled={openAiState.loading}>
                {openAiState.loading ? "Saving..." : "Save Open AI Settings"}
              </button>
              <button
                type="button"
                className="btn btn-outline-light btn-sm"
                onClick={handleTestOpenAiConnection}
                disabled={openAiState.loading || openAiTestState.loading}
              >
                {openAiTestState.loading ? "Testing..." : "Test Connection"}
              </button>
            </div>
          </form>
        </div>
      </div>
      ) : null}

      {profileTopTab === "whatsappApi" ? (
      <div className="mt-3">
        <h5>WhatsApp API Connection & Event Notifications</h5>
        <p className="text-secondary mb-3">
          Configure WhatsApp API connection and create important event notifications for departments (including Client).
        </p>
        {whatsappApiNotice ? <div className="alert alert-success py-2">{whatsappApiNotice}</div> : null}

        <div className="row g-3">
          <div className="col-12 col-xl-5">
            <div className="border rounded p-3 h-100">
              <div className="d-flex align-items-center justify-content-between gap-2 mb-2">
                <h6 className="mb-0">WhatsApp API Connection</h6>
                <span className={`badge ${whatsappApiConfig.status === "Connected" ? "bg-success" : "bg-secondary"}`}>
                  {whatsappApiConfig.status}
                </span>
              </div>
              <form className="d-flex flex-column gap-2" onSubmit={handleSaveWhatsappApiConfig}>
                <div>
                  <label className="form-label small mb-1">Provider</label>
                  <input
                    className="form-control"
                    value={whatsappApiConfig.providerName}
                    onChange={(event) => setWhatsappApiConfig((prev) => ({ ...prev, providerName: event.target.value }))}
                    placeholder="Meta WhatsApp Cloud API"
                  />
                </div>
                <div>
                  <label className="form-label small mb-1">API Base URL</label>
                  <input
                    className="form-control"
                    value={whatsappApiConfig.apiBaseUrl}
                    onChange={(event) => setWhatsappApiConfig((prev) => ({ ...prev, apiBaseUrl: event.target.value }))}
                    placeholder="https://graph.facebook.com/vXX.X"
                  />
                </div>
                <div>
                  <label className="form-label small mb-1">Phone Number ID</label>
                  <input
                    className="form-control"
                    value={whatsappApiConfig.phoneNumberId}
                    onChange={(event) => setWhatsappApiConfig((prev) => ({ ...prev, phoneNumberId: event.target.value }))}
                    placeholder="Enter phone number id"
                  />
                </div>
                <div>
                  <label className="form-label small mb-1">Access Token</label>
                  <input
                    className="form-control"
                    value={whatsappApiConfig.accessToken}
                    onChange={(event) => setWhatsappApiConfig((prev) => ({ ...prev, accessToken: event.target.value }))}
                    placeholder="Permanent access token"
                  />
                </div>
                <div>
                  <label className="form-label small mb-1">Webhook Verify Token</label>
                  <input
                    className="form-control"
                    value={whatsappApiConfig.webhookVerifyToken}
                    onChange={(event) => setWhatsappApiConfig((prev) => ({ ...prev, webhookVerifyToken: event.target.value }))}
                    placeholder="Webhook verify token"
                  />
                </div>
                <div className="d-flex gap-2 pt-1">
                  <button type="submit" className="btn btn-success btn-sm">Save Connection</button>
                  <button
                    type="button"
                    className="btn btn-outline-light btn-sm"
                    onClick={() => {
                      setWhatsappApiConfig(buildDefaultWhatsappApiConfig());
                      setWhatsappApiNotice("");
                    }}
                  >
                    Reset
                  </button>
                </div>
              </form>
            </div>
          </div>

          <div className="col-12 col-xl-7">
            <div className="border rounded p-3 h-100">
              <h6 className="mb-2">{editingWhatsappRuleId ? "Edit Event Notification Rule" : "Create Event Notification Rule"}</h6>
              <form className="d-flex flex-column gap-3" onSubmit={handleWhatsappRuleSubmit}>
                <div className="row g-3">
                  <div className="col-12 col-md-6">
                    <label className="form-label small mb-1">Important Event</label>
                    <select
                      className="form-select"
                      value={whatsappRuleForm.eventName}
                      onChange={(event) => setWhatsappRuleForm((prev) => ({ ...prev, eventName: event.target.value }))}
                    >
                      <option value="">Select Event</option>
                      <optgroup label="Company">
                        {WHATSAPP_COMPANY_EVENT_OPTIONS.map((item) => (
                          <option key={`company-${item}`} value={item}>{item}</option>
                        ))}
                      </optgroup>
                      <optgroup label="Client">
                        {WHATSAPP_CLIENT_EVENT_OPTIONS.map((item) => (
                          <option key={`client-${item}`} value={item}>{item}</option>
                        ))}
                      </optgroup>
                    </select>
                  </div>
                  <div className="col-12 col-md-6">
                    <label className="form-label small mb-1">Department</label>
                    <select
                      className="form-select"
                      value={whatsappRuleForm.department}
                      onChange={(event) => setWhatsappRuleForm((prev) => ({ ...prev, department: event.target.value }))}
                    >
                      {WHATSAPP_DEPARTMENTS.map((dept) => (
                        <option key={dept} value={dept}>{dept}</option>
                      ))}
                    </select>
                  </div>
                  <div className="col-12 col-md-6">
                    <label className="form-label small mb-1">Assign Org Admin</label>
                    <input
                      className="form-control datalist-readable-input"
                      list="profile-whatsapp-admin-options"
                      value={whatsappRuleForm.assignedOrgAdmin}
                      onChange={(event) => setWhatsappRuleForm((prev) => ({ ...prev, assignedOrgAdmin: event.target.value }))}
                      placeholder="Assign org admin"
                    />
                    <datalist id="profile-whatsapp-admin-options">
                      {orgAdminAssigneeOptions.map((item) => (
                        <option key={item} value={item} />
                      ))}
                    </datalist>
                  </div>
                  <div className="col-6 col-md-3">
                    <label className="form-label small mb-1">Priority</label>
                    <select
                      className="form-select"
                      value={whatsappRuleForm.priority}
                      onChange={(event) => setWhatsappRuleForm((prev) => ({ ...prev, priority: event.target.value }))}
                    >
                      <option value="High">High</option>
                      <option value="Medium">Medium</option>
                      <option value="Low">Low</option>
                    </select>
                  </div>
                  <div className="col-6 col-md-3">
                    <label className="form-label small mb-1">Status</label>
                    <select
                      className="form-select"
                      value={whatsappRuleForm.triggerStatus}
                      onChange={(event) => setWhatsappRuleForm((prev) => ({ ...prev, triggerStatus: event.target.value }))}
                    >
                      <option value="Active">Active</option>
                      <option value="Inactive">Inactive</option>
                    </select>
                  </div>
                  <div className="col-12">
                    <label className="form-label small mb-1">Client WhatsApp Message</label>
                    <textarea
                      className="form-control"
                      rows={3}
                      value={whatsappRuleForm.clientMessageTemplate}
                      onChange={(event) => setWhatsappRuleForm((prev) => ({ ...prev, clientMessageTemplate: event.target.value }))}
                      placeholder={whatsappRuleForm.department === "Client" ? "Required for Client notifications" : "Optional client-facing message template"}
                    />
                  </div>
                  <div className="col-12">
                    <label className="form-label small mb-1">Internal Notes</label>
                    <input
                      className="form-control"
                      value={whatsappRuleForm.internalNotes}
                      onChange={(event) => setWhatsappRuleForm((prev) => ({ ...prev, internalNotes: event.target.value }))}
                      placeholder="Optional notes for admin team"
                    />
                  </div>
                </div>
                <div className="d-flex gap-2">
                  <button type="submit" className="btn btn-primary btn-sm">
                    {editingWhatsappRuleId ? "Update Rule" : "Create Rule"}
                  </button>
                  <button type="button" className="btn btn-outline-light btn-sm" onClick={resetWhatsappRuleForm}>
                    Clear
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>

        <div className="d-flex flex-wrap gap-2 mt-3 mb-2">
          <button
            type="button"
            className={`btn btn-sm ${whatsappRulesTab === "company" ? "btn-primary" : "btn-outline-light"}`}
            onClick={() => setWhatsappRulesTab("company")}
          >
            Company
          </button>
          <button
            type="button"
            className={`btn btn-sm ${whatsappRulesTab === "client" ? "btn-primary" : "btn-outline-light"}`}
            onClick={() => setWhatsappRulesTab("client")}
          >
            Client
          </button>
        </div>
        <div className="table-responsive">
          <table className="table table-dark table-striped table-hover align-middle">
            <thead>
              <tr>
                <th>Event</th>
                <th>Department</th>
                <th>Assigned Org Admin</th>
                <th>Status</th>
                <th>Priority</th>
                <th>Client Message</th>
                <th className="text-end">Action</th>
              </tr>
            </thead>
            <tbody>
              {filteredWhatsappEventRules.length ? (
                filteredWhatsappEventRules.map((row) => (
                  <tr key={row.id}>
                    <td>{row.eventName || "-"}</td>
                    <td>{row.department || "-"}</td>
                    <td>{row.assignedOrgAdmin || "-"}</td>
                    <td>{row.triggerStatus || "-"}</td>
                    <td>{row.priority || "-"}</td>
                    <td>{row.clientMessageTemplate ? `${String(row.clientMessageTemplate).slice(0, 40)}${String(row.clientMessageTemplate).length > 40 ? "..." : ""}` : "-"}</td>
                    <td className="text-end">
                      <div className="d-inline-flex gap-2">
                        <button type="button" className="btn btn-outline-light btn-sm" onClick={() => setViewWhatsappRule(row)}>
                          View
                        </button>
                        <button type="button" className="btn btn-outline-info btn-sm" onClick={() => handleEditWhatsappRule(row)}>
                          Edit
                        </button>
                        <button type="button" className="btn btn-outline-danger btn-sm" onClick={() => handleDeleteWhatsappRule(row.id)}>
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="7">
                    {whatsappRulesTab === "client"
                      ? "No Client WhatsApp event notification rules yet."
                      : "No Company WhatsApp event notification rules yet."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      ) : null}

      {profileTopTab === "security" && isOrgAdminProfile ? (
      <div className="mt-3">
        <h5>Security</h5>
        <p className="text-secondary mb-3">
          Configure automatic sign-out timeout and review login activity for the last {securityRetentionDays} days.
        </p>
        <div className="row g-3">
          <div className="col-12 col-lg-4">
            <div className="h-100">
              <form className="d-flex flex-column h-100" onSubmit={handleSecuritySettingsSubmit}>
                <label className="form-label small mb-1">Session Timeout (Minutes)</label>
                <div className="row g-2 align-items-start">
                  <div className="col-9">
                    <input
                      type="number"
                      className="form-control"
                      min="1"
                      max="1440"
                      step="1"
                      value={securityTimeoutMinutes}
                      onChange={(event) => setSecurityTimeoutMinutes(event.target.value)}
                      required
                    />
                  </div>
                  <div className="col-3 text-end">
                    <button type="submit" className="btn btn-primary btn-sm" disabled={securitySaving}>
                      {securitySaving ? "Saving..." : "Save"}
                    </button>
                  </div>
                </div>
                <div className="form-text">Example: 5, 10, 30. Users are signed out after this inactive time.</div>
              </form>
            </div>
          </div>
          <div className="col-12 col-lg-8">
            <div className="h-100">
              <div className="d-flex align-items-center justify-content-between mb-2">
                <h6 className="mb-0">Login Activity</h6>
                <span className="small text-secondary">Auto-clears after {securityRetentionDays} days</span>
              </div>
              <div className="table-responsive">
                <table className="table table-dark table-striped table-hover align-middle mb-0">
                  <thead>
                    <tr>
                      <th>User</th>
                      <th>Role</th>
                      <th>Login Time</th>
                      <th>IP</th>
                    </tr>
                  </thead>
                  <tbody>
                    {securityActivityLoading ? (
                      <tr>
                        <td colSpan="4">Loading login activity...</td>
                      </tr>
                    ) : securityActivityRows.length ? (
                      securityActivityRows.map((row) => (
                        <tr key={row.id}>
                          <td>
                            <div className="fw-semibold">{row.name || row.username || "-"}</div>
                            <div className="small text-secondary">{row.email || row.username || "-"}</div>
                          </td>
                          <td>{row.role_label || "-"}</td>
                          <td>{row.login_at || "-"}</td>
                          <td>{row.ip_address || "-"}</td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan="4">No login activity in the last {securityRetentionDays} days.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      </div>
      ) : null}

      {profileTopTab === "tickets" ? (
      <div className="mt-3">
        <h5>Create Support Ticket</h5>
        <p className="text-secondary mb-3">
          Raise a Support or Sales ticket. You can track and reply in Inbox &gt; Ticket.
        </p>
        <div className="card p-3">
          <form className="d-flex flex-column gap-3" onSubmit={handleCreateSupportTicket}>
            <div className="row g-3">
              <div className="col-12 col-md-3">
                <label className="form-label small mb-1">Ticket Type</label>
                <select
                  className="form-select"
                  value={ticketForm.category}
                  onChange={(event) => setTicketForm((prev) => ({ ...prev, category: event.target.value }))}
                >
                  <option value="support">Support</option>
                  <option value="sales">Sales</option>
                </select>
              </div>
              <div className="col-12 col-md-9">
                <label className="form-label small mb-1">Subject</label>
                <input
                  type="text"
                  className="form-control"
                  value={ticketForm.subject}
                  onChange={(event) => setTicketForm((prev) => ({ ...prev, subject: event.target.value }))}
                  placeholder="Enter ticket subject"
                />
              </div>
            </div>
            <div>
              <label className="form-label small mb-1">Message</label>
              <textarea
                className="form-control"
                rows={4}
                value={ticketForm.message}
                onChange={(event) => setTicketForm((prev) => ({ ...prev, message: event.target.value }))}
                placeholder="Write your issue or request"
              />
            </div>
            <div>
              <label className="form-label small mb-1">Image Attachments</label>
              <input
                type="file"
                className="form-control"
                accept="image/*"
                multiple
                onChange={(event) => {
                  const files = Array.from(event.target.files || []);
                  setTicketForm((prev) => ({ ...prev, files }));
                }}
              />
              <div className="form-text">Maximum 5 images. Each image must be 2MB or smaller.</div>
            </div>
            {ticketState.error ? <div className="alert alert-danger py-2 mb-0">{ticketState.error}</div> : null}
            {ticketState.success ? <div className="alert alert-success py-2 mb-0">{ticketState.success}</div> : null}
            <div>
              <button type="submit" className="btn btn-primary btn-sm" disabled={ticketState.saving}>
                {ticketState.saving ? "Creating..." : "Create Ticket"}
              </button>
            </div>
          </form>
        </div>
      </div>
      ) : null}

      {profileTopTab === "backup" ? (
      <div className="mt-3">
        <h5>Downloads & Backups</h5>
        <p className="text-secondary">
          Generate a downloadable backup of your organization&apos;s data.
        </p>
        <div className="mb-2">
          <a className="btn btn-outline-light btn-sm" href="/app/backup-history">
            View Full History
          </a>
        </div>
        {backupNotice ? <div className="alert alert-success">{backupNotice}</div> : null}
        {backupError ? <div className="alert alert-danger">{backupError}</div> : null}

        <div className="row g-3 align-items-end">
          <div className="col-12 col-md-4">
            <label className="form-label">Product</label>
            <select
              className="form-select"
              value={backupProductSlug}
              onChange={(event) => setBackupProductSlug(event.target.value)}
            >
              {backupProducts.length ? (
                backupProducts.map((product) => (
                  <option key={product.slug} value={product.slug}>
                    {product.name}
                  </option>
                ))
              ) : (
                <option value="">No products</option>
              )}
            </select>
          </div>
          <div className="col-12 col-md-4">
            <button
              type="button"
              className="btn btn-primary"
              onClick={handleGenerateBackup}
              disabled={backupActionLoading || !backupProductSlug}
            >
              {backupActionLoading ? "Generating..." : "Generate Backup"}
            </button>
          </div>
        </div>

        <div className="table-responsive mt-3">
          <table className="table table-dark table-striped table-hover align-middle">
            <thead>
              <tr>
                <th>Product</th>
                <th>Status</th>
                <th>Size</th>
                <th>Created</th>
                <th>Expires</th>
                <th>Download</th>
              </tr>
            </thead>
            <tbody>
              {backupLoading ? (
                <tr>
                  <td colSpan="6">Loading backups...</td>
                </tr>
              ) : backupItems.length ? (
                backupItems.map((item) => (
                  <tr key={item.id}>
                    <td>{item.product_name || "-"}</td>
                    <td>{item.status || "-"}</td>
                    <td>{item.size_bytes ? `${(item.size_bytes / (1024 * 1024)).toFixed(2)} MB` : "-"}</td>
                    <td>{item.completed_at || item.requested_at || "-"}</td>
                    <td>{item.expires_at || "-"}</td>
                    <td>
                      {item.can_download && item.download_url ? (
                        <a className="btn btn-sm btn-outline-light" href={item.download_url}>
                          Download
                        </a>
                      ) : (
                        "-"
                      )}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="6">No backups yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      ) : null}

      {profileTopTab === "referral" ? (
      <div className="mt-3">
        <h5>Referral Program</h5>
        <p>
          <strong>Commission Rate:</strong> {referral.commission_rate ?? 0}%
        </p>
        {referral.subscription_amount ? (
          <p>
            <strong>Subscription Amount:</strong> {referral.subscription_amount}
          </p>
        ) : null}
        <div className="row g-3">
          <div className="col-12 col-md-4">
            <label className="form-label">Referral Code</label>
            <input
              type="text"
              className="form-control"
              value={referral.code || ""}
              readOnly
            />
          </div>
          <div className="col-12 col-md-8">
            <label className="form-label">Referral Link</label>
            <input
              type="text"
              className="form-control"
              value={referral.link || ""}
              readOnly
            />
          </div>
        </div>
      </div>
      ) : null}

      {profileTopTab === "referral" ? (
      <div className="mt-3">
        <h5>Referral Income</h5>
        <div className="table-responsive">
          <table className="table table-dark table-striped table-hover align-middle mt-2">
            <thead>
              <tr>
                <th>Company / Dealer</th>
                <th>Transfer</th>
                <th>Base Amount</th>
                <th>Rate</th>
                <th>Commission</th>
                <th>Flat Amount</th>
                <th>Status</th>
                <th>Payout Ref</th>
                <th>Payout Date</th>
              </tr>
            </thead>
            <tbody>
              {referralEarnings.length ? (
                referralEarnings.map((row) => (
                  <tr key={row.id}>
                    <td>{row.referred_org || row.referred_dealer || "-"}</td>
                    <td>{row.transfer_id || "-"}</td>
                    <td>{row.base_amount ?? "-"}</td>
                    <td>{row.commission_rate ?? 0}%</td>
                    <td>{row.commission_amount ?? "-"}</td>
                    <td>{row.flat_amount ?? "-"}</td>
                    <td>{row.status || "-"}</td>
                    <td>{row.payout_reference || "-"}</td>
                    <td>{row.payout_date || "-"}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="9">No referral income yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      ) : null}

      {!isBusinessAutopilotOrgUser && profileTopTab === "profile" ? (
      <div className="mt-3">
        <h5>Admin Activity</h5>
        <div className="table-controls">
          <div className="table-length">Show {pageSize} entries</div>
          <label className="table-search" htmlFor="profile-admin-search">
            <span>Search:</span>
            <input
              id="profile-admin-search"
              type="text"
              value={tableSearchTerm}
              onChange={(event) => setTableSearchTerm(event.target.value)}
              placeholder="Search activity"
            />
          </label>
        </div>
        <div className="table-responsive">
          <table className="table table-dark table-striped table-hover align-middle mt-2">
            <thead>
              <tr>
                <th>Time</th>
                <th>Action</th>
                <th>Users</th>
                <th>Details</th>
              </tr>
            </thead>
            <tbody>
              {recentActions.length ? (
                recentActions.map((log, idx) => {
                  const users = Array.isArray(log.employees) ? log.employees : [];
                  return (
                    <tr key={`${log.time}-${idx}`}>
                      <td>{log.time}</td>
                      <td>{log.action}</td>
                      <td>
                        {users.length === 1 ? (
                          users[0]
                        ) : users.length > 1 ? (
                          <button
                            type="button"
                            className="btn btn-link text-info p-0 history-trigger"
                            onClick={() => openUsersModal(users)}
                          >
                            View Users Details
                          </button>
                        ) : (
                          "-"
                        )}
                      </td>
                      <td>{log.details || "-"}</td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan="4">No recent activity.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="table-footer">
          <div className="table-info">
            Showing {startEntry} to {endEntry} of {totalItems} entries
          </div>
          <TablePagination
            page={currentPage}
            totalPages={pagination.total_pages || 1}
            onPageChange={setAdminPage}
            showPageLinks
            showPageLabel={false}
            maxPageLinks={7}
          />
        </div>
      </div>
      ) : null}

      {isBusinessAutopilotOrgUser ? (
        <div className="mt-3">
          <h5>Your Activity</h5>
          <div className="table-controls">
            <div className="table-length">Show {pageSize} entries</div>
            <label className="table-search" htmlFor="profile-user-search">
              <span>Search:</span>
              <input
                id="profile-user-search"
                type="text"
                value={tableSearchTerm}
                onChange={(event) => setTableSearchTerm(event.target.value)}
                placeholder="Search activity"
              />
            </label>
          </div>
          <div className="table-responsive">
            <table className="table table-dark table-striped table-hover align-middle mt-2">
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Action</th>
                  <th>Details</th>
                </tr>
              </thead>
              <tbody>
                {recentActions.length ? (
                  recentActions.map((log, idx) => (
                    <tr key={`${log.time}-${idx}`}>
                      <td>{log.time}</td>
                      <td>{log.action}</td>
                      <td>{log.details || "-"}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan="3">No recent activity.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="table-footer">
            <div className="table-info">
              Showing {startEntry} to {endEntry} of {totalItems} entries
            </div>
            <TablePagination
              page={currentPage}
              totalPages={pagination.total_pages || 1}
              onPageChange={setAdminPage}
              showPageLinks
              showPageLabel={false}
              maxPageLinks={7}
            />
          </div>
        </div>
      ) : null}

      {usersModal.open ? (
        <div
          className="modal-overlay"
          onClick={() => setUsersModal({ open: false, users: [] })}
        >
          <div className="modal-panel" onClick={(event) => event.stopPropagation()}>
            <h5>Users Details</h5>
            <div className="table-responsive">
              <table className="table table-dark table-striped align-middle mb-0">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Employee</th>
                  </tr>
                </thead>
                <tbody>
                  {usersModal.users.map((name, index) => (
                    <tr key={`${name}-${index}`}>
                      <td>{index + 1}</td>
                      <td>{name}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="d-flex justify-content-end mt-3">
              <button
                className="modal-close"
                type="button"
                onClick={() => setUsersModal({ open: false, users: [] })}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {viewWhatsappRule ? (
        <div className="modal-overlay" onClick={() => setViewWhatsappRule(null)}>
          <div className="modal-panel" onClick={(event) => event.stopPropagation()}>
            <h5>WhatsApp Event Rule Details</h5>
            <div className="table-responsive">
              <table className="table table-dark table-striped align-middle mb-0">
                <tbody>
                  <tr><th style={{ width: 220 }}>Event</th><td>{viewWhatsappRule.eventName || "-"}</td></tr>
                  <tr><th>Department</th><td>{viewWhatsappRule.department || "-"}</td></tr>
                  <tr><th>Assigned Org Admin</th><td>{viewWhatsappRule.assignedOrgAdmin || "-"}</td></tr>
                  <tr><th>Status</th><td>{viewWhatsappRule.triggerStatus || "-"}</td></tr>
                  <tr><th>Priority</th><td>{viewWhatsappRule.priority || "-"}</td></tr>
                  <tr><th>Client WhatsApp Message</th><td style={{ whiteSpace: "pre-wrap" }}>{viewWhatsappRule.clientMessageTemplate || "-"}</td></tr>
                  <tr><th>Internal Notes</th><td>{viewWhatsappRule.internalNotes || "-"}</td></tr>
                  <tr><th>Created</th><td>{viewWhatsappRule.createdAt || "-"}</td></tr>
                  <tr><th>Updated</th><td>{viewWhatsappRule.updatedAt || "-"}</td></tr>
                </tbody>
              </table>
            </div>
            <div className="d-flex justify-content-end mt-3">
              <button className="modal-close" type="button" onClick={() => setViewWhatsappRule(null)}>
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
