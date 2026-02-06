import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { apiFetch } from "../lib/api.js";

const emptyState = {
  loading: true,
  error: "",
  data: null
};

export default function SaasAdminPage() {
  const [state, setState] = useState(emptyState);
  const location = useLocation();

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

  const data = state.data || {};
  const stats = data.stats || {};
  const products = dedupeProducts(data.products || []);
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

  function getProductDescription(product) {
    if (product?.slug === "monitor") {
      return "Work Zilla Monitoring and Productivity Insights.";
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
          <div className="row g-3">
            {statCards.map((card) => (
              <div className="col-12 col-md-6 col-xl-3" key={card.label}>
                <div className="card p-3 h-100 stat-card">
                  <div className="stat-icon stat-icon-primary">
                    <i className={`bi ${card.icon}`} aria-hidden="true" />
                  </div>
                  <h6 className="mb-1">{card.label}</h6>
                  <div className="stat-value">{card.value}</div>
                </div>
              </div>
            ))}
          </div>

          <div className="row g-3 mt-4">
            <div className="col-12 col-xl-6">
              <div className="card p-4 h-100">
                <h4>Operations</h4>
                <div className="row g-3 mt-1">
                  <div className="col-12 col-md-6">
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
                  </div>

                  <div className="col-12 col-md-6">
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
                  </div>

                  <div className="col-12 col-md-6">
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
                  </div>

                  <div className="col-12 col-md-6">
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
                  </div>
                </div>
              </div>
            </div>

            <div className="col-12 col-xl-6">
              <div className="card p-4 h-100">
                <h4>Org Admin Common Features</h4>
                <div className="row g-3 mt-1">
                  <div className="col-12 col-md-6">
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
                  </div>

                  <div className="col-12 col-md-6">
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
                  </div>

                  <div className="col-12 col-md-6">
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
                  </div>

                  <div className="col-12 col-md-6">
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
                  </div>

                  <div className="col-12 col-md-6">
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
                </div>
              </div>
            </div>
          </div>
        </>
      ) : null}

      <div className={`card p-4 ${showProductsOnly ? "" : "mt-4"}`} id="products">
        {showProductsOnly ? null : <h4>Products</h4>}
        <div className="row g-3 mt-1">
          {products.map((product) => (
            <div className="col-12 col-md-6 col-xl-3" key={product.id}>
              <div className="card p-3 h-100">
                <div className="d-flex align-items-center gap-2 mb-2">
                  <div className="stat-icon stat-icon-primary">
                    <i className={`bi ${product.icon || "bi-grid"}`} aria-hidden="true" />
                  </div>
                  <h5 className="mb-0">{product.name}</h5>
                </div>
                <p className="text-secondary mb-2">{getProductDescription(product)}</p>
                <div className="text-secondary mb-3">
                  Active Orgs: {product.active_orgs ?? 0}
                </div>
                <div className="d-flex justify-content-between align-items-center">
                  {product.status === "active" ? (
                    <span className="badge bg-success">Active</span>
                  ) : product.status === "disabled" ? (
                    <span className="badge bg-secondary">Disabled</span>
                  ) : (
                    <span className="badge bg-warning text-dark">Coming soon</span>
                  )}
                  <Link to={`/saas-admin/products/${product.slug}`} className="btn btn-primary btn-sm">
                    Open
                  </Link>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

    </>
  );
}
