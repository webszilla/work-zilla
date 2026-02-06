import { useEffect, useState } from "react";

export default function SyncActivityScreen() {
  const [state, setState] = useState({ loading: true, items: [], error: "" });

  async function load() {
    try {
      const data = await window.storageApi.getActivity();
      setState({ loading: false, items: data.items || [], error: "" });
    } catch (error) {
      setState({ loading: false, items: [], error: error?.message || "Unable to load activity." });
    }
  }

  useEffect(() => {
    load();
    const interval = setInterval(load, 5000);
    return () => clearInterval(interval);
  }, []);

  if (state.loading) {
    return <div className="panel">Loading activity...</div>;
  }

  return (
    <div className="screen">
      <div className="screen-header">
        <h2>Sync Activity</h2>
        <p className="text-muted">Recent sync operations and outcomes.</p>
      </div>
      {state.error ? <div className="alert alert-danger">{state.error}</div> : null}
      <div className="card">
        {state.items.length ? (
          <ul className="list">
            {state.items.map((item) => (
              <li key={item.id} className="list-row">
                <div>
                  <div className="list-title">{item.title}</div>
                  <div className="list-subtitle">{item.subtitle}</div>
                </div>
                <div className={`status-pill status-${item.status || "info"}`}>{item.status}</div>
              </li>
            ))}
          </ul>
        ) : (
          <div className="text-muted">No activity yet.</div>
        )}
      </div>
    </div>
  );
}
