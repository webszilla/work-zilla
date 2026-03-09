import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  fetchInbox,
  markInboxRead,
  deleteInboxNotification,
  fetchSaasTickets,
  fetchSaasTicketDetail,
  replySaasTicket,
  updateSaasTicketStatus,
} from "../api/saasAdminInbox.js";
import TablePagination from "../components/TablePagination.jsx";
import { useConfirm } from "../components/ConfirmDialog.jsx";
import TinyHtmlEditor from "../components/TinyHtmlEditor.jsx";

const emptyState = {
  loading: true,
  error: "",
  data: null
};
const INBOX_RETENTION_NOTE = "Auto cleanup: Older inbox messages are automatically deleted when inbox exceeds 100 notifications (same rule for all products).";
const TICKET_RETENTION_NOTE = "Closed tickets are auto-deleted after 45 days.";

function formatValue(value) {
  if (value === null || value === undefined || value === "") {
    return "-";
  }
  return value;
}

function htmlToPlainText(value) {
  const html = String(value || "");
  if (!html) return "";
  if (typeof window !== "undefined" && window.document) {
    const node = window.document.createElement("div");
    node.innerHTML = html;
    return (node.textContent || node.innerText || "").replace(/\s+/g, " ").trim();
  }
  return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function truncate(value, length = 120) {
  const text = htmlToPlainText(value);
  if (!text) {
    return "";
  }
  if (text.length <= length) {
    return text;
  }
  return `${text.slice(0, length).trim()}...`;
}

function titleCase(value) {
  return String(value || "")
    .replace(/[_-]+/g, " ")
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function validateImageFiles(files) {
  if (!files || !files.length) return "";
  if (files.length > 5) return "Maximum 5 images allowed.";
  for (const file of files) {
    const size = Number(file?.size || 0);
    if (size > 2 * 1024 * 1024) return "Each image must be 2MB or smaller.";
    const type = String(file?.type || "").toLowerCase();
    if (type && !type.startsWith("image/")) return "Only image attachments are allowed.";
  }
  return "";
}

function buildTicketFormData({ message, attachments }) {
  const formData = new FormData();
  formData.set("message", message);
  Array.from(attachments || []).forEach((file) => formData.append("attachments", file));
  return formData;
}

export default function SaasAdminInboxPage() {
  const navigate = useNavigate();
  const confirm = useConfirm();
  const PAGE_SIZE = 20;

  const [activeTab, setActiveTab] = useState("tickets");

  const [inboxState, setInboxState] = useState(emptyState);
  const [selectedInboxId, setSelectedInboxId] = useState(null);
  const [inboxPage, setInboxPage] = useState(1);
  const [autoRefresh, setAutoRefresh] = useState(false);

  const [ticketState, setTicketState] = useState(emptyState);
  const [ticketPage, setTicketPage] = useState(1);
  const [selectedTicketId, setSelectedTicketId] = useState(null);
  const [selectedTicketDetail, setSelectedTicketDetail] = useState(null);
  const [ticketDetailLoading, setTicketDetailLoading] = useState(false);
  const [ticketDetailError, setTicketDetailError] = useState("");
  const [ticketStatusFilter, setTicketStatusFilter] = useState("");
  const [ticketCategoryFilter, setTicketCategoryFilter] = useState("");
  const [orgSearch, setOrgSearch] = useState("");
  const [statusSaving, setStatusSaving] = useState(false);
  const [replyForm, setReplyForm] = useState({ message: "", files: [] });
  const [replyState, setReplyState] = useState({ saving: false, error: "", success: "" });

  const inboxItems = inboxState.data?.results || [];
  const inboxTotalPages = inboxState.data?.total_pages || 1;
  const inboxUnreadCount = inboxState.data?.unread_count || 0;

  const ticketItems = ticketState.data?.results || [];
  const ticketTotalPages = ticketState.data?.total_pages || 1;
  const ticketUnreadCount = ticketState.data?.unread_count || 0;

  const selectedItem = useMemo(
    () => inboxItems.find((item) => item.id === selectedInboxId) || null,
    [inboxItems, selectedInboxId]
  );

  async function loadInbox({ keepSelection = false } = {}) {
    setInboxState((prev) => ({ ...prev, loading: true, error: "" }));
    try {
      const data = await fetchInbox({ page: inboxPage, pageSize: PAGE_SIZE });
      setInboxState({ loading: false, error: "", data });
      if (!keepSelection) {
        setSelectedInboxId(data?.results?.[0]?.id || null);
      }
    } catch (error) {
      setInboxState({
        loading: false,
        error: error?.message || "Unable to load inbox.",
        data: null
      });
    }
  }

  async function loadTickets({ keepSelection = false } = {}) {
    setTicketState((prev) => ({ ...prev, loading: true, error: "" }));
    try {
      const data = await fetchSaasTickets({
        page: ticketPage,
        pageSize: PAGE_SIZE,
        status: ticketStatusFilter,
        category: ticketCategoryFilter,
        orgSearch,
      });
      setTicketState({ loading: false, error: "", data });
      if (!keepSelection) {
        setSelectedTicketId(data?.results?.[0]?.id || null);
      }
    } catch (error) {
      setTicketState({
        loading: false,
        error: error?.message || "Unable to load tickets.",
        data: null,
      });
    }
  }

  async function loadTicketDetail(ticketId) {
    if (!ticketId) {
      setSelectedTicketDetail(null);
      setTicketDetailError("");
      return;
    }
    setTicketDetailLoading(true);
    setTicketDetailError("");
    try {
      const data = await fetchSaasTicketDetail(ticketId);
      setSelectedTicketDetail(data?.ticket || null);
    } catch (error) {
      setTicketDetailError(error?.message || "Unable to load ticket details.");
      setSelectedTicketDetail(null);
    } finally {
      setTicketDetailLoading(false);
    }
  }

  useEffect(() => {
    if (activeTab !== "inbox") return;
    loadInbox();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, inboxPage]);

  useEffect(() => {
    if (activeTab !== "tickets") return;
    loadTickets();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, ticketPage, ticketStatusFilter, ticketCategoryFilter, orgSearch]);

  useEffect(() => {
    if (activeTab !== "inbox" || !autoRefresh) {
      return;
    }
    const handle = setInterval(() => {
      loadInbox({ keepSelection: true });
    }, 30000);
    return () => clearInterval(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, autoRefresh, inboxPage]);

  useEffect(() => {
    if (!inboxItems.length) {
      setSelectedInboxId(null);
      return;
    }
    if (selectedInboxId && inboxItems.some((item) => item.id === selectedInboxId)) {
      return;
    }
    setSelectedInboxId(inboxItems[0].id);
  }, [inboxItems, selectedInboxId]);

  useEffect(() => {
    if (!ticketItems.length) {
      setSelectedTicketId(null);
      setSelectedTicketDetail(null);
      return;
    }
    if (selectedTicketId && ticketItems.some((item) => item.id === selectedTicketId)) return;
    setSelectedTicketId(ticketItems[0].id);
  }, [ticketItems, selectedTicketId]);

  useEffect(() => {
    if (activeTab !== "tickets") return;
    loadTicketDetail(selectedTicketId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, selectedTicketId]);

  async function markSelectedRead(item) {
    if (!item || item.is_read) {
      return;
    }
    try {
      await markInboxRead([item.id]);
      setInboxState((prev) => ({
        ...prev,
        data: {
          ...prev.data,
          results: prev.data.results.map((row) =>
            row.id === item.id ? { ...row, is_read: true } : row
          ),
          unread_count: Math.max((prev.data.unread_count || 0) - 1, 0)
        }
      }));
    } catch {
      // no-op
    }
  }

  async function handleDelete(item) {
    if (!item) {
      return;
    }
    const confirmed = await confirm({
      title: "Delete Notification",
      message: "Delete this notification from inbox?",
      confirmText: "Delete",
      confirmVariant: "danger"
    });
    if (!confirmed) {
      return;
    }
    try {
      await deleteInboxNotification(item.id);
      await loadInbox({ keepSelection: false });
    } catch (error) {
      setInboxState((prev) => ({
        ...prev,
        error: error?.message || "Unable to delete notification."
      }));
    }
  }

  async function handleMarkAllRead() {
    const unreadIds = inboxItems.filter((item) => !item.is_read).map((item) => item.id);
    if (!unreadIds.length) {
      return;
    }
    try {
      await markInboxRead(unreadIds);
      setInboxState((prev) => ({
        ...prev,
        data: {
          ...prev.data,
          results: prev.data.results.map((row) => ({ ...row, is_read: true })),
          unread_count: 0
        }
      }));
    } catch (error) {
      setInboxState((prev) => ({
        ...prev,
        error: error?.message || "Unable to mark notifications as read."
      }));
    }
  }

  async function handleReplyTicket(event) {
    event.preventDefault();
    if (!selectedTicketDetail?.id) return;
    const message = String(replyForm.message || "").trim();
    if (!message) {
      setReplyState({ saving: false, error: "Reply message is required.", success: "" });
      return;
    }
    const fileError = validateImageFiles(replyForm.files);
    if (fileError) {
      setReplyState({ saving: false, error: fileError, success: "" });
      return;
    }

    setReplyState({ saving: true, error: "", success: "" });
    try {
      const formData = buildTicketFormData({ message, attachments: replyForm.files });
      const data = await replySaasTicket(selectedTicketDetail.id, formData);
      setSelectedTicketDetail(data?.ticket || null);
      setReplyForm({ message: "", files: [] });
      setReplyState({ saving: false, error: "", success: "Reply sent." });
      await loadTickets({ keepSelection: true });
    } catch (error) {
      setReplyState({ saving: false, error: error?.message || "Unable to send reply.", success: "" });
    }
  }

  async function handleTicketStatusChange(nextStatus) {
    if (!selectedTicketDetail?.id || !nextStatus) return;
    setStatusSaving(true);
    setTicketDetailError("");
    try {
      const data = await updateSaasTicketStatus(selectedTicketDetail.id, nextStatus);
      setSelectedTicketDetail(data?.ticket || null);
      await loadTickets({ keepSelection: true });
    } catch (error) {
      setTicketDetailError(error?.message || "Unable to update ticket status.");
    } finally {
      setStatusSaving(false);
    }
  }

  function getApprovalButtonMeta(item) {
    const status = String(item?.approval_status || "").toLowerCase();
    if (status === "approved") {
      return { label: "Approved", className: "btn btn-primary btn-sm inbox-detail-btn" };
    }
    if (status === "rejected") {
      return { label: "Rejected", className: "btn btn-primary btn-sm inbox-detail-btn" };
    }
    return { label: "Go to Approval", className: "btn btn-primary btn-sm inbox-detail-btn" };
  }

  return (
    <>
      <div className="d-flex align-items-center justify-content-between flex-wrap gap-2">
        <h3 className="page-title mb-0">Ticket & Inbox</h3>
        <div className="d-flex align-items-center gap-2 flex-wrap">
          <button
            type="button"
            className={`btn btn-sm ${activeTab === "tickets" ? "btn-primary" : "btn-outline-light"}`}
            onClick={() => setActiveTab("tickets")}
          >
            Ticket
            <span className="ms-1 badge bg-dark">{ticketUnreadCount}</span>
          </button>
          <button
            type="button"
            className={`btn btn-sm ${activeTab === "inbox" ? "btn-primary" : "btn-outline-light"}`}
            onClick={() => setActiveTab("inbox")}
          >
            Inbox
            <span className="ms-1 badge bg-dark">{inboxUnreadCount}</span>
          </button>
        </div>
      </div>

      {activeTab === "tickets" ? (
        <>
          {ticketState.error ? <div className="alert alert-danger mt-3">{ticketState.error}</div> : null}
          <div className="small text-secondary mt-3">{TICKET_RETENTION_NOTE}</div>

          <div className="d-flex flex-wrap align-items-center gap-2 mt-3">
            <input
              type="text"
              className="form-control form-control-sm"
              placeholder="Search organization or subject"
              style={{ maxWidth: "260px" }}
              value={orgSearch}
              onChange={(event) => {
                setOrgSearch(event.target.value);
                setTicketPage(1);
              }}
            />
            <select
              className="form-select form-select-sm"
              style={{ maxWidth: "160px" }}
              value={ticketCategoryFilter}
              onChange={(event) => {
                setTicketCategoryFilter(event.target.value);
                setTicketPage(1);
              }}
            >
              <option value="">All Types</option>
              <option value="support">Support</option>
              <option value="sales">Sales</option>
            </select>
            <select
              className="form-select form-select-sm"
              style={{ maxWidth: "180px" }}
              value={ticketStatusFilter}
              onChange={(event) => {
                setTicketStatusFilter(event.target.value);
                setTicketPage(1);
              }}
            >
              <option value="">All Status</option>
              <option value="open">Open</option>
              <option value="in_progress">In Progress</option>
              <option value="resolved">Resolved</option>
              <option value="closed">Closed</option>
            </select>
            <button type="button" className="btn btn-primary btn-sm" onClick={() => loadTickets({ keepSelection: true })}>
              Refresh Tickets
            </button>
          </div>

          <div className="inbox-layout mt-3">
            <div className="card inbox-list">
              <div className="inbox-list-header">
                <span>All Tickets</span>
                <span className="text-secondary small">{formatValue(ticketState.data?.total)} total</span>
              </div>
              <div className="inbox-list-body">
                {ticketState.loading ? (
                  <div className="text-secondary p-3">Loading tickets...</div>
                ) : ticketItems.length ? (
                  ticketItems.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      className={`inbox-item ${item.id === selectedTicketId ? "active" : ""} ${item.unread_replies ? "unread" : "read"}`}
                      onClick={() => setSelectedTicketId(item.id)}
                    >
                      <div className="inbox-item-title">
                        <span>{item.subject}</span>
                        <span className="inbox-item-date">{formatValue(item.updated_at)}</span>
                      </div>
                      <div className="inbox-item-meta">
                        <span>{item.organization_name || "-"}</span>
                        <span>{titleCase(item.category)}</span>
                        <span className="inbox-item-type">{titleCase(item.status)}</span>
                      </div>
                      <div className="inbox-item-message">{truncate(item.latest_message_preview, 90)}</div>
                    </button>
                  ))
                ) : (
                  <div className="text-secondary p-3">No tickets yet.</div>
                )}
              </div>
              <div className="inbox-list-footer">
                <TablePagination
                  page={ticketPage}
                  totalPages={ticketTotalPages}
                  onPageChange={setTicketPage}
                  showPageLinks
                  showPageLabel={false}
                  maxPageLinks={5}
                />
              </div>
            </div>

            <div className="card inbox-detail">
              {ticketDetailError ? <div className="alert alert-danger py-2">{ticketDetailError}</div> : null}
              {ticketDetailLoading ? (
                <div className="text-secondary p-4">Loading ticket...</div>
              ) : selectedTicketDetail ? (
                <>
                  <div className="d-flex align-items-start justify-content-between gap-2 mb-2">
                    <div>
                      <h5 className="mb-1">{selectedTicketDetail.subject}</h5>
                      <div className="text-secondary small">
                        {selectedTicketDetail.organization_name || "-"} • {titleCase(selectedTicketDetail.category)} • {formatValue(selectedTicketDetail.created_at)}
                      </div>
                    </div>
                    <select
                      className="form-select form-select-sm"
                      style={{ width: "170px" }}
                      value={selectedTicketDetail.status}
                      disabled={statusSaving}
                      onChange={(event) => handleTicketStatusChange(event.target.value)}
                    >
                      <option value="open">Open</option>
                      <option value="in_progress">In Progress</option>
                      <option value="resolved">Resolved</option>
                      <option value="closed">Closed</option>
                    </select>
                  </div>

                  <div className="d-flex flex-column gap-2 mb-3" style={{ maxHeight: "360px", overflowY: "auto" }}>
                    {(selectedTicketDetail.messages || []).map((msg) => (
                      <div key={msg.id} className="border rounded p-2">
                        <div className="d-flex justify-content-between small text-secondary mb-1">
                          <span>{msg.author_name || titleCase(msg.author_role)}</span>
                          <span>{formatValue(msg.created_at)}</span>
                        </div>
                        <div className="mb-1" dangerouslySetInnerHTML={{ __html: msg.message || "" }} />
                        {msg.attachments?.length ? (
                          <div className="d-flex flex-wrap gap-2">
                            {msg.attachments.map((att) => (
                              <a key={att.id} href={att.url} target="_blank" rel="noreferrer" className="btn btn-outline-light btn-sm">
                                {att.name || "Image"}
                              </a>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    ))}
                  </div>

                  {replyState.success ? <div className="alert alert-success py-2">{replyState.success}</div> : null}
                  <form className="d-flex flex-column gap-2" onSubmit={handleReplyTicket}>
                    <TinyHtmlEditor
                      label=""
                      value={replyForm.message}
                      onChange={(value) => setReplyForm((prev) => ({ ...prev, message: value }))}
                      placeholder="Reply to this ticket"
                      minHeight={220}
                    />
                    <input
                      type="file"
                      className="form-control"
                      accept="image/*"
                      multiple
                      onChange={(event) => {
                        const files = Array.from(event.target.files || []);
                        setReplyForm((prev) => ({ ...prev, files }));
                      }}
                    />
                    <div className="small text-secondary">Up to 5 images, max 2MB each.</div>
                    {replyState.error ? <div className="alert alert-danger py-2 mb-0">{replyState.error}</div> : null}
                    <div>
                      <button type="submit" className="btn btn-primary btn-sm" disabled={replyState.saving}>
                        {replyState.saving ? "Sending..." : "Send Reply"}
                      </button>
                    </div>
                  </form>
                </>
              ) : (
                <div className="text-secondary p-4">Select a ticket to view details.</div>
              )}
            </div>
          </div>
        </>
      ) : (
        <>
          {inboxState.error ? <div className="alert alert-danger mt-3">{inboxState.error}</div> : null}
          <div className="d-flex align-items-center justify-content-between flex-wrap gap-2 mt-3">
            <div className="small text-secondary">{INBOX_RETENTION_NOTE}</div>
            <div className="d-flex align-items-center gap-2 flex-wrap">
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

          <div className="inbox-layout mt-3">
            <div className="card inbox-list">
              <div className="inbox-list-header">
                <span>All Notifications</span>
                <span className="text-secondary small">{formatValue(inboxState.data?.total)} total</span>
              </div>
              <div className="inbox-list-body">
                {inboxState.loading ? (
                  <div className="text-secondary p-3">Loading inbox...</div>
                ) : inboxItems.length ? (
                  inboxItems.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      className={`inbox-item ${item.id === selectedInboxId ? "active" : ""} ${item.is_read ? "read" : "unread"}`}
                      onClick={() => {
                        setSelectedInboxId(item.id);
                        markSelectedRead(item);
                      }}
                    >
                      <div className="inbox-item-title">
                        <span>{item.title}</span>
                        <span className="inbox-item-date">{formatValue(item.created_at)}</span>
                      </div>
                      <div className="inbox-item-meta">
                        <span>{item.organization_name || "Global"}</span>
                        {item.org_admin_name ? <span>Org Admin: {item.org_admin_name}</span> : null}
                        <span className="inbox-item-type">{item.event_type}</span>
                      </div>
                      <div className="inbox-item-preview">{truncate(item.message)}</div>
                    </button>
                  ))
                ) : (
                  <div className="text-secondary p-3">No notifications yet.</div>
                )}
              </div>
              <div className="inbox-list-footer">
                <TablePagination
                  page={inboxPage}
                  totalPages={inboxTotalPages}
                  onPageChange={setInboxPage}
                  showPageLinks
                  showPageLabel={false}
                  maxPageLinks={5}
                />
              </div>
            </div>

            <div className="card inbox-detail">
              {selectedItem ? (
                <>
                  <div className="inbox-detail-header">
                    <div>
                      <h5 className="mb-1">{selectedItem.title}</h5>
                      <div className="text-secondary small">
                        {selectedItem.organization_name || "Global"} · {selectedItem.event_type}
                      </div>
                      {selectedItem.org_admin_name ? (
                        <div className="text-secondary small mt-1">
                          Org Admin: {selectedItem.org_admin_name}
                          {selectedItem.org_admin_email ? ` (${selectedItem.org_admin_email})` : ""}
                        </div>
                      ) : null}
                    </div>
                    <div className="inbox-detail-actions">
                      {selectedItem.is_payment_notification ? (
                        <button
                          type="button"
                          className={getApprovalButtonMeta(selectedItem).className}
                          disabled={!selectedItem.approval_url}
                          onClick={() => {
                            if (!selectedItem.approval_url) {
                              return;
                            }
                            navigate(selectedItem.approval_url);
                          }}
                        >
                          {getApprovalButtonMeta(selectedItem).label}
                        </button>
                      ) : null}
                      {!selectedItem.is_read ? (
                        <button
                          type="button"
                          className="btn btn-primary btn-sm inbox-detail-btn"
                          onClick={() => markSelectedRead(selectedItem)}
                        >
                          Mark read
                        </button>
                      ) : null}
                      <button
                        type="button"
                        className="btn btn-outline-danger btn-sm inbox-detail-btn inbox-detail-btn--danger"
                        onClick={() => handleDelete(selectedItem)}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                  <div className="inbox-detail-meta">
                    <span>{formatValue(selectedItem.created_at)}</span>
                  </div>
                  <div className="inbox-detail-body">
                    {selectedItem.message ? (
                      <p className="mb-0">{htmlToPlainText(selectedItem.message)}</p>
                    ) : (
                      <p className="text-secondary mb-0">No additional details.</p>
                    )}
                  </div>
                </>
              ) : (
                <div className="text-secondary p-4">Select a notification to view details.</div>
              )}
            </div>
          </div>
        </>
      )}
    </>
  );
}
