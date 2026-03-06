import { useEffect, useState } from "react";
import { waApi } from "../api/whatsappAutomation.js";
import TinyHtmlEditor from "../components/TinyHtmlEditor.jsx";
import { COUNTRY_OPTIONS } from "../lib/countries.js";
import { getStateOptions } from "../lib/locationOptions.js";
import { PHONE_COUNTRIES } from "../lib/phoneCountries.js";

const SOCIAL_ICON_OPTIONS = [
  { value: "instagram", label: "Instagram", bi: "bi-instagram" },
  { value: "facebook", label: "Facebook", bi: "bi-facebook" },
  { value: "youtube", label: "YouTube", bi: "bi-youtube" },
  { value: "linkedin", label: "LinkedIn", bi: "bi-linkedin" },
  { value: "x", label: "X / Twitter", bi: "bi-twitter-x" },
  { value: "whatsapp", label: "WhatsApp", bi: "bi-whatsapp" },
  { value: "telegram", label: "Telegram", bi: "bi-telegram" },
  { value: "website", label: "Website", bi: "bi-globe2" },
];
const LIMITS = {
  companyName: 120,
  phoneNumber: 20,
  whatsappNumber: 20,
  email: 120,
  website: 255,
  address: 260,
  state: 80,
  postalCode: 20,
  description: 320,
  socialLabel: 60,
  socialUrl: 255,
};

function limitText(value, max) {
  return String(value || "").slice(0, max);
}

function digitsOnly(value, max) {
  return String(value || "").replace(/[^\d]/g, "").slice(0, max);
}

function socialBootstrapIcon(icon) {
  return SOCIAL_ICON_OPTIONS.find((opt) => opt.value === icon)?.bi || "bi-link-45deg";
}

const emptyForm = {
  company_name: "",
  phone_country: "+91",
  phone_number: "",
  whatsapp_country: "+91",
  whatsapp_local_number: "",
  email: "",
  website: "",
  address: "",
  country: "India",
  state: "",
  postal_code: "",
  description: "",
  theme_color: "#22c55e",
  product_highlights_html: "",
  social_links_text: "{}",
  logo_data_url: "",
};

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function highlightListToHtml(value) {
  if (typeof value === "string") {
    return value;
  }
  if (!Array.isArray(value) || !value.length) {
    return "";
  }
  const items = value
    .map((item) => String(item || "").trim())
    .filter(Boolean)
    .map((item) => `<li>${escapeHtml(item)}</li>`)
    .join("");
  return items ? `<ul>${items}</ul>` : "";
}

function createEmptySocialLink() {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    type: "preset",
    icon: "instagram",
    label: "Instagram",
    url: "",
    icon_size: 20,
    custom_icon_data: "",
  };
}

function normalizeSocialLinksForUi(company) {
  const source = Array.isArray(company?.social_links_items)
    ? company.social_links_items
    : Array.isArray(company?.social_links?.items)
      ? company.social_links.items
      : [];
  if (!source.length) return [];
  return source.map((item, index) => ({
    id: `${Date.now()}-${index}`,
    type: item?.type === "custom" ? "custom" : "preset",
    icon: item?.icon || "website",
    label: item?.label || item?.icon || "Link",
    url: item?.url || "",
    icon_size: Number(item?.icon_size || 20),
    custom_icon_data: item?.custom_icon_data || "",
  }));
}

const SORTED_PHONE_CODES = [...new Set(PHONE_COUNTRIES.map((entry) => entry.code))].sort((a, b) => b.length - a.length);

function splitStoredPhone(value) {
  const raw = String(value || "").trim();
  if (!raw) {
    return { countryCode: "+91", number: "" };
  }
  const compact = raw.replace(/\s+/g, " ").trim();
  const matched = SORTED_PHONE_CODES.find((code) => compact === code || compact.startsWith(`${code} `) || compact.startsWith(code));
  if (!matched) {
    return { countryCode: "+91", number: compact };
  }
  const remainder = compact.slice(matched.length).trim();
  return { countryCode: matched, number: remainder };
}

function joinPhoneParts(countryCode, number) {
  const code = String(countryCode || "").trim();
  const local = String(number || "").trim();
  if (!local) {
    return "";
  }
  return `${code} ${local}`.trim();
}

export default function WhatsappAutomationCompanyProfilePage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [form, setForm] = useState(emptyForm);
  const [links, setLinks] = useState({ digital_card_url: "", catalogue_url: "" });
  const [socialLinks, setSocialLinks] = useState([]);
  const [companyLogoUrl, setCompanyLogoUrl] = useState("");

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const data = await waApi.getCompanyProfile();
        if (!active) return;
        const company = data?.company_profile || {};
        const phone = splitStoredPhone(company.phone);
        const whatsapp = splitStoredPhone(company.whatsapp_number);
        setForm({
          company_name: company.company_name || "",
          phone_country: phone.countryCode,
          phone_number: phone.number,
          whatsapp_country: whatsapp.countryCode,
          whatsapp_local_number: whatsapp.number,
          email: company.email || "",
          website: company.website || "",
          address: company.address || "",
          country: company.country || "India",
          state: company.state || "",
          postal_code: company.postal_code || "",
          description: company.description || "",
          theme_color: company.theme_color || "#22c55e",
          product_highlights_html: highlightListToHtml(company.product_highlights_html || company.product_highlights || ""),
          social_links_text: JSON.stringify(company.social_links || {}, null, 2),
          logo_data_url: "",
        });
        setCompanyLogoUrl(company.logo_url || "");
        setSocialLinks(normalizeSocialLinksForUi(company));
        setLinks({
          digital_card_url: company.digital_card_url || "",
          catalogue_url: company.catalogue_url || "",
        });
        setLoading(false);
      } catch (err) {
        if (!active) return;
        setError(err?.message || "Unable to load company profile.");
        setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  async function onSave() {
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const social_links_items = socialLinks
        .map((row) => ({
          type: row.type === "custom" ? "custom" : "preset",
          icon: String(row.icon || "").trim(),
          label: String(row.label || "").trim() || String(row.icon || "Link"),
          url: String(row.url || "").trim(),
          icon_size: Number(row.icon_size || 20),
          custom_icon_data: row.type === "custom" ? String(row.custom_icon_data || "") : "",
        }))
        .filter((row) => row.url);
      const res = await waApi.saveCompanyProfile({
        company_name: form.company_name,
        phone: joinPhoneParts(form.phone_country, form.phone_number),
        whatsapp_number: joinPhoneParts(form.whatsapp_country, form.whatsapp_local_number),
        email: form.email,
        website: form.website,
        address: form.address,
        country: form.country,
        state: form.state,
        postal_code: form.postal_code,
        description: form.description,
        theme_color: form.theme_color,
        logo_data_url: form.logo_data_url || "",
        product_highlights_html: form.product_highlights_html,
        social_links_items,
      });
      const company = res?.company_profile || {};
      setCompanyLogoUrl(company.logo_url || companyLogoUrl);
      setForm((prev) => ({ ...prev, logo_data_url: "" }));
      setSocialLinks(normalizeSocialLinksForUi(company));
      setLinks({
        digital_card_url: company.digital_card_url || "",
        catalogue_url: company.catalogue_url || "",
      });
      setSuccess("Company profile saved.");
    } catch (err) {
      setError(err?.message || "Unable to save company profile.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="p-4 text-center"><div className="spinner" /><p className="mb-0">Loading company profile...</p></div>;

  const stateOptions = getStateOptions(form.country);

  async function onCustomIconChange(id, file) {
    if (!file) return;
    if (!String(file.type || "").startsWith("image/")) {
      setError("Custom icon must be an image file.");
      return;
    }
    // keep it light for JSON storage
    if (file.size > 200 * 1024) {
      setError("Custom icon size must be under 200 KB.");
      return;
    }
    const dataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(new Error("Unable to read icon file."));
      reader.readAsDataURL(file);
    });
    setSocialLinks((prev) => prev.map((row) => (row.id === id ? { ...row, custom_icon_data: dataUrl } : row)));
    setError("");
  }

  async function onCompanyLogoChange(file) {
    if (!file) return;
    const mime = String(file.type || "").toLowerCase();
    const allowed = new Set(["image/jpeg", "image/jpg", "image/png", "image/svg+xml"]);
    if (!allowed.has(mime)) {
      setError("Company logo supports only JPG, PNG, SVG.");
      return;
    }
    if (file.size > 500 * 1024) {
      setError("Company logo size must be under 500 KB.");
      return;
    }
    const dataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(new Error("Unable to read company logo."));
      reader.readAsDataURL(file);
    });
    setForm((p) => ({ ...p, logo_data_url: dataUrl }));
    setCompanyLogoUrl(dataUrl);
    setError("");
  }

  return (
    <div>
      <div className="d-flex align-items-center justify-content-between mb-3">
        <h3 className="mb-0">Company Profile</h3>
        <div className="d-flex align-items-center gap-3">
          <div>
            <label className="form-label small mb-1">Theme Color</label>
            <input
              type="color"
              className="form-control form-control-color"
              value={form.theme_color}
              onChange={(e) => setForm((p) => ({ ...p, theme_color: e.target.value }))}
            />
          </div>
          <button type="button" className="btn btn-primary btn-sm mt-3" onClick={onSave} disabled={saving}>
            {saving ? "Saving..." : "Save Data"}
          </button>
        </div>
      </div>
      <p className="text-secondary">Single company master profile used by WhatsApp Automation, Website Catalogue, and Digital Business Card.</p>
      {error ? <div className="alert alert-danger">{error}</div> : null}
      {success ? <div className="alert alert-success">{success}</div> : null}
      {(links.digital_card_url || links.catalogue_url) ? (
        <div className="alert alert-info">
          Auto created:
          {" "}
          {links.digital_card_url ? <a href={links.digital_card_url} target="_blank" rel="noreferrer">Digital Card</a> : null}
          {links.digital_card_url && links.catalogue_url ? " | " : ""}
          {links.catalogue_url ? <a href={links.catalogue_url} target="_blank" rel="noreferrer">Catalogue</a> : null}
        </div>
      ) : null}
      <div className="row g-3">
        <div className="col-12 col-lg-4">
          <label className="form-label">Company Name</label>
          <input className="form-control" maxLength={LIMITS.companyName} value={form.company_name} onChange={(e) => setForm((p) => ({ ...p, company_name: limitText(e.target.value, LIMITS.companyName) }))} />
        </div>
        <div className="col-12 col-lg-4">
          <label className="form-label">Phone</label>
          <div className="input-group">
            <select
              className="form-select"
              style={{ maxWidth: 140 }}
              value={form.phone_country}
              onChange={(e) => setForm((p) => ({ ...p, phone_country: e.target.value }))}
            >
              {PHONE_COUNTRIES.map((entry) => (
                <option key={`${entry.label}-${entry.code}`} value={entry.code}>
                  {entry.code} {entry.label}
                </option>
              ))}
            </select>
            <input
              className="form-control"
              value={form.phone_number}
              onChange={(e) => setForm((p) => ({ ...p, phone_number: digitsOnly(e.target.value, LIMITS.phoneNumber) }))}
              placeholder="Phone number"
              maxLength={LIMITS.phoneNumber}
              inputMode="numeric"
            />
          </div>
        </div>
        <div className="col-12 col-lg-4">
          <label className="form-label">WhatsApp</label>
          <div className="input-group">
            <select
              className="form-select"
              style={{ maxWidth: 140 }}
              value={form.whatsapp_country}
              onChange={(e) => setForm((p) => ({ ...p, whatsapp_country: e.target.value }))}
            >
              {PHONE_COUNTRIES.map((entry) => (
                <option key={`wa-${entry.label}-${entry.code}`} value={entry.code}>
                  {entry.code} {entry.label}
                </option>
              ))}
            </select>
            <input
              className="form-control"
              value={form.whatsapp_local_number}
              onChange={(e) => setForm((p) => ({ ...p, whatsapp_local_number: digitsOnly(e.target.value, LIMITS.whatsappNumber) }))}
              placeholder="WhatsApp number"
              maxLength={LIMITS.whatsappNumber}
              inputMode="numeric"
            />
          </div>
        </div>
        <div className="col-12 col-lg-4">
          <label className="form-label">Email</label>
          <input className="form-control" maxLength={LIMITS.email} value={form.email} onChange={(e) => setForm((p) => ({ ...p, email: limitText(e.target.value, LIMITS.email) }))} />
        </div>
        <div className="col-12 col-lg-4">
          <label className="form-label">Website</label>
          <input className="form-control" maxLength={LIMITS.website} value={form.website} onChange={(e) => setForm((p) => ({ ...p, website: limitText(e.target.value, LIMITS.website) }))} />
        </div>
        <div className="col-12 col-lg-4">
          <label className="form-label">Company Logo (JPG / PNG / SVG)</label>
          <div className="d-flex align-items-center gap-3">
            <div
              className="rounded border d-flex align-items-center justify-content-center overflow-hidden"
              style={{ width: 64, height: 64, background: "rgba(255,255,255,0.04)" }}
            >
              {companyLogoUrl ? (
                <img src={companyLogoUrl} alt="Company logo" style={{ width: "100%", height: "100%", objectFit: "contain" }} />
              ) : (
                <i className="bi bi-building" style={{ color: "#94a3b8", fontSize: 22 }} aria-hidden="true" />
              )}
            </div>
            <div className="flex-grow-1">
              <input
                type="file"
                accept=".jpg,.jpeg,.png,.svg,image/jpeg,image/png,image/svg+xml"
                className="form-control"
                onChange={(e) => onCompanyLogoChange(e.target.files?.[0])}
              />
              <div className="small text-secondary mt-1">Supported: JPG, PNG, SVG (max 500 KB)</div>
            </div>
          </div>
        </div>
        <div className="col-12 col-lg-6">
          <div className="row g-3">
            <div className="col-12">
              <label className="form-label">Address</label>
              <textarea className="form-control" rows="3" maxLength={LIMITS.address} value={form.address} onChange={(e) => setForm((p) => ({ ...p, address: limitText(e.target.value, LIMITS.address) }))} />
            </div>
            <div className="col-12 col-md-4">
              <label className="form-label">Country</label>
              <select className="form-select" value={form.country} onChange={(e) => setForm((p) => ({ ...p, country: e.target.value, state: "" }))}>
                {COUNTRY_OPTIONS.map((country) => (
                  <option key={country} value={country}>{country}</option>
                ))}
              </select>
            </div>
            <div className="col-12 col-md-4">
              <label className="form-label">State</label>
              {stateOptions.length ? (
                <select className="form-select" value={form.state} onChange={(e) => setForm((p) => ({ ...p, state: e.target.value }))}>
                  <option value="">Select state</option>
                  {stateOptions.map((option) => (
                    <option key={option} value={option}>{option}</option>
                  ))}
                </select>
              ) : (
                <input className="form-control" maxLength={LIMITS.state} value={form.state} onChange={(e) => setForm((p) => ({ ...p, state: limitText(e.target.value, LIMITS.state) }))} />
              )}
            </div>
            <div className="col-12 col-md-4">
              <label className="form-label">Pincode</label>
              <input className="form-control" maxLength={LIMITS.postalCode} inputMode="numeric" value={form.postal_code} onChange={(e) => setForm((p) => ({ ...p, postal_code: limitText(e.target.value, LIMITS.postalCode) }))} />
            </div>
          </div>
        </div>
        <div className="col-12 col-lg-6">
          <div className="row g-3">
            <div className="col-12">
              <label className="form-label">Description</label>
              <textarea className="form-control" rows="4" maxLength={LIMITS.description} value={form.description} onChange={(e) => setForm((p) => ({ ...p, description: limitText(e.target.value, LIMITS.description) }))} />
            </div>
            <div className="col-12">
              <TinyHtmlEditor
                label="Product Highlights"
                value={form.product_highlights_html}
                onChange={(next) => setForm((p) => ({ ...p, product_highlights_html: next }))}
                placeholder="Add product highlights with bullets, headings, and links."
                minHeight={240}
              />
            </div>
          </div>
        </div>
        <div className="col-12">
          <div className="d-flex align-items-center justify-content-between mb-2">
            <label className="form-label mb-0">Social Links</label>
            <button
              type="button"
              className="btn btn-outline-light btn-sm"
              onClick={() => setSocialLinks((prev) => [...prev, createEmptySocialLink()])}
            >
              <i className="bi bi-plus-lg me-1" aria-hidden="true" />
              Add
            </button>
          </div>
          <div className="d-flex flex-column gap-2">
            {socialLinks.length ? socialLinks.map((row) => (
              <div className="card p-2" key={row.id}>
                <div className="row g-2 align-items-end">
                  <div className="col-12 col-md-2">
                    <label className="form-label small">Type</label>
                    <select
                      className="form-select form-select-sm"
                      value={row.type}
                      onChange={(e) => {
                        const type = e.target.value;
                        setSocialLinks((prev) => prev.map((item) => item.id === row.id ? { ...item, type } : item));
                      }}
                    >
                      <option value="preset">Preset Icon</option>
                      <option value="custom">Custom Icon</option>
                    </select>
                  </div>
                  {row.type === "preset" ? (
                    <div className="col-12 col-md-3">
                      <label className="form-label small">Icon</label>
                      <div className="d-flex align-items-center gap-2">
                        <div
                          className="d-inline-flex align-items-center justify-content-center rounded border"
                          style={{ width: 34, height: 34, color: "#22c55e", background: "rgba(34,197,94,0.08)" }}
                          title={row.icon}
                        >
                          <i className={`bi ${socialBootstrapIcon(row.icon)}`} aria-hidden="true" />
                        </div>
                        <select
                          className="form-select form-select-sm"
                          value={row.icon}
                          onChange={(e) => {
                            const icon = e.target.value;
                            const selected = SOCIAL_ICON_OPTIONS.find((opt) => opt.value === icon);
                            setSocialLinks((prev) => prev.map((item) => item.id === row.id ? { ...item, icon, label: item.label || selected?.label || icon } : item));
                          }}
                        >
                          {SOCIAL_ICON_OPTIONS.map((opt) => (
                            <option key={opt.value} value={opt.value}>{opt.label}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                  ) : (
                    <div className="col-12 col-md-3">
                      <label className="form-label small">Custom Icon Upload</label>
                      <input
                        type="file"
                        accept="image/*"
                        className="form-control form-control-sm"
                        onChange={(e) => onCustomIconChange(row.id, e.target.files?.[0])}
                      />
                    </div>
                  )}
                  <div className="col-12 col-md-2">
                    <label className="form-label small">Label</label>
                    <input
                      className="form-control form-control-sm"
                      value={row.label}
                      onChange={(e) => setSocialLinks((prev) => prev.map((item) => item.id === row.id ? { ...item, label: limitText(e.target.value, LIMITS.socialLabel) } : item))}
                      maxLength={LIMITS.socialLabel}
                      placeholder="Instagram"
                    />
                  </div>
                  <div className="col-12 col-md-3">
                    <label className="form-label small">URL</label>
                    <input
                      className="form-control form-control-sm"
                      value={row.url}
                      onChange={(e) => setSocialLinks((prev) => prev.map((item) => item.id === row.id ? { ...item, url: limitText(e.target.value, LIMITS.socialUrl) } : item))}
                      maxLength={LIMITS.socialUrl}
                      placeholder="https://..."
                    />
                  </div>
                  <div className="col-8 col-md-1">
                    <label className="form-label small">Size</label>
                    <input
                      type="number"
                      min="12"
                      max="64"
                      className="form-control form-control-sm"
                      value={row.icon_size}
                      onChange={(e) => setSocialLinks((prev) => prev.map((item) => item.id === row.id ? { ...item, icon_size: Number(e.target.value || 20) } : item))}
                    />
                  </div>
                  <div className="col-4 col-md-1 d-grid">
                    <button
                      type="button"
                      className="btn btn-outline-danger btn-sm"
                      onClick={() => setSocialLinks((prev) => prev.filter((item) => item.id !== row.id))}
                      title="Remove"
                    >
                      <i className="bi bi-trash" aria-hidden="true" />
                    </button>
                  </div>
                  {row.type === "custom" && row.custom_icon_data ? (
                    <div className="col-12">
                      <div className="small text-secondary d-flex align-items-center gap-2">
                        <span>Preview:</span>
                        <img src={row.custom_icon_data} alt={row.label || "custom icon"} style={{ width: `${row.icon_size}px`, height: `${row.icon_size}px`, objectFit: "contain", borderRadius: "4px" }} />
                      </div>
                    </div>
                  ) : row.type === "preset" ? (
                    <div className="col-12">
                      <div className="small text-secondary d-flex align-items-center gap-2">
                        <span>Preview:</span>
                        <i className={`bi ${socialBootstrapIcon(row.icon)}`} style={{ color: "#22c55e", fontSize: `${Math.max(14, Math.min(28, row.icon_size))}px` }} aria-hidden="true" />
                        <span>{row.label || row.icon}</span>
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>
            )) : (
              <div className="text-secondary small">No social links added. Click <strong>Add</strong> to create one.</div>
            )}
          </div>
          <div className="small text-secondary mt-2">
            Add multiple links (Instagram, Facebook, etc.). Custom icon uploads are stored in profile JSON and rendered on Digital Card.
          </div>
        </div>
      </div>
    </div>
  );
}
