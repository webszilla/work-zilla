import { useEffect, useState } from "react";

export default function SettingsScreen({ theme, onThemeChange }) {
  const [state, setState] = useState({ loading: true, data: null, error: "" });
  const [downloadInfo, setDownloadInfo] = useState({ version: "", error: "" });

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const data = await window.storageApi.getSettings();
        if (!active) {
          return;
        }
        setState({ loading: false, data, error: "" });
        try {
          const versionResp = await window.storageApi.getWindowsAgentVersion?.();
          if (active) {
            setDownloadInfo({ version: versionResp?.version || "", error: "" });
          }
        } catch (err) {
          if (active) {
            setDownloadInfo({ version: "", error: err?.message || "" });
          }
        }
      } catch (error) {
        if (!active) {
          return;
        }
        setState({ loading: false, data: null, error: error?.message || "Unable to load settings." });
      }
    }
    load();
    return () => {
      active = false;
    };
  }, []);

  if (state.loading) {
    return <div className="panel">Loading settings...</div>;
  }

  return (
    <div className="screen">
      <div className="screen-header">
        <h2>Settings</h2>
        <p className="text-muted">Lightweight preferences for sync.</p>
      </div>
      {state.error ? <div className="alert alert-danger">{state.error}</div> : null}
      <div className="card">
        <div className="form-grid">
          <label>
            Theme
            <select value={theme} onChange={(event) => onThemeChange(event.target.value)}>
              <option value="system">System</option>
              <option value="light">Light</option>
              <option value="dark">Dark</option>
            </select>
          </label>
          <label>
            Sync Mode
            <select
              value={state.data?.two_way ? "two-way" : "one-way"}
              onChange={async (event) => {
                const mode = event.target.value;
                const next = await window.storageApi.updateSettings({ two_way: mode === "two-way" });
                setState((prev) => ({ ...prev, data: next }));
              }}
            >
              <option value="one-way">One-way (local to cloud)</option>
              <option value="two-way">Two-way (optional)</option>
            </select>
          </label>
          <label>
            Sync Control
            <div className="button-row">
              <button
                type="button"
                className="btn btn-primary"
                onClick={async () => {
                  await window.storageApi.resumeSync();
                }}
              >
                Resume Sync
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={async () => {
                  await window.storageApi.pauseSync();
                }}
              >
                Pause Sync
              </button>
            </div>
          </label>
          <label>
            Windows Agent
            <div className="button-row">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => {
                  window.storageApi.openExternal?.("/downloads/windows-agent/");
                }}
              >
                Download Windows Agent
              </button>
              {downloadInfo.version ? (
                <div className="text-muted" style={{ alignSelf: "center" }}>
                  Version: {downloadInfo.version}
                </div>
              ) : null}
            </div>
          </label>
        </div>
      </div>
    </div>
  );
}
