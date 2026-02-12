import { useEffect, useMemo, useState } from "react";
import Sidebar from "./components/Sidebar.jsx";
import LoginScreen from "./screens/LoginScreen.jsx";
import LaunchScreen from "./screens/LaunchScreen.jsx";
import MonitorScreen from "./screens/MonitorScreen.jsx";
import DashboardScreen from "./screens/DashboardScreen.jsx";
import SyncStatusScreen from "./screens/SyncStatusScreen.jsx";
import StorageUsageScreen from "./screens/StorageUsageScreen.jsx";
import ChooseFoldersScreen from "./screens/ChooseFoldersScreen.jsx";
import SyncActivityScreen from "./screens/SyncActivityScreen.jsx";
import ErrorsScreen from "./screens/ErrorsScreen.jsx";
import SettingsScreen from "./screens/SettingsScreen.jsx";
import StorageFilesScreen from "./screens/StorageFilesScreen.jsx";

const storageScreens = [
  { id: "dashboard", label: "Dashboard" },
  { id: "files", label: "File Storage" },
  { id: "sync-group", label: "Local Auto Sync (Optional)", type: "group" },
  { id: "sync-status", label: "Sync Status" },
  { id: "choose-folders", label: "Choose Local Folders" },
  { id: "activity", label: "Sync Activity" },
  { id: "storage", label: "Storage Usage" },
  { id: "errors", label: "Errors" },
  { id: "settings", label: "Settings" }
];

const defaultAuth = { loading: true, authenticated: false, user: null, enabled_products: [] };

export default function App() {
  const [auth, setAuth] = useState(defaultAuth);
  const [activeModule, setActiveModule] = useState("launcher");
  const [pendingModule, setPendingModule] = useState(null);
  const [activeScreen, setActiveScreen] = useState("files");
  const [theme, setTheme] = useState("system");
  const [platform, setPlatform] = useState("unknown");

  const isAdmin = Boolean(
    auth.user?.is_superuser ||
      (auth.role && ["company_admin", "superadmin", "super_admin"].includes(auth.role))
  );

  const visibleScreens = useMemo(
    () => storageScreens.filter((item) => !item.adminOnly || isAdmin),
    [isAdmin]
  );

  useEffect(() => {
    let active = true;
    async function load() {
      const state = await window.storageApi.getAuthStatus();
      const settings = await window.storageApi.getSettings();
      const os = window.storageApi.getPlatform ? window.storageApi.getPlatform() : "unknown";
      if (!active) {
        return;
      }
      setAuth(state);
      setTheme(settings.theme || "system");
      setPlatform(os);
    }
    load();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  useEffect(() => {
    if (!auth.authenticated) {
      return;
    }
    if (auth.theme_primary) {
      document.documentElement.style.setProperty("--primary", auth.theme_primary);
    }
    if (auth.theme_secondary) {
      document.documentElement.style.setProperty("--secondary", auth.theme_secondary);
    }
  }, [auth]);

  async function applyTheme(nextTheme) {
    setTheme(nextTheme);
    await window.storageApi.updateSettings({ theme: nextTheme });
  }

  function ThemeToggle() {
    return (
      <div className="theme-toggle-floating">
        <button
          type="button"
          className={`theme-toggle-btn ${theme === "light" ? "active" : ""}`}
          onClick={() => applyTheme("light")}
        >
          Light
        </button>
        <button
          type="button"
          className={`theme-toggle-btn ${theme === "dark" ? "active" : ""}`}
          onClick={() => applyTheme("dark")}
        >
          Dark
        </button>
      </div>
    );
  }

  const current = useMemo(
    () => visibleScreens.find((item) => item.id === activeScreen) || visibleScreens[0],
    [activeScreen, visibleScreens]
  );

  useEffect(() => {
    if (!current) {
      return;
    }
    if (activeScreen !== current.id) {
      setActiveScreen(current.id);
    }
  }, [current, activeScreen]);

  if (auth.loading) {
    return (
      <>
        <div className="app-loading">
          <div className="panel">Loading...</div>
        </div>
        <ThemeToggle />
      </>
    );
  }

  if (activeModule === "login") {
    return (
      <>
        <LoginScreen
          onBack={() => {
            setActiveModule("launcher");
            setPendingModule(null);
          }}
          onLogin={async (payload) => {
            const next = await window.storageApi.login(payload);
            setAuth(next);
            if (pendingModule) {
              setActiveModule(pendingModule);
              setPendingModule(null);
            } else {
              setActiveModule("launcher");
            }
          }}
        />
        <ThemeToggle />
      </>
    );
  }

  if (activeModule === "launcher") {
    return (
      <>
        <LaunchScreen
          auth={auth}
          onLogout={async () => {
            await window.storageApi.logout();
            setAuth({ ...defaultAuth, loading: false });
          }}
          onSelect={(product) => {
            if (product === "storage" && !auth.authenticated) {
              setPendingModule(product);
              setActiveModule("login");
              return;
            }
            setActiveModule(product);
            if (product === "storage") {
              window.storageApi.startSync();
            }
          }}
        />
        <ThemeToggle />
      </>
    );
  }

  if (activeModule === "monitor") {
    return (
      <>
        <MonitorScreen
          onBack={() => {
            setActiveModule("launcher");
          }}
        />
        <ThemeToggle />
      </>
    );
  }

  return (
    <>
      <div className="app-shell">
        <Sidebar
          items={visibleScreens}
          activeId={current.id}
          onSelect={setActiveScreen}
          onBack={() => setActiveModule("launcher")}
          onLogout={async () => {
            await window.storageApi.logout();
            setAuth({ ...defaultAuth, loading: false });
            setActiveModule("launcher");
          }}
        />
        <main className="app-main">
          {current.id === "dashboard" ? <DashboardScreen /> : null}
          {current.id === "sync-status" ? <SyncStatusScreen /> : null}
          {current.id === "storage" ? <StorageUsageScreen /> : null}
          {current.id === "files" ? <StorageFilesScreen isAdmin={isAdmin} authUser={auth.user} /> : null}
          {current.id === "choose-folders" ? (
            <ChooseFoldersScreen onOpenCloud={() => setActiveScreen("files")} />
          ) : null}
          {current.id === "activity" ? <SyncActivityScreen /> : null}
          {current.id === "errors" ? <ErrorsScreen /> : null}
          {current.id === "settings" ? (
            <SettingsScreen theme={theme} onThemeChange={applyTheme} />
          ) : null}
        </main>
      </div>
      <ThemeToggle />
    </>
  );
}
