import { useMemo } from "react";
import { useBranding } from "../branding/BrandingContext.jsx";

export default function ProductAccessSection({ products = [], subscriptions = [], isReadOnly = false }) {
  const { branding } = useBranding();
  const monitorLabel =
    branding?.aliases?.ui?.monitorLabel || branding?.displayName || "Work Suite";
  const monitorDescription =
    branding?.description || branding?.tagline || "Workforce monitoring and productivity insights.";
  const productRouteMap = {
    "monitor": "/app/worksuite",
    "worksuite": "/app/worksuite",
    "ai-chatbot": "/app/ai-chatbot",
    "storage": "/app/storage",
    "ai-chat-widget": "/app/ai-chat-widget",
    "digital-card": "/app/digital-card"
  };

  const fallbackProducts = [
    {
      slug: "monitor",
      name: monitorLabel,
      icon: "bi-display",
      description: monitorDescription,
      features: ["Live activity", "Screenshots", "App usage"],
      status: "active"
    },
    {
      slug: "ai-chatbot",
      name: "AI Chatbot",
      icon: "bi-robot",
      description: "Website chatbot and live agent support in one inbox.",
      features: ["Live chat", "Agent inbox", "Leads"],
      status: "active"
    },
    {
      slug: "storage",
      name: "Online Storage",
      icon: "bi-cloud",
      description: "Secure online cloud file storage with org-based controls.",
      features: ["Online Access", "Admin Controls", "Free System Sync"],
      status: "active"
    }
  ];

  const productCopy = {
    "monitor": {
      description: monitorDescription,
      features: ["Live activity", "Screenshots", "App usage"]
    },
    "ai-chatbot": {
      description: "Website chatbot and live agent support in one inbox.",
      features: ["Live chat", "Agent inbox", "Leads"]
    },
    "storage": {
      description: "Secure online cloud file storage with org-based controls.",
      features: ["Online Access", "Admin Controls", "Free System Sync"]
    }
  };

  const activeProductKeys = useMemo(() => {
    const now = Date.now();
    const enabled = new Set();
    (subscriptions || []).forEach((sub) => {
      const status = String(sub.status || "").toLowerCase();
      if (status === "active") {
        enabled.add(sub.product_slug);
        return;
      }
      if (status === "trialing") {
        if (!sub.trial_end) {
          enabled.add(sub.product_slug);
          return;
        }
        const trialEnd = Date.parse(sub.trial_end);
        if (Number.isNaN(trialEnd) || trialEnd >= now) {
          enabled.add(sub.product_slug);
        }
      }
    });
    if (enabled.has("online-storage")) {
      enabled.add("storage");
    }
    return enabled;
  }, [subscriptions]);

  const normalizedProducts = useMemo(() => {
    const raw = products && products.length ? products : fallbackProducts;
    return Array.from(
      raw.reduce((map, item) => {
        const key = item.slug || item.key;
        if (!key) {
          return map;
        }
        const fallback = productCopy[key] || {};
        const next = {
          key,
          name: item.name,
          icon: item.icon || "bi-box",
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
  }, [products]);

  if (isReadOnly) {
    return null;
  }

  return (
    <div className="mt-4">
      <h4>Products</h4>
      <div className="row g-3 mt-1">
        {normalizedProducts.map((product) => {
          const hasAccess = activeProductKeys.has(product.key);
          const isActive = product.status === "active";
          const actionLabel = hasAccess ? "Open Dashboard" : "Take a Plan";
          const dashboardHref = productRouteMap[product.key] || `/app/${product.key}`;
          const actionHref = isActive ? (hasAccess ? dashboardHref : `/pricing/?product=${product.key}`) : "";
          return (
            <div className="col-12 col-md-6 col-lg-4 col-xl-2" key={product.key}>
              <div className="card p-3 h-100">
                <div className="d-flex align-items-center gap-2 mb-2">
                  <div className="stat-icon stat-icon-primary">
                    <i className={`bi ${product.icon}`} aria-hidden="true" />
                  </div>
                  <h5 className="mb-0">{product.name}</h5>
                </div>
                <p className="text-secondary mb-2">
                  {product.description || "Product details coming soon."}
                </p>
                {product.features.length ? (
                  <div className="text-secondary mb-3">
                    {product.features.join(" / ")}
                  </div>
                ) : null}
                {actionHref ? (
                  <a href={actionHref} className="btn btn-primary btn-sm">
                    {actionLabel}
                  </a>
                ) : (
                  <span className="badge-coming-soon">Coming soon</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
