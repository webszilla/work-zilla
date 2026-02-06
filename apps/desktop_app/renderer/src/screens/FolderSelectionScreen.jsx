import { useEffect, useState } from "react";

export default function FolderSelectionScreen() {
  const [state, setState] = useState({ loading: true, items: [], error: "" });

  async function load() {
    try {
      const data = await window.storageApi.getFolders();
      setState({ loading: false, items: data.folders || [], error: "" });
    } catch (error) {
      setState({ loading: false, items: [], error: error?.message || "Unable to load folders." });
    }
  }

  useEffect(() => {
    load();
  }, []);

  if (state.loading) {
    return <div className="panel">Loading folders...</div>;
  }

  return (
    <div className="screen">
      <div className="screen-header">
        <h2>Folder Selection</h2>
        <p className="text-muted">Manage which folders sync to the cloud.</p>
      </div>
      {state.error ? <div className="alert alert-danger">{state.error}</div> : null}
      <div className="card">
        <div className="button-row">
          <button
            type="button"
            className="btn btn-primary"
            onClick={async () => {
              await window.storageApi.chooseFolders();
              await load();
            }}
          >
            Add Folders
          </button>
          <button type="button" className="btn btn-secondary" onClick={load}>
            Refresh
          </button>
        </div>
        {state.items.length ? (
          <div className="table-wrap mt-3">
            <table className="table-ui">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Path</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {state.items.map((item) => (
                  <tr key={item.path}>
                    <td>{item.name}</td>
                    <td className="text-muted">{item.path}</td>
                    <td>
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={async () => {
                          await window.storageApi.removeFolder(item.path);
                          await load();
                        }}
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-muted">No folders selected yet.</div>
        )}
      </div>
    </div>
  );
}
