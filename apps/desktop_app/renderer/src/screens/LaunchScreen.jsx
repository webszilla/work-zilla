import { useEffect, useState } from "react";

export default function LaunchScreen({ auth, connection, onSelect, onLogout }) {
  const isAuthed = Boolean(auth?.authenticated);
  const isOnline = connection?.online !== false;
  const enabledProducts = new Set(auth?.enabled_products || []);
  const canUseMonitor = enabledProducts.has("monitor") || enabledProducts.has("worksuite");
  const canUseStorage = enabledProducts.has("storage");
  const canUseImposition = enabledProducts.has("imposition-software") || enabledProducts.has("imposition");
  const [agentVersion, setAgentVersion] = useState("");

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

  return (
    <div className="launch-screen">
      <div className="launch-card">
        <div className="launch-header">
          <div>
            <div className="brand-title">Work Zilla Agent</div>
            <div className="brand-subtitle">One login. All Work Zilla products.</div>
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

          {isAuthed && canUseImposition ? (
            <button
              type="button"
              className="launch-tile"
              onClick={() => handleClick("imposition")}
              disabled={!isOnline}
            >
              <div className="tile-title">Imposition Software</div>
              <div className="tile-desc">ID card and business card print layout imposition.</div>
              {!isOnline ? <div className="tile-note">Offline. Reconnecting...</div> : null}
            </button>
          ) : null}
        </div>
        {isAuthed && !canUseMonitor && !canUseStorage && !canUseImposition ? (
          <div className="launch-version">No active product enabled for this account.</div>
        ) : null}
        {agentVersion ? (
          <div className="launch-version">Windows Agent Version: {agentVersion}</div>
        ) : null}
      </div>
    </div>
  );
}
