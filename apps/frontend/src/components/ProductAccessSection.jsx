import { useMemo } from "react";
import { useBranding } from "../branding/BrandingContext.jsx";

export default function ProductAccessSection({
  products = [],
  subscriptions = [],
  isReadOnly = false,
  currentProductKey = ""
}) {
  const { branding } = useBranding();
  const monitorLabel =
    branding?.aliases?.ui?.monitorLabel || branding?.displayName || "Work Suite";
  const monitorDescription =
    branding?.description || branding?.tagline || "Workforce monitoring and productivity insights.";
  const normalizeProductKey = (value) => {
    const key = String(value || "").trim().toLowerCase();
    if (!key) {
      return "";
    }
    if (key === "worksuite") {
      return "monitor";
    }
    if (key === "online-storage") {
      return "storage";
    }
    if (key === "business-autopilot") {
      return "business-autopilot-erp";
    }
    return key;
  };
  const productRouteMap = {
    "monitor": "/app/work-suite",
    "worksuite": "/app/work-suite",
    "ai-chatbot": "/app/ai-chatbot",
    "storage": "/app/storage",
    "online-storage": "/app/storage",
    "business-autopilot-erp": "/app/business-autopilot",
    "whatsapp-automation": "/app/whatsapp-automation",
    "ai-chat-widget": "/app/ai-chat-widget",
    "digital-card": "/app/digital-card"
  };

  const productCopy = {
    "monitor": {
      name: monitorLabel,
      icon: "bi-display",
      description: monitorDescription,
      features: ["Live activity", "Screenshots", "App usage"]
    },
    "ai-chatbot": {
      name: "AI Chatbot",
      icon: "bi-robot",
      description: "Website chatbot and live agent support in one inbox.",
      features: ["Live chat", "Agent inbox", "Leads"]
    },
    "storage": {
      name: "Online Storage",
      icon: "bi-cloud",
      description: "Secure online cloud file storage with org-based controls.",
      features: ["Online Access", "Admin Controls", "Free System Sync"]
    },
    "business-autopilot-erp": {
      name: "Business Autopilot ERP",
      icon: "bi-building-gear",
      description: "Modular ERP suite for CRM, HR, projects, accounts, ticketing, and stocks.",
      features: ["CRM", "HR", "Projects", "Accounts / ERP", "Ticketing", "Stocks"]
    },
    "whatsapp-automation": {
      name: "Whatsapp Automation",
      icon: "bi-whatsapp",
      description: "WhatsApp business automation tools with inbox, campaign, and digital card modules.",
      features: ["Inbox", "Automation", "Digital Card", "Catalogue"]
    },
    "digital-card": {
      name: "Digital Card",
      icon: "bi-person-vcard",
      description: "Shareable digital business card with profile, links, and contact actions.",
      features: ["Public card", "Theme", "Contact links"]
    }
  };

  const activeProductKeys = useMemo(() => {
    const now = Date.now();
    const enabled = new Set();
    (subscriptions || []).forEach((sub) => {
      const status = String(sub.status || "").toLowerCase();
      const subKey = normalizeProductKey(sub.product_slug);
      if (!subKey) {
        return;
      }
      if (status === "active") {
        enabled.add(subKey);
        return;
      }
      if (status === "trialing") {
        if (!sub.trial_end) {
          enabled.add(subKey);
          return;
        }
        const trialEnd = Date.parse(sub.trial_end);
        if (Number.isNaN(trialEnd) || trialEnd >= now) {
          enabled.add(subKey);
        }
      }
    });
    return enabled;
  }, [subscriptions]);

  const normalizedCurrentProductKey = normalizeProductKey(currentProductKey);

  const normalizedProducts = useMemo(() => {
    let raw = products && products.length ? products : [];
    if (!raw.length) {
      const fallbackOrder = [
        "monitor",
        "ai-chatbot",
        "storage",
        "business-autopilot-erp",
        "whatsapp-automation",
      ];
      const topLevelFallbackKeys = new Set(fallbackOrder);
      const fallbackKeys = new Set(fallbackOrder);
      activeProductKeys.forEach((key) => {
        if (topLevelFallbackKeys.has(key)) {
          fallbackKeys.add(key);
        }
      });
      if (normalizedCurrentProductKey && topLevelFallbackKeys.has(normalizedCurrentProductKey)) {
        fallbackKeys.add(normalizedCurrentProductKey);
      }
      raw = Array.from(fallbackKeys).map((key) => ({
        slug: key,
        name: productCopy[key]?.name || (key === "monitor" ? monitorLabel : key),
        icon: productCopy[key]?.icon || "bi-box",
        description: productCopy[key]?.description || "",
        features: productCopy[key]?.features || [],
        status: "active",
      }));
    }
    return Array.from(
      raw.reduce((map, item) => {
        const key = normalizeProductKey(item.slug || item.key);
        if (!key) {
          return map;
        }
        const fallback = productCopy[key] || {};
        const next = {
          key,
          name: item.name || (key === "monitor" ? monitorLabel : undefined) || fallback.name || "Product",
          icon: item.icon || fallback.icon || "bi-box",
          description: item.description || fallback.description || "",
          features: item.features && item.features.length ? item.features : (fallback.features || []),
          status: item.status || "active"
        };
        const prev = map.get(key);
        if (!prev) {
          map.set(key, next);
          return map;
        }
        const nextScore =
          (next.description ? 1 : 0) +
          (next.features.length ? 1 : 0) +
          (next.status === "active" ? 1 : 0);
        const prevScore =
          (prev.description ? 1 : 0) +
          (prev.features.length ? 1 : 0) +
          (prev.status === "active" ? 1 : 0);
        if (nextScore >= prevScore) {
          map.set(key, next);
        }
        return map;
      }, new Map())
        .values()
    );
  }, [products, monitorLabel, activeProductKeys, normalizedCurrentProductKey]);

  if (isReadOnly) {
    return null;
  }

  return (
    <div className="mt-4">
      <h4>Products</h4>
      <div className="row g-3 mt-1">
        {normalizedProducts.map((product) => {
          const isCurrentProduct = product.key === normalizedCurrentProductKey;
          const hasAccess = activeProductKeys.has(product.key);
          const isActive = product.status === "active";
          const dashboardHref = productRouteMap[product.key] || `/app/${product.key}`;
          const actionLabel = isCurrentProduct
            ? "Current"
            : (hasAccess ? "Open Dashboard" : "Take a Plan");
          const actionHref = isCurrentProduct
            ? ""
            : (isActive ? (hasAccess ? dashboardHref : `/pricing/?product=${product.key}`) : "");
          return (
            <div className="col-12 col-md-6 col-lg-4 col-xl-2" key={product.key}>
              <div className="card p-3 h-100 d-flex flex-column text-center">
                <div className="d-flex flex-column align-items-center mb-2">
                  <div
                    className="stat-icon stat-icon-primary"
                    style={{
                      marginTop: "5px",
                      marginBottom: "8px",
                      width: "32px",
                      height: "32px",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      lineHeight: 1,
                      fontSize: "25px",
                    }}
                  >
                    <i
                      className={`bi ${product.icon}`}
                      aria-hidden="true"
                      style={{ fontSize: "25px", lineHeight: 1 }}
                    />
                  </div>
                  <h5 className="mb-0 lh-sm">{product.name}</h5>
                </div>
                <p className="text-secondary small mb-2">
                  {product.description || "Product details coming soon."}
                </p>
                {product.features.length ? (
                  <div className="text-secondary small mb-3">
                    {product.features.join(" / ")}
                  </div>
                ) : null}
                {isCurrentProduct ? (
                  <button type="button" className="btn btn-outline-light btn-sm mt-auto w-100" disabled>
                    {actionLabel}
                  </button>
                ) : actionHref ? (
                  <a href={actionHref} className="btn btn-primary btn-sm mt-auto w-100">
                    {actionLabel}
                  </a>
                ) : (
                  <span className="badge-coming-soon mt-auto align-self-center">Coming soon</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
