import { Suspense, lazy, useEffect, useMemo, useState } from "react";
import Sidebar from "./components/Sidebar.jsx";
import LoginScreen from "./screens/LoginScreen.jsx";
import LaunchScreen from "./screens/LaunchScreen.jsx";
import DashboardScreen from "./screens/DashboardScreen.jsx";
import SyncStatusScreen from "./screens/SyncStatusScreen.jsx";
import StorageUsageScreen from "./screens/StorageUsageScreen.jsx";
import SyncActivityScreen from "./screens/SyncActivityScreen.jsx";
import UserActivityScreen from "./screens/UserActivityScreen.jsx";
import ErrorsScreen from "./screens/ErrorsScreen.jsx";
import SettingsScreen from "./screens/SettingsScreen.jsx";
const MonitorScreen = lazy(() => import("./screens/MonitorScreen.jsx"));
const ImpositionScreen = lazy(() => import("./screens/ImpositionScreen.jsx"));
const ChooseFoldersScreen = lazy(() => import("./screens/ChooseFoldersScreen.jsx"));
const StorageFilesScreen = lazy(() => import("./screens/StorageFilesScreen.jsx"));
const AddDeviceFoldersScreen = lazy(() => import("./screens/AddDeviceFoldersScreen.jsx"));

const storageScreens = [
  { id: "dashboard", label: "Dashboard" },
  { id: "files", label: "File Storage" },
  { id: "sync-group", label: "Local Auto Sync (Optional)", type: "group" },
  { id: "sync-status", label: "Sync Status" },
  { id: "add-device-folders", label: "Add Device & Folders" },
  { id: "choose-folders", label: "Choose Local Folders" },
  { id: "activity", label: "Sync Activity" },
  { id: "user-activity", label: "User Activity" },
  { id: "storage", label: "Storage Usage" },
  { id: "errors", label: "Errors" },
  { id: "settings", label: "Settings" }
];

const defaultAuth = { loading: true, authenticated: false, user: null, enabled_products: [] };
const defaultConnection = { online: true, reconnecting: false, internet: true, api: true, message: "" };

export default function App() {
  const [auth, setAuth] = useState(defaultAuth);
  const [activeModule, setActiveModule] = useState("launcher");
  const [pendingModule, setPendingModule] = useState(null);
  const [activeScreen, setActiveScreen] = useState("files");
  const [theme, setTheme] = useState("system");
  const [platform, setPlatform] = useState("unknown");
  const [connection, setConnection] = useState(defaultConnection);

  const isAdmin = Boolean(
    auth.user?.is_superuser ||
      (auth.role && ["company_admin", "superadmin", "super_admin"].includes(auth.role))
  );
  const hasStorageAccess = useMemo(
    () => new Set(auth?.enabled_products || []).has("storage"),
    [auth?.enabled_products]
  );
  const hasImpositionAccess = useMemo(() => {
    const enabled = new Set(auth?.enabled_products || []);
    return enabled.has("imposition-software") || enabled.has("imposition");
  }, [auth?.enabled_products]);

  const visibleScreens = useMemo(
    () => storageScreens.filter((item) => !item.adminOnly || isAdmin),
    [isAdmin]
  );

  useEffect(() => {
    let active = true;
    async function load() {
      const state = await window.storageApi.getAuthStatus();
      const settings = await window.storageApi.getSettings();
      const network = window.storageApi.getConnectionStatus
        ? await window.storageApi.getConnectionStatus()
        : defaultConnection;
      const os = window.storageApi.getPlatform ? window.storageApi.getPlatform() : "unknown";
      if (!active) {
        return;
      }
      setAuth(state);
      setTheme(settings.theme || "system");
      setPlatform(os);
      setConnection(network || defaultConnection);
    }
    load();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!window.storageApi.onConnectionStatusUpdated) {
      return;
    }
    const unsubscribe = window.storageApi.onConnectionStatusUpdated((status) => {
      setConnection(status || defaultConnection);
    });
    return () => {
      unsubscribe?.();
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

  useEffect(() => {
    if (activeModule !== "storage") {
      return;
    }
    if (!auth.authenticated || hasStorageAccess) {
      return;
    }
    setActiveModule("launcher");
    setPendingModule(null);
  }, [activeModule, auth.authenticated, hasStorageAccess]);

  useEffect(() => {
    if (activeModule !== "imposition") {
      return;
    }
    if (!auth.authenticated || hasImpositionAccess) {
      return;
    }
    setActiveModule("launcher");
    setPendingModule(null);
  }, [activeModule, auth.authenticated, hasImpositionAccess]);

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
              const enabled = new Set(next?.enabled_products || []);
              const nextHasStorage = new Set(next?.enabled_products || []).has("storage");
              const nextHasMonitor = enabled.has("monitor") || enabled.has("worksuite");
              const nextHasImposition = enabled.has("imposition-software") || enabled.has("imposition");
              if (pendingModule === "storage" && !nextHasStorage) {
                setActiveModule("launcher");
              } else if (pendingModule === "imposition" && !nextHasImposition) {
                setActiveModule("launcher");
              } else if (pendingModule === "monitor" && enabled.size > 0 && !nextHasMonitor) {
                setActiveModule("launcher");
              } else {
                setActiveModule(pendingModule);
              }
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
          connection={connection}
          onLogout={async () => {
            await window.storageApi.logout();
            setAuth({ ...defaultAuth, loading: false });
          }}
          onSelect={(product) => {
            if (product === "login") {
              setPendingModule(null);
              setActiveModule("login");
              return;
            }
            if (!connection.online && (product === "storage" || product === "monitor" || product === "imposition")) {
              return;
            }
            if ((product === "storage" || product === "monitor" || product === "imposition") && !auth.authenticated) {
              setPendingModule(product);
              setActiveModule("login");
              return;
            }
            if (product === "storage" && auth.authenticated && !hasStorageAccess) {
              return;
            }
            if (product === "imposition" && auth.authenticated && !hasImpositionAccess) {
              return;
            }
            setActiveModule(product);
            if (product === "storage" && hasStorageAccess) {
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
        <Suspense fallback={<div className="panel">Loading module...</div>}>
          <MonitorScreen
            onBack={() => {
              setActiveModule("launcher");
            }}
          />
        </Suspense>
        <ThemeToggle />
      </>
    );
  }

  if (activeModule === "imposition") {
    return (
      <>
        <Suspense fallback={<div className="panel">Loading module...</div>}>
          <ImpositionScreen
            onBack={() => {
              setActiveModule("launcher");
            }}
          />
        </Suspense>
        <ThemeToggle />
      </>
    );
  }

  return (
    <>
      {!connection.online ? (
        <div className="connection-banner">
          {connection.reconnecting ? "Reconnecting..." : "Offline"}
          <span className="connection-banner-subtitle">
            {" "}
            WorkZilla requires internet connection. Please connect to internet to continue.
          </span>
        </div>
      ) : null}
      <div className="app-shell">
        <Sidebar
          items={visibleScreens}
          activeId={current.id}
          connection={connection}
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
          {current.id === "files" ? (
            <Suspense fallback={<div className="panel">Loading files...</div>}>
              <StorageFilesScreen isAdmin={isAdmin} authUser={auth.user} />
            </Suspense>
          ) : null}
          {current.id === "choose-folders" ? (
            <Suspense fallback={<div className="panel">Loading sync settings...</div>}>
              <ChooseFoldersScreen onOpenCloud={() => setActiveScreen("files")} />
            </Suspense>
          ) : null}
          {current.id === "add-device-folders" ? (
            <Suspense fallback={<div className="panel">Loading device and folder settings...</div>}>
              <AddDeviceFoldersScreen onOpenCloud={() => setActiveScreen("files")} />
            </Suspense>
          ) : null}
          {current.id === "activity" ? <SyncActivityScreen /> : null}
          {current.id === "user-activity" ? <UserActivityScreen /> : null}
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
