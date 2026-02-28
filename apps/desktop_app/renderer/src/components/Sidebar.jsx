export default function Sidebar({ items, activeId, onSelect, onLogout, onBack, connection }) {
  const isOnline = connection?.online !== false;
  const label = isOnline ? "Online" : "Reconnecting";
  return (
    <aside className="app-sidebar">
      <div className="brand">
        <div className="brand-mark">WZ</div>
        <div className="brand-copy">
          <div className="brand-title">Work Zilla</div>
          <div className="brand-subtitle">System Application</div>
        </div>
      </div>
      <nav className="nav-list">
        {items.map((item) => (
          item.type === "group" ? (
            <div key={item.id} className="nav-group">
              {item.label}
            </div>
          ) : (
            <button
              key={item.id}
              type="button"
              className={`nav-item ${activeId === item.id ? "active" : ""}`}
              onClick={() => onSelect(item.id)}
            >
              {item.label}
            </button>
          )
        ))}
      </nav>
      <div className={`sidebar-connection-pill ${isOnline ? "online" : "reconnecting"}`}>
        <span className="sidebar-connection-dot" />
        <span>{label}</span>
      </div>
      <div className="sidebar-footer">
        {onBack ? (
          <button type="button" className="btn btn-primary" onClick={onBack}>
            Home
          </button>
        ) : null}
        <button type="button" className="btn btn-secondary" onClick={onLogout}>
          Logout
        </button>
      </div>
    </aside>
  );
}
