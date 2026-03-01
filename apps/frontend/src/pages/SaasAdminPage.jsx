import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { apiFetch } from "../lib/api.js";
import { useBranding } from "../branding/BrandingContext.jsx";

const emptyState = {
  loading: true,
  error: "",
  data: null
};

export default function SaasAdminPage() {
  const [state, setState] = useState(emptyState);
  const [whatsAppState, setWhatsAppState] = useState({
    loading: false,
    loaded: false,
    saving: false,
    error: "",
    success: "",
    data: null,
    form: {
      is_active: false,
      phone_number_id: "",
      access_token: "",
      admin_phone: "",
      admin_template_name: "new_user_admin_alert",
      user_welcome_template_name: "welcome_user_signup",
      template_language: "en_US",
      graph_api_version: "v21.0",
      timeout_seconds: 15
    }
  });
  const [setupState, setSetupState] = useState({
    importing: false,
    downloading: false,
    error: "",
    success: "",
    fileName: "",
    payload: null
  });
  const location = useLocation();
  const { branding } = useBranding();

  useEffect(() => {
    let active = true;
    async function loadOverview() {
      try {
        const data = await apiFetch("/api/saas-admin/overview");
        if (!active) {
          return;
        }
        setState({ loading: false, error: "", data });
      } catch (error) {
        if (active) {
          setState({
            loading: false,
            error: error?.message || "Unable to load SaaS admin dashboard.",
            data: null
          });
        }
      }
    }

    loadOverview();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (location.pathname !== "/saas-admin") {
      return;
    }
    let active = true;
    async function loadWhatsAppSettings() {
      try {
        const data = await apiFetch("/api/saas-admin/settings/whatsapp-cloud");
        if (!active) {
          return;
        }
        setWhatsAppState((prev) => ({
          ...prev,
          loading: false,
          loaded: true,
          data,
          error: "",
          success: "",
          form: {
            is_active: Boolean(data?.is_active),
            phone_number_id: data?.phone_number_id || "",
            access_token: "",
            admin_phone: data?.admin_phone || "",
            admin_template_name: data?.admin_template_name || "new_user_admin_alert",
            user_welcome_template_name: data?.user_welcome_template_name || "welcome_user_signup",
            template_language: data?.template_language || "en_US",
            graph_api_version: data?.graph_api_version || "v21.0",
            timeout_seconds: Number(data?.timeout_seconds || 15)
          }
        }));
      } catch (error) {
        if (!active) {
          return;
        }
        setWhatsAppState((prev) => ({
          ...prev,
          loading: false,
          error: error?.message || "Unable to load WhatsApp settings.",
          success: ""
        }));
      }
    }
    loadWhatsAppSettings();
    const onFocus = () => {
      if (active && window.location.pathname.endsWith("/saas-admin")) {
        loadWhatsAppSettings();
      }
    };
    window.addEventListener("focus", onFocus);
    return () => {
      active = false;
      window.removeEventListener("focus", onFocus);
    };
  }, [location.pathname]);

  const data = state.data || {};
  const stats = data.stats || {};
  const products = dedupeProducts(data.products || []).filter(
    (product) => String(product?.status || "").toLowerCase() === "active"
  );
  const showProductsOnly = location.hash === "#products";

  if (state.loading) {
    return (
      <div className="card p-4 text-center">
        <div className="spinner" />
        <p className="mb-0">Loading SaaS admin...</p>
      </div>
    );
  }

  if (state.error) {
    return <div className="alert alert-danger">{state.error}</div>;
  }

  const statCards = [
    { label: "Total Orgs", value: stats.total_orgs ?? 0, icon: "bi-building" },
    { label: "Total Users", value: stats.total_users ?? 0, icon: "bi-people" },
    { label: "Active Subs", value: stats.active_subscriptions ?? 0, icon: "bi-check2-circle" },
    { label: "Pending Transfers", value: stats.pending_transfers ?? 0, icon: "bi-hourglass-split" },
    { label: "Expiring (Monthly)", value: stats.expiring_monthly ?? 0, icon: "bi-clock" },
    { label: "Expiring (Yearly)", value: stats.expiring_yearly ?? 0, icon: "bi-clock-history" },
    { label: "MRR (INR)", value: stats.mrr ?? 0, icon: "bi-cash" },
    { label: "ARR (INR)", value: stats.arr ?? 0, icon: "bi-graph-up-arrow" }
  ];

  async function handleSetupDownload() {
    setSetupState((prev) => ({ ...prev, downloading: true, error: "", success: "" }));
    try {
      const response = await fetch("/api/saas-admin/settings/setup/export", {
        credentials: "include"
      });
      if (!response.ok) {
        throw new Error(`Download failed (${response.status})`);
      }
      const blob = await response.blob();
      const contentDisposition = response.headers.get("Content-Disposition") || "";
      const match = contentDisposition.match(/filename=\"?([^\";]+)\"?/i);
      const fileName = match?.[1] || `workzilla-saas-setup-${Date.now()}.json`;
      const url = window.URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = fileName;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.URL.revokeObjectURL(url);
      setSetupState((prev) => ({
        ...prev,
        downloading: false,
        success: "Setup JSON downloaded.",
        error: ""
      }));
    } catch (error) {
      setSetupState((prev) => ({
        ...prev,
        downloading: false,
        success: "",
        error: error?.message || "Unable to download setup JSON."
      }));
    }
  }

  async function handleSetupFileChange(event) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }
    try {
      const text = await file.text();
      const payload = JSON.parse(text);
      setSetupState((prev) => ({
        ...prev,
        fileName: file.name,
        payload,
        error: "",
        success: "Setup file loaded. Click Import to apply."
      }));
    } catch (_error) {
      setSetupState((prev) => ({
        ...prev,
        fileName: "",
        payload: null,
        success: "",
        error: "Invalid JSON file. Please choose a valid setup export."
      }));
    } finally {
      event.target.value = "";
    }
  }

  async function handleSetupImport() {
    if (!setupState.payload) {
      setSetupState((prev) => ({
        ...prev,
        error: "Choose a setup JSON file before import.",
        success: ""
      }));
      return;
    }
    setSetupState((prev) => ({ ...prev, importing: true, error: "", success: "" }));
    try {
      const result = await apiFetch("/api/saas-admin/settings/setup/import", {
        method: "POST",
        body: JSON.stringify(setupState.payload)
      });
      const imported = result?.imported || {};
      setSetupState((prev) => ({
        ...prev,
        importing: false,
        success: `Imported successfully. Products: ${imported.saas_products || 0}, Catalog: ${imported.catalog_products || 0}, Plans: ${imported.plans || 0}.`,
        error: ""
      }));
    } catch (error) {
      setSetupState((prev) => ({
        ...prev,
        importing: false,
        success: "",
        error: error?.message || "Setup import failed."
      }));
    }
  }

  function handleWhatsAppFieldChange(key, value) {
    setWhatsAppState((prev) => ({
      ...prev,
      error: "",
      success: "",
      form: {
        ...prev.form,
        [key]: value
      }
    }));
  }

  async function handleWhatsAppSave() {
    setWhatsAppState((prev) => ({
      ...prev,
      saving: true,
      error: "",
      success: ""
    }));
    try {
      const payload = {
        is_active: Boolean(whatsAppState.form.is_active),
        phone_number_id: whatsAppState.form.phone_number_id,
        access_token: whatsAppState.form.access_token,
        admin_phone: whatsAppState.form.admin_phone,
        admin_template_name: whatsAppState.form.admin_template_name,
        user_welcome_template_name: whatsAppState.form.user_welcome_template_name,
        template_language: whatsAppState.form.template_language,
        graph_api_version: whatsAppState.form.graph_api_version,
        timeout_seconds: Number(whatsAppState.form.timeout_seconds || 15)
      };
      const data = await apiFetch("/api/saas-admin/settings/whatsapp-cloud", {
        method: "PUT",
        body: JSON.stringify(payload)
      });
      setWhatsAppState((prev) => ({
        ...prev,
        saving: false,
        loaded: true,
        data,
        success: "WhatsApp Cloud API settings saved.",
        error: "",
        form: {
          ...prev.form,
          access_token: "",
          is_active: Boolean(data?.is_active),
          phone_number_id: data?.phone_number_id || "",
          admin_phone: data?.admin_phone || "",
          admin_template_name: data?.admin_template_name || prev.form.admin_template_name,
          user_welcome_template_name: data?.user_welcome_template_name || prev.form.user_welcome_template_name,
          template_language: data?.template_language || prev.form.template_language,
          graph_api_version: data?.graph_api_version || prev.form.graph_api_version,
          timeout_seconds: Number(data?.timeout_seconds || prev.form.timeout_seconds || 15)
        }
      }));
    } catch (error) {
      setWhatsAppState((prev) => ({
        ...prev,
        saving: false,
        error: error?.message || "Unable to save WhatsApp settings.",
        success: ""
      }));
    }
  }

  function getProductDescription(product) {
    if (product?.slug === "monitor") {
      return branding?.tagline || branding?.description || "Work Zilla Work Suite productivity insights.";
    }
    return product?.description || "-";
  }

  function dedupeProducts(list) {
    const byKey = new Map();
    list.forEach((product) => {
      const rawKey = product?.slug || product?.name;
      const key = rawKey ? String(rawKey).trim().toLowerCase() : "";
      if (!key) {
        return;
      }
      const existing = byKey.get(key);
      if (!existing) {
        byKey.set(key, product);
        return;
      }
      const existingDesc = String(existing.description || existing.short_description || "").trim();
      const currentDesc = String(product.description || product.short_description || "").trim();
      if (!existingDesc && currentDesc) {
        byKey.set(key, product);
        return;
      }
      const existingIcon = String(existing.icon || "").trim();
      const currentIcon = String(product.icon || "").trim();
      if (!existingIcon && currentIcon) {
        byKey.set(key, product);
      }
    });
    const values = Array.from(byKey.values());
    if (values.length <= 1) {
      return values;
    }
    const byName = new Map();
    values.forEach((product) => {
      const nameKey = String(product?.name || "").trim().toLowerCase();
      if (!nameKey) {
        return;
      }
      const existing = byName.get(nameKey);
      if (!existing) {
        byName.set(nameKey, product);
        return;
      }
      const existingScore = scoreProductCard(existing);
      const currentScore = scoreProductCard(product);
      if (currentScore > existingScore) {
        byName.set(nameKey, product);
      }
    });
    return Array.from(byName.values());
  }

  function scoreProductCard(product) {
    const desc = String(product?.description || product?.short_description || "").trim();
    const icon = String(product?.icon || "").trim();
    let score = 0;
    if (desc) score += 2;
    if (icon) score += 1;
    if (product?.slug) score += 1;
    return score;
  }

  return (
    <>
      <h2 className="page-title" id={showProductsOnly ? "products" : "overview"}>
        {showProductsOnly ? "Products" : "SaaS Admin"}
      </h2>
      <hr className="section-divider" />

      {!showProductsOnly ? (
        <>
          <div className="saas-admin-kpis">
            {statCards.map((card) => (
              <div className="card p-3 h-100 stat-card" key={card.label}>
                <div className="stat-icon stat-icon-primary">
                  <i className={`bi ${card.icon}`} aria-hidden="true" />
                </div>
                <h6 className="mb-1">{card.label}</h6>
                <div className="stat-value">{card.value}</div>
              </div>
            ))}
          </div>

          <div className="row g-3 mt-4">
            <div className="col-12 col-xl-6">
              <section className="saas-admin-section h-100">
                <h4>Operations</h4>
                <div className="saas-admin-feature-grid mt-1">
                  <div className="card p-3 h-100 admin-feature-card">
                      <div className="stat-icon stat-icon-primary">
                        <i className="bi bi-shield-check" aria-hidden="true" />
                      </div>
                      <h5 className="mb-1">Retention Policy</h5>
                      <p className="text-secondary mb-3">
                        Manage retention rules and overrides.
                      </p>
                      <Link to="/saas-admin/retention-policy" className="btn btn-primary btn-sm">
                        Manage
                      </Link>
                  </div>

                  <div className="card p-3 h-100 admin-feature-card">
                      <div className="stat-icon stat-icon-primary">
                        <i className="bi bi-hdd-network" aria-hidden="true" />
                      </div>
                      <h5 className="mb-1">Media Storage</h5>
                      <p className="text-secondary mb-3">
                        Configure storage targets for backups.
                      </p>
                      <Link to="/saas-admin/storage" className="btn btn-primary btn-sm">
                        Open
                      </Link>
                  </div>

                  <div className="card p-3 h-100 admin-feature-card">
                      <div className="stat-icon stat-icon-primary">
                        <i className="bi bi-cloud-download" aria-hidden="true" />
                      </div>
                      <h5 className="mb-1">Org Downloads</h5>
                      <p className="text-secondary mb-3">
                        Track backup generation and downloads across orgs.
                      </p>
                      <Link to="/saas-admin/backup-activity" className="btn btn-primary btn-sm">
                        View Activity
                      </Link>
                  </div>

                  <div className="card p-3 h-100 admin-feature-card">
                      <div className="stat-icon stat-icon-primary">
                        <i className="bi bi-hdd-stack" aria-hidden="true" />
                      </div>
                      <h5 className="mb-1">System Backup Manager</h5>
                      <p className="text-secondary mb-3">
                        PostgreSQL + project backup to Google Drive with scheduler.
                      </p>
                      <Link to="/saas-admin/system-backup-manager" className="btn btn-primary btn-sm">
                        Open
                      </Link>
                  </div>

                  <div className="card p-3 h-100 admin-feature-card">
                      <div className="stat-icon stat-icon-primary">
                        <i className="bi bi-cpu" aria-hidden="true" />
                      </div>
                      <h5 className="mb-1">Server Monitoring</h5>
                      <p className="text-secondary mb-3">
                        Track CPU, RAM, disk, and uptime across servers.
                      </p>
                      <Link to="/saas-admin/server-monitoring" className="btn btn-primary btn-sm">
                        Open
                      </Link>
                  </div>

                  <div className="card p-3 h-100 admin-feature-card">
                      <div className="stat-icon stat-icon-primary">
                        <i className="bi bi-download" aria-hidden="true" />
                      </div>
                      <h5 className="mb-1">SaaS Setup</h5>
                      <p className="text-secondary mb-2">
                        Export/import Products, Plans, and Website Theme settings.
                      </p>
                      <div className="d-flex flex-wrap gap-2 mb-2">
                        <button
                          type="button"
                          className="btn btn-primary btn-sm"
                          onClick={handleSetupDownload}
                          disabled={setupState.downloading}
                        >
                          <>
                            <i className="bi bi-download me-1" aria-hidden="true" />
                            {setupState.downloading ? "Downloading..." : "Download"}
                          </>
                        </button>
                        <label className="btn btn-outline-light btn-sm mb-0" title="Choose Setup File" aria-label="Choose Setup File">
                          <i className="bi bi-folder2-open" aria-hidden="true" />
                          <input
                            type="file"
                            accept="application/json,.json"
                            onChange={handleSetupFileChange}
                            hidden
                          />
                        </label>
                        <button
                          type="button"
                          className="btn btn-outline-light btn-sm"
                          onClick={handleSetupImport}
                          disabled={setupState.importing || !setupState.payload}
                          title="Import Setup"
                          aria-label="Import Setup"
                        >
                          {setupState.importing ? (
                            <span className="spinner-border spinner-border-sm" role="status" aria-hidden="true" />
                          ) : (
                            <i className="bi bi-upload" aria-hidden="true" />
                          )}
                        </button>
                      </div>
                      {setupState.fileName ? (
                        <div className="small text-secondary mb-1">Selected: {setupState.fileName}</div>
                      ) : null}
                      {setupState.success ? (
                        <div className="small text-success">{setupState.success}</div>
                      ) : null}
                      {setupState.error ? (
                        <div className="small text-danger">{setupState.error}</div>
                      ) : null}
                  </div>

                  <div className="card p-3 h-100 admin-feature-card">
                      <div className="stat-icon stat-icon-primary">
                        <i className="bi bi-whatsapp" aria-hidden="true" />
                      </div>
                      <h5 className="mb-1">WhatsApp Cloud API</h5>
                      <p className="text-secondary mb-2">
                        Configure Meta WhatsApp signup alerts and welcome templates.
                      </p>
                      <div className="d-flex flex-wrap gap-2 mb-2">
                        <Link
                          to="/saas-admin/whatsapp-cloud"
                          className="btn btn-primary btn-sm"
                        >
                          Configure
                        </Link>
                        {whatsAppState.data?.is_active ? (
                          <span className="badge bg-success align-self-center">Active</span>
                        ) : (
                          <span className="badge bg-secondary align-self-center">Inactive</span>
                        )}
                      </div>
                  </div>
                </div>
              </section>
            </div>

            <div className="col-12 col-xl-6">
              <section className="saas-admin-section h-100">
                <h4>Org Admin Common Features</h4>
                <div className="saas-admin-feature-grid mt-1">
                  <div className="card p-3 h-100 admin-feature-card">
                      <div className="stat-icon stat-icon-primary">
                        <i className="bi bi-cloud-download" aria-hidden="true" />
                      </div>
                      <h5 className="mb-1">Org Downloads</h5>
                      <p className="text-secondary mb-3">
                        View organization backup history and exports.
                      </p>
                      <Link to="/saas-admin/backup-activity" className="btn btn-primary btn-sm">
                        Open
                      </Link>
                  </div>

                  <div className="card p-3 h-100 admin-feature-card">
                      <div className="stat-icon stat-icon-primary">
                        <i className="bi bi-shield-check" aria-hidden="true" />
                      </div>
                      <h5 className="mb-1">Retention Policy</h5>
                      <p className="text-secondary mb-3">
                        Manage global retention rules for all orgs.
                      </p>
                      <Link to="/saas-admin/retention-policy" className="btn btn-primary btn-sm">
                        Manage
                      </Link>
                  </div>

                  <div className="card p-3 h-100 admin-feature-card">
                      <div className="stat-icon stat-icon-primary">
                        <i className="bi bi-hdd-network" aria-hidden="true" />
                      </div>
                      <h5 className="mb-1">Storage Settings</h5>
                      <p className="text-secondary mb-3">
                        Configure screenshot storage targets.
                      </p>
                      <Link to="/saas-admin/storage" className="btn btn-primary btn-sm">
                        Open
                      </Link>
                  </div>

                  <div className="card p-3 h-100 admin-feature-card">
                      <div className="stat-icon stat-icon-primary">
                        <i className="bi bi-images" aria-hidden="true" />
                      </div>
                      <h5 className="mb-1">Media Library</h5>
                      <p className="text-secondary mb-3">
                        Browse and manage stored media files.
                      </p>
                      <Link to="/org-admin/media-library" className="btn btn-primary btn-sm">
                        Open
                      </Link>
                  </div>

                  <div className="card p-3 h-100 admin-feature-card">
                      <div className="stat-icon stat-icon-primary">
                        <i className="bi bi-receipt" aria-hidden="true" />
                      </div>
                      <h5 className="mb-1">Billing</h5>
                      <p className="text-secondary mb-3">
                        Review org billing and renewals.
                      </p>
                      <Link to="/saas-admin/billing" className="btn btn-primary btn-sm">
                        Open
                      </Link>
                  </div>
                </div>
              </section>
            </div>
          </div>
        </>
      ) : null}

      <section className={`${showProductsOnly ? "" : "mt-4"} saas-admin-products`} id="products">
        {showProductsOnly ? null : <h4>Products</h4>}
        <div className="row g-3 mt-1">
          {products.map((product) => (
            <div className="col-12 col-md-6 col-xl-3" key={product.id}>
              <article className="card p-3 h-100 admin-feature-card saas-admin-product-card">
                <div className="d-flex align-items-center gap-2 mb-2">
                  <div className="stat-icon stat-icon-primary saas-admin-product-card__icon">
                    <i className={`bi ${product.icon || "bi-grid"}`} aria-hidden="true" />
                  </div>
                  <h5 className="mb-0">{product.name}</h5>
                </div>
                <p className="text-secondary mb-2">{getProductDescription(product)}</p>
                <div className="text-secondary mb-3">
                  Active Orgs: {product.active_orgs ?? 0}
                </div>
                <div className="d-flex justify-content-between align-items-center gap-2 mt-auto">
                  {product.status === "active" ? (
                    <span className="saas-admin-product-card__status saas-admin-product-card__status--active">Active</span>
                  ) : product.status === "disabled" ? (
                    <span className="saas-admin-product-card__status saas-admin-product-card__status--disabled">Disabled</span>
                  ) : (
                    <span className="saas-admin-product-card__status saas-admin-product-card__status--coming">Coming soon</span>
                  )}
                  <Link to={`/saas-admin/products/${product.slug}`} className="btn btn-primary btn-sm">
                    Open
                  </Link>
                </div>
              </article>
            </div>
          ))}
        </div>
      </section>

    </>
  );
}
