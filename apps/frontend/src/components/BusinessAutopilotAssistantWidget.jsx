import { useEffect, useMemo, useRef, useState } from "react";
import { apiFetch } from "../lib/api.js";
import AiAvatar from "./chat/AiAvatar.jsx";
import { getAiEmotionEmoji, getAiEmotionFromText } from "./chat/aiAvatarConfig.js";

const CRM_STORAGE_KEY = "wz_business_autopilot_crm_module";
const TICKETING_STORAGE_KEY = "wz_business_autopilot_ticketing_module";
const ACCOUNTS_STORAGE_KEY = "wz_business_autopilot_accounts_module";
const HR_STORAGE_KEY = "wz_business_autopilot_hr_module";
const BA_ASSISTANT_HISTORY_KEY = "wz_business_autopilot_assistant_history";

function readStorage(key) {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function getTodayIso() {
  return new Date().toISOString().slice(0, 10);
}

function pruneAssistantHistoryStore(store) {
  const rows = store && typeof store === "object" ? store : {};
  const cutoff = new Date();
  cutoff.setHours(0, 0, 0, 0);
  cutoff.setDate(cutoff.getDate() - 29);
  return Object.fromEntries(
    Object.entries(rows).filter(([dateKey]) => {
      const parsed = new Date(`${dateKey}T00:00:00`);
      return !Number.isNaN(parsed.getTime()) && parsed >= cutoff;
    })
  );
}

function readAssistantHistory() {
  if (typeof window === "undefined") {
    return {};
  }
  try {
    const raw = window.localStorage.getItem(BA_ASSISTANT_HISTORY_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    const pruned = pruneAssistantHistoryStore(parsed);
    window.localStorage.setItem(BA_ASSISTANT_HISTORY_KEY, JSON.stringify(pruned));
    return pruned;
  } catch {
    return {};
  }
}

function saveAssistantHistory(store) {
  if (typeof window === "undefined") {
    return;
  }
  const pruned = pruneAssistantHistoryStore(store);
  window.localStorage.setItem(BA_ASSISTANT_HISTORY_KEY, JSON.stringify(pruned));
}

function buildAssistantContext({ quickStats = {}, crmMeetings = [], accountsWorkspace = {}, subscriptions = [] }) {
  const todayIso = getTodayIso();
  const hrData = readStorage(HR_STORAGE_KEY);
  const crmData = readStorage(CRM_STORAGE_KEY);
  const ticketingData = readStorage(TICKETING_STORAGE_KEY);
  const accountsData = Object.keys(accountsWorkspace || {}).length ? accountsWorkspace : readStorage(ACCOUNTS_STORAGE_KEY);

  const attendanceRows = Array.isArray(hrData.attendance) ? hrData.attendance : [];
  const leaveRows = Array.isArray(hrData.leaves) ? hrData.leaves : [];
  const salaryHistoryRows = Array.isArray(hrData.salaryHistory) ? hrData.salaryHistory : [];
  const followUps = Array.isArray(crmData.followUps) ? crmData.followUps : [];
  const meetings = Array.isArray(crmMeetings) && crmMeetings.length ? crmMeetings : (Array.isArray(crmData.meetings) ? crmData.meetings : []);
  const activities = Array.isArray(crmData.activities) ? crmData.activities : [];
  const openTickets = Array.isArray(ticketingData.tickets) ? ticketingData.tickets : [];
  const invoices = Array.isArray(accountsData.invoices) ? accountsData.invoices : [];

  const todaysLeaveEmployees = attendanceRows
    .filter((row) => String(row?.date || "").trim() === todayIso && String(row?.status || "").trim().toLowerCase() === "leave")
    .map((row) => String(row?.employee || "").trim())
    .filter(Boolean);

  const pendingLeaves = leaveRows
    .filter((row) => String(row?.status || "").trim().toLowerCase() === "pending")
    .map((row) => ({
      employee: row?.employee || "",
      leaveType: row?.leaveType || "",
      status: row?.status || "",
    }));

  const oneYearAgo = new Date();
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
  const incrementsLastYear = salaryHistoryRows
    .filter((row) => {
      const effectiveFrom = String(row?.effectiveFrom || "").trim();
      if (!effectiveFrom) return false;
      const parsed = new Date(effectiveFrom);
      return !Number.isNaN(parsed.getTime()) && parsed >= oneYearAgo;
    })
    .map((row) => ({
      employeeName: row?.employeeName || "",
      effectiveFrom: row?.effectiveFrom || "",
      incrementType: row?.incrementType || "",
      incrementValue: row?.incrementValue || "",
      incrementAmount: row?.incrementAmount || "",
      newSalary: row?.newSalary || "",
    }));

  const todayFollowUps = followUps
    .filter((row) => String(row?.dueDate || "").trim() === todayIso)
    .map((row) => ({
      subject: row?.subject || "",
      relatedTo: row?.relatedTo || "",
      owner: row?.owner || "",
      status: row?.status || "",
    }));

  const upcomingMeetings = meetings
    .filter((row) => String(row?.meetingDate || "").trim() >= todayIso)
    .slice()
    .sort((a, b) => `${a?.meetingDate || ""} ${a?.meetingTime || ""}`.localeCompare(`${b?.meetingDate || ""} ${b?.meetingTime || ""}`))
    .slice(0, 8)
    .map((row) => ({
      title: row?.title || "",
      relatedTo: row?.relatedTo || "",
      meetingDate: row?.meetingDate || "",
      meetingTime: row?.meetingTime || "",
      owner: row?.owner || "",
      status: row?.status || "",
      meetingMode: row?.meetingMode || "",
    }));

  const recentDiscussions = activities
    .slice()
    .sort((a, b) => String(b?.date || "").localeCompare(String(a?.date || "")))
    .slice(0, 6)
    .map((row) => ({
      activityType: row?.activityType || "",
      relatedTo: row?.relatedTo || "",
      date: row?.date || "",
      owner: row?.owner || "",
      notes: row?.notes || "",
    }));

  const billPendingInvoices = invoices
    .filter((row) => !["paid", "cancelled"].includes(String(row?.status || "").trim().toLowerCase()))
    .slice(0, 10)
    .map((row) => ({
      invoiceNumber: row?.invoiceNumber || row?.id || "",
      customerName: row?.customerName || row?.company || "",
      status: row?.status || "",
      total: row?.total || 0,
      issueDate: row?.issueDate || row?.date || "",
    }));

  return {
    today: todayIso,
    quickStats,
    subscriptionsCount: Array.isArray(subscriptions) ? subscriptions.length : 0,
    hr: {
      todaysLeaveEmployees,
      pendingLeaves,
      incrementsLastYear,
    },
    crm: {
      todayFollowUps,
      upcomingMeetings,
      recentDiscussions,
    },
    ticketing: {
      openTickets: openTickets
        .filter((row) => String(row?.status || "").trim().toLowerCase() !== "closed")
        .slice(0, 10)
        .map((row) => ({
          ticketId: row?.id || "",
          title: row?.subject || row?.title || "",
          status: row?.status || "",
          priority: row?.priority || "",
        })),
    },
    accounts: {
      billPendingInvoices,
    },
  };
}

function buildUserInitial(user = {}) {
  const fullName = `${String(user?.first_name || "").trim()} ${String(user?.last_name || "").trim()}`.trim();
  if (fullName) {
    return fullName.slice(0, 1).toUpperCase();
  }
  const username = String(user?.username || "").trim();
  if (username) {
    return username.slice(0, 1).toUpperCase();
  }
  const email = String(user?.email || "").trim();
  if (email) {
    return email.slice(0, 1).toUpperCase();
  }
  return "U";
}

function UserChatAvatar({ photoUrl = "", label = "U" }) {
  return (
    <div className="ba-assistant__user-avatar">
      {photoUrl ? (
        <img src={photoUrl} alt="Profile" className="ba-assistant__user-avatar-img" />
      ) : (
        <span className="ba-assistant__user-avatar-fallback">{label}</span>
      )}
    </div>
  );
}

export default function BusinessAutopilotAssistantWidget({
  enabled = false,
  isAdmin = false,
  quickStats = {},
  crmMeetings = [],
  accountsWorkspace = {},
  subscriptions = [],
}) {
  const [settings, setSettings] = useState({
    loading: true,
    enabled: false,
    hasApiKey: false,
    agent_name: "Work Zilla AI Assistant",
  });
  const [currentUser, setCurrentUser] = useState({
    photoUrl: "",
    label: "U",
  });
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [prompt, setPrompt] = useState("");
  const [sending, setSending] = useState(false);
  const [historyDate, setHistoryDate] = useState(getTodayIso());
  const [showHistoryPicker, setShowHistoryPicker] = useState(false);
  const listRef = useRef(null);
  const todayIso = getTodayIso();
  const isViewingToday = historyDate === todayIso;

  const context = useMemo(
    () => buildAssistantContext({ quickStats, crmMeetings, accountsWorkspace, subscriptions }),
    [quickStats, crmMeetings, accountsWorkspace, subscriptions]
  );

  useEffect(() => {
    if (!enabled || !isAdmin) {
      setSettings({ loading: false, enabled: false, hasApiKey: false, agent_name: "Work Zilla AI Assistant" });
      return;
    }
    let active = true;
    async function loadSettings() {
      try {
        const [data, profile] = await Promise.all([
          apiFetch("/api/business-autopilot/openai/settings"),
          apiFetch("/api/dashboard/profile"),
        ]);
        if (!active) return;
        setSettings({
          loading: false,
          enabled: Boolean(data?.enabled || data?.has_api_key),
          hasApiKey: Boolean(data?.has_api_key),
          agent_name: data?.agent_name || "Work Zilla AI Assistant",
        });
        setCurrentUser({
          photoUrl: profile?.user?.profile_photo_url || "",
          label: buildUserInitial(profile?.user || {}),
        });
      } catch {
        if (active) {
          setSettings({ loading: false, enabled: false, hasApiKey: false, agent_name: "Work Zilla AI Assistant" });
          setCurrentUser({ photoUrl: "", label: "U" });
        }
      }
    }
    loadSettings();
    return () => {
      active = false;
    };
  }, [enabled, isAdmin]);

  useEffect(() => {
    if (!settings.enabled) {
      setOpen(false);
      return;
    }
    const history = readAssistantHistory();
    const savedMessages = Array.isArray(history[historyDate]) ? history[historyDate] : [];
    if (savedMessages.length) {
      setMessages(savedMessages);
      return;
    }
    const welcomeMessage = {
      id: `assistant-welcome-${historyDate}`,
      role: "assistant",
      text: settings.hasApiKey
        ? `Hi, I am ${settings.agent_name}. Ask me about increments in the last year, today's leaves, CRM follow-ups, or meeting schedules.`
        : `Hi, I am ${settings.agent_name}. OpenAI API key is not configured yet. Click the setup link below to complete your OpenAI connection.`,
    };
    const initialMessages = [welcomeMessage];
    setMessages(initialMessages);
    saveAssistantHistory({
      ...history,
      [historyDate]: initialMessages,
    });
  }, [historyDate, settings.agent_name, settings.enabled, settings.hasApiKey]);

  useEffect(() => {
    if (!settings.enabled || !messages.length) {
      return;
    }
    const history = readAssistantHistory();
    saveAssistantHistory({
      ...history,
      [historyDate]: messages,
    });
  }, [historyDate, messages, settings.enabled]);

  useEffect(() => {
    if (!open || !listRef.current) return;
    listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [messages, open]);

  async function handleSubmit(event, seedQuestion = "") {
    event?.preventDefault?.();
    if (!settings.hasApiKey || !isViewingToday) {
      return;
    }
    const question = String(seedQuestion || prompt || "").trim();
    if (!question || sending) return;
    setPrompt("");
    const userMessage = { id: `user-${Date.now()}`, role: "user", text: question };
    setMessages((prev) => [...prev, userMessage]);
    setSending(true);
    try {
      const data = await apiFetch("/api/business-autopilot/openai/chat", {
        method: "POST",
        body: JSON.stringify({
          message: question,
          context,
        }),
      });
      setMessages((prev) => [
        ...prev,
        {
          id: `assistant-${Date.now()}`,
          role: "assistant",
          text: data?.reply || "No response received.",
        },
      ]);
    } catch (error) {
      setMessages((prev) => [
        ...prev,
        {
          id: `assistant-error-${Date.now()}`,
          role: "assistant",
          text: error?.message || "Unable to get assistant response right now.",
        },
      ]);
    } finally {
      setSending(false);
    }
  }

  function openOpenAiSettings() {
    if (typeof window === "undefined") return;
    window.location.href = "/app/business-autopilot/profile?tab=openAiApi";
  }

  function clearChatHistory() {
    const history = readAssistantHistory();
    delete history[historyDate];
    saveAssistantHistory(history);
    const resetMessages = [
      {
        id: `assistant-welcome-${historyDate}`,
        role: "assistant",
        text: settings.hasApiKey
          ? `Hi, I am ${settings.agent_name}. Ask me about increments in the last year, today's leaves, CRM follow-ups, or meeting schedules.`
          : `Hi, I am ${settings.agent_name}. OpenAI API key is not configured yet. Click the setup link below to complete your OpenAI connection.`,
      },
    ];
    setMessages(resetMessages);
  }

  function handleHistoryDateChange(event) {
    const nextDate = String(event.target.value || "").trim();
    if (!nextDate) {
      return;
    }
    setHistoryDate(nextDate);
    setShowHistoryPicker(false);
  }

  if (!enabled || !isAdmin || settings.loading || !settings.enabled) {
    return null;
  }

  const quickQuestions = [
    "Who got increments in the last one year?",
    "Who is on leave today?",
    "Do we have any CRM follow-ups today?",
    "What meetings are scheduled and what discussions happened recently?",
  ];

  return (
    <div className={`ba-assistant ${open ? "is-open" : ""}`}>
      {open ? (
        <div className="ba-assistant__panel">
          <div className="ba-assistant__header">
            <div className="ba-assistant__header-copy">
              <AiAvatar emotion={settings.hasApiKey ? "happy" : "neutral"} size={40} />
              <div>
              <div className="ba-assistant__title">{settings.agent_name}</div>
              <div className="ba-assistant__subtitle">Business Autopilot AI Assistant</div>
              </div>
            </div>
            <div className="ba-assistant__header-actions">
              <button
                type="button"
                className="ba-assistant__icon-btn"
                onClick={clearChatHistory}
                title="Clear Chat"
              >
                <i className="bi bi-trash3" aria-hidden="true" />
              </button>
              <div className="ba-assistant__history-picker-wrap">
                <button
                  type="button"
                  className="ba-assistant__icon-btn"
                  onClick={() => setShowHistoryPicker((prev) => !prev)}
                  title="Chat History"
                >
                  <i className="bi bi-calendar3" aria-hidden="true" />
                </button>
                {showHistoryPicker ? (
                  <div className="ba-assistant__history-picker">
                    <label className="ba-assistant__history-label" htmlFor="ba-assistant-history-date">
                      Chat History
                    </label>
                    <input
                      id="ba-assistant-history-date"
                      type="date"
                      className="form-control"
                      value={historyDate}
                      max={todayIso}
                      onChange={handleHistoryDateChange}
                    />
                    <div className="ba-assistant__history-help">Only last 30 days history is available.</div>
                  </div>
                ) : null}
              </div>
              <button type="button" className="ba-assistant__close" onClick={() => setOpen(false)}>
                <i className="bi bi-x-lg" aria-hidden="true" />
              </button>
            </div>
          </div>
          <div className="ba-assistant__date-strip">
            {isViewingToday ? "Today chat" : `Viewing ${historyDate} history`}
          </div>
          <div className="ba-assistant__chips">
            {quickQuestions.map((item) => (
              <button
                key={item}
                type="button"
                className="ba-assistant__chip"
                onClick={(event) => handleSubmit(event, item)}
                disabled={!settings.hasApiKey || !isViewingToday}
              >
                {item}
              </button>
            ))}
          </div>
          <div className="ba-assistant__messages" ref={listRef}>
            {messages.map((item) => (
              <div
                key={item.id}
                className={`ba-assistant__message ba-assistant__message--${item.role}`}
              >
                {item.role === "assistant" ? (
                  <AiAvatar emotion={getAiEmotionFromText(item.text)} size={42} />
                ) : (
                  <UserChatAvatar photoUrl={currentUser.photoUrl} label={currentUser.label} />
                )}
                <div className={`ba-assistant__bubble ba-assistant__bubble--${item.role}`}>
                  {item.text}
                  {item.role === "assistant" ? (
                    <div className="ba-assistant__reaction">
                      {getAiEmotionEmoji(getAiEmotionFromText(item.text))} AI reaction
                    </div>
                  ) : null}
                </div>
              </div>
            ))}
            {sending ? (
              <div className="ba-assistant__message ba-assistant__message--assistant">
                <AiAvatar emotion="thinking" size={42} />
                <div className="ba-assistant__bubble ba-assistant__bubble--assistant">
                  Thinking...
                  <div className="ba-assistant__reaction">{getAiEmotionEmoji("thinking")} AI reaction</div>
                </div>
              </div>
            ) : null}
          </div>
          {settings.hasApiKey ? (
            <form className="ba-assistant__composer" onSubmit={handleSubmit}>
              {!isViewingToday ? (
                <div className="ba-assistant__setup-note">
                  Old chat history is read-only. Select today in <strong>Chat History</strong> to continue chatting.
                </div>
              ) : null}
              <textarea
                className="form-control"
                rows={2}
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                placeholder="Ask about increments, leaves, CRM follow-ups, or meeting schedules..."
                disabled={!isViewingToday}
              />
              <div className="ba-assistant__composer-actions">
                <button
                  type="button"
                  className="ba-assistant__round-btn"
                  onClick={clearChatHistory}
                  title="Clear Chat"
                >
                  <i className="bi bi-trash3" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  className="ba-assistant__round-btn"
                  onClick={() => setShowHistoryPicker((prev) => !prev)}
                  title="Chat History"
                >
                  <i className="bi bi-calendar3" aria-hidden="true" />
                </button>
                <button type="submit" className="btn btn-primary ba-assistant__send-btn" disabled={sending || !isViewingToday}>
                  Send
                </button>
              </div>
            </form>
          ) : (
            <div className="ba-assistant__composer">
              <div className="ba-assistant__setup-note">
                OpenAI API required.{" "}
                <button type="button" className="ba-assistant__setup-link" onClick={openOpenAiSettings}>
                  Click here
                </button>{" "}
                to configure it.
              </div>
            </div>
          )}
        </div>
      ) : null}
      <button type="button" className="ba-assistant__toggle" onClick={() => setOpen((prev) => !prev)}>
        <AiAvatar emotion={open ? "explaining" : "neutral"} size={38} />
        <span>AI Assistant</span>
      </button>
    </div>
  );
}
