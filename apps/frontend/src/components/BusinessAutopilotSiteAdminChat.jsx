import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiFetch } from "../lib/api.js";
import { useConfirm } from "./ConfirmDialog.jsx";
import TablePagination from "./TablePagination.jsx";
import AiAvatar from "./chat/AiAvatar.jsx";
import TinyHtmlEditor from "./TinyHtmlEditor.jsx";

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

const TABLE_PAGE_SIZE = 15;

function buildWelcomeMessage() {
  return {
    id: "site-admin-welcome",
    role: "assistant",
    text: "To create a Quick Estimate, share the mobile number, client name, and item details with quantity and amount.",
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

function normalizeThermalPreviewHtml(value) {
  return String(value || "")
    .replace(/Printable\s+(?:3|4)-inch\s+thermal\s+estimate\s+preview\.?/gi, "")
    .trim();
}

function getThemedThermalPreviewHtml(value) {
  const html = normalizeThermalPreviewHtml(value);
  if (!html) {
    return "";
  }
  if (typeof document === "undefined") {
    return html;
  }
  const theme = String(document.documentElement?.dataset?.theme || "light").toLowerCase();
  if (theme !== "dark") {
    return html;
  }
  const themeCss = [
    "html, body { background: #0f172a !important; }",
    "body { color: #e5e7eb !important; }",
  ].join(" ");
  if (html.includes("</style>")) {
    return html.replace("</style>", `${themeCss}</style>`);
  }
  if (html.includes("</head>")) {
    return html.replace("</head>", `<style>${themeCss}</style></head>`);
  }
  return html;
}

function buildQuickEstimateDemoPreviewHtml() {
  return normalizeThermalPreviewHtml(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="utf-8">
      <style>
        body { margin: 0; padding: 12px; background: #f8fafc; font-family: "Courier New", monospace; color: #0f172a; }
        .thermal { width: 100%; max-width: 384px; margin: 0 auto; background: #fff; border: 1px solid #dbe5d7; border-radius: 14px; padding: 14px 12px; }
        .center { text-align: center; }
        .title { margin: 10px 0; color: #16a34a; font-size: 18px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; }
        .muted { color: #64748b; font-size: 12px; line-height: 1.5; }
        .meta, table, .thank-you { font-size: 12px; }
        .meta { margin: 10px 0; padding: 8px 0; border-top: 1px dashed #cbd5e1; border-bottom: 1px dashed #cbd5e1; }
        .row { display: flex; justify-content: space-between; gap: 8px; margin: 4px 0; }
        table { width: 100%; border-collapse: collapse; margin-top: 8px; }
        th, td { padding: 6px 0; border-bottom: 1px dashed #cbd5e1; vertical-align: top; }
        th:last-child, td:last-child { text-align: right; white-space: nowrap; }
        .item-name { font-weight: 700; }
        .qty { color: #64748b; margin-top: 2px; }
        .total { margin-top: 10px; padding-top: 8px; border-top: 2px solid #0f172a; display: flex; justify-content: space-between; font-weight: 700; }
        .thank-you { margin-top: 12px; padding-top: 8px; border-top: 1px dashed #cbd5e1; text-align: center; color: #64748b; }
      </style>
    </head>
    <body>
      <div class="thermal">
        <div class="center">
          <div class="muted"><strong>Demo Company</strong><br>Anna Nagar, Chennai<br>+91 90000 00000</div>
          <div class="title">Quick Estimate</div>
        </div>
        <div class="meta">
          <div class="row"><span>Estimate No</span><strong>DEMO-QE</strong></div>
          <div class="row"><span>Date</span><strong>16/06/2026, 10:00 AM</strong></div>
          <div class="row"><span>Client</span><strong>Arun</strong></div>
          <div class="row"><span>Mobile</span><strong>9876543210</strong></div>
        </div>
        <table>
          <thead><tr><th>Items</th><th>Amt</th></tr></thead>
          <tbody>
            <tr>
              <td><div class="item-name">Letterhead Printing</div><div>100 GSM Bond Sheet</div><div class="qty">Qty: 100 Nos</div></td>
              <td>Rs 950</td>
            </tr>
            <tr>
              <td><div class="item-name">ID Card Printing</div><div>Matte Finish</div><div class="qty">Qty: 10 Nos</div></td>
              <td>Rs 1000</td>
            </tr>
          </tbody>
        </table>
        <div class="total"><span>Total</span><span>Rs 1950</span></div>
        <div class="thank-you">Thank you.</div>
      </div>
    </body>
    </html>
  `);
}

function buildQuickEstimateTutorialIntroMessage() {
  return {
    id: "site-admin-demo-1",
    role: "assistant",
    text: "To create a Quick Estimate, share the mobile number, client name, and item details with quantity and amount.",
    action: "demo",
    thermalPreviewHtml: "",
    whatsappSharePending: false,
  };
}

function buildQuickEstimateTutorialReplyMessage() {
  return {
    id: "site-admin-demo-2",
    role: "assistant",
    text: "Example format: mobile number, client name, then item details with quantity and amount.",
    action: "demo_reply",
    thermalPreviewHtml: "",
    whatsappSharePending: false,
  };
}

function buildQuickEstimateTutorialPreviewMessage() {
  return {
    id: "site-admin-demo-3",
    role: "assistant",
    text: "Preview example: after you send the details, the estimate preview will appear like this.",
    action: "demo_preview",
    estimateNumber: "DEMO-QE",
    quickEstimateId: null,
    thermalPreviewHtml: buildQuickEstimateDemoPreviewHtml(),
    whatsappSharePending: false,
  };
}

function buildAssistantChatMessage(data, fallbackText = "No response received.") {
  return {
    id: `site-admin-assistant-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    role: "assistant",
    text: String(data?.reply || fallbackText).trim() || fallbackText,
    action: String(data?.action || ""),
    estimateNumber: String(data?.estimate_number || ""),
    quickEstimateId: data?.quick_estimate_id || null,
    thermalPreviewHtml: normalizeThermalPreviewHtml(data?.thermal_preview_html || ""),
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

function filterAssignableOrgUsers(rows) {
  return Array.isArray(rows)
    ? rows.filter((row) => (
      row
      && String(row?.status || "").toLowerCase() === "active"
      && Number(row?.membership_id || 0) > 0
    ))
    : [];
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

function formatDateTimeLabel(value) {
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
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function getEstimateCreatedByLabel(row) {
  const candidates = [
    row?.created_by_name,
    row?.createdByName,
    row?.created_by,
    row?.createdBy,
    row?.created_by_username,
    row?.createdByUsername,
    row?.created_by_email,
    row?.createdByEmail,
  ];
  const label = candidates.find((value) => String(value || "").trim());
  return String(label || "").trim() || "-";
}

function countPlainTextFromHtml(value) {
  if (typeof window === "undefined") {
    return String(value || "").replace(/<[^>]*>/g, "").trim().length;
  }
  const parser = new window.DOMParser();
  const doc = parser.parseFromString(String(value || ""), "text/html");
  return String(doc.body?.textContent || "").trim().length;
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
    return ["paid", "completed"].includes(lifecycle.paymentStatus);
  }
  if (filterKey === "unpaid") {
    return !lifecycle.paymentStatus || ["pending", "unpaid", "partial", "partial_paid", "advance_paid", "non_completed"].includes(lifecycle.paymentStatus);
  }
  if (filterKey === "delivery_pending") {
    if (!lifecycle.deliveryStatus) {
      return false;
    }
    return !["delivered", "completed", "cancelled", "canceled", "ready"].includes(lifecycle.deliveryStatus);
  }
  return true;
}

function buildEstimateStatusNote(row) {
  const statuses = [
    { title: "Job", value: row?.job_status || row?.jobStatus },
    { title: "Payment", value: row?.payment_status || row?.paymentStatus },
    { title: "Delivery", value: row?.delivery_status || row?.deliveryStatus },
  ];
  return statuses
    .filter((item) => String(item.value || "").trim().toLowerCase() === "completed")
    .map((item) => `${item.title}: Done`)
    .join(" • ");
}

export default function BusinessAutopilotSiteAdminChat({ headerTabs = null }) {
  const navigate = useNavigate();
  const confirm = useConfirm();
  const rootRef = useRef(null);
  const chatColRef = useRef(null);
  const headerBlockRef = useRef(null);
  const composerBlockRef = useRef(null);
  const [messages, setMessages] = useState([buildWelcomeMessage()]);
  const [viewportHeight, setViewportHeight] = useState(0);
  const [messageAreaHeight, setMessageAreaHeight] = useState(0);
  const [prompt, setPrompt] = useState("");
  const [editMobile, setEditMobile] = useState("");
  const [editClientName, setEditClientName] = useState("");
  const [editPaymentCompleted, setEditPaymentCompleted] = useState(false);
  const [editJobCompleted, setEditJobCompleted] = useState(false);
  const [editDeliveryCompleted, setEditDeliveryCompleted] = useState(false);
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
  const [qeTemplateSize, setQeTemplateSize] = useState("4in");
  const [assignModalOpen, setAssignModalOpen] = useState(false);
  const [assignQuery, setAssignQuery] = useState("");
  const [assigningEstimateId, setAssigningEstimateId] = useState(null);
  const [selectedAssignUser, setSelectedAssignUser] = useState(null);
  const [orgUsers, setOrgUsers] = useState([]);
  const [orgUsersLoading, setOrgUsersLoading] = useState(false);
  const [assignSaving, setAssignSaving] = useState(false);
  const [assignSearchOpen, setAssignSearchOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyRows, setHistoryRows] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyEstimateNumber, setHistoryEstimateNumber] = useState("");
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteConfirmEstimate, setDeleteConfirmEstimate] = useState(null);
  const [deleteReason, setDeleteReason] = useState("");
  const demoTimersRef = useRef([]);
  const tutorialAnimatingRef = useRef(false);
  const listRef = useRef(null);
  const composerRef = useRef(null);

  useEffect(() => {
    if (typeof window === "undefined") {
      return undefined;
    }

    let frameId = 0;
    let resizeObservers = [];

    const updateLayoutHeights = () => {
      const root = rootRef.current;
      const chatCol = chatColRef.current;
      const headerBlock = headerBlockRef.current;
      const composerBlock = composerBlockRef.current;
      if (!root) {
        return;
      }
      const rect = root.getBoundingClientRect();
      const nextHeight = Math.max(520, Math.floor(window.innerHeight - rect.top - 12));
      setViewportHeight((prev) => (Math.abs(prev - nextHeight) > 1 ? nextHeight : prev));

      if (chatCol && headerBlock && composerBlock) {
        const availableHeight = Math.floor(
          chatCol.clientHeight
          - headerBlock.offsetHeight
          - composerBlock.offsetHeight
          - 8
        );
        const nextMessageHeight = Math.max(180, availableHeight);
        setMessageAreaHeight((prev) => (Math.abs(prev - nextMessageHeight) > 1 ? nextMessageHeight : prev));
      }
    };

    const scheduleUpdate = () => {
      if (frameId) {
        window.cancelAnimationFrame(frameId);
      }
      frameId = window.requestAnimationFrame(updateLayoutHeights);
    };

    scheduleUpdate();
    window.addEventListener("resize", scheduleUpdate, { passive: true });

    if (typeof ResizeObserver !== "undefined") {
      const observer = new ResizeObserver(scheduleUpdate);
      [rootRef.current?.parentElement, chatColRef.current, headerBlockRef.current, composerBlockRef.current]
        .filter(Boolean)
        .forEach((node) => observer.observe(node));
      resizeObservers = [observer];
    }

    const timeoutId = window.setTimeout(scheduleUpdate, 120);

    return () => {
      if (frameId) {
        window.cancelAnimationFrame(frameId);
      }
      window.clearTimeout(timeoutId);
      window.removeEventListener("resize", scheduleUpdate);
      resizeObservers.forEach((observer) => observer.disconnect());
    };
  }, []);

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
    return () => {
      demoTimersRef.current.forEach((timer) => window.clearTimeout(timer));
      demoTimersRef.current = [];
      tutorialAnimatingRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (activeModule !== "quick-estimate") {
      return undefined;
    }
    let ignore = false;
    async function loadEstimates() {
      setEstimateLoading(true);
      setEstimateTableNotice("");
      try {
        const [estimateData, settingsData, usersData] = await Promise.all([
          apiFetch("/api/business-autopilot/quick-estimates/"),
          apiFetch("/api/business-autopilot/quick-estimate-settings/"),
          apiFetch("/api/business-autopilot/users"),
        ]);
        if (!ignore) {
          setEstimateRows(Array.isArray(estimateData?.quick_estimates) ? estimateData.quick_estimates : []);
          setQeHeaderText(String(settingsData?.settings?.headerText || ""));
          setQeTemplateSize(String(settingsData?.settings?.templateSize || "4in").toLowerCase() === "3in" ? "3in" : "4in");
        setOrgUsers(filterAssignableOrgUsers(usersData?.users));
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

  function resetEditEstimate(nextNotice = "") {
    setEditingEstimate(null);
    setPrompt("");
    setEditMobile("");
    setEditClientName("");
    setEditPaymentCompleted(false);
    setEditJobCompleted(false);
    setEditDeliveryCompleted(false);
    if (nextNotice) {
      setNotice(nextNotice);
    }
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

  function getEstimateRowById(estimateId) {
    return estimateRows.find((row) => Number(row?.id) === Number(estimateId)) || null;
  }

  function playQuickEstimateTutorialDemo() {
    if (tutorialAnimatingRef.current) {
      return;
    }
    const sampleText = "9876543210\nArun\n1. Letterhead Printing 100 GSM Bond Sheet 100 Nos Rs.950\n2. ID Card Printing Matte Finish 10 Nos Rs.1000";
    tutorialAnimatingRef.current = true;
    demoTimersRef.current.forEach((timer) => window.clearTimeout(timer));
    demoTimersRef.current = [];
    setMessages((prev) => [
      ...prev.filter((item) => !String(item?.action || "").startsWith("demo") && !String(item?.id || "").startsWith("site-admin-demo-")),
      buildQuickEstimateTutorialIntroMessage(),
    ]);
    setPrompt("");
    let charIndex = 0;
    const startTypingTimer = window.setTimeout(() => {
      const typeNext = () => {
        charIndex = Math.min(sampleText.length, charIndex + 2);
        setPrompt(sampleText.slice(0, charIndex));
        if (charIndex < sampleText.length) {
          const timer = window.setTimeout(typeNext, 55);
          demoTimersRef.current.push(timer);
          return;
        }
        const sendTimer = window.setTimeout(() => {
          setMessages((prev) => [
            ...prev,
            {
              id: "site-admin-demo-2",
              role: "user",
              text: sampleText,
            },
          ]);
          setPrompt("");
          const previewTimer = window.setTimeout(() => {
            setMessages((prev) => [...prev, buildQuickEstimateTutorialPreviewMessage()]);
            tutorialAnimatingRef.current = false;
          }, 5000);
          demoTimersRef.current.push(previewTimer);
        }, 650);
        demoTimersRef.current.push(sendTimer);
      };
      typeNext();
    }, 900);
    demoTimersRef.current.push(startTypingTimer);
  }

  const filteredOrgUsers = useMemo(() => {
    const search = assignQuery.trim().toLowerCase();
    const selectableUsers = filterAssignableOrgUsers(orgUsers);
    if (!search) {
      return selectableUsers;
    }
    return selectableUsers.filter((row) => (
      [row?.name, row?.email, row?.phone_number, row?.employeeId]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(search))
    ));
  }, [assignQuery, orgUsers]);

  async function handleSaveQeSettings() {
    setSettingsSaving(true);
    setNotice("");
    try {
      const data = await apiFetch("/api/business-autopilot/quick-estimate-settings/", {
        method: "PATCH",
        body: JSON.stringify({
          headerText: qeHeaderText,
          templateSize: qeTemplateSize,
        }),
      });
      setQeHeaderText(String(data?.settings?.headerText || ""));
      setQeTemplateSize(String(data?.settings?.templateSize || "4in").toLowerCase() === "3in" ? "3in" : "4in");
      setSettingsOpen(false);
      setNotice(String(data?.message || "Quick Estimate settings saved."));
      const previewEstimateIds = Array.from(new Set(
        messages
          .map((item) => Number(item?.quickEstimateId || 0))
          .filter((value) => value > 0),
      ));
      await Promise.all(previewEstimateIds.map(async (estimateId) => {
        try {
          const detail = await apiFetch(`/api/business-autopilot/quick-estimates/${estimateId}/`);
          if (detail?.quick_estimate) {
            upsertEstimateRow(detail.quick_estimate);
            updateEstimatePreview(estimateId, () => ({
              estimateNumber: String(detail.quick_estimate.estimate_number || ""),
              thermalPreviewHtml: String(detail.quick_estimate.thermal_preview_html || ""),
            }));
          }
        } catch {
          // Ignore per-preview refresh errors after saving settings.
        }
      }));
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

  function openAssignModal(estimateId) {
    setNotice("");
    setAssigningEstimateId(estimateId);
    setAssignQuery("");
    const currentEstimate = getEstimateRowById(estimateId);
    const matchedAssignedUser = currentEstimate?.assigned_user_id
      ? orgUsers.find((row) => (
        Number(row?.membership_id) === Number(currentEstimate.assigned_membership_id)
        || Number(row?.id) === Number(currentEstimate.assigned_user_id)
      ))
      : null;
    setSelectedAssignUser(
      currentEstimate?.assigned_user_id
        ? matchedAssignedUser || {
          id: currentEstimate.assigned_user_id,
          membership_id: currentEstimate.assigned_membership_id || null,
          name: currentEstimate.assigned_user_name || "",
          email: "",
          phone_number: "",
        }
        : null,
    );
    setAssignModalOpen(true);
    setAssignSearchOpen(false);
    if (filterAssignableOrgUsers(orgUsers).length) {
      return;
    }
    setOrgUsersLoading(true);
    apiFetch("/api/business-autopilot/users")
      .then((data) => {
        setOrgUsers(filterAssignableOrgUsers(data?.users));
      })
      .catch((error) => {
        setNotice(error?.message || "Unable to load org users right now.");
      })
      .finally(() => {
        setOrgUsersLoading(false);
      });
  }

  async function handleAssignEstimate(userRow = selectedAssignUser) {
    if (!assigningEstimateId || assignSaving) {
      return;
    }
    const estimateId = assigningEstimateId;
    setAssignSaving(true);
    setAssignSearchOpen(false);
    setNotice("");
    try {
      const data = await apiFetch(`/api/business-autopilot/quick-estimates/${estimateId}/`, {
        method: "PATCH",
        body: JSON.stringify({
          action: "assign",
          assigned_user_id: Number(userRow?.id) || null,
          assigned_membership_id: Number(userRow?.membership_id) || null,
        }),
      });
      if (data?.quick_estimate) {
        upsertEstimateRow({
          ...data.quick_estimate,
          assigned_user_id: data.quick_estimate.assigned_user_id || userRow.id,
          assigned_membership_id: data.quick_estimate.assigned_membership_id || userRow.membership_id || null,
          assigned_user_name: data.quick_estimate.assigned_user_name || userRow.name || userRow.email || "",
        });
        updateEstimatePreview(estimateId, (item) => ({
          thermalPreviewHtml: String(data.quick_estimate.thermal_preview_html || item.thermalPreviewHtml || ""),
        }));
      }
      const successMessage = String(data?.message || "Estimate assigned.");
      setAssignModalOpen(false);
      setAssigningEstimateId(null);
      setSelectedAssignUser(null);
      setAssignQuery("");
      setAssignSearchOpen(false);
      setNotice(successMessage);
      apiFetch("/api/business-autopilot/quick-estimates/")
        .then((rowsData) => {
          setEstimateRows(
            Array.isArray(rowsData?.quick_estimates)
              ? rowsData.quick_estimates.map((row) => (
                Number(row?.id) === Number(estimateId)
                  ? {
                    ...row,
                    assigned_user_id: row.assigned_user_id || userRow.id,
                    assigned_membership_id: row.assigned_membership_id || userRow.membership_id || null,
                    assigned_user_name: row.assigned_user_name || userRow.name || userRow.email || "",
                  }
                  : row
              ))
              : [],
          );
        })
        .catch(() => null);
    } catch (error) {
      setAssignSearchOpen(true);
      setNotice(error?.message || "Unable to assign this estimate right now.");
    } finally {
      setAssignSaving(false);
    }
  }

  async function handleClearSelectedAssignUser() {
    if (assignSaving || !selectedAssignUser) {
      return;
    }
    const confirmed = await confirm({
      title: "Remove Assigned User",
      message: "Remove the currently selected assigned user?",
      confirmText: "Yes",
      cancelText: "No",
      confirmVariant: "danger",
    });
    if (!confirmed) {
      return;
    }
    setSelectedAssignUser(null);
    setAssignQuery("");
    setAssignSearchOpen(false);
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
          thermal_preview_html: normalizeThermalPreviewHtml(estimate.thermal_preview_html || ""),
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
      setEditPaymentCompleted(String(estimate.payment_status || "").toLowerCase() === "completed");
      setEditJobCompleted(String(estimate.job_status || "").toLowerCase() === "completed");
      setEditDeliveryCompleted(String(estimate.delivery_status || "").toLowerCase() === "completed");
      appendAssistantMessage(
        {
          reply: `Quick Estimate ${estimate.estimate_number} loaded for editing. You can update mobile number, client name, and full item list now.`,
          action: "quick_estimate_edit_loaded",
          quick_estimate_id: estimate.id,
          estimate_number: estimate.estimate_number,
          thermal_preview_html: normalizeThermalPreviewHtml(estimate.thermal_preview_html || ""),
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
    setDeleteConfirmEstimate({
      id: estimateId,
      estimateNumber: estimateNumber || "this Quick Estimate",
    });
    setDeleteReason("");
    setDeleteConfirmOpen(true);
  }

  async function confirmDeleteEstimate() {
    const estimateId = deleteConfirmEstimate?.id;
    if (!estimateId || sending) {
      return;
    }
    const reason = String(deleteReason || "").trim();
    if (!reason) {
      setNotice("Please enter the cancel reason.");
      return;
    }
    setSending(true);
    setNotice("");
    try {
      const data = await apiFetch(`/api/business-autopilot/quick-estimates/${estimateId}/`, {
        method: "DELETE",
        body: JSON.stringify({ quick_estimate_id: estimateId, reason }),
      });
      if (data?.quick_estimate) {
        upsertEstimateRow(data.quick_estimate);
      }
      if (editingEstimate?.id === estimateId) {
        resetEditEstimate();
      }
      setNotice(String(data?.message || "Quick Estimate cancelled."));
    } catch (error) {
      const message = error?.message || "Unable to cancel this Quick Estimate right now.";
      setNotice(message);
      appendAssistantMessage({ reply: message, action: "error" }, message);
    } finally {
      setDeleteConfirmOpen(false);
      setDeleteConfirmEstimate(null);
      setDeleteReason("");
      setSending(false);
    }
  }

  async function handleReopenEstimate(row) {
    if (!row?.id || sending) {
      return;
    }
    setSending(true);
    setNotice("");
    try {
      const data = await apiFetch(`/api/business-autopilot/quick-estimates/${row.id}/`, {
        method: "PATCH",
        body: JSON.stringify({ action: "reopen" }),
      });
      if (data?.quick_estimate) {
        upsertEstimateRow(data.quick_estimate);
      }
      setNotice(String(data?.message || "Quick Estimate reopened."));
    } catch (error) {
      setNotice(error?.message || "Unable to reopen this Quick Estimate right now.");
    } finally {
      setSending(false);
    }
  }

  async function handleViewHistory(row) {
    if (!row?.id) {
      return;
    }
    setHistoryEstimateNumber(String(row.estimate_number || row.estimateNumber || ""));
    setHistoryOpen(true);
    setHistoryLoading(true);
    setHistoryRows([]);
    try {
      const data = await apiFetch(`/api/business-autopilot/quick-estimates/${row.id}/history/`);
      setHistoryRows(Array.isArray(data?.history) ? data.history : []);
    } catch (error) {
      setNotice(error?.message || "Unable to load estimate history right now.");
    } finally {
      setHistoryLoading(false);
    }
  }

  async function sendMessage(seedText = "") {
    const text = String(seedText || prompt || "").trim();
    if (!text || sending) {
      return;
    }
    if (!seedText) {
      const normalizedText = text.toLowerCase();
      if (["demo", "show demo", "tutorial", "show tutorial"].includes(normalizedText)) {
        setPrompt("");
        setNotice("");
        playQuickEstimateTutorialDemo();
        return;
      }
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
            payment_status: editPaymentCompleted ? "completed" : "non_completed",
            job_status: editJobCompleted ? "completed" : "non_completed",
            delivery_status: editDeliveryCompleted ? "completed" : "non_completed",
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
        setEstimateRows((prev) => prev.map((row) => (
          Number(row?.id) === Number(data.quick_estimate_id)
            ? {
              ...row,
              mobile: editMobile,
              client_name: editClientName,
              payment_status: editPaymentCompleted ? "completed" : "non_completed",
              job_status: editJobCompleted ? "completed" : "non_completed",
              delivery_status: editDeliveryCompleted ? "completed" : "non_completed",
            }
            : row
        )));
        updateEstimatePreview(data.quick_estimate_id, () => ({
          estimateNumber: String(data?.estimate_number || editingEstimate.estimateNumber || ""),
          thermalPreviewHtml: normalizeThermalPreviewHtml(data?.thermal_preview_html || ""),
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
        resetEditEstimate();
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
    resetEditEstimate();
    if (module.ready) {
      setNotice("");
      setPrompt("");
      return;
    }
    setPrompt("");
    setNotice(`${module.label} chat module is not connected yet. Quick Estimate is ready now.`);
  }

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
  const qeHeaderTextCount = countPlainTextFromHtml(qeHeaderText);
  const pageHeightStyle = viewportHeight > 0
    ? { height: `${viewportHeight}px`, minHeight: `${viewportHeight}px`, maxHeight: `${viewportHeight}px` }
    : undefined;
  const messageAreaStyle = messageAreaHeight > 0
    ? { height: `${messageAreaHeight}px`, minHeight: `${messageAreaHeight}px`, maxHeight: `${messageAreaHeight}px` }
    : undefined;

  return (
    <div ref={rootRef} className="ba-assistant ba-assistant--page ba-site-admin-chat" style={pageHeightStyle}>
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
          <section ref={chatColRef} className="ba-site-admin-chat__chat-col">
            <div ref={headerBlockRef} className="ba-site-admin-chat__chat-head">
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
            </div>

            <div className="ba-assistant__messages ba-assistant__messages--full" ref={listRef} style={messageAreaStyle}>
              {messages.map((item) => (
                <div key={item.id} className={`ba-assistant__message ba-assistant__message--${item.role}`}>
                  {item.role === "assistant" ? <SiteAdminAvatar /> : <UserAvatar />}
                  <div className={`ba-assistant__bubble ba-assistant__bubble--${item.role}`}>
                    <div>{item.text}</div>
                    {item.thermalPreviewHtml ? (
                      <div className="ba-site-admin-chat__preview-card">
                        <div className="ba-site-admin-chat__preview-head">
                          <strong>{item.estimateNumber || "Quick Estimate"}</strong>
                          <span>Thermal Preview</span>
                        </div>
                        <iframe
                          title={item.estimateNumber || "Quick Estimate Preview"}
                          className="ba-site-admin-chat__preview-frame"
                          srcDoc={getThemedThermalPreviewHtml(item.thermalPreviewHtml)}
                        />
                        {item.quickEstimateId ? (
                          <div className="ba-site-admin-chat__preview-actions ba-site-admin-chat__action-grid">
                            <button
                              type="button"
                              className="btn btn-sm btn-outline-secondary saas-org-icon-btn ba-site-admin-chat__action-btn ba-site-admin-chat__action-btn--view"
                              onClick={() => handleViewEstimate(item.quickEstimateId)}
                              title="View Estimate"
                              aria-label="View Estimate"
                              disabled={sending}
                            >
                              <i className="bi bi-eye" aria-hidden="true" />
                            </button>
                            <button
                              type="button"
                              className="btn btn-sm btn-outline-success saas-org-icon-btn ba-site-admin-chat__action-btn ba-site-admin-chat__action-btn--edit"
                              onClick={() => handleEditEstimate(item.quickEstimateId)}
                              title="Edit Estimate"
                              aria-label="Edit Estimate"
                              disabled={sending}
                            >
                              <i className="bi bi-pencil" aria-hidden="true" />
                            </button>
                            <button
                              type="button"
                              className="btn btn-sm btn-outline-success saas-org-icon-btn ba-site-admin-chat__action-btn ba-site-admin-chat__action-btn--share"
                              onClick={() => {
                                const row = getEstimateRowById(item.quickEstimateId);
                                if (row) {
                                  handleShareEstimate(row);
                                }
                              }}
                              title="Share on WhatsApp"
                              aria-label="Share on WhatsApp"
                              disabled={sending || !getEstimateRowById(item.quickEstimateId)}
                            >
                              <i className="bi bi-whatsapp" aria-hidden="true" />
                            </button>
                            <button
                              type="button"
                              className="btn btn-sm btn-outline-secondary saas-org-icon-btn ba-site-admin-chat__action-btn ba-site-admin-chat__action-btn--print"
                              onClick={() => {
                                const row = getEstimateRowById(item.quickEstimateId);
                                if (row) {
                                  handlePrintEstimate(row);
                                }
                              }}
                              title="Print Estimate"
                              aria-label="Print Estimate"
                              disabled={sending || !getEstimateRowById(item.quickEstimateId)}
                            >
                              <i className="bi bi-printer" aria-hidden="true" />
                            </button>
                            <button
                              type="button"
                              className="btn btn-sm btn-outline-danger saas-org-icon-btn ba-site-admin-chat__action-btn ba-site-admin-chat__action-btn--delete"
                              onClick={() => handleDeleteEstimate(item.quickEstimateId, item.estimateNumber)}
                              title="Delete Estimate"
                              aria-label="Delete Estimate"
                              disabled={sending}
                            >
                              <i className="bi bi-trash" aria-hidden="true" />
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

            <form ref={composerBlockRef} className="ba-assistant__composer" onSubmit={handleSubmit}>
              {notice ? <div className="ba-assistant__setup-note">{notice}</div> : null}
              {editingEstimate ? (
                <>
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
                  <div className="ba-site-admin-chat__status-grid">
                    <label className="form-check form-switch ba-site-admin-chat__status-switch">
                      <input
                        type="checkbox"
                        className="form-check-input"
                        checked={editPaymentCompleted}
                        onChange={(event) => setEditPaymentCompleted(event.target.checked)}
                        disabled={sending}
                      />
                      <span className="ba-site-admin-chat__status-switch-copy">
                        <strong>Payment Status</strong>
                        <small>{editPaymentCompleted ? "Completed" : "Pending"}</small>
                      </span>
                    </label>
                    <label className="form-check form-switch ba-site-admin-chat__status-switch">
                      <input
                        type="checkbox"
                        className="form-check-input"
                        checked={editJobCompleted}
                        onChange={(event) => setEditJobCompleted(event.target.checked)}
                        disabled={sending}
                      />
                      <span className="ba-site-admin-chat__status-switch-copy">
                        <strong>Job Status</strong>
                        <small>{editJobCompleted ? "Completed" : "Pending"}</small>
                      </span>
                    </label>
                    <label className="form-check form-switch ba-site-admin-chat__status-switch">
                      <input
                        type="checkbox"
                        className="form-check-input"
                        checked={editDeliveryCompleted}
                        onChange={(event) => setEditDeliveryCompleted(event.target.checked)}
                        disabled={sending}
                      />
                      <span className="ba-site-admin-chat__status-switch-copy">
                        <strong>Delivery Status</strong>
                        <small>{editDeliveryCompleted ? "Completed" : "Pending"}</small>
                      </span>
                    </label>
                  </div>
                </>
              ) : null}
              <div className={`ba-assistant__composer-row ${editingEstimate ? "ba-site-admin-chat__composer-row--editing" : ""}`}>
                <div className="ba-assistant__composer-input-col">
                  <textarea
                    ref={composerRef}
                    className="form-control ba-assistant__textarea"
                    rows={4}
                    maxLength={280}
                    value={prompt}
                      onChange={(event) => setPrompt(event.target.value)}
                      placeholder={
                        estimateModuleActive
                          ? editingEstimate
                            ? `Update ${editingEstimate.estimateNumber} item details and send...`
                          : 'For tutorial, type "Demo" here. Or share the estimate details directly.'
                        : "Select a ready module to start Site Admin chat..."
                      }
                    disabled={sending || !estimateModuleActive}
                    spellCheck={false}
                    aria-label="Site Admin message input"
                  />
                </div>
                <div className={`ba-assistant__composer-actions ${editingEstimate ? "ba-site-admin-chat__composer-actions--editing" : ""}`}>
                  <button
                    type="submit"
                    className="btn btn-primary ba-assistant__send-btn ba-site-admin-chat__cta-btn"
                    disabled={sending || !estimateModuleActive}
                  >
                    {editingEstimate ? "Save" : "Send"}
                  </button>
                  {editingEstimate ? (
                    <button
                      type="button"
                      className="btn btn-outline-light ba-site-admin-chat__composer-cancel ba-site-admin-chat__cta-btn"
                      onClick={() => resetEditEstimate("Edit cancelled.")}
                      disabled={sending}
                    >
                      Cancel
                    </button>
                  ) : null}
                </div>
              </div>
            </form>
          </section>

          <aside className="ba-site-admin-chat__table-col">
            <div className="ba-site-admin-chat__table-card">
              <div className="ba-site-admin-chat__table-head">
                <div>
                  <div className="ba-site-admin-chat__table-title">Quick Estimate List</div>
                </div>
                <div className="d-flex align-items-center gap-2">
                  <button
                    type="button"
                    className="btn btn-primary ba-site-admin-chat__top-btn ba-site-admin-chat__cta-btn order-1"
                    onClick={() => handleQuickChip("QE Create")}
                    disabled={!estimateModuleActive || sending}
                  >
                    New QE
                  </button>
                  <button
                    type="button"
                    className="btn btn-outline-light ba-site-admin-chat__top-btn ba-site-admin-chat__cta-btn order-2"
                    onClick={() => setSettingsOpen(true)}
                    disabled={!estimateModuleActive || sending}
                  >
                    QE Setting
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
                      <th className="text-center ba-site-admin-chat__sno-col">S.No</th>
                      <th>Estimate</th>
                      <th>Date</th>
                      <th>Status</th>
                      <th className="text-end">Amount</th>
                      <th className="text-end table-actions">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {estimateLoading ? (
                      <tr>
                        <td colSpan={6} className="text-center py-4 text-secondary">Loading Quick Estimates...</td>
                      </tr>
                    ) : pagedEstimateRows.length ? (
                      pagedEstimateRows.map((row, index) => (
                        <tr key={row.id}>
                          <td className="text-center text-secondary fw-semibold ba-site-admin-chat__sno-col">
                            {(safeEstimatePage - 1) * TABLE_PAGE_SIZE + index + 1}
                          </td>
                          <td>
                            <div className="ba-site-admin-chat__estimate-meta">
                              <strong>{row.estimate_number || "-"}</strong>
                              <span>{row.client_name || "-"}</span>
                              <small>{row.mobile || "-"}</small>
                            </div>
                          </td>
                          <td>
                            <div className="ba-site-admin-chat__estimate-meta ba-site-admin-chat__estimate-meta--compact">
                              <strong>{formatDateLabel(row.created_at)}</strong>
                              <small>Created By: {getEstimateCreatedByLabel(row)}</small>
                              <button
                                type="button"
                                className="ba-site-admin-chat__inline-link"
                                onClick={() => openAssignModal(row.id)}
                              >
                                {row.assigned_user_name ? `Assigned: ${row.assigned_user_name}` : "Assign"}
                              </button>
                            </div>
                          </td>
                          <td>
                            <div className="ba-site-admin-chat__status-stack">
                              <span className="ba-site-admin-chat__status-pill">
                                {String(row.status || "created").replace(/_/g, " ")}
                              </span>
                              <small className="ba-site-admin-chat__status-note">{buildEstimateStatusNote(row)}</small>
                            </div>
                          </td>
                          <td className="text-end fw-semibold">{formatDisplayCurrency(row.total_amount || row.subtotal)}</td>
                          <td className="text-end table-actions">
                            <div className="ba-site-admin-chat__action-grid">
                              <button
                                type="button"
                                className="btn btn-sm btn-outline-secondary saas-org-icon-btn ba-site-admin-chat__action-btn ba-site-admin-chat__action-btn--view"
                                onClick={() => handleViewEstimate(row.id)}
                                title="View Estimate"
                                aria-label="View Estimate"
                              >
                                <i className="bi bi-eye" aria-hidden="true" />
                              </button>
                              <button
                                type="button"
                                className="btn btn-sm btn-outline-success saas-org-icon-btn ba-site-admin-chat__action-btn ba-site-admin-chat__action-btn--edit"
                                onClick={() => handleEditEstimate(row.id)}
                                title="Edit Estimate"
                                aria-label="Edit Estimate"
                              >
                                <i className="bi bi-pencil" aria-hidden="true" />
                              </button>
                              <button
                                type="button"
                                className="btn btn-sm btn-outline-success saas-org-icon-btn ba-site-admin-chat__action-btn ba-site-admin-chat__action-btn--share"
                                onClick={() => handleShareEstimate(row)}
                                title="Share Estimate"
                                aria-label="Share Estimate"
                              >
                                <i className="bi bi-whatsapp" aria-hidden="true" />
                              </button>
                              <button
                                type="button"
                                className="btn btn-sm btn-outline-secondary saas-org-icon-btn ba-site-admin-chat__action-btn ba-site-admin-chat__action-btn--print"
                                onClick={() => handlePrintEstimate(row)}
                                title="Print Estimate"
                                aria-label="Print Estimate"
                              >
                                <i className="bi bi-printer" aria-hidden="true" />
                              </button>
                              <button
                                type="button"
                                className="btn btn-sm btn-outline-secondary saas-org-icon-btn ba-site-admin-chat__action-btn ba-site-admin-chat__action-btn--history"
                                onClick={() => handleViewHistory(row)}
                                title="Estimate History"
                                aria-label="Estimate History"
                              >
                                <i className="bi bi-clock-history" aria-hidden="true" />
                              </button>
                              {String(row.status || "").toLowerCase() === "cancelled" ? (
                                <button
                                  type="button"
                                  className="btn btn-sm btn-outline-secondary saas-org-icon-btn ba-site-admin-chat__action-btn ba-site-admin-chat__action-btn--history"
                                  onClick={() => handleReopenEstimate(row)}
                                  title="Reopen Estimate"
                                  aria-label="Reopen Estimate"
                                >
                                  <i className="bi bi-arrow-clockwise" aria-hidden="true" />
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  className="btn btn-sm btn-outline-danger saas-org-icon-btn ba-site-admin-chat__action-btn ba-site-admin-chat__action-btn--delete"
                                  onClick={() => handleDeleteEstimate(row.id, row.estimate_number)}
                                  title="Cancel Estimate"
                                  aria-label="Cancel Estimate"
                                >
                                  <i className="bi bi-x-circle" aria-hidden="true" />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={6} className="text-center py-4 text-secondary">No Quick Estimates found for this filter.</td>
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
            <TinyHtmlEditor
              beforeEditor={(
                <div className="mb-3">
                  <label className="form-label fw-semibold" htmlFor="qeTemplateSize">Bill Template Size</label>
                  <select
                    id="qeTemplateSize"
                    className="form-select"
                    value={qeTemplateSize}
                    onChange={(event) => setQeTemplateSize(event.target.value === "3in" ? "3in" : "4in")}
                  >
                    <option value="3in">3in Thermal</option>
                    <option value="4in">4in Thermal</option>
                  </select>
                </div>
              )}
              label=""
              value={qeHeaderText}
              onChange={(value) => setQeHeaderText(String(value || ""))}
              placeholder="Company name, address, mobile details enter pannunga"
              minHeight={180}
              maxChars={200}
            />
            <div className="ba-site-admin-chat__settings-meta">
              <span>Character limit: 200</span>
              <strong>{qeHeaderTextCount}/200</strong>
            </div>
            <div className="ba-site-admin-chat__modal-actions">
              <button
                type="button"
                className="btn btn-outline-light ba-site-admin-chat__modal-btn ba-site-admin-chat__cta-btn"
                onClick={() => setSettingsOpen(false)}
                disabled={settingsSaving}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary ba-site-admin-chat__modal-btn ba-site-admin-chat__cta-btn"
                onClick={handleSaveQeSettings}
                disabled={settingsSaving}
              >
                {settingsSaving ? "Saving..." : "Save Setting"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {assignModalOpen ? (
        <div className="ba-site-admin-chat__modal-overlay" onClick={() => !assignSaving && setAssignModalOpen(false)}>
          <div className="ba-site-admin-chat__modal" onClick={(event) => event.stopPropagation()}>
            <div className="ba-site-admin-chat__modal-head">
              <div>
                <div className="ba-site-admin-chat__modal-title">Assign Estimate</div>
                <div className="ba-site-admin-chat__modal-subtitle">Select the org user who will follow this bill.</div>
              </div>
              <button
                type="button"
                className="ba-assistant__close d-inline-flex align-items-center justify-content-center"
                aria-label="Close assign popup"
                onClick={() => setAssignModalOpen(false)}
                disabled={assignSaving}
              >
                <i className="bi bi-x-lg" aria-hidden="true" />
              </button>
            </div>
            <div className="crm-inline-suggestions-wrap">
              <input
                type="search"
                className="form-control mb-0"
                placeholder="Search org user..."
                value={assignQuery}
                onFocus={() => setAssignSearchOpen(true)}
                onClick={() => setAssignSearchOpen(true)}
                onBlur={() => window.setTimeout(() => setAssignSearchOpen(false), 120)}
                onChange={(event) => {
                  setAssignQuery(event.target.value);
                  setAssignSearchOpen(true);
                }}
                disabled={assignSaving}
              />
              {assignSearchOpen ? (
                <div className="crm-inline-suggestions">
                  <div className="crm-inline-suggestions__group">
                    <div className="crm-inline-suggestions__title">Users</div>
                    {orgUsersLoading ? (
                      <div className="crm-inline-suggestions__item">
                        <span className="crm-inline-suggestions__item-main">Loading users...</span>
                      </div>
                    ) : filteredOrgUsers.length ? (
                      filteredOrgUsers.map((row) => (
                        <button
                          key={row.membership_id || row.id}
                          type="button"
                          className={`crm-inline-suggestions__item ${Number(selectedAssignUser?.id) === Number(row?.id) ? "is-selected" : ""}`}
                          onMouseDown={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            setSelectedAssignUser(row);
                            setAssignQuery(String(row?.name || row?.email || ""));
                            setAssignSearchOpen(false);
                          }}
                          disabled={assignSaving}
                        >
                          <span className="crm-inline-suggestions__item-main">{row.name || row.email || `User ${row.id}`}</span>
                          <span className="crm-inline-suggestions__item-sub">
                            {[row.email, row.phone_number].filter(Boolean).join(" • ") || row.employeeId || ""}
                          </span>
                        </button>
                      ))
                    ) : (
                      <div className="crm-inline-suggestions__item">
                        <span className="crm-inline-suggestions__item-main">No users found</span>
                      </div>
                    )}
                  </div>
                </div>
              ) : null}
            </div>
            {selectedAssignUser ? (
              <div className="ba-site-admin-chat__assign-selection">
                <span className="d-inline-flex align-items-center gap-2 wz-selected-chip">
                  <span>{selectedAssignUser.name || selectedAssignUser.email || `User ${selectedAssignUser.id}`}</span>
                  <button
                    type="button"
                    className="d-inline-flex align-items-center justify-content-center wz-selected-chip-remove"
                    data-no-delete-confirm="true"
                    onClick={handleClearSelectedAssignUser}
                    disabled={assignSaving}
                    aria-label="Clear selected user"
                  >
                    <i className="bi bi-x-lg" aria-hidden="true" />
                  </button>
                </span>
              </div>
            ) : null}
            <div className="ba-site-admin-chat__modal-actions">
              <button
                type="button"
                className="btn btn-outline-light ba-site-admin-chat__modal-btn ba-site-admin-chat__cta-btn"
                onClick={() => {
                  setAssignModalOpen(false);
                  setSelectedAssignUser(null);
                  setAssignQuery("");
                  setAssigningEstimateId(null);
                  setAssignSearchOpen(false);
                }}
                disabled={assignSaving}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary ba-site-admin-chat__modal-btn ba-site-admin-chat__cta-btn"
                onClick={() => handleAssignEstimate(selectedAssignUser)}
                disabled={assignSaving}
              >
                {assignSaving ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {historyOpen ? (
        <div className="ba-site-admin-chat__modal-overlay" onClick={() => setHistoryOpen(false)}>
          <div className="ba-site-admin-chat__modal" onClick={(event) => event.stopPropagation()}>
            <div className="ba-site-admin-chat__modal-head">
              <div>
                <div className="ba-site-admin-chat__modal-title">Estimate History</div>
                <div className="ba-site-admin-chat__modal-subtitle">{historyEstimateNumber || "Quick Estimate"} edit and assign records.</div>
              </div>
              <button
                type="button"
                className="ba-assistant__close d-inline-flex align-items-center justify-content-center"
                aria-label="Close history popup"
                onClick={() => setHistoryOpen(false)}
              >
                <i className="bi bi-x-lg" aria-hidden="true" />
              </button>
            </div>
            <div className="ba-site-admin-chat__history-list">
              {historyLoading ? (
                <div className="crm-inline-suggestions__item">
                  <span className="crm-inline-suggestions__item-main">Loading history...</span>
                </div>
              ) : historyRows.length ? (
                <div className="table-responsive">
                  <table className="table table-sm align-middle mb-0">
                    <thead>
                      <tr>
                        <th>S.No</th>
                        <th>Date and Time</th>
                        <th>Details</th>
                        <th>Edit By</th>
                      </tr>
                    </thead>
                    <tbody>
                      {historyRows.map((row, index) => (
                        <tr key={row.id}>
                          <td>{index + 1}</td>
                          <td>{formatDateTimeLabel(row.created_at)}</td>
                          <td>{row.details || "-"}</td>
                          <td>{row.edit_by || "-"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="crm-inline-suggestions__item">
                  <span className="crm-inline-suggestions__item-main">No history found</span>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}
      {deleteConfirmOpen ? (
        <div className="ba-site-admin-chat__modal-overlay" onClick={() => !sending && setDeleteConfirmOpen(false)}>
          <div className="ba-site-admin-chat__modal ba-site-admin-chat__modal--confirm" onClick={(event) => event.stopPropagation()}>
            <div className="ba-site-admin-chat__modal-head">
              <div>
                <div className="ba-site-admin-chat__modal-title">Delete Estimate</div>
                <div className="ba-site-admin-chat__modal-subtitle">
                  Cancel {deleteConfirmEstimate?.estimateNumber || "this Quick Estimate"}?
                </div>
              </div>
              <button
                type="button"
                className="ba-assistant__close d-inline-flex align-items-center justify-content-center"
                aria-label="Close delete popup"
                onClick={() => setDeleteConfirmOpen(false)}
                disabled={sending}
              >
                <i className="bi bi-x-lg" aria-hidden="true" />
              </button>
            </div>
            <div className="mb-3">
              <label className="form-label fw-semibold" htmlFor="qeCancelReason">Reason</label>
              <textarea
                id="qeCancelReason"
                className="form-control"
                rows={3}
                value={deleteReason}
                onChange={(event) => setDeleteReason(event.target.value)}
                placeholder="Enter cancel reason"
                disabled={sending}
              />
            </div>
            <div className="ba-site-admin-chat__modal-actions">
              <button
                type="button"
                className="btn btn-outline-secondary"
                onClick={() => setDeleteConfirmOpen(false)}
                disabled={sending}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-danger"
                onClick={confirmDeleteEstimate}
                disabled={sending}
              >
                {sending ? "Cancelling..." : "Cancel Estimate"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
