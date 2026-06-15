import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiFetch } from "../lib/api.js";
import TablePagination from "./TablePagination.jsx";
import AiAvatar from "./chat/AiAvatar.jsx";

const MODULE_TABS = [
  { key: "quick-estimate", label: "Quick Estimate", ready: true },
  { key: "crm", label: "CRM", ready: false },
  { key: "projects", label: "Projects", ready: false },
  { key: "accounts", label: "Accounts", ready: false },
];

const ESTIMATE_FILTER_TABS = [
  { key: "today", label: "Today" },
  { key: "all", label: "All" },
  { key: "paid", label: "Paid" },
  { key: "unpaid", label: "Unpaid" },
  { key: "delivery_pending", label: "Delivery Pending" },
];

const TABLE_PAGE_SIZE = 8;

function buildWelcomeMessage() {
  return {
    id: "site-admin-welcome",
    role: "assistant",
    text: "Site Admin is ready. Open Quick Estimate tab, click QE Create, and then share mobile number, client name, item details, and amount.",
    action: "",
    thermalPreviewHtml: "",
    whatsappSharePending: false,
  };
}

function SiteAdminAvatar() {
  return <AiAvatar emotion="neutral" size={42} />;
}

function UserAvatar() {
  return (
    <div className="ba-assistant__user-avatar">
      <span className="ba-assistant__user-avatar-fallback">U</span>
    </div>
  );
}

function buildAssistantChatMessage(data, fallbackText = "No response received.") {
  return {
    id: `site-admin-assistant-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    role: "assistant",
    text: String(data?.reply || fallbackText).trim() || fallbackText,
    action: String(data?.action || ""),
    estimateNumber: String(data?.estimate_number || ""),
    quickEstimateId: data?.quick_estimate_id || null,
    thermalPreviewHtml: String(data?.thermal_preview_html || ""),
    whatsappSharePending: Boolean(data?.whatsapp_share_pending),
  };
}

function formatCurrencyText(value) {
  const numeric = Number.parseFloat(String(value || "0").replace(/,/g, ""));
  if (!Number.isFinite(numeric)) {
    return "";
  }
  return Number.isInteger(numeric) ? String(numeric) : numeric.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}

function formatDisplayCurrency(value) {
  const amount = formatCurrencyText(value);
  return amount ? `Rs.${amount}` : "-";
}

function formatEstimateItemsForPrompt(estimate) {
  const items = Array.isArray(estimate?.items) ? estimate.items : [];
  return items
    .map((item, index) => {
      const description = String(item?.description || item?.service_name || "").trim();
      const quantity = String(item?.quantity || "").trim();
      const unit = String(item?.unit || "").trim();
      const amount = formatCurrencyText(item?.amount);
      const parts = [`${index + 1}.`, description];
      if (quantity) {
        parts.push(unit ? `${quantity} ${unit}` : quantity);
      }
      if (amount) {
        parts.push(`Rs.${amount}`);
      }
      return parts.filter(Boolean).join(" ").trim();
    })
    .filter(Boolean)
    .join("\n");
}

function formatDateLabel(value) {
  if (!value) {
    return "-";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "-";
  }
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

function isTodayDate(value) {
  if (!value) {
    return false;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return false;
  }
  const now = new Date();
  return date.getFullYear() === now.getFullYear()
    && date.getMonth() === now.getMonth()
    && date.getDate() === now.getDate();
}

function normalizeEstimateLifecycle(row) {
  const paymentStatus = String(row?.payment_status || row?.paymentStatus || "").trim().toLowerCase();
  const deliveryStatus = String(row?.delivery_status || row?.deliveryStatus || "").trim().toLowerCase();
  return {
    paymentStatus,
    deliveryStatus,
  };
}

function matchEstimateFilter(row, filterKey) {
  const lifecycle = normalizeEstimateLifecycle(row);
  if (filterKey === "today") {
    return isTodayDate(row?.created_at);
  }
  if (filterKey === "paid") {
    return lifecycle.paymentStatus === "paid";
  }
  if (filterKey === "unpaid") {
    return !lifecycle.paymentStatus || ["pending", "unpaid", "partial", "partial_paid", "advance_paid"].includes(lifecycle.paymentStatus);
  }
  if (filterKey === "delivery_pending") {
    if (!lifecycle.deliveryStatus) {
      return false;
    }
    return !["delivered", "completed", "cancelled", "canceled", "ready"].includes(lifecycle.deliveryStatus);
  }
  return true;
}

export default function BusinessAutopilotSiteAdminChat({ headerTabs = null }) {
  const navigate = useNavigate();
  const [messages, setMessages] = useState([buildWelcomeMessage()]);
  const [prompt, setPrompt] = useState("");
  const [editMobile, setEditMobile] = useState("");
  const [editClientName, setEditClientName] = useState("");
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState("");
  const [editingEstimate, setEditingEstimate] = useState(null);
  const [activeModule, setActiveModule] = useState("quick-estimate");
  const [estimateRows, setEstimateRows] = useState([]);
  const [estimateLoading, setEstimateLoading] = useState(false);
  const [estimateTableNotice, setEstimateTableNotice] = useState("");
  const [estimateSearch, setEstimateSearch] = useState("");
  const [estimateFilter, setEstimateFilter] = useState("today");
  const [estimatePage, setEstimatePage] = useState(1);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [qeHeaderText, setQeHeaderText] = useState("");
  const listRef = useRef(null);
  const composerRef = useRef(null);

  useEffect(() => {
    if (!listRef.current) {
      return;
    }
    listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [messages, sending]);

  useEffect(() => {
    if (!composerRef.current) {
      return;
    }
    composerRef.current.focus();
  }, [editingEstimate, activeModule]);

  useEffect(() => {
    if (activeModule !== "quick-estimate") {
      return undefined;
    }
    let ignore = false;
    async function loadEstimates() {
      setEstimateLoading(true);
      setEstimateTableNotice("");
      try {
        const [estimateData, settingsData] = await Promise.all([
          apiFetch("/api/business-autopilot/quick-estimates/"),
          apiFetch("/api/business-autopilot/quick-estimate-settings/"),
        ]);
        if (!ignore) {
          setEstimateRows(Array.isArray(estimateData?.quick_estimates) ? estimateData.quick_estimates : []);
          setQeHeaderText(String(settingsData?.settings?.headerText || ""));
        }
      } catch (error) {
        if (!ignore) {
          setEstimateTableNotice(error?.message || "Unable to load Quick Estimates right now.");
        }
      } finally {
        if (!ignore) {
          setEstimateLoading(false);
        }
      }
    }
    loadEstimates();
    return () => {
      ignore = true;
    };
  }, [activeModule]);

  useEffect(() => {
    setEstimatePage(1);
  }, [estimateSearch, estimateFilter]);

  function appendAssistantMessage(data, fallbackText) {
    setMessages((prev) => [...prev, buildAssistantChatMessage(data, fallbackText)]);
  }

  function upsertEstimateRow(row) {
    if (!row?.id) {
      return;
    }
    setEstimateRows((prev) => {
      const next = [row, ...prev.filter((item) => item.id !== row.id)];
      return next.sort((left, right) => {
        const leftTime = new Date(left?.created_at || 0).getTime();
        const rightTime = new Date(right?.created_at || 0).getTime();
        return rightTime - leftTime || Number(right?.id || 0) - Number(left?.id || 0);
      });
    });
  }

  function removeEstimateRow(estimateId) {
    setEstimateRows((prev) => prev.filter((item) => item.id !== estimateId));
  }

  function updateEstimatePreview(estimateId, updater) {
    setMessages((prev) => (
      prev.map((item) => (
        item.quickEstimateId === estimateId
          ? { ...item, ...updater(item) }
          : item
      ))
    ));
  }

  async function handleSaveQeSettings() {
    setSettingsSaving(true);
    setNotice("");
    try {
      const data = await apiFetch("/api/business-autopilot/quick-estimate-settings/", {
        method: "PATCH",
        body: JSON.stringify({
          headerText: qeHeaderText.slice(0, 200),
        }),
      });
      setQeHeaderText(String(data?.settings?.headerText || ""));
      setSettingsOpen(false);
      setNotice(String(data?.message || "Quick Estimate settings saved."));
      if (editingEstimate?.id) {
        try {
          const detail = await apiFetch(`/api/business-autopilot/quick-estimates/${editingEstimate.id}/`);
          if (detail?.quick_estimate) {
            upsertEstimateRow(detail.quick_estimate);
            updateEstimatePreview(editingEstimate.id, () => ({
              thermalPreviewHtml: String(detail.quick_estimate.thermal_preview_html || ""),
            }));
          }
        } catch {
          // Ignore preview refresh errors after saving settings.
        }
      }
    } catch (error) {
      setNotice(error?.message || "Unable to save Quick Estimate settings right now.");
    } finally {
      setSettingsSaving(false);
    }
  }

  function handleShareEstimate(row) {
    const whatsappUrl = String(row?.whatsapp_url || "").trim();
    if (!whatsappUrl || typeof window === "undefined") {
      setNotice("WhatsApp share link is not available for this estimate.");
      return;
    }
    window.open(whatsappUrl, "_blank", "noopener,noreferrer");
  }

  function handlePrintEstimate(row) {
    const previewUrl = String(row?.thermal_preview_url || "").trim();
    if (!previewUrl || typeof window === "undefined") {
      setNotice("Print preview is not available for this estimate.");
      return;
    }
    const printWindow = window.open(previewUrl, "_blank", "noopener,noreferrer");
    if (!printWindow) {
      setNotice("Allow popups to print this estimate.");
      return;
    }
    const triggerPrint = () => {
      try {
        printWindow.focus();
        printWindow.print();
      } catch {
        // Ignore print timing errors.
      }
    };
    printWindow.addEventListener?.("load", triggerPrint, { once: true });
    window.setTimeout(triggerPrint, 700);
  }

  async function handleViewEstimate(estimateId) {
    if (!estimateId || sending) {
      return;
    }
    setNotice("");
    try {
      const data = await apiFetch(`/api/business-autopilot/quick-estimates/${estimateId}/`);
      const estimate = data?.quick_estimate || null;
      if (!estimate) {
        throw new Error("Quick Estimate not found.");
      }
      upsertEstimateRow(estimate);
      appendAssistantMessage(
        {
          reply: `Quick Estimate ${estimate.estimate_number} preview loaded.`,
          action: "quick_estimate_viewed",
          quick_estimate_id: estimate.id,
          estimate_number: estimate.estimate_number,
          thermal_preview_html: estimate.thermal_preview_html || "",
          whatsapp_share_pending: false,
        },
        "Quick Estimate preview loaded.",
      );
    } catch (error) {
      const message = error?.message || "Unable to load this Quick Estimate right now.";
      setNotice(message);
      appendAssistantMessage({ reply: message, action: "error" }, message);
    }
  }

  async function handleEditEstimate(estimateId) {
    if (!estimateId || sending) {
      return;
    }
    setNotice("");
    try {
      const data = await apiFetch(`/api/business-autopilot/quick-estimates/${estimateId}/`);
      const estimate = data?.quick_estimate || null;
      if (!estimate) {
        throw new Error("Quick Estimate not found.");
      }
      upsertEstimateRow(estimate);
      const editableText = formatEstimateItemsForPrompt(estimate);
      setEditingEstimate({
        id: estimate.id,
        estimateNumber: String(estimate.estimate_number || ""),
      });
      setPrompt(editableText);
      setEditMobile(String(estimate.mobile || ""));
      setEditClientName(String(estimate.client_name || ""));
      appendAssistantMessage(
        {
          reply: `Quick Estimate ${estimate.estimate_number} loaded for editing. You can update mobile number, client name, and full item list now.`,
          action: "quick_estimate_edit_loaded",
          quick_estimate_id: estimate.id,
          estimate_number: estimate.estimate_number,
          thermal_preview_html: estimate.thermal_preview_html || "",
          whatsapp_share_pending: false,
        },
        "Quick Estimate loaded for editing.",
      );
    } catch (error) {
      const message = error?.message || "Unable to load this Quick Estimate for editing right now.";
      setNotice(message);
      appendAssistantMessage({ reply: message, action: "error" }, message);
    }
  }

  async function handleDeleteEstimate(estimateId, estimateNumber) {
    if (!estimateId || sending) {
      return;
    }
    if (typeof window !== "undefined" && !window.confirm(`Delete ${estimateNumber || "this Quick Estimate"}?`)) {
      return;
    }
    setSending(true);
    setNotice("");
    try {
      const data = await apiFetch(`/api/business-autopilot/quick-estimates/${estimateId}/`, {
        method: "DELETE",
        body: JSON.stringify({ quick_estimate_id: estimateId }),
      });
      removeEstimateRow(estimateId);
      updateEstimatePreview(estimateId, () => ({
        thermalPreviewHtml: "",
        whatsappSharePending: false,
      }));
      if (editingEstimate?.id === estimateId) {
        setEditingEstimate(null);
        setPrompt("");
        setEditMobile("");
        setEditClientName("");
      }
      appendAssistantMessage(data, "Quick Estimate deleted.");
    } catch (error) {
      const message = error?.message || "Unable to delete this Quick Estimate right now.";
      setNotice(message);
      appendAssistantMessage({ reply: message, action: "error" }, message);
    } finally {
      setSending(false);
    }
  }

  async function sendMessage(seedText = "") {
    const text = String(seedText || prompt || "").trim();
    if (!text || sending) {
      return;
    }
    const useEditFlow = Boolean(editingEstimate && !seedText);
    setPrompt("");
    setNotice("");
    const userMessage = { id: `site-admin-user-${Date.now()}`, role: "user", text };
    setMessages((prev) => [...prev, userMessage]);
    setSending(true);
    try {
      const data = useEditFlow
        ? await apiFetch(`/api/business-autopilot/quick-estimates/${editingEstimate.id}/`, {
          method: "PATCH",
          body: JSON.stringify({
            quick_estimate_id: editingEstimate.id,
            mobile: editMobile,
            client_name: editClientName,
            item_text: text,
          }),
        })
        : await apiFetch("/api/business-autopilot/site-admin/chat", {
          method: "POST",
          body: JSON.stringify({ message: text }),
        });
      if (data?.action === "open_whatsapp" && data?.whatsapp_url && typeof window !== "undefined") {
        window.open(data.whatsapp_url, "_blank", "noopener,noreferrer");
      }
      if (useEditFlow && data?.quick_estimate_id) {
        updateEstimatePreview(data.quick_estimate_id, () => ({
          estimateNumber: String(data?.estimate_number || editingEstimate.estimateNumber || ""),
          thermalPreviewHtml: String(data?.thermal_preview_html || ""),
          whatsappSharePending: false,
        }));
      }
      if (data?.quick_estimate_id) {
        try {
          const detail = await apiFetch(`/api/business-autopilot/quick-estimates/${data.quick_estimate_id}/`);
          if (detail?.quick_estimate) {
            upsertEstimateRow(detail.quick_estimate);
          }
        } catch {
          // Keep chat flow responsive even if table refresh fails.
        }
      }
      appendAssistantMessage(data, "No response received.");
      if (useEditFlow) {
        setEditingEstimate(null);
        setEditMobile("");
        setEditClientName("");
      }
    } catch (error) {
      const message = error?.message || "Unable to complete Site Admin request right now.";
      setNotice(message);
      appendAssistantMessage({ reply: message, action: "error" }, message);
    } finally {
      setSending(false);
    }
  }

  function handleSubmit(event) {
    event.preventDefault();
    sendMessage();
  }

  function handleQuickChip(action) {
    if (action === "QE Create") {
      sendMessage("QE");
      return;
    }
    appendAssistantMessage(
      {
        reply: `${action} is coming soon. Quick Estimate is ready now.`,
        action: "coming_soon",
        thermal_preview_html: "",
        whatsapp_share_pending: false,
      },
      `${action} is coming soon.`,
    );
  }

  function handleModuleChange(module) {
    setActiveModule(module.key);
    setEditingEstimate(null);
    setEditMobile("");
    setEditClientName("");
    if (module.ready) {
      setNotice("");
      setPrompt("");
      return;
    }
    setPrompt("");
    setNotice(`${module.label} chat module is not connected yet. Quick Estimate is ready now.`);
  }

  const latestPendingShareMessage = [...messages].reverse().find((item) => item.role === "assistant" && item.whatsappSharePending);
  const estimateModuleActive = activeModule === "quick-estimate";
  const filteredEstimateRows = useMemo(() => {
    const search = estimateSearch.trim().toLowerCase();
    return estimateRows.filter((row) => {
      if (!matchEstimateFilter(row, estimateFilter)) {
        return false;
      }
      if (!search) {
        return true;
      }
      const haystack = [
        row?.estimate_number,
        row?.client_name,
        row?.mobile,
        row?.status,
        row?.payment_status,
        row?.paymentStatus,
        row?.delivery_status,
        row?.deliveryStatus,
      ]
        .map((value) => String(value || "").toLowerCase())
        .join(" ");
      return haystack.includes(search);
    });
  }, [estimateFilter, estimateRows, estimateSearch]);
  const estimateTotalPages = Math.max(1, Math.ceil(filteredEstimateRows.length / TABLE_PAGE_SIZE));
  const safeEstimatePage = Math.min(estimatePage, estimateTotalPages);
  const pagedEstimateRows = filteredEstimateRows.slice((safeEstimatePage - 1) * TABLE_PAGE_SIZE, safeEstimatePage * TABLE_PAGE_SIZE);

  return (
    <div className="ba-assistant ba-assistant--page ba-site-admin-chat">
      <div className="ba-assistant__panel">
        <div className="ba-assistant__header">
          <div className="ba-assistant__header-copy">
            <AiAvatar emotion="neutral" size={40} />
            <div>
              <div className="ba-assistant__title">Site Admin</div>
              <div className="ba-assistant__subtitle">Business Autopilot operations desk</div>
            </div>
          </div>
          <div className="ba-assistant__header-actions">
            {headerTabs}
            <button
              type="button"
              className="ba-assistant__close d-inline-flex align-items-center justify-content-center"
              aria-label="Close full page chat"
              onClick={() => navigate("/app/business-autopilot/")}
            >
              <i className="bi bi-x-lg" aria-hidden="true" />
            </button>
          </div>
        </div>

        <div className="ba-site-admin-chat__workspace">
          <section className="ba-site-admin-chat__chat-col">
            <div className="ba-assistant__date-strip">Site Admin modules</div>
            <div className="ba-site-admin-chat__module-tabs" role="tablist" aria-label="Site Admin modules">
              {MODULE_TABS.map((module) => (
                <button
                  key={module.key}
                  type="button"
                  role="tab"
                  aria-selected={activeModule === module.key}
                  className={`ba-site-admin-chat__module-tab ${activeModule === module.key ? "is-active" : ""}`}
                  onClick={() => handleModuleChange(module)}
                >
                  {module.label}
                </button>
              ))}
            </div>

            {estimateModuleActive ? (
              <div className="ba-assistant__date-strip">Quick Estimate chat</div>
            ) : null}

            <div className="ba-assistant__messages ba-assistant__messages--full" ref={listRef}>
              {messages.map((item) => (
                <div key={item.id} className={`ba-assistant__message ba-assistant__message--${item.role}`}>
                  {item.role === "assistant" ? <SiteAdminAvatar /> : <UserAvatar />}
                  <div className={`ba-assistant__bubble ba-assistant__bubble--${item.role}`}>
                    <div>{item.text}</div>
                    {item.role === "assistant" && item.whatsappSharePending ? (
                      <div className="ba-site-admin-chat__inline-actions">
                        <button type="button" className="btn btn-sm btn-success" onClick={() => sendMessage("Yes")} disabled={sending}>
                          Yes
                        </button>
                        <button type="button" className="btn btn-sm btn-outline-light" onClick={() => sendMessage("No")} disabled={sending}>
                          No
                        </button>
                      </div>
                    ) : null}
                    {item.thermalPreviewHtml ? (
                      <div className="ba-site-admin-chat__preview-card">
                        <div className="ba-site-admin-chat__preview-head">
                          <strong>{item.estimateNumber || "Quick Estimate"}</strong>
                          <span>Thermal Preview</span>
                        </div>
                        <iframe
                          title={item.estimateNumber || "Quick Estimate Preview"}
                          className="ba-site-admin-chat__preview-frame"
                          srcDoc={item.thermalPreviewHtml}
                        />
                        {item.quickEstimateId ? (
                          <div className="ba-site-admin-chat__preview-actions">
                            <button
                              type="button"
                              className="btn btn-sm btn-outline-success"
                              onClick={() => handleEditEstimate(item.quickEstimateId)}
                              disabled={sending}
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              className="btn btn-sm btn-outline-danger"
                              onClick={() => handleDeleteEstimate(item.quickEstimateId, item.estimateNumber)}
                              disabled={sending}
                            >
                              Delete
                            </button>
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                </div>
              ))}
              {sending ? (
                <div className="ba-assistant__message ba-assistant__message--assistant">
                  <SiteAdminAvatar />
                  <div className="ba-assistant__bubble ba-assistant__bubble--assistant">Working...</div>
                </div>
              ) : null}
            </div>

            <form className="ba-assistant__composer" onSubmit={handleSubmit}>
              {notice ? <div className="ba-assistant__setup-note">{notice}</div> : null}
              {editingEstimate ? (
                <div className="ba-site-admin-chat__edit-grid">
                  <input
                    type="text"
                    className="form-control"
                    value={editMobile}
                    onChange={(event) => setEditMobile(event.target.value.replace(/\D/g, "").slice(0, 10))}
                    placeholder="Mobile number"
                    disabled={sending}
                    inputMode="numeric"
                    aria-label="Edit mobile number"
                  />
                  <input
                    type="text"
                    className="form-control"
                    value={editClientName}
                    onChange={(event) => setEditClientName(event.target.value.slice(0, 180))}
                    placeholder="Client name"
                    disabled={sending}
                    aria-label="Edit client name"
                  />
                </div>
              ) : null}
              <textarea
                ref={composerRef}
                className="form-control ba-assistant__textarea"
                rows={2}
                maxLength={280}
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                placeholder={
                  estimateModuleActive
                    ? editingEstimate
                      ? `Update ${editingEstimate.estimateNumber} item details and send...`
                      : "Click QE Create and continue the Quick Estimate chat..."
                    : "Select a ready module to start Site Admin chat..."
                }
                disabled={sending || !estimateModuleActive}
                spellCheck={false}
                aria-label={latestPendingShareMessage ? "Reply to Site Admin chat" : "Site Admin message input"}
              />
              <div className="ba-assistant__composer-actions">
                <button type="submit" className="btn btn-primary ba-assistant__send-btn" disabled={sending || !estimateModuleActive}>
                  Send
                </button>
              </div>
            </form>
          </section>

          <aside className="ba-site-admin-chat__table-col">
            <div className="ba-site-admin-chat__table-card">
              <div className="ba-site-admin-chat__table-head">
                <div>
                  <div className="ba-site-admin-chat__table-title">Quick Estimate List</div>
                  <div className="ba-site-admin-chat__table-subtitle">Search, review, edit, and delete estimates from one panel.</div>
                </div>
                <div className="d-flex align-items-center gap-2">
                  <button
                    type="button"
                    className="btn btn-sm btn-outline-secondary"
                    onClick={() => setSettingsOpen(true)}
                    disabled={!estimateModuleActive || sending}
                  >
                    QE Setting
                  </button>
                  <button type="button" className="btn btn-sm btn-outline-success" onClick={() => handleQuickChip("QE Create")} disabled={!estimateModuleActive || sending}>
                    New QE
                  </button>
                </div>
              </div>

              <div className="ba-site-admin-chat__table-tabs" role="tablist" aria-label="Quick Estimate filters">
                {ESTIMATE_FILTER_TABS.map((tab) => (
                  <button
                    key={tab.key}
                    type="button"
                    className={`ba-site-admin-chat__table-tab ${estimateFilter === tab.key ? "is-active" : ""}`}
                    onClick={() => setEstimateFilter(tab.key)}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              <div className="ba-site-admin-chat__table-toolbar">
                <div className="ba-site-admin-chat__table-count">
                  {filteredEstimateRows.length} estimate{filteredEstimateRows.length === 1 ? "" : "s"}
                </div>
                <input
                  type="search"
                  className="form-control ba-site-admin-chat__table-search"
                  value={estimateSearch}
                  onChange={(event) => setEstimateSearch(event.target.value)}
                  placeholder="Search estimate, client, mobile..."
                  aria-label="Search estimates"
                />
              </div>

              {estimateTableNotice ? <div className="ba-assistant__setup-note">{estimateTableNotice}</div> : null}

              <div className="table-responsive ba-site-admin-chat__table-wrap">
                <table className="table align-middle mb-0">
                  <thead>
                    <tr>
                      <th>Estimate / Client</th>
                      <th>Date</th>
                      <th>Status</th>
                      <th className="text-end">Amount</th>
                      <th className="text-end table-actions">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {estimateLoading ? (
                      <tr>
                        <td colSpan={5} className="text-center py-4 text-secondary">Loading Quick Estimates...</td>
                      </tr>
                    ) : pagedEstimateRows.length ? (
                      pagedEstimateRows.map((row) => (
                        <tr key={row.id}>
                          <td>
                            <div className="ba-site-admin-chat__estimate-meta">
                              <strong>{row.estimate_number || "-"}</strong>
                              <span>{row.client_name || "-"}</span>
                              <small>{row.mobile || "-"}</small>
                            </div>
                          </td>
                          <td>{formatDateLabel(row.created_at)}</td>
                          <td>
                            <span className="ba-site-admin-chat__status-pill">
                              {String(row.status || "created").replace(/_/g, " ")}
                            </span>
                          </td>
                          <td className="text-end fw-semibold">{formatDisplayCurrency(row.total_amount || row.subtotal)}</td>
                          <td className="text-end table-actions">
                            <div className="d-flex align-items-center justify-content-end gap-2 flex-nowrap">
                              <button
                                type="button"
                                className="btn btn-sm btn-outline-secondary saas-org-icon-btn"
                                onClick={() => handleViewEstimate(row.id)}
                                title="View Estimate"
                                aria-label="View Estimate"
                              >
                                <i className="bi bi-eye" aria-hidden="true" />
                              </button>
                              <button
                                type="button"
                                className="btn btn-sm btn-outline-success saas-org-icon-btn"
                                onClick={() => handleEditEstimate(row.id)}
                                title="Edit Estimate"
                                aria-label="Edit Estimate"
                              >
                                <i className="bi bi-pencil" aria-hidden="true" />
                              </button>
                              <button
                                type="button"
                                className="btn btn-sm btn-outline-primary saas-org-icon-btn"
                                onClick={() => handleShareEstimate(row)}
                                title="Share on WhatsApp"
                                aria-label="Share on WhatsApp"
                              >
                                <i className="bi bi-whatsapp" aria-hidden="true" />
                              </button>
                              <button
                                type="button"
                                className="btn btn-sm btn-outline-dark saas-org-icon-btn"
                                onClick={() => handlePrintEstimate(row)}
                                title="Print Estimate"
                                aria-label="Print Estimate"
                              >
                                <i className="bi bi-printer" aria-hidden="true" />
                              </button>
                              <button
                                type="button"
                                className="btn btn-sm btn-outline-danger saas-org-icon-btn"
                                onClick={() => handleDeleteEstimate(row.id, row.estimate_number)}
                                title="Delete Estimate"
                                aria-label="Delete Estimate"
                              >
                                <i className="bi bi-trash" aria-hidden="true" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={5} className="text-center py-4 text-secondary">No Quick Estimates found for this filter.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              <div className="ba-site-admin-chat__table-pagination">
                <TablePagination
                  page={safeEstimatePage}
                  totalPages={estimateTotalPages}
                  onPageChange={setEstimatePage}
                  showPageLinks
                />
              </div>
            </div>
          </aside>
        </div>
      </div>
      {settingsOpen ? (
        <div className="ba-site-admin-chat__modal-overlay" onClick={() => !settingsSaving && setSettingsOpen(false)}>
          <div className="ba-site-admin-chat__modal" onClick={(event) => event.stopPropagation()}>
            <div className="ba-site-admin-chat__modal-head">
              <div>
                <div className="ba-site-admin-chat__modal-title">Quick Estimate Setting</div>
                <div className="ba-site-admin-chat__modal-subtitle">Estimate top-la company name, address, mobile details show panna text set pannunga.</div>
              </div>
              <button
                type="button"
                className="ba-assistant__close d-inline-flex align-items-center justify-content-center"
                aria-label="Close settings"
                onClick={() => setSettingsOpen(false)}
                disabled={settingsSaving}
              >
                <i className="bi bi-x-lg" aria-hidden="true" />
              </button>
            </div>
            <label className="form-label fw-semibold">Header Text</label>
            <textarea
              className="form-control ba-site-admin-chat__settings-textarea"
              rows={5}
              maxLength={200}
              value={qeHeaderText}
              onChange={(event) => setQeHeaderText(event.target.value.slice(0, 200))}
              placeholder={`GP Prakash\nNo.12, Example Street, Chennai\nMobile: 9876543210`}
              disabled={settingsSaving}
            />
            <div className="ba-site-admin-chat__settings-meta">
              <span>Character limit: 200</span>
              <strong>{qeHeaderText.length}/200</strong>
            </div>
            <div className="ba-site-admin-chat__modal-actions">
              <button type="button" className="btn btn-outline-secondary" onClick={() => setSettingsOpen(false)} disabled={settingsSaving}>
                Cancel
              </button>
              <button type="button" className="btn btn-success" onClick={handleSaveQeSettings} disabled={settingsSaving}>
                {settingsSaving ? "Saving..." : "Save Setting"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
