import { Suspense, lazy, useCallback, useEffect, useMemo, useState } from "react";
import {
  BrowserRouter,
  Routes,
  Route,
  Link,
  NavLink,
  Navigate,
  useNavigate,
  useLocation
} from "react-router-dom";
import DashboardPage from "./pages/DashboardPage.jsx";
import EmployeesPage from "./pages/EmployeesPage.jsx";
import EmployeeDetail from "./pages/EmployeeDetail.jsx";
import EmployeeForm from "./pages/EmployeeForm.jsx";
import ScreenshotsPage from "./pages/ScreenshotsPage.jsx";
import LiveActivityPage from "./pages/LiveActivityPage.jsx";
import WorkActivityLogPage from "./pages/WorkActivityLogPage.jsx";
import AppUsagePage from "./pages/AppUsagePage.jsx";
import AppUrlsPage from "./pages/AppUrlsPage.jsx";
import GamingOttUsagePage from "./pages/GamingOttUsagePage.jsx";
import CompanySettingsPage from "./pages/CompanySettingsPage.jsx";
import PrivacySettingsPage from "./pages/PrivacySettingsPage.jsx";
import CompanyEditPage from "./pages/CompanyEditPage.jsx";
import BillingPage from "./pages/BillingPage.jsx";
import PlansPage from "./pages/PlansPage.jsx";
import ProfilePage from "./pages/ProfilePage.jsx";
import BankTransferPage from "./pages/BankTransferPage.jsx";
import DealerDashboardPage from "./pages/DealerDashboardPage.jsx";
import DealerReferralsPage from "./pages/DealerReferralsPage.jsx";
import DealerProfilePage from "./pages/DealerProfilePage.jsx";
import DealerPlanPage from "./pages/DealerPlanPage.jsx";
import DealerBillingPage from "./pages/DealerBillingPage.jsx";
import DealerPayoutPage from "./pages/DealerPayoutPage.jsx";
import DealerBankTransferPage from "./pages/DealerBankTransferPage.jsx";
import SaasAdminPage from "./pages/SaasAdminPage.jsx";
import SaasAdminProductPage from "./pages/SaasAdminProductPage.jsx";
import SaasAdminOrganizationsPage from "./pages/SaasAdminOrganizationsPage.jsx";
import SaasAdminDealerPage from "./pages/SaasAdminDealerPage.jsx";
import SaasAdminOrganizationPage from "./pages/SaasAdminOrganizationPage.jsx";
import SaasAdminReferralsPage from "./pages/SaasAdminReferralsPage.jsx";
import SaasAdminProfilePage from "./pages/SaasAdminProfilePage.jsx";
import SaasAdminObservabilityPage from "./pages/SaasAdminObservabilityPage.jsx";
import SaasAdminInboxPage from "./pages/SaasAdminInboxPage.jsx";
import OrgInboxPage from "./pages/OrgInboxPage.jsx";
import SaasAdminRetentionPolicyPage from "./pages/SaasAdminRetentionPolicyPage.jsx";
import SaasAdminStorageSettingsPage from "./pages/SaasAdminStorageSettingsPage.jsx";
import SaasAdminApplicationDownloadsPage from "./pages/SaasAdminApplicationDownloadsPage.jsx";
import SaasAdminWhatsAppSettingsPage from "./pages/SaasAdminWhatsAppSettingsPage.jsx";
import SaasAdminSystemBackupManagerPage from "./pages/SaasAdminSystemBackupManagerPage.jsx";
import SaasAdminBillingPage from "./pages/SaasAdminBillingPage.jsx";
import SaasAdminBackupActivityPage from "./pages/SaasAdminBackupActivityPage.jsx";
import BackupHistoryPage from "./pages/BackupHistoryPage.jsx";
import SaasAdminServerMonitoringPage from "./pages/SaasAdminServerMonitoringPage.jsx";
import SaasAdminServerMonitoringDetailPage from "./pages/SaasAdminServerMonitoringDetailPage.jsx";
import SaasAdminServerMonitoringSettingsPage from "./pages/SaasAdminServerMonitoringSettingsPage.jsx";
import SaasAdminServerMonitoringAlertsPage from "./pages/SaasAdminServerMonitoringAlertsPage.jsx";
import SaasAdminSESSettingsPage from "./pages/SaasAdminSESSettingsPage.jsx";
import MediaLibraryPage from "./pages/MediaLibraryPage.jsx";
import OrgMediaLibraryPage from "./pages/OrgMediaLibraryPage.jsx";
import StorageExplorerPage from "./pages/StorageExplorerPage.jsx";
import StorageUsersPage from "./pages/StorageUsersPage.jsx";
import StorageDashboardPage from "./pages/StorageDashboardPage.jsx";
import ImpositionProductDashboardPage from "./pages/ImpositionProductDashboardPage.jsx";
import ImpositionProductUsersPage from "./pages/ImpositionProductUsersPage.jsx";
import BusinessAutopilotUsersPage from "./pages/BusinessAutopilotUsersPage.jsx";
import AiChatbotInboxPage from "./pages/AiChatbotInboxPage.jsx";
import AiChatbotWidgetsPage from "./pages/AiChatbotWidgetsPage.jsx";
import AiChatbotLeadsPage from "./pages/AiChatbotLeadsPage.jsx";
import AiChatbotAgentsPage from "./pages/AiChatbotAgentsPage.jsx";
import AiChatbotDashboardPage from "./pages/AiChatbotDashboardPage.jsx";
import AiChatbotHistoryPage from "./pages/AiChatbotHistoryPage.jsx";
import AiChatbotChatSettingsPage from "./pages/AiChatbotChatSettingsPage.jsx";
import WhatsappAutomationCompanyProfilePage from "./pages/WhatsappAutomationCompanyProfilePage.jsx";
import WhatsappAutomationDashboardPage from "./pages/WhatsappAutomationDashboardPage.jsx";
import WhatsappAutomationOverviewPage from "./pages/WhatsappAutomationOverviewPage.jsx";
import WebsiteCatalogueDashboardPage from "./pages/WebsiteCatalogueDashboardPage.jsx";
import DigitalBusinessCardDashboardPage from "./pages/DigitalBusinessCardDashboardPage.jsx";
import DigitalCardVisitorAnalyticsPage from "./pages/DigitalCardVisitorAnalyticsPage.jsx";
import DigitalAutomationOverviewPage from "./pages/DigitalAutomationOverviewPage.jsx";
import DigitalAutomationModulePage from "./pages/DigitalAutomationModulePage.jsx";
import DigitalAutomationSubscriptionPage from "./pages/DigitalAutomationSubscriptionPage.jsx";
import SocialMediaAutomationPage from "./pages/SocialMediaAutomationPage.jsx";
import { ConfirmProvider, useConfirm } from "./components/ConfirmDialog.jsx";
import { UploadAlertProvider } from "./components/UploadAlert.jsx";
import ErrorBoundary from "./components/ErrorBoundary.jsx";
import BusinessAutopilotAssistantWidget from "./components/BusinessAutopilotAssistantWidget.jsx";
import { BrandingProvider, useBranding } from "./branding/BrandingContext.jsx";
import { formatDeviceDate, setOrgTimezone } from "./lib/datetime.js";
import { getBrowserTimezone } from "./lib/timezones.js";
import { apiFetch } from "./lib/api.js";

const BusinessAutopilotDashboardPage = lazy(() => import("./pages/BusinessAutopilotDashboardPage.jsx"));
const BusinessAutopilotModulePage = lazy(() => import("./pages/BusinessAutopilotModulePage.jsx"));

const emptyState = {
  loading: true,
  authenticated: false,
  user: null,
  profile: null,
  archived: false,
  allowAppUsage: true,
  allowGamingOttUsage: true,
  themePrimary: "",
  themeSecondary: "",
  sidebarMenuStyle: "default",
  freePlanPopup: false,
  freePlanExpiry: "",
  dealer: null,
  dealerOnboarding: null,
  onboarding: { enabled: false, state: "active" },
  readOnly: false,
  sessionTimeoutMinutes: 30,
  subscriptions: []
};

const THEME_OVERRIDE_KEY = "wz_brand_theme_override";
const THEME_LAST_KEY = "wz_brand_theme";
const THEME_PREV_KEY = "wz_brand_theme_prev";
const LAST_APP_PRODUCT_KEY = "wz_last_app_product_slug";
const BUSINESS_AUTOPILOT_ROLE_ACCESS_STORAGE_KEY = "wz_business_autopilot_role_access";
const BUSINESS_AUTOPILOT_USER_DIRECTORY_STORAGE_KEY = "wz_business_autopilot_user_directory";
const LAST_SIGNOUT_AT_STORAGE_KEY = "wz_last_signout_at";

function safeLocalStorageGet(key, fallback = "") {
  if (typeof window === "undefined") {
    return fallback;
  }
  try {
    const value = window.localStorage.getItem(key);
    return value == null ? fallback : value;
  } catch {
    return fallback;
  }
}

function safeLocalStorageSet(key, value) {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Ignore storage write failures (private mode / blocked storage).
  }
}

function rememberLastSignoutTime() {
  safeLocalStorageSet(LAST_SIGNOUT_AT_STORAGE_KEY, new Date().toISOString());
}

function normalizeSidebarMenuStyle(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "compact" || normalized === "icons") {
    return normalized;
  }
  return "default";
}

function readBusinessAutopilotRoleAccessMap() {
  if (typeof window === "undefined") {
    return {};
  }
  try {
    const raw = safeLocalStorageGet(BUSINESS_AUTOPILOT_ROLE_ACCESS_STORAGE_KEY, "");
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function readBusinessAutopilotUserDirectory() {
  if (typeof window === "undefined") {
    return [];
  }
  try {
    const raw = safeLocalStorageGet(BUSINESS_AUTOPILOT_USER_DIRECTORY_STORAGE_KEY, "");
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function getBusinessAutopilotSectionKey(pathname) {
  const candidate = String(pathname || "").trim();
  if (!candidate || candidate === "/") return "dashboard";
  if (candidate === "/notifications-inbox" || candidate.startsWith("/notifications-inbox/")) return "inbox";
  if (candidate === "/crm" || candidate.startsWith("/crm/")) return "crm";
  if (candidate === "/hrm" || candidate.startsWith("/hrm/")) return "hr";
  if (candidate === "/projects" || candidate.startsWith("/projects/")) return "projects";
  if (candidate === "/subscriptions" || candidate.startsWith("/subscriptions/") || candidate === "/accounts/subscriptions" || candidate.startsWith("/accounts/subscriptions/")) return "subscriptions";
  if (candidate === "/accounts" || candidate.startsWith("/accounts/")) return "accounts";
  if (candidate === "/ticketing" || candidate.startsWith("/ticketing/")) return "ticketing";
  if (candidate === "/stocks" || candidate.startsWith("/stocks/")) return "stocks";
  if (candidate === "/users" || candidate.startsWith("/users/")) return "users";
  if (candidate === "/billing" || candidate.startsWith("/billing/")) return "billing";
  if (candidate === "/plans" || candidate.startsWith("/plans/")) return "plans";
  if (candidate === "/profile" || candidate.startsWith("/profile/")) return "profile";
  return "";
}

function resolveBusinessAutopilotAccessRecord(roleAccessMap, profileRole, employeeRole) {
  const safeMap = roleAccessMap && typeof roleAccessMap === "object" ? roleAccessMap : {};
  const normalizeRoleToken = (value) =>
    String(value || "")
      .trim()
      .toLowerCase()
      .replace(/[\s-]+/g, "_");
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

function hasBusinessAutopilotSectionAccess(accessRecord, sectionKey, isAdmin) {
  if (isAdmin) {
    return true;
  }
  if (!sectionKey) {
    return false;
  }
  const sections = accessRecord?.sections || {};
  const rawValue = sectionKey === "subscriptions"
    ? (sections.subscriptions || sections.accounts || "No Access")
    : (sections[sectionKey] || "No Access");
  const value = String(rawValue).trim();
  return value && value !== "No Access";
}

function hasBusinessAutopilotDefaultProfileAccess(isBusinessAutopilot, profileRole, isAdmin) {
  if (!isBusinessAutopilot || isAdmin) {
    return false;
  }
  return String(profileRole || "").trim().toLowerCase() === "org_user";
}

function applyThemeColors(theme) {
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
    "--color-primary-rgb"
  ];
  if (!theme || !theme.primary) {
    vars.forEach((name) => root.style.removeProperty(name));
    return;
  }
  const primary = theme.primary;
  const secondary = theme.secondary || primary;
  const hexToRgb = (value) => {
    const hex = String(value || "").replace("#", "").trim();
    if (hex.length === 3) {
      const r = parseInt(hex[0] + hex[0], 16);
      const g = parseInt(hex[1] + hex[1], 16);
      const b = parseInt(hex[2] + hex[2], 16);
      return `${r}, ${g}, ${b}`;
    }
    if (hex.length === 6) {
      const r = parseInt(hex.slice(0, 2), 16);
      const g = parseInt(hex.slice(2, 4), 16);
      const b = parseInt(hex.slice(4, 6), 16);
      return `${r}, ${g}, ${b}`;
    }
    return "";
  };
  root.style.setProperty("--color-primary", primary);
  root.style.setProperty("--color-primary-hover", primary);
  root.style.setProperty("--color-accent", secondary);
  root.style.setProperty("--color-highlight", secondary);
  const primaryRgb = hexToRgb(primary);
  const accentRgb = hexToRgb(secondary);
  if (primaryRgb) {
    root.style.setProperty("--color-primary-rgb", primaryRgb);
  }
  if (accentRgb) {
    root.style.setProperty("--color-accent-rgb", accentRgb);
  }
}

function BusinessAutopilotAccessDenied({ sectionLabel = "this page" }) {
  return (
    <div className="page-center">
      <div className="panel">
        <h1>Business Autopilot</h1>
        <p>Page Access Not Assigned</p>
        <div className="text-secondary">
          You do not have access to {sectionLabel}. Contact admin to enable this page for your role.
        </div>
      </div>
    </div>
  );
}

function formatWorkspaceText(value, fallback = "Workspace") {
  const normalized = String(value || "").trim();
  if (!normalized) {
    return fallback;
  }
  return normalized
    .split(/[_-\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function getInitials(value) {
  const parts = String(value || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2);
  if (!parts.length) {
    return "WZ";
  }
  return parts.map((part) => part.charAt(0).toUpperCase()).join("");
}

function formatPathLabel(pathname, basePath = "") {
  const normalized = basePath && pathname.startsWith(basePath)
    ? pathname.slice(basePath.length)
    : pathname;
  const cleaned = String(normalized || "/")
    .replace(/^\/+|\/+$/g, "")
    .split("/")
    .filter(Boolean)
    .map((part) => formatWorkspaceText(part, part))
    .join(" / ");
  return cleaned || "Dashboard Overview";
}

const reactPages = [
  { label: "Dashboard", path: "/", icon: "bi-speedometer2", productOnly: "storage" },
  { label: "Dashboard", path: "/", icon: "bi-speedometer2", productOnly: "imposition-software" },
  { label: "Files", path: "/files", icon: "bi-cloud", productOnly: "storage" },
  { label: "Inbox & Ticket", path: "/notifications-inbox", icon: "bi-inbox", productOnly: "storage" },
  { label: "Users", path: "/users", icon: "bi-people", productOnly: "storage", adminOnly: true },
  { label: "Users", path: "/users", icon: "bi-people", productOnly: "imposition-software", adminOnly: true },
  { label: "Users", path: "/users", icon: "bi-people", productOnly: "business-autopilot-erp", adminOnly: true },
  { label: "Dashboard", path: "/", icon: "bi-speedometer2" },
  { label: "Dashboard", path: "/", icon: "bi-speedometer2", productOnly: "digital-automation" },
  { label: "Inbox & Ticket", path: "/notifications-inbox", icon: "bi-inbox", productOnly: "worksuite" },
  { label: "Inbox & Ticket", path: "/notifications-inbox", icon: "bi-inbox", productOnly: "business-autopilot-erp" },
  { label: "Inbox & Ticket", path: "/notifications-inbox", icon: "bi-inbox", productOnly: "whatsapp-automation" },
  { label: "Inbox", path: "/inbox", icon: "bi-chat-dots", productOnly: "ai-chatbot", allowAgent: true },
  { label: "Widgets", path: "/widgets", icon: "bi-code-slash", productOnly: "ai-chatbot", adminOnly: true },
  { label: "Leads", path: "/leads", icon: "bi-person-lines-fill", productOnly: "ai-chatbot", adminOnly: true },
  { label: "Agents", path: "/agents", icon: "bi-people", productOnly: "ai-chatbot", adminOnly: true },
  { label: "History", path: "/history", icon: "bi-clock-history", productOnly: "ai-chatbot", adminOnly: true },
  { label: "Chat Settings", path: "/chat-settings", icon: "bi-gear", productOnly: "ai-chatbot", adminOnly: true },
  { label: "Live Activity", path: "/activity", icon: "bi-activity", productOnly: "worksuite" },
  { label: "Work Activity Log", path: "/work-activity", icon: "bi-clock-history", productOnly: "worksuite" },
  { label: "App Usage", path: "/app-usage", icon: "bi-bar-chart-line", requiresAppUsage: true, productOnly: "worksuite" },
  { label: "Gaming / OTT Usage", path: "/gaming-ott", icon: "bi-tv", requiresGamingOttUsage: true, productOnly: "worksuite" },
  { label: "Screenshots", path: "/screenshots", icon: "bi-camera", productOnly: "worksuite" },
  { label: "Employees", path: "/employees", icon: "bi-people", productOnly: "worksuite" },
  { label: "Company Settings", path: "/company", icon: "bi-building", adminOnly: true, productOnly: "worksuite" },
  { label: "Privacy Settings", path: "/privacy", icon: "bi-shield-lock", adminOnly: true, productOnly: "worksuite" },
  { label: "SaaS Admin", path: "/saas-admin", icon: "bi-grid-1x2", saasAdminOnly: true },
  { label: "Dashboard", path: "/", icon: "bi-speedometer2", productOnly: "whatsapp-automation" },
  { label: "Company Profile", path: "/dashboard/company-profile", icon: "bi-building", productOnly: "whatsapp-automation" },
  { label: "Whatsapp Automation", path: "/dashboard/whatsapp-automation", icon: "bi-whatsapp", productOnly: "whatsapp-automation" },
  { label: "Website & Catalogue", path: "/dashboard/catalogue", icon: "bi-grid-3x3-gap", productOnly: "whatsapp-automation" },
  { label: "Digital Business Card", path: "/dashboard/digital-card", icon: "bi-person-vcard", productOnly: "whatsapp-automation" },
  { label: "Visitor Analytics", path: "/dashboard/digital-card/analytics", icon: "bi-graph-up-arrow", productOnly: "whatsapp-automation" },
  { label: "Social Media", path: "/dashboard/social-media-automation", icon: "bi-share", productOnly: "digital-automation" },
  { label: "AI Content Writer", path: "/dashboard/ai-content-writer", icon: "bi-magic", productOnly: "digital-automation" },
  { label: "WordPress Auto Post", path: "/dashboard/wordpress-auto-post", icon: "bi-wordpress", productOnly: "digital-automation" },
  { label: "Subscription", path: "/dashboard/subscription", icon: "bi-hdd-network", productOnly: "digital-automation" },
  { label: "Media Library", path: "/media-library", icon: "bi-images", adminOnly: true, productOnly: "whatsapp-automation" },
  { label: "CRM", path: "/crm", icon: "bi-people", productOnly: "business-autopilot-erp", moduleKey: "crm" },
  { label: "HR", path: "/hrm", icon: "bi-person-badge", productOnly: "business-autopilot-erp", moduleKey: "hrm" },
  { label: "Projects", path: "/projects", icon: "bi-diagram-3", productOnly: "business-autopilot-erp", moduleKey: "projects" },
  { label: "Accounts", path: "/accounts", icon: "bi-calculator", productOnly: "business-autopilot-erp", moduleKey: "accounts" },
  { label: "Subscriptions", path: "/subscriptions", icon: "bi-arrow-repeat", productOnly: "business-autopilot-erp", moduleKey: "subscriptions" },
  { label: "Ticketing", path: "/ticketing", icon: "bi-life-preserver", productOnly: "business-autopilot-erp", moduleKey: "ticketing" },
  { label: "Inventory", path: "/stocks", icon: "bi-box-seam", productOnly: "business-autopilot-erp", moduleKey: "stocks" },
  { label: "Billing", path: "/billing", icon: "bi-credit-card", adminOnly: true },
  { label: "Plans", path: "/plans", icon: "bi-clipboard-check", adminOnly: true },
  { label: "Profile", path: "/profile", icon: "bi-person", adminOnly: true }
];

const saasAdminPages = [
  { key: "overview", label: "Overview", path: "/saas-admin", icon: "bi-grid-1x2" },
  { key: "inbox", label: "Inbox & Ticket", path: "/saas-admin/inbox", icon: "bi-inbox" },
  { key: "observability", label: "Observability", path: "/saas-admin/observability", icon: "bi-bar-chart" },
  { key: "products", label: "Products", path: "/saas-admin", hash: "#products", icon: "bi-boxes" },
  { key: "organizations", label: "Organizations", path: "/saas-admin/organizations", icon: "bi-building" },
  { key: "ses", label: "Amazon SES", path: "/saas-admin/ses", icon: "bi-envelope-paper" },
  { key: "application-downloads", label: "App Downloads", path: "/saas-admin/application-downloads", icon: "bi-cloud-arrow-down" },
  { key: "server-monitoring", label: "Server Monitoring", path: "/saas-admin/server-monitoring", icon: "bi-cpu" },
  { key: "referrals", label: "Referrals", path: "/saas-admin/referrals", icon: "bi-people" },
  { key: "profile", label: "Profile", path: "/saas-admin/profile", icon: "bi-person" },
  { key: "dj-admin", label: "Back to DJ Admin", path: "/admin/", icon: "bi-arrow-left", external: true }
];

const dealerPages = [
  { label: "Dashboard", path: "/dealer-dashboard", icon: "bi-speedometer2" },
  { label: "Referrals", path: "/dealer-referrals", icon: "bi-people" },
  { label: "Payouts", path: "/dealer-payouts", icon: "bi-cash-coin" },
  { label: "Billing", path: "/dealer-billing", icon: "bi-credit-card" },
  { label: "Plan", path: "/dealer-plan", icon: "bi-clipboard-check" },
  { label: "Profile", path: "/dealer-profile", icon: "bi-person" }
];


function AppShell({ state, productPrefix, productSlug }) {
  const { branding } = useBranding();
  const monitorLabel =
    branding?.aliases?.ui?.monitorLabel || branding?.displayName || "Work Suite";
  const location = useLocation();
  const navigate = useNavigate();
  const [upgradeAlertMessage, setUpgradeAlertMessage] = useState("");
  const [showFreePlanModal, setShowFreePlanModal] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [autopilotModules, setAutopilotModules] = useState([]);
  const [autopilotCatalog, setAutopilotCatalog] = useState([]);
  const [autopilotCanManageModules, setAutopilotCanManageModules] = useState(false);
  const [autopilotCanManageUsers, setAutopilotCanManageUsers] = useState(false);
  const [, setAutopilotModulesLoading] = useState(false);
  const [autopilotModulesResolved, setAutopilotModulesResolved] = useState(false);
  const [autopilotSavingSlug, setAutopilotSavingSlug] = useState("");
  const [autopilotModuleError, setAutopilotModuleError] = useState("");
  const [theme, setTheme] = useState(() => {
    if (typeof window === "undefined") {
      return "dark";
    }
    const stored = safeLocalStorageGet("wz_theme", "");
    return stored === "light" ? "light" : "dark";
  });
  const isSuperuser = Boolean(state.user?.is_superuser);
  const isSaasAdmin =
    isSuperuser ||
    state.profile?.role === "superadmin" ||
    state.profile?.role === "super_admin";
  const isHrView = state.profile?.role === "hr_view";
  const isAdmin =
    state.profile?.role === "superadmin" ||
    state.profile?.role === "company_admin" ||
    state.profile?.role === "org_admin" ||
    isSuperuser ||
    isHrView;
  const isDealer = state.profile?.role === "dealer";
  const isAiChatbotAgent = state.profile?.role === "ai_chatbot_agent";
  const aiChatbotTrial = (state.subscriptions || []).find(
    (sub) => sub.product_slug === "ai-chatbot" && (sub.status || "").toLowerCase() === "trialing"
  );
  const trialEndText = aiChatbotTrial?.trial_end
    ? formatDeviceDate(aiChatbotTrial.trial_end, "")
    : "";
  const themePrimary = state.themePrimary;
  const themeSecondary = state.themeSecondary;
  const sidebarMenuStyle = (() => {
    if (typeof window !== "undefined") {
      const raw = safeLocalStorageGet(THEME_OVERRIDE_KEY, "");
      if (raw && raw !== "default") {
        try {
          const parsed = JSON.parse(raw);
          const overrideStyle = normalizeSidebarMenuStyle(parsed?.sidebarMenuStyle);
          if (overrideStyle === "icons") {
            return "icons";
          }
        } catch {
          // ignore invalid local override
        }
      }
    }
    return normalizeSidebarMenuStyle(state.sidebarMenuStyle);
  })();
  const effectiveSidebarMenuStyle =
    sidebarMenuStyle === "icons" && !sidebarCollapsed
      ? "default"
      : sidebarMenuStyle;
  const showIconsMenuTooltips = sidebarMenuStyle === "icons" && sidebarCollapsed;
  const onboarding = state.onboarding || { enabled: false, state: "active" };
  const isSaasAdminRoute = location.pathname.startsWith("/saas-admin");
  const isMonitorProduct = productSlug === "worksuite";
  const isBusinessAutopilot = productSlug === "business-autopilot-erp";
  const isWhatsappAutomationProduct = productSlug === "whatsapp-automation";
  const isImpositionProduct = productSlug === "imposition-software";
  const productLabel = productSlug === "ai-chatbot"
    ? "AI Chatbot"
    : productSlug === "worksuite"
    ? monitorLabel
    : productSlug === "storage"
    ? "Online Storage"
    : productSlug === "whatsapp-automation"
    ? "Whatsapp Automation"
    : productSlug === "business-autopilot-erp"
    ? "Business Autopilot"
    : productSlug === "imposition-software"
    ? "Print Marks"
    : productSlug === "digital-automation"
    ? "Digital Automation"
    : productSlug === "saas-admin"
    ? "SaaS Admin"
    : "Work Zilla";
  const currentProductSubscription = useMemo(() => {
    const normalizedProductSlug = productSlug === "worksuite" ? "monitor" : productSlug;
    return (state.subscriptions || []).find((item) => item.product_slug === normalizedProductSlug) || null;
  }, [productSlug, state.subscriptions]);
  const currentSubscriptionStatus = String(currentProductSubscription?.status || "").toLowerCase();
  const currentFreePlanEndValue = currentProductSubscription?.trial_end || currentProductSubscription?.ends_at || "";
  const currentFreePlanExpiry = currentFreePlanEndValue
    ? formatDeviceDate(currentFreePlanEndValue, "")
    : "";
  const allowAppUsage = isMonitorProduct
    ? currentProductSubscription?.allow_app_usage !== false
    : state.allowAppUsage !== false;
  const allowGamingOttUsage = isMonitorProduct
    ? currentProductSubscription?.allow_gaming_ott_usage !== false
    : state.allowGamingOttUsage !== false;
  const shouldShowCurrentProductFreePlanPopup = Boolean(
    currentProductSubscription &&
    currentProductSubscription.plan_is_free &&
    (currentSubscriptionStatus === "active" || currentSubscriptionStatus === "trialing") &&
    currentFreePlanExpiry
  );
  const isProductsSection =
    location.pathname.startsWith("/saas-admin/products") ||
    location.hash === "#products";
  const isOrganizationsSection = location.pathname.startsWith("/saas-admin/organizations");
  const isRetentionSection = location.pathname.startsWith("/saas-admin/retention-policy");
  const isStorageSection = location.pathname.startsWith("/saas-admin/storage");
  const isApplicationDownloadsSection = location.pathname.startsWith("/saas-admin/application-downloads");
  const isBackupActivitySection = location.pathname.startsWith("/saas-admin/backup-activity");
  const isSESSection = location.pathname.startsWith("/saas-admin/ses");
  const isServerMonitoringSection = location.pathname.startsWith("/saas-admin/server-monitoring");
  const isReferralsSection = location.pathname.startsWith("/saas-admin/referrals");
  const isProfileSection = location.pathname.startsWith("/saas-admin/profile");
  const isObservabilitySection = location.pathname.startsWith("/saas-admin/observability");
  const isInboxSection = location.pathname.startsWith("/saas-admin/inbox");
  const isBillingSection = location.pathname.startsWith("/saas-admin/billing");
  const isOverviewSection =
    location.pathname === "/saas-admin" &&
    !isProductsSection &&
    !isOrganizationsSection &&
    !isRetentionSection &&
    !isStorageSection &&
    !isApplicationDownloadsSection &&
    !isBackupActivitySection &&
    !isSESSection &&
    !isServerMonitoringSection &&
    !isReferralsSection &&
    !isProfileSection &&
    !isObservabilitySection &&
    !isInboxSection &&
    !isBillingSection;
  const basePath = productPrefix || "";
  const withBase = (path) => {
    if (!basePath) {
      return path;
    }
    if (path === "/") {
      return basePath;
    }
    return `${basePath}${path.startsWith("/") ? path : `/${path}`}`;
  };
  const normalizedLocation = basePath && location.pathname.startsWith(basePath)
    ? {
        ...location,
        pathname: location.pathname.slice(basePath.length) || "/"
      }
    : location;
  const normalizedPathname = normalizedLocation.pathname || "/";
  const [autopilotAccessRecord, setAutopilotAccessRecord] = useState(null);
  const [autopilotAccessResolved, setAutopilotAccessResolved] = useState(false);

  function isAllowedPath(pathname, prefixList) {
    return prefixList.some((prefix) => {
      if (pathname === prefix) {
        return true;
      }
      return pathname.startsWith(`${prefix}/`);
    });
  }

  function getDealerRedirect(pathname) {
    if (!isDealer) {
      return null;
    }
    const stateValue = state.dealerOnboarding || "active";
    if (stateValue === "active") {
      return null;
    }
    if (stateValue === "pending_payment") {
      return isAllowedPath(pathname, ["/dealer-billing"]) ? null : "/dealer-billing";
    }
    if (stateValue === "needs_payment") {
      return isAllowedPath(pathname, ["/dealer-plan", "/dealer-bank-transfer"]) ? null : "/dealer-plan";
    }
    return "/dealer-plan";
  }

  function getOnboardingRedirect(pathname) {
    if (isDealer) {
      return getDealerRedirect(pathname);
    }
    if (!onboarding.enabled) {
      return null;
    }
    if (onboarding.state === "needs_plan") {
      return isAllowedPath(pathname, ["/plans"]) ? null : "/plans";
    }
    if (onboarding.state === "needs_payment") {
      return isAllowedPath(pathname, ["/bank-transfer", "/plans"])
        ? null
        : "/bank-transfer";
    }
    if (onboarding.state === "pending_payment") {
      return isAllowedPath(pathname, ["/billing"]) ? null : "/billing";
    }
    return null;
  }

  useEffect(() => {
    if (typeof document !== "undefined") {
      document.documentElement.dataset.theme = theme;
      document.documentElement.style.colorScheme = theme;
    }
    if (typeof window !== "undefined") {
      safeLocalStorageSet("wz_theme", theme);
      window.__WZ_PRODUCT_SLUG__ = productSlug;
      if (productSlug && productSlug !== "saas-admin") {
        safeLocalStorageSet(LAST_APP_PRODUCT_KEY, productSlug);
      }
    }
  }, [theme, productSlug]);

  useEffect(() => {
    const serverTheme = {
      primary: themePrimary,
      secondary: themeSecondary
    };
    const overrideRaw = typeof window !== "undefined"
      ? safeLocalStorageGet(THEME_OVERRIDE_KEY, "")
      : null;
    let themeToApply = serverTheme;
    if (overrideRaw) {
      if (overrideRaw === "default") {
        themeToApply = null;
      } else {
        try {
          themeToApply = JSON.parse(overrideRaw);
        } catch {
          themeToApply = serverTheme;
        }
      }
    }
    if (themeToApply && themeToApply.primary) {
      const next = JSON.stringify(themeToApply);
      const prev = typeof window !== "undefined"
        ? safeLocalStorageGet(THEME_LAST_KEY, "")
        : null;
      if (prev && prev !== next && typeof window !== "undefined") {
        safeLocalStorageSet(THEME_PREV_KEY, prev);
      }
      if (typeof window !== "undefined") {
        safeLocalStorageSet(THEME_LAST_KEY, next);
      }
    }
    applyThemeColors(themeToApply);
  }, [themePrimary, themeSecondary]);

  useEffect(() => {
    if (sidebarMenuStyle === "icons") {
      setSidebarCollapsed(true);
    }
  }, [sidebarMenuStyle]);

  useEffect(() => {
    if (!shouldShowCurrentProductFreePlanPopup) {
      setShowFreePlanModal(false);
      return;
    }
    if (typeof window === "undefined") {
      setShowFreePlanModal(true);
      return;
    }
    const popupDate = new Date().toISOString().slice(0, 10);
    const popupKey = `wz_free_plan_popup_date:${productSlug || "worksuite"}`;
    const lastShown = safeLocalStorageGet(popupKey, "");
    if (lastShown === popupDate) {
      setShowFreePlanModal(false);
      return;
    }
    setShowFreePlanModal(true);
    safeLocalStorageSet(popupKey, popupDate);
  }, [productSlug, shouldShowCurrentProductFreePlanPopup]);

  useEffect(() => {
    let active = true;
    async function loadBusinessModules() {
      if (!isBusinessAutopilot) {
        if (active) {
          setAutopilotModules([]);
          setAutopilotCatalog([]);
          setAutopilotCanManageModules(false);
          setAutopilotCanManageUsers(false);
          setAutopilotModulesLoading(false);
          setAutopilotModulesResolved(true);
          setAutopilotModuleError("");
        }
        return;
      }
      if (active) {
        setAutopilotModulesLoading(true);
        setAutopilotModulesResolved(false);
      }
      try {
        const data = await apiFetch("/api/business-autopilot/modules");
        if (active) {
          const enabledModules = Array.isArray(data.enabled_modules)
            ? data.enabled_modules
            : (data.modules || []).filter((item) => item.enabled !== false);
          setAutopilotModules(enabledModules);
          setAutopilotCatalog(data.catalog || enabledModules);
          setAutopilotCanManageModules(Boolean(data.can_manage_modules));
          setAutopilotCanManageUsers(Boolean(data.can_manage_users));
          setAutopilotModuleError("");
          setAutopilotModulesLoading(false);
          setAutopilotModulesResolved(true);
        }
      } catch (_error) {
        if (active) {
          setAutopilotModules([]);
          setAutopilotCatalog([]);
          setAutopilotCanManageModules(false);
          setAutopilotCanManageUsers(false);
          setAutopilotModuleError("Unable to load modules.");
          setAutopilotModulesLoading(false);
          setAutopilotModulesResolved(true);
        }
      }
    }
    loadBusinessModules();
    return () => {
      active = false;
    };
  }, [isBusinessAutopilot]);

  useEffect(() => {
    if (!isBusinessAutopilot || isAdmin) {
      setAutopilotAccessRecord(null);
      setAutopilotAccessResolved(true);
      return () => {};
    }
    let active = true;
    async function loadBusinessAutopilotAccess() {
      setAutopilotAccessResolved(false);
      try {
        let roleAccessMap = readBusinessAutopilotRoleAccessMap();
        try {
          const roleAccessData = await apiFetch("/api/business-autopilot/role-access");
          if (roleAccessData?.role_access_map && typeof roleAccessData.role_access_map === "object") {
            roleAccessMap = roleAccessData.role_access_map;
            safeLocalStorageSet(BUSINESS_AUTOPILOT_ROLE_ACCESS_STORAGE_KEY, JSON.stringify(roleAccessMap));
          }
        } catch {
          // Fallback to cached local role access map.
        }
        const cachedDirectory = readBusinessAutopilotUserDirectory();
        let usersDirectory = cachedDirectory;
        try {
          const usersData = await apiFetch("/api/business-autopilot/users");
          usersDirectory = Array.isArray(usersData?.users) ? usersData.users : cachedDirectory;
        } catch {
          usersDirectory = cachedDirectory;
        }
        if (!active) {
          return;
        }
        const currentEmail = String(state.user?.email || state.user?.username || "").trim().toLowerCase();
        const matchedUser = (Array.isArray(usersDirectory) ? usersDirectory : []).find(
          (row) => String(row?.email || "").trim().toLowerCase() === currentEmail
        );
        const nextAccessRecord = resolveBusinessAutopilotAccessRecord(
          roleAccessMap,
          state.profile?.role,
          matchedUser?.employee_role || state.user?.employee_role || ""
        );
        setAutopilotAccessRecord(nextAccessRecord);
      } catch {
        if (!active) {
          return;
        }
        setAutopilotAccessRecord(null);
      } finally {
        if (active) {
          setAutopilotAccessResolved(true);
        }
      }
    }
    loadBusinessAutopilotAccess();
    const refreshAccess = () => {
      loadBusinessAutopilotAccess();
    };
    window.addEventListener("storage", refreshAccess);
    window.addEventListener("focus", refreshAccess);
    window.addEventListener("wz:business-autopilot-role-access-changed", refreshAccess);
    window.addEventListener("wz:business-autopilot-user-directory-changed", refreshAccess);
    return () => {
      active = false;
      window.removeEventListener("storage", refreshAccess);
      window.removeEventListener("focus", refreshAccess);
      window.removeEventListener("wz:business-autopilot-role-access-changed", refreshAccess);
      window.removeEventListener("wz:business-autopilot-user-directory-changed", refreshAccess);
    };
  }, [isAdmin, isBusinessAutopilot, state.profile?.role, state.user?.email, state.user?.username, state.user?.employee_role]);

  const autopilotCurrentSectionKey = useMemo(
    () => getBusinessAutopilotSectionKey(normalizedPathname),
    [normalizedPathname]
  );

  const toggleAutopilotModule = useCallback(async (moduleSlug, enabled) => {
    if (!isBusinessAutopilot || !moduleSlug) {
      return;
    }
    setAutopilotSavingSlug(moduleSlug);
    setAutopilotModuleError("");
    try {
      const data = await apiFetch("/api/business-autopilot/modules", {
        method: "POST",
        body: JSON.stringify({ module_slug: moduleSlug, enabled: Boolean(enabled) })
      });
      const enabledModules = Array.isArray(data.enabled_modules)
        ? data.enabled_modules
        : (data.modules || []).filter((item) => item.enabled !== false);
      setAutopilotModules(enabledModules);
      setAutopilotCatalog(data.catalog || enabledModules);
      setAutopilotCanManageModules(Boolean(data.can_manage_modules));
      setAutopilotCanManageUsers(Boolean(data.can_manage_users));
    } catch (error) {
      setAutopilotModuleError(error?.message || "Unable to update module.");
    } finally {
      setAutopilotSavingSlug("");
    }
  }, [isBusinessAutopilot]);

  useEffect(() => {
    const redirectPath = getOnboardingRedirect(location.pathname);
    if (redirectPath && redirectPath !== location.pathname) {
      navigate(redirectPath, { replace: true });
    }
  }, [location.pathname, navigate, onboarding.enabled, onboarding.state, state.dealerOnboarding, isDealer]);

  const orgName = isDealer
    ? (state.user?.first_name || state.user?.username)
    : state.profile?.organization?.name;
  const orgDisplayName = isHrView && orgName ? `${orgName} (HR)` : orgName;

  const allowedNavItems = reactPages.filter((item) => {
    if (item.superuserOnly) {
      return isSuperuser;
    }
    if (productSlug === "storage" && item.path === "/" && item.label === "Dashboard" && !item.productOnly) {
      return false;
    }
    if (productSlug === "whatsapp-automation" && item.path === "/" && item.label === "Dashboard" && !item.productOnly) {
      return false;
    }
    if (productSlug === "imposition-software" && item.path === "/" && item.label === "Dashboard" && !item.productOnly) {
      return false;
    }
    if (productSlug === "digital-automation" && item.path === "/" && item.label === "Dashboard" && !item.productOnly) {
      return false;
    }
    if (item.productOnly && item.productOnly !== productSlug) {
      return false;
    }
    if (isBusinessAutopilot && item.moduleKey) {
      if (!autopilotModules.some((module) => module.slug === item.moduleKey)) {
        return false;
      }
    }
    if (isBusinessAutopilot) {
      const sectionKey = getBusinessAutopilotSectionKey(item.path);
      const hasDefaultProfileAccess = sectionKey === "profile"
        && hasBusinessAutopilotDefaultProfileAccess(isBusinessAutopilot, state.profile?.role, isAdmin);
      if (
        sectionKey
        && !hasDefaultProfileAccess
        && !hasBusinessAutopilotSectionAccess(autopilotAccessRecord, sectionKey, isAdmin)
      ) {
        return false;
      }
    }
    if (item.saasAdminOnly) {
      return isSaasAdmin;
    }
    if (item.adminOnly) {
      if (
        isBusinessAutopilot
        && item.path === "/profile"
        && hasBusinessAutopilotDefaultProfileAccess(isBusinessAutopilot, state.profile?.role, isAdmin)
      ) {
        return true;
      }
      return isAdmin;
    }
    if (item.allowAgent && !isAdmin && !isAiChatbotAgent) {
      return false;
    }
    return true;
  }).filter((item) => {
    if (item.hidden) {
      return false;
    }
    if (isHrView) {
      const hrBlocked = new Set([
        "/employees",
        "/company",
        "/privacy",
        "/billing",
        "/plans",
        "/profile"
      ]);
      return !hrBlocked.has(item.path);
    }
    return true;
  });

  const orderedNavItems = useMemo(() => {
    const isDigitalAutomationProduct = productSlug === "digital-automation";
    if (!isBusinessAutopilot && !isWhatsappAutomationProduct && !isDigitalAutomationProduct) {
      return allowedNavItems;
    }
    const uniqueNavItems = (() => {
      const seen = new Set();
      return allowedNavItems.filter((item) => {
        const key = `${item.kind || "link"}|${item.path || ""}|${item.label || ""}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    })();
    const orderMap = isWhatsappAutomationProduct
      ? new Map([
          ["/", 0],
          ["/notifications-inbox", 1],
          ["/dashboard/company-profile", 3],
          ["/dashboard/whatsapp-automation", 4],
          ["/dashboard/catalogue", 5],
          ["/dashboard/digital-card", 6],
          ["/dashboard/digital-card/analytics", 7],
          ["/media-library", 8],
          ["/billing", 9],
          ["/plans", 10],
          ["/profile", 11],
        ])
      : isDigitalAutomationProduct
      ? new Map([
          ["/", 0],
          ["/dashboard/social-media-automation", 1],
          ["/dashboard/ai-content-writer", 2],
          ["/dashboard/wordpress-auto-post", 3],
          ["/dashboard/subscription", 4],
          ["/billing", 5],
          ["/plans", 6],
          ["/profile", 7],
        ])
      : new Map([
          ["/", 0],
          ["/notifications-inbox", 1],
          ["/crm", 2],
          ["/hrm", 3],
          ["/projects", 4],
          ["/accounts", 5],
          ["/subscriptions", 6],
          ["/ticketing", 7],
          ["/stocks", 8],
          ["/users", 9],
          ["/media-library", 10],
          ["/billing", 11],
          ["/plans", 12],
          ["/profile", 13]
        ]);
    return [...uniqueNavItems].sort((a, b) => {
      if (isWhatsappAutomationProduct || isDigitalAutomationProduct) {
        const topPaths = new Set(["/", "/notifications-inbox"]);
        if (a.kind === "section" && b.kind !== "section") return topPaths.has(b.path) ? 1 : -1;
        if (b.kind === "section" && a.kind !== "section") return topPaths.has(a.path) ? -1 : 1;
      } else {
        if (a.kind === "section" && b.kind !== "section") return -1;
        if (b.kind === "section" && a.kind !== "section") return 1;
      }
      if (a.kind === "section" && b.kind === "section") return 0;
      const aOrder = orderMap.has(a.path) ? orderMap.get(a.path) : 99;
      const bOrder = orderMap.has(b.path) ? orderMap.get(b.path) : 99;
      if (aOrder !== bOrder) {
        return aOrder - bOrder;
      }
      return a.label.localeCompare(b.label);
    });
  }, [allowedNavItems, isBusinessAutopilot, isWhatsappAutomationProduct, productSlug]);

  const dealerNavItems = dealerPages.filter((item) => {
    const stateValue = state.dealerOnboarding || "active";
    if (stateValue === "pending_payment") {
      return item.path === "/dealer-billing";
    }
    if (stateValue === "needs_payment") {
      return item.path === "/dealer-plan";
    }
    return true;
  });

  const navBase = basePath;
  const navPath = (path) => {
    if (String(path || "").startsWith("/saas-admin")) {
      return path;
    }
    if (!navBase) {
      return path;
    }
    if (path === "/") {
      return navBase;
    }
    return `${navBase}${path.startsWith("/") ? path : `/${path}`}`;
  };

  const renderRouteElement = (element, { allowed = true, pending = false } = {}) => {
    if (pending) {
      return <div className="card p-3">Loading page...</div>;
    }
    if (allowed) {
      return element;
    }
    if (isBusinessAutopilot) {
      const sectionLabel = autopilotCurrentSectionKey
        ? autopilotCurrentSectionKey.charAt(0).toUpperCase() + autopilotCurrentSectionKey.slice(1)
        : "this page";
      return <BusinessAutopilotAccessDenied sectionLabel={sectionLabel} />;
    }
    return <Navigate to={withBase("/")} replace />;
  };

  function handleSidebarNavClick() {
    if (sidebarMenuStyle === "icons") {
      return;
    }
    if (sidebarCollapsed) {
      setSidebarCollapsed(false);
    }
  }
  const archivedBillingPath = isSaasAdmin
    ? "/saas-admin/billing"
    : "/billing";
  const userDisplayName =
    state.user?.first_name ||
    state.user?.username ||
    state.user?.email ||
    "Work Zilla User";
  const roleDisplayName = formatWorkspaceText(
    isHrView ? "hr_view" : state.profile?.role || (isSaasAdmin ? "super_admin" : "member"),
    "Member"
  );
  const planLabel = formatWorkspaceText(
    currentProductSubscription?.plan_name ||
      currentProductSubscription?.plan ||
      currentProductSubscription?.plan_slug ||
      "active workspace",
    "Active Workspace"
  );
  const statusLabel = currentSubscriptionStatus
    ? formatWorkspaceText(currentSubscriptionStatus, "active")
    : "Active";
  const statusTone = ["active", "trialing"].includes(currentSubscriptionStatus)
    ? "wz-status-pill"
    : "wz-status-pill wz-status-pill--muted";
  const workspaceTrail = formatPathLabel(location.pathname, basePath);
  const orgNameForUi = orgDisplayName || "Organization";
  const userInitials = getInitials(userDisplayName);
  const sidebarRoleLabel = isDealer
    ? "Dealer"
    : isSaasAdmin || isAdmin
      ? "ORG Admin"
      : "ORG User";
  const showTopbarProductSection = (() => {
    if (isSaasAdminRoute) {
      return isOverviewSection;
    }
    if (isDealer) {
      return normalizedPathname === "/dealer-dashboard";
    }
    if (isWhatsappAutomationProduct) {
      return normalizedPathname === "/";
    }
    return normalizedPathname === "/";
  })();
  const getSidebarNavProps = (label) => ({
    title: showIconsMenuTooltips ? undefined : label,
    "aria-label": label,
    "data-tooltip": showIconsMenuTooltips ? label : undefined,
  });
  const renderSidebarNavLabel = (label) => (
    <>
      <span className="wz-nav-copy">{label}</span>
      <span className="wz-nav-tooltip" aria-hidden="true">{label}</span>
    </>
  );

  return (
    <div
      className={`app-shell wz-admin-shell ${isSaasAdminRoute ? "saas-admin" : ""} ${
        sidebarCollapsed ? "sidebar-collapsed" : ""
      } ${
        effectiveSidebarMenuStyle === "compact"
          ? "sidebar-style-compact"
          : effectiveSidebarMenuStyle === "icons"
            ? "sidebar-style-icons"
            : "sidebar-style-default"
      }`}
    >
      <aside className="sidebar wz-sidebar">
        <div className="wz-sidebar__inner">
          <div className="wz-brand-card">
            <div className="wz-brand-mark" aria-hidden="true">WZ</div>
            <div className="wz-brand-copy">
              <h2>Work Zilla</h2>
              <p>{productLabel}</p>
            </div>
          </div>

          <div className="wz-sidebar__controls">
            <div className="wz-sidebar__label">{sidebarRoleLabel}</div>
            <button
              type="button"
              className="sidebar-toggle"
              onClick={() => setSidebarCollapsed((prev) => !prev)}
              aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            >
              <i className={`bi ${sidebarCollapsed ? "bi-layout-sidebar-inset-reverse" : "bi-layout-sidebar-inset"}`} aria-hidden="true" />
              <span className="visually-hidden">
                {sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
              </span>
            </button>
          </div>

          <div className="wz-sidebar__meta">
            <div>
              <p className="wz-sidebar__meta-title">{orgNameForUi}</p>
              <p className="wz-sidebar__meta-subtitle">{roleDisplayName}</p>
            </div>
            <div className="d-flex flex-wrap gap-2">
              <span className={statusTone}>{statusLabel}</span>
              <span className="wz-status-pill wz-status-pill--secondary">{planLabel}</span>
            </div>
          </div>

          <nav className="nav">
            {isDealer
              ? dealerNavItems.map((item) => (
                  <NavLink
                    key={item.path}
                    to={navPath(item.path)}
                    end={item.path === "/dealer-dashboard"}
                    {...getSidebarNavProps(item.label)}
                    onClick={handleSidebarNavClick}
                    className={({ isActive }) => `nav-link wz-nav-link ${isActive ? "active" : ""}`}
                  >
                    {item.icon ? (
                      <i className={`bi ${item.icon} nav-icon wz-nav-icon`} aria-hidden="true" />
                    ) : null}
                    {renderSidebarNavLabel(item.label)}
                  </NavLink>
                ))
              : isSaasAdminRoute
              ? saasAdminPages.map((item) => {
                  const href = item.hash ? `${item.path}${item.hash}` : item.path;
                  let isActive = false;
                  if (item.key === "overview") {
                    isActive = isOverviewSection;
                  } else if (item.key === "inbox") {
                    isActive = isInboxSection;
                  } else if (item.key === "observability") {
                    isActive = isObservabilitySection;
                  } else if (item.key === "products") {
                    isActive = isProductsSection;
                  } else if (item.key === "organizations") {
                    isActive = isOrganizationsSection;
                  } else if (item.key === "ses") {
                    isActive = isSESSection;
                  } else if (item.key === "server-monitoring") {
                    isActive = isServerMonitoringSection;
                  } else if (item.key === "application-downloads") {
                    isActive = isApplicationDownloadsSection;
                  } else if (item.key === "retention-policy") {
                    isActive = isRetentionSection;
                  } else if (item.key === "billing") {
                    isActive = isBillingSection;
                  } else if (item.key === "referrals") {
                    isActive = isReferralsSection;
                  } else if (item.key === "profile") {
                    isActive = isProfileSection;
                  }
                  if (item.external) {
                    return (
                      <a
                        key={item.key}
                        href={item.path}
                        className="nav-link wz-nav-link"
                        {...getSidebarNavProps(item.label)}
                        onClick={handleSidebarNavClick}
                      >
                        {item.icon ? (
                          <i className={`bi ${item.icon} nav-icon wz-nav-icon`} aria-hidden="true" />
                        ) : null}
                        {renderSidebarNavLabel(item.label)}
                      </a>
                    );
                  }
                  return (
                    <NavLink
                      key={item.key}
                      to={navPath(href)}
                      {...getSidebarNavProps(item.label)}
                      onClick={() => {
                        handleSidebarNavClick();
                        if (item.moduleKey === "ticketing") {
                          window.dispatchEvent(new Event("wz:ticketing-menu-click"));
                        }
                      }}
                      className={() => `nav-link wz-nav-link ${isActive ? "active" : ""}`}
                    >
                      {item.icon ? (
                        <i className={`bi ${item.icon} nav-icon wz-nav-icon`} aria-hidden="true" />
                      ) : null}
                      {renderSidebarNavLabel(item.label)}
                    </NavLink>
                  );
                })
              : orderedNavItems.map((item) => (
                  item.kind === "section" ? (
                    <div key={`section-${item.label}`} className="nav-section-label">
                      <span>{item.label}</span>
                    </div>
                  ) : (
                    <NavLink
                      key={item.path}
                      to={navPath(item.path)}
                      end={item.path === "/"}
                      onClick={(event) => {
                        handleSidebarNavClick();
                        if (item.moduleKey === "ticketing") {
                          window.dispatchEvent(new Event("wz:ticketing-menu-click"));
                        }
                        if (item.requiresAppUsage && !allowAppUsage) {
                          event.preventDefault();
                          setUpgradeAlertMessage("Upgrade to next plan to access App Usage.");
                          return;
                        }
                        if (item.requiresGamingOttUsage && !allowGamingOttUsage) {
                          event.preventDefault();
                          setUpgradeAlertMessage("Upgrade to next plan to access Gaming / OTT Usage.");
                        }
                      }}
                      {...getSidebarNavProps(item.label)}
                      className={({ isActive }) =>
                        `nav-link wz-nav-link ${isActive ? "active" : ""} ${
                          (item.requiresAppUsage && !allowAppUsage) ||
                          (item.requiresGamingOttUsage && !allowGamingOttUsage)
                            ? "disabled"
                            : ""
                        }`
                      }
                      aria-disabled={
                        (item.requiresAppUsage && !allowAppUsage) ||
                        (item.requiresGamingOttUsage && !allowGamingOttUsage)
                          ? "true"
                          : "false"
                      }
                    >
                      {item.icon ? (
                        <i className={`bi ${item.icon} nav-icon wz-nav-icon`} aria-hidden="true" />
                      ) : null}
                      {renderSidebarNavLabel(item.label)}
                    </NavLink>
                  )
                ))}
            <a
              className="nav-link wz-nav-link"
              href="/auth/logout/"
              onClick={() => {
                rememberLastSignoutTime();
                handleSidebarNavClick();
              }}
              {...getSidebarNavProps("Logout")}
            >
              <i className="bi bi-box-arrow-right nav-icon wz-nav-icon" aria-hidden="true" />
              {renderSidebarNavLabel("Logout")}
            </a>
          </nav>

          <div className="wz-sidebar__footer">
            <div className="theme-toggle theme-toggle-inline">
              <button
                type="button"
                className={`theme-btn theme-btn-light ${
                  theme === "light" ? "active" : ""
                }`}
                onClick={() => setTheme("light")}
              >
                <i className="bi bi-sun" aria-hidden="true" />
                <span>Light</span>
              </button>
              <button
                type="button"
                className={`theme-btn theme-btn-dark ${
                  theme === "dark" ? "active" : ""
                }`}
                onClick={() => setTheme("dark")}
              >
                <i className="bi bi-moon-stars" aria-hidden="true" />
                <span>Dark</span>
              </button>
            </div>
          </div>
        </div>
      </aside>

      <div className="wz-workspace">
        {showTopbarProductSection ? (
          <header className="wz-topbar">
            <div className="wz-topbar__intro">
              <button
                type="button"
                className="sidebar-toggle"
                onClick={() => setSidebarCollapsed((prev) => !prev)}
                aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
              >
                <i className={`bi ${sidebarCollapsed ? "bi-text-indent-left" : "bi-text-indent-right"}`} aria-hidden="true" />
              </button>
              <div>
                <h1 className="wz-topbar__title">{productLabel}</h1>
              </div>
            </div>

            <div className="wz-topbar__actions">
              <Link className="wz-topbar__panel" to={withBase("/profile")}>
                <i className="bi bi-buildings" aria-hidden="true" />
                <div className="wz-topbar__panel-copy">
                  <strong>{orgNameForUi}</strong>
                  <span>{roleDisplayName}</span>
                </div>
              </Link>
              <div className="wz-topbar__panel">
                <i className="bi bi-palette2" aria-hidden="true" />
                <div className="wz-topbar__panel-copy">
                  <strong>{planLabel}</strong>
                  <Link to={withBase("/profile?tab=uiTheme")}>{statusLabel} theme linked to admin branding</Link>
                </div>
              </div>
              <div className="wz-profile-chip">
                <div className="wz-profile-chip__avatar">{userInitials}</div>
                <div>
                  <strong>{userDisplayName}</strong>
                  <span>{productLabel}</span>
                </div>
              </div>
            </div>
          </header>
        ) : null}

        <main className="main wz-main-stage">
          <div className="wz-alert-stack">
            {state.archived ? (
              <div className="alert alert-danger d-flex align-items-center justify-content-between">
                <div>
                  Account archived. Renew to restore access.
                </div>
                <a className="btn btn-outline-light btn-sm" href={`/app${archivedBillingPath}`}>
                  Renew Now
                </a>
              </div>
            ) : null}
            {productSlug === "ai-chatbot" && aiChatbotTrial ? (
              <div className="alert alert-warning d-flex align-items-center justify-content-between">
                <div>
                  Trial ends on <strong>{trialEndText || "soon"}</strong>. Upgrade to keep access.
                </div>
                <a className="btn btn-outline-light btn-sm" href="/pricing/">
                  Upgrade
                </a>
              </div>
            ) : null}
            {upgradeAlertMessage ? (
              <div className="alert alert-warning alert-dismissible fade show">
                {upgradeAlertMessage}
                <button
                  type="button"
                  className="btn-close"
                  onClick={() => setUpgradeAlertMessage("")}
                />
              </div>
            ) : null}
          </div>

          <div className={isSaasAdminRoute ? "wz-route-surface wz-route-surface--saas-admin" : "wz-route-surface"}>
            <Routes location={normalizedLocation}>
          <Route
            path="/"
            element={
              isDealer
                ? <Navigate to={withBase("/dealer-dashboard")} replace />
                : isSaasAdmin
                ? <Navigate to="/saas-admin" replace />
                : productSlug === "storage"
                ? <StorageDashboardPage subscriptions={state.subscriptions} />
                : productSlug === "ai-chatbot"
                ? <AiChatbotDashboardPage subscriptions={state.subscriptions} />
                : productSlug === "imposition-software"
                ? <ImpositionProductDashboardPage isAdmin={isAdmin} subscriptions={state.subscriptions} />
                : productSlug === "business-autopilot-erp"
                ? (
                  !autopilotAccessResolved
                    ? <div className="card p-3">Loading access...</div>
                    : hasBusinessAutopilotSectionAccess(autopilotAccessRecord, "dashboard", isAdmin)
                    ? (
                      <Suspense fallback={<div className="card p-3">Loading modules...</div>}>
                        <BusinessAutopilotDashboardPage
                          modules={autopilotModules}
                          catalog={autopilotCatalog}
                          canManageModules={autopilotCanManageModules}
                          isOrgAdmin={isAdmin}
                          onToggleModule={toggleAutopilotModule}
                          savingModuleSlug={autopilotSavingSlug}
                          moduleError={autopilotModuleError}
                          productBasePath={basePath}
                          subscriptions={state.subscriptions}
                        />
                      </Suspense>
                    )
                    : <BusinessAutopilotAccessDenied sectionLabel="Dashboard" />
                )
                : productSlug === "whatsapp-automation"
                ? <WhatsappAutomationOverviewPage subscriptions={state.subscriptions} />
                : productSlug === "digital-automation"
                ? <DigitalAutomationOverviewPage subscriptions={state.subscriptions} />
                : <DashboardPage productSlug={productSlug} subscriptions={state.subscriptions} />
            }
          />
          <Route
            path="/crm"
            element={renderRouteElement(
              <Suspense fallback={<div className="card p-3">Loading module...</div>}>
                <BusinessAutopilotModulePage moduleKey="crm" title="CRM" />
              </Suspense>,
              {
                pending: isBusinessAutopilot && (!autopilotModulesResolved || !autopilotAccessResolved),
                allowed:
                  isBusinessAutopilot &&
                  autopilotModules.some((module) => module.slug === "crm") &&
                  hasBusinessAutopilotSectionAccess(autopilotAccessRecord, "crm", isAdmin),
              }
            )}
          />
          <Route
            path="/hrm"
            element={renderRouteElement(
              <Suspense fallback={<div className="card p-3">Loading module...</div>}>
                <BusinessAutopilotModulePage moduleKey="hrm" title="HR" />
              </Suspense>,
              {
                pending: isBusinessAutopilot && (!autopilotModulesResolved || !autopilotAccessResolved),
                allowed:
                  isBusinessAutopilot &&
                  autopilotModules.some((module) => module.slug === "hrm") &&
                  hasBusinessAutopilotSectionAccess(autopilotAccessRecord, "hr", isAdmin),
              }
            )}
          />
          <Route
            path="/projects"
            element={renderRouteElement(
              <Suspense fallback={<div className="card p-3">Loading module...</div>}>
                <BusinessAutopilotModulePage moduleKey="projects" title="Project Management" />
              </Suspense>,
              {
                pending: isBusinessAutopilot && (!autopilotModulesResolved || !autopilotAccessResolved),
                allowed:
                  isBusinessAutopilot &&
                  autopilotModules.some((module) => module.slug === "projects") &&
                  hasBusinessAutopilotSectionAccess(autopilotAccessRecord, "projects", isAdmin),
              }
            )}
          />
          <Route
            path="/projects/:projectId"
            element={renderRouteElement(
              <Suspense fallback={<div className="card p-3">Loading project...</div>}>
                <BusinessAutopilotModulePage moduleKey="project-details" title="Project Details" />
              </Suspense>,
              {
                pending: isBusinessAutopilot && (!autopilotModulesResolved || !autopilotAccessResolved),
                allowed:
                  isBusinessAutopilot &&
                  autopilotModules.some((module) => module.slug === "projects") &&
                  hasBusinessAutopilotSectionAccess(autopilotAccessRecord, "projects", isAdmin),
              }
            )}
          />
          <Route
            path="/accounts/subscriptions"
            element={<Navigate to={withBase("/subscriptions")} replace />}
          />
          <Route
            path="/subscriptions"
            element={renderRouteElement(
              <Suspense fallback={<div className="card p-3">Loading module...</div>}>
                <BusinessAutopilotModulePage moduleKey="subscriptions" title="Subscriptions" />
              </Suspense>,
              {
                pending: isBusinessAutopilot && (!autopilotModulesResolved || !autopilotAccessResolved),
                allowed:
                  isBusinessAutopilot &&
                  autopilotModules.some((module) => module.slug === "subscriptions") &&
                  hasBusinessAutopilotSectionAccess(autopilotAccessRecord, "subscriptions", isAdmin),
              }
            )}
          />
          <Route
            path="/accounts"
            element={renderRouteElement(
              <Suspense fallback={<div className="card p-3">Loading module...</div>}>
                <BusinessAutopilotModulePage moduleKey="accounts" title="Accounts" />
              </Suspense>,
              {
                pending: isBusinessAutopilot && (!autopilotModulesResolved || !autopilotAccessResolved),
                allowed:
                  isBusinessAutopilot &&
                  autopilotModules.some((module) => module.slug === "accounts") &&
                  hasBusinessAutopilotSectionAccess(autopilotAccessRecord, "accounts", isAdmin),
              }
            )}
          />
          <Route
            path="/ticketing"
            element={renderRouteElement(
              <Suspense fallback={<div className="card p-3">Loading module...</div>}>
                <BusinessAutopilotModulePage moduleKey="ticketing" title="Ticketing System" />
              </Suspense>,
              {
                pending: isBusinessAutopilot && (!autopilotModulesResolved || !autopilotAccessResolved),
                allowed:
                  isBusinessAutopilot &&
                  autopilotModules.some((module) => module.slug === "ticketing") &&
                  hasBusinessAutopilotSectionAccess(autopilotAccessRecord, "ticketing", isAdmin),
              }
            )}
          />
          <Route
            path="/stocks"
            element={renderRouteElement(
              <Suspense fallback={<div className="card p-3">Loading module...</div>}>
                <BusinessAutopilotModulePage moduleKey="stocks" title="Stocks Management" />
              </Suspense>,
              {
                pending: isBusinessAutopilot && (!autopilotModulesResolved || !autopilotAccessResolved),
                allowed:
                  isBusinessAutopilot &&
                  autopilotModules.some((module) => module.slug === "stocks") &&
                  hasBusinessAutopilotSectionAccess(autopilotAccessRecord, "stocks", isAdmin),
              }
            )}
          />
          <Route
            path="/files"
            element={productSlug === "storage" ? <StorageExplorerPage /> : <Navigate to={withBase("/")} replace />}
          />
          <Route
            path="/users"
            element={renderRouteElement(
              productSlug === "storage"
                ? <StorageUsersPage />
                : productSlug === "imposition-software"
                ? <ImpositionProductUsersPage />
                : <BusinessAutopilotUsersPage />,
              {
                pending: isBusinessAutopilot && (!autopilotModulesResolved || !autopilotAccessResolved),
                allowed:
                  (productSlug === "storage" && isAdmin) ||
                  (productSlug === "imposition-software" && isAdmin) ||
                  (isBusinessAutopilot &&
                    autopilotCanManageUsers &&
                    hasBusinessAutopilotSectionAccess(autopilotAccessRecord, "users", isAdmin)),
              }
            )}
          />
          <Route
            path="/activity"
            element={isMonitorProduct ? <LiveActivityPage /> : <Navigate to={withBase("/")} replace />}
          />
          <Route
            path="/work-activity"
            element={isMonitorProduct ? <WorkActivityLogPage /> : <Navigate to={withBase("/")} replace />}
          />
          <Route
            path="/app-usage"
            element={isMonitorProduct && allowAppUsage ? <AppUsagePage /> : <Navigate to={withBase("/")} replace />}
          />
          <Route
            path="/app-urls"
            element={isMonitorProduct ? <AppUrlsPage /> : <Navigate to={withBase("/")} replace />}
          />
          <Route
            path="/gaming-ott"
            element={isMonitorProduct && allowGamingOttUsage ? <GamingOttUsagePage /> : <Navigate to={withBase("/")} replace />}
          />
          <Route
            path="/employees"
            element={isMonitorProduct && !isHrView ? <EmployeesPage /> : <Navigate to={withBase("/")} replace />}
          />
          <Route
            path="/employees/add"
            element={isMonitorProduct && !isHrView ? <EmployeeForm /> : <Navigate to={withBase("/")} replace />}
          />
          <Route
            path="/employees/:employeeId"
            element={isMonitorProduct && !isHrView ? <EmployeeDetail /> : <Navigate to={withBase("/")} replace />}
          />
          <Route
            path="/employees/:employeeId/edit"
            element={isMonitorProduct && !isHrView ? <EmployeeForm /> : <Navigate to={withBase("/")} replace />}
          />
          <Route
            path="/screenshots"
            element={isMonitorProduct ? <ScreenshotsPage /> : <Navigate to={withBase("/")} replace />}
          />
          <Route
            path="/company"
            element={isMonitorProduct && isAdmin && !isHrView ? <CompanySettingsPage /> : <Navigate to={withBase("/")} replace />}
          />
          <Route
            path="/privacy"
            element={isMonitorProduct && isAdmin && !isHrView ? <PrivacySettingsPage /> : <Navigate to={withBase("/")} replace />}
          />
          <Route
            path="/company/edit"
            element={isMonitorProduct && isAdmin && !isHrView ? <CompanyEditPage /> : <Navigate to={withBase("/")} replace />}
          />
          <Route
            path="/billing"
            element={
              (isAdmin && !isHrView) ||
              (isBusinessAutopilot &&
                autopilotAccessResolved &&
                hasBusinessAutopilotSectionAccess(autopilotAccessRecord, "billing", isAdmin))
                ? <BillingPage />
                : isBusinessAutopilot
                ? <BusinessAutopilotAccessDenied sectionLabel="Billing" />
                : <Navigate to={withBase("/")} replace />
            }
          />
          <Route
            path="/plans"
            element={
              (isAdmin && !isHrView) ||
              (isBusinessAutopilot &&
                autopilotAccessResolved &&
                hasBusinessAutopilotSectionAccess(autopilotAccessRecord, "plans", isAdmin))
                ? <PlansPage />
                : isBusinessAutopilot
                ? <BusinessAutopilotAccessDenied sectionLabel="Plans" />
                : <Navigate to={withBase("/")} replace />
            }
          />
          <Route
            path="/profile"
            element={
              (isAdmin && !isHrView) ||
              (isBusinessAutopilot
                && hasBusinessAutopilotDefaultProfileAccess(isBusinessAutopilot, state.profile?.role, isAdmin)) ||
              (isBusinessAutopilot &&
                autopilotAccessResolved &&
                hasBusinessAutopilotSectionAccess(autopilotAccessRecord, "profile", isAdmin))
                ? <ProfilePage />
                : isBusinessAutopilot
                ? <BusinessAutopilotAccessDenied sectionLabel="Profile" />
                : <Navigate to={withBase("/")} replace />
            }
          />
          <Route
            path="/media-library"
            element={
              productSlug === "whatsapp-automation" && isAdmin && !isHrView && !isDealer && !isSaasAdminRoute
                ? <OrgMediaLibraryPage />
                : <Navigate to={withBase("/")} replace />
            }
          />
          <Route
            path="/dashboard/company-profile"
            element={productSlug === "whatsapp-automation" ? <WhatsappAutomationCompanyProfilePage /> : <Navigate to={withBase("/")} replace />}
          />
          <Route
            path="/dashboard/whatsapp-automation"
            element={productSlug === "whatsapp-automation" ? <WhatsappAutomationDashboardPage subscriptions={state.subscriptions} /> : <Navigate to={withBase("/")} replace />}
          />
          <Route
            path="/dashboard/catalogue"
            element={productSlug === "whatsapp-automation" ? <WebsiteCatalogueDashboardPage /> : <Navigate to={withBase("/")} replace />}
          />
          <Route
            path="/dashboard/digital-card"
            element={productSlug === "whatsapp-automation" ? <DigitalBusinessCardDashboardPage currentUsername={state.user?.username || ""} /> : <Navigate to={withBase("/")} replace />}
          />
          <Route
            path="/dashboard/digital-card/analytics"
            element={productSlug === "whatsapp-automation" ? <DigitalCardVisitorAnalyticsPage /> : <Navigate to={withBase("/")} replace />}
          />
          <Route
            path="/dashboard/social-media-automation"
            element={
              productSlug === "digital-automation"
                ? <SocialMediaAutomationPage />
                : <Navigate to={withBase("/")} replace />
            }
          />
          <Route
            path="/dashboard/ai-content-writer"
            element={
              productSlug === "digital-automation"
                ? <DigitalAutomationModulePage moduleKey="ai" />
                : <Navigate to={withBase("/")} replace />
            }
          />
          <Route
            path="/dashboard/wordpress-auto-post"
            element={
              productSlug === "digital-automation"
                ? <DigitalAutomationModulePage moduleKey="wordpress" />
                : <Navigate to={withBase("/")} replace />
            }
          />
          <Route
            path="/dashboard/hosting-billing"
            element={
              productSlug === "digital-automation"
                ? <Navigate to={withBase("/dashboard/subscription")} replace />
                : <Navigate to={withBase("/")} replace />
            }
          />
          <Route
            path="/dashboard/subscription"
            element={
              productSlug === "digital-automation"
                ? <DigitalAutomationSubscriptionPage subscriptions={state.subscriptions} />
                : <Navigate to={withBase("/")} replace />
            }
          />
          <Route
            path="/notifications-inbox"
            element={
              !isDealer && (!isBusinessAutopilot || !autopilotAccessResolved || hasBusinessAutopilotSectionAccess(autopilotAccessRecord, "inbox", isAdmin))
                ? <OrgInboxPage productSlug={productSlug} />
                : isBusinessAutopilot
                ? <BusinessAutopilotAccessDenied sectionLabel="Inbox" />
                : <Navigate to={withBase("/")} replace />
            }
          />
          <Route
            path="/org-admin/media-library"
            element={
              isAdmin && !isHrView
                ? <Navigate to={withBase("/media-library")} replace />
                : <Navigate to={withBase("/")} replace />
            }
          />
          <Route
            path="/inbox"
            element={
              (productSlug === "ai-chatbot" && (isAdmin || isAiChatbotAgent))
                ? <AiChatbotInboxPage />
                : <Navigate to={withBase("/")} replace />
            }
          />
          <Route
            path="/widgets"
            element={
              (productSlug === "ai-chatbot" && isAdmin)
                ? <AiChatbotWidgetsPage />
                : <Navigate to={withBase("/")} replace />
            }
          />
          <Route
            path="/leads"
            element={
              (productSlug === "ai-chatbot" && isAdmin)
                ? <AiChatbotLeadsPage />
                : <Navigate to={withBase("/")} replace />
            }
          />
          <Route
            path="/agents"
            element={
              (productSlug === "ai-chatbot" && isAdmin)
                ? <AiChatbotAgentsPage />
                : <Navigate to={withBase("/")} replace />
            }
          />
          <Route
            path="/history"
            element={
              (productSlug === "ai-chatbot" && isAdmin)
                ? <AiChatbotHistoryPage />
                : <Navigate to={withBase("/")} replace />
            }
          />
          <Route
            path="/chat-settings"
            element={
              (productSlug === "ai-chatbot" && isAdmin)
                ? <AiChatbotChatSettingsPage />
                : <Navigate to={withBase("/")} replace />
            }
          />
          <Route
            path="/dealer-dashboard"
            element={isDealer ? <DealerDashboardPage /> : <Navigate to={withBase("/")} replace />}
          />
          <Route
            path="/dealer-referrals"
            element={isDealer ? <DealerReferralsPage /> : <Navigate to={withBase("/")} replace />}
          />
          <Route
            path="/dealer-payouts"
            element={isDealer ? <DealerPayoutPage /> : <Navigate to={withBase("/")} replace />}
          />
          <Route
            path="/dealer-billing"
            element={isDealer ? <DealerBillingPage /> : <Navigate to={withBase("/")} replace />}
          />
          <Route
            path="/dealer-plan"
            element={isDealer ? <DealerPlanPage /> : <Navigate to={withBase("/")} replace />}
          />
          <Route
            path="/dealer-profile"
            element={isDealer ? <DealerProfilePage /> : <Navigate to={withBase("/")} replace />}
          />
          <Route
            path="/dealer-bank-transfer/:transferId"
            element={isDealer ? <DealerBankTransferPage /> : <Navigate to={withBase("/")} replace />}
          />
          <Route
            path="/saas-admin"
            element={isSaasAdmin ? <SaasAdminPage /> : <Navigate to={withBase("/")} replace />}
          />
          <Route
            path="/saas-admin/organizations"
            element={isSaasAdmin ? <SaasAdminOrganizationsPage /> : <Navigate to={withBase("/")} replace />}
          />
          <Route
            path="/saas-admin/observability"
            element={isSaasAdmin ? <SaasAdminObservabilityPage /> : <Navigate to={withBase("/")} replace />}
          />
          <Route
            path="/saas-admin/inbox"
            element={isSaasAdmin ? <SaasAdminInboxPage /> : <Navigate to={withBase("/")} replace />}
          />
          <Route
            path="/saas-admin/retention-policy"
            element={isSaasAdmin ? <SaasAdminRetentionPolicyPage /> : <Navigate to={withBase("/")} replace />}
          />
          <Route
            path="/saas-admin/application-downloads"
            element={isSaasAdmin ? <SaasAdminApplicationDownloadsPage /> : <Navigate to={withBase("/")} replace />}
          />
          <Route
            path="/saas-admin/storage"
            element={isSaasAdmin ? <SaasAdminStorageSettingsPage /> : <Navigate to={withBase("/")} replace />}
          />
          <Route
            path="/saas-admin/ses"
            element={isSaasAdmin ? <SaasAdminSESSettingsPage /> : <Navigate to={withBase("/")} replace />}
          />
          <Route
            path="/saas-admin/whatsapp-cloud"
            element={isSaasAdmin ? <SaasAdminWhatsAppSettingsPage /> : <Navigate to={withBase("/")} replace />}
          />
          <Route
            path="/saas-admin/system-backup-manager"
            element={isSaasAdmin ? <SaasAdminSystemBackupManagerPage /> : <Navigate to={withBase("/")} replace />}
          />
          <Route
            path="/saas-admin/media-library"
            element={isSaasAdmin ? <MediaLibraryPage scope="saas" /> : <Navigate to={withBase("/")} replace />}
          />
          <Route
            path="/saas-admin/backup-activity"
            element={isSaasAdmin ? <SaasAdminBackupActivityPage /> : <Navigate to={withBase("/")} replace />}
          />
          <Route
            path="/saas-admin/server-monitoring"
            element={isSaasAdmin ? <SaasAdminServerMonitoringPage /> : <Navigate to={withBase("/")} replace />}
          />
          <Route
            path="/saas-admin/server-monitoring/settings"
            element={isSaasAdmin ? <SaasAdminServerMonitoringSettingsPage /> : <Navigate to={withBase("/")} replace />}
          />
          <Route
            path="/saas-admin/server-monitoring/alerts"
            element={isSaasAdmin ? <SaasAdminServerMonitoringAlertsPage /> : <Navigate to={withBase("/")} replace />}
          />
          <Route
            path="/saas-admin/server-monitoring/:serverId"
            element={isSaasAdmin ? <SaasAdminServerMonitoringDetailPage /> : <Navigate to={withBase("/")} replace />}
          />
          <Route
            path="/backup-history"
            element={isAdmin ? <BackupHistoryPage /> : <Navigate to={withBase("/")} replace />}
          />
          <Route
            path="/user/:id"
            element={productSlug === "storage" && isAdmin ? <StorageExplorerPage /> : <Navigate to={withBase("/")} replace />}
          />
          <Route
            path="/saas-admin/billing"
            element={isSaasAdmin ? <SaasAdminBillingPage /> : <Navigate to={withBase("/")} replace />}
          />
          <Route
            path="/saas-admin/organizations/:orgId"
            element={isSaasAdmin ? <SaasAdminOrganizationPage /> : <Navigate to={withBase("/")} replace />}
          />
          <Route
            path="/saas-admin/dealers/:dealerId"
            element={isSaasAdmin ? <SaasAdminDealerPage /> : <Navigate to={withBase("/")} replace />}
          />
          <Route
            path="/saas-admin/referrals"
            element={isSaasAdmin ? <SaasAdminReferralsPage /> : <Navigate to={withBase("/")} replace />}
          />
          <Route
            path="/saas-admin/profile"
            element={isSaasAdmin ? <SaasAdminProfilePage /> : <Navigate to={withBase("/")} replace />}
          />
          <Route
            path="/saas-admin/products/:slug"
            element={isSaasAdmin ? <SaasAdminProductPage /> : <Navigate to={withBase("/")} replace />}
          />
          <Route
            path="/saas-admin/products/:slug/retention-policy"
            element={isSaasAdmin ? <SaasAdminProductPage /> : <Navigate to={withBase("/")} replace />}
          />
          <Route
            path="/bank-transfer"
            element={isAdmin ? <BankTransferPage /> : <Navigate to={withBase("/")} replace />}
          />
          <Route
            path="/bank-transfer/:transferId"
            element={isAdmin ? <BankTransferPage /> : <Navigate to={withBase("/")} replace />}
          />
              <Route path="*" element={<Navigate to={withBase("/")} replace />} />
            </Routes>
          </div>
          {isBusinessAutopilot && !isDealer && !isSaasAdminRoute && autopilotAccessResolved ? (
            <BusinessAutopilotAssistantWidget
              enabled={hasBusinessAutopilotSectionAccess(autopilotAccessRecord, autopilotCurrentSectionKey || "dashboard", isAdmin)}
              isAdmin={isAdmin}
              subscriptions={state.subscriptions}
            />
          ) : null}
        </main>
      </div>

      {showFreePlanModal ? (
        <div className="modal-overlay" onClick={() => setShowFreePlanModal(false)}>
          <div className="modal-panel" onClick={(event) => event.stopPropagation()}>
            <h5>Free Plan Will Expire - {productLabel}</h5>
            <div className="text-secondary mb-2">
              Your <strong>{productLabel}</strong> free plan will expire on <strong>{currentFreePlanExpiry}</strong>.
              Please choose a paid plan to continue without interruption.
            </div>
            <div className="d-flex justify-content-end gap-2 mt-3">
              <Link
                className="btn btn-primary"
                to={withBase("/plans")}
                onClick={() => setShowFreePlanModal(false)}
              >
                View Plans
              </Link>
              <button
                type="button"
                className="btn btn-outline-secondary"
                onClick={() => setShowFreePlanModal(false)}
              >
                Remind Me Later
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function BrandingShell({ children, getProductRoute }) {
  const location = useLocation();
  const match = getProductRoute(location.pathname);
  const productSlug = match ? match.slug : "worksuite";
  return (
    <BrandingProvider productKey={productSlug}>
      {children}
    </BrandingProvider>
  );
}

function ForceHtmlLoginRedirect() {
  const location = useLocation();

  useEffect(() => {
    const target = `/auth/login/?next=${encodeURIComponent(`/app${location.pathname}${location.search}${location.hash}`)}`;
    window.location.replace(target);
  }, [location.pathname, location.search, location.hash]);

  return (
    <div className="page-center">
      <div className="panel">
        <p>Redirecting to login...</p>
      </div>
    </div>
  );
}

function GlobalDeleteConfirmBridge() {
  const confirm = useConfirm();

  useEffect(() => {
    const DELETE_CONFIRM_FLAG = "wzDeleteConfirmed";
    const DELETE_CONFIRM_MESSAGE = "Are you sure you want to delete this item?";
    const DELETE_CONFIRM_TITLE = "Confirm Delete";

    const getActionElement = (target) => {
      if (!(target instanceof Element)) {
        return null;
      }
      return target.closest("button, a, [role='button'], input[type='button'], input[type='submit']");
    };

    const getActionText = (el) => {
      const text = el instanceof HTMLInputElement ? (el.value || "") : (el.textContent || "");
      return [
        text,
        el.getAttribute("aria-label") || "",
        el.getAttribute("title") || "",
        el.getAttribute("data-action") || "",
        el.className || "",
      ]
        .join(" ")
        .toLowerCase();
    };

    const isDeleteIntent = (el) => {
      if (!(el instanceof HTMLElement)) {
        return false;
      }
      if (el.hasAttribute("data-no-delete-confirm")) {
        return false;
      }
      if (el.closest("[data-confirm-dialog='true']")) {
        return false;
      }
      if (el.hasAttribute("disabled") || el.getAttribute("aria-disabled") === "true") {
        return false;
      }
      const text = getActionText(el);
      if (!text) {
        return false;
      }
      if (text.includes("deleted items")) {
        return false;
      }
      return (
        text.includes("delete")
        || text.includes("remove")
        || text.includes("btn-danger")
        || text.includes("outline-danger")
      );
    };

    const onGlobalDeleteClickCapture = (event) => {
      const actionEl = getActionElement(event.target);
      if (!actionEl || !isDeleteIntent(actionEl)) {
        return;
      }
      if (actionEl.dataset[DELETE_CONFIRM_FLAG] === "true") {
        delete actionEl.dataset[DELETE_CONFIRM_FLAG];
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      if (typeof event.stopImmediatePropagation === "function") {
        event.stopImmediatePropagation();
      }

      window.setTimeout(async () => {
        const confirmed = await confirm({
          title: DELETE_CONFIRM_TITLE,
          message: DELETE_CONFIRM_MESSAGE,
          confirmText: "Yes",
          cancelText: "No",
          confirmVariant: "danger",
        });
        if (!confirmed) {
          return;
        }
        actionEl.dataset[DELETE_CONFIRM_FLAG] = "true";
        if (typeof actionEl.click === "function") {
          actionEl.click();
        }
      }, 0);
    };

    document.addEventListener("click", onGlobalDeleteClickCapture, true);
    return () => {
      document.removeEventListener("click", onGlobalDeleteClickCapture, true);
    };
  }, [confirm]);

  return null;
}

export default function App() {
  const [state, setState] = useState(emptyState);

  const applyProfileState = useCallback((data) => {
    if (typeof window !== "undefined") {
      window.__WZ_READ_ONLY__ = Boolean(data.read_only);
      window.__WZ_ARCHIVED__ = Boolean(data.archived);
    }
    setOrgTimezone(data.org_timezone || "UTC");
    setState({
      loading: false,
      authenticated: Boolean(data.authenticated),
      user: data.user || null,
      profile: data.profile || null,
      archived: Boolean(data.archived),
      dealer: data.dealer || null,
      dealerOnboarding: data.dealer_onboarding || null,
      allowAppUsage: data.allow_app_usage !== false,
      allowGamingOttUsage: data.allow_gaming_ott_usage !== false,
      themePrimary: data.theme_primary || "",
      themeSecondary: data.theme_secondary || "",
      sidebarMenuStyle: normalizeSidebarMenuStyle(data.sidebar_menu_style),
      freePlanPopup: Boolean(data.free_plan_popup),
      freePlanExpiry: data.free_plan_expiry || "",
      onboarding: data.onboarding || { enabled: false, state: "active" },
      readOnly: Boolean(data.read_only),
      sessionTimeoutMinutes: Number.parseInt(data.session_timeout_minutes, 10) || 30,
      subscriptions: []
    });
  }, []);

  const loadSubscriptions = useCallback(async () => {
    const response = await fetch("/api/auth/subscriptions", {
      credentials: "include"
    });
    if (!response.ok) {
      setState((prev) => ({ ...prev, subscriptions: [] }));
      return;
    }
    const data = await response.json();
    setState((prev) => ({ ...prev, subscriptions: data.subscriptions || [] }));
  }, []);

  const loadProfile = useCallback(async () => {
    const browserTimezone = getBrowserTimezone();
    const response = await fetch("/api/auth/me", {
      credentials: "include",
      headers: browserTimezone ? { "X-Browser-Timezone": browserTimezone } : {}
    });
    if (response.status === 401) {
      setState({ ...emptyState, loading: false });
      return;
    }
    if (!response.ok) {
      setState({ ...emptyState, loading: false });
      return;
    }
    const data = await response.json();
    applyProfileState(data);
    await loadSubscriptions();
  }, [applyProfileState, loadSubscriptions]);

  useEffect(() => {
    const handleSidebarStyleChange = (event) => {
      const nextStyle = normalizeSidebarMenuStyle(event?.detail?.style);
      setState((prev) => ({ ...prev, sidebarMenuStyle: nextStyle }));
    };
    window.addEventListener("wz:sidebar-menu-style-change", handleSidebarStyleChange);
    return () => {
      window.removeEventListener("wz:sidebar-menu-style-change", handleSidebarStyleChange);
    };
  }, []);

  useEffect(() => {
    const TEXT_INPUT_TYPES = new Set(["text", "email", "url", "tel", "search", "password", "number"]);
    const DEFAULT_INPUT_MAX = 120;
    const DEFAULT_TEXTAREA_MAX = 500;
    const TEXT_OVERFLOW_CLASS = "wz-text-limit-overflow";
    const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const WEB_RE = /^(https?:\/\/|www\.|[a-z0-9][a-z0-9.-]*\.[a-z]{2,})(\/.*)?$/i;

    const semanticText = (el) => [
      el.getAttribute("name"),
      el.id,
      el.getAttribute("placeholder"),
      el.getAttribute("aria-label"),
      el.className,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    const hasAny = (text, keywords) => keywords.some((key) => text.includes(key));
    const hasWord = (text, word) => {
      if (!word) return false;
      const escaped = String(word).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      return new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, "i").test(String(text || ""));
    };
    const hasPanField = (text) => hasWord(text, "pan") || text.includes("permanent account number");

    const inferLimit = (el, fallback) => {
      const text = semanticText(el);
      if (hasAny(text, ["otp", "pin"])) return 8;
      if (hasAny(text, ["gstin"])) return 15;
      if (hasPanField(text)) return 10;
      if (hasAny(text, ["postal", "pincode", "zip"])) return 10;
      if (hasAny(text, ["phone", "mobile", "whatsapp"])) return 15;
      if (hasAny(text, ["slug"])) return 40;
      if (hasAny(text, ["search", "query"])) return 80;
      if (hasAny(text, ["email"])) return 30;
      if (hasAny(text, ["website", "url", "domain", "link"])) return 180;
      if (hasAny(text, ["company"])) return 45;
      if (hasAny(text, ["title", "subject", "label", "category"])) return 40;
      if (hasAny(text, ["first name", "last name", "contact name", "person name", "full name", "name"])) return 30;
      if (hasAny(text, ["state", "city", "country", "district"])) return 60;
      if (hasAny(text, ["address"])) return el instanceof HTMLTextAreaElement ? 180 : 130;
      if (hasAny(text, ["password"])) return 64;
      if (hasAny(text, ["price", "amount", "cost", "qty", "quantity", "rate"])) return 8;
      if (hasAny(text, ["description", "message", "note", "content", "bio", "about", "highlight"])) {
        return el instanceof HTMLTextAreaElement ? 350 : 180;
      }
      return fallback;
    };

    const sanitizeValue = (el, value) => {
      const text = semanticText(el);
      let next = String(value ?? "");
      if (hasAny(text, ["phone", "mobile", "whatsapp"])) {
        next = next.replace(/[^\d+]/g, "");
      } else if (hasAny(text, ["postal", "pincode", "zip", "otp", "pin"])) {
        next = next.replace(/[^\d]/g, "");
      } else if (hasAny(text, ["gstin"])) {
        next = next.toUpperCase().replace(/[^A-Z0-9]/g, "");
      } else if (hasPanField(text)) {
        next = next.toUpperCase().replace(/[^A-Z0-9]/g, "");
      } else if (hasAny(text, ["slug"])) {
        next = next.toLowerCase().replace(/[^a-z0-9-]/g, "");
      }
      return next;
    };

    const setValidationMessage = (el) => {
      const value = String(el.value || "").trim();
      if (el.dataset.wzLimitOverflow === "true") {
        const limit = Number(el.dataset.wzLimit || 0);
        const extra = Number(el.dataset.wzLimitExtra || 0);
        el.setCustomValidity(
          `Maximum ${limit} characters allowed. Remove ${extra} extra characters to continue.`
        );
        return;
      }
      if (!value) {
        el.setCustomValidity("");
        return;
      }
      const text = semanticText(el);
      if ((el.type === "email" || hasAny(text, ["email"])) && !EMAIL_RE.test(value)) {
        el.setCustomValidity("Please enter a valid email address.");
        return;
      }
      if ((el.type === "url" || hasAny(text, ["website", "url", "domain", "link"])) && !WEB_RE.test(value)) {
        el.setCustomValidity("Please enter a valid website URL.");
        return;
      }
      el.setCustomValidity("");
    };

    const shouldSkipGlobalLimit = (el) => {
      if (!el || !(el instanceof Element)) {
        return true;
      }
      if (el.hasAttribute("data-no-global-limit")) {
        return true;
      }
      return Boolean(el.closest("[data-wz-skip-global-limit='true']"));
    };

    const applyGlobalTextLimit = (event) => {
      const el = event?.target;
      if (shouldSkipGlobalLimit(el)) {
        return;
      }
      const setOverflowState = (inputEl, limit, valueLength) => {
        const overflow = valueLength > limit;
        if (overflow) {
          inputEl.dataset.wzLimitOverflow = "true";
          inputEl.dataset.wzLimit = String(limit);
          inputEl.dataset.wzLimitExtra = String(valueLength - limit);
          inputEl.classList.add(TEXT_OVERFLOW_CLASS);
        } else {
          delete inputEl.dataset.wzLimitOverflow;
          delete inputEl.dataset.wzLimit;
          delete inputEl.dataset.wzLimitExtra;
          inputEl.classList.remove(TEXT_OVERFLOW_CLASS);
        }
      };
      const applyLimitToInput = (inputEl) => {
        const limit = inputEl.maxLength > 0 ? inputEl.maxLength : inferLimit(inputEl, DEFAULT_INPUT_MAX);
        const sanitized = sanitizeValue(inputEl, inputEl.value);
        const trimmed = sanitized.slice(0, limit);
        if (trimmed !== inputEl.value) {
          inputEl.value = trimmed;
        }
        setOverflowState(inputEl, limit, String(inputEl.value || "").length);
        setValidationMessage(inputEl);
      };
      if (el instanceof HTMLInputElement) {
        if (!TEXT_INPUT_TYPES.has(el.type)) {
          return;
        }
        applyLimitToInput(el);
        return;
      }
      if (el instanceof HTMLTextAreaElement) {
        const limit = el.maxLength > 0 ? el.maxLength : inferLimit(el, DEFAULT_TEXTAREA_MAX);
        const sanitized = sanitizeValue(el, el.value);
        const trimmed = sanitized.slice(0, limit);
        if (trimmed !== el.value) {
          el.value = trimmed;
        }
        setOverflowState(el, limit, String(el.value || "").length);
        setValidationMessage(el);
      }
    };

    const onBlur = (event) => {
      const el = event?.target;
      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
        if (!shouldSkipGlobalLimit(el)) {
          applyGlobalTextLimit({ target: el });
          setValidationMessage(el);
        }
      }
    };

    const onSubmit = (event) => {
      const form = event?.target;
      if (!(form instanceof HTMLFormElement)) {
        return;
      }
      const controls = form.querySelectorAll("input, textarea");
      controls.forEach((el) => {
        if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
          if (!shouldSkipGlobalLimit(el)) {
            applyGlobalTextLimit({ target: el });
          }
        }
      });
      if (!form.checkValidity()) {
        event.preventDefault();
        event.stopPropagation();
      }
    };

    document.addEventListener("input", applyGlobalTextLimit, true);
    document.addEventListener("blur", onBlur, true);
    document.addEventListener("submit", onSubmit, true);
    return () => {
      document.removeEventListener("input", applyGlobalTextLimit, true);
      document.removeEventListener("blur", onBlur, true);
      document.removeEventListener("submit", onSubmit, true);
    };
  }, []);

  useEffect(() => {
    let active = true;
    async function boot() {
      try {
        await loadProfile();
      } catch (error) {
        if (active) {
          setState({ ...emptyState, loading: false });
        }
      }
    }

    boot();
    return () => {
      active = false;
    };
  }, [loadProfile]);

  useEffect(() => {
    if (!state.authenticated) {
      return undefined;
    }
    const timeoutMinutes = Math.max(1, Number.parseInt(state.sessionTimeoutMinutes, 10) || 30);
    const timeoutMs = timeoutMinutes * 60 * 1000;
    let timerId = null;
    const resetTimer = () => {
      if (timerId) {
        window.clearTimeout(timerId);
      }
      timerId = window.setTimeout(async () => {
        rememberLastSignoutTime();
        try {
          await apiFetch("/api/auth/logout", { method: "POST", body: "{}" });
        } catch {
          // Ignore logout request errors and continue redirect.
        }
        const nextPath = `/app${window.location.pathname}${window.location.search}${window.location.hash}`;
        window.location.replace(`/auth/login/?next=${encodeURIComponent(nextPath)}`);
      }, timeoutMs);
    };
    const events = ["mousemove", "keydown", "click", "scroll", "touchstart"];
    events.forEach((eventName) => window.addEventListener(eventName, resetTimer, true));
    resetTimer();
    return () => {
      if (timerId) {
        window.clearTimeout(timerId);
      }
      events.forEach((eventName) => window.removeEventListener(eventName, resetTimer, true));
    };
  }, [state.authenticated, state.sessionTimeoutMinutes]);

  const productRoutes = [
    { prefix: "/work-suite", slug: "worksuite", label: "Work Suite" },
    { prefix: "/ai-chatbot", slug: "ai-chatbot", label: "AI Chatbot" },
    { prefix: "/storage", slug: "storage", label: "Online Storage" },
    { prefix: "/imposition", slug: "imposition-software", label: "Print Marks" },
    { prefix: "/business-autopilot-erp", slug: "business-autopilot-erp", label: "Business Autopilot", redirectPrefix: "/business-autopilot" },
    { prefix: "/business-autopilot", slug: "business-autopilot-erp", label: "Business Autopilot" },
    { prefix: "/whatsapp-automation", slug: "whatsapp-automation", label: "Whatsapp Automation" },
    { prefix: "/digital-automation", slug: "digital-automation", label: "Digital Automation" },
    { prefix: "/ai-chat-widget", slug: "ai-chat-widget", label: "AI Chat Widget" },
    { prefix: "/digital-card", slug: "digital-card", label: "Digital Card" }
  ];
  const legacyProductRoutes = [
    { prefix: "/monitor", slug: "worksuite", label: "Work Suite", redirectPrefix: "/work-suite" },
    { prefix: "/worksuite", slug: "worksuite", label: "Work Suite", redirectPrefix: "/work-suite" }
  ];

  function getProductRoute(pathname) {
    const routeList = [...legacyProductRoutes, ...productRoutes];
    return routeList.find((route) => pathname === route.prefix || pathname.startsWith(`${route.prefix}/`)) || null;
  }

  function inferProductSlugFromInnerPath(pathname) {
    const candidate = String(pathname || "").trim();
    if (!candidate || candidate === "/") {
      return "";
    }

    const productSpecificPrefixes = [
      { slug: "worksuite", prefixes: ["/activity", "/work-activity", "/app-usage", "/app-urls", "/gaming-ott", "/employees", "/screenshots", "/company", "/privacy"] },
      { slug: "storage", prefixes: ["/files", "/user"] },
      { slug: "ai-chatbot", prefixes: ["/inbox", "/widgets", "/leads", "/agents", "/history", "/chat-settings"] },
      { slug: "business-autopilot-erp", prefixes: ["/crm", "/hrm", "/projects", "/accounts", "/subscriptions", "/ticketing", "/stocks"] },
      { slug: "whatsapp-automation", prefixes: ["/dashboard/company-profile", "/dashboard/whatsapp-automation", "/dashboard/catalogue", "/dashboard/digital-card", "/media-library"] },
    ];

    const match = productSpecificPrefixes.find((entry) =>
      entry.prefixes.some((prefix) => candidate === prefix || candidate.startsWith(`${prefix}/`))
    );
    if (match) {
      return match.slug;
    }

    return "";
  }

  function getSubscriptionEntry(slug) {
    const normalizedSlug = slug === "worksuite" ? "monitor" : slug;
    const list = state.subscriptions || [];
    return list.find((sub) => sub.product_slug === normalizedSlug) || null;
  }

  function getSubscriptionStatus(slug) {
    const entry = getSubscriptionEntry(slug);
    if (!entry) {
      return "none";
    }
    const status = (entry.status || "").toLowerCase();
    if (status === "trialing") {
      const trialEnd = entry.trial_end ? new Date(entry.trial_end) : null;
      if (trialEnd && trialEnd.getTime() >= Date.now()) {
        return "active";
      }
      return "trial_ended";
    }
    return status;
  }

  function AccessDenied({ label, status, productSlug, planIsFree, billingCycle, expiryDate }) {
    const { branding } = useBranding();
    const monitorLabel =
      branding?.aliases?.ui?.monitorLabel || branding?.displayName || "Work Suite";
    const displayLabel = productSlug === "worksuite" ? monitorLabel : label;
    const isPending = status === "pending";
    const isRejected = status === "rejected";
    const isExpired = status === "expired";
    const isTrialEnded = status === "trial_ended";
    const needsPaidPlan = Boolean(planIsFree && (isExpired || isTrialEnded));
    const normalizedBillingCycle = String(billingCycle || "").trim().toLowerCase();
    const billingCycleLabel = normalizedBillingCycle === "yearly" ? "yearly" : "monthly";
    const expiryDateText = expiryDate ? formatDeviceDate(expiryDate, "") : "";
    const title = isPending
      ? "Awaiting Admin Approval"
      : isRejected
      ? "Subscription Rejected"
      : isTrialEnded
      ? "Trial Ended"
      : isExpired
      ? "Subscription Expired"
      : "Subscription Required";
    const message = isPending
      ? "Your payment is under review. You will get access once approved."
      : isRejected
      ? "Your payment was rejected. Please renew to activate access."
      : isTrialEnded
      ? "Trial ended. Please upgrade your plan."
      : isExpired
      ? (
          expiryDateText
            ? `Your ${billingCycleLabel} plan expired on ${expiryDateText}. To continue this service, please renew the product plan.`
            : `Your ${billingCycleLabel} plan has expired. To continue this service, please renew the product plan.`
        )
      : "You need an active plan to open this dashboard.";
    const actionLabel = isPending
      ? "View My Account"
      : needsPaidPlan
      ? "View Plans"
      : isRejected || isExpired || isTrialEnded
      ? "Renew Plan"
      : "View Pricing";
    const actionHref = isPending
      ? "/my-account/"
      : needsPaidPlan
      ? `/pricing/?product=${productSlug || "worksuite"}`
      : isRejected || isExpired
      ? `/my-account/billing/renew/start/?product=${productSlug || "worksuite"}`
      : "/pricing/";

    return (
      <div className="page-center">
        <div className="panel">
          <h1>{displayLabel} Dashboard</h1>
          <p>{title}</p>
          <div className="text-secondary">{message}</div>
          <div className="button-row">
            <a className="app-btn app-btn-primary" href={actionHref}>
              {actionLabel}
            </a>
          </div>
        </div>
      </div>
    );
  }

  function ProductShell() {
    const { branding } = useBranding();
    const monitorLabel =
      branding?.aliases?.ui?.monitorLabel || branding?.displayName || "Work Suite";
    const location = useLocation();
    const isDealer = state.profile?.role === "dealer";
    const isSaasAdminPath = location.pathname.startsWith("/saas-admin");
    const isSaasAdminUser = Boolean(
      state.user?.is_superuser ||
      state.user?.is_staff ||
      state.profile?.role === "superadmin" ||
      state.profile?.role === "super_admin"
    );
    const archivedBillingPath = isSaasAdminUser ? "/saas-admin/billing" : "/billing";

    if (isSaasAdminPath) {
      if (isSaasAdminUser) {
        return <AppShell state={state} productPrefix="" productSlug="saas-admin" />;
      }
      return <Navigate to="/" replace />;
    }
    if (state.archived) {
      if (location.pathname !== archivedBillingPath) {
        return <Navigate to={archivedBillingPath} replace />;
      }
    }

    if (location.pathname === "/" || location.pathname === "") {
      return <Navigate to="/work-suite/" replace />;
    }

    const match = getProductRoute(location.pathname);
    if (!match && location.pathname && location.pathname !== "/" && !isDealer && !isSaasAdminPath) {
      const inferredProductSlug = inferProductSlugFromInnerPath(location.pathname);
      const lastProductSlug = typeof window !== "undefined"
        ? String(safeLocalStorageGet(LAST_APP_PRODUCT_KEY, "") || window.__WZ_PRODUCT_SLUG__ || "worksuite").trim()
        : "worksuite";
      const preferredProductSlug = inferredProductSlug || lastProductSlug;
      const preferredProductRoute = productRoutes.find((route) => route.slug === preferredProductSlug) || productRoutes[0];
      if (preferredProductRoute?.prefix) {
        return (
          <Navigate
            to={`${preferredProductRoute.prefix}${location.pathname}${location.search || ""}${location.hash || ""}`}
            replace
          />
        );
      }
    }
    if (match?.redirectPrefix && location.pathname.startsWith(match.prefix)) {
      const nextPath = match.redirectPrefix + location.pathname.slice(match.prefix.length);
      return <Navigate to={`${nextPath}${location.search || ""}${location.hash || ""}`} replace />;
    }
    const productSlug = match ? match.slug : "worksuite";
    const prefix = match ? match.prefix : "";
      const entry = getSubscriptionEntry(productSlug);
      const status = getSubscriptionStatus(productSlug);

      if (status !== "active") {
        if (productSlug === "business-autopilot-erp") {
          return <AppShell state={state} productPrefix={prefix} productSlug={productSlug} />;
        }
        if (productSlug === "storage" && (status === "trial_ended" || status === "expired")) {
          return <AppShell state={state} productPrefix={prefix} productSlug={productSlug} />;
        }
        return (
          <AccessDenied
            label={productSlug === "worksuite" ? monitorLabel : match?.label || "Work Suite"}
            status={status}
            productSlug={productSlug}
            planIsFree={entry?.plan_is_free}
            billingCycle={entry?.billing_cycle}
            expiryDate={entry?.ends_at}
          />
        );
      }
    return <AppShell state={state} productPrefix={prefix} productSlug={productSlug} />;
  }

  return (
    <UploadAlertProvider>
      <ConfirmProvider>
        <GlobalDeleteConfirmBridge />
        <BrowserRouter basename="/app">
          <BrandingShell getProductRoute={getProductRoute}>
            {state.loading ? (
              <div className="page-center">
                <div className="panel">
                  <div className="spinner" />
                  <p>Loading dashboard...</p>
                </div>
              </div>
            ) : state.authenticated ? (
              <ErrorBoundary>
                <ProductShell />
              </ErrorBoundary>
            ) : (
              <ForceHtmlLoginRedirect />
            )}
          </BrandingShell>
        </BrowserRouter>
      </ConfirmProvider>
    </UploadAlertProvider>
  );
}
