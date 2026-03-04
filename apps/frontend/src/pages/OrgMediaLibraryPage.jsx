import { useEffect, useState } from "react";
import { apiFetch } from "../lib/api.js";
import { formatDeviceDateTime } from "../lib/datetime.js";
import { useConfirm } from "../components/ConfirmDialog.jsx";

const initialState = {
  loading: true,
  error: "",
  items: [],
};

function formatTypeLabel(type) {
  const raw = String(type || "").trim();
  if (!raw) {
    return "Unknown";
  }
  if (raw.startsWith("image/")) {
    return "Image";
  }
  if (raw.startsWith("video/")) {
    return "Video";
  }
  if (raw.startsWith("audio/")) {
    return "Audio";
  }
  if (raw.includes("pdf")) {
    return "PDF";
  }
  if (raw.includes("sheet") || raw.includes("excel")) {
    return "Spreadsheet";
  }
  if (raw.includes("word") || raw.includes("document")) {
    return "Document";
  }
  return raw;
}

export default function OrgMediaLibraryPage() {
  const [state, setState] = useState(initialState);
  const [deletingId, setDeletingId] = useState("");
  const confirm = useConfirm();

  useEffect(() => {
    let active = true;

    async function loadItems() {
      try {
        const data = await apiFetch("/api/storage/media-library");
        if (!active) {
          return;
        }
        setState({
          loading: false,
          error: "",
          items: Array.isArray(data.items) ? data.items : [],
        });
      } catch (error) {
        if (!active) {
          return;
        }
        setState({
          loading: false,
          error: error?.message || "Unable to load media library.",
          items: [],
        });
      }
    }

    loadItems();
    return () => {
      active = false;
    };
  }, []);

  async function handleDelete(item) {
    const approved = await confirm({
      title: "Delete File",
      message: `Delete "${item.filename}" from object storage?`,
      confirmVariant: "danger",
      confirmLabel: "Delete",
    });
    if (!approved) {
      return;
    }

    setDeletingId(item.id);
    try {
      await apiFetch(`/api/storage/files/${item.id}/delete`, {
        method: "DELETE",
      });
      setState((prev) => ({
        ...prev,
        items: prev.items.filter((entry) => entry.id !== item.id),
      }));
    } catch (error) {
      setState((prev) => ({
        ...prev,
        error: error?.message || "Unable to delete file.",
      }));
    } finally {
      setDeletingId("");
    }
  }

  return (
    <div className="org-media-library-page">
      <div className="d-flex align-items-center justify-content-between mb-3">
        <div>
          <h2 className="mb-1 page-title">Media Library</h2>
          <div className="text-secondary">Product-used images and documents for this workspace.</div>
        </div>
      </div>
      <hr className="section-divider" />

      {state.error ? <div className="alert alert-danger">{state.error}</div> : null}

      <div className="org-media-library-page__table-shell">
        <div className="wz-data-table-wrap">
          <table className="table wz-data-table align-middle mb-0">
            <thead>
              <tr>
                <th>File Name</th>
                <th>Type</th>
                <th>Upload Time and Date</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {state.loading ? (
                <tr>
                  <td colSpan={4}>Loading media...</td>
                </tr>
              ) : state.items.length ? (
                state.items.map((item) => (
                  <tr key={item.id}>
                    <td className="org-media-library-page__filename" title={item.filename}>{item.filename}</td>
                    <td>{formatTypeLabel(item.type)}</td>
                    <td>{formatDeviceDateTime(item.uploaded_at)}</td>
                    <td>
                      <div className="org-media-library-page__actions">
                        {item.is_image ? (
                          <a
                            href={item.view_url}
                            target="_blank"
                            rel="noreferrer"
                            className="org-media-library-page__action-btn org-media-library-page__action-btn--view"
                          >
                            View
                          </a>
                        ) : null}
                        {item.can_delete !== false ? (
                          <button
                            type="button"
                            className="org-media-library-page__action-btn org-media-library-page__action-btn--delete"
                            disabled={deletingId === item.id}
                            onClick={() => handleDelete(item)}
                          >
                            {deletingId === item.id ? "Deleting..." : "Delete"}
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={4}>No product media found for this workspace.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
