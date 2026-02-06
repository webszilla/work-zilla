import { useEffect, useState } from "react";

export default function FileChangesScreen() {
  const [state, setState] = useState({ loading: true, items: [], error: "" });

  async function load() {
    try {
      const data = await window.storageApi.getQueue();
      setState({ loading: false, items: data.items || [], error: "" });
    } catch (error) {
      setState({ loading: false, items: [], error: error?.message || "Unable to load file changes." });
    }
  }

  useEffect(() => {
    load();
    const interval = setInterval(load, 5000);
    return () => clearInterval(interval);
  }, []);

  if (state.loading) {
    return <div className="panel">Loading file changes...</div>;
  }

  return (
    <div className="screen">
      <div className="screen-header">
        <h2>File Changes</h2>
        <p className="text-muted">Queued file events waiting to sync.</p>
      </div>
      {state.error ? <div className="alert alert-danger">{state.error}</div> : null}
      <div className="card">
        {state.items.length ? (
          <ul className="list">
            {state.items.map((item) => (
              <li key={item.id} className="list-row">
                <div>
                  <div className="list-title">{item.path}</div>
                  <div className="list-subtitle">{item.event} • {item.status}</div>
                </div>
                <div className="text-muted">{item.updated_at}</div>
              </li>
            ))}
          </ul>
        ) : (
          <div className="text-muted">No pending changes.</div>
        )}
      </div>
    </div>
  );
}
