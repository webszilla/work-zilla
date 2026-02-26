import { useEffect, useMemo, useState } from "react";
import { waApi } from "../api/whatsappAutomation.js";
import { PHONE_COUNTRIES } from "../lib/phoneCountries.js";

const PAGE_SIZE = 10;
const COUNTRY_CODE_OPTIONS = PHONE_COUNTRIES;
const COUNTRY_CODES_DESC = Array.from(new Set(PHONE_COUNTRIES.map((x) => x.code))).sort((a, b) => b.length - a.length);

function splitPhoneValue(rawValue) {
  const raw = String(rawValue || "").trim();
  if (!raw) return { code: "+91", local: "" };
  const compact = raw.replace(/\s+/g, "");
  const matchedCode = COUNTRY_CODES_DESC.find((code) => compact.startsWith(code));
  if (matchedCode) {
    return { code: matchedCode, local: compact.slice(matchedCode.length) };
  }
  return { code: "+91", local: compact.replace(/^\+/, "") };
}

function combinePhoneValue(code, local) {
  const normalizedCode = String(code || "+91").trim() || "+91";
  const normalizedLocal = String(local || "").replace(/[^\d]/g, "");
  if (!normalizedLocal) return "";
  return `${normalizedCode}${normalizedLocal}`;
}

function emptyCardForm(prefill = {}) {
  const phoneParts = splitPhoneValue(prefill.phone || "");
  const whatsappParts = splitPhoneValue(prefill.whatsapp_number || "");
  return {
    id: null,
    public_slug: prefill.public_slug || "",
    card_title: prefill.card_title || "",
    person_name: prefill.person_name || "",
    role_title: prefill.role_title || "",
    phone: prefill.phone || "",
    phone_country_code: phoneParts.code,
    phone_local: phoneParts.local,
    whatsapp_number: prefill.whatsapp_number || "",
    whatsapp_country_code: whatsappParts.code,
    whatsapp_local: whatsappParts.local,
    email: prefill.email || "",
    website: prefill.website || "",
    address: prefill.address || "",
    description: prefill.description || "",
    theme_color: prefill.theme_color || "#22c55e",
    template_style: prefill.template_style || "design1",
    custom_domain: prefill.custom_domain || "",
    custom_domain_active: Boolean(prefill.custom_domain_active),
    logo_image_data: prefill.logo_image_data || "",
    hero_banner_image_data: prefill.hero_banner_image_data || "",
    logo_size: Number(prefill.logo_size || 96),
    icon_size_pt: Number(prefill.icon_size_pt || 14),
    font_size_pt: Number(prefill.font_size_pt || 16),
    social_links_items: Array.isArray(prefill.social_links_items) ? prefill.social_links_items : [],
    is_active: prefill.is_active !== false,
    sort_order: Number(prefill.sort_order || 0),
  };
}

function cardDisplayTitle(item) {
  return item?.card_title || item?.person_name || item?.public_slug || "Digital Card";
}

function shortDateTime(value) {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString();
}

function buildDnsRows(customDomain) {
  const domain = String(customDomain || "").trim().toLowerCase();
  if (!domain) return [];
  const hostTarget = typeof window !== "undefined" ? window.location.host : "your-app-domain.com";
  const hostname = hostTarget.split(":")[0];
  const parts = domain.split(".");
  const isLikelySubdomain = parts.length > 2 || domain.startsWith("www.");
  if (isLikelySubdomain) {
    return [{ type: "CNAME", host: parts[0], value: hostname, ttl: "Auto" }];
  }
  return [
    { type: "A", host: "@", value: "YOUR_SERVER_PUBLIC_IP", ttl: "Auto" },
    { type: "CNAME", host: "www", value: domain, ttl: "Auto" },
  ];
}

function qrPngUrl(value, size = 180) {
  const text = String(value || "").trim();
  if (!text) return "";
  return `https://quickchart.io/qr?format=png&size=${size}&text=${encodeURIComponent(text)}`;
}

async function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Unable to read image file."));
    reader.readAsDataURL(file);
  });
}

function DigitalCardPreview({ form, company }) {
  const theme = form.theme_color || company?.theme_color || "#22c55e";
  const socials = Array.isArray(form.social_links_items) ? form.social_links_items.slice(0, 5) : [];
  const templateStyle = form.template_style || "design1";
  const iconPt = Math.max(8, Number(form.icon_size_pt || 14));
  const fontPt = Math.max(10, Number(form.font_size_pt || 16));
  const previewWrapStyle =
    templateStyle === "design2"
      ? { background: "#0f172a", border: `1px solid ${theme}` }
      : templateStyle === "design3"
        ? { background: "linear-gradient(180deg,#08111f 0%,#111827 100%)", border: "1px solid rgba(255,255,255,0.12)" }
        : {};
  return (
    <div className="card p-0 overflow-hidden" style={previewWrapStyle}>
      <div
        style={{
          height: 110,
          background: form.hero_banner_image_data
            ? `center/cover no-repeat url(${form.hero_banner_image_data})`
            : `linear-gradient(135deg, ${theme} 0%, #0f172a 100%)`,
          borderBottom: "1px solid rgba(255,255,255,0.08)",
        }}
      />
      <div className="p-3 position-relative">
        <div
          className="rounded-circle d-flex align-items-center justify-content-center border border-2"
          style={{
            width: 88,
            height: 88,
            marginTop: -54,
            background: "#0b162b",
            borderColor: theme,
            overflow: "hidden",
          }}
        >
          {form.logo_image_data ? (
            <img src={form.logo_image_data} alt="Logo" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          ) : (
            <span style={{ color: theme, fontWeight: 700, fontSize: 28 }}>
              {(form.card_title || form.person_name || company?.company_name || "C").slice(0, 1).toUpperCase()}
            </span>
          )}
        </div>
        <h5 className="mt-3 mb-1">{form.person_name || company?.company_name || "Your Name"}</h5>
        <div className="text-secondary small mb-2" style={{ fontSize: `${Math.max(10, fontPt - 2)}pt` }}>{form.role_title || "Business / Professional"}</div>
        <div className="fw-semibold mb-1" style={{ fontSize: `${Math.max(12, fontPt)}pt` }}>{form.card_title || company?.company_name || "Company Name"}</div>
        <div className="small mb-2">
          <span className="badge" style={{ background: theme, color: "#071226" }}>
            {(templateStyle || "design1").replace("design", "Design ")}
          </span>
        </div>
        <p className="text-secondary small mb-3" style={{ fontSize: `${Math.max(9, fontPt - 3)}pt` }}>{form.description || company?.description || "Digital business card preview"}</p>

        <div className="d-flex flex-wrap gap-2 mb-3">
          {form.phone ? <a className="btn btn-sm btn-primary" href={`tel:${form.phone}`}>Call</a> : null}
          {form.whatsapp_number ? (
            <a className="btn btn-sm btn-outline-light" href={`https://wa.me/${String(form.whatsapp_number).replace(/\+/g, "")}`} target="_blank" rel="noreferrer">
              WhatsApp
            </a>
          ) : null}
          {form.website ? <a className="btn btn-sm btn-outline-light" href={form.website} target="_blank" rel="noreferrer">Website</a> : null}
        </div>

        <div className="d-flex flex-column gap-2 small" style={{ fontSize: `${Math.max(9, fontPt - 2)}pt` }}>
          <div><i className="bi bi-telephone me-2 text-success" style={{ fontSize: `${iconPt}pt` }} />{form.phone || "-"}</div>
          <div><i className="bi bi-whatsapp me-2 text-success" style={{ fontSize: `${iconPt}pt` }} />{form.whatsapp_number || "-"}</div>
          <div><i className="bi bi-envelope me-2 text-success" style={{ fontSize: `${iconPt}pt` }} />{form.email || "-"}</div>
          <div><i className="bi bi-globe me-2 text-success" style={{ fontSize: `${iconPt}pt` }} />{form.website || "-"}</div>
          <div><i className="bi bi-geo-alt me-2 text-success" style={{ fontSize: `${iconPt}pt` }} />{form.address || "-"}</div>
        </div>

        {socials.length ? (
          <div className="d-flex flex-wrap gap-2 mt-3">
            {socials.map((item, idx) => (
              <span key={`${item.icon}-${idx}`} className="badge bg-dark-subtle text-light border">
                {item.label || item.icon || "Link"}
              </span>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export default function DigitalBusinessCardDashboardPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [company, setCompany] = useState(null);
  const [defaultPrefill, setDefaultPrefill] = useState({});
  const [limitInfo, setLimitInfo] = useState(null);
  const [rows, setRows] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, page_size: PAGE_SIZE, total_items: 0, total_pages: 1 });
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [form, setForm] = useState(emptyCardForm());
  const [slugCheck, setSlugCheck] = useState(null);
  const [slugChecking, setSlugChecking] = useState(false);

  async function loadCards({ page = 1, q = query } = {}) {
    const data = await waApi.getDigitalCards({ page, pageSize: PAGE_SIZE, q });
    setRows(Array.isArray(data?.items) ? data.items : []);
    setDefaultPrefill(data?.default_prefill || {});
    setLimitInfo(data?.limit || null);
    setPagination(data?.pagination || { page, page_size: PAGE_SIZE, total_items: 0, total_pages: 1 });
    return data;
  }

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const [companyRes, cardsRes] = await Promise.all([
          waApi.getCompanyProfile(),
          waApi.getDigitalCards({ page: 1, pageSize: PAGE_SIZE }),
        ]);
        if (!active) return;
        const companyProfile = companyRes?.company_profile || null;
        setCompany(companyProfile);
        const items = Array.isArray(cardsRes?.items) ? cardsRes.items : [];
        const prefill = cardsRes?.default_prefill || {};
        setRows(items);
        setDefaultPrefill(prefill);
        setLimitInfo(cardsRes?.limit || null);
        setPagination(cardsRes?.pagination || { page: 1, page_size: PAGE_SIZE, total_items: items.length, total_pages: 1 });
        setForm(items[0] ? emptyCardForm(items[0]) : emptyCardForm(prefill));
        setLoading(false);
      } catch (err) {
        if (!active) return;
        setError(err?.message || "Unable to load digital cards.");
        setLoading(false);
      }
    })();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    const t = setTimeout(() => setQuery(search.trim()), 350);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    if (loading) return;
    loadCards({ page: 1, q: query }).catch((err) => setError(err?.message || "Unable to load digital cards."));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  const canCreateNew = useMemo(() => {
    if (!limitInfo) return true;
    return Boolean(limitInfo.can_create);
  }, [limitInfo]);

  function setField(key, value) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function setPhoneField(prefix, key, value) {
    setForm((prev) => {
      const next = { ...prev, [key]: value };
      const code = prefix === "phone" ? next.phone_country_code : next.whatsapp_country_code;
      const local = prefix === "phone" ? next.phone_local : next.whatsapp_local;
      const full = combinePhoneValue(code, local);
      if (prefix === "phone") next.phone = full;
      if (prefix === "whatsapp") next.whatsapp_number = full;
      return next;
    });
  }

  async function onImagePick(field, file, maxKb) {
    if (!file) return;
    if (!String(file.type || "").startsWith("image/")) {
      setError("Please select an image file.");
      return;
    }
    if (file.size > maxKb * 1024) {
      setError(`Image size must be under ${maxKb} KB.`);
      return;
    }
    try {
      const dataUrl = await fileToDataUrl(file);
      setField(field, dataUrl);
      setError("");
    } catch (err) {
      setError(err?.message || "Unable to read selected image.");
    }
  }

  async function onSave() {
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const payload = {
        ...form,
        phone: combinePhoneValue(form.phone_country_code, form.phone_local),
        whatsapp_number: combinePhoneValue(form.whatsapp_country_code, form.whatsapp_local),
        social_links_items: Array.isArray(form.social_links_items) ? form.social_links_items : (defaultPrefill.social_links_items || []),
      };
      const res = await waApi.saveDigitalCard(payload);
      const item = res?.item;
      if (item) {
        setForm(emptyCardForm(item));
      }
      if (res?.limit) setLimitInfo(res.limit);
      await loadCards({ page: pagination.page || 1, q: query });
      setSuccess(form.id ? "Digital card updated." : "Digital card created.");
    } catch (err) {
      if (err?.status === 403 && err?.data?.error === "addon_required") {
        setLimitInfo(err.data.limit || null);
      }
      setError(err?.data?.message || err?.message || "Unable to save digital card.");
    } finally {
      setSaving(false);
    }
  }

  useEffect(() => {
    const raw = String(form.public_slug || "").trim();
    if (!raw) {
      setSlugCheck(null);
      setSlugChecking(false);
      return;
    }
    let cancelled = false;
    setSlugChecking(true);
    const t = setTimeout(async () => {
      try {
        const res = await waApi.checkDigitalCardSlug(raw, form.id);
        if (cancelled) return;
        setSlugCheck(res || null);
      } catch {
        if (cancelled) return;
        setSlugCheck(null);
      } finally {
        if (!cancelled) setSlugChecking(false);
      }
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [form.public_slug, form.id]);

  async function onDelete(row) {
    if (!row?.id) return;
    if (!window.confirm(`Delete digital card "${cardDisplayTitle(row)}"?`)) return;
    setDeletingId(row.id);
    setError("");
    setSuccess("");
    try {
      const res = await waApi.deleteDigitalCard(row.id);
      if (res?.limit) setLimitInfo(res.limit);
      const nextPage = rows.length === 1 && (pagination.page || 1) > 1 ? (pagination.page || 1) - 1 : (pagination.page || 1);
      await loadCards({ page: nextPage, q: query });
      setForm(emptyCardForm(defaultPrefill));
      setSuccess("Digital card deleted.");
    } catch (err) {
      setError(err?.message || "Unable to delete digital card.");
    } finally {
      setDeletingId(null);
    }
  }

  function onEdit(row) {
    setForm(emptyCardForm(row));
    setError("");
    setSuccess("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function onNewCard() {
    if (!canCreateNew) {
      setError("Extra digital card requires add-on user purchase.");
      return;
    }
    setForm(emptyCardForm(defaultPrefill));
    setSuccess("");
    setError("");
  }

  if (loading) {
    return (
      <div className="p-4 text-center">
        <div className="spinner" />
        <p className="mb-0">Loading digital card...</p>
      </div>
    );
  }

  const cardUrl = form.public_slug ? `/card/${form.public_slug}/` : (company?.digital_card_url || "");
  const customUrl = form.custom_domain ? `https://${form.custom_domain}/` : "";
  const dnsRows = buildDnsRows(form.custom_domain);
  const page = pagination.page || 1;
  const totalPages = pagination.total_pages || 1;

  return (
    <div className="d-flex flex-column gap-3 p-4">
      <div className="d-flex align-items-center justify-content-between">
        <div>
          <h3 className="mb-1">Digital Business Card</h3>
          <p className="text-secondary mb-0">Left side details edit pannunga, right side live preview auto update ஆகும்.</p>
        </div>
        <div className="d-flex gap-2">
          <button type="button" className="btn btn-outline-light btn-sm" onClick={onNewCard}>
            <i className="bi bi-plus-lg me-1" />New Card
          </button>
          <button type="button" className="btn btn-primary btn-sm" disabled={saving} onClick={onSave}>
            {saving ? "Saving..." : (form.id ? "Update Card" : "Create Card")}
          </button>
        </div>
      </div>

      {error ? <div className="alert alert-danger mb-0">{error}</div> : null}
      {success ? <div className="alert alert-success mb-0">{success}</div> : null}

      {limitInfo ? (
        <div className={`alert mb-0 ${limitInfo.can_create ? "alert-info" : "alert-warning"}`}>
          <div className="d-flex flex-wrap align-items-center justify-content-between gap-2">
            <div>
              <strong>Digital Card Limit:</strong> {limitInfo.used_total}/{limitInfo.allowed_total} used
              {" "}({limitInfo.included_cards} base + {limitInfo.addon_cards} add-on)
              {!limitInfo.can_create ? " | Extra user digital card create panna add-on user purchase pannunga." : ""}
            </div>
            <a className="btn btn-outline-light btn-sm" href="/my-account/billing/">
              Manage Add-ons
            </a>
          </div>
        </div>
      ) : null}

      <div className="row g-3 align-items-start">
        <div className="col-12 col-xl-7">
          <div className="card p-4">
            <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-2">
              <h4 className="mb-0">Card Details</h4>
              <div className="d-flex gap-2">
                {cardUrl ? <a className="btn btn-outline-light btn-sm" href={cardUrl} target="_blank" rel="noreferrer">View</a> : null}
                {customUrl ? <a className="btn btn-outline-success btn-sm" href={customUrl} target="_blank" rel="noreferrer">Custom URL</a> : null}
                <a className="btn btn-outline-light btn-sm" href="/app/whatsapp-automation/dashboard/company-profile">Company Profile</a>
              </div>
            </div>
            <p className="text-secondary small">Default values company profile-la irundhu varum. Here modify pannina individual card-ku save ஆகும்.</p>

            <div className="row g-3">
              {[
                ["card_title", "Card / Company Title"],
                ["person_name", "Person Name"],
                ["role_title", "Role / Designation"],
                ["email", "Email"],
                ["website", "Website"],
                ["custom_domain", "Custom Domain (optional)"],
              ].map(([key, label]) => (
                <div className="col-12 col-md-6" key={key}>
                  <label className="form-label">{label}</label>
                  <input
                    className="form-control"
                    value={form[key] || ""}
                    onChange={(e) => setField(key, e.target.value)}
                    placeholder={defaultPrefill[key] || ""}
                  />
                </div>
              ))}

              <div className="col-12 col-md-6">
                <label className="form-label">Phone</label>
                <div className="input-group">
                  <select
                    className="form-select"
                    style={{ maxWidth: 220 }}
                    value={form.phone_country_code || "+91"}
                    onChange={(e) => setPhoneField("phone", "phone_country_code", e.target.value)}
                  >
                    {COUNTRY_CODE_OPTIONS.map((opt) => (
                      <option key={`${opt.code}-${opt.label}`} value={opt.code}>{opt.label} {opt.code}</option>
                    ))}
                  </select>
                  <input
                    className="form-control"
                    value={form.phone_local || ""}
                    onChange={(e) => setPhoneField("phone", "phone_local", e.target.value)}
                    placeholder="Mobile number"
                    inputMode="numeric"
                  />
                </div>
              </div>

              <div className="col-12 col-md-6">
                <label className="form-label">WhatsApp Number</label>
                <div className="input-group">
                  <select
                    className="form-select"
                    style={{ maxWidth: 220 }}
                    value={form.whatsapp_country_code || "+91"}
                    onChange={(e) => setPhoneField("whatsapp", "whatsapp_country_code", e.target.value)}
                  >
                    {COUNTRY_CODE_OPTIONS.map((opt) => (
                      <option key={`wa-${opt.code}-${opt.label}`} value={opt.code}>{opt.label} {opt.code}</option>
                    ))}
                  </select>
                  <input
                    className="form-control"
                    value={form.whatsapp_local || ""}
                    onChange={(e) => setPhoneField("whatsapp", "whatsapp_local", e.target.value)}
                    placeholder="WhatsApp number"
                    inputMode="numeric"
                  />
                </div>
              </div>

              <div className="col-12 col-md-6">
                <label className="form-label">Public Slug</label>
                <input
                  className="form-control"
                  value={form.public_slug || ""}
                  onChange={(e) => setField("public_slug", e.target.value)}
                  placeholder={defaultPrefill.public_slug || "your-card-slug"}
                />
                <div className="d-flex align-items-center gap-2 small mt-1">
                  {slugChecking ? <span className="text-secondary">Checking...</span> : null}
                  {!slugChecking && slugCheck?.normalized_slug ? (
                    <span className={slugCheck.available ? "text-success" : "text-warning"}>
                      {slugCheck.available ? "Available" : "Not available"}
                      {slugCheck.normalized_slug !== String(form.public_slug || "").trim() ? ` | slugify: ${slugCheck.normalized_slug}` : ""}
                    </span>
                  ) : null}
                  {!slugChecking && slugCheck && !slugCheck.available && slugCheck.suggested_slug ? (
                    <button
                      type="button"
                      className="btn btn-outline-light btn-sm py-0 px-2"
                      onClick={() => setField("public_slug", slugCheck.suggested_slug)}
                    >
                      Use {slugCheck.suggested_slug}
                    </button>
                  ) : null}
                </div>
              </div>

              <div className="col-12 col-md-4">
                <label className="form-label">Theme Color</label>
                <input
                  type="color"
                  className="form-control form-control-color"
                  value={form.theme_color || "#22c55e"}
                  onChange={(e) => setField("theme_color", e.target.value)}
                />
              </div>

              <div className="col-12 col-md-8" />

              <div className="col-12 col-md-6">
                <label className="form-label">Card Template</label>
                <select
                  className="form-select"
                  value={form.template_style || "design1"}
                  onChange={(e) => setField("template_style", e.target.value)}
                >
                  <option value="design1">Design 1</option>
                  <option value="design2">Design 2</option>
                  <option value="design3">Design 3</option>
                </select>
              </div>

              <div className="col-12 col-md-6">
                <div className="form-check mt-4">
                  <input
                    className="form-check-input"
                    id="wa-card-custom-domain-active"
                    type="checkbox"
                    checked={Boolean(form.custom_domain_active)}
                    onChange={(e) => setField("custom_domain_active", e.target.checked)}
                    disabled={!form.custom_domain}
                  />
                  <label className="form-check-label" htmlFor="wa-card-custom-domain-active">
                    Enable custom domain mapping
                  </label>
                </div>
              </div>

              <div className="col-12 col-md-4">
                <label className="form-label">Icon Size (pt)</label>
                <input
                  type="number"
                  min="8"
                  max="36"
                  className="form-control"
                  value={form.icon_size_pt || 14}
                  onChange={(e) => setField("icon_size_pt", e.target.value)}
                />
              </div>

              <div className="col-12 col-md-4">
                <label className="form-label">Font Size (pt)</label>
                <input
                  type="number"
                  min="10"
                  max="36"
                  className="form-control"
                  value={form.font_size_pt || 16}
                  onChange={(e) => setField("font_size_pt", e.target.value)}
                />
              </div>

              <div className="col-12 col-md-4">
                <label className="form-label">Logo Size (px)</label>
                <input
                  type="number"
                  min="48"
                  max="180"
                  className="form-control"
                  value={form.logo_size || 96}
                  onChange={(e) => setField("logo_size", Number(e.target.value || 96))}
                />
              </div>

              <div className="col-12">
                <label className="form-label">Address</label>
                <textarea className="form-control" rows="2" value={form.address || ""} onChange={(e) => setField("address", e.target.value)} />
              </div>

              <div className="col-12">
                <label className="form-label">Description</label>
                <textarea className="form-control" rows="3" value={form.description || ""} onChange={(e) => setField("description", e.target.value)} />
              </div>

              <div className="col-12 col-md-6">
                <label className="form-label">Profile Logo</label>
                <input type="file" accept="image/*" className="form-control" onChange={(e) => onImagePick("logo_image_data", e.target.files?.[0], 500)} />
                <div className="d-flex gap-2 mt-2">
                  {form.logo_image_data ? <button type="button" className="btn btn-outline-danger btn-sm" onClick={() => setField("logo_image_data", "")}>Remove Logo</button> : null}
                </div>
              </div>

              <div className="col-12 col-md-6">
                <label className="form-label">Hero Banner (small)</label>
                <input type="file" accept="image/*" className="form-control" onChange={(e) => onImagePick("hero_banner_image_data", e.target.files?.[0], 1500)} />
                <div className="d-flex gap-2 mt-2">
                  {form.hero_banner_image_data ? <button type="button" className="btn btn-outline-danger btn-sm" onClick={() => setField("hero_banner_image_data", "")}>Remove Banner</button> : null}
                </div>
              </div>

              <div className="col-12">
                <div className="form-check">
                  <input className="form-check-input" id="wa-card-active" type="checkbox" checked={Boolean(form.is_active)} onChange={(e) => setField("is_active", e.target.checked)} />
                  <label className="form-check-label" htmlFor="wa-card-active">Active card</label>
                </div>
              </div>

              {form.custom_domain ? (
                <div className="col-12">
                  <div className="card p-3">
                    <div className="d-flex align-items-center justify-content-between gap-2 mb-2">
                      <h6 className="mb-0">Custom URL Mapping</h6>
                      <span className={`badge ${form.custom_domain_active ? "bg-success" : "bg-warning text-dark"}`}>
                        {form.custom_domain_active ? "Mapped (App-side active)" : "Pending Activation"}
                      </span>
                    </div>
                    <div className="small text-secondary mb-2">
                      Domain: <code>{form.custom_domain}</code>
                      {" "}→ Card Path: <code>/card/{form.public_slug || "<slug>"}/</code>
                    </div>
                    {customUrl ? (
                      <div className="small mb-3">
                        <strong>Custom URL:</strong>{" "}
                        <a href={customUrl} target="_blank" rel="noreferrer">{customUrl}</a>
                      </div>
                    ) : null}
                    <div className="table-responsive">
                      <table className="table table-sm align-middle mb-2">
                        <thead>
                          <tr>
                            <th>Type</th>
                            <th>Host</th>
                            <th>Value</th>
                            <th>TTL</th>
                          </tr>
                        </thead>
                        <tbody>
                          {dnsRows.map((row, idx) => (
                            <tr key={`${row.type}-${idx}`}>
                              <td>{row.type}</td>
                              <td><code>{row.host}</code></td>
                              <td><code>{row.value}</code></td>
                              <td>{row.ttl}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <div className="small text-secondary">
                      DNS set pannitu reverse proxy / SSL configure pannina custom domain-la same digital card view open ஆகும்.
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </div>

        <div className="col-12 col-xl-5">
          <DigitalCardPreview form={form} company={company} />
        </div>
      </div>

      <div className="p-0">
        <div className="wz-table-toolbar d-flex flex-wrap align-items-center justify-content-between gap-2 mb-2">
          <h4 className="mb-0">Created Cards</h4>
          <label className="table-search wz-table-search mb-0" htmlFor="wa-digital-card-search">
            <i className="bi bi-search" aria-hidden="true" />
            <input
              id="wa-digital-card-search"
              type="search"
              placeholder="Search cards"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
        </div>

        <div className="table-responsive wz-data-table-wrap">
          <table className="table table-dark table-striped table-hover align-middle wz-data-table digital-card-table">
            <thead>
              <tr>
                <th>Title</th>
                <th>Person</th>
                <th>Slug</th>
                <th>Template</th>
                <th>Custom URL</th>
                <th>QR</th>
                <th>Status</th>
                <th className="table-actions">Action</th>
              </tr>
            </thead>
            <tbody>
              {rows.length ? rows.map((row) => (
                <tr key={row.id}>
                  <td>{row.card_title || "-"}</td>
                  <td>{row.person_name || "-"}</td>
                  <td><code>{row.public_slug}</code></td>
                  <td>{(row.template_style || "design1").replace("design", "Design ")}</td>
                  <td>
                    {row.custom_url ? (
                      <div className="d-flex flex-column gap-1">
                        <a href={row.custom_url} target="_blank" rel="noreferrer">{row.custom_domain}</a>
                        <small className={row.custom_domain_active ? "text-success" : "text-warning"}>
                          {row.custom_domain_active ? "Active" : "Pending"}
                        </small>
                      </div>
                    ) : (
                      <span className="text-secondary">-</span>
                    )}
                  </td>
                  <td>
                    {row.public_url ? (
                      <a
                        href={qrPngUrl(row.public_url, 240)}
                        target="_blank"
                        rel="noreferrer"
                        title="Open QR PNG"
                        className="d-inline-block"
                      >
                        <img
                          src={qrPngUrl(row.public_url, 72)}
                          alt="QR"
                          style={{ width: 44, height: 44, borderRadius: 6, border: "1px solid rgba(148,163,184,0.25)", background: "#fff", padding: 2 }}
                        />
                      </a>
                    ) : (
                      <span className="text-secondary">-</span>
                    )}
                  </td>
                  <td>
                    <span className={`badge ${row.is_active ? "bg-success" : "bg-secondary"}`}>
                      {row.is_active ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="table-actions">
                    <div className="d-flex flex-wrap gap-1">
                      <a className="btn btn-outline-light btn-sm" href={row.public_url} target="_blank" rel="noreferrer">View</a>
                      {row.public_url ? <a className="btn btn-outline-warning btn-sm" href={qrPngUrl(row.public_url, 480)} target="_blank" rel="noreferrer">QR</a> : null}
                      {row.custom_url ? <a className="btn btn-outline-success btn-sm" href={row.custom_url} target="_blank" rel="noreferrer">URL</a> : null}
                      <button type="button" className="btn btn-outline-info btn-sm" onClick={() => onEdit(row)}>Edit</button>
                      <button
                        type="button"
                        className="btn btn-outline-danger btn-sm"
                        disabled={deletingId === row.id}
                        onClick={() => onDelete(row)}
                      >
                        {deletingId === row.id ? "Deleting..." : "Delete"}
                      </button>
                    </div>
                  </td>
                </tr>
              )) : (
                <tr>
                  <td colSpan="8" className="text-center text-secondary py-4">No digital cards found.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="wz-table-footer d-flex flex-wrap align-items-center justify-content-between gap-2 mt-2">
          <small className="text-secondary">
            Showing {rows.length ? ((page - 1) * PAGE_SIZE) + 1 : 0} to {((page - 1) * PAGE_SIZE) + rows.length} of {pagination.total_items || 0}
          </small>
          <div className="d-flex gap-2 wz-pagination-inline">
            <button
              type="button"
              className="btn btn-outline-light btn-sm"
              disabled={page <= 1}
              onClick={() => loadCards({ page: page - 1, q: query }).catch((err) => setError(err?.message || "Unable to load digital cards."))}
            >
              Prev
            </button>
            <span className="btn btn-outline-light btn-sm disabled">Page {page} / {totalPages}</span>
            <button
              type="button"
              className="btn btn-outline-light btn-sm"
              disabled={page >= totalPages}
              onClick={() => loadCards({ page: page + 1, q: query }).catch((err) => setError(err?.message || "Unable to load digital cards."))}
            >
              Next
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
