import { useEffect, useState } from "react";
import { apiFetch } from "../lib/api.js";

const emptyState = {
  loading: true,
  error: "",
  conversations: [],
  retentionDays: 30,
  filterStatus: "all",
  selected: null,
  messages: [],
  loadingMessages: false,
  orgTimezone: "UTC"
};

function formatDateTime(value, timeZone) {
  if (!value) {
    return "";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  const formatter = new Intl.DateTimeFormat("en-GB", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    timeZone
  });
  const parts = formatter.formatToParts(date).reduce((acc, part) => {
    acc[part.type] = part.value;
    return acc;
  }, {});
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}:${parts.second}`;
}

export default function AiChatbotHistoryPage() {
  const [state, setState] = useState(emptyState);

  useEffect(() => {
    let active = true;
    async function loadHistory() {
      setState((prev) => ({ ...prev, loading: true, error: "" }));
      try {
        const params = new URLSearchParams();
        params.set("status", state.filterStatus);
        const data = await apiFetch(`/api/ai-chatbot/history?${params.toString()}`);
        if (!active) {
          return;
        }
        setState((prev) => ({
          ...prev,
          loading: false,
          error: "",
          conversations: data.conversations || [],
          retentionDays: data.retention_days ?? prev.retentionDays
        }));
      } catch (error) {
        if (active) {
          setState((prev) => ({
            ...prev,
            loading: false,
            error: error?.message || "Unable to load chat history."
          }));
        }
      }
    }

    loadHistory();
    return () => {
      active = false;
    };
  }, [state.filterStatus]);

  async function refresh() {
    setState((prev) => ({ ...prev, loading: true, error: "" }));
    try {
      const params = new URLSearchParams();
      params.set("status", state.filterStatus);
      const data = await apiFetch(`/api/ai-chatbot/history?${params.toString()}`);
      setState((prev) => ({
        ...prev,
        loading: false,
        error: "",
        conversations: data.conversations || [],
        retentionDays: data.retention_days ?? prev.retentionDays
      }));
    } catch (error) {
      setState((prev) => ({
        ...prev,
        loading: false,
        error: error?.message || "Unable to load chat history."
      }));
    }
  }

  async function openConversation(conversation) {
    if (!conversation) {
      return;
    }
    setState((prev) => ({ ...prev, loadingMessages: true, selected: conversation, messages: [] }));
    try {
      const data = await apiFetch(`/api/ai-chatbot/history/${conversation.id}/messages`);
      setState((prev) => ({
        ...prev,
        loadingMessages: false,
        messages: data.messages || [],
        orgTimezone: data.org_timezone || prev.orgTimezone || "UTC"
      }));
    } catch (error) {
      setState((prev) => ({
        ...prev,
        loadingMessages: false,
        error: error?.message || "Unable to load conversation."
      }));
    }
  }

  function closeModal() {
    setState((prev) => ({ ...prev, selected: null, messages: [], loadingMessages: false }));
  }

  async function handleDelete(conversation) {
    if (!conversation) {
      return;
    }
    const confirmed = window.confirm("Delete this chat history? This will remove the conversation for all users.");
    if (!confirmed) {
      return;
    }
    try {
      await apiFetch(`/api/ai-chatbot/history/${conversation.id}`, { method: "DELETE" });
      await refresh();
      if (state.selected?.id === conversation.id) {
        closeModal();
      }
    } catch (error) {
      setState((prev) => ({
        ...prev,
        error: error?.message || "Unable to delete chat history."
      }));
    }
  }

  return (
    <div className="container-fluid">
      <div className="d-flex align-items-center justify-content-between mb-3">
        <div>
          <h2 className="mb-1">AI Chatbot History</h2>
          <div className="text-secondary">Review past conversations and manage history.</div>
        </div>
        <button type="button" className="btn btn-outline-light btn-sm" onClick={refresh}>
          Refresh
        </button>
      </div>

      <div className="alert alert-info retention-text">
        Chat history is stored for up to {state.retentionDays} days as per your plan. Older chats are deleted automatically.
      </div>

      {state.error ? (
        <div className="alert alert-danger">{state.error}</div>
      ) : null}

      <div className="d-flex align-items-center gap-2 mb-2">
        {["all", "open", "closed"].map((status) => (
          <button
            key={status}
            type="button"
            className={`btn btn-sm ${state.filterStatus === status ? "btn-primary" : "btn-outline-light"}`}
            onClick={() => setState((prev) => ({ ...prev, filterStatus: status }))}
          >
            {status === "all" ? "All" : status.charAt(0).toUpperCase() + status.slice(1)}
          </button>
        ))}
      </div>

      <div className="card p-3">
        <div className="table-responsive">
          <table className="table table-dark table-hover mb-0">
            <thead>
              <tr>
                <th>Visitor</th>
                <th>Name</th>
                <th>Email</th>
                <th>Phone</th>
                <th>Widget</th>
                <th>Category</th>
                <th>Source</th>
                <th>Status</th>
                <th>Last Message</th>
                <th>Updated</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {state.loading ? (
                <tr>
                  <td colSpan={11}>Loading...</td>
                </tr>
              ) : state.conversations.length ? (
                state.conversations.map((row) => (
                  <tr key={row.id}>
                    <td>{row.visitor_id}</td>
                    <td>{row.visitor_name || "-"}</td>
                    <td>{row.visitor_email || "-"}</td>
                    <td>{row.visitor_phone || "-"}</td>
                    <td>{row.widget_name || "-"}</td>
                    <td>{row.category || "-"}</td>
                    <td>{row.source || "-"}</td>
                    <td>{row.status}</td>
                    <td>{row.last_message || "-"}</td>
                    <td>{row.last_message_at ? row.last_message_at.slice(0, 19).replace("T", " ") : "-"}</td>
                    <td className="d-flex gap-2">
                      <button type="button" className="btn btn-outline-light btn-sm" onClick={() => openConversation(row)}>
                        View
                      </button>
                      <button type="button" className="btn btn-outline-danger btn-sm" onClick={() => handleDelete(row)}>
                        Delete
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={11}>No chat history found.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {state.selected ? (
        <div className="modal d-block" tabIndex="-1" role="dialog">
          <div className="modal-dialog modal-lg" role="document">
            <div className="modal-content wz-history-modal">
              <div className="modal-header">
                <h5 className="modal-title">Conversation</h5>
                <button type="button" className="btn-close" onClick={closeModal} />
              </div>
              <div className="modal-body wz-history-modal__body">
                <div className="text-secondary mb-2">
                  {state.selected.visitor_name || state.selected.visitor_id} - {state.selected.visitor_phone || "-"}
                </div>
                <div className="card p-2" style={{ maxHeight: "360px", overflowY: "auto" }}>
                  {state.loadingMessages ? (
                    <div className="text-center py-3">Loading messages...</div>
                  ) : state.messages.length ? (
                    state.messages.map((msg) => {
                      const localTime = formatDateTime(msg.created_at);
                      const adminTime = formatDateTime(msg.created_at, state.orgTimezone);
                      const metaTime = [localTime, adminTime && adminTime !== localTime ? adminTime : ""].filter(Boolean).join(" / ");
                      return (
                        <div
                          key={msg.id}
                          className={`ai-chatbot-message ai-chatbot-message--${msg.sender_type}`}
                        >
                          <div className="ai-chatbot-message__text">{msg.text}</div>
                          <div className="ai-chatbot-message__meta">
                            {msg.sender_type} - {metaTime || "-"}
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <div className="text-secondary">No messages.</div>
                  )}
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-outline-light" onClick={closeModal}>
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
