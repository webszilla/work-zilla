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
import SaasAdminWhatsAppSettingsPage from "./pages/SaasAdminWhatsAppSettingsPage.jsx";
import SaasAdminSystemBackupManagerPage from "./pages/SaasAdminSystemBackupManagerPage.jsx";
import SaasAdminBillingPage from "./pages/SaasAdminBillingPage.jsx";
import SaasAdminBackupActivityPage from "./pages/SaasAdminBackupActivityPage.jsx";
import BackupHistoryPage from "./pages/BackupHistoryPage.jsx";
import SaasAdminServerMonitoringPage from "./pages/SaasAdminServerMonitoringPage.jsx";
import SaasAdminServerMonitoringDetailPage from "./pages/SaasAdminServerMonitoringDetailPage.jsx";
import SaasAdminServerMonitoringSettingsPage from "./pages/SaasAdminServerMonitoringSettingsPage.jsx";
import SaasAdminServerMonitoringAlertsPage from "./pages/SaasAdminServerMonitoringAlertsPage.jsx";
import MediaLibraryPage from "./pages/MediaLibraryPage.jsx";
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
import WebsiteCatalogueDashboardPage from "./pages/WebsiteCatalogueDashboardPage.jsx";
import DigitalBusinessCardDashboardPage from "./pages/DigitalBusinessCardDashboardPage.jsx";
import { ConfirmProvider } from "./components/ConfirmDialog.jsx";
import ErrorBoundary from "./components/ErrorBoundary.jsx";
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
  subscriptions: []
};

const THEME_OVERRIDE_KEY = "wz_brand_theme_override";
const THEME_LAST_KEY = "wz_brand_theme";
const THEME_PREV_KEY = "wz_brand_theme_prev";

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
  { label: "Inbox", path: "/notifications-inbox", icon: "bi-inbox", productOnly: "storage" },
  { label: "Users", path: "/users", icon: "bi-people", productOnly: "storage", adminOnly: true },
  { label: "Users", path: "/users", icon: "bi-people", productOnly: "imposition-software", adminOnly: true },
  { label: "Users", path: "/users", icon: "bi-people", productOnly: "business-autopilot-erp", adminOnly: true },
  { label: "Dashboard", path: "/", icon: "bi-speedometer2" },
  { label: "Inbox", path: "/notifications-inbox", icon: "bi-inbox", productOnly: "worksuite" },
  { label: "Inbox", path: "/notifications-inbox", icon: "bi-inbox", productOnly: "business-autopilot-erp" },
  { label: "Inbox", path: "/notifications-inbox", icon: "bi-inbox", productOnly: "whatsapp-automation" },
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
  { label: "Website Catalogue", path: "/dashboard/catalogue", icon: "bi-grid-3x3-gap", productOnly: "whatsapp-automation" },
  { label: "Digital Business Card", path: "/dashboard/digital-card", icon: "bi-person-vcard", productOnly: "whatsapp-automation" },
  { label: "CRM", path: "/crm", icon: "bi-people", productOnly: "business-autopilot-erp", moduleKey: "crm" },
  { label: "HR", path: "/hrm", icon: "bi-person-badge", productOnly: "business-autopilot-erp", moduleKey: "hrm" },
  { label: "Projects", path: "/projects", icon: "bi-diagram-3", productOnly: "business-autopilot-erp", moduleKey: "projects" },
  { label: "Accounts", path: "/accounts", icon: "bi-calculator", productOnly: "business-autopilot-erp", moduleKey: "accounts" },
  { label: "Ticketing", path: "/ticketing", icon: "bi-life-preserver", productOnly: "business-autopilot-erp", moduleKey: "ticketing" },
  { label: "Inventory", path: "/stocks", icon: "bi-box-seam", productOnly: "business-autopilot-erp", moduleKey: "stocks" },
  { label: "Billing", path: "/billing", icon: "bi-credit-card", adminOnly: true },
  { label: "Plans", path: "/plans", icon: "bi-clipboard-check", adminOnly: true },
  { label: "Profile", path: "/profile", icon: "bi-person", adminOnly: true }
];

const saasAdminPages = [
  { key: "overview", label: "Overview", path: "/saas-admin", icon: "bi-grid-1x2" },
  { key: "inbox", label: "Inbox", path: "/saas-admin/inbox", icon: "bi-inbox" },
  { key: "observability", label: "Observability", path: "/saas-admin/observability", icon: "bi-bar-chart" },
  { key: "products", label: "Products", path: "/saas-admin", hash: "#products", icon: "bi-boxes" },
  { key: "organizations", label: "Organizations", path: "/saas-admin/organizations", icon: "bi-building" },
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
  const [autopilotSavingSlug, setAutopilotSavingSlug] = useState("");
  const [autopilotModuleError, setAutopilotModuleError] = useState("");
  const [theme, setTheme] = useState(() => {
    if (typeof window === "undefined") {
      return "dark";
    }
    const stored = window.localStorage.getItem("wz_theme");
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
  const allowAppUsage = state.allowAppUsage !== false;
  const allowGamingOttUsage = state.allowGamingOttUsage !== false;
  const themePrimary = state.themePrimary;
  const themeSecondary = state.themeSecondary;
  const sidebarMenuStyle = state.sidebarMenuStyle === "compact" ? "compact" : "default";
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
    ? "Business Autopilot ERP"
    : productSlug === "imposition-software"
    ? "Imposition Software"
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
  const isBackupActivitySection = location.pathname.startsWith("/saas-admin/backup-activity");
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
    !isBackupActivitySection &&
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
      window.localStorage.setItem("wz_theme", theme);
      window.__WZ_PRODUCT_SLUG__ = productSlug;
    }
  }, [theme, productSlug]);

  useEffect(() => {
    const serverTheme = {
      primary: themePrimary,
      secondary: themeSecondary
    };
    const overrideRaw = typeof window !== "undefined"
      ? window.localStorage.getItem(THEME_OVERRIDE_KEY)
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
        ? window.localStorage.getItem(THEME_LAST_KEY)
        : null;
      if (prev && prev !== next && typeof window !== "undefined") {
        window.localStorage.setItem(THEME_PREV_KEY, prev);
      }
      if (typeof window !== "undefined") {
        window.localStorage.setItem(THEME_LAST_KEY, next);
      }
    }
    applyThemeColors(themeToApply);
  }, [themePrimary, themeSecondary]);

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
    const lastShown = window.localStorage.getItem(popupKey);
    if (lastShown === popupDate) {
      setShowFreePlanModal(false);
      return;
    }
    setShowFreePlanModal(true);
    window.localStorage.setItem(popupKey, popupDate);
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
          setAutopilotModuleError("");
        }
        return;
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
        }
      } catch (_error) {
        if (active) {
          setAutopilotModules([]);
          setAutopilotCatalog([]);
          setAutopilotCanManageModules(false);
          setAutopilotCanManageUsers(false);
          setAutopilotModuleError("Unable to load modules.");
        }
      }
    }
    loadBusinessModules();
    return () => {
      active = false;
    };
  }, [isBusinessAutopilot]);

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
    if (item.productOnly && item.productOnly !== productSlug) {
      return false;
    }
    if (isBusinessAutopilot && item.moduleKey) {
      return autopilotModules.some((module) => module.slug === item.moduleKey);
    }
    if (item.saasAdminOnly) {
      return isSaasAdmin;
    }
    if (item.adminOnly) {
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
    if (!isBusinessAutopilot && !isWhatsappAutomationProduct) {
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
          ["/billing", 7],
          ["/plans", 8],
          ["/profile", 9],
        ])
      : new Map([
          ["/", 0],
          ["/notifications-inbox", 1],
          ["/crm", 2],
          ["/hrm", 3],
          ["/projects", 4],
          ["/accounts", 5],
          ["/ticketing", 6],
          ["/stocks", 7],
          ["/users", 8],
          ["/billing", 9],
          ["/plans", 10],
          ["/profile", 11]
        ]);
    return [...uniqueNavItems].sort((a, b) => {
      if (isWhatsappAutomationProduct) {
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
  }, [allowedNavItems, isBusinessAutopilot, isWhatsappAutomationProduct]);

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
    if (!navBase) {
      return path;
    }
    if (path === "/") {
      return navBase;
    }
    return `${navBase}${path.startsWith("/") ? path : `/${path}`}`;
  };

  function handleSidebarNavClick() {
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

  return (
    <div
      className={`app-shell wz-admin-shell ${isSaasAdminRoute ? "saas-admin" : ""} ${
        sidebarCollapsed ? "sidebar-collapsed" : ""
      } ${sidebarMenuStyle === "compact" ? "sidebar-style-compact" : "sidebar-style-default"}`}
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
            <div className="wz-sidebar__label">React Admin</div>
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
                    title={item.label}
                    onClick={handleSidebarNavClick}
                    className={({ isActive }) => `nav-link wz-nav-link ${isActive ? "active" : ""}`}
                  >
                    {item.icon ? (
                      <i className={`bi ${item.icon} nav-icon wz-nav-icon`} aria-hidden="true" />
                    ) : null}
                    <span className="wz-nav-copy">{item.label}</span>
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
                  } else if (item.key === "server-monitoring") {
                    isActive = isServerMonitoringSection;
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
                        title={item.label}
                        onClick={handleSidebarNavClick}
                      >
                        {item.icon ? (
                          <i className={`bi ${item.icon} nav-icon wz-nav-icon`} aria-hidden="true" />
                        ) : null}
                        <span className="wz-nav-copy">{item.label}</span>
                      </a>
                    );
                  }
                  return (
                    <NavLink
                      key={item.key}
                      to={navPath(href)}
                      title={item.label}
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
                      <span className="wz-nav-copy">{item.label}</span>
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
                      title={item.label}
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
                      <span className="wz-nav-copy">{item.label}</span>
                    </NavLink>
                  )
                ))}
            <a className="nav-link wz-nav-link" href="/auth/logout/" onClick={handleSidebarNavClick} title="Logout">
              <i className="bi bi-box-arrow-right nav-icon wz-nav-icon" aria-hidden="true" />
              <span className="wz-nav-copy">Logout</span>
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
            <div className="wz-topbar__panel">
              <i className="bi bi-buildings" aria-hidden="true" />
              <div className="wz-topbar__panel-copy">
                <strong>{orgNameForUi}</strong>
                <span>{roleDisplayName}</span>
              </div>
            </div>
            <div className="wz-topbar__panel">
              <i className="bi bi-palette2" aria-hidden="true" />
              <div className="wz-topbar__panel-copy">
                <strong>{planLabel}</strong>
                <span>{statusLabel} theme linked to admin branding</span>
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

          <div className="wz-route-surface">
            <Routes location={normalizedLocation}>
          <Route
            path="/"
            element={
              isDealer
                ? <Navigate to={withBase("/dealer-dashboard")} replace />
                : isSaasAdmin
                ? <Navigate to={withBase("/saas-admin")} replace />
                : productSlug === "storage"
                ? <StorageDashboardPage subscriptions={state.subscriptions} />
                : productSlug === "ai-chatbot"
                ? <AiChatbotDashboardPage subscriptions={state.subscriptions} />
                : productSlug === "imposition-software"
                ? <ImpositionProductDashboardPage isAdmin={isAdmin} />
                : productSlug === "business-autopilot-erp"
                ? (
                  <Suspense fallback={<div className="card p-3">Loading modules...</div>}>
                    <BusinessAutopilotDashboardPage
                      modules={autopilotModules}
                      catalog={autopilotCatalog}
                      canManageModules={autopilotCanManageModules}
                      onToggleModule={toggleAutopilotModule}
                      savingModuleSlug={autopilotSavingSlug}
                      moduleError={autopilotModuleError}
                      productBasePath={basePath}
                      subscriptions={state.subscriptions}
                    />
                  </Suspense>
                )
                : <DashboardPage productSlug={productSlug} subscriptions={state.subscriptions} />
            }
          />
          <Route
            path="/crm"
            element={
              isBusinessAutopilot && autopilotModules.some((module) => module.slug === "crm")
                ? (
                  <Suspense fallback={<div className="card p-3">Loading module...</div>}>
                    <BusinessAutopilotModulePage moduleKey="crm" title="CRM" />
                  </Suspense>
                )
                : <Navigate to={withBase("/")} replace />
            }
          />
          <Route
            path="/hrm"
            element={
              isBusinessAutopilot && autopilotModules.some((module) => module.slug === "hrm")
                ? (
                  <Suspense fallback={<div className="card p-3">Loading module...</div>}>
                    <BusinessAutopilotModulePage moduleKey="hrm" title="HR" />
                  </Suspense>
                )
                : <Navigate to={withBase("/")} replace />
            }
          />
          <Route
            path="/projects"
            element={
              isBusinessAutopilot && autopilotModules.some((module) => module.slug === "projects")
                ? (
                  <Suspense fallback={<div className="card p-3">Loading module...</div>}>
                    <BusinessAutopilotModulePage moduleKey="projects" title="Project Management" />
                  </Suspense>
                )
                : <Navigate to={withBase("/")} replace />
            }
          />
          <Route
            path="/accounts"
            element={
              isBusinessAutopilot && autopilotModules.some((module) => module.slug === "accounts")
                ? (
                  <Suspense fallback={<div className="card p-3">Loading module...</div>}>
                    <BusinessAutopilotModulePage moduleKey="accounts" title="Accounts" />
                  </Suspense>
                )
                : <Navigate to={withBase("/")} replace />
            }
          />
          <Route
            path="/ticketing"
            element={
              isBusinessAutopilot && autopilotModules.some((module) => module.slug === "ticketing")
                ? (
                  <Suspense fallback={<div className="card p-3">Loading module...</div>}>
                    <BusinessAutopilotModulePage moduleKey="ticketing" title="Ticketing System" />
                  </Suspense>
                )
                : <Navigate to={withBase("/")} replace />
            }
          />
          <Route
            path="/stocks"
            element={
              isBusinessAutopilot && autopilotModules.some((module) => module.slug === "stocks")
                ? (
                  <Suspense fallback={<div className="card p-3">Loading module...</div>}>
                    <BusinessAutopilotModulePage moduleKey="stocks" title="Stocks Management" />
                  </Suspense>
                )
                : <Navigate to={withBase("/")} replace />
            }
          />
          <Route
            path="/files"
            element={productSlug === "storage" ? <StorageExplorerPage /> : <Navigate to={withBase("/")} replace />}
          />
          <Route
            path="/users"
            element={
              productSlug === "storage" && isAdmin
                ? <StorageUsersPage />
                : productSlug === "imposition-software" && isAdmin
                ? <ImpositionProductUsersPage />
                : isBusinessAutopilot && autopilotCanManageUsers
                ? <BusinessAutopilotUsersPage />
                : <Navigate to={withBase("/")} replace />
            }
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
              isAdmin && !isHrView
                ? <BillingPage />
                : <Navigate to={withBase("/")} replace />
            }
          />
          <Route
            path="/plans"
            element={
              isAdmin && !isHrView
                ? <PlansPage />
                : <Navigate to={withBase("/")} replace />
            }
          />
          <Route
            path="/profile"
            element={
              isAdmin && !isHrView
                ? <ProfilePage />
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
            path="/notifications-inbox"
            element={!isDealer ? <OrgInboxPage /> : <Navigate to={withBase("/")} replace />}
          />
          <Route
            path="/org-admin/media-library"
            element={isAdmin && !isHrView ? <MediaLibraryPage scope="org" /> : <Navigate to={withBase("/")} replace />}
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
            path="/saas-admin/storage"
            element={isSaasAdmin ? <SaasAdminStorageSettingsPage /> : <Navigate to={withBase("/")} replace />}
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
              <Link className="btn btn-primary" to={withBase("/plans")}>
                View Plans
              </Link>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setShowFreePlanModal(false)}
              >
                Later
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
      sidebarMenuStyle: data.sidebar_menu_style === "compact" ? "compact" : "default",
      freePlanPopup: Boolean(data.free_plan_popup),
      freePlanExpiry: data.free_plan_expiry || "",
      onboarding: data.onboarding || { enabled: false, state: "active" },
      readOnly: Boolean(data.read_only),
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
      const nextStyle = event?.detail?.style === "compact" ? "compact" : "default";
      setState((prev) => ({ ...prev, sidebarMenuStyle: nextStyle }));
    };
    window.addEventListener("wz:sidebar-menu-style-change", handleSidebarStyleChange);
    return () => {
      window.removeEventListener("wz:sidebar-menu-style-change", handleSidebarStyleChange);
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

  const productRoutes = [
    { prefix: "/work-suite", slug: "worksuite", label: "Work Suite" },
    { prefix: "/ai-chatbot", slug: "ai-chatbot", label: "AI Chatbot" },
    { prefix: "/storage", slug: "storage", label: "Online Storage" },
    { prefix: "/imposition", slug: "imposition-software", label: "Imposition Software" },
    { prefix: "/business-autopilot", slug: "business-autopilot-erp", label: "Business Autopilot ERP" },
    { prefix: "/whatsapp-automation", slug: "whatsapp-automation", label: "Whatsapp Automation" },
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

  function AccessDenied({ label, status, productSlug, planIsFree }) {
    const { branding } = useBranding();
    const monitorLabel =
      branding?.aliases?.ui?.monitorLabel || branding?.displayName || "Work Suite";
    const displayLabel = productSlug === "worksuite" ? monitorLabel : label;
    const isPending = status === "pending";
    const isRejected = status === "rejected";
    const isExpired = status === "expired";
    const isTrialEnded = status === "trial_ended";
    const needsPaidPlan = Boolean(planIsFree && (isExpired || isTrialEnded));
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
      ? "Your subscription has expired. Please renew to continue."
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
    if (match?.redirectPrefix && location.pathname.startsWith(match.prefix)) {
      const nextPath = match.redirectPrefix + location.pathname.slice(match.prefix.length);
      return <Navigate to={`${nextPath}${location.search || ""}${location.hash || ""}`} replace />;
    }
    const productSlug = match ? match.slug : "worksuite";
    const prefix = match ? match.prefix : "";
      if (productSlug === "whatsapp-automation" && (location.pathname === prefix || location.pathname === `${prefix}/`)) {
        return <Navigate to={`${prefix}/dashboard/whatsapp-automation`} replace />;
      }
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
          />
        );
      }
    return <AppShell state={state} productPrefix={prefix} productSlug={productSlug} />;
  }

  return (
    <ConfirmProvider>
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
  );
}
