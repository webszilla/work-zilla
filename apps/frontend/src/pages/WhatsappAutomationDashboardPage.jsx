import { useEffect, useMemo, useRef, useState } from "react";
import { waApi } from "../api/whatsappAutomation.js";
import TinyHtmlEditor from "../components/TinyHtmlEditor.jsx";
import { htmlToWhatsappText, plainTextToHtml } from "../lib/whatsappFormatting.js";

const RULE_REPLY_CHAR_LIMIT = 350;
const RULE_KEYWORD_CHAR_LIMIT = 120;
const TABLE_PAGE_SIZE = 5;

function limitText(value, max = 255) {
  return String(value || "").slice(0, max);
}

function normalizePhone(value) {
  return String(value || "").replace(/\D/g, "").slice(0, 15);
}

function toStrictBoolean(value) {
  if (typeof value === "boolean") return value;
  const normalized = String(value ?? "").trim().toLowerCase();
  if (["true", "1", "yes", "y", "on"].includes(normalized)) return true;
  if (["false", "0", "no", "n", "off", ""].includes(normalized)) return false;
  return false;
}

function formatDateTime(value) {
  if (!value) return "-";
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return "-";
  return dt.toLocaleString();
}

function filterRows(rows, query, fields) {
  const search = String(query || "").trim().toLowerCase();
  if (!search) return rows;
  return rows.filter((row) =>
    fields.some((field) => String(row?.[field] || "").toLowerCase().includes(search)),
  );
}

function csvCell(value) {
  const text = String(value ?? "");
  return `"${text.replace(/"/g, '""')}"`;
}

export default function WhatsappAutomationDashboardPage() {
  const keywordInputRef = useRef(null);
  const autoReplySectionRef = useRef(null);
  const campaignsSectionRef = useRef(null);
  const [loading, setLoading] = useState(true);
  const [savingSettings, setSavingSettings] = useState(false);
  const [savingRule, setSavingRule] = useState(false);
  const [savingContact, setSavingContact] = useState(false);
  const [importingCsv, setImportingCsv] = useState(false);
  const [savingCampaign, setSavingCampaign] = useState(false);
  const [retryingCampaignId, setRetryingCampaignId] = useState(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [activeTopSection, setActiveTopSection] = useState("auto");
  const [settings, setSettings] = useState({ auto_reply_enabled: true, welcome_message: "" });
  const [rules, setRules] = useState([]);
  const [keywordRulesLimit, setKeywordRulesLimit] = useState(10);
  const [ruleForm, setRuleForm] = useState({ id: null, keyword: "", reply_message: "", is_default: false });
  const [previewInput, setPreviewInput] = useState("Hi");
  const [previewReply, setPreviewReply] = useState("");

  const [contacts, setContacts] = useState([]);
  const [contactForm, setContactForm] = useState({
    id: null,
    name: "",
    phone_number: "",
    email: "",
    tags: "",
    is_opted_in: true,
    consent_note: "",
    opt_in_source: "manual",
  });
  const [csvText, setCsvText] = useState("");
  const [selectedContactIds, setSelectedContactIds] = useState([]);
  const [campaigns, setCampaigns] = useState([]);
  const [deliveries, setDeliveries] = useState([]);
  const [campaignForm, setCampaignForm] = useState({
    name: "",
    template_name: "",
    template_variables: "",
    compliance_note: "You can opt out any time by replying STOP.",
    send_now: true,
  });
  const [ruleSearch, setRuleSearch] = useState("");
  const [rulePage, setRulePage] = useState(1);
  const [contactSearch, setContactSearch] = useState("");
  const [contactPage, setContactPage] = useState(1);
  const [campaignSearch, setCampaignSearch] = useState("");
  const [campaignPage, setCampaignPage] = useState(1);
  const [deliverySearch, setDeliverySearch] = useState("");
  const [deliveryPage, setDeliveryPage] = useState(1);

  async function loadAll() {
    setLoading(true);
    setError("");
    try {
      const [settingsRes, rulesRes, contactsRes, campaignRes] = await Promise.allSettled([
        waApi.getSettings(),
        waApi.getRules(),
        waApi.getMarketingContacts(),
        waApi.getMarketingCampaigns(),
      ]);
      if (settingsRes.status === "fulfilled") {
        setSettings(settingsRes.value?.settings || { auto_reply_enabled: true, welcome_message: "" });
      }
      const nextRules = rulesRes.status === "fulfilled" ? (rulesRes.value?.rules || []) : [];
      setRules(nextRules);
      setKeywordRulesLimit(Number(rulesRes.status === "fulfilled" ? (rulesRes.value?.keyword_rules_limit || 10) : 10));
      setContacts(contactsRes.status === "fulfilled" ? (contactsRes.value?.contacts || []) : []);
      setCampaigns(campaignRes.status === "fulfilled" ? (campaignRes.value?.campaigns || []) : []);
      setDeliveries(campaignRes.status === "fulfilled" ? (campaignRes.value?.recent_deliveries || []) : []);
      const failedCount = [settingsRes, rulesRes, contactsRes, campaignRes].filter((entry) => entry.status === "rejected").length;
      if (failedCount > 0) {
        setError("Some sections failed to load. Please refresh after backend restart/migration.");
      }
      setLoading(false);
    } catch (err) {
      setError(err?.message || "Unable to load WhatsApp automation.");
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAll();
  }, []);

  async function reloadMarketingData() {
    const [contactsRes, campaignRes] = await Promise.all([
      waApi.getMarketingContacts(),
      waApi.getMarketingCampaigns(),
    ]);
    setContacts(contactsRes?.contacts || []);
    setCampaigns(campaignRes?.campaigns || []);
    setDeliveries(campaignRes?.recent_deliveries || []);
  }

  async function saveSettings() {
    setSavingSettings(true);
    setError("");
    setSuccess("");
    try {
      const data = await waApi.saveSettings(settings);
      setSettings(data?.settings || settings);
      setSuccess("Settings saved.");
    } catch (err) {
      setError(err?.message || "Unable to save settings.");
    } finally {
      setSavingSettings(false);
    }
  }

  async function saveRule() {
    const isCreating = !ruleForm.id;
    if (isCreating && rules.length >= keywordRulesLimit) {
      setError(`Plan limit reached. Maximum ${keywordRulesLimit} keyword rules allowed.`);
      return;
    }
    const keyword = limitText(ruleForm.keyword, RULE_KEYWORD_CHAR_LIMIT).trim();
    if (!keyword) {
      setError("Keyword is required.");
      if (keywordInputRef.current) {
        keywordInputRef.current.setCustomValidity("Keyword is required.");
        keywordInputRef.current.reportValidity();
        keywordInputRef.current.focus();
      }
      return;
    }
    if (keywordInputRef.current) keywordInputRef.current.setCustomValidity("");
    const whatsappReply = htmlToWhatsappText(ruleForm.reply_message);
    if (!whatsappReply) {
      setError("Reply message is required.");
      return;
    }
    setSavingRule(true);
    setError("");
    setSuccess("");
    try {
      await waApi.saveRule({
        ...ruleForm,
        keyword,
        reply_message: whatsappReply.slice(0, RULE_REPLY_CHAR_LIMIT),
      });
      setRuleForm({ id: null, keyword: "", reply_message: "", is_default: false });
      const data = await waApi.getRules();
      setRules(data?.rules || []);
      setKeywordRulesLimit(Number(data?.keyword_rules_limit || keywordRulesLimit || 10));
      setSuccess("Rule saved. HTML converted to WhatsApp format.");
    } catch (err) {
      setError(err?.message || "Unable to save rule.");
    } finally {
      setSavingRule(false);
    }
  }

  async function deleteRule(id) {
    try {
      await waApi.deleteRule(id);
      setRules((prev) => prev.filter((row) => row.id !== id));
    } catch (err) {
      setError(err?.message || "Unable to delete rule.");
    }
  }

  async function runPreview() {
    try {
      const data = await waApi.previewReply({ message: previewInput, is_first_message: true });
      setPreviewReply(data?.reply || "");
    } catch (err) {
      setError(err?.message || "Unable to preview reply.");
    }
  }

  async function saveContact() {
    const phone = normalizePhone(contactForm.phone_number);
    if (!phone) {
      setError("Valid contact phone number is required.");
      return;
    }
    setSavingContact(true);
    setError("");
    setSuccess("");
    try {
      if (contactForm.id) {
        await waApi.updateMarketingContact(contactForm.id, {
          ...contactForm,
          phone_number: phone,
        });
      } else {
        await waApi.saveMarketingContact({
          ...contactForm,
          phone_number: phone,
        });
      }
      await reloadMarketingData();
      setContactForm({
        id: null,
        name: "",
        phone_number: "",
        email: "",
        tags: "",
        is_opted_in: true,
        consent_note: "",
        opt_in_source: "manual",
      });
      setSuccess("Contact saved.");
    } catch (err) {
      setError(err?.message || "Unable to save contact.");
    } finally {
      setSavingContact(false);
    }
  }

  async function importCsvContacts() {
    if (!csvText.trim()) {
      setError("Paste CSV content first.");
      return;
    }
    setImportingCsv(true);
    setError("");
    setSuccess("");
    try {
      const data = await waApi.importMarketingContactsCsv({ csv_text: csvText });
      await reloadMarketingData();
      setSuccess(`CSV imported. Created ${data?.created || 0}, updated ${data?.updated || 0}, skipped ${data?.skipped || 0}.`);
    } catch (err) {
      setError(err?.message || "Unable to import CSV.");
    } finally {
      setImportingCsv(false);
    }
  }

  async function deleteContact(contactId) {
    try {
      await waApi.deleteMarketingContact(contactId);
      setContacts((prev) => prev.filter((row) => row.id !== contactId));
      setSelectedContactIds((prev) => prev.filter((id) => id !== contactId));
    } catch (err) {
      setError(err?.message || "Unable to delete contact.");
    }
  }

  async function optOutContact(phoneNumber) {
    const phone = normalizePhone(phoneNumber);
    if (!phone) return;
    try {
      await waApi.optOutMarketingContact({ phone_number: phone, reason: "STOP" });
      await reloadMarketingData();
    } catch (err) {
      setError(err?.message || "Unable to opt-out contact.");
    }
  }

  async function sendCampaign() {
    const name = limitText(campaignForm.name, 180).trim();
    const templateName = limitText(campaignForm.template_name, 180).trim();
    if (!name) {
      setError("Campaign name is required.");
      return;
    }
    if (!templateName) {
      setError("Template name is required.");
      return;
    }
    if (!/^[a-z0-9_]{3,180}$/.test(templateName)) {
      setError("Template name must be lowercase with numbers/underscore only.");
      return;
    }
    const complianceNote = String(campaignForm.compliance_note || "").trim();
    if (!complianceNote || !complianceNote.toLowerCase().includes("stop")) {
      setError("Compliance note must contain STOP opt-out instruction.");
      return;
    }
    const defaultIds = contacts
      .filter((row) => row.is_opted_in && !row.has_opted_out)
      .map((row) => row.id);
    const contactIds = selectedContactIds.length ? selectedContactIds : defaultIds;
    if (!contactIds.length) {
      setError("No opted-in contacts available to send.");
      return;
    }
    setSavingCampaign(true);
    setError("");
    setSuccess("");
    try {
      await waApi.saveMarketingCampaign({
        name,
        template_name: templateName,
        template_variables: String(campaignForm.template_variables || "")
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean),
        compliance_note: complianceNote,
        send_now: toStrictBoolean(campaignForm.send_now),
        contact_ids: contactIds,
      });
      await reloadMarketingData();
      setCampaignForm((prev) => ({ ...prev, name: "", template_variables: "" }));
      setSelectedContactIds([]);
      setSuccess("Campaign queued using template send.");
    } catch (err) {
      setError(err?.message || "Unable to send campaign.");
    } finally {
      setSavingCampaign(false);
    }
  }

  async function retryFailed(campaignId) {
    setRetryingCampaignId(campaignId);
    setError("");
    setSuccess("");
    try {
      await waApi.retryFailedCampaign(campaignId);
      await reloadMarketingData();
      setSuccess("Failed deliveries retried.");
    } catch (err) {
      setError(err?.message || "Unable to retry failed deliveries.");
    } finally {
      setRetryingCampaignId(null);
    }
  }

  function exportContactsCsv() {
    if (!contacts.length) {
      setError("No contacts to export.");
      return;
    }
    const header = ["Name", "Phone", "Email", "Tags", "Opted In", "Opted Out", "Opt-in Source", "Consent Note"];
    const lines = [
      header.map(csvCell).join(","),
      ...contacts.map((row) => ([
        row.name || "",
        row.phone_number || "",
        row.email || "",
        row.tags || "",
        row.is_opted_in ? "Yes" : "No",
        row.has_opted_out ? "Yes" : "No",
        row.opt_in_source || "",
        row.consent_note || "",
      ]).map(csvCell).join(",")),
    ];
    const blob = new Blob([`${lines.join("\n")}\n`], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    const stamp = new Date().toISOString().slice(0, 10);
    anchor.href = url;
    anchor.download = `contacts_${stamp}.csv`;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  }

  const sortedRules = useMemo(() => [...rules].sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0)), [rules]);
  const filteredRules = useMemo(
    () => filterRows(sortedRules, ruleSearch, ["keyword", "reply_message"]),
    [sortedRules, ruleSearch],
  );
  const ruleTotalPages = Math.max(1, Math.ceil(filteredRules.length / TABLE_PAGE_SIZE));
  const safeRulePage = Math.min(rulePage, ruleTotalPages);
  const pagedRules = useMemo(() => {
    const start = (safeRulePage - 1) * TABLE_PAGE_SIZE;
    return filteredRules.slice(start, start + TABLE_PAGE_SIZE);
  }, [filteredRules, safeRulePage]);

  const filteredContacts = useMemo(
    () => filterRows(contacts, contactSearch, ["name", "phone_number", "email", "tags", "opt_in_source"]),
    [contacts, contactSearch],
  );
  const contactTotalPages = Math.max(1, Math.ceil(filteredContacts.length / TABLE_PAGE_SIZE));
  const safeContactPage = Math.min(contactPage, contactTotalPages);
  const pagedContacts = useMemo(() => {
    const start = (safeContactPage - 1) * TABLE_PAGE_SIZE;
    return filteredContacts.slice(start, start + TABLE_PAGE_SIZE);
  }, [filteredContacts, safeContactPage]);

  const filteredCampaigns = useMemo(
    () => filterRows(campaigns, campaignSearch, ["name", "status", "template_name"]),
    [campaigns, campaignSearch],
  );
  const campaignTotalPages = Math.max(1, Math.ceil(filteredCampaigns.length / TABLE_PAGE_SIZE));
  const safeCampaignPage = Math.min(campaignPage, campaignTotalPages);
  const pagedCampaigns = useMemo(() => {
    const start = (safeCampaignPage - 1) * TABLE_PAGE_SIZE;
    return filteredCampaigns.slice(start, start + TABLE_PAGE_SIZE);
  }, [filteredCampaigns, safeCampaignPage]);

  const filteredDeliveries = useMemo(
    () => filterRows(deliveries, deliverySearch, ["phone_number", "status", "error_code", "error_message"]),
    [deliveries, deliverySearch],
  );
  const deliveryTotalPages = Math.max(1, Math.ceil(filteredDeliveries.length / TABLE_PAGE_SIZE));
  const safeDeliveryPage = Math.min(deliveryPage, deliveryTotalPages);
  const pagedDeliveries = useMemo(() => {
    const start = (safeDeliveryPage - 1) * TABLE_PAGE_SIZE;
    return filteredDeliveries.slice(start, start + TABLE_PAGE_SIZE);
  }, [filteredDeliveries, safeDeliveryPage]);

  useEffect(() => setRulePage(1), [ruleSearch]);
  useEffect(() => setContactPage(1), [contactSearch]);
  useEffect(() => setCampaignPage(1), [campaignSearch]);
  useEffect(() => setDeliveryPage(1), [deliverySearch]);

  const ruleLimitReached = !ruleForm.id && rules.length >= keywordRulesLimit;
  const optedInCount = contacts.filter((row) => row.is_opted_in && !row.has_opted_out).length;

  if (loading) return <div className="card p-4 text-center"><div className="spinner" /><p className="mb-0">Loading WhatsApp Automation...</p></div>;

  return (
    <div className="d-flex flex-column gap-4">
      {activeTopSection === "auto" ? (
      <div ref={autoReplySectionRef}>
        <div className="d-flex align-items-center justify-content-between mb-2">
          <h4 className="mb-0">Auto Reply</h4>
          <div className="d-flex align-items-center gap-2">
            <button
              type="button"
              className={`btn btn-sm ${activeTopSection === "auto" ? "btn-primary" : "btn-outline-light"}`}
              onClick={() => setActiveTopSection("auto")}
            >
              Auto Reply
            </button>
            <button
              type="button"
              className={`btn btn-sm ${activeTopSection === "campaigns" ? "btn-primary" : "btn-outline-light"}`}
              onClick={() => setActiveTopSection("campaigns")}
            >
              Campaigns
            </button>
            <button type="button" className="btn btn-primary btn-sm" onClick={saveSettings} disabled={savingSettings}>
              {savingSettings ? "Saving..." : "Save Settings"}
            </button>
          </div>
        </div>
        {error ? <div className="alert alert-danger">{error}</div> : null}
        {success ? <div className="alert alert-success">{success}</div> : null}
        <div className="row g-3 align-items-start">
          <div className="col-12">
            <div className="form-check form-switch mt-1">
              <input type="checkbox" className="form-check-input" checked={Boolean(settings.auto_reply_enabled)} onChange={(e) => setSettings((p) => ({ ...p, auto_reply_enabled: e.target.checked }))} />
              <label className="form-check-label">{settings.auto_reply_enabled ? "Enabled" : "Disabled"}</label>
            </div>
          </div>
          <div className="col-12 col-xl-4">
            <label className="form-label">Welcome Message</label>
            <textarea
              className="form-control wa-welcome-textarea"
              rows="5"
              value={settings.welcome_message || ""}
              onChange={(e) => setSettings((p) => ({ ...p, welcome_message: e.target.value }))}
            />
          </div>
          <div className="col-12 col-xl-4">
            <label className="form-label">Automation Preview (Internal Only)</label>
            <input className="form-control mb-3" value={previewInput} onChange={(e) => setPreviewInput(e.target.value)} placeholder="Type customer message" />
            <button type="button" className="btn btn-primary" onClick={runPreview}>Preview Reply</button>
          </div>
          <div className="col-12 col-xl-4">
            <label className="form-label">Preview Reply Box</label>
            <div className="p-3 rounded border h-100" style={{ minHeight: "168px", whiteSpace: "pre-wrap" }}>
              {previewReply || <span className="text-secondary">Preview reply will appear here.</span>}
            </div>
          </div>
        </div>
      </div>
      ) : (
      <div ref={campaignsSectionRef}>
        <div className="d-flex align-items-center justify-content-between mb-2">
          <h4 className="mb-0">Campaigns</h4>
          <div className="d-flex align-items-center gap-2">
            <button
              type="button"
              className={`btn btn-sm ${activeTopSection === "auto" ? "btn-primary" : "btn-outline-light"}`}
              onClick={() => setActiveTopSection("auto")}
            >
              Auto Reply
            </button>
            <button
              type="button"
              className={`btn btn-sm ${activeTopSection === "campaigns" ? "btn-primary" : "btn-outline-light"}`}
              onClick={() => setActiveTopSection("campaigns")}
            >
              Campaigns
            </button>
            <button type="button" className="btn btn-primary btn-sm" onClick={saveSettings} disabled={savingSettings}>
              {savingSettings ? "Saving..." : "Save Settings"}
            </button>
          </div>
        </div>
        {error ? <div className="alert alert-danger">{error}</div> : null}
        {success ? <div className="alert alert-success">{success}</div> : null}
      </div>
      )}

      {activeTopSection === "auto" ? (
      <div className="row g-4 align-items-start">
        <div className="col-12 col-xl-4">
          <h4 className="mb-3">Keyword Reply Rules</h4>
          <div className={`small mb-2 ${ruleLimitReached ? "text-danger fw-semibold" : "text-secondary"}`}>
            {rules.length}/{keywordRulesLimit} keyword rules used.
          </div>
          <div className="d-flex flex-column gap-3">
            <label className="form-label">Keyword</label>
            <input
              ref={keywordInputRef}
              className="form-control"
              required
              maxLength={RULE_KEYWORD_CHAR_LIMIT}
              value={ruleForm.keyword}
              onChange={(e) => {
                if (keywordInputRef.current) keywordInputRef.current.setCustomValidity("");
                setRuleForm((p) => ({ ...p, keyword: limitText(e.target.value, RULE_KEYWORD_CHAR_LIMIT) }));
              }}
              placeholder="price / support / hello"
            />
            <label className="form-label">Reply Message</label>
            <TinyHtmlEditor
              label=""
              value={ruleForm.reply_message}
              onChange={(next) => setRuleForm((p) => ({ ...p, reply_message: next }))}
              placeholder="Type reply with formatting. It will be converted to WhatsApp format on save."
              minHeight={220}
              maxWords={0}
              maxChars={RULE_REPLY_CHAR_LIMIT}
            />
            <div className="small text-secondary">
              Converted and saved as WhatsApp-friendly text ({RULE_REPLY_CHAR_LIMIT} chars max).
            </div>
            <div className="form-check">
              <input className="form-check-input" type="checkbox" checked={Boolean(ruleForm.is_default)} onChange={(e) => setRuleForm((p) => ({ ...p, is_default: e.target.checked }))} id="waRuleDefault" />
              <label className="form-check-label" htmlFor="waRuleDefault">Set as default fallback rule</label>
            </div>
            <div className="d-flex align-items-center gap-2 flex-wrap">
              <button type="button" className="btn btn-primary btn-sm" onClick={saveRule} disabled={savingRule || ruleLimitReached}>
                {savingRule ? "Saving..." : ruleForm.id ? "Update Rule" : "Add Rule"}
              </button>
              {ruleForm.id ? <button type="button" className="btn btn-outline-light btn-sm" onClick={() => setRuleForm({ id: null, keyword: "", reply_message: "", is_default: false })}>Cancel Edit</button> : null}
            </div>
          </div>
        </div>
        <div className="col-12 col-xl-8">
          <h4 className="mb-3">Keyword Table</h4>
          <div className="mb-2">
            <input
              className="form-control form-control-sm"
              style={{ maxWidth: 280 }}
              value={ruleSearch}
              onChange={(e) => setRuleSearch(e.target.value)}
              placeholder="Search keyword/reply"
            />
          </div>
          <div className="wz-data-table-wrap">
            <table className="table wz-data-table align-middle mb-0">
              <thead>
                <tr>
                  <th style={{ width: "20%" }}>Keyword</th>
                  <th style={{ width: "56%" }}>Reply</th>
                  <th style={{ width: "10%" }}>Default</th>
                  <th style={{ width: "14%" }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {pagedRules.length ? pagedRules.map((row) => (
                  <tr key={row.id}>
                    <td>{row.keyword || "-"}</td>
                    <td className="text-secondary" style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{row.reply_message}</td>
                    <td className="wa-default-cell">
                      {row.is_default ? <span className="badge bg-success">Yes</span> : <span className="badge bg-secondary">No</span>}
                    </td>
                    <td>
                      <div className="d-flex gap-1 justify-content-start flex-nowrap">
                        <button
                          type="button"
                          className="btn btn-outline-light btn-sm"
                          onClick={() => setRuleForm({
                            id: row.id,
                            keyword: row.keyword || "",
                            reply_message: plainTextToHtml(row.reply_message || ""),
                            is_default: toStrictBoolean(row.is_default),
                          })}
                        >
                          Edit
                        </button>
                        <button type="button" className="btn btn-outline-danger btn-sm" onClick={() => deleteRule(row.id)}>Delete</button>
                      </div>
                    </td>
                  </tr>
                )) : (
                  <tr><td colSpan="4" className="text-secondary">No rules found.</td></tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="d-flex justify-content-end align-items-center gap-2 mt-2">
            <button type="button" className="btn btn-outline-light btn-sm" disabled={safeRulePage <= 1} onClick={() => setRulePage((p) => Math.max(1, p - 1))}>Prev</button>
            <span className="small text-secondary">{safeRulePage}/{ruleTotalPages}</span>
            <button type="button" className="btn btn-outline-light btn-sm" disabled={safeRulePage >= ruleTotalPages} onClick={() => setRulePage((p) => Math.min(ruleTotalPages, p + 1))}>Next</button>
          </div>
        </div>
      </div>
      ) : null}

      {activeTopSection === "campaigns" ? (
      <>
      <div className="row g-4 align-items-start">
        <div className="col-12 col-xl-4">
          <h4 className="mb-2">Marketing Contacts</h4>
          <div className="small text-secondary mb-3">
            Opted-in contacts only: {optedInCount}/{contacts.length}
          </div>
          <div className="d-flex flex-column gap-2">
            <input
              className="form-control"
              placeholder="Name"
              value={contactForm.name}
              onChange={(e) => setContactForm((p) => ({ ...p, name: e.target.value }))}
            />
            <input
              className="form-control"
              placeholder="Phone number (E.164 digits)"
              value={contactForm.phone_number}
              onChange={(e) => setContactForm((p) => ({ ...p, phone_number: e.target.value }))}
            />
            <input
              className="form-control"
              placeholder="Email"
              value={contactForm.email}
              onChange={(e) => setContactForm((p) => ({ ...p, email: e.target.value }))}
            />
            <input
              className="form-control"
              placeholder="Tags (comma separated)"
              value={contactForm.tags}
              onChange={(e) => setContactForm((p) => ({ ...p, tags: e.target.value }))}
            />
            <input
              className="form-control"
              placeholder="Opt-in source (form, website, offline)"
              value={contactForm.opt_in_source}
              onChange={(e) => setContactForm((p) => ({ ...p, opt_in_source: e.target.value }))}
            />
            <textarea
              className="form-control"
              rows={2}
              placeholder="Consent note (how user gave permission)"
              value={contactForm.consent_note}
              onChange={(e) => setContactForm((p) => ({ ...p, consent_note: e.target.value }))}
            />
            <div className="form-check">
              <input
                className="form-check-input"
                type="checkbox"
                id="waMarketingOptIn"
                checked={Boolean(contactForm.is_opted_in)}
                onChange={(e) => setContactForm((p) => ({ ...p, is_opted_in: e.target.checked }))}
              />
              <label className="form-check-label" htmlFor="waMarketingOptIn">Explicit opt-in received</label>
            </div>
            <div className="d-flex gap-2 flex-wrap">
              <button type="button" className="btn btn-primary btn-sm" onClick={saveContact} disabled={savingContact}>
                {savingContact ? "Saving..." : contactForm.id ? "Update Contact" : "Add Contact"}
              </button>
              {contactForm.id ? (
                <button
                  type="button"
                  className="btn btn-outline-light btn-sm"
                  onClick={() => setContactForm({ id: null, name: "", phone_number: "", email: "", tags: "", is_opted_in: true, consent_note: "", opt_in_source: "manual" })}
                >
                  Cancel
                </button>
              ) : null}
            </div>
          </div>
        </div>

        <div className="col-12 col-xl-4">
          <h4 className="mb-2">Campaign Composer</h4>
          <div className="small text-secondary mb-3">
            Template-only send. Include STOP opt-out in compliance note.
          </div>
          <div className="row g-2">
            <div className="col-12 col-md-6">
              <input
                className="form-control"
                placeholder="Campaign name"
                value={campaignForm.name}
                onChange={(e) => setCampaignForm((p) => ({ ...p, name: e.target.value }))}
              />
            </div>
            <div className="col-12 col-md-6">
              <input
                className="form-control"
                placeholder="Approved template name (example: promo_offer_v1)"
                value={campaignForm.template_name}
                onChange={(e) => setCampaignForm((p) => ({ ...p, template_name: e.target.value }))}
              />
            </div>
            <div className="col-12">
              <input
                className="form-control"
                placeholder="Template variables (comma separated)"
                value={campaignForm.template_variables}
                onChange={(e) => setCampaignForm((p) => ({ ...p, template_variables: e.target.value }))}
              />
            </div>
            <div className="col-12">
              <textarea
                className="form-control"
                rows={2}
                placeholder="Compliance note with STOP instruction"
                value={campaignForm.compliance_note}
                onChange={(e) => setCampaignForm((p) => ({ ...p, compliance_note: e.target.value }))}
              />
            </div>
            <div className="col-12 d-flex align-items-center gap-2">
              <div className="form-check">
                <input
                  className="form-check-input"
                  type="checkbox"
                  id="waSendNow"
                  checked={Boolean(campaignForm.send_now)}
                  onChange={(e) => setCampaignForm((p) => ({ ...p, send_now: e.target.checked }))}
                />
                <label className="form-check-label" htmlFor="waSendNow">Send now</label>
              </div>
              <button type="button" className="btn btn-primary btn-sm" onClick={sendCampaign} disabled={savingCampaign}>
                {savingCampaign ? "Submitting..." : "Create Campaign"}
              </button>
            </div>
          </div>
          <div className="mt-3">
            <div className="small fw-semibold mb-1">Select Contacts (optional)</div>
            <div className="small text-secondary mb-2">
              If none selected, all opted-in contacts are used.
            </div>
            <div className="d-flex flex-wrap gap-2" style={{ maxHeight: 120, overflowY: "auto" }}>
              {contacts.map((row) => (
                <label className="form-check d-flex align-items-center gap-1" key={row.id}>
                  <input
                    className="form-check-input"
                    type="checkbox"
                    checked={selectedContactIds.includes(row.id)}
                    onChange={(e) => {
                      setSelectedContactIds((prev) => {
                        if (e.target.checked) return [...prev, row.id];
                        return prev.filter((id) => id !== row.id);
                      });
                    }}
                  />
                  <span className={row.is_opted_in && !row.has_opted_out ? "" : "text-danger"}>
                    {row.name || row.phone_number}
                  </span>
                </label>
              ))}
            </div>
          </div>
        </div>

        <div className="col-12 col-xl-4">
          <h4 className="mb-2">CSV Import</h4>
          <div className="small text-secondary mb-3">
            Bulk add contacts with explicit consent only.
          </div>
          <textarea
            className="form-control"
            rows={12}
            value={csvText}
            onChange={(e) => setCsvText(e.target.value)}
            placeholder={"phone_number,name,email,tags,is_opted_in,opt_in_source,consent_note\n919999999999,John Doe,john@mail.com,retail,true,web_form,Checked opt-in box"}
          />
          <div className="small text-secondary mt-2">
            `is_opted_in=true` only for explicit consent users.
          </div>
          <button type="button" className="btn btn-outline-light btn-sm mt-2" onClick={importCsvContacts} disabled={importingCsv}>
            {importingCsv ? "Importing..." : "Import CSV"}
          </button>
        </div>
      </div>

      <div className="row g-4 align-items-start">
        <div className="col-12">
          <div className="d-flex align-items-center justify-content-between gap-2 mb-3">
            <h4 className="mb-0">Contacts</h4>
            <button type="button" className="btn btn-outline-light btn-sm" onClick={exportContactsCsv}>
              <i className="bi bi-file-earmark-excel me-1" aria-hidden="true" />
              Export Contacts
            </button>
          </div>
          <div className="mb-2">
            <input
              className="form-control form-control-sm"
              style={{ maxWidth: 280 }}
              value={contactSearch}
              onChange={(e) => setContactSearch(e.target.value)}
              placeholder="Search contact/phone/email"
            />
          </div>
          <div className="wz-data-table-wrap">
            <table className="table wz-data-table align-middle mb-0">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Phone</th>
                  <th>Consent</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {pagedContacts.length ? pagedContacts.map((row) => (
                  <tr key={row.id}>
                    <td>{row.name || "-"}</td>
                    <td>{row.phone_number}</td>
                    <td>
                      {row.has_opted_out
                        ? <span className="badge bg-danger">Opted-out</span>
                        : row.is_opted_in
                          ? <span className="badge bg-success">Opted-in</span>
                          : <span className="badge bg-secondary">No consent</span>}
                    </td>
                    <td>
                      <div className="d-flex gap-1 flex-wrap">
                        <button
                          type="button"
                          className="btn btn-outline-light btn-sm"
                          onClick={() => setContactForm({
                            id: row.id,
                            name: row.name || "",
                            phone_number: row.phone_number || "",
                            email: row.email || "",
                            tags: row.tags || "",
                            is_opted_in: Boolean(row.is_opted_in),
                            consent_note: row.consent_note || "",
                            opt_in_source: row.opt_in_source || "manual",
                          })}
                        >
                          Edit
                        </button>
                        {!row.has_opted_out ? (
                          <button type="button" className="btn btn-outline-warning btn-sm" onClick={() => optOutContact(row.phone_number)}>
                            STOP
                          </button>
                        ) : null}
                        <button type="button" className="btn btn-outline-danger btn-sm" onClick={() => deleteContact(row.id)}>
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                )) : <tr><td colSpan="4" className="text-secondary">No contacts found.</td></tr>}
              </tbody>
            </table>
          </div>
          <div className="d-flex justify-content-end align-items-center gap-2 mt-2">
            <button type="button" className="btn btn-outline-light btn-sm" disabled={safeContactPage <= 1} onClick={() => setContactPage((p) => Math.max(1, p - 1))}>Prev</button>
            <span className="small text-secondary">{safeContactPage}/{contactTotalPages}</span>
            <button type="button" className="btn btn-outline-light btn-sm" disabled={safeContactPage >= contactTotalPages} onClick={() => setContactPage((p) => Math.min(contactTotalPages, p + 1))}>Next</button>
          </div>
        </div>

        <div className="col-12">
          <h4 className="mb-3">Campaigns</h4>
          <div className="mb-2">
            <input
              className="form-control form-control-sm"
              style={{ maxWidth: 280 }}
              value={campaignSearch}
              onChange={(e) => setCampaignSearch(e.target.value)}
              placeholder="Search campaign/status/template"
            />
          </div>
          <div className="wz-data-table-wrap">
            <table className="table wz-data-table align-middle mb-0">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Status</th>
                  <th>Count</th>
                  <th>Retry</th>
                </tr>
              </thead>
              <tbody>
                {pagedCampaigns.length ? pagedCampaigns.map((row) => (
                  <tr key={row.id}>
                    <td>{row.name}</td>
                    <td>{row.status}</td>
                    <td>{row.sent_count}/{row.total_contacts}</td>
                    <td>
                      <button
                        type="button"
                        className="btn btn-outline-light btn-sm"
                        disabled={retryingCampaignId === row.id}
                        onClick={() => retryFailed(row.id)}
                      >
                        {retryingCampaignId === row.id ? "Retrying..." : "Retry Failed"}
                      </button>
                    </td>
                  </tr>
                )) : <tr><td colSpan="4" className="text-secondary">No campaigns found.</td></tr>}
              </tbody>
            </table>
          </div>
          <div className="d-flex justify-content-end align-items-center gap-2 mt-2">
            <button type="button" className="btn btn-outline-light btn-sm" disabled={safeCampaignPage <= 1} onClick={() => setCampaignPage((p) => Math.max(1, p - 1))}>Prev</button>
            <span className="small text-secondary">{safeCampaignPage}/{campaignTotalPages}</span>
            <button type="button" className="btn btn-outline-light btn-sm" disabled={safeCampaignPage >= campaignTotalPages} onClick={() => setCampaignPage((p) => Math.min(campaignTotalPages, p + 1))}>Next</button>
          </div>
        </div>

        <div className="col-12">
          <h5 className="mb-2">Delivery Status Log</h5>
          <div className="mb-2">
            <input
              className="form-control form-control-sm"
              style={{ maxWidth: 280 }}
              value={deliverySearch}
              onChange={(e) => setDeliverySearch(e.target.value)}
              placeholder="Search phone/status/error"
            />
          </div>
          <div className="wz-data-table-wrap">
            <table className="table wz-data-table align-middle mb-0">
              <thead>
                <tr>
                  <th>Phone</th>
                  <th>Status</th>
                  <th>Error</th>
                  <th>Attempted</th>
                </tr>
              </thead>
              <tbody>
                {pagedDeliveries.length ? pagedDeliveries.map((row) => (
                  <tr key={row.id}>
                    <td>{row.phone_number}</td>
                    <td>{row.status}</td>
                    <td>{row.error_code || "-"}</td>
                    <td>{formatDateTime(row.attempted_at)}</td>
                  </tr>
                )) : <tr><td colSpan="4" className="text-secondary">No deliveries found.</td></tr>}
              </tbody>
            </table>
          </div>
          <div className="d-flex justify-content-end align-items-center gap-2 mt-2">
            <button type="button" className="btn btn-outline-light btn-sm" disabled={safeDeliveryPage <= 1} onClick={() => setDeliveryPage((p) => Math.max(1, p - 1))}>Prev</button>
            <span className="small text-secondary">{safeDeliveryPage}/{deliveryTotalPages}</span>
            <button type="button" className="btn btn-outline-light btn-sm" disabled={safeDeliveryPage >= deliveryTotalPages} onClick={() => setDeliveryPage((p) => Math.min(deliveryTotalPages, p + 1))}>Next</button>
          </div>
        </div>
      </div>
      </>
      ) : null}
    </div>
  );
}
