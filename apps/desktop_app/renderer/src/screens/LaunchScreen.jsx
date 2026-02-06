export default function LaunchScreen({ auth, onSelect, onLogout }) {
  const isAuthed = Boolean(auth?.authenticated);

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
          ) : null}
        </div>

        <div className="launch-grid">
          <button
            type="button"
            className="launch-tile"
            onClick={() => handleClick("monitor")}
          >
            <div className="tile-title">Monitor</div>
            <div className="tile-desc">Employee monitoring and activity tracking.</div>
          </button>

          <button
            type="button"
            className="launch-tile"
            onClick={() => handleClick("storage")}
            disabled={isAuthed && !new Set(auth?.enabled_products || []).has("storage")}
          >
            <div className="tile-title">Online Storage</div>
            <div className="tile-desc">Secure storage sync and file backup.</div>
            {isAuthed && !new Set(auth?.enabled_products || []).has("storage") ? (
              <div className="tile-note">Not enabled for this account.</div>
            ) : null}
          </button>
        </div>
      </div>
    </div>
  );
}
