import { useEffect, useState } from "react";
import { waApi } from "../api/whatsappAutomation.js";
import { apiFetch } from "../lib/api.js";
import ProductAccessSection from "../components/ProductAccessSection.jsx";

const emptySummary = {
  loading: true,
  error: "",
  data: null,
};

function formatRenewalDate(value) {
  if (!value) {
    return "-";
  }
  try {
    return new Date(value).toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch {
    return String(value);
  }
}

export default function WhatsappAutomationOverviewPage({ subscriptions = [] }) {
  const [summary, setSummary] = useState(emptySummary);
  const [products, setProducts] = useState([]);

  useEffect(() => {
    let active = true;
    async function loadSummary() {
      try {
        const data = await waApi.getDashboardSummary();
        if (!active) return;
        setSummary({ loading: false, error: "", data: data?.summary || {} });
      } catch (error) {
        if (!active) return;
        setSummary({
          loading: false,
          error: error?.message || "Unable to load WhatsApp Automation dashboard.",
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

  const data = summary.data || {};
  const cards = [
    {
      key: "digital-card-users",
      icon: "bi-person-vcard",
      title: "Digital Card Users",
      value: data.digital_card_users ?? 0,
      meta: "Active cards created for this organization",
    },
    {
      key: "inbox-notifications",
      icon: "bi-inbox",
      title: "Inbox Notifications",
      value: data.inbox_notifications ?? 0,
      meta: `${data.unread_inbox_notifications ?? 0} unread notifications`,
    },
    {
      key: "plan-renewal-date",
      icon: "bi-calendar-event",
      title: "Plan Renewal Date",
      value: formatRenewalDate(data.plan_renewal_date),
      meta: "Current WhatsApp Automation renewal date",
    },
    {
      key: "media-library",
      icon: "bi-collection-play",
      title: "Media Library",
      value: data.media_library_count ?? 0,
      meta: "Object storage media files for this organization",
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
              <div className="text-secondary">{card.meta}</div>
            </div>
          </div>
        ))}
      </div>

      <ProductAccessSection
        products={products}
        subscriptions={subscriptions}
        currentProductKey="whatsapp-automation"
      />
    </div>
  );
}
