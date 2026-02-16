import { useEffect, useMemo, useState } from "react";
import { apiFetch, getCsrfToken } from "../lib/api.js";
import { useConfirm } from "../components/ConfirmDialog.jsx";
import { formatDeviceDateTime } from "../lib/datetime.js";

const emptySettings = {
  loading: true,
  saving: false,
  error: "",
  success: "",
  premadeRepliesText: "",
  allowVisitorAttachments: false
};

const emptyMedia = {
  loading: true,
  error: "",
  items: [],
  usageBytes: 0,
  limitBytes: null
};

const emptyFaqs = {
  loading: true,
  error: "",
  items: [],
  remaining: 50,
  limit: 50
};

function formatBytes(bytes) {
  const value = Number(bytes || 0);
  if (!value) {
    return "0 MB";
  }
  const mb = value / (1024 * 1024);
  if (mb < 1024) {
    return `${mb.toFixed(1)} MB`;
  }
  return `${(mb / 1024).toFixed(2)} GB`;
}

function formatType(type) {
  if (!type) {
    return "-";
  }
  return String(type).replace(/_/g, " ").replace(/\b\w/g, (match) => match.toUpperCase());
}

async function fetchFormData(url, formData) {
  if (!getCsrfToken()) {
    await fetch("/api/auth/csrf", { credentials: "include" });
  }
  const response = await fetch(url, {
    method: "POST",
    credentials: "include",
    headers: {
      "X-CSRFToken": getCsrfToken()
    },
    body: formData
  });
  const text = await response.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch (error) {
      data = null;
    }
  }
  if (!response.ok) {
    const message = data?.detail || data?.error || `Request failed (${response.status})`;
    const err = new Error(message);
    err.status = response.status;
    err.data = data;
    throw err;
  }
  return data;
}

export default function AiChatbotChatSettingsPage() {
  const [settings, setSettings] = useState(emptySettings);
  const [media, setMedia] = useState(emptyMedia);
  const [faqs, setFaqs] = useState(emptyFaqs);
  const [docName, setDocName] = useState("");
  const [docUploading, setDocUploading] = useState(false);
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [websiteName, setWebsiteName] = useState("");
  const [websiteUploading, setWebsiteUploading] = useState(false);
  const [websiteScan, setWebsiteScan] = useState({ open: false, pages: [], total: 0, allowed: 0, selected: [] });
  const [extraName, setExtraName] = useState("");
  const [extraContent, setExtraContent] = useState("");
  const [extraUploading, setExtraUploading] = useState(false);
  const [faqQuestion, setFaqQuestion] = useState("");
  const [faqAnswer, setFaqAnswer] = useState("");
  const MAX_FAQ_QUESTION = 75;
  const MAX_FAQ_ANSWER = 250;
  const MEDIA_PAGE_SIZE = 10;
  const FAQ_PAGE_SIZE = 10;
  const [faqSaving, setFaqSaving] = useState(false);
  const [editingFaq, setEditingFaq] = useState(null);
  const [reuploadingId, setReuploadingId] = useState(null);
  const [websiteReuploadNote, setWebsiteReuploadNote] = useState("");
  const [websiteWarning, setWebsiteWarning] = useState("");
  const [deleteModal, setDeleteModal] = useState({ open: false, id: null });
  const [viewFaq, setViewFaq] = useState({ open: false, question: "", answer: "" });
  const [mediaSearch, setMediaSearch] = useState("");
  const [mediaPage, setMediaPage] = useState(1);
  const [faqSearch, setFaqSearch] = useState("");
  const [faqPage, setFaqPage] = useState(1);
  const recommendedOrder = ["home", "about", "services", "pricing", "contact", "faq", "policies"];
  const confirm = useConfirm();

  function toSearchString(value) {
    if (value === null || value === undefined) {
      return "";
    }
    return String(value).toLowerCase();
  }

  function buildPageList(current, total) {
    const pages = [];
    const start = Math.max(1, current - 2);
    const end = Math.min(total, current + 2);
    for (let page = start; page <= end; page += 1) {
      pages.push(page);
    }
    return pages;
  }

  function buildRecommendedSelection(pages, limit) {
    if (!pages.length || !limit) {
      return [];
    }
    const byType = {};
    pages.forEach((page) => {
      const type = page.type || "other";
      if (!byType[type]) {
        byType[type] = [];
      }
      byType[type].push(page.url);
    });
    const selected = [];
    recommendedOrder.forEach((type) => {
      const candidates = byType[type] || [];
      candidates.forEach((url) => {
        if (selected.length < limit && !selected.includes(url)) {
          selected.push(url);
        }
      });
    });
    return selected;
  }

  function buildWebsiteErrorMessage(error) {
    const data = error?.data || {};
    if (data?.status !== "failed") {
      return null;
    }
    const titleMap = {
      INVALID_URL: "Invalid URL",
      WEBSITE_NOT_REACHABLE: "Website not reachable",
      ACCESS_BLOCKED: "Website Access Restricted",
      JS_RENDER_REQUIRED: "Website needs JavaScript",
      LOGIN_REQUIRED: "Login required",
      NO_READABLE_CONTENT: "No readable content"
    };
    return {
      title: titleMap[data.error_code] || "Website import failed",
      reason: data.reason || "Unable to import website content.",
      suggestion: data.suggestion || "Try another URL or upload a Word file.",
      infoNote: data.info_note || "",
      errorCode: data.error_code || ""
    };
  }

  async function loadSettings() {
    try {
      const data = await apiFetch("/api/ai-chatbot/org/chat-settings");
      setSettings((prev) => ({
        ...prev,
        loading: false,
        error: "",
        premadeRepliesText: (data.premade_replies || []).join("\n"),
        allowVisitorAttachments: Boolean(data.allow_visitor_attachments)
      }));
    } catch (error) {
      setSettings((prev) => ({
        ...prev,
        loading: false,
        error: error?.message || "Unable to load chat settings."
      }));
    }
  }

  async function loadMedia() {
    try {
      const data = await apiFetch("/api/ai-chatbot/media-library");
      setMedia({
        loading: false,
        error: "",
        items: data.items || [],
        usageBytes: data.usage_bytes || 0,
        limitBytes: data.limit_bytes ?? null
      });
    } catch (error) {
      setMedia((prev) => ({
        ...prev,
        loading: false,
        error: error?.message || "Unable to load media library."
      }));
    }
  }

  async function loadFaqs() {
    try {
      const data = await apiFetch("/api/ai-chatbot/faqs");
      setFaqs({
        loading: false,
        error: "",
        items: data.items || [],
        remaining: data.remaining ?? 0,
        limit: data.limit ?? 50
      });
    } catch (error) {
      setFaqs((prev) => ({
        ...prev,
        loading: false,
        error: error?.message || "Unable to load FAQs."
      }));
    }
  }

  useEffect(() => {
    let active = true;
    async function loadAll() {
      await Promise.all([loadSettings(), loadMedia(), loadFaqs()]);
    }
    if (active) {
      loadAll();
    }
    return () => {
      active = false;
    };
  }, []);

  async function handleSaveSettings() {
    if (settings.saving) {
      return;
    }
    setSettings((prev) => ({ ...prev, saving: true, success: "", error: "" }));
    try {
      const data = await apiFetch("/api/ai-chatbot/org/chat-settings", {
        method: "PATCH",
        body: JSON.stringify({
          premade_replies: settings.premadeRepliesText,
          allow_visitor_attachments: settings.allowVisitorAttachments
        })
      });
      setSettings((prev) => ({
        ...prev,
        saving: false,
        success: "Settings updated.",
        premadeRepliesText: (data.premade_replies || []).join("\n"),
        allowVisitorAttachments: Boolean(data.allow_visitor_attachments)
      }));
    } catch (error) {
      setSettings((prev) => ({
        ...prev,
        saving: false,
        error: error?.message || "Unable to save chat settings."
      }));
    }
  }

  async function handleDocumentUpload(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || docUploading) {
      return;
    }
    if (file.size && file.size > 2 * 1024 * 1024) {
      setMedia((prev) => ({
        ...prev,
        error: "File too large. Maximum upload size is 2MB."
      }));
      return;
    }
    setDocUploading(true);
    setMedia((prev) => ({ ...prev, error: "" }));
    try {
      const formData = new FormData();
      formData.append("file", file);
      if (docName.trim()) {
        formData.append("name", docName.trim());
      }
      await fetchFormData("/api/ai-chatbot/media-library", formData);
      setDocName("");
      await loadMedia();
    } catch (error) {
      setMedia((prev) => ({
        ...prev,
        error: error?.message || "Unable to upload document."
      }));
    } finally {
      setDocUploading(false);
    }
  }

  async function handleWebsiteImport() {
    if (!websiteUrl.trim() || websiteUploading) {
      return;
    }
    setWebsiteUploading(true);
    setMedia((prev) => ({ ...prev, error: "" }));
    try {
      const data = await apiFetch("/api/ai-chatbot/media-library/website-import", {
        method: "POST",
        body: JSON.stringify({
          source_url: websiteUrl.trim(),
          name: websiteName.trim()
        })
      });
      setWebsiteUrl("");
      setWebsiteName("");
      if (data?.status === "warning" && (data?.code === "LIMITED_CONTENT" || data?.code === "ONLY_HOMEPAGE_IMPORTED")) {
        setWebsiteWarning(`${data.message} ${data.suggestion}`);
      } else {
        setWebsiteWarning("");
      }
      await loadMedia();
    } catch (error) {
      if (error?.status === 409 && error?.data?.detail === "website_page_limit_exceeded") {
        const pages = error.data.pages || [];
        const allowed = Number(error.data.allowed_pages || 0);
        const selected = buildRecommendedSelection(pages, allowed);
        setWebsiteScan({
          open: true,
          pages,
          total: Number(error.data.total_pages_found || pages.length || 0),
          allowed,
          selected
        });
        if (error.data.item) {
          await loadMedia();
        }
      } else {
        const websiteError = buildWebsiteErrorMessage(error);
        if (error?.data?.status === "blocked") {
          setMedia((prev) => ({
            ...prev,
            error: "Already submitted"
          }));
          return;
        }
        setMedia((prev) => ({
          ...prev,
          error: websiteError || (error?.message || "Unable to import website content.")
        }));
        if (error?.data?.item) {
          await loadMedia();
        }
      }
    } finally {
      setWebsiteUploading(false);
    }
  }

  async function handleWebsiteImportConfirm() {
    if (!websiteScan.selected.length || websiteUploading) {
      return;
    }
    setWebsiteUploading(true);
    setMedia((prev) => ({ ...prev, error: "" }));
    try {
      const data = await apiFetch("/api/ai-chatbot/media-library/website-import", {
        method: "POST",
        body: JSON.stringify({
          source_url: websiteUrl.trim(),
          name: websiteName.trim(),
          selected_pages: websiteScan.selected
        })
      });
      setWebsiteUrl("");
      setWebsiteName("");
      setWebsiteScan({ open: false, pages: [], total: 0, allowed: 0, selected: [] });
      if (data?.status === "warning" && (data?.code === "LIMITED_CONTENT" || data?.code === "ONLY_HOMEPAGE_IMPORTED")) {
        setWebsiteWarning(`${data.message} ${data.suggestion}`);
      } else {
        setWebsiteWarning("");
      }
      await loadMedia();
    } catch (error) {
      const websiteError = buildWebsiteErrorMessage(error);
      setMedia((prev) => ({
        ...prev,
        error: websiteError || (error?.message || "Unable to import selected pages.")
      }));
      if (error?.data?.item) {
        await loadMedia();
      }
    } finally {
      setWebsiteUploading(false);
    }
  }

  function toggleWebsitePage(url) {
    setWebsiteScan((prev) => {
      const selected = new Set(prev.selected);
      if (selected.has(url)) {
        selected.delete(url);
      } else if (prev.allowed === 0 || selected.size < prev.allowed) {
        selected.add(url);
      }
      return { ...prev, selected: Array.from(selected) };
    });
  }

  async function handleExtraText() {
    if (!extraContent.trim() || extraUploading) {
      return;
    }
    setExtraUploading(true);
    setMedia((prev) => ({ ...prev, error: "" }));
    try {
      await apiFetch("/api/ai-chatbot/media-library", {
        method: "POST",
        body: JSON.stringify({
          type: "extra_text",
          name: extraName.trim(),
          content: extraContent.trim()
        })
      });
      setExtraName("");
      setExtraContent("");
      await loadMedia();
    } catch (error) {
      setMedia((prev) => ({
        ...prev,
        error: error?.message || "Unable to save extra text."
      }));
    } finally {
      setExtraUploading(false);
    }
  }

  async function handleMediaDelete(id) {
    setMedia((prev) => ({ ...prev, error: "" }));
    try {
      await apiFetch("/api/ai-chatbot/media-library/delete", {
        method: "POST",
        body: JSON.stringify({ ids: [id] })
      });
      setWebsiteReuploadNote("");
      await loadMedia();
    } catch (error) {
      setMedia((prev) => ({
        ...prev,
        error: error?.message || "Unable to delete media."
      }));
    }
  }

  async function handleReupload(item, file) {
    if (!file || reuploadingId) {
      return;
    }
    setReuploadingId(item.id);
    setMedia((prev) => ({ ...prev, error: "" }));
    try {
      const formData = new FormData();
      formData.append("file", file);
      await fetchFormData(`/api/ai-chatbot/media-library/${item.id}/reupload`, formData);
      setWebsiteReuploadNote("");
      await loadMedia();
    } catch (error) {
      setMedia((prev) => ({
        ...prev,
        error: error?.message || "Unable to re-upload file."
      }));
    } finally {
      setReuploadingId(null);
    }
  }

  async function handleAddFaq() {
    if (!faqQuestion.trim() || !faqAnswer.trim() || faqSaving || editingFaq) {
      return;
    }
    setFaqSaving(true);
    setFaqs((prev) => ({ ...prev, error: "" }));
    try {
      await apiFetch("/api/ai-chatbot/faqs", {
        method: "POST",
        body: JSON.stringify({
          question: faqQuestion.trim(),
          answer: faqAnswer.trim()
        })
      });
      setFaqQuestion("");
      setFaqAnswer("");
      await loadFaqs();
    } catch (error) {
      setFaqs((prev) => ({
        ...prev,
        error: error?.message || "Unable to add FAQ."
      }));
    } finally {
      setFaqSaving(false);
    }
  }

  async function handleUpdateFaq() {
    if (!editingFaq || !editingFaq.question.trim() || !editingFaq.answer.trim()) {
      return;
    }

    const result = await confirm({
      title: "Confirm Save",
      message: "Are you sure you want to save the changes to this FAQ?",
      confirmVariant: "primary"
    });
    if (!result) {
      return;
    }

    setFaqs((prev) => ({ ...prev, error: "" }));
    try {
      await apiFetch(`/api/ai-chatbot/faqs/${editingFaq.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          question: editingFaq.question.trim(),
          answer: editingFaq.answer.trim()
        })
      });
      setEditingFaq(null);
      await loadFaqs();
    } catch (error) {
      setFaqs((prev) => ({
        ...prev,
        error: error?.message || "Unable to update FAQ."
      }));
    }
  }

  async function handleDeleteFaq(id) {
    const result = await confirm({
      title: "Confirm Deletion",
      message: "Are you sure you want to delete this FAQ?",
      confirmVariant: "danger"
    });
    if (!result) {
      return;
    }
    setFaqs((prev) => ({ ...prev, error: "" }));
    try {
      await apiFetch(`/api/ai-chatbot/faqs/${id}`, { method: "DELETE" });
      await loadFaqs();
    } catch (error) {
      setFaqs((prev) => ({
        ...prev,
        error: error?.message || "Unable to delete FAQ."
      }));
    }
  }

  useEffect(() => {
    setMediaPage(1);
  }, [mediaSearch]);

  useEffect(() => {
    setFaqPage(1);
  }, [faqSearch]);

  const filteredMedia = useMemo(() => {
    const term = mediaSearch.trim().toLowerCase();
    if (!term) {
      return media.items;
    }
    return media.items.filter((item) => {
      const haystack = [
        item.name,
        item.type,
        item.source_url,
        item.text_content
      ]
        .map(toSearchString)
        .join(" ");
      return haystack.includes(term);
    });
  }, [media.items, mediaSearch]);

  const mediaTotalPages = Math.max(1, Math.ceil(filteredMedia.length / MEDIA_PAGE_SIZE));
  const pagedMedia = useMemo(() => {
    const start = (mediaPage - 1) * MEDIA_PAGE_SIZE;
    return filteredMedia.slice(start, start + MEDIA_PAGE_SIZE);
  }, [filteredMedia, mediaPage]);

  useEffect(() => {
    if (mediaPage > mediaTotalPages) {
      setMediaPage(mediaTotalPages);
    }
  }, [mediaPage, mediaTotalPages]);

  const filteredFaqs = useMemo(() => {
    const term = faqSearch.trim().toLowerCase();
    if (!term) {
      return faqs.items;
    }
    return faqs.items.filter((item) => {
      const haystack = [item.question, item.answer].map(toSearchString).join(" ");
      return haystack.includes(term);
    });
  }, [faqs.items, faqSearch]);

  const faqTotalPages = Math.max(1, Math.ceil(filteredFaqs.length / FAQ_PAGE_SIZE));
  const pagedFaqs = useMemo(() => {
    const start = (faqPage - 1) * FAQ_PAGE_SIZE;
    return filteredFaqs.slice(start, start + FAQ_PAGE_SIZE);
  }, [filteredFaqs, faqPage]);

  useEffect(() => {
    if (faqPage > faqTotalPages) {
      setFaqPage(faqTotalPages);
    }
  }, [faqPage, faqTotalPages]);

  const storageText = useMemo(() => {
    if (!media.limitBytes) {
      return `${formatBytes(media.usageBytes)} used (Unlimited)`;
    }
    return `${formatBytes(media.usageBytes)} / ${formatBytes(media.limitBytes)}`;
  }, [media.usageBytes, media.limitBytes]);

  return (
    <div className="container-fluid">
      <div className="d-flex align-items-center justify-content-between mb-3">
        <div>
          <h2 className="mb-1">AI Chatbot Settings</h2>
          <div className="text-secondary">Manage chat behavior and AI training data.</div>
        </div>
      </div>

      {settings.error ? <div className="alert alert-danger">{settings.error}</div> : null}
      {settings.success ? <div className="alert alert-success">{settings.success}</div> : null}

      <div className="row g-3 mb-4">
        <div className="col-12 col-lg-3">
          <div className="card p-3 h-100">
            <div className="mb-3">
              <label className="form-label">Premade Replies Option for Chat Agent</label>
              <textarea
                className="form-control"
                rows={6}
                placeholder="Enter one reply per line."
                value={settings.premadeRepliesText}
                onChange={(event) =>
                  setSettings((prev) => ({ ...prev, premadeRepliesText: event.target.value }))
                }
                disabled={settings.loading || settings.saving}
              />
              <div className="form-text">Each line becomes a quick reply in the inbox.</div>
            </div>

            <div className="d-flex justify-content-end">
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleSaveSettings}
                disabled={settings.loading || settings.saving}
              >
                {settings.saving ? "Saving..." : "Save Settings"}
              </button>
            </div>
          </div>
        </div>
        <div className="col-12 col-lg-9">
          <div className="card p-3 h-100">
            <div className="d-flex align-items-center justify-content-between mb-3">
              <h5 className="mb-0">AI Media Library</h5>
              <div style={{ minWidth: "220px" }}>
                <input
                  type="text"
                  className="form-control form-control-sm"
                  placeholder="Search media"
                  value={mediaSearch}
                  onChange={(event) => setMediaSearch(event.target.value)}
                />
              </div>
            </div>
            <div className="table-responsive">
              <table className="table table-dark table-hover align-middle mb-0">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Type</th>
                    <th>Source</th>
                    <th>Size</th>
                    <th>Updated</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {media.loading ? (
                    <tr>
                      <td colSpan={6}>Loading...</td>
                    </tr>
                  ) : pagedMedia.length ? (
                    pagedMedia.map((item) => {
                      const isWebsiteData = item.type === "word_website_data";
                      const isPendingWebsite = isWebsiteData && !item.file_url;
                      const updatedAt = item.updated_at || item.created_at;
                      return (
                        <tr key={item.id}>
                          <td>{item.name || "-"}</td>
                          <td>
                            {formatType(item.type)}
                            {isPendingWebsite ? (
                              <div className="small text-warning">Website data pending upload</div>
                            ) : null}
                          </td>
                          <td className="text-break">
                            {item.source_url || item.text_content || "-"}
                          </td>
                          <td>{formatBytes(item.file_size)}</td>
                          <td>{formatDeviceDateTime(updatedAt)}</td>
                          <td>
                            <div className="d-flex gap-2 flex-wrap">
                              {item.file_url ? (
                                <a
                                  className="btn btn-outline-light btn-sm"
                                  href={item.file_url}
                                  target="_blank"
                                  rel="noreferrer"
                                >
                                  Download
                                </a>
                              ) : null}
                              {isWebsiteData ? (
                                <label
                                  className="btn btn-outline-light btn-sm mb-0"
                                  onClick={() => {
                                    if (isPendingWebsite) {
                                      setWebsiteReuploadNote(
                                        "Please upload the main website content as a Word file. Include About, Services, Pricing, and Support pages."
                                      );
                                    }
                                  }}
                                >
                                  {reuploadingId === item.id ? "Re-uploading..." : "Re-upload"}
                                  <input
                                    type="file"
                                    accept=".docx"
                                    onChange={(event) => {
                                      const file = event.target.files?.[0];
                                      event.target.value = "";
                                      if (file) {
                                        handleReupload(item, file);
                                      }
                                    }}
                                    disabled={reuploadingId === item.id}
                                    hidden
                                  />
                                </label>
                              ) : null}
                              <button
                                type="button"
                                className="btn btn-outline-danger btn-sm"
                                onClick={() => setDeleteModal({ open: true, id: item.id })}
                              >
                                Delete
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan={6}>{mediaSearch ? "No matching media found." : "No training data yet."}</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="d-flex align-items-center justify-content-between mt-3">
              <div className="text-secondary small">
                Showing {pagedMedia.length} of {filteredMedia.length}
              </div>
              <nav aria-label="Media pagination">
                <ul className="pagination pagination-sm mb-0">
                  <li className={`page-item ${mediaPage === 1 ? "disabled" : ""}`}>
                    <button
                      type="button"
                      className="page-link"
                      onClick={() => setMediaPage((prev) => Math.max(1, prev - 1))}
                      disabled={mediaPage === 1}
                    >
                      Prev
                    </button>
                  </li>
                  {buildPageList(mediaPage, mediaTotalPages).map((page) => (
                    <li key={page} className={`page-item ${page === mediaPage ? "active" : ""}`}>
                      <button type="button" className="page-link" onClick={() => setMediaPage(page)}>
                        {page}
                      </button>
                    </li>
                  ))}
                  <li className={`page-item ${mediaPage === mediaTotalPages ? "disabled" : ""}`}>
                    <button
                      type="button"
                      className="page-link"
                      onClick={() => setMediaPage((prev) => Math.min(mediaTotalPages, prev + 1))}
                      disabled={mediaPage === mediaTotalPages}
                    >
                      Next
                    </button>
                  </li>
                </ul>
              </nav>
            </div>
          </div>
        </div>
      </div>

      <div className="d-flex align-items-center justify-content-between mb-2">
        <div>
          <h3 className="mb-1">AI Training</h3>
          <div className="text-secondary">Manage documents, website data, extra text, and FAQs.</div>
        </div>
        <div className="text-secondary">Storage: {storageText}</div>
      </div>

      {media.error ? (
        <div className="alert alert-danger">
          {typeof media.error === "string" ? (
            media.error
          ) : (
            <>
              <div className="fw-semibold">{media.error.title}</div>
              <div className="small mt-1">{media.error.reason}</div>
              {media.error.errorCode === "ACCESS_BLOCKED" ? (
                <div className="small mt-2">
                  Next steps:
                  <div>• Open the website in a browser</div>
                  <div>• Copy important pages (About, Services, Pricing, Support)</div>
                  <div>• Paste into a Word document</div>
                  <div>• Upload the Word file in AI Media Library</div>
                </div>
              ) : (
                <div className="small mt-1">Next: {media.error.suggestion}</div>
              )}
              {media.error.infoNote ? (
                <div className="small mt-2 text-info">{media.error.infoNote}</div>
              ) : null}
            </>
          )}
        </div>
      ) : null}
      {websiteWarning ? (
        <div className="alert alert-warning">{websiteWarning}</div>
      ) : null}
      {deleteModal.open ? (
        <div className="modal-overlay" onClick={() => setDeleteModal({ open: false, id: null })}>
          <div className="modal-panel" onClick={(event) => event.stopPropagation()}>
            <h5>Delete Media</h5>
            <div className="text-secondary small mb-3">Are you sure you want to delete this data?</div>
            <div className="d-flex justify-content-end gap-2">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setDeleteModal({ open: false, id: null })}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-danger"
                onClick={async () => {
                  const id = deleteModal.id;
                  setDeleteModal({ open: false, id: null });
                  if (id) {
                    await handleMediaDelete(id);
                  }
                }}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {viewFaq.open ? (
        <div className="modal-overlay" onClick={() => setViewFaq({ open: false, question: "", answer: "" })}>
          <div className="modal-panel" onClick={(event) => event.stopPropagation()}>
            <h5>FAQ Details</h5>
            <div className="text-secondary small mb-2">Question</div>
            <div className="mb-3">{viewFaq.question || "-"}</div>
            <div className="text-secondary small mb-2">Answer</div>
            <div className="mb-3">{viewFaq.answer || "-"}</div>
            <div className="d-flex justify-content-end">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setViewFaq({ open: false, question: "", answer: "" })}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {websiteReuploadNote ? (
        <div className="alert alert-info">
          {websiteReuploadNote}
        </div>
      ) : null}
      {faqs.error ? <div className="alert alert-danger">{faqs.error}</div> : null}

      <div className="row g-3 mb-4">
        <div className="col-12 col-xl-4">
          <div className="card p-3 h-100">
            <h5>Upload Document</h5>
            <div className="text-secondary mb-3">PDF, Word, or Text files only. Max 2MB.</div>
            <label className="form-label">Name (optional)</label>
            <input
              type="text"
              className="form-control mb-2"
              value={docName}
              onChange={(event) => setDocName(event.target.value)}
              placeholder="Quarterly report"
              disabled={docUploading}
            />
            <input
              type="file"
              className="form-control"
              accept=".pdf,.doc,.docx,.txt"
              onChange={handleDocumentUpload}
              disabled={docUploading}
            />
            <div className="form-text">Files are stored in your AI Media Library.</div>
          </div>
        </div>
        <div className="col-12 col-xl-4">
          <div className="card p-3 h-100">
            <h5>Website URL</h5>
            <div className="text-secondary mb-3">Fetch and convert website data into Word.</div>
            <label className="form-label">Title (optional)</label>
            <input
              type="text"
              className="form-control mb-2"
              value={websiteName}
              onChange={(event) => setWebsiteName(event.target.value)}
              placeholder="Help Center"
              disabled={websiteUploading}
            />
            <label className="form-label">Website URL</label>
            <input
              type="url"
              className="form-control mb-3"
              value={websiteUrl}
              onChange={(event) => setWebsiteUrl(event.target.value)}
              placeholder="https://example.com/docs"
              disabled={websiteUploading || media.items.some((item) => item.type === "word_website_data")}
            />
            <button
              type="button"
              className="btn btn-outline-light"
              onClick={handleWebsiteImport}
              disabled={websiteUploading || !websiteUrl.trim() || media.items.some((item) => item.type === "word_website_data")}
            >
              {websiteUploading ? "Importing..." : "Import Website"}
            </button>
            {media.items.some((item) => item.type === "word_website_data") ? (
              <div className="form-text mt-2">
                Already submitted. Delete the existing website data from the table to resubmit.
              </div>
            ) : null}
          </div>
        </div>
        <div className="col-12 col-xl-4">
          <div className="card p-3 h-100">
            <h5>Extra Text</h5>
            <div className="text-secondary mb-3">Add notes or summaries directly.</div>
            <label className="form-label">Title (optional)</label>
            <input
              type="text"
              className="form-control mb-2"
              value={extraName}
              onChange={(event) => setExtraName(event.target.value)}
              placeholder="Support notes"
              disabled={extraUploading}
            />
            <label className="form-label">Content</label>
            <textarea
              className="form-control mb-3"
              rows={4}
              value={extraContent}
              onChange={(event) => setExtraContent(event.target.value)}
              placeholder="Paste text to train the assistant."
              disabled={extraUploading}
            />
            <button
              type="button"
              className="btn btn-outline-light"
              onClick={handleExtraText}
              disabled={extraUploading || !extraContent.trim()}
            >
              {extraUploading ? "Saving..." : "Save Text"}
            </button>
          </div>
        </div>
      </div>


      <div className="card p-3">
        <div className="d-flex align-items-center justify-content-between mb-3">
          <div>
            <h5 className="mb-1">FAQs</h5>
            <div className="text-secondary">{faqs.remaining} of {faqs.limit} remaining</div>
          </div>
        </div>

        <div className="row">
          <div className="col-3">
            <div className="row">
              <div className="col-12 mb-3">
                <div className="d-flex align-items-center justify-content-between">
                  <label className="form-label mb-0">Question</label>
                  <div className="text-secondary small">({faqQuestion.length}/{MAX_FAQ_QUESTION})</div>
                </div>
                <input
                  type="text"
                  className="form-control"
                  placeholder="Question"
                  value={faqQuestion}
                  onChange={(event) => setFaqQuestion(event.target.value.slice(0, MAX_FAQ_QUESTION))}
                  disabled={faqSaving}
                  maxLength={MAX_FAQ_QUESTION}
                />
              </div>
              <div className="col-12 mb-3">
                <div className="d-flex align-items-center justify-content-between">
                  <label className="form-label mb-0">Answer</label>
                  <div className="text-secondary small">({faqAnswer.length}/{MAX_FAQ_ANSWER})</div>
                </div>
                <textarea
                  className="form-control"
                  placeholder="Answer"
                  value={faqAnswer}
                  onChange={(event) => setFaqAnswer(event.target.value.slice(0, MAX_FAQ_ANSWER))}
                  disabled={faqSaving}
                  rows={5}
                  maxLength={MAX_FAQ_ANSWER}
                />
              </div>
              <div className="col-6">
                <button
                  type="button"
                  className="btn btn-outline-light"
                  onClick={editingFaq ? handleUpdateFaq : handleAddFaq}
                  disabled={faqSaving || !faqQuestion.trim() || !faqAnswer.trim()}
                >
                  {faqSaving ? "Saving..." : (editingFaq ? "Save FAQ" : "Add FAQ")}
                </button>
              </div>
              {editingFaq ? (
                <div className="col-6 text-end">
                  <button
                    type="button"
                    className="btn btn-outline-secondary"
                    onClick={() => {
                      setEditingFaq(null);
                      setFaqQuestion("");
                      setFaqAnswer("");
                    }}
                  >
                    Cancel
                  </button>
                </div>
              ) : null}
            </div>
          </div>
          <div className="col-9">
            <div className="d-flex align-items-center justify-content-between mb-2">
              <div className="text-secondary small">Showing {pagedFaqs.length} of {filteredFaqs.length}</div>
              <div style={{ minWidth: "220px" }}>
                <input
                  type="text"
                  className="form-control form-control-sm"
                  placeholder="Search FAQs"
                  value={faqSearch}
                  onChange={(event) => setFaqSearch(event.target.value)}
                />
              </div>
            </div>
            <div className="table-responsive">
              <table className="table table-dark table-hover align-middle mb-0 faq-table">
                <thead>
                  <tr>
                    <th className="faq-col-question">Question</th>
                    <th className="faq-col-answer">Answer</th>
                    <th className="faq-col-actions">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {faqs.loading ? (
                    <tr>
                      <td colSpan={3}>Loading...</td>
                    </tr>
                  ) : pagedFaqs.length ? (
                    pagedFaqs.map((item) => (
                      <tr key={item.id}>
                        <td>{item.question}</td>
                        <td>{item.answer}</td>
                        <td className="faq-col-actions">
                          <div className="d-flex gap-2 flex-wrap">
                            <button
                              type="button"
                              className="btn btn-outline-light btn-sm"
                              onClick={() => setViewFaq({ open: true, question: item.question, answer: item.answer })}
                            >
                              View
                            </button>
                            <button
                              type="button"
                              className="btn btn-outline-light btn-sm"
                              onClick={() => {
                                setEditingFaq({ id: item.id });
                                setFaqQuestion(item.question);
                                setFaqAnswer(item.answer);
                              }}
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              className="btn btn-outline-danger btn-sm"
                              onClick={() => handleDeleteFaq(item.id)}
                            >
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={3}>{faqSearch ? "No matching FAQs found." : "No FAQs yet."}</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="d-flex justify-content-end mt-3">
              <nav aria-label="FAQ pagination">
                <ul className="pagination pagination-sm mb-0">
                  <li className={`page-item ${faqPage === 1 ? "disabled" : ""}`}>
                    <button
                      type="button"
                      className="page-link"
                      onClick={() => setFaqPage((prev) => Math.max(1, prev - 1))}
                      disabled={faqPage === 1}
                    >
                      Prev
                    </button>
                  </li>
                  {buildPageList(faqPage, faqTotalPages).map((page) => (
                    <li key={page} className={`page-item ${page === faqPage ? "active" : ""}`}>
                      <button type="button" className="page-link" onClick={() => setFaqPage(page)}>
                        {page}
                      </button>
                    </li>
                  ))}
                  <li className={`page-item ${faqPage === faqTotalPages ? "disabled" : ""}`}>
                    <button
                      type="button"
                      className="page-link"
                      onClick={() => setFaqPage((prev) => Math.min(faqTotalPages, prev + 1))}
                      disabled={faqPage === faqTotalPages}
                    >
                      Next
                    </button>
                  </li>
                </ul>
              </nav>
            </div>
          </div>
        </div>
      </div>

      {websiteScan.open ? (
        <div className="modal-overlay" onClick={() => setWebsiteScan({ open: false, pages: [], total: 0, allowed: 0, selected: [] })}>
          <div className="modal-panel" onClick={(event) => event.stopPropagation()}>
            <h5>Select Pages to Import</h5>
            <div className="text-secondary small mb-2">
              {websiteScan.total} pages detected. Your plan allows {websiteScan.allowed} pages.
            </div>
            <div className="text-secondary small mb-3">
              Selected {websiteScan.selected.length} / {websiteScan.allowed}
            </div>
            <div className="table-responsive" style={{ maxHeight: "320px", overflowY: "auto" }}>
              <table className="table table-dark table-hover mb-0">
                <thead>
                  <tr>
                    <th />
                    <th>Page</th>
                    <th>Type</th>
                  </tr>
                </thead>
                <tbody>
                  {websiteScan.pages.map((page) => {
                    const checked = websiteScan.selected.includes(page.url);
                    const disableCheck = !checked && websiteScan.allowed > 0 && websiteScan.selected.length >= websiteScan.allowed;
                    return (
                      <tr key={page.url}>
                        <td>
                          <input
                            type="checkbox"
                            checked={checked}
                            disabled={disableCheck}
                            onChange={() => toggleWebsitePage(page.url)}
                          />
                        </td>
                        <td className="text-break">{page.url}</td>
                        <td>{formatType(page.type)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="d-flex justify-content-end gap-2 mt-3">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setWebsiteScan({ open: false, pages: [], total: 0, allowed: 0, selected: [] })}
                disabled={websiteUploading}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleWebsiteImportConfirm}
                disabled={
                  websiteUploading
                  || !websiteScan.selected.length
                  || (websiteScan.allowed > 0 && websiteScan.selected.length > websiteScan.allowed)
                }
              >
                {websiteUploading ? "Importing..." : "Import Selected Pages"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
