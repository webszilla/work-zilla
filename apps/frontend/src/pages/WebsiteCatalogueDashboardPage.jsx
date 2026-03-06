import { useEffect, useMemo, useState } from "react";
import { waApi } from "../api/whatsappAutomation.js";
import TinyHtmlEditor from "../components/TinyHtmlEditor.jsx";

const emptyForm = {
  id: null,
  title: "",
  item_type: "product",
  price: "",
  image_data_url: "",
  description: "",
  category: "",
  order_button_enabled: true,
  call_button_enabled: true,
  whatsapp_button_enabled: true,
  enquiry_button_enabled: true,
  is_active: true,
  sort_order: 0,
};

const PAGE_SIZE = 10;
const LIMITS = {
  sectionTitle: 80,
  categoryName: 60,
  itemTitle: 120,
  price: 40,
  search: 80,
};

function limitText(value, max) {
  return String(value || "").slice(0, max);
}

async function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Unable to read image file."));
    reader.readAsDataURL(file);
  });
}

function deriveInitialTab() {
  if (typeof window === "undefined") {
    return "website";
  }
  return window.location.hash === "#catalogue" ? "catalogue" : "website";
}

function titleCase(value) {
  if (!value) {
    return "";
  }
  return String(value)
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export default function WebsiteCatalogueDashboardPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [items, setItems] = useState([]);
  const [categories, setCategories] = useState([]);
  const [company, setCompany] = useState(null);
  const [cataloguePage, setCataloguePage] = useState(null);
  const [activeTab, setActiveTab] = useState(deriveInitialTab);
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
  const [categoryForm, setCategoryForm] = useState({ id: null, name: "" });
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [categorySearch, setCategorySearch] = useState("");
  const [categoryPage, setCategoryPage] = useState(1);

  async function loadItems() {
    setLoading(true);
    setError("");
    try {
      const [data, companyRes, pageRes, categoryRes] = await Promise.all([
        waApi.getCatalogueProducts(),
        waApi.getCompanyProfile(),
        waApi.getCataloguePage(),
        waApi.getCatalogueCategories(),
      ]);
      setItems(data?.products || []);
      setCategories(categoryRes?.categories || []);
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
    } catch (err) {
      setError(err?.message || "Unable to load website and catalogue data.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadItems();
  }, []);

  useEffect(() => {
    setPage(1);
  }, [search]);

  useEffect(() => {
    setCategoryPage(1);
  }, [categorySearch]);

  function switchTab(nextTab) {
    setActiveTab(nextTab);
    if (typeof window !== "undefined") {
      const hash = nextTab === "catalogue" ? "#catalogue" : "#website";
      window.history.replaceState(null, "", `${window.location.pathname}${hash}`);
    }
  }

  async function saveCataloguePageSettings() {
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const res = await waApi.saveCataloguePage(cataloguePageForm);
      setCataloguePage(res?.catalogue_page || null);
      setNotice("Website section details saved.");
    } catch (err) {
      setError(err?.message || "Unable to save website sections.");
    } finally {
      setSaving(false);
    }
  }

  async function saveCategory() {
    const name = String(categoryForm.name || "").trim();
    if (!name) {
      setError("Category name is required.");
      return;
    }
    if (!categoryForm.id && categories.length >= 25) {
      setError("Maximum 25 categories allowed.");
      return;
    }
    setSaving(true);
    setError("");
    setNotice("");
    try {
      await waApi.saveCatalogueCategory({ id: categoryForm.id, name });
      setCategoryForm({ id: null, name: "" });
      setNotice(categoryForm.id ? "Category updated." : "Category created.");
      await loadItems();
    } catch (err) {
      setError(err?.data?.message || err?.message || "Unable to save category.");
    } finally {
      setSaving(false);
    }
  }

  async function deleteCategory(category) {
    if (!window.confirm(`Remove category "${category.name}"? Existing items will become uncategorized.`)) {
      return;
    }
    setSaving(true);
    setError("");
    setNotice("");
    try {
      await waApi.deleteCatalogueCategory(category.id);
      if (form.category === category.name) {
        setForm((prev) => ({ ...prev, category: "" }));
      }
      setNotice(`${category.name} removed.`);
      await loadItems();
    } catch (err) {
      setError(err?.message || "Unable to remove category.");
    } finally {
      setSaving(false);
    }
  }

  async function saveItem() {
    if (!String(form.title || "").trim()) {
      setError("Name is required.");
      return;
    }
    if (!String(form.category || "").trim()) {
      setError("Create and select a category first.");
      return;
    }
    if (!form.id && items.length >= 50) {
      setError("Maximum 50 products/services allowed.");
      return;
    }
    setSaving(true);
    setError("");
    setNotice("");
    try {
      await waApi.saveCatalogueProduct(form);
      setForm(emptyForm);
      setNotice(form.id ? "Catalogue item updated." : `${titleCase(form.item_type)} added.`);
      await loadItems();
    } catch (err) {
      setError(err?.data?.message || err?.message || "Unable to save catalogue item.");
    } finally {
      setSaving(false);
    }
  }

  async function deleteItem(id) {
    setError("");
    setNotice("");
    try {
      await waApi.deleteCatalogueProduct(id);
      setItems((prev) => prev.filter((row) => row.id !== id));
      setNotice("Catalogue item removed.");
    } catch (err) {
      setError(err?.message || "Unable to delete catalogue item.");
    }
  }

  async function onItemImagePick(file) {
    if (!file) return;
    if (!String(file.type || "").startsWith("image/")) {
      setError("Only image files are allowed.");
      return;
    }
    if (file.size > 1024 * 1024) {
      setError("Image size must be under 1 MB.");
      return;
    }
    try {
      const dataUrl = await fileToDataUrl(file);
      setForm((prev) => ({ ...prev, image_data_url: dataUrl }));
      setError("");
    } catch (err) {
      setError(err?.message || "Unable to read selected image.");
    }
  }

  const availableCategories = useMemo(() => {
    const map = new Map();
    for (const row of categories) {
      const name = String(row?.name || "").trim();
      if (!name) continue;
      map.set(name, { name, id: row.id || name });
    }
    for (const row of items) {
      const name = String(row?.category || "").trim();
      if (!name || map.has(name)) continue;
      map.set(name, { name, id: name });
    }
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [categories, items]);

  const filteredItems = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter((row) =>
      [row.title, row.item_type, row.category, row.price, row.description]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q))
    );
  }, [items, search]);

  const filteredCategories = useMemo(() => {
    const q = categorySearch.trim().toLowerCase();
    if (!q) return categories;
    return categories.filter((row) => String(row?.name || "").toLowerCase().includes(q));
  }, [categories, categorySearch]);

  const categoryTotalPages = Math.max(1, Math.ceil(filteredCategories.length / PAGE_SIZE));
  const currentCategoryPage = Math.min(categoryPage, categoryTotalPages);
  const pagedCategories = filteredCategories.slice((currentCategoryPage - 1) * PAGE_SIZE, currentCategoryPage * PAGE_SIZE);

  const totalPages = Math.max(1, Math.ceil(filteredItems.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pagedItems = filteredItems.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const currentItemLabel = form.item_type === "service" ? "Service" : "Product";

  if (loading) {
    return (
      <div className="card p-4 text-center">
        <div className="spinner" />
        <p className="mb-0">Loading website and catalogue...</p>
      </div>
    );
  }

  return (
    <div className="d-flex flex-column gap-3 wa-catalogue-page">
      <div className="d-flex flex-wrap align-items-start justify-content-between gap-3">
        <div>
          <h3 className="mb-1">Website &amp; Catalogue</h3>
          <div className="text-secondary">
            Company Profile linked: <strong>{company?.company_name || "Not set"}</strong>
          </div>
        </div>
        <div className="wa-catalogue-tabs" role="tablist" aria-label="Website catalogue sections">
          <button
            type="button"
            className={`btn btn-sm ${activeTab === "website" ? "btn-primary" : "btn-outline-light"}`}
            onClick={() => switchTab("website")}
          >
            Website
          </button>
          <button
            type="button"
            className={`btn btn-sm ${activeTab === "catalogue" ? "btn-primary" : "btn-outline-light"}`}
            onClick={() => switchTab("catalogue")}
          >
            Catalogue
          </button>
        </div>
      </div>

      {company?.catalogue_url ? (
        <div className="d-flex flex-wrap gap-2">
          {company?.catalogue_url ? (
            <a className="btn btn-outline-light btn-sm" href={company.catalogue_url} target="_blank" rel="noreferrer">
              Open Public Catalogue
            </a>
          ) : null}
        </div>
      ) : null}

      {error ? <div className="alert alert-danger mb-0">{error}</div> : null}
      {notice ? <div className="alert alert-info mb-0">{notice}</div> : null}

      {activeTab === "website" ? (
        <section className="wa-flat-section">
          <div className="d-flex align-items-center justify-content-between mb-3">
            <h4 className="mb-0">Website Sections</h4>
            <button type="button" className="btn btn-outline-light btn-sm" onClick={saveCataloguePageSettings} disabled={saving}>
              {saving ? "Saving..." : "Save Website"}
            </button>
          </div>
          <div className="row g-3 wa-catalogue-website-grid">
            <div className="col-12 col-xl-4">
              <div className="wa-catalogue-website-column">
                <label className="form-label">About Section Title</label>
                <input className="form-control" maxLength={LIMITS.sectionTitle} value={cataloguePageForm.about_title} onChange={(e) => setCataloguePageForm((p) => ({ ...p, about_title: limitText(e.target.value, LIMITS.sectionTitle) }))} />
                <TinyHtmlEditor
                  label="About Content"
                  value={cataloguePageForm.about_content}
                  onChange={(next) => setCataloguePageForm((p) => ({ ...p, about_content: next }))}
                  placeholder="Write about your business..."
                />
              </div>
            </div>
            <div className="col-12 col-xl-4">
              <div className="wa-catalogue-website-column">
                <label className="form-label">Services Section Title</label>
                <input className="form-control" maxLength={LIMITS.sectionTitle} value={cataloguePageForm.services_title} onChange={(e) => setCataloguePageForm((p) => ({ ...p, services_title: limitText(e.target.value, LIMITS.sectionTitle) }))} />
                <TinyHtmlEditor
                  label="Services Content"
                  value={cataloguePageForm.services_content}
                  onChange={(next) => setCataloguePageForm((p) => ({ ...p, services_content: next }))}
                  placeholder="Add your services, highlights, and bullet points."
                />
              </div>
            </div>
            <div className="col-12 col-xl-4">
              <div className="wa-catalogue-website-column">
                <label className="form-label">Contact Section Title</label>
                <input className="form-control" maxLength={LIMITS.sectionTitle} value={cataloguePageForm.contact_title} onChange={(e) => setCataloguePageForm((p) => ({ ...p, contact_title: limitText(e.target.value, LIMITS.sectionTitle) }))} />
                <TinyHtmlEditor
                  label="Contact Intro / Note"
                  value={cataloguePageForm.contact_note}
                  onChange={(next) => setCataloguePageForm((p) => ({ ...p, contact_note: next }))}
                  placeholder="Add a short contact introduction or note."
                />
              </div>
            </div>
            <div className="col-12">
              <div className="small text-secondary">
                Contact info auto-loads from Company Profile:
                {" "}
                {company?.phone || "-"} / {company?.whatsapp_number || "-"} / {company?.email || "-"}
              </div>
            </div>
          </div>
        </section>
      ) : (
        <div className="d-flex flex-column gap-3">
          <section className="wa-flat-section">
            <div className="row g-3 align-items-start">
              <div className="col-12 col-xl-3">
                <div className="d-flex flex-column gap-2">
                  <h4 className="mb-1">Catalogue Categories</h4>
                  <div className="text-secondary small">Create category first, then add products/services.</div>
                  <input
                    className="form-control"
                    value={categoryForm.name}
                    onChange={(e) => setCategoryForm((prev) => ({ ...prev, name: limitText(e.target.value, LIMITS.categoryName) }))}
                    maxLength={LIMITS.categoryName}
                    placeholder="Category name"
                  />
                  <button type="button" className="btn btn-primary btn-sm" onClick={saveCategory} disabled={saving}>
                    {saving ? "Saving..." : categoryForm.id ? "Update Category" : "Create Category"}
                  </button>
                  <small className="text-secondary">Max categories: 25 | Current: {categories.length}</small>
                </div>
              </div>

              <div className="col-12 col-xl-9">
                <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-2">
                  <h5 className="mb-0">Category List</h5>
                  <label className="table-search mb-0" htmlFor="wa-category-search">
                    <input
                      id="wa-category-search"
                      type="search"
                      placeholder="Search categories"
                      value={categorySearch}
                      onChange={(e) => setCategorySearch(limitText(e.target.value, LIMITS.search))}
                      maxLength={LIMITS.search}
                    />
                  </label>
                </div>
                <div className="table-responsive">
                  <table className="table table-dark table-hover align-middle mb-0">
                    <thead>
                      <tr>
                        <th>Name</th>
                        <th>Products</th>
                        <th>Services</th>
                        <th className="text-end">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pagedCategories.length ? pagedCategories.map((row) => (
                        <tr key={row.id}>
                          <td>{row.name}</td>
                          <td>{row.product_count || 0}</td>
                          <td>{row.service_count || 0}</td>
                          <td className="text-end">
                            <div className="d-flex justify-content-end gap-2">
                              <button type="button" className="btn btn-outline-light btn-sm" onClick={() => setCategoryForm({ id: row.id, name: row.name })}>Edit</button>
                              <button type="button" className="btn btn-outline-danger btn-sm" onClick={() => deleteCategory(row)}>Remove</button>
                            </div>
                          </td>
                        </tr>
                      )) : (
                        <tr>
                          <td colSpan="4" className="text-secondary">No categories found.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
                <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 mt-2">
                  <small className="text-secondary">
                    Showing {pagedCategories.length ? ((currentCategoryPage - 1) * PAGE_SIZE) + 1 : 0} to {((currentCategoryPage - 1) * PAGE_SIZE) + pagedCategories.length} of {filteredCategories.length}
                  </small>
                  <div className="d-flex gap-2">
                    <button type="button" className="btn btn-outline-light btn-sm" disabled={currentCategoryPage <= 1} onClick={() => setCategoryPage((prev) => Math.max(1, prev - 1))}>Prev</button>
                    <span className="btn btn-outline-light btn-sm disabled">Page {currentCategoryPage} / {categoryTotalPages}</span>
                    <button type="button" className="btn btn-outline-light btn-sm" disabled={currentCategoryPage >= categoryTotalPages} onClick={() => setCategoryPage((prev) => Math.min(categoryTotalPages, prev + 1))}>Next</button>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section className="wa-flat-section">
            <div className="d-flex align-items-center justify-content-between mb-3 gap-3 flex-wrap">
              <div>
                <h4 className="mb-1">{form.id ? "Edit Product / Service" : "Add Product / Service"}</h4>
                <div className="text-secondary">Products and services are created category-wise for the public catalogue.</div>
              </div>
              <button type="button" className="btn btn-primary btn-sm" onClick={saveItem} disabled={saving}>
                {saving ? "Saving..." : form.id ? `Update ${currentItemLabel}` : `Add ${currentItemLabel}`}
              </button>
            </div>

            <div className="row g-3 align-items-start">
              <div className="col-12 col-xl-4">
                <div className="d-flex flex-column gap-3">
                  <div>
                    <label className="form-label">Type</label>
                    <select className="form-select" value={form.item_type} onChange={(e) => setForm((prev) => ({ ...prev, item_type: e.target.value }))}>
                      <option value="product">Product</option>
                      <option value="service">Service</option>
                    </select>
                  </div>
                  <div>
                    <label className="form-label">Name</label>
                    <input className="form-control" maxLength={LIMITS.itemTitle} value={form.title} onChange={(e) => setForm((prev) => ({ ...prev, title: limitText(e.target.value, LIMITS.itemTitle) }))} placeholder={form.item_type === "service" ? "Service name" : "Product name"} />
                  </div>
                  <div>
                    <label className="form-label">Category</label>
                    <select className="form-select" value={form.category} onChange={(e) => setForm((prev) => ({ ...prev, category: e.target.value }))}>
                      <option value="">Select category</option>
                      {availableCategories.map((category) => (
                        <option key={category.id} value={category.name}>
                          {category.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="form-label">Price</label>
                    <input className="form-control" maxLength={LIMITS.price} value={form.price} onChange={(e) => setForm((prev) => ({ ...prev, price: limitText(e.target.value, LIMITS.price) }))} placeholder="INR 999" />
                  </div>
                  <div>
                    <label className="form-label">Image</label>
                    <input type="file" accept="image/*" className="form-control" onChange={(e) => onItemImagePick(e.target.files?.[0])} />
                    <div className="small text-secondary mt-1">Only image files allowed. Max size: 1 MB.</div>
                    {form.image_data_url ? (
                      <div className="d-flex align-items-center gap-2 mt-2">
                        <img src={form.image_data_url} alt="Preview" style={{ width: 44, height: 44, borderRadius: 8, objectFit: "cover", border: "1px solid rgba(148,163,184,0.25)" }} />
                        <button type="button" className="btn btn-outline-danger btn-sm" onClick={() => setForm((prev) => ({ ...prev, image_data_url: "" }))}>Remove Image</button>
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>
              <div className="col-12 col-xl-8">
                <TinyHtmlEditor
                  label="Description"
                  value={form.description}
                  onChange={(next) => setForm((prev) => ({ ...prev, description: next }))}
                  placeholder={`Write the ${currentItemLabel.toLowerCase()} description, highlights, and pricing notes.`}
                />
              </div>
              <div className="col-12 d-flex flex-wrap gap-3">
                <div className="form-check">
                  <input className="form-check-input" type="checkbox" checked={Boolean(form.order_button_enabled)} onChange={(e) => setForm((prev) => ({ ...prev, order_button_enabled: e.target.checked }))} id="waCatalogueOrderBtn" />
                  <label className="form-check-label" htmlFor="waCatalogueOrderBtn">Order Button</label>
                </div>
                <div className="form-check">
                  <input className="form-check-input" type="checkbox" checked={Boolean(form.call_button_enabled)} onChange={(e) => setForm((prev) => ({ ...prev, call_button_enabled: e.target.checked }))} id="waCatalogueCallBtn" />
                  <label className="form-check-label" htmlFor="waCatalogueCallBtn">Call Button</label>
                </div>
                <div className="form-check">
                  <input className="form-check-input" type="checkbox" checked={Boolean(form.whatsapp_button_enabled)} onChange={(e) => setForm((prev) => ({ ...prev, whatsapp_button_enabled: e.target.checked }))} id="waCatalogueWhatsappBtn" />
                  <label className="form-check-label" htmlFor="waCatalogueWhatsappBtn">WhatsApp Button</label>
                </div>
                <div className="form-check">
                  <input className="form-check-input" type="checkbox" checked={Boolean(form.enquiry_button_enabled)} onChange={(e) => setForm((prev) => ({ ...prev, enquiry_button_enabled: e.target.checked }))} id="waCatalogueEnquiryBtn" />
                  <label className="form-check-label" htmlFor="waCatalogueEnquiryBtn">Enquiry Button</label>
                </div>
                <div className="form-check">
                  <input className="form-check-input" type="checkbox" checked={Boolean(form.is_active)} onChange={(e) => setForm((prev) => ({ ...prev, is_active: e.target.checked }))} id="waCatalogueActive" />
                  <label className="form-check-label" htmlFor="waCatalogueActive">Active</label>
                </div>
                <div className="small text-secondary ms-auto">
                  Max entries: <strong>50</strong> | Current: <strong>{items.length}</strong>
                </div>
              </div>
            </div>
          </section>

          <section className="wa-flat-section">
            <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-3">
              <h4 className="mb-0">Catalogue Items</h4>
              <label className="table-search mb-0" htmlFor="wa-catalogue-search">
                <input
                  id="wa-catalogue-search"
                  type="search"
                  placeholder="Search catalogue"
                  value={search}
                  onChange={(e) => setSearch(limitText(e.target.value, LIMITS.search))}
                  maxLength={LIMITS.search}
                />
              </label>
            </div>
            <div className="table-responsive">
              <table className="table table-dark table-hover align-middle mb-0">
                <thead>
                  <tr>
                    <th>Image</th>
                    <th>Name</th>
                    <th>Type</th>
                    <th>Category</th>
                    <th>Price</th>
                    <th>Status</th>
                    <th className="text-end">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {pagedItems.length ? pagedItems.map((row) => (
                    <tr key={row.id}>
                      <td>
                        {row.image_url ? (
                          <img src={row.image_url} alt={row.title || "Item"} style={{ width: 42, height: 42, borderRadius: 8, objectFit: "cover", border: "1px solid rgba(148,163,184,0.25)" }} />
                        ) : (
                          <span className="text-secondary">-</span>
                        )}
                      </td>
                      <td>{row.title}</td>
                      <td>{titleCase(row.item_type || "product")}</td>
                      <td>{row.category || "-"}</td>
                      <td>{row.price || "-"}</td>
                      <td>{row.is_active ? <span className="badge bg-success">Active</span> : <span className="badge bg-secondary">Disabled</span>}</td>
                      <td className="text-end">
                        <div className="d-flex justify-content-end gap-2">
                          <button
                            type="button"
                            className="btn btn-outline-light btn-sm"
                            onClick={() => setForm({
                              id: row.id,
                              title: row.title || "",
                              item_type: row.item_type || "product",
                              price: row.price || "",
                              image_data_url: row.image_url || "",
                              description: row.description || "",
                              category: row.category || "",
                              order_button_enabled: Boolean(row.order_button_enabled),
                              call_button_enabled: Boolean(row.call_button_enabled),
                              whatsapp_button_enabled: Boolean(row.whatsapp_button_enabled),
                              enquiry_button_enabled: Boolean(row.enquiry_button_enabled),
                              is_active: Boolean(row.is_active),
                              sort_order: Number(row.sort_order || 0),
                            })}
                          >
                            Edit
                          </button>
                          <button type="button" className="btn btn-outline-danger btn-sm" onClick={() => deleteItem(row.id)}>
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  )) : (
                    <tr>
                      <td colSpan="7" className="text-secondary">No catalogue items found.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 mt-2">
              <small className="text-secondary">
                Showing {pagedItems.length ? ((currentPage - 1) * PAGE_SIZE) + 1 : 0} to {((currentPage - 1) * PAGE_SIZE) + pagedItems.length} of {filteredItems.length}
              </small>
              <div className="d-flex gap-2">
                <button type="button" className="btn btn-outline-light btn-sm" disabled={currentPage <= 1} onClick={() => setPage((prev) => Math.max(1, prev - 1))}>Prev</button>
                <span className="btn btn-outline-light btn-sm disabled">Page {currentPage} / {totalPages}</span>
                <button type="button" className="btn btn-outline-light btn-sm" disabled={currentPage >= totalPages} onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}>Next</button>
              </div>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
