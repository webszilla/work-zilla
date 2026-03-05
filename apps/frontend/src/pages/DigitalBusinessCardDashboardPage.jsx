import { useEffect, useMemo, useState } from "react";
import { waApi } from "../api/whatsappAutomation.js";
import { PHONE_COUNTRIES } from "../lib/phoneCountries.js";

const PAGE_SIZE = 10;
const COUNTRY_CODE_OPTIONS = PHONE_COUNTRIES;
const COUNTRY_CODES_DESC = Array.from(new Set(PHONE_COUNTRIES.map((x) => x.code))).sort((a, b) => b.length - a.length);
const CARD_TEMPLATE_OPTIONS = [
  { value: "design1", label: "Design 1 - Executive Blue" },
  { value: "design2", label: "Design 2 - Neon Profile" },
  { value: "design3", label: "Design 3 - Clean Curve" },
  { value: "design4", label: "Design 4 - Studio Wave" },
  { value: "design5", label: "Design 5 - Portrait Pro" },
  { value: "design6", label: "Design 6 - Premium Noir" },
  { value: "design7", label: "Design 7 - Social Spotlight" },
  { value: "design8", label: "Design 8 - Gold Corporate" },
];

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
    id: prefill.id ?? null,
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
    theme_secondary_color: prefill.theme_secondary_color || "#0f172a",
    template_style: prefill.template_style || "design1",
    custom_domain: prefill.custom_domain || "",
    custom_domain_active: Boolean(prefill.custom_domain_active),
    logo_image_data: prefill.logo_image_data || "",
    hero_banner_image_data: prefill.hero_banner_image_data || "",
    logo_size: Number(prefill.logo_size || 96),
    logo_radius_px: Number(prefill.logo_radius_px || 28),
    icon_size_pt: Number(prefill.icon_size_pt || 14),
    font_size_pt: Number(prefill.font_size_pt || 16),
    social_links_items: Array.isArray(prefill.social_links_items) ? prefill.social_links_items : [],
    is_primary: Boolean(prefill.is_primary),
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

function buildVCardDownload(form, company) {
  const fullName = String(form.person_name || company?.company_name || "Contact").trim() || "Contact";
  const organization = String(form.card_title || company?.company_name || "").trim();
  const role = String(form.role_title || "").trim();
  const phone = String(form.phone || "").trim();
  const whatsapp = String(form.whatsapp_number || "").trim();
  const email = String(form.email || "").trim();
  const website = String(form.website || "").trim();
  const address = String(form.address || "").replace(/\r?\n/g, ", ").trim();
  const note = String(form.description || company?.description || "").replace(/\r?\n/g, " ").trim();
  const lines = [
    "BEGIN:VCARD",
    "VERSION:3.0",
    `FN:${fullName}`,
    organization ? `ORG:${organization}` : "",
    role ? `TITLE:${role}` : "",
    phone ? `TEL;TYPE=CELL:${phone}` : "",
    whatsapp && whatsapp !== phone ? `TEL;TYPE=WORK,VOICE:${whatsapp}` : "",
    email ? `EMAIL:${email}` : "",
    website ? `URL:${website}` : "",
    address ? `ADR:;;${address};;;;` : "",
    note ? `NOTE:${note}` : "",
    "END:VCARD",
  ].filter(Boolean);
  const fileName = `${fullName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "contact"}.vcf`;
  return {
    href: `data:text/vcard;charset=utf-8,${encodeURIComponent(lines.join("\n"))}`,
    fileName,
  };
}

function getSocialIconClass(icon) {
  switch (String(icon || "").toLowerCase()) {
    case "facebook":
      return "bi-facebook";
    case "instagram":
      return "bi-instagram";
    case "linkedin":
      return "bi-linkedin";
    case "whatsapp":
      return "bi-whatsapp";
    case "youtube":
      return "bi-youtube";
    case "twitter":
    case "x":
      return "bi-twitter-x";
    case "telegram":
      return "bi-telegram";
    case "website":
    case "globe":
      return "bi-globe";
    default:
      return "bi-link-45deg";
  }
}

function templateLabel(value) {
  const match = CARD_TEMPLATE_OPTIONS.find((item) => item.value === value);
  return match ? match.label : String(value || "design1").replace("design", "Design ");
}

function toWebHref(value) {
  const raw = String(value || "").trim();
  if (!raw || raw === "-") return "";
  if (/^https?:\/\//i.test(raw)) return raw;
  return `https://${raw}`;
}

function toExternalHref(value) {
  const raw = String(value || "").trim();
  if (!raw || raw === "-") return "";
  if (/^(https?:\/\/|mailto:|tel:)/i.test(raw)) return raw;
  if (raw.startsWith("//")) return `https:${raw}`;
  return `https://${raw}`;
}

function toMapsHref(value) {
  const raw = String(value || "").trim();
  if (!raw || raw === "-") return "";
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(raw)}`;
}

function DigitalCardPreview({ form, company }) {
  const theme = form.theme_color || company?.theme_color || "#22c55e";
  const secondaryTheme = form.theme_secondary_color || "#0f172a";
  const socials = Array.isArray(form.social_links_items) ? form.social_links_items.slice(0, 5) : [];
  const templateStyle = form.template_style || "design1";
  const iconPt = Math.max(8, Number(form.icon_size_pt || 14));
  const fontPt = Math.max(10, Number(form.font_size_pt || 16));
  const logoSize = Math.max(72, Number(form.logo_size || 96));
  const logoRadius = Math.max(0, Number(form.logo_radius_px ?? 28));
  const initials = (form.card_title || form.person_name || company?.company_name || "C").slice(0, 1).toUpperCase();
  const displayName = form.person_name || company?.company_name || "Your Name";
  const displayRole = form.role_title || "Business / Professional";
  const displayTitle = form.card_title || company?.company_name || "Company Name";
  const displayDescription = form.description || company?.description || "Digital business card preview";
  const socialBadges = socials.length
    ? socials
    : [
        { label: "Fb", icon: "facebook" },
        { label: "In", icon: "linkedin" },
        { label: "Ig", icon: "instagram" },
        { label: "Wa", icon: "whatsapp" },
      ];
  const quickActions = [
    form.phone ? { label: "Call", href: `tel:${form.phone}` } : null,
    form.website ? { label: "Website", href: toExternalHref(form.website) } : null,
    form.whatsapp_number
      ? { label: "WhatsApp", href: `https://wa.me/${String(form.whatsapp_number).replace(/\+/g, "")}` }
      : null,
  ].filter(Boolean);
  const infoRows = [
    { icon: "bi-telephone", value: form.phone || "-", href: form.phone ? `tel:${form.phone}` : "" },
    { icon: "bi-whatsapp", value: form.whatsapp_number || "-", href: form.whatsapp_number ? `https://wa.me/${String(form.whatsapp_number).replace(/\+/g, "")}` : "" },
    { icon: "bi-envelope", value: form.email || "-", href: form.email ? `mailto:${form.email}` : "" },
    { icon: "bi-globe", value: form.website || "-", href: toWebHref(form.website) },
    { icon: "bi-geo-alt", value: form.address || "-", href: toMapsHref(form.address) },
  ];
  const contactCard = buildVCardDownload(form, company);
  const publicCardUrl = form.public_slug && typeof window !== "undefined"
    ? `${window.location.origin}/card/${form.public_slug}/`
    : "";
  const smsBody = encodeURIComponent(`Check my digital card: ${publicCardUrl || (form.website || "")}`.trim());
  const enquiryHref = form.email
    ? `mailto:${form.email}?subject=${encodeURIComponent("Enquiry")}`
    : (form.whatsapp_number ? `https://wa.me/${String(form.whatsapp_number).replace(/\+/g, "")}?text=${encodeURIComponent("Hi, I have an enquiry.")}` : "");
  const bottomActions = [
    { label: "Login", icon: "bi-box-arrow-in-right", href: "/auth/login/" },
    { label: "Share", icon: "bi-share-fill", action: "share" },
    { label: "SMS", icon: "bi-chat-left-text-fill", href: `sms:?body=${smsBody}` },
    { label: "Upgrade", icon: "bi-basket-fill", href: "/pricing/" },
    { label: "Enquiry", icon: "bi-chat-quote-fill", href: enquiryHref },
  ];

  function onShareClick(e) {
    e.preventDefault();
    const shareUrl = publicCardUrl || (typeof window !== "undefined" ? window.location.href : "");
    if (typeof navigator !== "undefined" && navigator.share) {
      navigator.share({ title: displayTitle, text: displayDescription, url: shareUrl }).catch(() => {});
      return;
    }
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(shareUrl).catch(() => {});
    }
  }

  return (
    <div
      className={`digital-card-preview digital-card-preview--${templateStyle}`}
      style={{ "--card-theme": theme, "--card-secondary": secondaryTheme, "--card-font-pt": fontPt, "--card-icon-pt": iconPt }}
    >
      <div
        className="digital-card-preview__hero"
        style={{
          background: form.hero_banner_image_data
            ? `center/cover no-repeat url(${form.hero_banner_image_data})`
            : undefined,
        }}
      />
      <div className="digital-card-preview__body">
        <div
          className="digital-card-preview__avatar"
          style={{ width: `${logoSize}px`, height: `${logoSize}px`, borderRadius: `${logoRadius}px` }}
        >
          {form.logo_image_data ? (
            <img src={form.logo_image_data} alt="Logo" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          ) : (
            <span>{initials}</span>
          )}
        </div>

        <div className="digital-card-preview__identity">
          <h5>{displayName}</h5>
          <p className="digital-card-preview__role">{displayRole}</p>
          <a className="digital-card-preview__template-badge" href={contactCard.href} download={contactCard.fileName}>
            Save This Contact
          </a>
        </div>

        <div className="digital-card-preview__socials">
          {socialBadges.map((item, idx) => (
            <a
              key={`${item.icon || item.label}-${idx}`}
              className="digital-card-preview__social-chip"
              title={item.label || item.icon || "Link"}
              href={item.url ? toExternalHref(item.url) : "#"}
              target={item.url ? "_blank" : undefined}
              rel={item.url ? "noreferrer" : undefined}
              onClick={item.url ? undefined : (e) => e.preventDefault()}
            >
              {item.type === "custom" && item.custom_icon_data ? (
                <img src={item.custom_icon_data} alt={item.label || "Social"} width="18" height="18" style={{ display: "block", objectFit: "contain" }} />
              ) : (
                <i className={`bi ${getSocialIconClass(item.icon)}`} aria-hidden="true" />
              )}
            </a>
          ))}
        </div>

        <div className="digital-card-preview__title">{displayTitle}</div>
        <p className="digital-card-preview__description">{displayDescription}</p>

        <div className="digital-card-preview__actions">
          {quickActions.map((item) => (
            <a key={item.label} className="digital-card-preview__action" href={item.href} target={item.href.startsWith("http") ? "_blank" : undefined} rel={item.href.startsWith("http") ? "noreferrer" : undefined}>
              {item.label}
            </a>
          ))}
        </div>

        <div className="digital-card-preview__details">
          {infoRows.map((item) => (
            item.href ? (
              <a
                key={`${item.icon}-${item.value}`}
                className="digital-card-preview__detail-row"
                href={item.href}
                target={item.href.startsWith("http") ? "_blank" : undefined}
                rel={item.href.startsWith("http") ? "noreferrer" : undefined}
              >
                <i className={`bi ${item.icon}`} />
                <span>{item.value}</span>
              </a>
            ) : (
              <div key={`${item.icon}-${item.value}`} className="digital-card-preview__detail-row">
                <i className={`bi ${item.icon}`} />
                <span>{item.value}</span>
              </div>
            )
          ))}
        </div>

        <div className="digital-card-preview__footer-actions">
          {bottomActions.map((item) => (
            item.action === "share" ? (
              <a key={item.label} className="digital-card-preview__footer-action" href={publicCardUrl || "#"} onClick={onShareClick}>
                <i className={`bi ${item.icon}`} />
                <span>{item.label}</span>
              </a>
            ) : (
              <a
                key={item.label}
                className="digital-card-preview__footer-action"
                href={item.href || "#"}
                target={item.href?.startsWith("http") ? "_blank" : undefined}
                rel={item.href?.startsWith("http") ? "noreferrer" : undefined}
              >
                <i className={`bi ${item.icon}`} />
                <span>{item.label}</span>
              </a>
            )
          ))}
        </div>

        <div className="digital-card-preview__credit">
          This virtual card was designed with{" "}
          <a href="https://www.getworkzilla.com" target="_blank" rel="noreferrer">
            www.getworkzilla.com
          </a>
        </div>
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
  const [query, setQuery] = useState("");
  const [cardListTab, setCardListTab] = useState("primary");
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

  const canCreateNew = useMemo(() => {
    if (!limitInfo) return true;
    return Boolean(limitInfo.can_create);
  }, [limitInfo]);

  const primaryRows = useMemo(() => rows.filter((row) => row.is_primary), [rows]);
  const otherRows = useMemo(() => rows.filter((row) => !row.is_primary), [rows]);
  const visibleRows = cardListTab === "other" ? otherRows : primaryRows;

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
    <div className="d-flex flex-column gap-3">
      <div className="d-flex align-items-center justify-content-between">
        <div>
          <h3 className="mb-1">Digital Business Card</h3>
          <p className="text-secondary mb-0">Edit the details on the left and preview the live card on the right as you update the form.</p>
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
              {!limitInfo.can_create ? " | Purchase additional add-on users to create more digital cards." : ""}
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
                {cardUrl ? <a className="btn btn-sm wa-card-toolbar-link" href={cardUrl} target="_blank" rel="noreferrer">View</a> : null}
                {customUrl ? (
                  <a
                    className="btn btn-sm wa-card-toolbar-link wa-card-toolbar-link--primary"
                    href={customUrl}
                    target="_blank"
                    rel="noreferrer"
                    style={{ "--wa-card-toolbar-theme": form.theme_color || "#22c55e" }}
                  >
                    Custom URL
                  </a>
                ) : null}
                <a className="btn btn-sm wa-card-toolbar-link" href="/app/whatsapp-automation/dashboard/company-profile">Company Profile</a>
              </div>
            </div>
            <p className="text-secondary small">Default values are loaded from the Company Profile. Any changes here are saved only for this individual card.</p>

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

              <div className="col-12 col-md-3">
                <label className="form-label">Primary Color</label>
                <input
                  type="color"
                  className="form-control form-control-color"
                  value={form.theme_color || "#22c55e"}
                  onChange={(e) => setField("theme_color", e.target.value)}
                />
              </div>

              <div className="col-12 col-md-3">
                <label className="form-label">Secondary Color</label>
                <input
                  type="color"
                  className="form-control form-control-color"
                  value={form.theme_secondary_color || "#0f172a"}
                  onChange={(e) => setField("theme_secondary_color", e.target.value)}
                />
              </div>

              <div className="col-12 col-md-6">
                <label className="form-label">Card Template</label>
                <select
                  className="form-select"
                  value={form.template_style || "design1"}
                  onChange={(e) => setField("template_style", e.target.value)}
                >
                  {CARD_TEMPLATE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
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

              <div className="col-12 col-md-3">
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

              <div className="col-12 col-md-3">
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

              <div className="col-12 col-md-3">
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

              <div className="col-12 col-md-3">
                <label className="form-label">Logo Radius (px)</label>
                <input
                  type="number"
                  min="0"
                  max="999"
                  className="form-control"
                  value={form.logo_radius_px ?? 28}
                  onChange={(e) => setField("logo_radius_px", Number(e.target.value || 0))}
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
                <div className="d-flex flex-wrap gap-3">
                  <div className="form-check">
                    <input className="form-check-input" id="wa-card-primary" type="checkbox" checked={Boolean(form.is_primary)} onChange={(e) => setField("is_primary", e.target.checked)} />
                    <label className="form-check-label" htmlFor="wa-card-primary">Primary card</label>
                  </div>
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
                  <div className="digital-card-domain-panel">
                    <div className="digital-card-domain-panel__header">
                      <div>
                        <h6 className="digital-card-domain-panel__title mb-0">Custom URL Mapping</h6>
                      </div>
                      <span className={`digital-card-domain-panel__status ${form.custom_domain_active ? "is-active" : "is-pending"}`}>
                        {form.custom_domain_active ? "Mapped (App-side active)" : "Pending Activation"}
                      </span>
                    </div>
                    <div className="digital-card-domain-panel__meta">
                      Domain: <code>{form.custom_domain}</code>
                      {" "}→ Card Path: <code>/card/{form.public_slug || "<slug>"}/</code>
                    </div>
                    {customUrl ? (
                      <div className="digital-card-domain-panel__url">
                        <strong>Custom URL:</strong>{" "}
                        <a href={customUrl} target="_blank" rel="noreferrer">{customUrl}</a>
                      </div>
                    ) : null}
                    <div className="table-responsive wz-data-table-wrap digital-card-domain-panel__table-wrap">
                      <table className="table table-dark table-striped table-hover align-middle mb-0 wz-data-table digital-card-domain-table">
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
                    <div className="digital-card-domain-panel__note">
                      After DNS, reverse proxy, and SSL are configured, this custom domain will open the same digital card view.
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
          <div className="d-flex gap-2">
            <button
              type="button"
              className={`btn btn-sm ${cardListTab === "primary" ? "btn-primary" : "btn-outline-light"}`}
              onClick={() => setCardListTab("primary")}
            >
              Primary Card
            </button>
            <button
              type="button"
              className={`btn btn-sm ${cardListTab === "other" ? "btn-primary" : "btn-outline-light"}`}
              onClick={() => setCardListTab("other")}
            >
              Other Cards
            </button>
          </div>
        </div>

        <div className="table-responsive wz-data-table-wrap">
          <table className="table table-dark table-striped table-hover align-middle wz-data-table digital-card-table">
            <thead>
              <tr>
                <th>Title</th>
                <th>Person</th>
                <th>Slug</th>
                <th>Custom URL</th>
                <th>QR</th>
                <th>Status</th>
                <th className="table-actions">Action</th>
              </tr>
            </thead>
            <tbody>
              {visibleRows.length ? visibleRows.map((row) => (
                <tr key={row.id}>
                  <td>
                    <div className="d-flex align-items-center gap-2 flex-wrap">
                      <span>{row.card_title || "-"}</span>
                      {row.is_primary ? <span className="badge bg-info text-dark">Primary</span> : null}
                    </div>
                  </td>
                  <td>{row.person_name || "-"}</td>
                  <td>
                    <code className="digital-card-table__slug">{row.public_slug}</code>
                  </td>
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
                    <div className="digital-card-table__actions">
                      <a className="btn btn-sm digital-card-table__action-btn digital-card-table__action-btn--neutral" href={row.public_url} target="_blank" rel="noreferrer">View</a>
                      {row.public_url ? <a className="btn btn-sm digital-card-table__action-btn digital-card-table__action-btn--qr" href={qrPngUrl(row.public_url, 480)} target="_blank" rel="noreferrer">QR</a> : null}
                      {row.custom_url ? <a className="btn btn-sm digital-card-table__action-btn digital-card-table__action-btn--success" href={row.custom_url} target="_blank" rel="noreferrer">URL</a> : null}
                      <button type="button" className="btn btn-sm digital-card-table__action-btn digital-card-table__action-btn--info" onClick={() => onEdit(row)}>Edit</button>
                      <button
                        type="button"
                        className="btn btn-sm digital-card-table__action-btn digital-card-table__action-btn--danger"
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
                  <td colSpan="7" className="text-center text-secondary py-4">No digital cards found.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="wz-table-footer d-flex flex-wrap align-items-center justify-content-between gap-2 mt-2">
          <small className="text-secondary">
            Showing {visibleRows.length ? ((page - 1) * PAGE_SIZE) + 1 : 0} to {((page - 1) * PAGE_SIZE) + visibleRows.length} of {cardListTab === "other" ? otherRows.length : primaryRows.length}
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
