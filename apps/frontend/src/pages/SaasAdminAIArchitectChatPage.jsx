import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import AiAvatar from "../components/chat/AiAvatar.jsx";
import { getAiEmotionEmoji, getAiEmotionFromText } from "../components/chat/aiAvatarConfig.js";
import {
  deleteAiArchitectSession,
  fetchAiArchitectHistory,
  fetchAiArchitectSessions,
  fetchAiArchitectStatus,
  fetchAiArchitectUsage,
  sendAiArchitectChat
} from "../lib/saasAdminAiArchitectApi.js";

const SESSION_KEY = "wz_saas_admin_ai_architect_session";

function createSessionId() {
  try {
    return (crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`).toString();
  } catch {
    return `${Date.now()}-${Math.random()}`;
  }
}

function getStoredSessionId() {
  try {
    return window.localStorage.getItem(SESSION_KEY) || "";
  } catch {
    return "";
  }
}

function setStoredSessionId(value) {
  try {
    window.localStorage.setItem(SESSION_KEY, String(value || ""));
  } catch {
    // ignore
  }
}

function useQuery() {
  const { search } = useLocation();
  return useMemo(() => new URLSearchParams(search), [search]);
}

function extractCodexPrompt(text = "") {
  const raw = String(text || "");
  const idx = raw.toLowerCase().indexOf("codex prompt");
  if (idx === -1) return raw.trim();
  return raw.slice(idx).trim();
}

async function copyText(text) {
  const value = String(text || "").trim();
  if (!value) return;
  try {
    await navigator.clipboard.writeText(value);
  } catch {
    // ignore
  }
}

export default function SaasAdminAIArchitectChatPage() {
  const navigate = useNavigate();
  const query = useQuery();
  const sessionFromUrl = String(query.get("session") || "").trim();
  const initialSessionId = useMemo(() => {
    if (typeof window === "undefined") return "";
    return sessionFromUrl || getStoredSessionId() || createSessionId();
  }, [sessionFromUrl]);

  const [settings, setSettings] = useState({
    loading: true,
    enabled: false,
    configured: false,
    usage: null
  });
  const [sessions, setSessions] = useState([]);
  const [sessionId, setSessionId] = useState(initialSessionId);
  const [messages, setMessages] = useState([]);
  const [prompt, setPrompt] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const listRef = useRef(null);

  useEffect(() => {
    if (!sessionId) return;
    setStoredSessionId(sessionId);
    navigate({ search: `?session=${encodeURIComponent(sessionId)}` }, { replace: true });
  }, [sessionId, navigate]);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const data = await fetchAiArchitectStatus();
        if (!active) return;
        setSettings({
          loading: false,
          enabled: Boolean(data?.enabled),
          configured: Boolean(data?.configured),
          usage: data?.usage || null
        });
      } catch {
        if (!active) return;
        setSettings((prev) => ({ ...prev, loading: false }));
      }
    };
    load();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    const loadSessions = async () => {
      try {
        const data = await fetchAiArchitectSessions();
        if (!active) return;
        const items = Array.isArray(data?.sessions) ? data.sessions : [];
        setSessions(items);
      } catch {
        // ignore
      }
    };
    loadSessions();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    const loadHistory = async () => {
      setError("");
      try {
        const data = await fetchAiArchitectHistory(sessionId);
        if (!active) return;
        const items = Array.isArray(data?.messages) ? data.messages : [];
        setMessages(items.map((row) => ({ role: row.role, content: row.content, id: row.id })));
      } catch (err) {
        if (!active) return;
        setMessages([]);
        setError(err?.message || "Unable to load chat history.");
      }
    };
    if (sessionId) loadHistory();
    return () => {
      active = false;
    };
  }, [sessionId]);

  useEffect(() => {
    const node = listRef.current;
    if (!node) return;
    node.scrollTop = node.scrollHeight;
  }, [messages]);

  const budgetExceeded = Boolean(settings.usage?.exceeded && settings.usage?.hard_stop_enabled);
  const canChat = settings.enabled && settings.configured && !budgetExceeded;

  const refreshUsage = async () => {
    try {
      const data = await fetchAiArchitectUsage();
      setSettings((prev) => ({ ...prev, usage: data?.usage || prev.usage }));
    } catch {
      // ignore
    }
  };

  const send = async () => {
    const message = String(prompt || "").trim();
    if (!message || sending) return;
    setError("");
    setSending(true);
    setPrompt("");
    setMessages((prev) => [...prev, { role: "user", content: message, id: `local-${Date.now()}` }]);
    try {
      const result = await sendAiArchitectChat({ message, session_id: sessionId });
      const reply = String(result?.text || "").trim();
      if (reply) {
        setMessages((prev) => [...prev, { role: "assistant", content: reply, id: `ai-${Date.now()}` }]);
      }
      if (result?.usage) {
        setSettings((prev) => ({ ...prev, usage: result.usage }));
      } else {
        refreshUsage();
      }
      // Refresh session list once a message arrives so it appears in sidebar.
      const data = await fetchAiArchitectSessions().catch(() => null);
      const items = Array.isArray(data?.sessions) ? data.sessions : null;
      if (items) setSessions(items);
    } catch (err) {
      const messageText = String(err?.message || "");
      if (messageText.toLowerCase().includes("monthly_budget_exceeded")) {
        setSettings((prev) => ({ ...prev, usage: { ...(prev.usage || {}), exceeded: true } }));
        setError("Monthly AI budget limit reached. Increase budget or reset billing cycle.");
      } else {
        setError(err?.message || "Unable to send message.");
      }
    } finally {
      setSending(false);
    }
  };

  const onNewChat = () => {
    const sid = createSessionId();
    setSessionId(sid);
    setMessages([]);
    setError("");
  };

  const onDeleteSession = async (sid) => {
    if (!sid) return;
    try {
      await deleteAiArchitectSession(sid);
      const data = await fetchAiArchitectSessions().catch(() => null);
      const items = Array.isArray(data?.sessions) ? data.sessions : [];
      setSessions(items);
      if (sid === sessionId) {
        onNewChat();
      }
    } catch (err) {
      setError(err?.message || "Unable to delete chat.");
    }
  };

  if (settings.loading) {
    return (
      <div className="card p-4 text-center">
        <div className="spinner" />
        <p className="mb-0">Loading AI Architect chat...</p>
      </div>
    );
  }

  const viewportCardHeight = "calc(100vh - 170px)";

  return (
    <div className="row g-3">
      <div className="col-12 col-lg-3">
        <div className="card p-3" style={{ height: viewportCardHeight, display: "flex", flexDirection: "column" }}>
          <div className="d-flex align-items-center justify-content-between gap-2">
            <div>
              <div className="fw-semibold">AI Architect</div>
              <div className="text-secondary small">Topics</div>
            </div>
            <button type="button" className="btn btn-primary btn-sm" onClick={onNewChat}>
              <i className="bi bi-plus-lg me-1" aria-hidden="true" />
              New
            </button>
          </div>
          <hr className="my-3" />
          <div className="list-group" style={{ flex: 1, minHeight: 0, overflow: "auto" }}>
            {sessions.length ? (
              sessions.map((s) => {
                const active = String(s.session_id) === String(sessionId);
                return (
                  <div
                    key={s.session_id}
                    className={`list-group-item d-flex align-items-center justify-content-between gap-2 ${active ? "active" : ""}`}
                    role="button"
                    tabIndex={0}
                    onClick={() => setSessionId(String(s.session_id))}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setSessionId(String(s.session_id));
                      }
                    }}
                  >
                    <div className="text-truncate" style={{ maxWidth: "14rem" }}>
                      {s.title || "Chat"}
                    </div>
                    <button
                      type="button"
                      className={`btn btn-sm ${active ? "btn-light" : "btn-outline-danger"}`}
                      title="Delete"
                      aria-label="Delete"
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeleteSession(String(s.session_id));
                      }}
                    >
                      <i className="bi bi-trash" aria-hidden="true" />
                    </button>
                  </div>
                );
              })
            ) : (
              <div className="text-secondary small">No chats yet.</div>
            )}
          </div>
          <hr className="my-3" />
          <Link className="btn btn-outline w-100" to="/saas-admin/ai-architect-settings">
            Open settings
          </Link>
        </div>
      </div>

      <div className="col-12 col-lg-9">
        <div className="card p-3" style={{ height: viewportCardHeight, display: "flex", flexDirection: "column" }}>
          <div className="d-flex align-items-start justify-content-between gap-2 flex-wrap">
            <div>
              <div className="fw-semibold">SaaS AI Architect</div>
              <div className="text-secondary small">Read-only project assistant</div>
            </div>
          </div>

          {!canChat ? (
            <div className="alert alert-warning mt-3 mb-0">
              AI Architect is disabled / not configured, or monthly budget limit reached.{" "}
              <Link to="/saas-admin/ai-architect-settings">Open settings</Link>.
            </div>
          ) : null}

          <div className="ba-assistant__messages ba-assistant__messages--full mt-3" ref={listRef} style={{ flex: 1, minHeight: 0 }}>
            {messages.length ? (
              messages.map((msg) => {
                const role = msg.role === "user" ? "user" : "assistant";
                const emotion = role === "assistant" ? getAiEmotionFromText(msg.content) : "neutral";
                return (
                  <div
                    key={msg.id}
                    className={`ba-assistant__message ${role === "user" ? "ba-assistant__message--user" : ""}`}
                  >
                    {role === "assistant" ? (
                      <AiAvatar emoji={getAiEmotionEmoji(emotion)} />
                    ) : (
                      <div className="ba-assistant__user-avatar">
                        <span className="ba-assistant__user-avatar-fallback">A</span>
                      </div>
                    )}
                    <div
                      className={`ba-assistant__bubble ${role === "user" ? "ba-assistant__bubble--user" : "ba-assistant__bubble--assistant"}`}
                    >
                      <div style={{ whiteSpace: "pre-wrap" }}>{msg.content}</div>
                      {role === "assistant" ? (
                        <div className="mt-2 d-flex gap-2">
                          <button
                            type="button"
                            className="btn btn-outline-light btn-sm"
                            title="Copy Codex Prompt"
                            aria-label="Copy Codex Prompt"
                            onClick={() => copyText(extractCodexPrompt(msg.content))}
                          >
                            <i className="bi bi-braces" aria-hidden="true" />
                          </button>
                          <button
                            type="button"
                            className="btn btn-outline-light btn-sm"
                            title="Copy Full Analysis"
                            aria-label="Copy Full Analysis"
                            onClick={() => copyText(msg.content)}
                          >
                            <i className="bi bi-clipboard" aria-hidden="true" />
                          </button>
                        </div>
                      ) : null}
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="text-secondary small">
                Start a new topic and ask about code structure, models, schema risks, or request a Codex-ready prompt.
              </div>
            )}
          </div>

          {error ? <div className="alert alert-danger mt-3 mb-0">{error}</div> : null}

          <div className="d-flex gap-2 mt-3">
            <input
              className="form-control"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder={canChat ? "Type a message…" : "Configure AI Architect first…"}
              disabled={!canChat || sending}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
            />
            <button
              type="button"
              className="btn btn-primary"
              onClick={send}
              disabled={!canChat || sending || !String(prompt || "").trim()}
              aria-label="Send"
            >
              {sending ? (
                <span className="spinner-border spinner-border-sm" role="status" aria-hidden="true" />
              ) : (
                <i className="bi bi-send-fill" aria-hidden="true" />
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
