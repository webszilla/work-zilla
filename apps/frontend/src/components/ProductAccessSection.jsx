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
    "imposition-software": "/app/imposition",
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
    "imposition-software": {
      name: "Imposition Software",
      icon: "bi-grid-1x2",
      description: "Licensed imposition workflow with devices, users, and print-ready operations.",
      features: ["License", "Devices", "Users", "Plans"]
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
        "imposition-software",
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
    <section className="product-access-section mt-4">
      <div className="product-access-section__head">
        <div>
          <h4 className="product-access-section__title">Products</h4>
          <p className="product-access-section__subtitle mb-0">
            Switch between product workspaces with the same org theme and access state.
          </p>
        </div>
      </div>
      <div className="row g-3 mt-1">
        {normalizedProducts.map((product) => {
          const isCurrentProduct = product.key === normalizedCurrentProductKey;
          const hasAccess = activeProductKeys.has(product.key);
          const isActive = product.status === "active";
          const dashboardHref = productRouteMap[product.key] || `/app/${product.key}`;
          const actionLabel = isCurrentProduct
            ? "Current"
            : (hasAccess ? "Dashboard" : "Take a Plan");
          const actionHref = isCurrentProduct
            ? ""
            : (isActive ? (hasAccess ? dashboardHref : `/pricing/?product=${product.key}`) : "");
          return (
            <div className="col-12 col-md-6 col-lg-4 col-xl-2" key={product.key}>
              <article className={`product-access-card h-100 ${isCurrentProduct ? "product-access-card--current" : ""}`}>
                <div className="product-access-card__top">
                  <div className="product-access-card__icon" aria-hidden="true">
                    <i className={`bi ${product.icon}`} />
                  </div>
                </div>
                <h5 className="product-access-card__title">{product.name}</h5>
                <p className="product-access-card__description">
                  {product.description || "Product details coming soon."}
                </p>
                {product.features.length ? (
                  <div className="product-access-card__features">
                    {product.features.map((feature) => (
                      <span key={`${product.key}-${feature}`} className="product-access-card__feature-chip">
                        {feature}
                      </span>
                    ))}
                  </div>
                ) : null}
                {isCurrentProduct ? (
                  <button type="button" className="btn btn-outline-light btn-sm mt-auto w-100 product-access-card__action" disabled>
                    {actionLabel}
                  </button>
                ) : actionHref ? (
                  <a href={actionHref} className="btn btn-primary btn-sm mt-auto w-100 product-access-card__action">
                    {actionLabel}
                  </a>
                ) : (
                  <span className="badge-coming-soon mt-auto align-self-center">Coming soon</span>
                )}
              </article>
            </div>
          );
        })}
      </div>
    </section>
  );
}
