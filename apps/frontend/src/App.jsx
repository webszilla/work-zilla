import { useCallback, useEffect, useState } from "react";
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
import SaasAdminRetentionPolicyPage from "./pages/SaasAdminRetentionPolicyPage.jsx";
import SaasAdminStorageSettingsPage from "./pages/SaasAdminStorageSettingsPage.jsx";
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
import AiChatbotInboxPage from "./pages/AiChatbotInboxPage.jsx";
import AiChatbotWidgetsPage from "./pages/AiChatbotWidgetsPage.jsx";
import AiChatbotLeadsPage from "./pages/AiChatbotLeadsPage.jsx";
import AiChatbotAgentsPage from "./pages/AiChatbotAgentsPage.jsx";
import AiChatbotDashboardPage from "./pages/AiChatbotDashboardPage.jsx";
import AiChatbotHistoryPage from "./pages/AiChatbotHistoryPage.jsx";
import AiChatbotChatSettingsPage from "./pages/AiChatbotChatSettingsPage.jsx";
import { ConfirmProvider } from "./components/ConfirmDialog.jsx";
import ErrorBoundary from "./components/ErrorBoundary.jsx";
import { BrandingProvider, useBranding } from "./branding/BrandingContext.jsx";
import { formatDeviceDate, setOrgTimezone } from "./lib/datetime.js";
import { getBrowserTimezone } from "./lib/timezones.js";

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

const reactPages = [
  { label: "Dashboard", path: "/", icon: "bi-speedometer2", productOnly: "storage" },
  { label: "Files", path: "/files", icon: "bi-cloud", productOnly: "storage" },
  { label: "Users", path: "/users", icon: "bi-people", productOnly: "storage", adminOnly: true },
  { label: "Dashboard", path: "/", icon: "bi-speedometer2" },
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
  { label: "Billing", path: "/billing", icon: "bi-credit-card", adminOnly: true },
  { label: "Plans", path: "/plans", icon: "bi-clipboard-check", adminOnly: true },
  { label: "Profile", path: "/profile", icon: "bi-person", adminOnly: true },
  { label: "SaaS Admin", path: "/saas-admin", icon: "bi-grid-1x2", saasAdminOnly: true }
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
  const onboarding = state.onboarding || { enabled: false, state: "active" };
  const isSaasAdminRoute = location.pathname.startsWith("/saas-admin");
  const isMonitorProduct = productSlug === "worksuite";
  const productLabel = productSlug === "ai-chatbot"
    ? "AI Chatbot"
    : productSlug === "worksuite"
    ? monitorLabel
    : productSlug === "storage"
    ? "Online Storage"
    : productSlug === "saas-admin"
    ? "SaaS Admin"
    : "Work Zilla";
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
    setShowFreePlanModal(Boolean(state.freePlanPopup && state.freePlanExpiry));
  }, [state.freePlanPopup, state.freePlanExpiry]);

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
    if (item.productOnly && item.productOnly !== productSlug) {
      return false;
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

  return (
    <div className={`app-shell ${isSaasAdminRoute ? "saas-admin" : ""} ${sidebarCollapsed ? "sidebar-collapsed" : ""}`}>
      <aside className="sidebar">
        <div className="brand">
          <span>Work Zilla</span>
          <span>{productLabel}</span>
        </div>
        <button
          type="button"
          className="sidebar-toggle"
          onClick={() => setSidebarCollapsed((prev) => !prev)}
          aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          <i className={`bi ${sidebarCollapsed ? "bi-chevron-right" : "bi-chevron-left"}`} aria-hidden="true" />
          <span className="visually-hidden">
            {sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          </span>
        </button>
        <div className="org">{orgDisplayName || "Organization"}</div>
        <nav className="nav">
          {isDealer
            ? dealerNavItems.map((item) => (
                <NavLink
                  key={item.path}
                  to={navPath(item.path)}
                  end={item.path === "/dealer-dashboard"}
                  title={item.label}
                  onClick={handleSidebarNavClick}
                  className={({ isActive }) => `nav-link ${isActive ? "active" : ""}`}
                >
                  {item.icon ? (
                    <i className={`bi ${item.icon} nav-icon`} aria-hidden="true" />
                  ) : null}
                  <span>{item.label}</span>
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
                      className="nav-link"
                      title={item.label}
                      onClick={handleSidebarNavClick}
                    >
                      {item.icon ? (
                        <i className={`bi ${item.icon} nav-icon`} aria-hidden="true" />
                      ) : null}
                      <span>{item.label}</span>
                    </a>
                  );
                }
                return (
                  <NavLink
                    key={item.key}
                    to={navPath(href)}
                    title={item.label}
                    onClick={handleSidebarNavClick}
                    className={() => `nav-link ${isActive ? "active" : ""}`}
                  >
                    {item.icon ? (
                      <i className={`bi ${item.icon} nav-icon`} aria-hidden="true" />
                    ) : null}
                    <span>{item.label}</span>
                  </NavLink>
                );
              })
            : allowedNavItems.map((item) => (
                <NavLink
                  key={item.path}
                  to={navPath(item.path)}
                  end={item.path === "/"}
                  onClick={(event) => {
                    handleSidebarNavClick();
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
                    `nav-link ${isActive ? "active" : ""} ${
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
                    <i className={`bi ${item.icon} nav-icon`} aria-hidden="true" />
                  ) : null}
                  <span>{item.label}</span>
                </NavLink>
              ))}
          <a className="nav-link" href="/auth/logout/" onClick={handleSidebarNavClick} title="Logout">
            <i className="bi bi-box-arrow-right nav-icon" aria-hidden="true" />
            <span>Logout</span>
          </a>
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
        </nav>
      </aside>

      <main className="main">
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
                : <DashboardPage productSlug={productSlug} subscriptions={state.subscriptions} />
            }
          />
          <Route
            path="/files"
            element={productSlug === "storage" ? <StorageExplorerPage /> : <Navigate to={withBase("/")} replace />}
          />
          <Route
            path="/users"
            element={productSlug === "storage" && isAdmin ? <StorageUsersPage /> : <Navigate to={withBase("/")} replace />}
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
            element={isAdmin && !isHrView ? <BillingPage /> : <Navigate to={withBase("/")} replace />}
          />
          <Route
            path="/plans"
            element={isAdmin && !isHrView ? <PlansPage /> : <Navigate to={withBase("/")} replace />}
          />
          <Route
            path="/profile"
            element={isAdmin && !isHrView ? <ProfilePage /> : <Navigate to={withBase("/")} replace />}
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
      </main>

      {showFreePlanModal ? (
        <div className="modal-overlay" onClick={() => setShowFreePlanModal(false)}>
          <div className="modal-panel" onClick={(event) => event.stopPropagation()}>
            <h5>Free Plan Will Expire</h5>
            <div className="text-secondary mb-2">
              Your free plan will expire on <strong>{state.freePlanExpiry}</strong>.
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

function UnauthenticatedShell({
  loginError,
  loginForm,
  loginSubmitting,
  onLoginSubmit,
  onFormChange
}) {
  const { branding } = useBranding();
  const monitorLabel =
    branding?.aliases?.ui?.monitorLabel || branding?.displayName || "Work Suite";

  return (
    <div className="page-center">
      <div className="panel">
        <h1>Welcome to Work Zilla {monitorLabel}</h1>
        <p>Please log in to access the dashboard.</p>
        {loginError ? (
          <div className="alert alert-danger" role="alert">
            {loginError}
          </div>
        ) : null}
        <form onSubmit={onLoginSubmit} className="d-grid gap-2">
          <input
            type="email"
            className="form-control"
            placeholder="Email"
            value={loginForm.email}
            onChange={(event) =>
              onFormChange((prev) => ({ ...prev, email: event.target.value }))
            }
          />
          <input
            type="password"
            className="form-control"
            placeholder="Password"
            value={loginForm.password}
            onChange={(event) =>
              onFormChange((prev) => ({ ...prev, password: event.target.value }))
            }
          />
          <button className="app-btn app-btn-primary" type="submit" disabled={loginSubmitting}>
            {loginSubmitting ? "Signing in..." : "Login"}
          </button>
        </form>
        <div className="button-row">
          <a className="app-btn app-btn-secondary" href="/auth/signup/">
            Create Account
          </a>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const [state, setState] = useState(emptyState);
  const [loginForm, setLoginForm] = useState({ email: "", password: "" });
  const [loginError, setLoginError] = useState("");
  const [loginSubmitting, setLoginSubmitting] = useState(false);

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

  async function handleLoginSubmit(event) {
    event.preventDefault();
    if (!loginForm.email || !loginForm.password) {
      setLoginError("Email and password are required.");
      return;
    }
    setLoginError("");
    setLoginSubmitting(true);
    try {
      await fetch("/api/auth/csrf", { credentials: "include" });
      const response = await fetch("/api/auth/login", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          email: loginForm.email,
          password: loginForm.password
        })
      });
      if (!response.ok) {
        let message = "Login failed. Check credentials and try again.";
        try {
          const data = await response.json();
          if (data?.error) {
            message = data.error;
          }
        } catch (error) {
          // ignore JSON parse error
        }
        setLoginError(message);
        return;
      }
      await loadProfile();
    } catch (error) {
      setLoginError("Login failed. Check credentials and try again.");
    } finally {
      setLoginSubmitting(false);
    }
  }

  const productRoutes = [
    { prefix: "/worksuite", slug: "worksuite", label: "Work Suite" },
    { prefix: "/ai-chatbot", slug: "ai-chatbot", label: "AI Chatbot" },
    { prefix: "/storage", slug: "storage", label: "Online Storage" },
    { prefix: "/ai-chat-widget", slug: "ai-chat-widget", label: "AI Chat Widget" },
    { prefix: "/digital-card", slug: "digital-card", label: "Digital Card" }
  ];
  const legacyProductRoutes = [
    { prefix: "/monitor", slug: "worksuite", label: "Work Suite", redirectPrefix: "/worksuite" }
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

    const match = getProductRoute(location.pathname);
    if (match?.redirectPrefix && location.pathname.startsWith(match.prefix)) {
      const nextPath = match.redirectPrefix + location.pathname.slice(match.prefix.length);
      return <Navigate to={`${nextPath}${location.search || ""}${location.hash || ""}`} replace />;
    }
    const productSlug = match ? match.slug : "worksuite";
    const prefix = match ? match.prefix : "";
      const entry = getSubscriptionEntry(productSlug);
      const status = getSubscriptionStatus(productSlug);

      if (status !== "active") {
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
            <UnauthenticatedShell
              loginError={loginError}
              loginForm={loginForm}
              loginSubmitting={loginSubmitting}
              onLoginSubmit={handleLoginSubmit}
              onFormChange={setLoginForm}
            />
          )}
        </BrandingShell>
      </BrowserRouter>
    </ConfirmProvider>
  );
}
