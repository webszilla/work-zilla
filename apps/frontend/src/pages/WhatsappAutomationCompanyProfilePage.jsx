import { useEffect, useState } from "react";
import { waApi } from "../api/whatsappAutomation.js";

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

function socialBootstrapIcon(icon) {
  return SOCIAL_ICON_OPTIONS.find((opt) => opt.value === icon)?.bi || "bi-link-45deg";
}

const emptyForm = {
  company_name: "",
  phone: "",
  whatsapp_number: "",
  email: "",
  website: "",
  address: "",
  description: "",
  theme_color: "#22c55e",
  product_highlights_text: "",
  social_links_text: "{}",
  logo_data_url: "",
};

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
        setForm({
          company_name: company.company_name || "",
          phone: company.phone || "",
          whatsapp_number: company.whatsapp_number || "",
          email: company.email || "",
          website: company.website || "",
          address: company.address || "",
          description: company.description || "",
          theme_color: company.theme_color || "#22c55e",
          product_highlights_text: Array.isArray(company.product_highlights) ? company.product_highlights.join("\n") : "",
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
        phone: form.phone,
        whatsapp_number: form.whatsapp_number,
        email: form.email,
        website: form.website,
        address: form.address,
        description: form.description,
        theme_color: form.theme_color,
        logo_data_url: form.logo_data_url || "",
        product_highlights: form.product_highlights_text.split("\n").map((v) => v.trim()).filter(Boolean),
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
    if (file.size > 2 * 1024 * 1024) {
      setError("Company logo size must be under 2 MB.");
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
    <div className="p-4">
      <div className="d-flex align-items-center justify-content-between mb-3">
        <h3 className="mb-0">Company Profile</h3>
        <button type="button" className="btn btn-primary btn-sm" onClick={onSave} disabled={saving}>
          {saving ? "Saving..." : "Save"}
        </button>
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
        {[
          ["company_name", "Company Name"],
          ["phone", "Phone"],
          ["whatsapp_number", "WhatsApp Number"],
          ["email", "Email"],
          ["website", "Website"],
        ].map(([key, label]) => (
          <div className="col-12 col-md-6" key={key}>
            <label className="form-label">{label}</label>
            <input className="form-control" value={form[key]} onChange={(e) => setForm((p) => ({ ...p, [key]: e.target.value }))} />
          </div>
        ))}
        <div className="col-12 col-md-6">
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
              <div className="small text-secondary mt-1">Supported: JPG, PNG, SVG (max 2 MB)</div>
            </div>
          </div>
        </div>
        <div className="col-12 col-md-6">
          <label className="form-label">Theme Color</label>
          <input type="color" className="form-control form-control-color" value={form.theme_color} onChange={(e) => setForm((p) => ({ ...p, theme_color: e.target.value }))} />
        </div>
        <div className="col-12">
          <label className="form-label">Address</label>
          <textarea className="form-control" rows="2" value={form.address} onChange={(e) => setForm((p) => ({ ...p, address: e.target.value }))} />
        </div>
        <div className="col-12 col-lg-6">
          <label className="form-label">Description</label>
          <textarea className="form-control" rows="5" value={form.description} onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))} />
        </div>
        <div className="col-12 col-lg-6">
          <label className="form-label">Product Highlights (one per line)</label>
          <textarea className="form-control" rows="5" value={form.product_highlights_text} onChange={(e) => setForm((p) => ({ ...p, product_highlights_text: e.target.value }))} />
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
                      onChange={(e) => setSocialLinks((prev) => prev.map((item) => item.id === row.id ? { ...item, label: e.target.value } : item))}
                      placeholder="Instagram"
                    />
                  </div>
                  <div className="col-12 col-md-3">
                    <label className="form-label small">URL</label>
                    <input
                      className="form-control form-control-sm"
                      value={row.url}
                      onChange={(e) => setSocialLinks((prev) => prev.map((item) => item.id === row.id ? { ...item, url: e.target.value } : item))}
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
