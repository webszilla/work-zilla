import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import AiAvatar from "../chat/AiAvatar.jsx";
import { getAiEmotionEmoji, getAiEmotionFromText } from "../chat/aiAvatarConfig.js";
import {
  fetchAiArchitectHistory,
  fetchAiArchitectStatus,
  fetchAiArchitectUsage,
  sendAiArchitectChat
} from "../../lib/saasAdminAiArchitectApi.js";

const SESSION_KEY = "wz_saas_admin_ai_architect_session";

function getSessionId() {
  try {
    const existing = window.localStorage.getItem(SESSION_KEY);
    if (existing) return existing;
    const created = (crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`).toString();
    window.localStorage.setItem(SESSION_KEY, created);
    return created;
  } catch {
    return "";
  }
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

export default function SaasAdminAIChatWidget() {
  const [settings, setSettings] = useState({
    loading: true,
    enabled: false,
    configured: false,
    model_name: "gpt-4o-mini",
    usage: null
  });
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [prompt, setPrompt] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const listRef = useRef(null);

  const sessionId = useMemo(() => (typeof window === "undefined" ? "" : getSessionId()), []);

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
          model_name: data?.model_name || "gpt-4o-mini",
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
    if (!open) return;
    let active = true;
    const refreshUsage = async () => {
      try {
        const data = await fetchAiArchitectUsage();
        if (!active) return;
        setSettings((prev) => ({ ...prev, usage: data?.usage || prev.usage }));
      } catch {
        // ignore
      }
    };
    refreshUsage();
    return () => {
      active = false;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    let active = true;
    const loadHistory = async () => {
      try {
        const data = await fetchAiArchitectHistory(sessionId);
        if (!active) return;
        const items = Array.isArray(data?.messages) ? data.messages : [];
        setMessages(items.map((row) => ({ role: row.role, content: row.content, id: row.id })));
      } catch {
        // ignore history failures
      }
    };
    loadHistory();
    return () => {
      active = false;
    };
  }, [open, sessionId]);

  useEffect(() => {
    if (!open) return;
    const node = listRef.current;
    if (!node) return;
    node.scrollTop = node.scrollHeight;
  }, [messages, open]);

  const budgetExceeded = Boolean(settings.usage?.exceeded && settings.usage?.hard_stop_enabled);
  const canChat = settings.enabled && settings.configured && !budgetExceeded;

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
      }
    } catch (err) {
      const messageText = String(err?.message || "");
      if (messageText.toLowerCase().includes("monthly_budget_exceeded")) {
        setSettings((prev) => ({
          ...prev,
          usage: { ...(prev.usage || {}), exceeded: true }
        }));
        setError("Monthly AI budget limit reached. Increase budget or reset billing cycle.");
      } else {
        setError(err?.message || "Unable to send message.");
      }
    } finally {
      setSending(false);
    }
  };

  if (settings.loading) {
    return null;
  }

  const monthCost = Number(settings.usage?.month_cost_inr || 0);
  const monthBudget = Number(settings.usage?.monthly_budget_inr || 0);
  const warningPercent = Number(settings.usage?.warning_threshold_percent || 80);
  const warningAt = monthBudget ? (monthBudget * warningPercent) / 100 : 0;
  const showWarning = Boolean(monthBudget && monthCost >= warningAt && monthCost < monthBudget);
  const usageLine = monthBudget ? `This Month: ₹${monthCost.toFixed(2)} / ₹${monthBudget.toFixed(0)}` : "This Month: ₹0 / ₹0";

  return (
    <div className="ba-assistant saas-admin-assistant" aria-live="polite">
      {open ? (
        <div className="ba-assistant__panel">
          <div className="ba-assistant__header">
            <div className="ba-assistant__header-copy">
              <AiAvatar emoji={getAiEmotionEmoji("focus")} />
              <div>
                <div className="ba-assistant__title">SaaS AI Architect</div>
                <div className="ba-assistant__subtitle">
                  Read-only project assistant · {usageLine}
                </div>
              </div>
            </div>
            <div className="ba-assistant__header-actions">
              <Link
                className="ba-assistant__icon-link"
                to="/saas-admin/ai-architect-chat"
                aria-label="Open full view"
                title="Full view"
                onClick={() => setOpen(false)}
              >
                <i className="bi bi-arrows-fullscreen" aria-hidden="true" />
              </Link>
              <button
                type="button"
                className="ba-assistant__close"
                onClick={() => setOpen(false)}
                aria-label="Close"
              >
                <i className="bi bi-x-lg" aria-hidden="true" />
              </button>
            </div>
          </div>

          {!canChat ? (
            <div className="ba-assistant__setup-note">
              {budgetExceeded ? (
                <>
                  Monthly AI budget limit reached.{" "}
                  <Link className="ba-assistant__setup-link" to="/saas-admin/ai-architect-settings">
                    Increase budget
                  </Link>
                  .
                </>
              ) : (
                <>
                  AI Architect is disabled or not configured.{" "}
                  <Link className="ba-assistant__setup-link" to="/saas-admin/ai-architect-settings">
                    Open settings
                  </Link>
                  .
                </>
              )}
            </div>
          ) : null}

          {showWarning ? (
            <div className="alert alert-warning m-3 mb-0">
              AI budget warning: {usageLine}
            </div>
          ) : null}

          <div className="ba-assistant__messages" ref={listRef}>
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
                    <div className={`ba-assistant__bubble ${role === "user" ? "ba-assistant__bubble--user" : "ba-assistant__bubble--assistant"}`}>
                      <div style={{ whiteSpace: "pre-wrap" }}>{msg.content}</div>
                      {role === "assistant" ? (
                        <div className="mt-2 d-flex gap-2 flex-wrap">
                          <button
                            type="button"
                            className="btn btn-outline-light btn-sm"
                            onClick={() => copyText(extractCodexPrompt(msg.content))}
                            title="Copy Codex Prompt"
                            aria-label="Copy Codex Prompt"
                          >
                            <i className="bi bi-braces" aria-hidden="true" />
                          </button>
                          <button
                            type="button"
                            className="btn btn-outline-light btn-sm"
                            onClick={() => copyText(msg.content)}
                            title="Copy Full Analysis"
                            aria-label="Copy Full Analysis"
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
              <div className="text-secondary small p-3">
                Ask about code structure, models, schema risks, or request a Codex-ready prompt.
              </div>
            )}
          </div>

          {error ? <div className="alert alert-danger m-3 mb-0">{error}</div> : null}

          <div className="ba-assistant__composer">
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
            <div className="ba-assistant__composer-actions">
              <button
                type="button"
                className="ba-assistant__send-btn"
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
      ) : null}

      <div className="ba-assistant__dock">
        <button type="button" className="ba-assistant__toggle" onClick={() => setOpen((v) => !v)}>
          <i className="bi bi-chat-left-dots" aria-hidden="true" />
          AI Architect
        </button>
      </div>
    </div>
  );
}
