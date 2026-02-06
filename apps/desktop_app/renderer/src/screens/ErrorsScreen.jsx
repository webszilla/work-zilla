import { useEffect, useState } from "react";

export default function ErrorsScreen() {
  const [state, setState] = useState({ loading: true, items: [], error: "" });

  async function load() {
    try {
      const data = await window.storageApi.getErrors();
      setState({ loading: false, items: data.items || [], error: "" });
    } catch (error) {
      setState({ loading: false, items: [], error: error?.message || "Unable to load errors." });
    }
  }

  useEffect(() => {
    load();
  }, []);

  if (state.loading) {
    return <div className="panel">Loading errors...</div>;
  }

  return (
    <div className="screen">
      <div className="screen-header">
        <h2>Errors</h2>
        <p className="text-muted">Sync errors requiring attention.</p>
      </div>
      {state.error ? <div className="alert alert-danger">{state.error}</div> : null}
      <div className="card">
        {state.items.length ? (
          <ul className="list">
            {state.items.map((item) => (
              <li key={item.id} className="list-row">
                <div>
                  <div className="list-title">{item.title}</div>
                  <div className="list-subtitle">{item.details}</div>
                </div>
                <div className="text-muted">{item.created_at}</div>
              </li>
            ))}
          </ul>
        ) : (
          <div className="text-muted">No errors.</div>
        )}
      </div>
    </div>
  );
}
