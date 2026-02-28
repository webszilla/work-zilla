import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "../lib/api.js";
import { PHONE_COUNTRIES } from "../lib/phoneCountries.js";
import TablePagination from "../components/TablePagination.jsx";
import { setOrgTimezone as applyOrgTimezone } from "../lib/datetime.js";
import { TIMEZONE_OPTIONS, getBrowserTimezone } from "../lib/timezones.js";

const emptyState = {
  loading: true,
  error: "",
  data: null
};
const PROFILE_WHATSAPP_CONFIG_KEY = "wz_profile_whatsapp_api_config";
const PROFILE_WHATSAPP_RULES_KEY = "wz_profile_whatsapp_event_rules";
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

const phoneCountries = PHONE_COUNTRIES;
export default function ProfilePage() {
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
  const [profileTopTab, setProfileTopTab] = useState("profile");
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
    } catch (error) {
      setState((prev) => ({
        ...prev,
        error: error?.message || "Unable to update UI theme."
      }));
    }
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
    } catch (error) {
      setState((prev) => ({
        ...prev,
        error: error?.message || "Unable to update password."
      }));
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

  const data = state.data || {};
  const user = data.user || {};
  const recentActions = data.recent_actions || [];
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
      </div>

      {notice ? <div className="alert alert-success">{notice}</div> : null}
      {state.error ? <div className="alert alert-danger">{state.error}</div> : null}

      {profileTopTab === "profile" ? (
      <div className="row g-3 mt-1">
        <div className="col-12 col-lg-6">
          <div className="card p-3 h-100">
            <h5>Account</h5>
            <p>
              <strong>Username:</strong> {user.username || "-"}
            </p>

            <form className="mt-3" onSubmit={handleEmailSubmit}>
              <div className="mb-2">
                <label className="form-label">Email</label>
                <input
                  type="email"
                  className="form-control"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  required
                />
              </div>
              <div className="mb-2">
                <label className="form-label">Mobile Number</label>
                <div className="input-group">
                  <select
                    className="form-select"
                    value={phoneCountry}
                    onChange={(event) => setPhoneCountry(event.target.value)}
                    style={{ maxWidth: "170px" }}
                  >
                    {phoneCountries.map((entry) => (
                      <option key={`${entry.code}-${entry.label}`} value={entry.code}>
                        {entry.label} {entry.code}
                      </option>
                    ))}
                  </select>
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
                <div className="mb-2">
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
              <button className="btn btn-primary btn-sm">Update Details</button>
            </form>
          </div>
        </div>

        <div className="col-12 col-lg-6">
          <div className="card p-3 h-100">
            <h5>Update Password</h5>
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
              <div className="mb-2">
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

      {profileTopTab === "profile" ? (
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
