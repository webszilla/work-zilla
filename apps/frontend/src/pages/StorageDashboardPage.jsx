import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "../lib/api.js";
import ProductAccessSection from "../components/ProductAccessSection.jsx";

const emptyState = {
  loading: true,
  error: "",
  data: null
};

function formatQuota(valueGb) {
  const value = Number(valueGb || 0);
  if (!value) {
    return "0 GB";
  }
  if (value >= 1024) {
    return `${(value / 1024).toFixed(1)} TB`;
  }
  return `${value.toFixed(0)} GB`;
}

function clampPercent(value) {
  const number = Number(value || 0);
  if (Number.isNaN(number)) {
    return 0;
  }
  return Math.min(100, Math.max(0, number));
}

export default function StorageDashboardPage({ subscriptions = [] }) {
  const [state, setState] = useState(emptyState);
  const [products, setProducts] = useState([]);

  useEffect(() => {
    let active = true;
    async function loadStatus() {
      try {
        const data = await apiFetch("/api/storage/explorer/status");
        if (!active) {
          return;
        }
        setState({ loading: false, error: "", data });
      } catch (error) {
        if (!active) {
          return;
        }
        setState({
          loading: false,
          error: error?.message || "Unable to load storage usage.",
          data: null
        });
      }
    }
    loadStatus();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    async function loadProducts() {
      try {
        const data = await apiFetch("/api/dashboard/summary");
        if (!active) {
          return;
        }
        setProducts(data.products || []);
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

  const storage = state.data || {};
  const storageTotal = Number(storage.total_allowed_storage_gb || 0);
  const storageUsed = Number(storage.used_storage_gb || 0);
  const storageRemaining = Math.max(0, storageTotal - storageUsed);
  const storagePercent = storageTotal ? clampPercent((storageUsed / storageTotal) * 100) : 0;

  const bandwidthTotal = Number(storage.total_allowed_bandwidth_gb || 0);
  const bandwidthUsed = Number(storage.used_bandwidth_gb || 0);
  const bandwidthRemaining = Math.max(0, bandwidthTotal - bandwidthUsed);
  const bandwidthLimited = Boolean(storage.is_bandwidth_limited);
  const bandwidthPercent = bandwidthTotal
    ? clampPercent((bandwidthUsed / bandwidthTotal) * 100)
    : 0;

  const maxUsers = Number(storage.max_users || 0);
  const userCount = Number(storage.user_count || 0);
  const userPercent = maxUsers ? clampPercent((userCount / maxUsers) * 100) : 0;

  const cards = useMemo(() => ([
    {
      key: "storage",
      title: "Storage Usage",
      meta: `${formatQuota(storageUsed)} used · ${formatQuota(storageRemaining)} remaining`,
      percent: storagePercent,
      minLabel: "0 GB",
      maxLabel: formatQuota(storageTotal || 0),
      highlight: formatQuota(storageUsed)
    },
    {
      key: "bandwidth",
      title: "Bandwidth Usage",
      meta: bandwidthLimited
        ? `${formatQuota(bandwidthUsed)} used · ${formatQuota(bandwidthRemaining)} remaining`
        : "Unlimited monthly bandwidth",
      percent: bandwidthLimited ? bandwidthPercent : 0,
      minLabel: bandwidthLimited ? "0 GB" : "Unlimited",
      maxLabel: bandwidthLimited ? formatQuota(bandwidthTotal || 0) : "Unlimited",
      highlight: bandwidthLimited ? formatQuota(bandwidthUsed) : "Unlimited"
    },
    {
      key: "users",
      title: "User Usage",
      meta: maxUsers
        ? `${userCount} of ${maxUsers} users`
        : `${userCount} users active`,
      percent: maxUsers ? userPercent : 0,
      minLabel: "0",
      maxLabel: maxUsers ? String(maxUsers) : "Unlimited",
      highlight: String(userCount)
    }
  ]), [
    storageUsed,
    storageRemaining,
    storageTotal,
    storagePercent,
    bandwidthUsed,
    bandwidthRemaining,
    bandwidthTotal,
    bandwidthPercent,
    bandwidthLimited,
    maxUsers,
    userCount,
    userPercent
  ]);

  return (
    <div className="container-fluid storage-dashboard">
      <div className="d-flex align-items-center justify-content-between flex-wrap gap-2 mb-4">
        <div>
          <h2 className="mb-1">Storage Overview</h2>
          <p className="text-secondary mb-0">Track storage, bandwidth, and user usage for your org.</p>
        </div>
      </div>

      {state.loading ? (
        <div className="text-secondary">Loading dashboard...</div>
      ) : state.error ? (
        <div className="alert alert-danger">{state.error}</div>
      ) : (
        <div className="row g-3">
          {cards.map((card) => (
            <div className="col-12 col-lg-4" key={card.key}>
              <div className="card p-3 storage-meter-card h-100">
                <div className="storage-meter-card__header">
                  <div>
                    <h5 className="mb-1">{card.title}</h5>
                    <div className="text-secondary small">{card.meta}</div>
                  </div>
                  <div className="storage-meter-card__badge">{card.highlight}</div>
                </div>
                <div className="storage-meter">
                  <div className="storage-meter__track">
                    <div
                      className="storage-meter__fill"
                      style={{ width: `${card.percent}%` }}
                    />
                    <div
                      className="storage-meter__pointer"
                      style={{ left: `${card.percent}%` }}
                    >
                      <span className="storage-meter__pointer-arrow" />
                    </div>
                  </div>
                  <div className="storage-meter__labels">
                    <span>{card.minLabel}</span>
                    <span>{card.maxLabel}</span>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <ProductAccessSection
        products={products}
        subscriptions={subscriptions}
        isReadOnly={false}
      />
    </div>
  );
}
