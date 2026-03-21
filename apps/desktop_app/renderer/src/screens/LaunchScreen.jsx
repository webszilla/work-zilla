import { useEffect, useState } from "react";

export default function LaunchScreen({ auth, connection, onSelect, onLogout }) {
  const isAuthed = Boolean(auth?.authenticated);
  const isOnline = connection?.online !== false;
  const enabledProducts = new Set(auth?.enabled_products || []);
  const canUseMonitor = enabledProducts.has("monitor") || enabledProducts.has("worksuite");
  const canUseStorage = enabledProducts.has("storage");
  const canUseImposition = enabledProducts.has("imposition-software") || enabledProducts.has("imposition");
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
          {!isAuthed || canUseMonitor ? (
            <button
              type="button"
              className="launch-tile"
              onClick={() => handleClick("monitor")}
              disabled={!isOnline}
            >
              <div className="tile-title">Work Suite</div>
              <div className="tile-desc">Activity visibility, screenshots, and productivity tracking.</div>
              {!isOnline ? <div className="tile-note">Offline. Reconnecting...</div> : null}
            </button>
          ) : null}

          {isAuthed && canUseStorage ? (
            <button
              type="button"
              className="launch-tile"
              onClick={() => handleClick("storage")}
              disabled={!isOnline}
            >
              <div className="tile-title">Online Storage</div>
              <div className="tile-desc">Secure storage sync and file backup.</div>
              {!isOnline ? <div className="tile-note">Offline. Reconnecting...</div> : null}
            </button>
          ) : null}

          {!isAuthed || canUseImposition ? (
            <button
              type="button"
              className="launch-tile"
              onClick={() => handleClick("imposition")}
              disabled={!isOnline}
            >
              <div className="tile-title">Imposition Software</div>
              <div className="tile-desc">Imposition Tool for Digital Printing Press.</div>
              {!isOnline ? <div className="tile-note">Offline. Reconnecting...</div> : null}
            </button>
          ) : null}
        </div>
        {isAuthed && !canUseMonitor && !canUseStorage && !canUseImposition ? (
          <div className="launch-version">No active product enabled for this account.</div>
        ) : null}
        {uninstallMessage ? <div className="launch-uninstall-note">{uninstallMessage}</div> : null}
        {updateMessage ? <div className="launch-update-note">{updateMessage}</div> : null}
        {agentVersion ? <div className="launch-version">App Version: {agentVersion}</div> : null}
      </div>
    </div>
  );
}
