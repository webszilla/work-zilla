import { useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import {
  fetchOrgInbox,
  markOrgInboxRead,
  deleteOrgInboxNotification,
  composeOrgInboxNotification,
} from "../api/orgInbox.js";
import {
  fetchOrgTickets,
  createOrgTicket,
  fetchOrgTicketDetail,
  replyOrgTicket,
  updateOrgTicketStatus,
} from "../api/orgTickets.js";
import { waApi } from "../api/whatsappAutomation.js";
import TablePagination from "../components/TablePagination.jsx";
import { useConfirm } from "../components/ConfirmDialog.jsx";
import TinyHtmlEditor from "../components/TinyHtmlEditor.jsx";
import { showUploadAlert } from "../lib/uploadAlert.js";

const emptyState = {
  loading: true,
  error: "",
  data: null,
};

const TICKET_MAX_ATTACHMENTS = 5;
const TICKET_MAX_BYTES = 2 * 1024 * 1024;
const INBOX_RETENTION_NOTE = "Auto cleanup: Older inbox messages are automatically deleted when inbox exceeds 100 notifications (same rule for all products).";
const ENQUIRY_STATUS_TABS = [
  { key: "new", label: "New" },
  { key: "following", label: "Following" },
  { key: "completed", label: "Completed" },
  { key: "all", label: "All" },
];

function formatValue(value) {
  if (value === null || value === undefined || value === "") {
    return "-";
  }
  return value;
}

function truncate(value, length = 120) {
  if (!value) return "";
  const text = String(value).replace(/<[^>]*>/g, " ");
  return text.length <= length ? text : `${text.slice(0, length).trim()}...`;
}

function titleCase(value) {
  return String(value || "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function htmlToPlainText(value) {
  const html = String(value || "");
  if (!html) return "";
  if (typeof window !== "undefined" && window.document) {
    const node = window.document.createElement("div");
    node.innerHTML = html;
    return (node.textContent || node.innerText || "").trim();
  }
  return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function resolveCurrentProductSlug(pathname) {
  const rawPath = String(pathname || "").toLowerCase();
  if (rawPath.includes("/storage")) return "storage";
  if (rawPath.includes("/business-autopilot")) return "business-autopilot-erp";
  if (rawPath.includes("/whatsapp-automation")) return "whatsapp-automation";
  if (rawPath.includes("/ai-chatbot")) return "ai-chatbot";
  if (rawPath.includes("/digital-card")) return "digital-card";
  if (rawPath.includes("/ai-chat-widget")) return "ai-chat-widget";
  return "monitor";
}

function validateImageFiles(fileList) {
  const files = Array.from(fileList || []);
  if (files.length > TICKET_MAX_ATTACHMENTS) {
    return `Maximum ${TICKET_MAX_ATTACHMENTS} images allowed.`;
  }
  for (const file of files) {
    if (file.size > TICKET_MAX_BYTES) {
      return "Each image must be 2MB or smaller.";
    }
    if (file.type && !file.type.startsWith("image/")) {
      return "Only image files are allowed.";
    }
  }
  return "";
}

function buildTicketFormData({ category, subject, message, priority, productSlug, attachments }) {
  const formData = new FormData();
  formData.set("category", category || "support");
  if (subject !== undefined) {
    formData.set("subject", subject || "");
  }
  formData.set("message", message || "");
  formData.set("priority", String(priority || "medium").toLowerCase());
  if (productSlug) {
    formData.set("product_slug", productSlug);
  }
  Array.from(attachments || []).forEach((file) => {
    formData.append("attachments", file);
  });
  return formData;
}

export default function OrgInboxPage({ productSlug = "" }) {
  const location = useLocation();
  const confirm = useConfirm();
  const PAGE_SIZE = 20;
  const currentProductSlug = useMemo(() => {
    const explicit = String(productSlug || "").trim().toLowerCase();
    if (explicit) return explicit;
    return resolveCurrentProductSlug(location.pathname);
  }, [location.pathname, productSlug]);
  const isWhatsappAutomationProduct = currentProductSlug === "whatsapp-automation";

  const [activeTab, setActiveTab] = useState("tickets");

  const [inboxState, setInboxState] = useState(emptyState);
  const [selectedInboxId, setSelectedInboxId] = useState(null);
  const [inboxPage, setInboxPage] = useState(1);
  const [autoRefreshInbox, setAutoRefreshInbox] = useState(false);
  const [showComposeInbox, setShowComposeInbox] = useState(false);
  const [composeForm, setComposeForm] = useState({ title: "", message: "", channel: "email" });
  const [composeState, setComposeState] = useState({ sending: false, error: "", success: "" });

  const [ticketState, setTicketState] = useState(emptyState);
  const [ticketPage, setTicketPage] = useState(1);
  const [selectedTicketId, setSelectedTicketId] = useState(null);
  const [selectedTicketDetail, setSelectedTicketDetail] = useState(null);
  const [ticketDetailLoading, setTicketDetailLoading] = useState(false);
  const [ticketDetailError, setTicketDetailError] = useState("");
  const [ticketStatusFilter, setTicketStatusFilter] = useState("");
  const [ticketCategoryFilter, setTicketCategoryFilter] = useState("");
  const [showCreateTicket, setShowCreateTicket] = useState(false);
  const [createTicketForm, setCreateTicketForm] = useState({
    name: "",
    category: "support",
    priority: "medium",
    subject: "",
    productSlug: currentProductSlug,
    message: "",
    files: [],
  });
  const [createTicketState, setCreateTicketState] = useState({ saving: false, error: "", success: "" });
  const [replyForm, setReplyForm] = useState({ message: "", files: [] });
  const [replyState, setReplyState] = useState({ saving: false, error: "", success: "" });
  const [statusSaving, setStatusSaving] = useState(false);
  const [feedbackState, setFeedbackState] = useState(emptyState);
  const [feedbackPage, setFeedbackPage] = useState(1);
  const [selectedFeedbackId, setSelectedFeedbackId] = useState(null);
  const [feedbackDeleteBusy, setFeedbackDeleteBusy] = useState(false);
  const [enquiryState, setEnquiryState] = useState(emptyState);
  const [enquiryPage, setEnquiryPage] = useState(1);
  const [enquiryStatusTab, setEnquiryStatusTab] = useState("new");
  const [selectedEnquiryId, setSelectedEnquiryId] = useState(null);
  const [enquiryStatusSaving, setEnquiryStatusSaving] = useState(false);

  const inboxItems = inboxState.data?.results || [];
  const inboxTotalPages = inboxState.data?.total_pages || 1;
  const inboxUnreadCount = inboxState.data?.unread_count || 0;
  const selectedInboxItem = useMemo(
    () => inboxItems.find((item) => item.id === selectedInboxId) || null,
    [inboxItems, selectedInboxId]
  );
  const feedbackItems = feedbackState.data?.items || [];
  const feedbackTotalPages = feedbackState.data?.pagination?.total_pages || 1;
  const selectedFeedbackItem = useMemo(
    () => feedbackItems.find((item) => item.id === selectedFeedbackId) || null,
    [feedbackItems, selectedFeedbackId]
  );
  const enquiryItems = enquiryState.data?.items || [];
  const enquiryTotalPages = enquiryState.data?.pagination?.total_pages || 1;
  const selectedEnquiryItem = useMemo(
    () => enquiryItems.find((item) => item.id === selectedEnquiryId) || null,
    [enquiryItems, selectedEnquiryId]
  );

  const ticketItems = ticketState.data?.results || [];
  const ticketTotalPages = ticketState.data?.total_pages || 1;
  const ticketUnreadCount = ticketState.data?.unread_count || 0;
  const ticketProductOptions = useMemo(() => {
    const options = ticketState.data?.product_options || [];
    if (options.length) {
      return options;
    }
    return [{ slug: currentProductSlug, name: titleCase(currentProductSlug.replace(/-/g, " ")) }];
  }, [ticketState.data, currentProductSlug]);
  const prioritySupportByProduct = ticketState.data?.priority_support_by_product || {};
  const urgentAllowedForSelectedProduct = Boolean(
    prioritySupportByProduct[createTicketForm.productSlug || currentProductSlug]
  );

  async function loadInbox({ keepSelection = false } = {}) {
    setInboxState((prev) => ({ ...prev, loading: true, error: "" }));
    try {
      const data = await fetchOrgInbox({ page: inboxPage, pageSize: PAGE_SIZE, productSlug: currentProductSlug });
      setInboxState({ loading: false, error: "", data });
      if (!keepSelection) {
        setSelectedInboxId(data?.results?.[0]?.id || null);
      }
    } catch (error) {
      setInboxState({
        loading: false,
        error: error?.message || "Unable to load inbox.",
        data: null,
      });
    }
  }

  async function loadTickets({ keepSelection = false } = {}) {
    setTicketState((prev) => ({ ...prev, loading: true, error: "" }));
    try {
      const data = await fetchOrgTickets({
        page: ticketPage,
        pageSize: PAGE_SIZE,
        productSlug: currentProductSlug,
        status: ticketStatusFilter,
        category: ticketCategoryFilter,
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
      const data = await fetchOrgTicketDetail(ticketId);
      setSelectedTicketDetail(data?.ticket || null);
    } catch (error) {
      setTicketDetailError(error?.message || "Unable to load ticket details.");
      setSelectedTicketDetail(null);
    } finally {
      setTicketDetailLoading(false);
    }
  }

  async function loadFeedbackInbox({ keepSelection = false } = {}) {
    if (!isWhatsappAutomationProduct) return;
    setFeedbackState((prev) => ({ ...prev, loading: true, error: "" }));
    try {
      const data = await waApi.getDigitalCardFeedbackInbox({ page: feedbackPage, pageSize: PAGE_SIZE });
      setFeedbackState({ loading: false, error: "", data });
      if (!keepSelection) {
        setSelectedFeedbackId(data?.items?.[0]?.id || null);
      }
    } catch (error) {
      setFeedbackState({
        loading: false,
        error: error?.message || "Unable to load feedback inbox.",
        data: null,
      });
    }
  }

  async function loadEnquiryInbox({ keepSelection = false } = {}) {
    if (!isWhatsappAutomationProduct) return;
    setEnquiryState((prev) => ({ ...prev, loading: true, error: "" }));
    try {
      const data = await waApi.getDigitalCardEnquiryInbox({
        page: enquiryPage,
        pageSize: PAGE_SIZE,
        status: enquiryStatusTab,
      });
      setEnquiryState({ loading: false, error: "", data });
      if (!keepSelection) {
        setSelectedEnquiryId(data?.items?.[0]?.id || null);
      }
    } catch (error) {
      setEnquiryState({
        loading: false,
        error: error?.message || "Unable to load enquiry inbox.",
        data: null,
      });
    }
  }

  useEffect(() => {
    loadInbox();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentProductSlug, inboxPage]);

  useEffect(() => {
    loadTickets();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentProductSlug, ticketPage, ticketStatusFilter, ticketCategoryFilter]);

  useEffect(() => {
    if (!ticketProductOptions.length) {
      return;
    }
    const allowed = new Set(ticketProductOptions.map((item) => String(item.slug || "")));
    const preferred = allowed.has(currentProductSlug)
      ? currentProductSlug
      : String(ticketProductOptions[0]?.slug || "");
    setCreateTicketForm((prev) => {
      if (prev.productSlug && allowed.has(prev.productSlug)) {
        return prev;
      }
      return { ...prev, productSlug: preferred };
    });
  }, [ticketProductOptions, currentProductSlug]);

  useEffect(() => {
    if (!isWhatsappAutomationProduct && (activeTab === "feedback" || activeTab === "enquiry")) {
      setActiveTab("tickets");
    }
  }, [isWhatsappAutomationProduct, activeTab]);

  useEffect(() => {
    if (!autoRefreshInbox || activeTab !== "inbox") return;
    const handle = setInterval(() => loadInbox({ keepSelection: true }), 30000);
    return () => clearInterval(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRefreshInbox, activeTab, currentProductSlug, inboxPage]);

  useEffect(() => {
    if (!isWhatsappAutomationProduct || activeTab !== "feedback") return;
    loadFeedbackInbox();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isWhatsappAutomationProduct, activeTab, feedbackPage]);

  useEffect(() => {
    if (!isWhatsappAutomationProduct || activeTab !== "enquiry") return;
    loadEnquiryInbox();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isWhatsappAutomationProduct, activeTab, enquiryPage, enquiryStatusTab]);

  useEffect(() => {
    if (!inboxItems.length) {
      setSelectedInboxId(null);
      return;
    }
    if (selectedInboxId && inboxItems.some((item) => item.id === selectedInboxId)) return;
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
    if (!feedbackItems.length) {
      setSelectedFeedbackId(null);
      return;
    }
    if (selectedFeedbackId && feedbackItems.some((item) => item.id === selectedFeedbackId)) return;
    setSelectedFeedbackId(feedbackItems[0].id);
  }, [feedbackItems, selectedFeedbackId]);

  useEffect(() => {
    if (!enquiryItems.length) {
      setSelectedEnquiryId(null);
      return;
    }
    if (selectedEnquiryId && enquiryItems.some((item) => item.id === selectedEnquiryId)) return;
    setSelectedEnquiryId(enquiryItems[0].id);
  }, [enquiryItems, selectedEnquiryId]);

  useEffect(() => {
    loadTicketDetail(selectedTicketId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTicketId]);

  async function markSelectedInboxRead(item) {
    if (!item || item.is_read) return;
    try {
      await markOrgInboxRead([item.id]);
      setInboxState((prev) => ({
        ...prev,
        data: {
          ...prev.data,
          results: prev.data.results.map((row) => (row.id === item.id ? { ...row, is_read: true } : row)),
          unread_count: Math.max((prev.data.unread_count || 0) - 1, 0),
        },
      }));
    } catch {
      // no-op
    }
  }

  async function handleDeleteInbox(item) {
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
      setInboxState((prev) => ({ ...prev, error: error?.message || "Unable to delete notification." }));
    }
  }

  async function handleMarkAllInboxRead() {
    const unreadIds = inboxItems.filter((item) => !item.is_read).map((item) => item.id);
    if (!unreadIds.length) return;
    try {
      await markOrgInboxRead(unreadIds);
      setInboxState((prev) => ({
        ...prev,
        data: {
          ...prev.data,
          results: prev.data.results.map((row) => ({ ...row, is_read: true })),
          unread_count: 0,
        },
      }));
    } catch (error) {
      setInboxState((prev) => ({ ...prev, error: error?.message || "Unable to mark notifications as read." }));
    }
  }

  async function handleDeleteFeedback(item) {
    if (!item || feedbackDeleteBusy) return;
    const confirmed = await confirm({
      title: "Delete Feedback",
      message: "Delete this feedback from inbox?",
      confirmText: "Delete",
      confirmVariant: "danger",
    });
    if (!confirmed) return;
    setFeedbackDeleteBusy(true);
    try {
      await waApi.deleteDigitalCardFeedback(item.id);
      await loadFeedbackInbox({ keepSelection: false });
    } catch (error) {
      setFeedbackState((prev) => ({ ...prev, error: error?.message || "Unable to delete feedback." }));
    } finally {
      setFeedbackDeleteBusy(false);
    }
  }

  async function handleEnquiryStatusChange(nextStatus) {
    if (!selectedEnquiryItem || !nextStatus) return;
    setEnquiryStatusSaving(true);
    try {
      await waApi.updateDigitalCardEnquiryStatus(selectedEnquiryItem.id, nextStatus);
      await loadEnquiryInbox({ keepSelection: true });
    } catch (error) {
      setEnquiryState((prev) => ({ ...prev, error: error?.message || "Unable to update enquiry status." }));
    } finally {
      setEnquiryStatusSaving(false);
    }
  }

  function handleExportEnquiry() {
    const url = waApi.getDigitalCardEnquiryExportUrl(enquiryStatusTab || "all");
    if (typeof window !== "undefined") {
      window.open(url, "_blank", "noopener,noreferrer");
    }
  }

  async function handleComposeSubmit(event) {
    event.preventDefault();
    const title = String(composeForm.title || "").trim();
    const message = String(composeForm.message || "").trim();
    if (!title || !message) {
      setComposeState({ sending: false, error: "Subject and message are required.", success: "" });
      return;
    }
    setComposeState({ sending: true, error: "", success: "" });
    try {
      await composeOrgInboxNotification({
        title,
        message,
        channel: composeForm.channel || "email",
        product_slug: currentProductSlug,
      });
      setComposeForm({ title: "", message: "", channel: "email" });
      setComposeState({ sending: false, error: "", success: "Message sent to all users inbox." });
      setShowComposeInbox(false);
      await loadInbox({ keepSelection: false });
    } catch (error) {
      setComposeState({ sending: false, error: error?.message || "Unable to send message to inbox.", success: "" });
    }
  }

  async function handleCreateTicket(event) {
    event.preventDefault();
    const requesterName = String(createTicketForm.name || "").trim();
    const subject = String(createTicketForm.subject || "").trim();
    const message = String(createTicketForm.message || "");
    if (!requesterName || !subject || !htmlToPlainText(message)) {
      setCreateTicketState({ saving: false, error: "Name, subject and message are required.", success: "" });
      return;
    }
    const fileError = validateImageFiles(createTicketForm.files);
    if (fileError) {
      showUploadAlert(fileError);
      setCreateTicketState({ saving: false, error: fileError, success: "" });
      return;
    }
    if (String(createTicketForm.priority || "").toLowerCase() === "urgent" && !urgentAllowedForSelectedProduct) {
      setCreateTicketState({
        saving: false,
        error: "Urgent priority is available only for highest plan users.",
        success: "",
      });
      return;
    }
    setCreateTicketState({ saving: true, error: "", success: "" });
    try {
      const formData = buildTicketFormData({
        category: createTicketForm.category,
        subject,
        priority: createTicketForm.priority || "medium",
        message: `<p><strong>Name:</strong> ${requesterName}</p><p><strong>Priority:</strong> ${titleCase(createTicketForm.priority || "medium")}</p>${message}`,
        productSlug: createTicketForm.productSlug || currentProductSlug,
        attachments: createTicketForm.files,
      });
      await createOrgTicket(formData);
      setCreateTicketForm((prev) => ({
        name: "",
        category: "support",
        priority: "medium",
        subject: "",
        productSlug: prev.productSlug || currentProductSlug,
        message: "",
        files: [],
      }));
      setCreateTicketState({ saving: false, error: "", success: "Ticket created successfully." });
      setShowCreateTicket(false);
      setTicketPage(1);
      await loadTickets({ keepSelection: false });
    } catch (error) {
      setCreateTicketState({ saving: false, error: error?.message || "Unable to create ticket.", success: "" });
    }
  }

  async function handleReplyTicket(event) {
    event.preventDefault();
    if (!selectedTicketDetail?.id) return;
    const message = String(replyForm.message || "");
    if (!htmlToPlainText(message)) {
      setReplyState({ saving: false, error: "Reply message is required.", success: "" });
      return;
    }
    const fileError = validateImageFiles(replyForm.files);
    if (fileError) {
      showUploadAlert(fileError);
      setReplyState({ saving: false, error: fileError, success: "" });
      return;
    }
    setReplyState({ saving: true, error: "", success: "" });
    try {
      const formData = buildTicketFormData({
        category: "support",
        subject: undefined,
        message,
        productSlug: currentProductSlug,
        attachments: replyForm.files,
      });
      const data = await replyOrgTicket(selectedTicketDetail.id, formData);
      setSelectedTicketDetail(data?.ticket || null);
      setReplyForm({ message: "", files: [] });
      setReplyState({ saving: false, error: "", success: "Reply added." });
      await loadTickets({ keepSelection: true });
    } catch (error) {
      setReplyState({ saving: false, error: error?.message || "Unable to add reply.", success: "" });
    }
  }

  async function handleTicketStatusChange(nextStatus) {
    if (!selectedTicketDetail?.id || !nextStatus) return;
    setStatusSaving(true);
    setTicketDetailError("");
    try {
      const data = await updateOrgTicketStatus(selectedTicketDetail.id, nextStatus);
      setSelectedTicketDetail(data?.ticket || null);
      await loadTickets({ keepSelection: true });
    } catch (error) {
      setTicketDetailError(error?.message || "Unable to update ticket status.");
    } finally {
      setStatusSaving(false);
    }
  }

  if (activeTab === "inbox" && inboxState.loading) {
    return (
      <div className="card p-4 text-center">
        <div className="spinner" />
        <p className="mb-0">Loading inbox...</p>
      </div>
    );
  }

  if (activeTab === "tickets" && ticketState.loading) {
    return (
      <div className="card p-4 text-center">
        <div className="spinner" />
        <p className="mb-0">Loading tickets...</p>
      </div>
    );
  }

  if (activeTab === "feedback" && feedbackState.loading) {
    return (
      <div className="card p-4 text-center">
        <div className="spinner" />
        <p className="mb-0">Loading feedback...</p>
      </div>
    );
  }

  if (activeTab === "enquiry" && enquiryState.loading) {
    return (
      <div className="card p-4 text-center">
        <div className="spinner" />
        <p className="mb-0">Loading enquiries...</p>
      </div>
    );
  }

  return (
    <>
      <div className="d-flex align-items-center justify-content-between flex-wrap gap-2">
        <h3 className="page-title mb-0">Inbox</h3>
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
          {isWhatsappAutomationProduct ? (
            <>
              <button
                type="button"
                className={`btn btn-sm ${activeTab === "feedback" ? "btn-primary" : "btn-outline-light"}`}
                onClick={() => setActiveTab("feedback")}
              >
                Feedback
                <span className="ms-1 badge bg-dark">{formatValue(feedbackState.data?.pagination?.total_items || 0)}</span>
              </button>
              <button
                type="button"
                className={`btn btn-sm ${activeTab === "enquiry" ? "btn-primary" : "btn-outline-light"}`}
                onClick={() => setActiveTab("enquiry")}
              >
                Enquiry
                <span className="ms-1 badge bg-dark">{formatValue(enquiryState.data?.counts?.new || 0)}</span>
              </button>
            </>
          ) : null}

          {activeTab === "tickets" ? (
            <button
              type="button"
              className={`btn btn-sm ${showCreateTicket ? "btn-primary" : "btn-outline-light"}`}
              onClick={() => {
                setShowCreateTicket((prev) => !prev);
                setCreateTicketState((prev) => ({ ...prev, error: "", success: "" }));
              }}
            >
              <i className="bi bi-plus-lg me-1" aria-hidden="true" />
              Create Ticket
            </button>
          ) : activeTab === "inbox" ? (
            <>
              <button
                type="button"
                className={`btn btn-sm ${showComposeInbox ? "btn-primary" : "btn-outline-light"}`}
                onClick={() => {
                  setShowComposeInbox((prev) => !prev);
                  setComposeState((prev) => ({ ...prev, error: "", success: "" }));
                }}
              >
                <i className="bi bi-pencil-square me-1" aria-hidden="true" />
                Compose
              </button>
              <button type="button" className="btn btn-outline-light btn-sm" onClick={handleMarkAllInboxRead}>
                Mark all read
              </button>
              <button type="button" className="btn btn-primary btn-sm" onClick={() => loadInbox({ keepSelection: true })}>
                Refresh
              </button>
              <label className="form-check inbox-auto-refresh">
                <input
                  type="checkbox"
                  className="form-check-input"
                  checked={autoRefreshInbox}
                  onChange={(event) => setAutoRefreshInbox(event.target.checked)}
                />
                <span className="form-check-label">Auto-refresh (30s)</span>
              </label>
            </>
          ) : activeTab === "feedback" ? (
            <button type="button" className="btn btn-primary btn-sm" onClick={() => loadFeedbackInbox({ keepSelection: true })}>
              Refresh Feedback
            </button>
          ) : activeTab === "enquiry" ? (
            <div className="d-flex align-items-center gap-2 flex-wrap">
              <button type="button" className="btn btn-primary btn-sm" onClick={() => loadEnquiryInbox({ keepSelection: true })}>
                Refresh Enquiry
              </button>
              <button type="button" className="btn btn-outline-light btn-sm" onClick={handleExportEnquiry}>
                Export Excel
              </button>
            </div>
          ) : null}
        </div>
      </div>

      {activeTab === "inbox" ? <div className="small text-secondary mt-3">{INBOX_RETENTION_NOTE}</div> : null}
      {activeTab === "feedback" ? <div className="small text-secondary mt-3">{feedbackState.data?.retention_note || "Only last 1 year feedback entries are maintained. Older entries are auto removed."}</div> : null}
      {activeTab === "enquiry" ? <div className="small text-secondary mt-3">{enquiryState.data?.retention_note || "Only last 1 year enquiry entries are maintained. Older entries are auto removed."}</div> : null}

      {activeTab === "tickets" ? (
        <>
          {ticketState.error ? <div className="alert alert-danger mt-3">{ticketState.error}</div> : null}
          {createTicketState.success ? <div className="alert alert-success mt-3 py-2">{createTicketState.success}</div> : null}

          {showCreateTicket ? (
            <div className="card mt-3 p-3">
              <h6 className="mb-3">Create Ticket</h6>
              <form className="d-flex flex-column gap-3" onSubmit={handleCreateTicket}>
                <div className="row g-3">
                  <div className="col-12 col-lg-5">
                    <div className="row g-3">
                      <div className="col-12 col-md-6">
                        <label className="form-label small text-secondary mb-1">Name</label>
                        <input
                          type="text"
                          className="form-control"
                          value={createTicketForm.name}
                          onChange={(event) => setCreateTicketForm((prev) => ({ ...prev, name: event.target.value }))}
                          placeholder="Enter your name"
                        />
                      </div>
                      <div className="col-12 col-md-6">
                        <label className="form-label small text-secondary mb-1">Type</label>
                        <select
                          className="form-select"
                          value={createTicketForm.category}
                          onChange={(event) => setCreateTicketForm((prev) => ({ ...prev, category: event.target.value }))}
                        >
                          <option value="support">Support</option>
                          <option value="sales">Sales</option>
                        </select>
                      </div>
                      <div className="col-12 col-md-6">
                        <label className="form-label small text-secondary mb-1">Subject</label>
                        <input
                          type="text"
                          className="form-control"
                          value={createTicketForm.subject}
                          onChange={(event) => setCreateTicketForm((prev) => ({ ...prev, subject: event.target.value }))}
                          placeholder="Enter ticket subject"
                        />
                      </div>
                      <div className="col-12 col-md-6">
                        <label className="form-label small text-secondary mb-1">Product</label>
                        <select
                          className="form-select"
                          value={createTicketForm.productSlug || ""}
                          onChange={(event) =>
                            setCreateTicketForm((prev) => {
                              const nextProductSlug = event.target.value;
                              const urgentAllowed = Boolean(prioritySupportByProduct[nextProductSlug]);
                              return {
                                ...prev,
                                productSlug: nextProductSlug,
                                priority: prev.priority === "urgent" && !urgentAllowed ? "high" : prev.priority,
                              };
                            })
                          }
                        >
                          {ticketProductOptions.map((item) => (
                            <option key={item.slug} value={item.slug}>
                              {item.name}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="col-12 col-md-6">
                        <label className="form-label small text-secondary mb-1">Attachment</label>
                        <input
                          type="file"
                          className="form-control"
                          accept="image/*"
                          multiple
                          onChange={(event) => {
                            const files = Array.from(event.target.files || []);
                            setCreateTicketForm((prev) => ({ ...prev, files }));
                          }}
                        />
                        <div className="small text-secondary mt-1">Up to 5 images, max 2MB each.</div>
                      </div>
                      <div className="col-12 col-md-6">
                        <label className="form-label small text-secondary mb-1">Priority</label>
                        <select
                          className="form-select"
                          value={createTicketForm.priority || "medium"}
                          onChange={(event) => setCreateTicketForm((prev) => ({ ...prev, priority: event.target.value }))}
                        >
                          <option value="low">Low</option>
                          <option value="medium">Medium</option>
                          <option value="high">High</option>
                          {urgentAllowedForSelectedProduct ? <option value="urgent">Urgent</option> : null}
                        </select>
                        {!urgentAllowedForSelectedProduct ? (
                          <div className="small text-secondary mt-1">Urgent is available only for highest plan users.</div>
                        ) : null}
                      </div>
                      <div className="col-12">
                        <div className="d-flex gap-2 flex-wrap">
                          <button type="submit" className="btn btn-primary btn-sm" disabled={createTicketState.saving}>
                            {createTicketState.saving ? "Creating..." : "Create Ticket"}
                          </button>
                          <button
                            type="button"
                            className="btn btn-outline-light btn-sm"
                            disabled={createTicketState.saving}
                            onClick={() => {
                              setShowCreateTicket(false);
                              setCreateTicketState((prev) => ({ ...prev, error: "" }));
                            }}
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="col-12 col-lg-7 d-flex flex-column">
                    <label className="form-label small text-secondary mb-1">Message</label>
                    <TinyHtmlEditor
                      label=""
                      value={createTicketForm.message}
                      onChange={(value) => setCreateTicketForm((prev) => ({ ...prev, message: value }))}
                      placeholder="Describe your issue"
                      minHeight={460}
                    />
                  </div>
                </div>
                {createTicketState.error ? <div className="alert alert-danger py-2 mb-0">{createTicketState.error}</div> : null}
              </form>
            </div>
          ) : null}

          <div className="d-flex align-items-center gap-2 flex-wrap mt-3">
            <select
              className="form-select form-select-sm"
              style={{ width: "190px" }}
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
              style={{ width: "190px" }}
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
                {ticketItems.length ? (
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
                        {titleCase(selectedTicketDetail.category)} • {formatValue(selectedTicketDetail.created_at)}
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
      ) : activeTab === "feedback" ? (
        <>
          {feedbackState.error ? <div className="alert alert-danger mt-3">{feedbackState.error}</div> : null}
          <div className="inbox-layout mt-3">
            <div className="card inbox-list">
              <div className="inbox-list-header">
                <span>All Feedback</span>
                <span className="text-secondary small">{formatValue(feedbackState.data?.pagination?.total_items || 0)} total</span>
              </div>
              <div className="inbox-list-body">
                {feedbackItems.length ? (
                  feedbackItems.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      className={`inbox-item ${item.id === selectedFeedbackId ? "active" : ""}`}
                      onClick={() => setSelectedFeedbackId(item.id)}
                    >
                      <div className="inbox-item-title">
                        <span>{item.full_name || "Anonymous"}</span>
                        <span className="inbox-item-date">{formatValue(item.created_at)}</span>
                      </div>
                      <div className="inbox-item-meta">
                        <span>{item.public_slug || "-"}</span>
                        <span className="inbox-item-type">{"★".repeat(Math.max(1, Math.min(5, Number(item.rating || 0))))}</span>
                      </div>
                      <div className="inbox-item-message">{truncate(item.message, 90)}</div>
                    </button>
                  ))
                ) : (
                  <div className="text-secondary p-3">No feedback yet.</div>
                )}
              </div>
              <div className="inbox-list-footer">
                <TablePagination
                  page={feedbackPage}
                  totalPages={feedbackTotalPages}
                  onPageChange={setFeedbackPage}
                  showPageLinks
                  showPageLabel={false}
                  maxPageLinks={5}
                />
              </div>
            </div>
            <div className="card inbox-detail">
              {selectedFeedbackItem ? (
                <>
                  <div className="d-flex align-items-start justify-content-between gap-2 mb-2">
                    <div>
                      <h5 className="mb-1">{selectedFeedbackItem.full_name || "Anonymous"}</h5>
                      <div className="text-secondary small">
                        {formatValue(selectedFeedbackItem.created_at)} • {selectedFeedbackItem.public_slug || "-"}
                      </div>
                    </div>
                    <button type="button" className="btn btn-outline-danger btn-sm" onClick={() => handleDeleteFeedback(selectedFeedbackItem)} disabled={feedbackDeleteBusy}>
                      {feedbackDeleteBusy ? "Deleting..." : "Delete"}
                    </button>
                  </div>
                  <div className="mb-2 text-warning">{`Rating: ${"★".repeat(Math.max(1, Math.min(5, Number(selectedFeedbackItem.rating || 0))))}`}</div>
                  <div className="inbox-detail-body">{selectedFeedbackItem.message || "-"}</div>
                </>
              ) : (
                <div className="text-secondary p-4">Select feedback to view details.</div>
              )}
            </div>
          </div>
        </>
      ) : activeTab === "enquiry" ? (
        <>
          {enquiryState.error ? <div className="alert alert-danger mt-3">{enquiryState.error}</div> : null}
          <div className="d-flex align-items-center gap-2 flex-wrap mt-3">
            {ENQUIRY_STATUS_TABS.map((tab) => (
              <button
                key={tab.key}
                type="button"
                className={`btn btn-sm ${enquiryStatusTab === tab.key ? "btn-primary" : "btn-outline-light"}`}
                onClick={() => {
                  setEnquiryStatusTab(tab.key);
                  setEnquiryPage(1);
                }}
              >
                {tab.label}
                <span className="ms-1 badge bg-dark">{formatValue(enquiryState.data?.counts?.[tab.key] || 0)}</span>
              </button>
            ))}
          </div>
          <div className="inbox-layout mt-3">
            <div className="card inbox-list">
              <div className="inbox-list-header">
                <span>Enquiries</span>
                <span className="text-secondary small">{formatValue(enquiryState.data?.pagination?.total_items || 0)} total</span>
              </div>
              <div className="inbox-list-body">
                {enquiryItems.length ? (
                  enquiryItems.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      className={`inbox-item ${item.id === selectedEnquiryId ? "active" : ""}`}
                      onClick={() => setSelectedEnquiryId(item.id)}
                    >
                      <div className="inbox-item-title">
                        <span>{item.full_name || "-"}</span>
                        <span className="inbox-item-date">{formatValue(item.created_at)}</span>
                      </div>
                      <div className="inbox-item-meta">
                        <span>{item.phone_number || item.email || "-"}</span>
                        <span className="inbox-item-type">{titleCase(item.status)}</span>
                      </div>
                      <div className="inbox-item-message">{truncate(item.message, 90)}</div>
                    </button>
                  ))
                ) : (
                  <div className="text-secondary p-3">No enquiry yet.</div>
                )}
              </div>
              <div className="inbox-list-footer">
                <TablePagination
                  page={enquiryPage}
                  totalPages={enquiryTotalPages}
                  onPageChange={setEnquiryPage}
                  showPageLinks
                  showPageLabel={false}
                  maxPageLinks={5}
                />
              </div>
            </div>
            <div className="card inbox-detail">
              {selectedEnquiryItem ? (
                <>
                  <div className="d-flex align-items-start justify-content-between gap-2 mb-2">
                    <div>
                      <h5 className="mb-1">{selectedEnquiryItem.full_name || "-"}</h5>
                      <div className="text-secondary small">{formatValue(selectedEnquiryItem.created_at)} • {selectedEnquiryItem.public_slug || "-"}</div>
                    </div>
                    <select
                      className="form-select form-select-sm"
                      style={{ width: "170px" }}
                      value={selectedEnquiryItem.status || "new"}
                      disabled={enquiryStatusSaving}
                      onChange={(event) => handleEnquiryStatusChange(event.target.value)}
                    >
                      <option value="new">New</option>
                      <option value="following">Following</option>
                      <option value="completed">Completed</option>
                    </select>
                  </div>
                  <div className="text-secondary small mb-2">{selectedEnquiryItem.phone_number || "-"} {selectedEnquiryItem.email ? `• ${selectedEnquiryItem.email}` : ""}</div>
                  <div className="inbox-detail-body">{selectedEnquiryItem.message || "-"}</div>
                </>
              ) : (
                <div className="text-secondary p-4">Select enquiry to view details.</div>
              )}
            </div>
          </div>
        </>
      ) : (
        <>
          {inboxState.error ? <div className="alert alert-danger mt-3">{inboxState.error}</div> : null}
          {composeState.success ? <div className="alert alert-success mt-3 py-2">{composeState.success}</div> : null}

          {showComposeInbox ? (
            <div className="card mt-3 p-3">
              <div className="d-flex align-items-center justify-content-between gap-2 mb-2">
                <h6 className="mb-0">Compose Admin Message</h6>
                <span className="badge bg-secondary">Send to all users inbox</span>
              </div>
              <form className="d-flex flex-column gap-3" onSubmit={handleComposeSubmit}>
                <div className="row g-3">
                  <div className="col-12 col-lg-6">
                    <label className="form-label small text-secondary mb-1">Subject</label>
                    <input
                      type="text"
                      className="form-control"
                      placeholder="Enter subject"
                      value={composeForm.title}
                      onChange={(event) => setComposeForm((prev) => ({ ...prev, title: event.target.value }))}
                    />
                  </div>
                  <div className="col-12 col-lg-3">
                    <label className="form-label small text-secondary mb-1">Channel</label>
                    <select
                      className="form-select"
                      value={composeForm.channel}
                      onChange={(event) => setComposeForm((prev) => ({ ...prev, channel: event.target.value }))}
                    >
                      <option value="email">Email</option>
                      <option value="system">System</option>
                      <option value="whatsapp">WhatsApp</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label className="form-label small text-secondary mb-1">Message</label>
                  <textarea
                    className="form-control"
                    rows={4}
                    placeholder="Write message for all users..."
                    value={composeForm.message}
                    onChange={(event) => setComposeForm((prev) => ({ ...prev, message: event.target.value }))}
                  />
                </div>
                {composeState.error ? <div className="alert alert-danger py-2 mb-0">{composeState.error}</div> : null}
                <div className="d-flex gap-2">
                  <button type="submit" className="btn btn-primary btn-sm" disabled={composeState.sending}>
                    {composeState.sending ? "Sending..." : "Send to All Users"}
                  </button>
                  <button
                    type="button"
                    className="btn btn-outline-light btn-sm"
                    disabled={composeState.sending}
                    onClick={() => {
                      setShowComposeInbox(false);
                      setComposeState((prev) => ({ ...prev, error: "" }));
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          ) : null}

          <div className="inbox-layout mt-3">
            <div className="card inbox-list">
              <div className="inbox-list-header">
                <span>All Notifications</span>
                <span className="text-secondary small">{formatValue(inboxState.data?.total)} total</span>
              </div>
              <div className="inbox-list-body">
                {inboxItems.length ? (
                  inboxItems.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      className={`inbox-item ${item.id === selectedInboxId ? "active" : ""} ${item.is_read ? "read" : "unread"}`}
                      onClick={() => {
                        setSelectedInboxId(item.id);
                        markSelectedInboxRead(item);
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
              {selectedInboxItem ? (
                <>
                  <div className="d-flex align-items-start justify-content-between gap-2 mb-2">
                    <div>
                      <h5 className="mb-1">{selectedInboxItem.title}</h5>
                      <div className="text-secondary small">
                        {formatValue(selectedInboxItem.created_at)} • {selectedInboxItem.channel || "email"}
                        {selectedInboxItem.product_slug ? ` • ${selectedInboxItem.product_slug}` : ""}
                      </div>
                    </div>
                    <button type="button" className="btn btn-outline-danger btn-sm" onClick={() => handleDeleteInbox(selectedInboxItem)}>
                      Delete
                    </button>
                  </div>
                  <div className="inbox-detail-body">{selectedInboxItem.message || "-"}</div>
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
