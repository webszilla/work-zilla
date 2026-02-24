import { useEffect, useState } from "react";
import { waApi } from "../api/whatsappAutomation.js";

const emptyForm = {
  id: null,
  title: "",
  price: "",
  description: "",
  category: "",
  order_button_enabled: true,
  is_active: true,
  sort_order: 0,
};

export default function WebsiteCatalogueDashboardPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [items, setItems] = useState([]);
  const [company, setCompany] = useState(null);
  const [cataloguePage, setCataloguePage] = useState(null);
  const [cataloguePageForm, setCataloguePageForm] = useState({
    about_title: "About Us",
    about_content: "",
    services_title: "Services",
    services_content: "",
    contact_title: "Contact",
    contact_note: "",
    is_active: true,
  });
  const [form, setForm] = useState(emptyForm);

  async function loadItems() {
    setLoading(true);
    try {
      const [data, companyRes, pageRes] = await Promise.all([
        waApi.getCatalogueProducts(),
        waApi.getCompanyProfile(),
        waApi.getCataloguePage(),
      ]);
      setItems(data?.products || []);
      setCompany(companyRes?.company_profile || null);
      const resolvedPage = pageRes?.catalogue_page || null;
      setCataloguePage(resolvedPage);
      if (resolvedPage) {
        setCataloguePageForm({
          about_title: resolvedPage.about_title || "About Us",
          about_content: resolvedPage.about_content || "",
          services_title: resolvedPage.services_title || "Services",
          services_content: resolvedPage.services_content || "",
          contact_title: resolvedPage.contact_title || "Contact",
          contact_note: resolvedPage.contact_note || "",
          is_active: resolvedPage.is_active !== false,
        });
      }
      setLoading(false);
    } catch (err) {
      setError(err?.message || "Unable to load catalogue.");
      setLoading(false);
    }
  }

  async function saveCataloguePageSettings() {
    setSaving(true);
    setError("");
    try {
      const res = await waApi.saveCataloguePage(cataloguePageForm);
      setCataloguePage(res?.catalogue_page || null);
      await loadItems();
    } catch (err) {
      setError(err?.message || "Unable to save catalogue sections.");
    } finally {
      setSaving(false);
    }
  }

  useEffect(() => {
    loadItems();
  }, []);

  async function saveItem() {
    setSaving(true);
    setError("");
    try {
      await waApi.saveCatalogueProduct(form);
      setForm(emptyForm);
      await loadItems();
    } catch (err) {
      setError(err?.message || "Unable to save catalogue product.");
    } finally {
      setSaving(false);
    }
  }

  async function deleteItem(id) {
    try {
      await waApi.deleteCatalogueProduct(id);
      setItems((prev) => prev.filter((row) => row.id !== id));
    } catch (err) {
      setError(err?.message || "Unable to delete catalogue product.");
    }
  }

  if (loading) return <div className="card p-4 text-center"><div className="spinner" /><p className="mb-0">Loading catalogue...</p></div>;

  return (
    <div className="d-flex flex-column gap-3">
      <div className="p-4">
        <div className="d-flex align-items-center justify-content-between mb-3">
          <h3 className="mb-0">Website Catalogue</h3>
          <button type="button" className="btn btn-primary btn-sm" onClick={saveItem} disabled={saving}>
            {saving ? "Saving..." : form.id ? "Update Product" : "Add Product"}
          </button>
        </div>
        <div className="text-secondary mb-3">
          Company Profile linked: <strong>{company?.company_name || "Not set"}</strong>
        </div>
        {company?.catalogue_url ? (
          <div className="mb-3">
            <a className="btn btn-outline-light btn-sm" href={company.catalogue_url} target="_blank" rel="noreferrer">
              Open Public Catalogue
            </a>
            {company?.digital_card_url ? (
              <a className="btn btn-outline-light btn-sm ms-2" href={company.digital_card_url} target="_blank" rel="noreferrer">
                Open Digital Card
              </a>
            ) : null}
          </div>
        ) : null}
        {error ? <div className="alert alert-danger">{error}</div> : null}
        <div className="card p-3 mb-3">
          <div className="d-flex align-items-center justify-content-between mb-2">
            <h4 className="mb-0">Catalogue Sections</h4>
            <button type="button" className="btn btn-outline-light btn-sm" onClick={saveCataloguePageSettings} disabled={saving}>
              {saving ? "Saving..." : "Save Sections"}
            </button>
          </div>
          <div className="row g-3">
            <div className="col-12 col-md-4">
              <label className="form-label">About Section Title</label>
              <input className="form-control" value={cataloguePageForm.about_title} onChange={(e) => setCataloguePageForm((p) => ({ ...p, about_title: e.target.value }))} />
            </div>
            <div className="col-12 col-md-4">
              <label className="form-label">Services Section Title</label>
              <input className="form-control" value={cataloguePageForm.services_title} onChange={(e) => setCataloguePageForm((p) => ({ ...p, services_title: e.target.value }))} />
            </div>
            <div className="col-12 col-md-4">
              <label className="form-label">Contact Section Title</label>
              <input className="form-control" value={cataloguePageForm.contact_title} onChange={(e) => setCataloguePageForm((p) => ({ ...p, contact_title: e.target.value }))} />
            </div>
            <div className="col-12">
              <label className="form-label">About Us Content</label>
              <textarea className="form-control" rows="3" value={cataloguePageForm.about_content} onChange={(e) => setCataloguePageForm((p) => ({ ...p, about_content: e.target.value }))} placeholder="Write about your business..." />
            </div>
            <div className="col-12">
              <label className="form-label">Services (one per line)</label>
              <textarea className="form-control" rows="4" value={cataloguePageForm.services_content} onChange={(e) => setCataloguePageForm((p) => ({ ...p, services_content: e.target.value }))} placeholder={"Website Design\nWhatsApp Marketing\nSupport Services"} />
            </div>
            <div className="col-12">
              <label className="form-label">Contact Section Intro / Note</label>
              <textarea className="form-control" rows="2" value={cataloguePageForm.contact_note} onChange={(e) => setCataloguePageForm((p) => ({ ...p, contact_note: e.target.value }))} placeholder="Contact information below is auto-loaded from Company Profile." />
            </div>
            <div className="col-12">
              <div className="small text-secondary">
                Contact info auto-loads from Company Profile:
                {" "}
                {company?.phone || "-"} / {company?.whatsapp_number || "-"} / {company?.email || "-"}
              </div>
            </div>
          </div>
        </div>
        <div className="row g-3">
          <div className="col-12 col-md-6">
            <label className="form-label">Title</label>
            <input className="form-control" value={form.title} onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))} />
          </div>
          <div className="col-12 col-md-3">
            <label className="form-label">Price</label>
            <input className="form-control" value={form.price} onChange={(e) => setForm((p) => ({ ...p, price: e.target.value }))} placeholder="INR 999" />
          </div>
          <div className="col-12 col-md-3">
            <label className="form-label">Category</label>
            <input className="form-control" value={form.category} onChange={(e) => setForm((p) => ({ ...p, category: e.target.value }))} />
          </div>
          <div className="col-12">
            <label className="form-label">Description</label>
            <textarea className="form-control" rows="3" value={form.description} onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))} />
          </div>
          <div className="col-12 d-flex flex-wrap gap-3">
            <div className="form-check">
              <input className="form-check-input" type="checkbox" checked={Boolean(form.order_button_enabled)} onChange={(e) => setForm((p) => ({ ...p, order_button_enabled: e.target.checked }))} id="waCatOrderBtn" />
              <label className="form-check-label" htmlFor="waCatOrderBtn">Order Button Enabled</label>
            </div>
            <div className="form-check">
              <input className="form-check-input" type="checkbox" checked={Boolean(form.is_active)} onChange={(e) => setForm((p) => ({ ...p, is_active: e.target.checked }))} id="waCatActive" />
              <label className="form-check-label" htmlFor="waCatActive">Active</label>
            </div>
          </div>
        </div>
      </div>

      <div className="p-4">
        <h4 className="mb-3">Catalogue Products</h4>
        <div className="table-responsive">
          <table className="table table-dark table-hover align-middle">
            <thead><tr><th>Title</th><th>Category</th><th>Price</th><th>Status</th><th className="text-end">Action</th></tr></thead>
            <tbody>
              {items.length ? items.map((row) => (
                <tr key={row.id}>
                  <td>{row.title}</td>
                  <td>{row.category || "-"}</td>
                  <td>{row.price || "-"}</td>
                  <td>{row.is_active ? <span className="badge bg-success">Active</span> : <span className="badge bg-secondary">Disabled</span>}</td>
                  <td className="text-end d-flex justify-content-end gap-2">
                    <button type="button" className="btn btn-outline-light btn-sm" onClick={() => setForm({
                      id: row.id, title: row.title || "", price: row.price || "", description: row.description || "",
                      category: row.category || "", order_button_enabled: Boolean(row.order_button_enabled),
                      is_active: Boolean(row.is_active), sort_order: Number(row.sort_order || 0),
                    })}>Edit</button>
                    <button type="button" className="btn btn-outline-danger btn-sm" onClick={() => deleteItem(row.id)}>Delete</button>
                  </td>
                </tr>
              )) : <tr><td colSpan="5" className="text-secondary">No catalogue products yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
