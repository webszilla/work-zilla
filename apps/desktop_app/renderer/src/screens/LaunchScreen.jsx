import { useEffect, useState } from "react";
import {
  canShowDesktopProduct,
  getDesktopProducts,
  hasDesktopLocalInstall,
  hasDesktopProductAccess
} from "../../../electron/productCatalog.js";

export default function LaunchScreen({ auth, connection, onSelect, onLogout }) {
  const isAuthed = Boolean(auth?.authenticated);
  const isOnline = connection?.online !== false;
  const [localInstalledProducts, setLocalInstalledProducts] = useState(
    () => new Set(auth?.local_installed_products || [])
  );
  const [agentVersion, setAgentVersion] = useState("");
  const [uninstalling, setUninstalling] = useState(false);
  const [uninstallMessage, setUninstallMessage] = useState("");
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [updateMessage, setUpdateMessage] = useState("");
  const [updateState, setUpdateState] = useState({
    checked: false,
    available: false,
    latestVersion: "",
    currentVersion: "",
    error: false
  });
  const [workSuiteExpiryAlert, setWorkSuiteExpiryAlert] = useState("");

  useEffect(() => {
    setLocalInstalledProducts(new Set(auth?.local_installed_products || []));
  }, [auth?.local_installed_products]);

  useEffect(() => {
    let active = true;
    async function refreshLocalInstalled() {
      if (!window.storageApi.getLocalInstalledProducts) {
        return;
      }
      try {
        const response = await window.storageApi.getLocalInstalledProducts();
        if (!active || !response?.ok) {
          return;
        }
        setLocalInstalledProducts(new Set(response.products || []));
      } catch {
        // ignore local state refresh errors
      }
    }
    refreshLocalInstalled();
    const timer = setInterval(refreshLocalInstalled, 4000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    let active = true;
    async function loadVersion() {
      try {
        const versionResp = await window.storageApi.getWindowsAgentVersion?.();
        if (active) {
          setAgentVersion(versionResp?.version || "");
        }
      } catch {
        if (active) {
          setAgentVersion("");
        }
      }
    }
    loadVersion();
    return () => {
      active = false;
    };
  }, []);

  function handleClick(product) {
    onSelect(product);
  }

  const productCards = getDesktopProducts()
    .filter((product) =>
      canShowDesktopProduct(product.key, {
        ...auth,
        local_installed_products: Array.from(localInstalledProducts)
      })
    )
    .map((product) => ({
      ...product,
      canUse:
        hasDesktopProductAccess(product.key, auth?.enabled_products) ||
        hasDesktopLocalInstall(product.key, Array.from(localInstalledProducts))
    }));

  async function refreshUpdateStatus() {
    if (!window.storageApi.checkForAppUpdate) {
      return { ok: false, error: true, available: false, latestVersion: "" };
    }
    setCheckingUpdate(true);
    try {
      const response = await window.storageApi.checkForAppUpdate();
      if (!response?.ok) {
        setUpdateState((prev) => ({ ...prev, checked: true, error: true }));
        return { ok: false, error: true, available: false, latestVersion: "" };
      }
      const nextState = {
        checked: true,
        available: Boolean(response.updateAvailable),
        latestVersion: String(response.latestVersion || ""),
        currentVersion: String(response.currentVersion || ""),
        error: false
      };
      setUpdateState(nextState);
      return {
        ok: true,
        error: false,
        available: nextState.available,
        latestVersion: nextState.latestVersion
      };
    } catch {
      setUpdateState((prev) => ({ ...prev, checked: true, error: true }));
      return { ok: false, error: true, available: false, latestVersion: "" };
    } finally {
      setCheckingUpdate(false);
    }
  }

  useEffect(() => {
    if (!isOnline) {
      return;
    }
    refreshUpdateStatus();
  }, [isOnline]);

  useEffect(() => {
    let active = true;
    async function loadPlanStatus() {
      try {
        const settings = await window.storageApi.getSettings?.();
        const companyKey = String(settings?.companyKey || settings?.orgId || "").trim();
        if (!companyKey || !window.storageApi.getMonitorPlanStatus) {
          if (active) {
            setWorkSuiteExpiryAlert("");
          }
          return;
        }
        const status = await window.storageApi.getMonitorPlanStatus({ companyKey });
        const plan = status?.plan || null;
        if (!active) {
          return;
        }
        if (status?.ok && plan?.expired) {
          setWorkSuiteExpiryAlert(
            String(
              plan?.message ||
                "Your Work Suite plan has expired. Renew the product to continue service."
            )
          );
          return;
        }
        setWorkSuiteExpiryAlert("");
      } catch {
        if (active) {
          setWorkSuiteExpiryAlert("");
        }
      }
    }
    if (isOnline) {
      loadPlanStatus();
    } else {
      setWorkSuiteExpiryAlert("");
    }
    return () => {
      active = false;
    };
  }, [isOnline]);

  async function handleUninstall() {
    const confirmed = window.confirm("Do you want to uninstall Work Zilla Agent from this system?");
    if (!confirmed) {
      return;
    }
    setUninstallMessage("");
    setUninstalling(true);
    try {
      const response = await window.storageApi.uninstallApp?.();
      if (!response?.ok) {
        const code = String(response?.error || "uninstall_failed");
        const message =
          code === "uninstaller_not_found"
            ? "Uninstaller not found on this device."
            : code === "unsupported_os"
              ? "Uninstall is not supported on this operating system."
              : "Unable to start uninstall.";
        setUninstallMessage(message);
        setUninstalling(false);
        return;
      }
      setUninstallMessage("Uninstaller started. Work Zilla Agent will close now.");
    } catch {
      setUninstallMessage("Unable to start uninstall.");
      setUninstalling(false);
    }
  }

  async function handleUpdate() {
    setUpdateMessage("");
    if (!isOnline) {
      setUpdateMessage("Connect to internet to check updates.");
      return;
    }
    let currentUpdateState = updateState;
    if (!updateState.checked) {
      const fresh = await refreshUpdateStatus();
      currentUpdateState = {
        checked: true,
        available: Boolean(fresh?.available),
        latestVersion: String(fresh?.latestVersion || ""),
        currentVersion: String(updateState.currentVersion || ""),
        error: Boolean(fresh?.error)
      };
    }
    if (!currentUpdateState.checked || currentUpdateState.error) {
      setUpdateMessage("Unable to check latest version now.");
      return;
    }
    if (!currentUpdateState.available) {
      setUpdateMessage("You already have the latest version.");
      return;
    }
    const targetVersion = currentUpdateState.latestVersion || "latest";
    const confirmed = window.confirm(`New version ${targetVersion} is available. Update now?`);
    if (!confirmed) {
      return;
    }
    setUpdating(true);
    try {
      const response = await window.storageApi.installAppUpdate?.();
      if (!response?.ok) {
        const code = String(response?.error || "update_failed");
        const message =
          code === "no_update"
            ? "You already have the latest version."
            : code === "update_info_unavailable"
              ? "Unable to check latest version now."
              : "Unable to start update.";
        setUpdateMessage(message);
        setUpdating(false);
        return;
      }
      setUpdateMessage("Update started. Installer will open now.");
    } catch {
      setUpdateMessage("Unable to start update.");
      setUpdating(false);
    }
  }

  return (
    <div className="launch-screen">
      <div className="launch-card">
        <div className="launch-header">
          <div className="launch-header-left">
            <div className="brand-title">Work Zilla Agent</div>
            <div className="brand-subtitle">One login. All Work Zilla products.</div>
            <div className="launch-action-row">
              <button
                className="btn btn-secondary launch-uninstall-btn"
                type="button"
                onClick={handleUninstall}
                disabled={uninstalling || updating}
              >
                {uninstalling ? "Starting Uninstall..." : "Uninstall App"}
              </button>
              <button
                className="btn btn-secondary launch-update-btn"
                type="button"
                onClick={handleUpdate}
                disabled={checkingUpdate || updating || uninstalling}
              >
                {checkingUpdate
                  ? "Checking..."
                  : updating
                    ? "Updating..."
                    : updateState.available
                      ? `Update ${updateState.latestVersion || ""}`.trim()
                      : "Update App"}
              </button>
            </div>
          </div>
          {isAuthed ? (
            <button className="btn btn-secondary" type="button" onClick={onLogout}>
              Logout
            </button>
          ) : (
            <button className="btn btn-secondary" type="button" onClick={() => onSelect("login")}>
              Login
            </button>
          )}
        </div>

        <div className="launch-grid">
          {productCards.map((product) => (
            <button
              key={product.key}
              type="button"
              className="launch-tile"
              onClick={() => handleClick(product.key)}
              disabled={!isOnline}
            >
              <div className="tile-title">{product.title}</div>
              <div className="tile-desc">{product.description}</div>
              {product.key === "monitor" && workSuiteExpiryAlert ? (
                <div className="tile-note tile-note-alert">{workSuiteExpiryAlert}</div>
              ) : null}
              {!isOnline ? <div className="tile-note">Offline. Reconnecting...</div> : null}
            </button>
          ))}
        </div>
        {isAuthed && !productCards.some((product) => product.canUse) ? (
          <div className="launch-version">No active product enabled for this account.</div>
        ) : null}
        {uninstallMessage ? <div className="launch-uninstall-note">{uninstallMessage}</div> : null}
        {updateMessage ? <div className="launch-update-note">{updateMessage}</div> : null}
        {agentVersion ? <div className="launch-version">App Version: {agentVersion}</div> : null}
      </div>
    </div>
  );
}
