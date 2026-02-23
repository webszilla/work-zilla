import { Link } from "react-router-dom";

export default function BusinessAutopilotDashboardPage({
  modules = [],
  catalog = [],
  canManageModules = false,
  onToggleModule,
  savingModuleSlug = "",
  moduleError = "",
  productBasePath = ""
}) {
  const entries = Array.isArray(modules) ? modules : [];
  const allModules = Array.isArray(catalog) && catalog.length ? catalog : entries;
  const moduleIcons = {
    crm: "bi-people",
    hrm: "bi-person-badge",
    projects: "bi-kanban",
    accounts: "bi-calculator",
  };
  const toModulePath = (module) => {
    const rawPath = module?.path || `/${module?.slug || ""}`;
    if (!productBasePath) {
      return rawPath;
    }
    if (rawPath === "/") {
      return productBasePath;
    }
    return `${productBasePath}${rawPath.startsWith("/") ? rawPath : `/${rawPath}`}`;
  };

  return (
    <div className="p-3">
      <div className="business-autopilot-header mb-3">
        <h4 className="mb-2 business-autopilot-header__title">Business Autopilot ERP</h4>
        <p className="text-secondary mb-0 business-autopilot-header__subtitle">
          Modular suite for CRM, HR Management, Projects, and Accounts.
        </p>
      </div>
      {moduleError ? (
        <div className="alert alert-danger py-2">{moduleError}</div>
      ) : null}
      {entries.length ? (
        <div className="row g-3">
          {entries.map((module) => (
            <div className="col-12 col-md-6 col-xl-3" key={module.slug}>
              <div className="card p-3 h-100 d-flex flex-column align-items-center text-center">
                <i className={`bi ${moduleIcons[module.slug] || "bi-grid-1x2"} fs-2 text-success mb-2`} aria-hidden="true" />
                <h6 className="mb-1">{module.name}</h6>
                <div className="text-secondary small mb-2">Module Enabled</div>
                <Link className="btn btn-primary btn-sm" to={toModulePath(module)}>
                  Open
                </Link>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="alert alert-warning mb-0">
          No modules are enabled for this organization yet.
        </div>
      )}
      {canManageModules ? (
        <div className="card p-3 mt-3">
          <h6 className="mb-2">Module Access Settings</h6>
          <div className="text-secondary small mb-3">Enable or disable eligible ERP modules for your organization.</div>
          <div className="row g-2">
            {allModules.map((module) => (
              <div className="col-12 col-md-6 col-xl-3" key={`toggle-${module.slug}`}>
                <div className="border rounded px-2 py-2 h-100 d-flex flex-column">
                  <div className="fw-semibold">{module.name}</div>
                  <div className="text-secondary small mb-2">{module.enabled ? "Enabled" : "Disabled"}</div>
                  <div className="mt-auto">
                    <button
                      type="button"
                      className={`btn btn-sm w-100 ${module.enabled ? "btn-outline-danger" : "btn-outline-success"}`}
                      disabled={savingModuleSlug === module.slug}
                      onClick={() => onToggleModule && onToggleModule(module.slug, !module.enabled)}
                    >
                      {savingModuleSlug === module.slug ? "Saving..." : module.enabled ? "Disable" : "Enable"}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
