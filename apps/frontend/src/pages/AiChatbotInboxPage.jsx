import { useEffect, useRef, useState } from "react";
import { apiFetch, getCsrfToken } from "../lib/api.js";

const emptyState = {
  loading: true,
  error: "",
  conversations: [],
  selectedId: null,
  messages: [],
  loadingMessages: false,
  filterStatus: "open",
  replyText: "",
  sendingReply: false,
  sendingAttachment: false,
  orgTimezone: "UTC",
  confirmCloseOpen: false
};

const emojiList = [
  "\uD83D\uDE00",
  "\uD83D\uDE03",
  "\uD83D\uDE04",
  "\uD83D\uDE0A",
  "\uD83D\uDE09",
  "\uD83D\uDE0D",
  "\uD83D\uDE2E",
  "\uD83D\uDE22",
  "\uD83D\uDE21",
  "\uD83D\uDC4D",
  "\uD83D\uDE4F",
  "\uD83D\uDC4C"
];

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

function isToday(value) {
  if (!value) {
    return false;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return false;
  }
  const now = new Date();
  return (
    date.getFullYear() === now.getFullYear()
    && date.getMonth() === now.getMonth()
    && date.getDate() === now.getDate()
  );
}

export default function AiChatbotInboxPage() {
  const [state, setState] = useState(emptyState);
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [presetsOpen, setPresetsOpen] = useState(false);
  const [chatSettings, setChatSettings] = useState({
    loading: true,
    premadeReplies: [],
    allowVisitorAttachments: false
  });
  const [soundEnabled, setSoundEnabled] = useState(() => {
    const stored = window.localStorage.getItem("wz_ai_chatbot_admin_sound");
    return stored !== "0";
  });
  const lastMessageIdRef = useRef(null);
  const hasLoadedMessagesRef = useRef(false);
  const knownConversationIdsRef = useRef(new Set());
  const hasLoadedConversationsRef = useRef(false);
  const pollingRef = useRef({ conversations: null, messages: null });
  const fileInputRef = useRef(null);

  useEffect(() => {
    let active = true;
    async function loadConversations() {
      try {
        const params = new URLSearchParams();
        params.set("status", state.filterStatus);
        if (categoryFilter !== "all") {
          params.set("category", categoryFilter);
        }
        const data = await apiFetch(`/api/ai-chatbot/inbox/conversations?${params.toString()}`);
        if (!active) {
          return;
        }
        setState((prev) => ({
          ...prev,
          loading: false,
          error: "",
          conversations: data.conversations || [],
          selectedId: data.conversations?.[0]?.id || null
        }));
      } catch (error) {
        if (active) {
          setState((prev) => ({
            ...prev,
            loading: false,
            error: error?.message || "Unable to load conversations."
          }));
        }
      }
    }

    loadConversations();
    return () => {
      active = false;
    };
  }, [state.filterStatus, categoryFilter]);

  useEffect(() => {
    let active = true;
    async function loadChatSettings() {
      try {
        const data = await apiFetch("/api/ai-chatbot/org/chat-settings");
        if (!active) {
          return;
        }
        setChatSettings({
          loading: false,
          premadeReplies: data.premade_replies || [],
          allowVisitorAttachments: Boolean(data.allow_visitor_attachments)
        });
      } catch (error) {
        if (active) {
          setChatSettings((prev) => ({ ...prev, loading: false }));
          setState((prev) => ({
            ...prev,
            error: error?.message || "Unable to load chat settings."
          }));
        }
      }
    }

    loadChatSettings();
    return () => {
      active = false;
    };
  }, []);

  async function loadMessages(selectedId, { silent = false, retryOnAssign = true } = {}) {
    if (!selectedId) {
      setState((prev) => ({ ...prev, messages: [] }));
      return;
    }
    if (!silent) {
      setState((prev) => ({ ...prev, loadingMessages: true }));
    }
    try {
      const data = await apiFetch(`/api/ai-chatbot/inbox/conversations/${selectedId}/messages`);
      setState((prev) => ({
        ...prev,
        loadingMessages: false,
        messages: data.messages || [],
        orgTimezone: data.org_timezone || prev.orgTimezone || "UTC"
      }));
    } catch (error) {
      if (error?.status === 409 && error?.data?.detail === "conversation_unassigned" && retryOnAssign) {
        try {
          await apiFetch(`/api/ai-chatbot/inbox/conversations/${selectedId}/take`, {
            method: "POST"
          });
          return loadMessages(selectedId, { silent, retryOnAssign: false });
        } catch (takeError) {
          setState((prev) => ({
            ...prev,
            loadingMessages: false,
            error: takeError?.message || "Unable to take conversation."
          }));
        }
        return;
      }
      setState((prev) => ({
        ...prev,
        loadingMessages: false,
        error: error?.message || "Unable to load messages."
      }));
    }
  }

  useEffect(() => {
    loadMessages(state.selectedId);
  }, [state.selectedId]);

  useEffect(() => {
    if (pollingRef.current.conversations) {
      window.clearInterval(pollingRef.current.conversations);
    }
    pollingRef.current.conversations = window.setInterval(() => {
      refreshConversations();
    }, 5000);
    return () => {
      if (pollingRef.current.conversations) {
        window.clearInterval(pollingRef.current.conversations);
        pollingRef.current.conversations = null;
      }
    };
  }, [state.filterStatus, categoryFilter]);

  useEffect(() => {
    if (pollingRef.current.messages) {
      window.clearInterval(pollingRef.current.messages);
    }
    if (!state.selectedId) {
      return () => {};
    }
    pollingRef.current.messages = window.setInterval(() => {
      loadMessages(state.selectedId, { silent: true });
    }, 4000);
    return () => {
      if (pollingRef.current.messages) {
        window.clearInterval(pollingRef.current.messages);
        pollingRef.current.messages = null;
      }
    };
  }, [state.selectedId]);

  function playRing() {
    if (!soundEnabled) {
      return;
    }
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) {
      return;
    }
    try {
      const ctx = new AudioContext();
      const gain = ctx.createGain();
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = 880;
      gain.gain.value = 0.25;
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6);
      osc.stop(ctx.currentTime + 0.6);
      window.setTimeout(() => {
        const osc2 = ctx.createOscillator();
        const gain2 = ctx.createGain();
        osc2.type = "sine";
        osc2.frequency.value = 660;
        gain2.gain.value = 0.25;
        osc2.connect(gain2);
        gain2.connect(ctx.destination);
        osc2.start();
        gain2.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 1.0);
        osc2.stop(ctx.currentTime + 1.0);
      }, 150);
    } catch (error) {
      // Ignore audio errors (autoplay restrictions, etc.)
    }
  }

  function playBeep() {
    if (!soundEnabled) {
      return;
    }
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) {
      return;
    }
    try {
      const ctx = new AudioContext();
      const gain = ctx.createGain();
      const osc = ctx.createOscillator();
      osc.type = "triangle";
      osc.frequency.value = 740;
      gain.gain.value = 0.2;
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
      osc.stop(ctx.currentTime + 0.35);
    } catch (error) {
      // Ignore audio errors (autoplay restrictions, etc.)
    }
  }

  useEffect(() => {
    const conversations = state.conversations || [];
    if (!conversations.length) {
      return;
    }
    if (!hasLoadedConversationsRef.current) {
      conversations.forEach((item) => {
        if (item?.id) {
          knownConversationIdsRef.current.add(item.id);
        }
      });
      hasLoadedConversationsRef.current = true;
      return;
    }
    const newOnes = conversations.filter((item) => item?.id && !knownConversationIdsRef.current.has(item.id));
    if (newOnes.length) {
      newOnes.forEach((item) => {
        if (item?.id) {
          knownConversationIdsRef.current.add(item.id);
        }
      });
      playRing();
    }
  }, [state.conversations]);

  useEffect(() => {
    if (!state.messages.length) {
      return;
    }
    const lastMessage = state.messages[state.messages.length - 1];
    if (!hasLoadedMessagesRef.current) {
      lastMessageIdRef.current = lastMessage.id;
      hasLoadedMessagesRef.current = true;
      return;
    }
    if (lastMessage.id && lastMessage.id !== lastMessageIdRef.current) {
      lastMessageIdRef.current = lastMessage.id;
      playBeep();
    }
  }, [state.messages]);

  async function refreshConversations() {
    setState((prev) => ({ ...prev, loading: true, error: "" }));
    try {
      const params = new URLSearchParams();
      params.set("status", state.filterStatus);
      if (categoryFilter !== "all") {
        params.set("category", categoryFilter);
      }
      const data = await apiFetch(`/api/ai-chatbot/inbox/conversations?${params.toString()}`);
      setState((prev) => {
        const conversations = data.conversations || [];
        const keepSelected = conversations.some((item) => item.id === prev.selectedId);
        return {
          ...prev,
          loading: false,
          conversations,
          selectedId: keepSelected ? prev.selectedId : conversations[0]?.id || null
        };
      });
    } catch (error) {
      setState((prev) => ({
        ...prev,
        loading: false,
        error: error?.message || "Unable to load conversations."
      }));
    }
  }

  const selectedConversation = state.conversations.find((item) => item.id === state.selectedId);
  function toggleSound() {
    setSoundEnabled((prev) => {
      const next = !prev;
      window.localStorage.setItem("wz_ai_chatbot_admin_sound", next ? "1" : "0");
      return next;
    });
  }

  async function handleSendReply() {
    if (!state.selectedId || !state.replyText.trim() || state.sendingReply) {
      return;
    }
    setState((prev) => ({ ...prev, sendingReply: true }));
    try {
      const data = await apiFetch(`/api/ai-chatbot/inbox/conversations/${state.selectedId}/reply`, {
        method: "POST",
        body: JSON.stringify({ text: state.replyText.trim() })
      });
      const newMessage = data.message;
      setState((prev) => ({
        ...prev,
        sendingReply: false,
        replyText: "",
        messages: newMessage ? [...prev.messages, newMessage] : prev.messages
      }));
      await refreshConversations();
    } catch (error) {
      setState((prev) => ({
        ...prev,
        sendingReply: false,
        error: error?.message || "Unable to send reply."
      }));
    }
  }

  function handleReplyKeyDown(event) {
    if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      handleSendReply();
    }
  }

  async function handleAttachmentChange(event) {
    const file = event.target.files?.[0];
    if (!file || !state.selectedId) {
      return;
    }
    setState((prev) => ({ ...prev, sendingAttachment: true }));
    try {
      if (!getCsrfToken()) {
        await fetch("/api/auth/csrf", { credentials: "include" });
      }
      const formData = new FormData();
      formData.append("file", file);
      const response = await fetch(`/api/ai-chatbot/inbox/conversations/${state.selectedId}/attachment`, {
        method: "POST",
        credentials: "include",
        headers: {
          "X-CSRFToken": getCsrfToken()
        },
        body: formData
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.detail || "Unable to upload attachment.");
      }
      const newMessage = data.message;
      setState((prev) => ({
        ...prev,
        sendingAttachment: false,
        messages: newMessage ? [...prev.messages, newMessage] : prev.messages
      }));
      await refreshConversations();
    } catch (error) {
      setState((prev) => ({
        ...prev,
        sendingAttachment: false,
        error: error?.message || "Unable to upload attachment."
      }));
    } finally {
      if (event.target) {
        event.target.value = "";
      }
    }
  }

  function handleEmojiSelect(emoji) {
    setState((prev) => ({ ...prev, replyText: `${prev.replyText}${emoji}` }));
    setEmojiOpen(false);
  }

  function toggleEmojiPanel() {
    setEmojiOpen((prev) => !prev);
  }

  function togglePresetsPanel() {
    setPresetsOpen((prev) => !prev);
  }

  function handlePresetInsert(text) {
    if (!text) {
      return;
    }
    setState((prev) => ({
      ...prev,
      replyText: prev.replyText ? `${prev.replyText} ${text}` : text
    }));
    setPresetsOpen(false);
  }

  async function handleToggleVisitorAttachments() {
    if (chatSettings.loading) {
      return;
    }
    const nextValue = !chatSettings.allowVisitorAttachments;
    setChatSettings((prev) => ({ ...prev, allowVisitorAttachments: nextValue }));
    try {
      const data = await apiFetch("/api/ai-chatbot/org/chat-settings", {
        method: "PATCH",
        body: JSON.stringify({ allow_visitor_attachments: nextValue })
      });
      setChatSettings((prev) => ({
        ...prev,
        premadeReplies: data.premade_replies || prev.premadeReplies,
        allowVisitorAttachments: Boolean(data.allow_visitor_attachments)
      }));
    } catch (error) {
      setChatSettings((prev) => ({ ...prev, allowVisitorAttachments: !nextValue }));
      setState((prev) => ({
        ...prev,
        error: error?.message || "Unable to update chat settings."
      }));
    }
  }

  async function handleStatusChange(nextStatus) {
    if (!state.selectedId) {
      return;
    }
    if (nextStatus === "close") {
      setState((prev) => ({ ...prev, confirmCloseOpen: true }));
      return;
    }
    try {
      await apiFetch(`/api/ai-chatbot/inbox/conversations/${state.selectedId}/${nextStatus}`, {
        method: "POST"
      });
      await refreshConversations();
    } catch (error) {
      setState((prev) => ({
        ...prev,
        error: error?.message || "Unable to update status."
      }));
    }
  }

  async function confirmCloseChat() {
    const conversationId = state.selectedId;
    if (!conversationId) {
      setState((prev) => ({ ...prev, confirmCloseOpen: false }));
      return;
    }
    setState((prev) => ({ ...prev, confirmCloseOpen: false }));
    try {
      await apiFetch(`/api/ai-chatbot/inbox/conversations/${conversationId}/close`, {
        method: "POST"
      });
      await refreshConversations();
    } catch (error) {
      setState((prev) => ({
        ...prev,
        error: error?.message || "Unable to update status."
      }));
    }
  }

  const todayConversations = state.conversations.filter((item) => (
    isToday(item.last_message_at || item.created_at)
  ));
  const olderConversations = state.conversations.filter((item) => (
    !isToday(item.last_message_at || item.created_at)
  ));

  function renderConversationRows(items) {
    if (state.loading) {
      return (
        <tr>
          <td colSpan={6}>Loading...</td>
        </tr>
      );
    }
    if (!items.length) {
      return (
        <tr>
          <td colSpan={6}>No conversations yet.</td>
        </tr>
      );
    }
    return items.map((item) => {
      const sourceLabel = item.source === "public_page" ? "Public Page" : "Widget";
      const sourceClass = item.source === "public_page" ? "bg-info" : "bg-secondary";
      const categoryLabel = item.category ? item.category.charAt(0).toUpperCase() + item.category.slice(1) : "-";
      const categoryClass = item.category === "sales" ? "bg-success" : item.category === "support" ? "bg-primary" : "bg-secondary";
      const visitorLabel = item.visitor_name || item.visitor_id;
      return (
        <tr
          key={item.id}
          className={item.id === state.selectedId ? "table-active" : ""}
          onClick={() => setState((prev) => ({ ...prev, selectedId: item.id }))}
          style={{ cursor: "pointer" }}
        >
          <td>
            <div className="ai-chatbot-visitor">
              <div>{visitorLabel}</div>
            </div>
          </td>
          <td>{item.widget_name}</td>
          <td>
            <span className={`badge ${categoryClass}`}>{categoryLabel}</span>
          </td>
          <td>
            <span className={`badge ${sourceClass}`}>{sourceLabel}</span>
          </td>
          <td>
            <span className={`ai-chatbot-presence ai-chatbot-presence--${item.visitor_status || "offline"}`}>
              <span className="ai-chatbot-presence__dot" />
              <span>{item.visitor_status || "offline"}</span>
            </span>
          </td>
          <td>
            <span className={`ai-chatbot-status ai-chatbot-status--${item.status}`}>
              {item.status}
            </span>
          </td>
        </tr>
      );
    });
  }

  return (
    <div className="container-fluid">
      <div className="d-flex align-items-center justify-content-between mb-3">
        <div>
          <h2 className="mb-1">AI Chatbot Inbox</h2>
          <div className="text-secondary">View visitor conversations and messages.</div>
        </div>
        <div className="d-flex align-items-center gap-2">
          <button
            type="button"
            className="btn btn-outline-light btn-sm"
            onClick={toggleSound}
            title={soundEnabled ? "Sound on" : "Sound off"}
          >
            {soundEnabled ? (
              <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
                <path
                  fill="currentColor"
                  d="M3 9v6h4l5 4V5L7 9H3zm13.5 3a4.5 4.5 0 0 0-2.25-3.9v7.8A4.5 4.5 0 0 0 16.5 12zm0-9a1 1 0 0 0-1 1 1 1 0 0 0 .5.87 8.5 8.5 0 0 1 0 14.26 1 1 0 0 0-.5.87 1 1 0 0 0 1 1 1 1 0 0 0 .5-.14 10.5 10.5 0 0 0 0-17.46 1 1 0 0 0-.5-.14z"
                />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
                <path
                  fill="currentColor"
                  d="M3 9v6h4l5 4V5L7 9H3zm13.5 3a4.5 4.5 0 0 0-2.25-3.9v7.8A4.5 4.5 0 0 0 16.5 12z"
                />
                <path
                  fill="currentColor"
                  d="M18.3 5.7a1 1 0 0 0-1.4 0l-10 10a1 1 0 0 0 1.4 1.4l10-10a1 1 0 0 0 0-1.4z"
                />
              </svg>
            )}
          </button>
          <button type="button" className="btn btn-outline-light btn-sm" onClick={refreshConversations}>
            Refresh
          </button>
        </div>
      </div>

      {state.error ? (
        <div className="alert alert-danger">{state.error}</div>
      ) : null}

      <div className="row g-3">
        <div className="col-lg-4">
          <div className="user-panel h-100">
            <div className="user-panel-header d-flex align-items-center justify-content-between">
              <div className="user-panel-title">Conversations</div>
              <span className="text-secondary small">{state.conversations.length} total</span>
            </div>
            <div className="ai-chatbot-filters">
              {["open", "closed", "all"].map((status) => (
                <button
                  key={status}
                  type="button"
                  className={`btn btn-sm ${state.filterStatus === status ? "btn-primary" : "btn-outline-light"}`}
                  onClick={() => setState((prev) => ({ ...prev, filterStatus: status }))}
                >
                  {status === "all" ? "All" : status.charAt(0).toUpperCase() + status.slice(1)}
                </button>
              ))}
              <select
                className="form-select form-select-sm ai-chatbot-category"
                value={categoryFilter}
                onChange={(event) => setCategoryFilter(event.target.value)}
              >
                <option value="all">All</option>
                <option value="sales">Sales</option>
                <option value="support">Support</option>
              </select>
            </div>
            <div className="table-responsive">
              <table className="table table-dark table-hover mb-0">
                <thead>
                  <tr>
                    <th>Visitor</th>
                    <th>Widget</th>
                    <th>Category</th>
                    <th>Source</th>
                    <th>Presence</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {renderConversationRows(todayConversations)}
                </tbody>
              </table>
              <div className="section-divider my-2" />
              <div className="small text-secondary mb-2">Older Conversations</div>
              <table className="table table-dark table-hover mb-0">
                <thead>
                  <tr>
                    <th>Visitor</th>
                    <th>Widget</th>
                    <th>Category</th>
                    <th>Source</th>
                    <th>Presence</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {renderConversationRows(olderConversations)}
                </tbody>
              </table>
            </div>
          </div>
        </div>
        <div className="col-lg-8">
          <div className="user-panel h-100">
            <div className="user-panel-header d-flex align-items-center justify-content-between">
              <div className="user-panel-title">
                {selectedConversation
                  ? (selectedConversation.visitor_name || selectedConversation.visitor_id || "Visitor")
                  : "Messages"}
              </div>
              <div className="d-flex align-items-center gap-2">
                <span className="text-secondary small">
                  {selectedConversation ? selectedConversation.widget_name : ""}
                </span>
                {selectedConversation ? (
                  <>
                    <span className={`ai-chatbot-presence ai-chatbot-presence--${selectedConversation.visitor_status || "offline"}`}>
                      <span className="ai-chatbot-presence__dot" />
                      <span>{selectedConversation.visitor_status || "offline"}</span>
                    </span>
                    <span className={`badge ${selectedConversation.category === "sales" ? "bg-success" : "bg-primary"}`}>
                      {(selectedConversation.category || "support").charAt(0).toUpperCase() + (selectedConversation.category || "support").slice(1)}
                    </span>
                    <span className={`badge ${selectedConversation.source === "public_page" ? "bg-info" : "bg-secondary"}`}>
                      {selectedConversation.source === "public_page" ? "Public Page" : "Widget"}
                    </span>
                  </>
                ) : null}
                {selectedConversation ? (
                  selectedConversation.status === "open" ? (
                    <button
                      type="button"
                      className="btn btn-outline-light btn-sm"
                      onClick={() => handleStatusChange("close")}
                    >
                      Close
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="btn btn-outline-light btn-sm"
                      onClick={() => handleStatusChange("reopen")}
                    >
                      Reopen
                    </button>
                  )
                ) : null}
              </div>
            </div>
            <div className="ai-chatbot-thread">
              {state.loadingMessages ? (
                <div className="text-secondary">Loading messages...</div>
              ) : state.messages.length ? (
                state.messages.map((message) => {
                  const hasAttachment = Boolean(message.attachment_url);
                  const showText = message.text && (!hasAttachment || message.text !== message.attachment_name);
                  const localTime = formatDateTime(message.created_at);
                  const adminTime = formatDateTime(message.created_at, state.orgTimezone);
                  const metaTime = [localTime, adminTime && adminTime !== localTime ? adminTime : ""].filter(Boolean).join(" / ");
                  return (
                    <div
                      key={message.id}
                      className={`ai-chatbot-message ai-chatbot-message--${message.sender_type}`}
                    >
                      {showText ? <div className="ai-chatbot-message__text">{message.text}</div> : null}
                      {hasAttachment ? (
                        message.attachment_type?.startsWith("image/") ? (
                          <a
                            className="ai-chatbot-attachment"
                            href={message.attachment_url}
                            target="_blank"
                            rel="noreferrer"
                          >
                            <img
                              className="ai-chatbot-attachment__image"
                              src={message.attachment_url}
                              alt={message.attachment_name || "Attachment"}
                            />
                          </a>
                        ) : (
                          <a
                            className="ai-chatbot-attachment"
                            href={message.attachment_url}
                            target="_blank"
                            rel="noreferrer"
                          >
                            {message.attachment_name || "Download attachment"}
                          </a>
                        )
                      ) : null}
                      <div className="ai-chatbot-message__meta">
                        {message.sender_type} - {metaTime || "-"}
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="text-secondary">Select a conversation to view messages.</div>
              )}
            </div>
            <div className="ai-chatbot-composer">
              <div className="ai-chatbot-composer__actions">
                <button
                  type="button"
                  className="ai-chatbot-action-btn"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={!selectedConversation || state.sendingAttachment}
                  title="Attach file"
                >
                  <i className="bi bi-paperclip" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  className={`ai-chatbot-action-btn ${emojiOpen ? "is-active" : ""}`}
                  onClick={toggleEmojiPanel}
                  title="Insert emoji"
                >
                  <i className="bi bi-emoji-smile" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  className={`ai-chatbot-action-btn ${presetsOpen ? "is-active" : ""}`}
                  onClick={togglePresetsPanel}
                  title="Premade replies"
                >
                  <i className="bi bi-chat-left-text" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  className={`ai-chatbot-action-btn ${chatSettings.allowVisitorAttachments ? "is-active" : ""}`}
                  onClick={handleToggleVisitorAttachments}
                  disabled={chatSettings.loading}
                  title="Toggle visitor attachments"
                >
                  <i className="bi bi-cloud-arrow-up" aria-hidden="true" />
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  className="ai-chatbot-composer__file"
                  accept=".png,.jpg,.jpeg,.gif,.webp,.pdf,.doc,.docx,.xls,.xlsx,.txt,.csv"
                  onChange={handleAttachmentChange}
                  disabled={!selectedConversation || state.sendingAttachment}
                />
                {emojiOpen ? (
                  <div className="ai-chatbot-emoji-panel">
                    {emojiList.map((emoji) => (
                      <button
                        key={emoji}
                        type="button"
                        className="ai-chatbot-emoji-panel__item"
                        onClick={() => handleEmojiSelect(emoji)}
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>
                ) : null}
                {presetsOpen ? (
                  <div className="ai-chatbot-emoji-panel ai-chatbot-emoji-panel--wide">
                    {chatSettings.premadeReplies.length ? (
                      chatSettings.premadeReplies.map((text) => (
                        <button
                          key={text}
                          type="button"
                          className="ai-chatbot-emoji-panel__item ai-chatbot-emoji-panel__item--text"
                          onClick={() => handlePresetInsert(text)}
                        >
                          {text}
                        </button>
                      ))
                    ) : (
                      <span className="ai-chatbot-emoji-panel__empty">No premade replies.</span>
                    )}
                  </div>
                ) : null}
              </div>
              <textarea
                className="form-control ai-chatbot-composer__input"
                rows={2}
                placeholder="Type a reply..."
                value={state.replyText}
                onChange={(event) => setState((prev) => ({ ...prev, replyText: event.target.value }))}
                onKeyDown={handleReplyKeyDown}
                disabled={!selectedConversation}
              />
              <button
                type="button"
                className="btn btn-primary"
                disabled={!selectedConversation || !state.replyText.trim() || state.sendingReply}
                onClick={handleSendReply}
              >
                {state.sendingReply ? "Sending..." : "Send"}
              </button>
            </div>
          </div>
        </div>
      </div>
      {state.confirmCloseOpen ? (
        <div className="wz-modal__backdrop">
          <div className="wz-modal">
            <div className="wz-modal__title">Close chat?</div>
            <div className="wz-modal__body">
              Closing this chat will end the live conversation for the visitor. Do you want to close it now?
            </div>
            <div className="wz-modal__actions">
              <button
                type="button"
                className="btn btn-outline-light btn-sm"
                onClick={() => setState((prev) => ({ ...prev, confirmCloseOpen: false }))}
              >
                Cancel
              </button>
              <button type="button" className="btn btn-primary btn-sm" onClick={confirmCloseChat}>
                Close Chat
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
