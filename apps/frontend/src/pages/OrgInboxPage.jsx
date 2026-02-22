import { useEffect, useMemo, useState } from "react";
import { fetchOrgInbox, markOrgInboxRead, deleteOrgInboxNotification } from "../api/orgInbox.js";
import TablePagination from "../components/TablePagination.jsx";
import { useConfirm } from "../components/ConfirmDialog.jsx";

const emptyState = {
  loading: true,
  error: "",
  data: null,
};

function formatValue(value) {
  if (value === null || value === undefined || value === "") {
    return "-";
  }
  return value;
}

function truncate(value, length = 120) {
  if (!value) return "";
  const text = String(value);
  return text.length <= length ? text : `${text.slice(0, length).trim()}...`;
}

export default function OrgInboxPage() {
  const [state, setState] = useState(emptyState);
  const [selectedId, setSelectedId] = useState(null);
  const [page, setPage] = useState(1);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const confirm = useConfirm();
  const PAGE_SIZE = 20;

  const items = state.data?.results || [];
  const totalPages = state.data?.total_pages || 1;
  const unreadCount = state.data?.unread_count || 0;

  async function loadInbox({ keepSelection = false } = {}) {
    setState((prev) => ({ ...prev, loading: true, error: "" }));
    try {
      const data = await fetchOrgInbox({ page, pageSize: PAGE_SIZE });
      setState({ loading: false, error: "", data });
      if (!keepSelection) {
        setSelectedId(data?.results?.[0]?.id || null);
      }
    } catch (error) {
      setState({
        loading: false,
        error: error?.message || "Unable to load inbox.",
        data: null,
      });
    }
  }

  useEffect(() => {
    loadInbox();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  useEffect(() => {
    if (!autoRefresh) return;
    const handle = setInterval(() => loadInbox({ keepSelection: true }), 30000);
    return () => clearInterval(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRefresh, page]);

  useEffect(() => {
    if (!items.length) {
      setSelectedId(null);
      return;
    }
    if (selectedId && items.some((item) => item.id === selectedId)) return;
    setSelectedId(items[0].id);
  }, [items, selectedId]);

  const selectedItem = useMemo(
    () => items.find((item) => item.id === selectedId) || null,
    [items, selectedId]
  );

  async function markSelectedRead(item) {
    if (!item || item.is_read) return;
    try {
      await markOrgInboxRead([item.id]);
      setState((prev) => ({
        ...prev,
        data: {
          ...prev.data,
          results: prev.data.results.map((row) =>
            row.id === item.id ? { ...row, is_read: true } : row
          ),
          unread_count: Math.max((prev.data.unread_count || 0) - 1, 0),
        },
      }));
    } catch {
      // no-op
    }
  }

  async function handleDelete(item) {
    if (!item) return;
    const confirmed = await confirm({
      title: "Delete Notification",
      message: "Delete this notification from inbox?",
      confirmText: "Delete",
      confirmVariant: "danger",
    });
    if (!confirmed) return;
    try {
      await deleteOrgInboxNotification(item.id);
      await loadInbox({ keepSelection: false });
    } catch (error) {
      setState((prev) => ({ ...prev, error: error?.message || "Unable to delete notification." }));
    }
  }

  async function handleMarkAllRead() {
    const unreadIds = items.filter((item) => !item.is_read).map((item) => item.id);
    if (!unreadIds.length) return;
    try {
      await markOrgInboxRead(unreadIds);
      setState((prev) => ({
        ...prev,
        data: {
          ...prev.data,
          results: prev.data.results.map((row) => ({ ...row, is_read: true })),
          unread_count: 0,
        },
      }));
    } catch (error) {
      setState((prev) => ({
        ...prev,
        error: error?.message || "Unable to mark notifications as read.",
      }));
    }
  }

  if (state.loading) {
    return (
      <div className="card p-4 text-center">
        <div className="spinner" />
        <p className="mb-0">Loading inbox...</p>
      </div>
    );
  }

  return (
    <>
      <div className="d-flex align-items-center justify-content-between flex-wrap gap-2">
        <h3 className="page-title mb-0">Inbox</h3>
        <div className="d-flex align-items-center gap-2 flex-wrap">
          <span className="badge bg-primary">{unreadCount} unread</span>
          <button type="button" className="btn btn-outline-light btn-sm" onClick={handleMarkAllRead}>
            Mark all read
          </button>
          <button type="button" className="btn btn-primary btn-sm" onClick={() => loadInbox({ keepSelection: true })}>
            Refresh
          </button>
          <label className="form-check inbox-auto-refresh">
            <input
              type="checkbox"
              className="form-check-input"
              checked={autoRefresh}
              onChange={(event) => setAutoRefresh(event.target.checked)}
            />
            <span className="form-check-label">Auto-refresh (30s)</span>
          </label>
        </div>
      </div>

      {state.error ? <div className="alert alert-danger mt-3">{state.error}</div> : null}

      <div className="inbox-layout mt-3">
        <div className="card inbox-list">
          <div className="inbox-list-header">
            <span>All Notifications</span>
            <span className="text-secondary small">{formatValue(state.data?.total)} total</span>
          </div>
          <div className="inbox-list-body">
            {items.length ? (
              items.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={`inbox-item ${item.id === selectedId ? "active" : ""} ${item.is_read ? "read" : "unread"}`}
                  onClick={() => {
                    setSelectedId(item.id);
                    markSelectedRead(item);
                  }}
                >
                  <div className="inbox-item-title">
                    <span>{item.title}</span>
                    <span className="inbox-item-date">{formatValue(item.created_at)}</span>
                  </div>
                  <div className="inbox-item-meta">
                    <span>{item.product_slug || item.organization_name || "Notification"}</span>
                    <span className={`badge ${item.is_read ? "bg-secondary" : "bg-primary"}`}>
                      {item.is_read ? "Read" : "Unread"}
                    </span>
                  </div>
                  <div className="inbox-item-message">{truncate(item.message, 90)}</div>
                </button>
              ))
            ) : (
              <div className="text-secondary p-3">No notifications yet.</div>
            )}
          </div>
          <div className="inbox-list-footer">
            <TablePagination
              page={page}
              totalPages={totalPages}
              onPageChange={setPage}
              showPageLinks
              showPageLabel={false}
              maxPageLinks={5}
            />
          </div>
        </div>

        <div className="card inbox-detail">
          {selectedItem ? (
            <>
              <div className="d-flex align-items-start justify-content-between gap-2 mb-2">
                <div>
                  <h5 className="mb-1">{selectedItem.title}</h5>
                  <div className="text-secondary small">
                    {formatValue(selectedItem.created_at)} • {selectedItem.channel || "email"}
                    {selectedItem.product_slug ? ` • ${selectedItem.product_slug}` : ""}
                  </div>
                </div>
                <button type="button" className="btn btn-outline-danger btn-sm" onClick={() => handleDelete(selectedItem)}>
                  Delete
                </button>
              </div>
              <div className="inbox-detail-body">{selectedItem.message || "-"}</div>
            </>
          ) : (
            <div className="text-secondary p-4">Select a notification to view details.</div>
          )}
        </div>
      </div>
    </>
  );
}
