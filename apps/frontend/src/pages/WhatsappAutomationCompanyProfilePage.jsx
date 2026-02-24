import { useEffect, useState } from "react";
import { waApi } from "../api/whatsappAutomation.js";

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
};

export default function WhatsappAutomationCompanyProfilePage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [form, setForm] = useState(emptyForm);
  const [links, setLinks] = useState({ digital_card_url: "", catalogue_url: "" });

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
        });
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
      let social_links = {};
      try {
        social_links = form.social_links_text.trim() ? JSON.parse(form.social_links_text) : {};
      } catch {
        throw new Error("Social Links must be valid JSON.");
      }
      const res = await waApi.saveCompanyProfile({
        company_name: form.company_name,
        phone: form.phone,
        whatsapp_number: form.whatsapp_number,
        email: form.email,
        website: form.website,
        address: form.address,
        description: form.description,
        theme_color: form.theme_color,
        product_highlights: form.product_highlights_text.split("\n").map((v) => v.trim()).filter(Boolean),
        social_links,
      });
      const company = res?.company_profile || {};
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
          <label className="form-label">Theme Color</label>
          <input type="color" className="form-control form-control-color" value={form.theme_color} onChange={(e) => setForm((p) => ({ ...p, theme_color: e.target.value }))} />
        </div>
        <div className="col-12">
          <label className="form-label">Address</label>
          <textarea className="form-control" rows="2" value={form.address} onChange={(e) => setForm((p) => ({ ...p, address: e.target.value }))} />
        </div>
        <div className="col-12">
          <label className="form-label">Description</label>
          <textarea className="form-control" rows="3" value={form.description} onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))} />
        </div>
        <div className="col-12 col-lg-6">
          <label className="form-label">Product Highlights (one per line)</label>
          <textarea className="form-control" rows="5" value={form.product_highlights_text} onChange={(e) => setForm((p) => ({ ...p, product_highlights_text: e.target.value }))} />
        </div>
        <div className="col-12 col-lg-6">
          <label className="form-label">Social Links (JSON)</label>
          <textarea className="form-control" rows="5" value={form.social_links_text} onChange={(e) => setForm((p) => ({ ...p, social_links_text: e.target.value }))} />
        </div>
      </div>
    </div>
  );
}
