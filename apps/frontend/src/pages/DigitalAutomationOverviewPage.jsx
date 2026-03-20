import { useEffect, useState } from "react";
import { apiFetch } from "../lib/api.js";
import ProductAccessSection from "../components/ProductAccessSection.jsx";

const emptySummary = {
  loading: true,
  error: "",
  data: null,
};

export default function DigitalAutomationOverviewPage({ subscriptions = [] }) {
  const [summary, setSummary] = useState(emptySummary);
  const [products, setProducts] = useState([]);

  useEffect(() => {
    let active = true;
    async function loadSummary() {
      try {
        const data = await apiFetch("/api/dashboard/summary");
        if (!active) return;
        setSummary({ loading: false, error: "", data: data || {} });
      } catch (error) {
        if (!active) return;
        setSummary({
          loading: false,
          error: error?.message || "Unable to load Digital Automation dashboard.",
          data: null,
        });
      }
    }
    loadSummary();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    async function loadProducts() {
      try {
        const data = await apiFetch("/api/dashboard/summary");
        if (!active) return;
        setProducts(Array.isArray(data?.products) ? data.products : []);
      } catch {
        if (active) {
          setProducts([]);
        }
      }
    }
    loadProducts();
    return () => {
      active = false;
    };
  }, []);

  const activeSubscriptions = (subscriptions || []).filter((sub) => {
    const status = String(sub?.status || "").toLowerCase();
    if (status === "active") return true;
    if (status !== "trialing") return false;
    if (!sub?.trial_end) return true;
    const endsAt = Date.parse(sub.trial_end);
    return Number.isNaN(endsAt) || endsAt >= Date.now();
  });
  const activeProductKeys = new Set(activeSubscriptions.map((sub) => sub.product_slug));

  const cards = [
    {
      key: "social",
      title: "Social Posts Scheduled",
      value: summary.data?.stats?.activities ?? 0,
      icon: "bi-calendar-check",
      hint: "Social Media Automation",
    },
    {
      key: "ai",
      title: "AI Content Usage",
      value: summary.data?.stats?.screenshots ?? 0,
      icon: "bi-magic",
      hint: "AI Content Writer",
    },
    {
      key: "wordpress",
      title: "WordPress Sites",
      value: summary.data?.stats?.employees ?? 0,
      icon: "bi-wordpress",
      hint: "WordPress Auto Post",
    },
    {
      key: "hosting",
      title: "Hosting Accounts",
      value: summary.data?.stats?.online ?? 0,
      icon: "bi-hdd-network",
      hint: "WHM Billing",
    },
  ];

  return (
    <div className="d-flex flex-column gap-4">
      {summary.error ? <div className="alert alert-danger mb-0">{summary.error}</div> : null}

      <div className="row g-3">
        {cards.map((card) => (
          <div className="col-12 col-md-6 col-xl-3" key={card.key}>
            <div className="card p-3 h-100 stat-card whatsapp-automation-stat-card">
              <div className="stat-icon stat-icon-primary">
                <i className={`bi ${card.icon}`} aria-hidden="true" />
              </div>
              <h6>{card.title}</h6>
              <div className="stat-value">{summary.loading ? "-" : card.value}</div>
              <div className="text-secondary">{card.hint}</div>
            </div>
          </div>
        ))}
      </div>

      <ProductAccessSection
        products={products}
        subscriptions={subscriptions}
        activeProductKeys={activeProductKeys}
        currentProductKey="digital-automation"
      />
    </div>
  );
}
