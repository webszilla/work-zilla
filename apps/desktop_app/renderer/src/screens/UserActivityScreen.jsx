import { useEffect, useState } from "react";

function formatDateTime(value) {
  if (!value) {
    return "-";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return String(value);
  }
  return date.toLocaleString();
}

export default function UserActivityScreen() {
  const [state, setState] = useState({ loading: true, items: [], error: "" });

  async function load() {
    try {
      const data = await window.storageApi.getUserActivity();
      setState({ loading: false, items: data.items || [], error: "" });
    } catch (error) {
      setState({ loading: false, items: [], error: error?.message || "Unable to load user activity." });
    }
  }

  useEffect(() => {
    load();
    const timer = setInterval(load, 4000);
    return () => clearInterval(timer);
  }, []);

  if (state.loading) {
    return <div className="panel">Loading user activity...</div>;
  }

  return (
    <div className="screen">
      <div className="screen-header">
        <h2>User Activity</h2>
        <p className="text-muted">Latest add/delete actions. Maximum 100 entries are retained.</p>
      </div>
      {state.error ? <div className="alert alert-danger">{state.error}</div> : null}
      <div className="card">
        {state.items.length ? (
          <div className="table-wrap">
            <table className="table-ui">
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Action</th>
                  <th>Details</th>
                </tr>
              </thead>
              <tbody>
                {state.items.map((item) => (
                  <tr key={item.id}>
                    <td>{formatDateTime(item.created_at)}</td>
                    <td>{item.title || item.event_type || "-"}</td>
                    <td>{item.details || "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-muted">No user activity yet.</div>
        )}
      </div>
    </div>
  );
}
