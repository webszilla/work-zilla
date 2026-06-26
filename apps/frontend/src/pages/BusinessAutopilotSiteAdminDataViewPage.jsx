import { Link, useLocation, useNavigate } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "../lib/api.js";

const STATUS_TABS = [
  { key: "today", label: "Today" },
  { key: "yesterday", label: "Yesterday" },
  { key: "all", label: "All" },
  { key: "paid", label: "Paid" },
  { key: "unpaid", label: "Unpaid" },
  { key: "pending_job", label: "Pending Job" },
  { key: "delivery_pending", label: "Delivery Pending" },
  { key: "cancelled", label: "Cancel" },
];

const CONTACT_ESTIMATE_PAGE_SIZE = 5;
const QUICK_ESTIMATES_COLLECTION_API = "/api/business-autopilot/quick-estimates/";

function getPaymentModeLabel(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "online") {
    return "Online";
  }
  if (normalized === "cash") {
    return "Cash";
  }
  return "";
}

function resolvePaymentStatusLabel(row) {
  if (!isCompletedProgress(row?.payment_status)) {
    return "Pending";
  }
  const paymentModeLabel = getPaymentModeLabel(row?.payment_mode);
  return paymentModeLabel ? `Done (${paymentModeLabel})` : "Done";
}

function readImageFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Unable to read selected image."));
    reader.readAsDataURL(file);
  });
}

function dataUrlToFile(dataUrl, filename = "payment-proof.png") {
  const text = String(dataUrl || "");
  const match = text.match(/^data:([^;,]+);base64,(.+)$/);
  if (!match) {
    return null;
  }
  const mimeType = match[1] || "image/png";
  const binary = atob(match[2] || "");
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  const extension = mimeType.split("/")[1] || "png";
  return new File([bytes], filename.endsWith(`.${extension}`) ? filename : `${filename}.${extension}`, { type: mimeType });
}

async function readImageFilesAsDataUrls(files) {
  const imageFiles = Array.from(files || []).filter((file) => String(file?.type || "").startsWith("image/"));
  if (!imageFiles.length) {
    return [];
  }
  return Promise.all(imageFiles.map((file) => readImageFileAsDataUrl(file)));
}

function normalizePaymentProofEntries(row) {
  const rawEntries = Array.isArray(row?.payment_proof_entries) ? row.payment_proof_entries : [];
  if (rawEntries.length) {
    return rawEntries
      .map((item) => ({
        image: String(item?.image || "").trim(),
        paid_date: String(item?.paid_date || item?.paidDate || "").trim(),
      }))
      .filter((item) => item.image);
  }
  const rawList = Array.isArray(row?.payment_proof_images) ? row.payment_proof_images : [];
  if (rawList.length) {
    return rawList.map((item) => ({ image: String(item || "").trim(), paid_date: "" })).filter((item) => item.image);
  }
  const single = String(row?.payment_proof_image || "").trim();
  return single ? [{ image: single, paid_date: "" }] : [];
}

function SiteAdminHeaderTabs() {
  const location = useLocation();
  const pathname = String(location.pathname || "");
  const isAssistantActive = pathname === "/assistant" || pathname.endsWith("/business-autopilot/assistant");
  const isSiteAdminActive = pathname.includes("/site-admin");

  return (
    <div className="ba-assistant-page-tabs__bar">
      <Link to="/assistant" className={`ba-assistant-page-tabs__tab ${isAssistantActive ? "is-active" : ""}`}>
        AI Assistant
      </Link>
      <Link to="/site-admin" className={`ba-assistant-page-tabs__tab ${isSiteAdminActive ? "is-active" : ""}`}>
        Site Admin
      </Link>
    </div>
  );
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

function formatCurrencyText(value) {
  const numeric = Number.parseFloat(String(value || "0").replace(/,/g, ""));
  if (!Number.isFinite(numeric)) {
    return "-";
  }
  return Number.isInteger(numeric) ? `Rs.${numeric}` : `Rs.${numeric.toFixed(2).replace(/0+$/, "").replace(/\.$/, "")}`;
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

function isYesterdayDate(value) {
  if (!value) {
    return false;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return false;
  }
  const yesterday = new Date();
  yesterday.setHours(0, 0, 0, 0);
  yesterday.setDate(yesterday.getDate() - 1);
  return date.getFullYear() === yesterday.getFullYear()
    && date.getMonth() === yesterday.getMonth()
    && date.getDate() === yesterday.getDate();
}

function matchEstimateFilter(row, filterKey) {
  const paymentStatus = String(row?.payment_status || "").trim().toLowerCase();
  const jobStatus = String(row?.job_status || "").trim().toLowerCase();
  const deliveryStatus = String(row?.delivery_status || "").trim().toLowerCase();
  const estimateStatus = String(row?.status || "").trim().toLowerCase();
  if (filterKey === "paid") {
    return paymentStatus === "completed";
  }
  if (filterKey === "unpaid") {
    return paymentStatus !== "completed";
  }
  if (filterKey === "pending_job") {
    return !["completed", "done", "ready", "cancelled", "canceled"].includes(jobStatus);
  }
  if (filterKey === "delivery_pending") {
    return deliveryStatus !== "completed";
  }
  if (filterKey === "today") {
    return isTodayDate(row?.created_at);
  }
  if (filterKey === "yesterday") {
    return isYesterdayDate(row?.created_at);
  }
  if (filterKey === "cancelled") {
    return ["cancelled", "canceled"].includes(estimateStatus);
  }
  return true;
}

function isCompletedProgress(value) {
  return String(value || "").trim().toLowerCase() === "completed";
}

function buildContactEstimateStats(estimates) {
  const safeRows = Array.isArray(estimates) ? estimates : [];
  return {
    paid: safeRows.filter((row) => isCompletedProgress(row?.payment_status)).length,
    unpaid: safeRows.filter((row) => !isCompletedProgress(row?.payment_status)).length,
    pendingJob: safeRows.filter((row) => !["completed", "done", "ready", "cancelled", "canceled"].includes(String(row?.job_status || "").trim().toLowerCase())).length,
    deliveryPending: safeRows.filter((row) => !isCompletedProgress(row?.delivery_status)).length,
    total: safeRows.length,
  };
}

function formatCountLabel(value) {
  return String(Math.max(0, Number(value) || 0)).padStart(2, "0");
}

function getDateOnlyValue(value) {
  if (!value) {
    return "";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export default function BusinessAutopilotSiteAdminDataViewPage() {
  const navigate = useNavigate();
  const [viewMode, setViewMode] = useState("estimates");
  const [rows, setRows] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [contactsLoading, setContactsLoading] = useState(false);
  const [notice, setNotice] = useState("");
  const [contactNotice, setContactNotice] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [entityType, setEntityType] = useState("client");
  const [entityQuery, setEntityQuery] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [tableSearch, setTableSearch] = useState("");
  const [contactSaving, setContactSaving] = useState(false);
  const [editingContactId, setEditingContactId] = useState("");
  const [contactForm, setContactForm] = useState({ client_name: "", mobile: "" });
  const [contactDetailsModal, setContactDetailsModal] = useState(null);
  const [contactEstimateSearch, setContactEstimateSearch] = useState("");
  const [contactEstimatePage, setContactEstimatePage] = useState(1);
  const [contactEstimateStatusFilter, setContactEstimateStatusFilter] = useState("all");
  const [paymentModeFilter, setPaymentModeFilter] = useState("all");
  const [paymentModalRow, setPaymentModalRow] = useState(null);
  const [paymentModalMode, setPaymentModalMode] = useState("");
  const [paymentProofDraftEntries, setPaymentProofDraftEntries] = useState([]);
  const [paymentProofPaidDate, setPaymentProofPaidDate] = useState("");
  const [paymentProofError, setPaymentProofError] = useState("");
  const [paymentSaving, setPaymentSaving] = useState(false);
  const [inlineTooltip, setInlineTooltip] = useState(null);

  function openInlineTooltip(event, text) {
    if (typeof window === "undefined" || !text) {
      return;
    }
    const rect = event.currentTarget.getBoundingClientRect();
    const tooltipWidth = Math.min(220, Math.max(110, String(text).length * 7 + 20));
    setInlineTooltip({
      text,
      top: Math.max(12, rect.top - 42),
      left: Math.max(12, Math.min(window.innerWidth - tooltipWidth - 12, rect.left + (rect.width / 2) - (tooltipWidth / 2))),
      width: tooltipWidth,
    });
  }

  function closeInlineTooltip() {
    setInlineTooltip(null);
  }

  async function loadPaymentProofFromFiles(files) {
    try {
      const imageData = await readImageFilesAsDataUrls(files);
      if (!imageData.length) {
        setPaymentProofError("Please choose an image file only.");
        return false;
      }
      setPaymentProofDraftEntries((prev) => [
        ...prev,
        ...imageData.map((image) => ({ image, paid_date: paymentProofPaidDate })),
      ]);
      setPaymentProofError("");
      return true;
    } catch (error) {
      setPaymentProofError(error?.message || "Unable to read selected image.");
      return false;
    }
  }

  async function handlePaymentProofDrop(event) {
    event.preventDefault();
    event.stopPropagation();
    await loadPaymentProofFromFiles(event.dataTransfer?.files);
  }

  async function handlePaymentProofPaste(event) {
    const items = event.clipboardData?.items || [];
    const imageItem = Array.from(items).find((item) => String(item?.type || "").startsWith("image/"));
    if (!imageItem) {
      return;
    }
    event.preventDefault();
    const file = imageItem.getAsFile();
    if (!file) {
      return;
    }
    await loadPaymentProofFromFiles([file]);
  }

  async function handlePaymentProofFileChange(event) {
    await loadPaymentProofFromFiles(event.target.files);
    event.target.value = "";
  }

  useEffect(() => {
    if (!paymentModalRow || paymentModalMode !== "online" || typeof window === "undefined") {
      return undefined;
    }
    const handleWindowPaste = (event) => {
      handlePaymentProofPaste(event);
    };
    window.addEventListener("paste", handleWindowPaste);
    return () => {
      window.removeEventListener("paste", handleWindowPaste);
    };
  }, [paymentModalMode, paymentModalRow]);

  useEffect(() => {
    let ignore = false;
    async function load() {
      setLoading(true);
      setNotice("");
      try {
        const data = await apiFetch("/api/business-autopilot/quick-estimates/");
        if (!ignore) {
          setRows(Array.isArray(data?.quick_estimates) ? data.quick_estimates : []);
        }
      } catch (error) {
        if (!ignore) {
          setNotice(error?.message || "Unable to load Quick Estimate data.");
        }
      } finally {
        if (!ignore) {
          setLoading(false);
        }
      }
    }
    load();
    return () => {
      ignore = true;
    };
  }, []);

  async function loadContacts() {
    setContactsLoading(true);
    setContactNotice("");
    try {
      const data = await apiFetch("/api/business-autopilot/quick-estimate-contacts/");
      setContacts(Array.isArray(data?.contacts) ? data.contacts : []);
    } catch (error) {
      setContactNotice(error?.message || "Unable to load contact data.");
    } finally {
      setContactsLoading(false);
    }
  }

  async function openContactView() {
    setViewMode("contacts");
    setEditingContactId("");
    setContactForm({ client_name: "", mobile: "" });
    await loadContacts();
  }

  function openEstimateView() {
    setViewMode("estimates");
    setEditingContactId("");
    setContactForm({ client_name: "", mobile: "" });
    setContactNotice("");
  }

  function startEditContact(row) {
    setEditingContactId(String(row?.id || ""));
    setContactForm({
      client_name: String(row?.client_name || ""),
      mobile: String(row?.mobile || ""),
    });
    setContactNotice("");
  }

  function closeEditContact() {
    if (contactSaving) {
      return;
    }
    setEditingContactId("");
    setContactForm({ client_name: "", mobile: "" });
  }

  function openPaymentModal(row) {
    setPaymentModalRow(row);
    setPaymentModalMode(String(row?.payment_mode || "").trim().toLowerCase() || "cash");
    const nextEntries = normalizePaymentProofEntries(row);
    setPaymentProofDraftEntries(nextEntries);
    setPaymentProofError("");
    setPaymentProofPaidDate(String(nextEntries[0]?.paid_date || "").trim());
  }

  function closePaymentModal(force = false) {
    if (paymentSaving && !force) {
      return;
    }
    setPaymentModalRow(null);
    setPaymentModalMode("");
    setPaymentProofDraftEntries([]);
    setPaymentProofError("");
    setPaymentProofPaidDate("");
  }

  function closeContactDetailsModal() {
    setContactDetailsModal(null);
    setContactEstimateSearch("");
    setContactEstimatePage(1);
    setContactEstimateStatusFilter("all");
  }

  function openEstimateViewForContact(row) {
    const clientName = String(row?.client_name || "").trim();
    setViewMode("estimates");
    setStatusFilter("all");
    setEntityType("client");
    setEntityQuery(clientName);
    setTableSearch("");
    setFromDate("");
    setToDate("");
    closeContactDetailsModal();
  }

  async function saveContactEdit() {
    if (!editingContactId) {
      return;
    }
    setContactSaving(true);
    setContactNotice("");
    try {
      await apiFetch(`/api/business-autopilot/quick-estimate-contacts/${editingContactId}/`, {
        method: "PATCH",
        body: JSON.stringify({
          __action: "PATCH",
          ...contactForm,
        }),
      });
      setEditingContactId("");
      setContactForm({ client_name: "", mobile: "" });
      await Promise.all([
        loadContacts(),
        apiFetch("/api/business-autopilot/quick-estimates/").then((data) => {
          setRows(Array.isArray(data?.quick_estimates) ? data.quick_estimates : []);
        }),
      ]);
    } catch (error) {
      setContactNotice(error?.message || "Unable to update contact data.");
    } finally {
      setContactSaving(false);
    }
  }

  async function deleteContact(row) {
    const confirmed = window.confirm(`Delete contact data for ${row?.client_name || row?.mobile || "this client"}?`);
    if (!confirmed) {
      return;
    }
    setContactNotice("");
    try {
      await apiFetch(`/api/business-autopilot/quick-estimate-contacts/${row.id}/`, {
        method: "DELETE",
        body: JSON.stringify({ __action: "DELETE" }),
      });
      if (editingContactId === String(row.id)) {
        setEditingContactId("");
        setContactForm({ client_name: "", mobile: "" });
      }
      await loadContacts();
    } catch (error) {
      setContactNotice(error?.message || "Unable to delete contact data.");
    }
  }

  const entityOptions = useMemo(() => {
    const values = new Map();
    rows.forEach((row) => {
      const label = entityType === "user"
        ? String(row?.assigned_user_name || "").trim()
        : String(row?.client_name || "").trim();
      if (label) {
        values.set(label.toLowerCase(), label);
      }
    });
    return Array.from(values.values()).sort((left, right) => left.localeCompare(right));
  }, [entityType, rows]);

  const contactEstimateMap = useMemo(() => {
    const nextMap = new Map();
    rows.forEach((row) => {
      const key = String(row?.customer_id || "").trim();
      if (!key) {
        return;
      }
      if (!nextMap.has(key)) {
        nextMap.set(key, []);
      }
      nextMap.get(key).push(row);
    });
    return nextMap;
  }, [rows]);

  const filteredRows = useMemo(() => {
    const entityFilter = entityQuery.trim().toLowerCase();
    const search = tableSearch.trim().toLowerCase();
    return rows.filter((row) => {
      if (!matchEstimateFilter(row, statusFilter)) {
        return false;
      }
      const rowDate = getDateOnlyValue(row?.created_at);
      if (fromDate && (!rowDate || rowDate < fromDate)) {
        return false;
      }
      if (toDate && (!rowDate || rowDate > toDate)) {
        return false;
      }
      if (statusFilter === "paid" && paymentModeFilter !== "all") {
        if (String(row?.payment_mode || "").trim().toLowerCase() !== paymentModeFilter) {
          return false;
        }
      }
      if (entityFilter) {
        if (entityType === "user") {
          const employeeValue = String(row?.assigned_user_name || "").toLowerCase();
          if (!employeeValue.includes(entityFilter)) {
            return false;
          }
        } else {
          const clientValue = String(row?.client_name || "").toLowerCase();
          if (!clientValue.includes(entityFilter)) {
            return false;
          }
        }
      }
      if (!search) {
        return true;
      }
      const haystack = [
        row?.estimate_number,
        row?.client_name,
        row?.mobile,
        row?.assigned_user_name,
        row?.status,
        row?.payment_status,
        row?.delivery_status,
      ].map((value) => String(value || "").toLowerCase()).join(" ");
      return haystack.includes(search);
    });
  }, [entityQuery, entityType, fromDate, paymentModeFilter, rows, statusFilter, tableSearch, toDate]);

  const enrichedContacts = useMemo(() => contacts.map((row) => {
    const linkedRows = contactEstimateMap.get(String(row?.id || "").trim()) || [];
    return {
      ...row,
      linked_estimate_count: linkedRows.length || row?.linked_estimate_count || 0,
      linked_estimate_stats: buildContactEstimateStats(linkedRows),
      linked_estimates: linkedRows,
    };
  }), [contactEstimateMap, contacts]);

  const filteredContacts = useMemo(() => {
    const search = tableSearch.trim().toLowerCase();
    if (!search) {
      return enrichedContacts;
    }
    return enrichedContacts.filter((row) => {
      const haystack = [
        row?.client_name,
        row?.mobile,
        row?.email,
        row?.address,
      ].map((value) => String(value || "").toLowerCase()).join(" ");
      return haystack.includes(search);
    });
  }, [enrichedContacts, tableSearch]);

  const filteredEstimateTotal = useMemo(() => (
    filteredRows.reduce((sum, row) => {
      const numeric = Number.parseFloat(String(row?.total_amount || row?.subtotal || "0").replace(/,/g, ""));
      return sum + (Number.isFinite(numeric) ? numeric : 0);
    }, 0)
  ), [filteredRows]);

  const filteredContactEstimates = useMemo(() => {
    const estimates = Array.isArray(contactDetailsModal?.linked_estimates) ? contactDetailsModal.linked_estimates : [];
    const search = contactEstimateSearch.trim().toLowerCase();
    const statusFilteredRows = estimates.filter((row) => {
      if (contactEstimateStatusFilter === "paid") {
        return isCompletedProgress(row?.payment_status);
      }
      if (contactEstimateStatusFilter === "unpaid") {
        return !isCompletedProgress(row?.payment_status);
      }
      if (contactEstimateStatusFilter === "pending_job") {
        return !["completed", "done", "ready", "cancelled", "canceled"].includes(String(row?.job_status || "").trim().toLowerCase());
      }
      if (contactEstimateStatusFilter === "delivery_pending") {
        return !isCompletedProgress(row?.delivery_status);
      }
      return true;
    });
    if (!search) {
      return statusFilteredRows;
    }
    return statusFilteredRows.filter((row) => [
      row?.estimate_number,
      row?.client_name,
      row?.mobile,
      row?.assigned_user_name,
      row?.status,
      row?.payment_status,
      row?.job_status,
      row?.delivery_status,
      row?.total_amount,
    ].map((value) => String(value || "").toLowerCase()).join(" ").includes(search));
  }, [contactDetailsModal, contactEstimateSearch, contactEstimateStatusFilter]);

  const paginatedContactEstimates = useMemo(() => {
    const startIndex = (contactEstimatePage - 1) * CONTACT_ESTIMATE_PAGE_SIZE;
    return filteredContactEstimates.slice(startIndex, startIndex + CONTACT_ESTIMATE_PAGE_SIZE);
  }, [contactEstimatePage, filteredContactEstimates]);

  const contactEstimateTotalPages = Math.max(1, Math.ceil(filteredContactEstimates.length / CONTACT_ESTIMATE_PAGE_SIZE));

  useEffect(() => {
    if (contactEstimatePage > contactEstimateTotalPages) {
      setContactEstimatePage(contactEstimateTotalPages);
    }
  }, [contactEstimatePage, contactEstimateTotalPages]);

  useEffect(() => {
    if (fromDate && toDate && toDate < fromDate) {
      setToDate("");
    }
  }, [fromDate, toDate]);

  useEffect(() => {
    if (statusFilter !== "paid") {
      setPaymentModeFilter("all");
    }
  }, [statusFilter]);

  async function savePaymentUpdate() {
    if (!paymentModalRow?.id || paymentSaving) {
      return;
    }
    if (!paymentModalMode) {
      setPaymentProofError("Please choose cash or online payment mode.");
      return;
    }
    if (paymentModalMode === "online" && !paymentProofDraftEntries.length) {
      setPaymentProofError("Please upload the payment proof image.");
      return;
    }
    setPaymentSaving(true);
    setNotice("");
    try {
      const paymentEndpoint = paymentModalRow?.id
        ? `/api/business-autopilot/quick-estimates/${paymentModalRow.id}/`
        : QUICK_ESTIMATES_COLLECTION_API;
      const shouldUseMultipart = paymentModalMode === "online" && paymentProofDraftEntries.length > 0;
      const data = await apiFetch(paymentEndpoint, shouldUseMultipart ? (() => {
        const formData = new FormData();
        formData.append("__action", "PATCH");
        formData.append("quick_estimate_id", String(paymentModalRow.id || ""));
        formData.append("action", "payment");
        formData.append("payment_status", "completed");
        formData.append("payment_mode", paymentModalMode);
        const firstPaidDate = String(paymentProofDraftEntries[0]?.paid_date || "").trim();
        if (firstPaidDate) {
          formData.append("payment_paid_date", firstPaidDate);
        }
        paymentProofDraftEntries.forEach((entry, index) => {
          const file = dataUrlToFile(entry?.image, `payment-proof-${index + 1}`);
          if (file) {
            formData.append("payment_proof_files", file);
          }
        });
        return {
          method: "POST",
          body: formData,
        };
      })() : {
        method: "POST",
        body: JSON.stringify({
          __action: "PATCH",
          quick_estimate_id: paymentModalRow.id,
          action: "payment",
          payment_status: "completed",
          payment_mode: paymentModalMode,
          payment_proof_image: "",
          payment_proof_images: [],
          payment_proof_entries: [],
        }),
      });
      const updatedRow = data?.quick_estimate || null;
      if (updatedRow?.id) {
        setRows((prev) => prev.map((row) => (Number(row?.id) === Number(updatedRow.id) ? updatedRow : row)));
      }
      setNotice(String(data?.message || "Payment updated."));
      closePaymentModal(true);
    } catch (error) {
      setPaymentProofError(error?.message || "Unable to update payment status.");
    } finally {
      setPaymentSaving(false);
    }
  }

  return (
    <div className="ba-assistant ba-assistant--page ba-site-admin-chat ba-site-admin-data-view">
      <div className="ba-assistant__panel">
        <div className="ba-assistant__header">
          <div className="ba-assistant__header-copy" />
          <div className="ba-assistant__header-actions">
            <SiteAdminHeaderTabs />
            <button
              type="button"
              className={`btn ba-site-admin-chat__cta-btn ${viewMode === "contacts" ? "btn-primary" : "btn-outline-light"}`}
              onClick={openContactView}
            >
              Contact Data
            </button>
            <button
              type="button"
              className={`btn ba-site-admin-chat__cta-btn ${viewMode === "estimates" ? "btn-primary" : "btn-outline-light"}`}
              onClick={openEstimateView}
            >
              Estimate Data
            </button>
            <button
              type="button"
              className="btn btn-outline-light ba-site-admin-chat__cta-btn"
              onClick={() => navigate("/site-admin")}
            >
              Back
            </button>
          </div>
        </div>

          <div className="ba-site-admin-data-view__body">
          <div className="ba-site-admin-data-view__card">
            <div className="ba-site-admin-data-view__toolbar">
              <div className="ba-site-admin-chat__table-tabs" role="tablist" aria-label="Quick Estimate data filters">
                {viewMode === "estimates" ? STATUS_TABS.map((tab) => (
                  <button
                    key={tab.key}
                    type="button"
                    className={`ba-site-admin-chat__table-tab ${statusFilter === tab.key ? "is-active" : ""}`}
                    onClick={() => setStatusFilter(tab.key)}
                  >
                    {tab.label}
                  </button>
                )) : (
                  <div className="ba-site-admin-data-view__section-title">Quick Enquiry Contact Data</div>
                )}
              </div>

              <div className="ba-site-admin-data-view__filters">
                {viewMode === "estimates" ? (
                  <>
                    <select
                      className="form-select ba-site-admin-data-view__type-select"
                      value={entityType}
                      onChange={(event) => {
                        setEntityType(event.target.value === "user" ? "user" : "client");
                        setEntityQuery("");
                      }}
                    >
                      <option value="client">Client</option>
                      <option value="user">User</option>
                    </select>
                    <input
                      type="search"
                      list="ba-site-admin-data-view-options"
                      className="form-control ba-site-admin-data-view__entity-search"
                      value={entityQuery}
                      onChange={(event) => setEntityQuery(event.target.value)}
                      placeholder={entityType === "user" ? "Select user..." : "Select client..."}
                    />
                    <input
                      type="date"
                      className="form-control ba-site-admin-data-view__date-input"
                      data-wz-date-enhance="off"
                      value={fromDate}
                      onChange={(event) => setFromDate(event.target.value)}
                      placeholder="From Date"
                      aria-label="From date"
                      title="From Date"
                    />
                    <input
                      type="date"
                      className="form-control ba-site-admin-data-view__date-input"
                      data-wz-date-enhance="off"
                      value={toDate}
                      onChange={(event) => setToDate(event.target.value)}
                      min={fromDate || undefined}
                      placeholder="To Date"
                      aria-label="To date"
                      title="To Date"
                    />
                    <input
                      type="search"
                      className="form-control ba-site-admin-data-view__search"
                      value={tableSearch}
                      onChange={(event) => setTableSearch(event.target.value)}
                      placeholder="Search table..."
                    />
                  </>
                ) : (
                  <input
                    type="search"
                    className="form-control ba-site-admin-data-view__search ba-site-admin-data-view__search--contacts"
                    value={tableSearch}
                    onChange={(event) => setTableSearch(event.target.value)}
                    placeholder="Search contact table..."
                  />
                )}
                {viewMode === "estimates" ? (
                  <datalist id="ba-site-admin-data-view-options">
                    {entityOptions.map((option) => (
                      <option key={option} value={option} />
                    ))}
                  </datalist>
                ) : null}
              </div>
            </div>

            <div className={`ba-site-admin-chat__table-count ${viewMode === "estimates" ? "ba-site-admin-data-view__table-count-row" : ""}`}>
              <span>
                {viewMode === "contacts"
                  ? `${filteredContacts.length} contact${filteredContacts.length === 1 ? "" : "s"}`
                  : `${filteredRows.length} estimate${filteredRows.length === 1 ? "" : "s"} / Total : ${formatCurrencyText(filteredEstimateTotal)}`}
              </span>
              {viewMode === "estimates" && statusFilter === "paid" ? (
                <div className="ba-site-admin-data-view__payment-mode-tabs" role="tablist" aria-label="Paid payment mode filters">
                  <button
                    type="button"
                    className={`ba-site-admin-chat__table-tab ${paymentModeFilter === "all" ? "is-active" : ""}`}
                    onClick={() => setPaymentModeFilter("all")}
                  >
                    All
                  </button>
                  <button
                    type="button"
                    className={`ba-site-admin-chat__table-tab ${paymentModeFilter === "cash" ? "is-active" : ""}`}
                    onClick={() => setPaymentModeFilter("cash")}
                  >
                    Cash
                  </button>
                  <button
                    type="button"
                    className={`ba-site-admin-chat__table-tab ${paymentModeFilter === "online" ? "is-active" : ""}`}
                    onClick={() => setPaymentModeFilter("online")}
                  >
                    Online
                  </button>
                </div>
              ) : null}
            </div>
            {viewMode === "contacts"
              ? (contactNotice ? <div className="ba-assistant__setup-note">{contactNotice}</div> : null)
              : (notice ? <div className="ba-assistant__setup-note">{notice}</div> : null)}

            <div className="table-responsive ba-site-admin-chat__table-wrap ba-site-admin-data-view__table-wrap">
              {viewMode === "contacts" ? (
                <table className="table align-middle mb-0">
                  <thead>
                    <tr>
                      <th>S.No</th>
                      <th>Client Name</th>
                      <th>Mobile</th>
                      <th>Linked Estimates</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {contactsLoading ? (
                      <tr>
                        <td colSpan={5} className="text-center py-4 text-secondary">Loading contact data...</td>
                      </tr>
                    ) : filteredContacts.length ? (
                      filteredContacts.map((row, index) => (
                        <tr key={row.id}>
                          <td>{index + 1}</td>
                          <td>{row.client_name || "-"}</td>
                          <td>{row.mobile || "-"}</td>
                          <td>
                            <button
                              type="button"
                              className="ba-site-admin-data-view__linked-summary"
                              onClick={() => {
                                setContactDetailsModal(row);
                                setContactEstimateSearch("");
                                setContactEstimatePage(1);
                              }}
                            >
                              <span className="ba-site-admin-data-view__linked-summary-row">
                                <span
                                  className="ba-site-admin-data-view__linked-stat is-paid"
                                  aria-label={`Paid ${formatCountLabel(row?.linked_estimate_stats?.paid)}`}
                                  onMouseEnter={(event) => openInlineTooltip(event, "Paid")}
                                  onMouseLeave={closeInlineTooltip}
                                  onFocus={(event) => openInlineTooltip(event, "Paid")}
                                  onBlur={closeInlineTooltip}
                                >
                                  <i className="bi bi-cash-coin" aria-hidden="true" />
                                  <span>{formatCountLabel(row?.linked_estimate_stats?.paid)}</span>
                                </span>
                                <span
                                  className="ba-site-admin-data-view__linked-stat is-unpaid"
                                  aria-label={`Unpaid ${formatCountLabel(row?.linked_estimate_stats?.unpaid)}`}
                                  onMouseEnter={(event) => openInlineTooltip(event, "Unpaid")}
                                  onMouseLeave={closeInlineTooltip}
                                  onFocus={(event) => openInlineTooltip(event, "Unpaid")}
                                  onBlur={closeInlineTooltip}
                                >
                                  <i className="bi bi-cash-coin" aria-hidden="true" />
                                  <span>{formatCountLabel(row?.linked_estimate_stats?.unpaid)}</span>
                                </span>
                                <span
                                  className="ba-site-admin-data-view__linked-stat is-pending-job"
                                  aria-label={`Pending Job ${formatCountLabel(row?.linked_estimate_stats?.pendingJob)}`}
                                  onMouseEnter={(event) => openInlineTooltip(event, "Pending Job")}
                                  onMouseLeave={closeInlineTooltip}
                                  onFocus={(event) => openInlineTooltip(event, "Pending Job")}
                                  onBlur={closeInlineTooltip}
                                >
                                  <i className="bi bi-briefcase" aria-hidden="true" />
                                  <span>{formatCountLabel(row?.linked_estimate_stats?.pendingJob)}</span>
                                </span>
                                <span
                                  className="ba-site-admin-data-view__linked-stat is-delivery-pending"
                                  aria-label={`Delivery Pending ${formatCountLabel(row?.linked_estimate_stats?.deliveryPending)}`}
                                  onMouseEnter={(event) => openInlineTooltip(event, "Delivery Pending")}
                                  onMouseLeave={closeInlineTooltip}
                                  onFocus={(event) => openInlineTooltip(event, "Delivery Pending")}
                                  onBlur={closeInlineTooltip}
                                >
                                  <i className="bi bi-truck" aria-hidden="true" />
                                  <span>{formatCountLabel(row?.linked_estimate_stats?.deliveryPending)}</span>
                                </span>
                              </span>
                            </button>
                          </td>
                          <td>
                            <div className="ba-site-admin-data-view__contact-actions">
                              <button
                                type="button"
                                className="ba-site-admin-data-view__icon-btn is-edit"
                                onClick={() => startEditContact(row)}
                                aria-label="Edit contact"
                                onMouseEnter={(event) => openInlineTooltip(event, "Edit contact")}
                                onMouseLeave={closeInlineTooltip}
                                onFocus={(event) => openInlineTooltip(event, "Edit contact")}
                                onBlur={closeInlineTooltip}
                              >
                                <i className="bi bi-pencil" aria-hidden="true" />
                              </button>
                              <button
                                type="button"
                                className="ba-site-admin-data-view__icon-btn is-delete"
                                onClick={() => deleteContact(row)}
                                aria-label="Delete contact"
                                onMouseEnter={(event) => openInlineTooltip(event, "Delete contact")}
                                onMouseLeave={closeInlineTooltip}
                                onFocus={(event) => openInlineTooltip(event, "Delete contact")}
                                onBlur={closeInlineTooltip}
                              >
                                <i className="bi bi-trash" aria-hidden="true" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={5} className="text-center py-4 text-secondary">No contact data found.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              ) : (
                <table className="table align-middle mb-0">
                  <thead>
                    <tr>
                      <th>S.No</th>
                      <th>Estimate</th>
                      <th>Client</th>
                      <th>Assigned Employee</th>
                      <th>Date</th>
                      <th>Status</th>
                      <th className="text-end">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loading ? (
                      <tr>
                        <td colSpan={7} className="text-center py-4 text-secondary">Loading Quick Estimates...</td>
                      </tr>
                    ) : filteredRows.length ? (
                      filteredRows.map((row, index) => (
                        <tr key={row.id}>
                          <td>{index + 1}</td>
                          <td>{row.estimate_number || "-"}</td>
                          <td>
                            <div className="ba-site-admin-chat__estimate-meta">
                              <strong>{row.client_name || "-"}</strong>
                              <small>{row.mobile || "-"}</small>
                            </div>
                          </td>
                          <td>{row.assigned_user_name || "Unassigned"}</td>
                          <td>{formatDateLabel(row.created_at)}</td>
                          <td>
                            <div className="ba-site-admin-chat__estimate-meta">
                              <span>{String(row.status || "created").replace(/_/g, " ")}</span>
                              <small>
                                <button
                                  type="button"
                                  className="ba-site-admin-data-view__status-link"
                                  onClick={() => openPaymentModal(row)}
                                >
                                  Payment: {resolvePaymentStatusLabel(row)}
                                </button>
                                {" "} | Delivery: {String(row.delivery_status || "").toLowerCase() === "completed" ? "Done" : "Pending"}
                              </small>
                            </div>
                          </td>
                          <td className="text-end fw-semibold">{formatCurrencyText(row.total_amount || row.subtotal)}</td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={7} className="text-center py-4 text-secondary">No Quick Estimate data found for this filter.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              )}
            </div>
            {editingContactId ? (
              <div className="ba-site-admin-chat__modal-overlay" onClick={closeEditContact}>
                <div className="ba-site-admin-chat__modal ba-site-admin-data-view__edit-modal" onClick={(event) => event.stopPropagation()}>
                  <div className="ba-site-admin-chat__modal-head">
                    <div>
                      <div className="ba-site-admin-chat__modal-title">Edit Contact</div>
                      <div className="ba-site-admin-chat__modal-subtitle">
                        Update contact name and mobile number.
                      </div>
                    </div>
                    <button
                      type="button"
                      className="ba-assistant__close d-inline-flex align-items-center justify-content-center"
                      aria-label="Close edit contact popup"
                      onClick={closeEditContact}
                    >
                      <i className="bi bi-x-lg" aria-hidden="true" />
                    </button>
                  </div>
                  <div className="ba-site-admin-data-view__contact-editor">
                    <div className="row g-3">
                      <div className="col-12 col-md-6">
                        <label className="form-label">Client Name</label>
                        <input
                          type="text"
                          className="form-control"
                          value={contactForm.client_name}
                          onChange={(event) => setContactForm((prev) => ({ ...prev, client_name: event.target.value }))}
                        />
                      </div>
                      <div className="col-12 col-md-6">
                        <label className="form-label">Mobile Number</label>
                        <input
                          type="text"
                          className="form-control"
                          value={contactForm.mobile}
                          onChange={(event) => setContactForm((prev) => ({ ...prev, mobile: event.target.value }))}
                        />
                      </div>
                    </div>
                    <div className="ba-site-admin-data-view__contact-editor-actions">
                      <button type="button" className="btn btn-outline-light ba-site-admin-chat__cta-btn" onClick={closeEditContact}>
                        Cancel
                      </button>
                      <button type="button" className="btn btn-primary ba-site-admin-chat__cta-btn" disabled={contactSaving} onClick={saveContactEdit}>
                        {contactSaving ? "Saving..." : "Save"}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ) : null}
            {contactDetailsModal ? (
              <div className="ba-site-admin-chat__modal-overlay" onClick={closeContactDetailsModal}>
                <div className="ba-site-admin-chat__modal ba-site-admin-data-view__details-modal" onClick={(event) => event.stopPropagation()}>
                  <div className="ba-site-admin-chat__modal-head">
                    <div>
                      <div className="ba-site-admin-chat__modal-title">Linked Estimate Details</div>
                      <div className="ba-site-admin-chat__modal-subtitle">
                        <button
                          type="button"
                          className="ba-site-admin-chat__inline-link"
                          onClick={() => openEstimateViewForContact(contactDetailsModal)}
                        >
                          {contactDetailsModal.client_name || "-"} ({contactDetailsModal.mobile || "-"})
                        </button>{" "}
                        estimate records.
                      </div>
                    </div>
                    <button
                      type="button"
                      className="ba-assistant__close d-inline-flex align-items-center justify-content-center"
                      aria-label="Close linked estimate popup"
                      onClick={closeContactDetailsModal}
                    >
                      <i className="bi bi-x-lg" aria-hidden="true" />
                    </button>
                  </div>
                  <div className="ba-site-admin-data-view__details-toolbar">
                    <div className="ba-site-admin-data-view__details-summary">
                      <button
                        type="button"
                        className={`ba-site-admin-data-view__details-summary-link ${contactEstimateStatusFilter === "paid" ? "is-active" : ""}`}
                        onClick={() => {
                          setContactEstimateStatusFilter("paid");
                          setContactEstimatePage(1);
                        }}
                      >
                        Paid: {formatCountLabel(contactDetailsModal?.linked_estimate_stats?.paid)}
                      </button>
                      <button
                        type="button"
                        className={`ba-site-admin-data-view__details-summary-link ${contactEstimateStatusFilter === "unpaid" ? "is-active" : ""}`}
                        onClick={() => {
                          setContactEstimateStatusFilter("unpaid");
                          setContactEstimatePage(1);
                        }}
                      >
                        Unpaid: {formatCountLabel(contactDetailsModal?.linked_estimate_stats?.unpaid)}
                      </button>
                      <button
                        type="button"
                        className={`ba-site-admin-data-view__details-summary-link ${contactEstimateStatusFilter === "pending_job" ? "is-active" : ""}`}
                        onClick={() => {
                          setContactEstimateStatusFilter("pending_job");
                          setContactEstimatePage(1);
                        }}
                      >
                        Pending Job: {formatCountLabel(contactDetailsModal?.linked_estimate_stats?.pendingJob)}
                      </button>
                      <button
                        type="button"
                        className={`ba-site-admin-data-view__details-summary-link ${contactEstimateStatusFilter === "delivery_pending" ? "is-active" : ""}`}
                        onClick={() => {
                          setContactEstimateStatusFilter("delivery_pending");
                          setContactEstimatePage(1);
                        }}
                      >
                        Delivery Pending: {formatCountLabel(contactDetailsModal?.linked_estimate_stats?.deliveryPending)}
                      </button>
                    </div>
                    <div className="ba-site-admin-chat__table-count ba-site-admin-data-view__details-count">
                      <button
                        type="button"
                        className={`ba-site-admin-data-view__details-summary-link ${contactEstimateStatusFilter === "all" ? "is-active" : ""}`}
                        onClick={() => {
                          setContactEstimateStatusFilter("all");
                          setContactEstimatePage(1);
                        }}
                      >
                        {filteredContactEstimates.length} estimate{filteredContactEstimates.length === 1 ? "" : "s"}
                      </button>
                    </div>
                    <input
                      type="search"
                      className="form-control"
                      value={contactEstimateSearch}
                      onChange={(event) => {
                        setContactEstimateSearch(event.target.value);
                        setContactEstimatePage(1);
                      }}
                      placeholder="Search estimate details..."
                    />
                  </div>
                  <div className="ba-site-admin-chat__history-list">
                    <div className="table-responsive ba-site-admin-chat__table-wrap">
                      <table className="table align-middle mb-0">
                        <thead>
                          <tr>
                            <th>S.No</th>
                            <th>Estimate</th>
                            <th>Date</th>
                            <th>Status</th>
                            <th>Assigned User</th>
                            <th className="text-end">Amount</th>
                          </tr>
                        </thead>
                        <tbody>
                          {paginatedContactEstimates.length ? (
                            paginatedContactEstimates.map((row, index) => (
                              <tr key={row.id}>
                                <td>{((contactEstimatePage - 1) * CONTACT_ESTIMATE_PAGE_SIZE) + index + 1}</td>
                                <td>
                                  <div className="ba-site-admin-chat__estimate-meta">
                                    <strong>{row.estimate_number || "-"}</strong>
                                    <small>{row.mobile || "-"}</small>
                                  </div>
                                </td>
                                <td>{formatDateLabel(row.created_at)}</td>
                                <td>
                                  <div className="ba-site-admin-chat__estimate-meta">
                                    <span>{String(row.status || "created").replace(/_/g, " ")}</span>
                                    <small>
                                      Payment: {resolvePaymentStatusLabel(row)} | Job: {["completed", "done", "ready"].includes(String(row?.job_status || "").trim().toLowerCase()) ? "Done" : "Pending"} | Delivery: {isCompletedProgress(row.delivery_status) ? "Done" : "Pending"}
                                    </small>
                                  </div>
                                </td>
                                <td>{row.assigned_user_name || "Unassigned"}</td>
                                <td className="text-end fw-semibold">{formatCurrencyText(row.total_amount || row.subtotal)}</td>
                              </tr>
                            ))
                          ) : (
                            <tr>
                              <td colSpan={6} className="text-center py-4 text-secondary">No estimate data found for this client.</td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                    {filteredContactEstimates.length > CONTACT_ESTIMATE_PAGE_SIZE ? (
                      <div className="ba-site-admin-chat__table-pagination">
                        <button
                          type="button"
                          className="btn btn-outline-light ba-site-admin-chat__cta-btn"
                          disabled={contactEstimatePage <= 1}
                          onClick={() => setContactEstimatePage((prev) => Math.max(1, prev - 1))}
                        >
                          Previous
                        </button>
                        <span>Page {contactEstimatePage} of {contactEstimateTotalPages}</span>
                        <button
                          type="button"
                          className="btn btn-outline-light ba-site-admin-chat__cta-btn"
                          disabled={contactEstimatePage >= contactEstimateTotalPages}
                          onClick={() => setContactEstimatePage((prev) => Math.min(contactEstimateTotalPages, prev + 1))}
                        >
                          Next
                        </button>
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>
            ) : null}
            {paymentModalRow ? (
              <div className="ba-site-admin-chat__modal-overlay" onClick={closePaymentModal}>
                <div className="ba-site-admin-chat__modal ba-site-admin-chat__modal--proof" onClick={(event) => event.stopPropagation()}>
                  <div className="ba-site-admin-chat__modal-head">
                    <div>
                      <div className="ba-site-admin-chat__modal-title">Payment Status</div>
                      <div className="ba-site-admin-chat__modal-subtitle">
                        {paymentModalRow.estimate_number || "-"} - {paymentModalRow.client_name || "-"}
                      </div>
                    </div>
                    <button
                      type="button"
                      className="ba-assistant__close d-inline-flex align-items-center justify-content-center"
                      aria-label="Close payment status popup"
                      onClick={closePaymentModal}
                      disabled={paymentSaving}
                    >
                      <i className="bi bi-x-lg" aria-hidden="true" />
                    </button>
                  </div>
                  <div className="ba-site-admin-data-view__payment-mode-picker">
                    <button
                      type="button"
                      className={`ba-site-admin-chat__table-tab ${paymentModalMode === "cash" ? "is-active" : ""}`}
                      onClick={() => {
                        setPaymentModalMode("cash");
                        setPaymentProofError("");
                      }}
                    >
                      Cash
                    </button>
                    <button
                      type="button"
                      className={`ba-site-admin-chat__table-tab ${paymentModalMode === "online" ? "is-active" : ""}`}
                      onClick={() => {
                        setPaymentModalMode("online");
                        setPaymentProofError("");
                      }}
                    >
                      Online
                    </button>
                  </div>
                  {paymentModalMode === "online" ? (
                    <>
                      <div
                        className={`ba-site-admin-chat__proof-dropzone ${paymentProofDraftEntries.length ? "has-image" : ""}`}
                        onDragOver={(event) => {
                          event.preventDefault();
                          event.dataTransfer.dropEffect = "copy";
                        }}
                        onDrop={handlePaymentProofDrop}
                        onPaste={handlePaymentProofPaste}
                        tabIndex={0}
                        role="button"
                        aria-label="Payment proof upload area"
                      >
                        {paymentProofDraftEntries.length ? (
                          <img src={paymentProofDraftEntries[0]?.image} alt="Payment proof preview" className="ba-site-admin-chat__proof-preview" />
                        ) : (
                          <div className="ba-site-admin-chat__proof-placeholder">
                            <i className="bi bi-image" aria-hidden="true" />
                            <strong>Drop image here</strong>
                            <span>Paste screenshot or choose image file</span>
                          </div>
                        )}
                      </div>
                      <div className="ba-site-admin-chat__proof-actions row g-2">
                        <div className="col-12 col-md-4">
                          <label className="btn btn-outline-light ba-site-admin-chat__proof-btn w-100">
                            <input type="file" accept="image/*" multiple hidden onChange={handlePaymentProofFileChange} />
                            Choose Images
                          </label>
                        </div>
                        <div className="col-12 col-md-6">
                          <label className="ba-site-admin-chat__date-field">
                            <span className="ba-site-admin-chat__date-field-label">
                              <i className="bi bi-calendar3" aria-hidden="true" />
                              Paid Date
                            </span>
                            <input
                              type="date"
                              className="form-control ba-site-admin-chat__date-input"
                              value={paymentProofPaidDate}
                              onChange={(event) => setPaymentProofPaidDate(event.target.value)}
                              aria-label="Paid date"
                            />
                          </label>
                        </div>
                        <div className="col-12 col-md-2">
                          {paymentProofDraftEntries.length ? (
                            <button
                              type="button"
                              className="btn btn-outline-light ba-site-admin-chat__proof-btn w-100"
                              onClick={() => setPaymentProofDraftEntries([])}
                              disabled={paymentSaving}
                            >
                              Clear All
                            </button>
                          ) : null}
                        </div>
                      </div>
                      {paymentProofDraftEntries.length ? (
                        <div className="table-responsive">
                          <table className="table table-sm align-middle mb-3">
                            <thead>
                              <tr>
                                <th style={{ width: 72 }}>Preview</th>
                                <th>Name</th>
                                <th style={{ width: 140 }}>Paid Date</th>
                                <th style={{ width: 96 }}>Action</th>
                              </tr>
                            </thead>
                            <tbody>
                              {paymentProofDraftEntries.map((entry, index) => (
                                <tr key={`${index}-${String(entry?.image || "").slice(0, 24)}`}>
                                  <td>
                                    <span className="ba-site-admin-chat__proof-thumb">
                                      <img src={entry?.image} alt={`Payment proof ${index + 1}`} className="ba-site-admin-chat__proof-thumb-image" />
                                      <span className="ba-site-admin-chat__proof-thumb-hover">
                                        <img src={entry?.image} alt={`Payment proof ${index + 1} enlarged preview`} />
                                      </span>
                                    </span>
                                  </td>
                                  <td>{`Proof ${index + 1}`}</td>
                                  <td>{entry?.paid_date || "-"}</td>
                                  <td>
                                    <button
                                      type="button"
                                      className="btn btn-outline-danger btn-sm"
                                      onClick={() => setPaymentProofDraftEntries((prev) => prev.filter((_, imageIndex) => imageIndex !== index))}
                                      disabled={paymentSaving}
                                    >
                                      Delete
                                    </button>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      ) : null}
                    </>
                  ) : (
                    <div className="ba-site-admin-data-view__payment-mode-note">
                      Cash selected. Save pannina `Payment: Done (Cash)` nu update aagum.
                    </div>
                  )}
                  {paymentProofError ? <div className="ba-assistant__setup-note">{paymentProofError}</div> : null}
                  <div className="ba-site-admin-chat__modal-actions">
                    <button
                      type="button"
                      className="btn btn-outline-light ba-site-admin-chat__modal-btn ba-site-admin-chat__cta-btn"
                      onClick={closePaymentModal}
                      disabled={paymentSaving}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      className="btn btn-primary ba-site-admin-chat__modal-btn ba-site-admin-chat__cta-btn"
                      onClick={savePaymentUpdate}
                      disabled={paymentSaving}
                    >
                      {paymentSaving ? "Saving..." : "Save"}
                    </button>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>
      {inlineTooltip?.text ? (
        <div
          className="ba-site-admin-chat__status-tooltip"
          style={{ top: `${inlineTooltip.top}px`, left: `${inlineTooltip.left}px`, width: `${inlineTooltip.width}px` }}
          role="tooltip"
        >
          {inlineTooltip.text}
          <span className="ba-site-admin-chat__status-tooltip-arrow" aria-hidden="true" />
        </div>
      ) : null}
    </div>
  );
}
