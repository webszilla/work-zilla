import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "../lib/api.js";
import { useConfirm } from "../components/ConfirmDialog.jsx";

const emptyState = {
  loading: true,
  error: "",
  items: [],
  retentionDays: 0
};

export default function AiChatbotMediaLibraryPage() {
  const [state, setState] = useState(emptyState);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [deleting, setDeleting] = useState(false);
  const confirm = useConfirm();

  useEffect(() => {
    let active = true;
    async function loadMedia() {
      try {
        const data = await apiFetch("/api/ai-chatbot/media-library");
        if (!active) {
          return;
        }
        setState({
          loading: false,
          error: "",
          items: data.items || [],
          retentionDays: data.retention_days || 0
        });
        setSelectedIds(new Set());
      } catch (error) {
        if (active) {
          setState((prev) => ({
            ...prev,
            loading: false,
            error: error?.message || "Unable to load media library."
          }));
        }
      }
    }

    loadMedia();
    return () => {
      active = false;
    };
  }, []);

  const allSelected = useMemo(() => {
    if (!state.items.length) {
      return false;
    }
    return state.items.every((item) => selectedIds.has(item.id));
  }, [state.items, selectedIds]);

  function toggleSelectAll() {
    if (allSelected) {
      setSelectedIds(new Set());
      return;
    }
    const next = new Set(state.items.map((item) => item.id));
    setSelectedIds(next);
  }

  function toggleSelect(id) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  async function handleDelete(ids) {
    if (!ids.length || deleting) {
      return;
    }
    const result = await confirm({
      title: "Confirm Deletion",
      message: "Are you sure you want to delete this data?",
      confirmVariant: "danger"
    });

    if (!result) {
      return;
    }

    setDeleting(true);
    try {
      await apiFetch("/api/ai-chatbot/media-library/delete", {
        method: "POST",
        body: JSON.stringify({ ids })
      });
      setState((prev) => ({
        ...prev,
        items: prev.items.filter((item) => !ids.includes(item.id))
      }));
      setSelectedIds((prev) => {
        const next = new Set(prev);
        ids.forEach((id) => next.delete(id));
        return next;
      });
    } catch (error) {
      setState((prev) => ({
        ...prev,
        error: error?.message || "Unable to delete media."
      }));
    } finally {
      setDeleting(false);
    }
  }

  const selectedCount = selectedIds.size;

  return (
    <div className="container-fluid">
      <div className="d-flex align-items-center justify-content-between mb-3">
        <div>
          <h2 className="mb-1">Media Library</h2>
          <div className="text-secondary">
            {state.retentionDays ? `Stored for ${state.retentionDays} days.` : "Stored based on your plan."}
          </div>
        </div>
        <div className="d-flex align-items-center gap-2">
          <button
            type="button"
            className="btn btn-outline-light btn-sm"
            disabled={!selectedCount || deleting}
            onClick={() => handleDelete(Array.from(selectedIds))}
          >
            {deleting ? "Deleting..." : `Delete Selected (${selectedCount || 0})`}
          </button>
        </div>
      </div>

      {state.error ? <div className="alert alert-danger">{state.error}</div> : null}

      <div className="card p-3">
        <div className="table-responsive">
          <table className="table table-dark table-hover align-middle mb-0">
            <thead>
              <tr>
                <th>
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={toggleSelectAll}
                    aria-label="Select all"
                  />
                </th>
                <th>User Name</th>
                <th>Media Type</th>
                <th>File</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {state.loading ? (
                <tr>
                  <td colSpan={5}>Loading...</td>
                </tr>
              ) : state.items.length ? (
                state.items.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <input
                        type="checkbox"
                        checked={selectedIds.has(item.id)}
                        onChange={() => toggleSelect(item.id)}
                        aria-label={`Select ${item.attachment_name}`}
                      />
                    </td>
                    <td>{item.sender_name || "-"}</td>
                    <td>{item.attachment_type || "-"}</td>
                    <td>{item.attachment_name || "-"}</td>
                    <td>
                      <div className="d-flex gap-2">
                        {item.attachment_url ? (
                          <a
                            className="btn btn-outline-light btn-sm"
                            href={item.attachment_url}
                            target="_blank"
                            rel="noreferrer"
                          >
                            Download
                          </a>
                        ) : null}
                        <button
                          type="button"
                          className="btn btn-outline-danger btn-sm"
                          onClick={() => handleDelete([item.id])}
                          disabled={deleting}
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5}>No media yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

