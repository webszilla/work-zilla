import { useEffect, useMemo, useState } from "react";
import {
  createSocialAutomationCompany,
  createSocialPost,
  deleteSocialAutomationCompany,
  disconnectSocialConnection,
  getSocialAutomationOverview,
  getSocialAutomationPosts,
  publishSocialPost,
  saveSocialConnection,
  updateSocialAutomationCompany,
} from "../api/socialMediaAutomation.js";
import TinyHtmlEditor from "../components/TinyHtmlEditor.jsx";

const PLATFORM_ORDER = ["facebook", "instagram", "youtube", "x", "linkedin"];
const PLATFORM_LABELS = {
  facebook: "Facebook",
  instagram: "Instagram",
  youtube: "YouTube",
  x: "X.com",
  linkedin: "LinkedIn",
};
const PLATFORM_ENDPOINT_HINTS = {
  facebook: "Example: https://graph.facebook.com/v23.0/{page_id}/feed",
  instagram: "Example: https://graph.facebook.com/v23.0/{ig_user_id}/media",
  youtube: "Example: https://www.googleapis.com/youtube/v3/videos",
  x: "Example: https://api.x.com/2/tweets",
  linkedin: "Example: https://api.linkedin.com/v2/ugcPosts",
};

const PLATFORM_SPECS = {
  facebook: { textLimit: 2200, ratioMin: 0.8, ratioMax: 1.91 },
  instagram: { textLimit: 2200, ratioMin: 0.8, ratioMax: 1.91 },
  x: { textLimit: 280, hashtagLimit: 10, ratioMin: 0.8, ratioMax: 2.0 },
  linkedin: { textLimit: 3000, ratioMin: 1.6, ratioMax: 2.0 },
  youtube: { titleLimit: 100, textLimit: 5000, ratioMin: 1.6, ratioMax: 1.9 },
};

const initialConnectForm = {
  account_id: "",
  api_endpoint: "",
  access_token: "",
  token_type: "Bearer",
  scopes: "",
};

const initialComposer = {
  post_title: "",
  scheduled_at: "",
  uploaded_media_url: "",
  uploaded_media_name: "",
  uploaded_media_meta: null,
  shared: {
    facebook: true,
    instagram: false,
    title: "",
    text: "",
    html: "",
    media_url: "",
  },
  x: { enabled: false, title: "", text: "", html: "", media_url: "" },
  linkedin: { enabled: false, title: "", text: "", html: "", media_url: "" },
  youtube: { enabled: false, title: "", text: "", html: "", media_url: "" },
};

function buildPlatformForms() {
  return PLATFORM_ORDER.reduce((acc, platform) => {
    acc[platform] = { ...initialConnectForm };
    return acc;
  }, {});
}

function prettyStatus(value) {
  const raw = String(value || "").trim();
  if (!raw) return "-";
  return raw.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatLimit(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return "Unlimited";
  return String(parsed);
}

function stripHtml(html) {
  return String(html || "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function sectionEffectiveText(section) {
  const html = String(section?.html || "").trim();
  if (html) return stripHtml(html);
  return String(section?.text || "").trim();
}

function sectionEffectiveMedia(section, composer) {
  return String(section?.media_url || composer?.uploaded_media_url || "").trim();
}

function effectiveTitle(section, composer) {
  return String(section?.title || composer?.post_title || "").trim();
}

export default function SocialMediaAutomationPage() {
  const [tab, setTab] = useState("post");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [alert, setAlert] = useState("");

  const [savingConnect, setSavingConnect] = useState(false);
  const [savingAllConnect, setSavingAllConnect] = useState(false);
  const [savingPost, setSavingPost] = useState(false);

  const [connections, setConnections] = useState([]);
  const [posts, setPosts] = useState([]);
  const [usage, setUsage] = useState({ companies_used: 0, connected_accounts: 0, posts_this_month: 0 });

  const [companies, setCompanies] = useState([]);
  const [selectedCompanyId, setSelectedCompanyId] = useState("");
  const [companyAutoSearch, setCompanyAutoSearch] = useState("");
  const [companySearchOpen, setCompanySearchOpen] = useState(false);
  const [statusSearchOpen, setStatusSearchOpen] = useState(false);
  const [newCompanyName, setNewCompanyName] = useState("");
  const [creatingCompany, setCreatingCompany] = useState(false);

  const [companySearch, setCompanySearch] = useState("");
  const [companyPage, setCompanyPage] = useState(1);
  const [editingCompanyId, setEditingCompanyId] = useState("");
  const [editingCompanyName, setEditingCompanyName] = useState("");

  const [activePlatform, setActivePlatform] = useState("facebook");
  const [connectFormsByPlatform, setConnectFormsByPlatform] = useState(buildPlatformForms);

  const [planCapabilities, setPlanCapabilities] = useState({
    has_subscription: true,
    enabled: true,
    api_connect_enabled: true,
    posting_enabled: true,
    company_wise_enabled: true,
    company_count_limit: -1,
    social_accounts_limit: -1,
    scheduled_posts_limit: -1,
    trial_full_access: false,
  });

  const [composer, setComposer] = useState(initialComposer);

  const companyPageSize = 5;

  const connectionMap = useMemo(() => {
    const map = {};
    for (const row of connections || []) {
      if (row?.platform) map[row.platform] = row;
    }
    return map;
  }, [connections]);

  const selectedCompanyName = useMemo(() => {
    const row = companies.find((item) => String(item.id) === String(selectedCompanyId));
    return row?.name || "";
  }, [companies, selectedCompanyId]);

  const filteredCompanies = useMemo(() => {
    const q = String(companySearch || "").trim().toLowerCase();
    if (!q) return companies;
    return companies.filter((item) => String(item.name || "").toLowerCase().includes(q));
  }, [companies, companySearch]);

  const companyAutoMatches = useMemo(() => {
    const q = String(companyAutoSearch || "").trim().toLowerCase();
    const rows = !q
      ? companies
      : companies.filter((item) => String(item.name || "").toLowerCase().includes(q));
    return rows.slice(0, 8);
  }, [companies, companyAutoSearch]);

  const totalCompanyPages = Math.max(1, Math.ceil(filteredCompanies.length / companyPageSize));

  const pagedCompanies = useMemo(() => {
    const start = (companyPage - 1) * companyPageSize;
    return filteredCompanies.slice(start, start + companyPageSize);
  }, [filteredCompanies, companyPage]);

  useEffect(() => {
    if (companyPage > totalCompanyPages) {
      setCompanyPage(totalCompanyPages);
    }
  }, [companyPage, totalCompanyPages]);

  useEffect(() => {
    setCompanyAutoSearch(selectedCompanyName);
  }, [selectedCompanyName]);

  useEffect(() => {
    setConnectFormsByPlatform((prev) => {
      const next = { ...prev };
      for (const platform of PLATFORM_ORDER) {
        const row = connectionMap[platform];
        next[platform] = {
          ...next[platform],
          account_id: row?.account_id || "",
          api_endpoint: row?.api_endpoint || row?.api_base_url || "",
          access_token: "",
          token_type: row?.token_type || "Bearer",
          scopes: row?.scopes || "",
        };
      }
      return next;
    });
  }, [connectionMap]);

  async function loadOverview() {
    setLoading(true);
    setError("");
    try {
      const data = await getSocialAutomationOverview(selectedCompanyId);
      setPlanCapabilities(data?.plan_capabilities || {});
      setUsage(data?.usage || { companies_used: 0, connected_accounts: 0, posts_this_month: 0 });
      const companyRows = Array.isArray(data?.companies) ? data.companies : [];
      setCompanies(companyRows);

      const selectedFromApi = String(data?.selected_social_company_id || "");
      const fallback = selectedFromApi || String(companyRows?.[0]?.id || "");
      setSelectedCompanyId((prev) => {
        const prevStr = String(prev || "");
        if (prevStr && companyRows.some((item) => String(item.id) === prevStr)) {
          return prevStr;
        }
        return fallback;
      });

      setConnections(Array.isArray(data?.connections) ? data.connections : []);
      setPosts(Array.isArray(data?.posts) ? data.posts : []);
    } catch (err) {
      setError(err?.message || "Unable to load Social Media Automation.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadOverview();
  }, [selectedCompanyId]);

  function setSectionValue(sectionKey, field, value) {
    setComposer((prev) => ({
      ...prev,
      [sectionKey]: {
        ...prev[sectionKey],
        [field]: value,
      },
    }));
  }

  function handleAutoCompanySearch(value) {
    setCompanyAutoSearch(value);
    const normalized = String(value || "").trim().toLowerCase();
    if (!normalized) return;
    const picked = companies.find((item) => String(item.name || "").toLowerCase() === normalized);
    if (picked) {
      setSelectedCompanyId(String(picked.id));
    }
  }

  function selectCompanyFromAuto(item) {
    setCompanyAutoSearch(String(item?.name || ""));
    setSelectedCompanyId(String(item?.id || ""));
    setCompanySearchOpen(false);
    setStatusSearchOpen(false);
  }

  async function handleCreateCompany() {
    const name = String(newCompanyName || "").trim();
    if (!name) {
      setError("Enter company/group name.");
      return;
    }
    setCreatingCompany(true);
    setError("");
    setAlert("");
    try {
      const data = await createSocialAutomationCompany({ name });
      const rows = Array.isArray(data?.items) ? data.items : [];
      setCompanies(rows);
      setUsage(data?.usage || usage);
      const nextId = data?.company?.id || rows?.[rows.length - 1]?.id || "";
      if (nextId) setSelectedCompanyId(String(nextId));
      setAlert("Company created.");
      setNewCompanyName("");
    } catch (err) {
      setError(err?.message || "Unable to create company.");
    } finally {
      setCreatingCompany(false);
    }
  }

  async function handleUpdateCompany(companyId) {
    const name = String(editingCompanyName || "").trim();
    if (!name) {
      setError("Company name is required.");
      return;
    }
    setError("");
    setAlert("");
    try {
      const data = await updateSocialAutomationCompany(companyId, { name });
      const rows = Array.isArray(data?.items) ? data.items : [];
      setCompanies(rows);
      setUsage(data?.usage || usage);
      setEditingCompanyId("");
      setEditingCompanyName("");
      setAlert("Company updated.");
    } catch (err) {
      setError(err?.message || "Unable to update company.");
    }
  }

  async function handleDeleteCompany(companyId) {
    if (!window.confirm("Delete this company?")) return;
    setError("");
    setAlert("");
    try {
      const data = await deleteSocialAutomationCompany(companyId);
      const rows = Array.isArray(data?.items) ? data.items : [];
      setCompanies(rows);
      setUsage(data?.usage || usage);
      if (String(selectedCompanyId) === String(companyId)) {
        setSelectedCompanyId(rows.length ? String(rows[0].id) : "");
      }
      setAlert("Company deleted.");
    } catch (err) {
      setError(err?.message || "Unable to delete company.");
    }
  }

  async function handleImageUpload(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!["image/jpeg", "image/png"].includes(file.type)) {
      setError("Only JPG and PNG files are allowed.");
      return;
    }
    if (file.size > 1572864) {
      setError("Image size must be 1.5 MB or smaller.");
      return;
    }
    setError("");
    const dataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
    const meta = await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve({ width: img.width, height: img.height });
      img.onerror = reject;
      img.src = dataUrl;
    });
    setComposer((prev) => ({
      ...prev,
      uploaded_media_url: dataUrl,
      uploaded_media_name: file.name,
      uploaded_media_meta: { ...meta, size: file.size, type: file.type },
    }));
  }

  function selectedPlatformsFromComposer() {
    const selected = [];
    if (composer.shared.facebook) selected.push("facebook");
    if (composer.shared.instagram) selected.push("instagram");
    if (composer.x.enabled) selected.push("x");
    if (composer.linkedin.enabled) selected.push("linkedin");
    if (composer.youtube.enabled) selected.push("youtube");
    return selected;
  }

  function validateComposer() {
    const selected = selectedPlatformsFromComposer();
    if (!selected.length) {
      return { ok: false, message: "Select at least one platform." };
    }

    const warnings = [];
    const mediaMeta = composer.uploaded_media_meta;

    for (const platform of selected) {
      const section = platform === "facebook" || platform === "instagram"
        ? composer.shared
        : composer[platform];

      const text = sectionEffectiveText(section);
      const title = effectiveTitle(section, composer);
      const spec = PLATFORM_SPECS[platform];
      if (spec?.textLimit && text.length > spec.textLimit) {
        return { ok: false, message: `${PLATFORM_LABELS[platform]} text limit is ${spec.textLimit} characters.` };
      }
      if (platform === "x") {
        const hashTags = (text.match(/#[A-Za-z0-9_]+/g) || []).length;
        if (hashTags > (spec.hashtagLimit || 10)) {
          return { ok: false, message: `X.com hashtag limit is ${spec.hashtagLimit}.` };
        }
      }
      if (platform === "youtube" && spec?.titleLimit && title.length > spec.titleLimit) {
        return { ok: false, message: `YouTube title limit is ${spec.titleLimit} characters.` };
      }
      if (!title && platform === "youtube") {
        return { ok: false, message: "YouTube title is required." };
      }

      const mediaUrl = sectionEffectiveMedia(section, composer);
      if (mediaMeta && mediaUrl && spec?.ratioMin && spec?.ratioMax) {
        const ratio = mediaMeta.width / Math.max(1, mediaMeta.height);
        if (ratio < spec.ratioMin || ratio > spec.ratioMax) {
          warnings.push(`${PLATFORM_LABELS[platform]} recommended image ratio: ${spec.ratioMin.toFixed(2)} to ${spec.ratioMax.toFixed(2)}.`);
        }
      }
    }

    return { ok: true, warnings };
  }

  function buildPostPayload(publishNow) {
    const selected = selectedPlatformsFromComposer();
    const platformContent = {};

    for (const platform of selected) {
      const section = platform === "facebook" || platform === "instagram"
        ? composer.shared
        : composer[platform];
      platformContent[platform] = {
        title: effectiveTitle(section, composer),
        content: sectionEffectiveText(section),
        content_html: String(section?.html || "").trim(),
        media_url: sectionEffectiveMedia(section, composer),
      };
    }

    const firstPlatform = selected[0];
    const firstPayload = platformContent[firstPlatform] || {};

    return {
      content: firstPayload.content || "",
      media_url: firstPayload.media_url || "",
      platforms: selected,
      platform_content: platformContent,
      publish_now: Boolean(publishNow),
      scheduled_at: composer.scheduled_at || "",
    };
  }

  function setConnectValue(platform, field, value) {
    setConnectFormsByPlatform((prev) => ({
      ...prev,
      [platform]: {
        ...prev[platform],
        [field]: value,
      },
    }));
  }

  function buildConnectPayload(platform) {
    const form = connectFormsByPlatform[platform] || initialConnectForm;
    return {
      platform,
      account_id: String(form.account_id || "").trim(),
      api_endpoint: String(form.api_endpoint || "").trim(),
      access_token: String(form.access_token || "").trim(),
      token_type: String(form.token_type || "Bearer").trim() || "Bearer",
      scopes: String(form.scopes || "").trim(),
      social_company_id: selectedCompanyId,
    };
  }

  async function handleSaveActiveConnection(event) {
    event.preventDefault();
    if (!selectedCompanyId) {
      setError("Select company before API connect.");
      return;
    }
    if (!planCapabilities?.api_connect_enabled) {
      setError("API connect is disabled for your current plan.");
      return;
    }

    const payload = buildConnectPayload(activePlatform);
    if (!payload.api_endpoint || !payload.access_token) {
      setError("API endpoint and access token are required.");
      return;
    }

    setSavingConnect(true);
    setError("");
    setAlert("");
    try {
      const data = await saveSocialConnection(payload);
      setPlanCapabilities(data?.plan_capabilities || planCapabilities);
      setUsage(data?.usage || usage);
      setAlert(`${PLATFORM_LABELS[activePlatform]} API connection saved.`);
      setConnectValue(activePlatform, "access_token", "");
      await loadOverview();
    } catch (err) {
      setError(err?.message || "Unable to save API connection.");
    } finally {
      setSavingConnect(false);
    }
  }

  async function handleSaveAllConnections() {
    if (!selectedCompanyId) {
      setError("Select company before API connect.");
      return;
    }
    if (!planCapabilities?.api_connect_enabled) {
      setError("API connect is disabled for your current plan.");
      return;
    }

    const payloads = PLATFORM_ORDER.map((platform) => buildConnectPayload(platform))
      .filter((item) => item.api_endpoint && item.access_token);

    if (!payloads.length) {
      setError("Enter API endpoint and access token in at least one platform to save.");
      return;
    }

    setSavingAllConnect(true);
    setError("");
    setAlert("");
    let success = 0;
    const failed = [];

    for (const payload of payloads) {
      try {
        await saveSocialConnection(payload);
        success += 1;
      } catch (err) {
        failed.push(`${PLATFORM_LABELS[payload.platform]}: ${err?.message || "save failed"}`);
      }
    }

    if (failed.length) {
      setError(failed.join(" | "));
    }
    if (success > 0) {
      setAlert(`${success} platform connection(s) saved.`);
    }

    await loadOverview();
    setSavingAllConnect(false);
  }

  async function handleDisconnect(platform) {
    if (!selectedCompanyId) {
      setError("Select company before disconnect.");
      return;
    }
    if (!planCapabilities?.api_connect_enabled) {
      setError("API connect is disabled for your current plan.");
      return;
    }
    setAlert("");
    setError("");
    try {
      const data = await disconnectSocialConnection(platform, { social_company_id: selectedCompanyId });
      setPlanCapabilities(data?.plan_capabilities || planCapabilities);
      setUsage(data?.usage || usage);
      setAlert(`${PLATFORM_LABELS[platform]} disconnected.`);
      await loadOverview();
    } catch (err) {
      setError(err?.message || "Unable to disconnect platform.");
    }
  }

  async function handleCreatePost(publishNow) {
    if (!selectedCompanyId) {
      setError("Select company before creating post.");
      return;
    }
    if (!planCapabilities?.posting_enabled) {
      setError("Social posting is disabled for your current plan.");
      return;
    }
    const validation = validateComposer();
    if (!validation.ok) {
      setError(validation.message);
      return;
    }
    if (validation.warnings?.length) {
      setAlert(validation.warnings.join(" "));
    }

    setSavingPost(true);
    setError("");
    try {
      const payload = buildPostPayload(publishNow);
      const data = await createSocialPost({
        ...payload,
        social_company_id: selectedCompanyId,
      });
      setPlanCapabilities(data?.plan_capabilities || planCapabilities);
      setUsage(data?.usage || usage);
      setAlert(publishNow ? "Post sent to selected platforms." : "Post scheduled successfully.");
      setComposer((prev) => ({
        ...prev,
        post_title: "",
        scheduled_at: "",
        shared: { ...prev.shared, title: "", text: "", html: "", media_url: "" },
        x: { ...prev.x, title: "", text: "", html: "", media_url: "" },
        linkedin: { ...prev.linkedin, title: "", text: "", html: "", media_url: "" },
        youtube: { ...prev.youtube, title: "", text: "", html: "", media_url: "" },
      }));
      const latest = await getSocialAutomationPosts(1, 20, selectedCompanyId);
      setPosts(Array.isArray(latest?.items) ? latest.items : []);
    } catch (err) {
      setError(err?.message || "Unable to create post.");
    } finally {
      setSavingPost(false);
    }
  }

  async function handlePublishNow(postId) {
    if (!planCapabilities?.posting_enabled) {
      setError("Social posting is disabled for your current plan.");
      return;
    }
    setAlert("");
    setError("");
    try {
      const data = await publishSocialPost(postId);
      setPlanCapabilities(data?.plan_capabilities || planCapabilities);
      setUsage(data?.usage || usage);
      setAlert("Post publish triggered.");
      const latest = await getSocialAutomationPosts(1, 20, selectedCompanyId);
      setPosts(Array.isArray(latest?.items) ? latest.items : []);
    } catch (err) {
      setError(err?.message || "Unable to publish post.");
    }
  }

  if (loading) {
    return (
      <div className="card p-4 text-center">
        <div className="spinner" />
        <p className="mb-0">Loading Social Media...</p>
      </div>
    );
  }

  return (
    <div className="d-flex flex-column gap-3">
      {error ? <div className="alert alert-danger mb-0">{error}</div> : null}
      {alert ? <div className="alert alert-success mb-0">{alert}</div> : null}

      <div>
        <h4 className="mb-2">Social Media</h4>
        <p className="text-secondary mb-3">Connect platform APIs, publish posts, and manage company-wise social automation from one page.</p>
        <div className="d-flex flex-wrap gap-2">
          <button
            type="button"
            className={`btn btn-sm ${tab === "post" ? "btn-success" : "btn-outline-light"}`}
            onClick={() => setTab("post")}
          >
            Post
          </button>
          <button
            type="button"
            className={`btn btn-sm ${tab === "connect" ? "btn-success" : "btn-outline-light"}`}
            onClick={() => setTab("connect")}
          >
            API Connect
          </button>
        </div>
      </div>

      <div className="row g-3">
        <div className="col-12 col-md-4">
          <div className="card p-3 h-100 d-flex flex-column align-items-center justify-content-center text-center">
            <div className="stat-icon stat-icon-primary mb-2"><i className="bi bi-diagram-3" /></div>
            <div className="text-secondary small">Company Scope</div>
            <h5 className="mb-0 mt-1">{planCapabilities?.company_wise_enabled ? "Enabled" : "Disabled"}</h5>
            <div className="small text-secondary">{usage.companies_used || 0} / {formatLimit(planCapabilities?.company_count_limit)}</div>
          </div>
        </div>
        <div className="col-12 col-md-4">
          <div className="card p-3 h-100 d-flex flex-column align-items-center justify-content-center text-center">
            <div className="stat-icon stat-icon-primary mb-2"><i className="bi bi-link-45deg" /></div>
            <div className="text-secondary small">API Accounts</div>
            <h5 className="mb-0 mt-1">{usage.connected_accounts} / {formatLimit(planCapabilities?.social_accounts_limit)}</h5>
          </div>
        </div>
        <div className="col-12 col-md-4">
          <div className="card p-3 h-100 d-flex flex-column align-items-center justify-content-center text-center">
            <div className="stat-icon stat-icon-primary mb-2"><i className="bi bi-send-check" /></div>
            <div className="text-secondary small">Posts This Month</div>
            <h5 className="mb-0 mt-1">{usage.posts_this_month} / {formatLimit(planCapabilities?.scheduled_posts_limit)}</h5>
          </div>
        </div>
      </div>

      {tab === "connect" ? (
        <div className="row g-3">
          <div className="col-12 col-xl-4">
            <div className="card p-3 h-100">
              <h5 className="mb-3">Create Company</h5>
              <div className="input-group mb-3">
                <input
                  className="form-control"
                  placeholder="Enter company/group name"
                  value={newCompanyName}
                  onChange={(event) => setNewCompanyName(event.target.value)}
                />
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={creatingCompany}
                  onClick={handleCreateCompany}
                >
                  {creatingCompany ? "Creating..." : "Create"}
                </button>
              </div>

              <div className="mb-2">
                <input
                  className="form-control"
                  placeholder="Search company"
                  value={companySearch}
                  onChange={(event) => {
                    setCompanySearch(event.target.value);
                    setCompanyPage(1);
                  }}
                />
              </div>

              <div className="table-responsive mt-2">
                <table className="table table-striped align-middle mb-0">
                  <thead>
                    <tr>
                      <th>Company</th>
                      <th>API Accounts</th>
                      <th className="text-end">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pagedCompanies.length ? pagedCompanies.map((item) => (
                      <tr key={item.id}>
                        <td>
                          {String(editingCompanyId) === String(item.id) ? (
                            <input
                              className="form-control form-control-sm"
                              value={editingCompanyName}
                              onChange={(event) => setEditingCompanyName(event.target.value)}
                            />
                          ) : (
                            <button
                              type="button"
                              className="btn btn-link p-0 text-decoration-none text-body"
                              onClick={() => setSelectedCompanyId(String(item.id))}
                            >
                              {item.name}
                            </button>
                          )}
                        </td>
                        <td>{item.api_accounts_count || 0}</td>
                        <td className="text-end">
                          {String(editingCompanyId) === String(item.id) ? (
                            <div className="d-flex justify-content-end gap-2">
                              <button type="button" className="btn btn-sm btn-primary" onClick={() => handleUpdateCompany(item.id)}>Save</button>
                              <button
                                type="button"
                                className="btn btn-sm btn-outline-secondary"
                                onClick={() => {
                                  setEditingCompanyId("");
                                  setEditingCompanyName("");
                                }}
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <div className="d-flex justify-content-end gap-2">
                              <button
                                type="button"
                                className="btn btn-sm btn-outline-primary"
                                onClick={() => {
                                  setEditingCompanyId(String(item.id));
                                  setEditingCompanyName(item.name || "");
                                }}
                              >
                                Edit
                              </button>
                              <button type="button" className="btn btn-sm btn-outline-danger" onClick={() => handleDeleteCompany(item.id)}>Delete</button>
                            </div>
                          )}
                        </td>
                      </tr>
                    )) : (
                      <tr>
                        <td colSpan={3}>No companies found.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              <div className="d-flex align-items-center justify-content-between mt-2">
                <small className="text-secondary">Page {companyPage} / {totalCompanyPages}</small>
                <div className="btn-group btn-group-sm">
                  <button
                    type="button"
                    className="btn btn-outline-secondary"
                    disabled={companyPage <= 1}
                    onClick={() => setCompanyPage((prev) => Math.max(1, prev - 1))}
                  >
                    Prev
                  </button>
                  <button
                    type="button"
                    className="btn btn-outline-secondary"
                    disabled={companyPage >= totalCompanyPages}
                    onClick={() => setCompanyPage((prev) => Math.min(totalCompanyPages, prev + 1))}
                  >
                    Next
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div className="col-12 col-xl-8">
            <div className="card p-4 h-100">
              <h5 className="mb-3">Connect Social Media APIs</h5>
              {!planCapabilities?.api_connect_enabled ? (
                <div className="alert alert-warning">API connect is disabled in your current plan.</div>
              ) : null}

              {!selectedCompanyId ? <div className="alert alert-warning">Create and select company/group to continue.</div> : null}

              <form className="row g-3" onSubmit={handleSaveActiveConnection}>
                <div className="col-12 col-lg-4">
                  <label className="form-label">Company Name (Auto Search)</label>
                  <div className="crm-inline-suggestions-wrap">
                    <input
                      className="form-control"
                      autoComplete="off"
                      placeholder="Type company name"
                      value={companyAutoSearch}
                      onFocus={() => setCompanySearchOpen(true)}
                      onClick={() => setCompanySearchOpen(true)}
                      onBlur={() => window.setTimeout(() => setCompanySearchOpen(false), 120)}
                      onChange={(event) => {
                        handleAutoCompanySearch(event.target.value);
                        setCompanySearchOpen(true);
                      }}
                    />
                    {companySearchOpen ? (
                      <div className="crm-inline-suggestions" style={{ maxHeight: "260px", overflowY: "auto" }}>
                        <div className="crm-inline-suggestions__group">
                          <div className="crm-inline-suggestions__title">Companies</div>
                          {companyAutoMatches.length ? companyAutoMatches.map((item) => (
                            <button
                              key={`social-auto-company-${item.id}`}
                              type="button"
                              className="crm-inline-suggestions__item"
                              onMouseDown={(event) => event.preventDefault()}
                              onClick={() => selectCompanyFromAuto(item)}
                            >
                              <span className="crm-inline-suggestions__item-main">{item.name || "-"}</span>
                            </button>
                          )) : (
                            <div className="crm-inline-suggestions__item">
                              <span className="crm-inline-suggestions__item-main">No company found</span>
                            </div>
                          )}
                        </div>
                      </div>
                    ) : null}
                  </div>
                </div>
                <div className="col-12 col-lg-8">
                  <label className="form-label d-block">&nbsp;</label>
                  <div className="d-flex flex-wrap gap-2">
                    {PLATFORM_ORDER.map((platform) => (
                      <button
                        key={platform}
                        type="button"
                        className={`btn btn-sm ${activePlatform === platform ? "btn-primary" : "btn-outline-light"}`}
                        onClick={() => setActivePlatform(platform)}
                      >
                        {PLATFORM_LABELS[platform]}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="col-12 col-lg-2">
                  <label className="form-label">Platform</label>
                  <input className="form-control" value={PLATFORM_LABELS[activePlatform]} readOnly />
                </div>
                <div className="col-12 col-lg-4">
                  <label className="form-label">API Endpoint</label>
                  <input
                    className="form-control"
                    value={connectFormsByPlatform[activePlatform]?.api_endpoint || ""}
                    onChange={(event) => setConnectValue(activePlatform, "api_endpoint", event.target.value)}
                    placeholder={PLATFORM_ENDPOINT_HINTS[activePlatform]}
                    required
                  />
                </div>
                <div className="col-12 col-lg-4">
                  <label className="form-label">Access Token</label>
                  <input
                    className="form-control"
                    value={connectFormsByPlatform[activePlatform]?.access_token || ""}
                    onChange={(event) => setConnectValue(activePlatform, "access_token", event.target.value)}
                    placeholder="Paste API access token"
                    required
                  />
                </div>
                <div className="col-12 col-lg-2">
                  <label className="form-label">Token Type</label>
                  <input
                    className="form-control"
                    value={connectFormsByPlatform[activePlatform]?.token_type || "Bearer"}
                    onChange={(event) => setConnectValue(activePlatform, "token_type", event.target.value)}
                    placeholder="Bearer"
                  />
                </div>

                <div className="col-12 col-lg-6">
                  <label className="form-label">Account / Page / Channel ID</label>
                  <input
                    className="form-control"
                    value={connectFormsByPlatform[activePlatform]?.account_id || ""}
                    onChange={(event) => setConnectValue(activePlatform, "account_id", event.target.value)}
                    placeholder="Optional"
                  />
                </div>
                <div className="col-12 col-lg-6">
                  <label className="form-label">Scopes (optional)</label>
                  <input
                    className="form-control"
                    value={connectFormsByPlatform[activePlatform]?.scopes || ""}
                    onChange={(event) => setConnectValue(activePlatform, "scopes", event.target.value)}
                    placeholder="comma-separated scopes"
                  />
                </div>
                <div className="col-12 d-flex flex-wrap gap-2 justify-content-lg-end">
                  <button
                    type="submit"
                    className="btn btn-primary"
                    disabled={savingConnect || !selectedCompanyId || !planCapabilities?.api_connect_enabled}
                  >
                    {savingConnect ? "Saving..." : `Save ${PLATFORM_LABELS[activePlatform]}`}
                  </button>
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={handleSaveAllConnections}
                    disabled={savingAllConnect || !selectedCompanyId || !planCapabilities?.api_connect_enabled}
                  >
                    {savingAllConnect ? "Saving All..." : "Save All Platforms"}
                  </button>
                  <button
                    type="button"
                    className="btn btn-outline-danger"
                    disabled={!planCapabilities?.api_connect_enabled || !selectedCompanyId}
                    onClick={() => handleDisconnect(activePlatform)}
                  >
                    Disconnect {PLATFORM_LABELS[activePlatform]}
                  </button>
                </div>
              </form>

              <hr className="my-4" />
              <div className="row g-2 mb-3 align-items-center">
                <div className="col-12 col-lg-6">
                  <h6 className="mb-0">Connection Status</h6>
                </div>
                <div className="col-12 col-lg-6">
                  <div className="crm-inline-suggestions-wrap">
                    <input
                      className="form-control"
                      autoComplete="off"
                      placeholder="Type company name to filter status"
                      value={companyAutoSearch}
                      onFocus={() => setStatusSearchOpen(true)}
                      onClick={() => setStatusSearchOpen(true)}
                      onBlur={() => window.setTimeout(() => setStatusSearchOpen(false), 120)}
                      onChange={(event) => {
                        handleAutoCompanySearch(event.target.value);
                        setStatusSearchOpen(true);
                      }}
                    />
                    {statusSearchOpen ? (
                      <div className="crm-inline-suggestions" style={{ maxHeight: "260px", overflowY: "auto" }}>
                        <div className="crm-inline-suggestions__group">
                          <div className="crm-inline-suggestions__title">Companies</div>
                          {companyAutoMatches.length ? companyAutoMatches.map((item) => (
                            <button
                              key={`social-status-company-${item.id}`}
                              type="button"
                              className="crm-inline-suggestions__item"
                              onMouseDown={(event) => event.preventDefault()}
                              onClick={() => selectCompanyFromAuto(item)}
                            >
                              <span className="crm-inline-suggestions__item-main">{item.name || "-"}</span>
                            </button>
                          )) : (
                            <div className="crm-inline-suggestions__item">
                              <span className="crm-inline-suggestions__item-main">No company found</span>
                            </div>
                          )}
                        </div>
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>
              <div className="table-responsive">
                <table className="table table-striped mb-0">
                  <thead>
                    <tr>
                      <th>Platform</th>
                      <th>Status</th>
                      <th>Account</th>
                      <th>Last Error</th>
                    </tr>
                  </thead>
                  <tbody>
                    {PLATFORM_ORDER.map((platform) => {
                      const row = connectionMap[platform];
                      return (
                        <tr key={platform}>
                          <td>{PLATFORM_LABELS[platform]}</td>
                          <td>{row?.is_connected ? "Connected" : "Not Connected"}</td>
                          <td>{row?.account_id || "-"}</td>
                          <td>{row?.last_error || "-"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="d-flex flex-column gap-3">
          <div className="card p-4">
            <h5 className="mb-3">Create Post</h5>
            <div className="row g-3 mb-3">
              <div className="col-12 col-xl-3">
                <label className="form-label">Select Company / Group</label>
                <select
                  className="form-select"
                  value={selectedCompanyId}
                  onChange={(event) => setSelectedCompanyId(event.target.value)}
                >
                  <option value="">Select company</option>
                  {companies.map((item) => (
                    <option key={item.id} value={item.id}>{item.name}</option>
                  ))}
                </select>
              </div>
              <div className="col-12 col-xl-3">
                <label className="form-label">Schedule At (optional)</label>
                <input
                  type="datetime-local"
                  className="form-control"
                  value={composer.scheduled_at}
                  onChange={(event) => setComposer((prev) => ({ ...prev, scheduled_at: event.target.value }))}
                />
              </div>
              <div className="col-12 col-xl-3">
                <label className="form-label">Upload Image (JPG/PNG, max 1.5 MB)</label>
                <input type="file" className="form-control" accept="image/png,image/jpeg" onChange={handleImageUpload} />
                {composer.uploaded_media_name ? <div className="small text-secondary mt-1">Selected: {composer.uploaded_media_name}</div> : null}
              </div>
              <div className="col-12 col-xl-3">
                <label className="form-label">Title</label>
                <input
                  className="form-control"
                  placeholder="Enter post title"
                  value={composer.post_title}
                  onChange={(event) => setComposer((prev) => ({ ...prev, post_title: event.target.value }))}
                />
              </div>
            </div>

            {!selectedCompanyId ? <div className="alert alert-warning">Create and select company/group to create posts.</div> : null}
            {!planCapabilities?.posting_enabled ? <div className="alert alert-warning">Posting is disabled in your current plan.</div> : null}

            <div className="row g-3">
              <div className="col-12 col-xl-6">
                <div className="card p-3 h-100">
                  <div className="d-flex align-items-center justify-content-between mb-2">
                    <h6 className="mb-0">Facebook + Instagram (Same Spec)</h6>
                    <div className="d-flex gap-3">
                      <label className="form-check-label d-flex align-items-center gap-2"><input type="checkbox" className="form-check-input" checked={composer.shared.facebook} onChange={(e) => setSectionValue("shared", "facebook", e.target.checked)} />Facebook</label>
                      <label className="form-check-label d-flex align-items-center gap-2"><input type="checkbox" className="form-check-input" checked={composer.shared.instagram} onChange={(e) => setSectionValue("shared", "instagram", e.target.checked)} />Instagram</label>
                    </div>
                  </div>
                  <TinyHtmlEditor
                    value={composer.shared.html}
                    onChange={(val) => setSectionValue("shared", "html", val)}
                    placeholder="Type post with formatting..."
                    minHeight={180}
                    maxChars={2200}
                  />
                  <input className="form-control" placeholder="Media URL override (optional)" value={composer.shared.media_url} onChange={(e) => setSectionValue("shared", "media_url", e.target.value)} />
                </div>
              </div>

              <div className="col-12 col-xl-6">
                <div className="card p-3 h-100">
                  <div className="d-flex align-items-center justify-content-between mb-2">
                    <h6 className="mb-0">X.com</h6>
                    <label className="form-check-label d-flex align-items-center gap-2"><input type="checkbox" className="form-check-input" checked={composer.x.enabled} onChange={(e) => setSectionValue("x", "enabled", e.target.checked)} />Enable</label>
                  </div>
                  <TinyHtmlEditor
                    value={composer.x.html}
                    onChange={(val) => setSectionValue("x", "html", val)}
                    placeholder="Type post with formatting..."
                    minHeight={180}
                    maxChars={280}
                  />
                  <input className="form-control" placeholder="Media URL override (optional)" value={composer.x.media_url} onChange={(e) => setSectionValue("x", "media_url", e.target.value)} />
                </div>
              </div>

              <div className="col-12 col-xl-6">
                <div className="card p-3 h-100">
                  <div className="d-flex align-items-center justify-content-between mb-2">
                    <h6 className="mb-0">LinkedIn</h6>
                    <label className="form-check-label d-flex align-items-center gap-2"><input type="checkbox" className="form-check-input" checked={composer.linkedin.enabled} onChange={(e) => setSectionValue("linkedin", "enabled", e.target.checked)} />Enable</label>
                  </div>
                  <TinyHtmlEditor
                    value={composer.linkedin.html}
                    onChange={(val) => setSectionValue("linkedin", "html", val)}
                    placeholder="Type post with formatting..."
                    minHeight={180}
                    maxChars={3000}
                  />
                  <input className="form-control" placeholder="Media URL override (optional)" value={composer.linkedin.media_url} onChange={(e) => setSectionValue("linkedin", "media_url", e.target.value)} />
                </div>
              </div>

              <div className="col-12 col-xl-6">
                <div className="card p-3 h-100">
                  <div className="d-flex align-items-center justify-content-between mb-2">
                    <h6 className="mb-0">YouTube</h6>
                    <label className="form-check-label d-flex align-items-center gap-2"><input type="checkbox" className="form-check-input" checked={composer.youtube.enabled} onChange={(e) => setSectionValue("youtube", "enabled", e.target.checked)} />Enable</label>
                  </div>
                  <TinyHtmlEditor
                    value={composer.youtube.html}
                    onChange={(val) => setSectionValue("youtube", "html", val)}
                    placeholder="Type post with formatting..."
                    minHeight={180}
                    maxChars={5000}
                  />
                  <input className="form-control" placeholder="Media URL override (optional)" value={composer.youtube.media_url} onChange={(e) => setSectionValue("youtube", "media_url", e.target.value)} />
                </div>
              </div>
            </div>

            <div className="col-12 d-flex flex-wrap gap-2 mt-3">
              <button
                type="button"
                className="btn btn-primary"
                disabled={savingPost || !planCapabilities?.posting_enabled || !selectedCompanyId}
                onClick={() => handleCreatePost(true)}
              >
                {savingPost ? "Publishing..." : "Publish Now"}
              </button>
              <button
                type="button"
                className="btn btn-outline-secondary"
                disabled={savingPost || !planCapabilities?.posting_enabled || !selectedCompanyId}
                onClick={() => handleCreatePost(false)}
              >
                {savingPost ? "Saving..." : "Save / Schedule"}
              </button>
            </div>
          </div>

          <div className="card p-4">
            <h5 className="mb-3">Post Logs</h5>
            <div className="table-responsive">
              <table className="table table-striped mb-0">
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Content</th>
                    <th>Platforms</th>
                    <th>Status</th>
                    <th>Scheduled</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {posts.length ? posts.map((row) => (
                    <tr key={row.id}>
                      <td>{row.id}</td>
                      <td>{String(row.content || "").slice(0, 80)}</td>
                      <td>{(row.target_platforms || []).map((item) => PLATFORM_LABELS[item] || item).join(", ") || "-"}</td>
                      <td>{prettyStatus(row.status)}</td>
                      <td>{row.scheduled_at || "-"}</td>
                      <td>
                        <button
                          type="button"
                          className="btn btn-outline-primary btn-sm"
                          disabled={!planCapabilities?.posting_enabled}
                          onClick={() => handlePublishNow(row.id)}
                        >
                          Publish
                        </button>
                      </td>
                    </tr>
                  )) : (
                    <tr>
                      <td colSpan={6}>No posts yet.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
