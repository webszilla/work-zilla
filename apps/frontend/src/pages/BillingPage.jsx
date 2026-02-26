import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { apiFetch } from "../lib/api.js";
import TablePagination from "../components/TablePagination.jsx";

const emptyState = {
  loading: true,
  error: "",
  data: null
};

function formatValue(value) {
  if (value === null || value === undefined || value === "") {
    return "-";
  }
  return value;
}

function titleCase(value) {
  if (!value) {
    return "-";
  }
  return String(value)
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatPaymentType(value) {
  if (!value) {
    return "Bank Transfer";
  }
  if (value === "online") {
    return "Online";
  }
  return titleCase(value);
}

function formatAmount(currency, amount) {
  if (amount === null || amount === undefined || amount === "") {
    return "-";
  }
  if (!currency) {
    return amount;
  }
  return `${currency} ${amount}`;
}

function computeTaxSplit(amount, rate) {
  const value = Number(amount || 0);
  const taxRate = Number(rate || 0);
  if (!value || !taxRate) {
    return { base: value, tax: 0, total: value };
  }
  const base = Math.round((value / (1 + taxRate / 100)) * 100) / 100;
  const tax = Math.round((value - base) * 100) / 100;
  return { base, tax, total: value };
}

function getPlanPrice(plan, cycle, currency) {
  if (!plan) {
    return 0;
  }
  if (currency === "USD") {
    return cycle === "yearly" ? plan.usd_yearly_price : plan.usd_monthly_price;
  }
  return cycle === "yearly" ? plan.yearly_price : plan.monthly_price;
}

function getAddonPrice(plan, cycle, currency) {
  if (!plan) {
    return 0;
  }
  if (currency === "USD") {
    return cycle === "yearly" ? plan.addon_usd_yearly_price : plan.addon_usd_monthly_price;
  }
  return cycle === "yearly" ? plan.addon_yearly_price : plan.addon_monthly_price;
}

function getStorageLimitGb(plan) {
  const limits = plan?.limits || {};
  const value = limits.storage_gb ?? limits.storage_limit_gb ?? 0;
  return Number(value || 0);
}

function getBandwidthLimitGb(plan) {
  const limits = plan?.limits || {};
  const value = limits.bandwidth_limit_gb_monthly ?? limits.bandwidth_limit_gb ?? 0;
  return Number(value || 0);
}

function isBandwidthLimited(plan) {
  const limits = plan?.limits || {};
  if (limits.is_bandwidth_limited === false) {
    return false;
  }
  return true;
}

function getMaxUsers(plan) {
  const limits = plan?.limits || {};
  const value = limits.max_users ?? limits.user_limit ?? 0;
  return Number(value || 0);
}

function formatStorageLimit(value) {
  if (!value) {
    return "-";
  }
  return `${value} GB`;
}

function formatBandwidthLimit(value, limited) {
  if (!limited) {
    return "Unlimited";
  }
  if (!value) {
    return "-";
  }
  return `${value} GB / month`;
}

function formatUserLimit(value) {
  if (!value) {
    return "Unlimited";
  }
  return value;
}

function getErpPerUserPriceFromLimits(limits, cycle, currency) {
  const source = limits || {};
  if (currency === "USD") {
    return cycle === "yearly"
      ? (source.user_price_usdt_year ?? source.user_price_usd_year ?? "-")
      : (source.user_price_usdt_month ?? source.user_price_usd_month ?? "-");
  }
  return cycle === "yearly"
    ? (source.user_price_inr_year ?? "-")
    : (source.user_price_inr_month ?? "-");
}

function getErpPlanFeatures(plan) {
  const configuredModules = Array.isArray(plan?.features?.erp_enabled_modules)
    ? plan.features.erp_enabled_modules
        .map((item) => String(item || "").trim().toLowerCase())
        .filter(Boolean)
    : [];
  const moduleLabelMap = {
    crm: "CRM Module",
    hrm: "HR Management",
    projects: "Projects",
    accounts: "Accounts / ERP",
    ticketing: "Ticketing",
    stocks: "Stocks",
  };
  const configuredModuleLabels = configuredModules.map((slug) => moduleLabelMap[slug]).filter(Boolean);
  const roleBasedAccessEnabled = plan?.features?.role_based_access !== false;
  const name = String(plan?.name || "").toLowerCase();
  if (name.includes("starter")) {
    const features = [
      "Basic Accounting",
      "Invoice & Billing",
      "Expense Tracking",
      "GST Ready (India)",
      "Basic Reports",
      "1 Organization",
    ];
    if (roleBasedAccessEnabled) features.push("Role Based Access");
    if (configuredModuleLabels.length) features.push(...configuredModuleLabels);
    return features;
  }
  if (name.includes("growth")) {
    const features = [
      "Everything in Starter",
      "Inventory Management",
      "Purchase Orders",
      "Vendor Management",
      "Project Accounting",
      "CRM + HR Modules",
    ];
    if (roleBasedAccessEnabled) features.push("Role Based Access");
    if (configuredModuleLabels.length) features.push(...configuredModuleLabels);
    return features;
  }
  if (name.includes("pro")) {
    const features = [
      "Everything in Growth",
      "Advanced Role Permissions",
      "Automation Workflows",
      "Custom Dashboards",
      "Audit Logs",
      "Priority Support",
    ];
    if (roleBasedAccessEnabled && !features.includes("Role Based Access")) features.push("Role Based Access");
    if (configuredModuleLabels.length) features.push(...configuredModuleLabels);
    return features;
  }
  const fallback = configuredModuleLabels.length ? configuredModuleLabels : [
    "CRM Module",
    "HR Management",
    "Projects",
    "Accounts / ERP",
    "Ticketing",
    "Stocks",
  ];
  if (roleBasedAccessEnabled) fallback.push("Role Based Access");
  return Array.from(new Set(fallback));
}

function getBusinessAutopilotPlanDisplayName(planName) {
  const raw = String(planName || "").trim();
  if (!raw) return "-";
  return raw.replace(/\s+ERP$/i, "");
}

export default function BillingPage() {
  const getStatusPillClass = (status) => {
    const value = String(status || "").toLowerCase();
    if (value === "trialing") {
      return "status-pill status-pill--trialing";
    }
    return "status-pill";
  };
  const rawPath = typeof window !== "undefined" ? window.location.pathname : "";
  const globalSlug = typeof window !== "undefined" ? window.__WZ_PRODUCT_SLUG__ : "";
  const resolvedSlug = globalSlug
    || (rawPath.includes("/ai-chatbot")
      ? "ai-chatbot"
      : rawPath.includes("/storage")
      ? "storage"
      : rawPath.includes("/business-autopilot")
      ? "business-autopilot-erp"
      : rawPath.includes("/whatsapp-automation")
      ? "whatsapp-automation"
      : "worksuite");
  const isAiChatbot = resolvedSlug === "ai-chatbot";
  const isStorage = resolvedSlug === "storage" || resolvedSlug === "online-storage";
  const isBusinessAutopilot = resolvedSlug === "business-autopilot-erp";
  const productSlug = resolvedSlug;
  const apiProductSlug = productSlug === "worksuite" ? "monitor" : productSlug;
  const [state, setState] = useState(emptyState);
  const [notice, setNotice] = useState("");
  const [addonCount, setAddonCount] = useState(0);
  const [planMeta, setPlanMeta] = useState({
    loading: true,
    plans: [],
    taxRate: 0,
    taxCurrency: "INR"
  });
  const [renewModal, setRenewModal] = useState({
    open: false,
    entry: null,
    addonCount: 0
  });
  const [historyPage, setHistoryPage] = useState(1);
  const [approvedPage, setApprovedPage] = useState(1);
  const [pendingPage, setPendingPage] = useState(1);
  const [historySearchTerm, setHistorySearchTerm] = useState("");
  const [historySearchQuery, setHistorySearchQuery] = useState("");
  const [approvedSearchTerm, setApprovedSearchTerm] = useState("");
  const [approvedSearchQuery, setApprovedSearchQuery] = useState("");
  const [pendingSearchTerm, setPendingSearchTerm] = useState("");
  const [pendingSearchQuery, setPendingSearchQuery] = useState("");
  const PAGE_SIZE = 5;
  const [approvedView, setApprovedView] = useState({ open: false, entry: null });

  async function refreshBilling() {
    const data = await apiFetch(`/api/dashboard/billing?product=${apiProductSlug}`);
    setState({ loading: false, error: "", data });
    setAddonCount(0);
  }

  async function loadPlansMeta(activeFlag) {
    try {
      const data = await apiFetch(`/api/dashboard/plans?product=${apiProductSlug}`);
      if (activeFlag && !activeFlag.current) {
        return;
      }
      setPlanMeta({
        loading: false,
        plans: data?.plans || [],
        taxRate: Number(data?.tax_rate || 0),
        taxCurrency: data?.tax_currency || "INR"
      });
    } catch (error) {
      if (!activeFlag || activeFlag.current) {
        setPlanMeta((prev) => ({ ...prev, loading: false }));
      }
    }
  }

  useEffect(() => {
    let active = true;
    async function loadBilling() {
      setNotice("");
      try {
        const data = await apiFetch(`/api/dashboard/billing?product=${apiProductSlug}`);
        if (!active) {
          return;
        }
        setState({ loading: false, error: "", data });
        setAddonCount(0);
      } catch (error) {
        if (error?.data?.redirect) {
          window.location.href = error.data.redirect;
          return;
        }
        if (active) {
          setState({
            loading: false,
            error: error?.message || "Unable to load billing details.",
            data: null
          });
        }
      }
    }

    loadBilling();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const activeFlag = { current: true };
    loadPlansMeta(activeFlag);
    return () => {
      activeFlag.current = false;
    };
  }, []);

  useEffect(() => {
    const handle = setTimeout(() => {
      setHistorySearchQuery(historySearchTerm.trim());
      setHistoryPage(1);
    }, 300);
    return () => clearTimeout(handle);
  }, [historySearchTerm]);

  useEffect(() => {
    const handle = setTimeout(() => {
      setApprovedSearchQuery(approvedSearchTerm.trim());
      setApprovedPage(1);
    }, 300);
    return () => clearTimeout(handle);
  }, [approvedSearchTerm]);

  useEffect(() => {
    const handle = setTimeout(() => {
      setPendingSearchQuery(pendingSearchTerm.trim());
      setPendingPage(1);
    }, 300);
    return () => clearTimeout(handle);
  }, [pendingSearchTerm]);

  async function handleAddonSubmit(event) {
    event.preventDefault();
    setNotice("");
    try {
      const data = await apiFetch("/api/dashboard/employees/addons", {
        method: "POST",
        body: JSON.stringify({ addon_count: addonCount })
      });
      if (data?.redirect) {
        window.location.href = data.redirect;
        return;
      }
      setNotice("Add-ons updated.");
      setAddonCount(0);
      await refreshBilling();
    } catch (error) {
      if (error?.data?.redirect) {
        window.location.href = error.data.redirect;
        return;
      }
      setNotice("");
      setState((prev) => ({
        ...prev,
        error: error?.message || "Unable to update add-ons."
      }));
    }
  }

  function openRenewModal(entry) {
    const plan = entry ? planById?.[entry.plan_id] : null;
    const defaultAddon = plan?.allow_addons ? (sub?.addon_count ?? 1) : 0;
    setRenewModal({
      open: true,
      entry,
      addonCount: Math.max(0, Number(defaultAddon || 0))
    });
  }

  function closeRenewModal() {
    setRenewModal((prev) => ({ ...prev, open: false }));
  }

  function adjustRenewAddon(delta) {
    setRenewModal((prev) => {
      const next = Math.max(0, Number(prev.addonCount || 0) + delta);
      return { ...prev, addonCount: next };
    });
  }

  function handleRenewAddonChange(event) {
    const value = Number(event.target.value || 0);
    setRenewModal((prev) => ({
      ...prev,
      addonCount: Number.isNaN(value) ? 0 : Math.max(0, value)
    }));
  }

  async function submitRenew(entry, addonCountValue) {
    if (!entry?.plan_id) {
      return;
    }
    setNotice("");
    try {
        const data = await apiFetch(`/api/dashboard/plans/subscribe/${entry.plan_id}`, {
          method: "POST",
          body: JSON.stringify({ billing_cycle: entry.billing_cycle || "monthly", addon_count: addonCountValue, product: apiProductSlug })
        });
      if (data?.redirect) {
        window.location.href = data.redirect;
        return;
      }
      if (data?.message) {
        setNotice(data.message);
      } else {
        setNotice("Renewal request submitted.");
      }
      await refreshBilling();
    } catch (error) {
      if (error?.data?.redirect) {
        window.location.href = error.data.redirect;
        return;
      }
      setState((prev) => ({
        ...prev,
        error: error?.message || "Unable to renew plan."
      }));
    }
  }
  const data = state.data || {};
  const sub = data.subscription || null;
  const showCurrency = data.show_currency || sub?.currency || "INR";
  const prices = sub?.prices || {};
  const historyEntries = data.history_entries || [];
  const approvedTransfers = data.approved_transfers || [];
  const pendingTransfers = data.pending_transfers || [];
  const taxRate = planMeta.taxRate || 0;
  const taxCurrency = planMeta.taxCurrency || "INR";
  const planById = useMemo(() => {
    const map = {};
    (planMeta.plans || []).forEach((plan) => {
      map[plan.id] = plan;
    });
    return map;
  }, [planMeta.plans]);

  const filteredHistory = useMemo(() => {
    if (!historySearchQuery) {
      return historyEntries;
    }
    const term = historySearchQuery.toLowerCase();
    return historyEntries.filter((entry) => {
      const values = [
        entry.plan,
        entry.status,
        entry.status_label,
        entry.start_date,
        entry.end_date
      ];
      return values.some((value) =>
        String(value || "").toLowerCase().includes(term)
      );
    });
  }, [historyEntries, historySearchQuery]);

  const filteredApproved = useMemo(() => {
    if (!approvedSearchQuery) {
      return approvedTransfers;
    }
    const term = approvedSearchQuery.toLowerCase();
    return approvedTransfers.filter((entry) => {
      const values = [
        entry.request_type,
        entry.payment_type,
        entry.plan,
        entry.amount,
        entry.status,
        entry.updated_at,
        entry.currency
      ];
      return values.some((value) =>
        String(value || "").toLowerCase().includes(term)
      );
    });
  }, [approvedTransfers, approvedSearchQuery]);

  const filteredPending = useMemo(() => {
    if (!pendingSearchQuery) {
      return pendingTransfers;
    }
    const term = pendingSearchQuery.toLowerCase();
    return pendingTransfers.filter((entry) => {
      const values = [
        entry.request_type,
        entry.payment_type,
        entry.plan,
        entry.amount,
        entry.status_label,
        entry.status,
        entry.created_at,
        entry.currency
      ];
      return values.some((value) =>
        String(value || "").toLowerCase().includes(term)
      );
    });
  }, [pendingTransfers, pendingSearchQuery]);

  const historyTotalItems = filteredHistory.length;
  const approvedTotalItems = filteredApproved.length;
  const pendingTotalItems = filteredPending.length;

  const historyTotalPages = Math.max(Math.ceil(historyTotalItems / PAGE_SIZE), 1);
  const approvedTotalPages = Math.max(Math.ceil(approvedTotalItems / PAGE_SIZE), 1);
  const pendingTotalPages = Math.max(Math.ceil(pendingTotalItems / PAGE_SIZE), 1);

  const pagedHistory = useMemo(
    () =>
      filteredHistory.slice((historyPage - 1) * PAGE_SIZE, historyPage * PAGE_SIZE),
    [filteredHistory, historyPage]
  );
  const pagedApproved = useMemo(
    () =>
      filteredApproved.slice((approvedPage - 1) * PAGE_SIZE, approvedPage * PAGE_SIZE),
    [filteredApproved, approvedPage]
  );
  const pagedPending = useMemo(
    () =>
      filteredPending.slice((pendingPage - 1) * PAGE_SIZE, pendingPage * PAGE_SIZE),
    [filteredPending, pendingPage]
  );

  const historyStartEntry = historyTotalItems
    ? (historyPage - 1) * PAGE_SIZE + 1
    : 0;
  const historyEndEntry = historyTotalItems
    ? Math.min(historyPage * PAGE_SIZE, historyTotalItems)
    : 0;
  const approvedStartEntry = approvedTotalItems
    ? (approvedPage - 1) * PAGE_SIZE + 1
    : 0;
  const approvedEndEntry = approvedTotalItems
    ? Math.min(approvedPage * PAGE_SIZE, approvedTotalItems)
    : 0;
  const pendingStartEntry = pendingTotalItems
    ? (pendingPage - 1) * PAGE_SIZE + 1
    : 0;
  const pendingEndEntry = pendingTotalItems
    ? Math.min(pendingPage * PAGE_SIZE, pendingTotalItems)
    : 0;

  function openApprovedView(entry) {
    setApprovedView({ open: true, entry });
  }

  function closeApprovedView() {
    setApprovedView({ open: false, entry: null });
  }

  useEffect(() => {
    if (historyPage > historyTotalPages) {
      setHistoryPage(historyTotalPages);
    }
  }, [historyPage, historyTotalPages]);

  useEffect(() => {
    if (approvedPage > approvedTotalPages) {
      setApprovedPage(approvedTotalPages);
    }
  }, [approvedPage, approvedTotalPages]);

  useEffect(() => {
    if (pendingPage > pendingTotalPages) {
      setPendingPage(pendingTotalPages);
    }
  }, [pendingPage, pendingTotalPages]);

  if (state.loading) {
    return (
      <div className="card p-4 text-center">
        <div className="spinner" />
        <p className="mb-0">Loading billing...</p>
      </div>
    );
  }

  const renewEntry = renewModal.entry;
  const renewPlan = renewEntry ? planById[renewEntry.plan_id] : null;
  const renewCycle = renewEntry?.billing_cycle || "monthly";
  const renewAddonCount = Number(renewModal.addonCount || 0);
  const renewBasePrice = renewPlan ? Number(getPlanPrice(renewPlan, renewCycle, showCurrency) || 0) : 0;
  const renewAddonPrice =
    renewPlan && renewPlan.allow_addons
      ? Number(getAddonPrice(renewPlan, renewCycle, showCurrency) || 0)
      : 0;
  const renewAddonSubtotal = Math.round((renewAddonPrice * renewAddonCount) * 100) / 100;
  const renewSubtotal = Math.round((renewBasePrice + renewAddonSubtotal) * 100) / 100;
  const renewTaxApplies = showCurrency === taxCurrency && taxRate > 0;
  const renewTaxAmount = renewTaxApplies
    ? Math.round((renewSubtotal * (taxRate / 100)) * 100) / 100
    : 0;
  const renewTotal = Math.round((renewSubtotal + renewTaxAmount) * 100) / 100;
  const renewBaseEmployees =
    renewPlan && renewPlan.employee_limit === 0 ? "Unlimited" : renewPlan?.employee_limit ?? "-";
  const renewTotalEmployees =
    renewPlan && renewPlan.employee_limit === 0
      ? "Unlimited"
      : Number(renewPlan?.employee_limit || 0) + renewAddonCount;
  const renewExistingAddons = Number(sub?.addon_count || 0);
  const renewExistingBaseRaw =
    renewPlan && renewPlan.employee_limit === 0 ? "Unlimited" : renewPlan?.employee_limit ?? "-";
  const renewExistingBase = renewExistingBaseRaw === "Unlimited" ? 1 : renewExistingBaseRaw;

  const approvedSplit = approvedView.entry
    ? computeTaxSplit(approvedView.entry.amount, approvedView.entry.tax_rate)
    : { base: 0, tax: 0, total: 0 };

  return (
    <>
      {notice ? <div className="alert alert-success">{notice}</div> : null}
      {state.error ? <div className="alert alert-danger">{state.error}</div> : null}

      <div className="row g-3 mt-1">
        <div className="col-12 col-lg-2">
          <div className="d-flex flex-column gap-3">
            <div className="card p-3">
              {sub ? (
                <>
                  <div className="billing-current-plan__header">
                    <div>
                      <div className="billing-current-plan__title">Current Plan</div>
                      <div className="billing-current-plan__plan">
                        {isBusinessAutopilot ? getBusinessAutopilotPlanDisplayName(sub.plan) : (sub.plan || "-")}
                      </div>
                    </div>
                    <span className="badge bg-success text-white text-uppercase">
                      {formatValue(sub.status)}
                    </span>
                  </div>
                  <div className="billing-current-plan__section">
                    <div className="billing-current-plan__row">
                      <span>{showCurrency === "USD" ? "USD Monthly" : "Monthly"}</span>
                      <span>{formatValue(prices.monthly)}</span>
                    </div>
                    <div className="billing-current-plan__row">
                      <span>{showCurrency === "USD" ? "USD Yearly" : "Yearly"}</span>
                      <span>{formatValue(prices.yearly)}</span>
                    </div>
                    <div className="billing-current-plan__row">
                      <span>{showCurrency === "USD" ? "Add-on USD Monthly" : "Add-on Monthly"}</span>
                      <span>{formatValue(prices.addon_monthly)}</span>
                    </div>
                    <div className="billing-current-plan__row">
                      <span>{showCurrency === "USD" ? "Add-on USD Yearly" : "Add-on Yearly"}</span>
                      <span>{formatValue(prices.addon_yearly)}</span>
                    </div>
                  </div>
                  <div className="billing-current-plan__section">
                    {isAiChatbot ? (
                      <>
                        <div className="billing-current-plan__row">
                          <span>Website Chat Widgets</span>
                          <span>{formatValue(sub.limits?.widgets)}</span>
                        </div>
                        <div className="billing-current-plan__row">
                          <span>Agents Included</span>
                          <span>{formatValue(sub.limits?.included_agents)}</span>
                        </div>
                        <div className="billing-current-plan__row">
                          <span>Conversations / Month</span>
                          <span>{formatValue(sub.limits?.conversations_per_month)}</span>
                        </div>
                        <div className="billing-current-plan__row">
                          <span>AI Replies / Month</span>
                          <span>{formatValue(sub.limits?.ai_replies_per_month)}</span>
                        </div>
                        <div className="billing-current-plan__row">
                          <span>Chat History</span>
                          <span>{formatValue(sub.limits?.chat_history_days)} day(s)</span>
                        </div>
                        <div className="billing-current-plan__row">
                          <span>Max Messages / Conversation</span>
                          <span>{formatValue(sub.limits?.max_messages_per_conversation)}</span>
                        </div>
                        <div className="billing-current-plan__row">
                          <span>Max Chars / Message</span>
                          <span>{formatValue(sub.limits?.max_chars_per_message)}</span>
                        </div>
                        <div className="plan-feature-divider" />
                        <div className="plan-feature">
                          <i className="bi bi-check-circle-fill plan-feature-icon text-success" aria-hidden="true" />
                          <span>Quick enquiry form</span>
                        </div>
                        <div className="plan-feature">
                          <i
                            className={`bi ${sub.allow_addons ? "bi-check-circle-fill text-success" : "bi-x-circle-fill text-danger"} plan-feature-icon`}
                            aria-hidden="true"
                          />
                          <span>Allow Agent Add-Ons</span>
                        </div>
                        <div className="plan-feature">
                          <i
                            className={`bi ${sub.features?.remove_branding ? "bi-check-circle-fill text-success" : "bi-x-circle-fill text-danger"} plan-feature-icon`}
                            aria-hidden="true"
                          />
                          <span>Remove branding</span>
                        </div>
                        <div className="plan-feature">
                          <i
                            className={`bi ${sub.features?.analytics_basic ? "bi-check-circle-fill text-success" : "bi-x-circle-fill text-danger"} plan-feature-icon`}
                            aria-hidden="true"
                          />
                          <span>Analytics (basic)</span>
                        </div>
                        <div className="plan-feature">
                          <i
                            className={`bi ${sub.features?.csv_export ? "bi-check-circle-fill text-success" : "bi-x-circle-fill text-danger"} plan-feature-icon`}
                            aria-hidden="true"
                          />
                          <span>CSV export</span>
                        </div>
                        <div className="plan-feature">
                          <i
                            className={`bi ${sub.features?.agent_inbox ? "bi-check-circle-fill text-success" : "bi-x-circle-fill text-danger"} plan-feature-icon`}
                            aria-hidden="true"
                          />
                          <span>Agent inbox</span>
                        </div>
                        <div className="plan-feature">
                          <i
                            className={`bi ${sub.features?.ai_enabled ? "bi-check-circle-fill text-success" : "bi-x-circle-fill text-danger"} plan-feature-icon`}
                            aria-hidden="true"
                          />
                          <span>AI replies enabled</span>
                        </div>
                      </>
                    ) : isStorage ? (
                      <>
                        <div className="billing-current-plan__row">
                          <span>Storage Limit</span>
                          <span>{formatStorageLimit(getStorageLimitGb(sub))}</span>
                        </div>
                        <div className="billing-current-plan__row">
                          <span>Bandwidth Limit</span>
                          <span>{formatBandwidthLimit(getBandwidthLimitGb(sub), isBandwidthLimited(sub))}</span>
                        </div>
                        <div className="billing-current-plan__row">
                          <span>Users Allowed</span>
                          <span>{formatUserLimit(getMaxUsers(sub))}</span>
                        </div>
                      </>
                    ) : isBusinessAutopilot ? (
                      <>
                        <div className="billing-current-plan__row">
                          <span>Base Platform ({showCurrency})</span>
                          <span>{formatValue(prices[sub.billing_cycle === "yearly" ? "yearly" : "monthly"])}</span>
                        </div>
                        <div className="billing-current-plan__row">
                          <span>Per User ({showCurrency})</span>
                          <span>{formatValue(getErpPerUserPriceFromLimits(sub.limits, sub.billing_cycle, showCurrency))}</span>
                        </div>
                        <div className="billing-current-plan__row">
                          <span>Employees Allowed</span>
                          <span>{sub.employee_limit === 0 ? "Unlimited" : formatValue(sub.employee_limit)}</span>
                        </div>
                        <div className="plan-feature-divider" />
                        {getErpPlanFeatures(sub).map((feature) => (
                          <div className="plan-feature" key={`erp-feature-${feature}`}>
                            <i className="bi bi-check-circle-fill plan-feature-icon text-success" aria-hidden="true" />
                            <span>{feature}</span>
                          </div>
                        ))}
                      </>
                    ) : (
                      <>
                        <div className="billing-current-plan__row">
                          <span>Employees Allowed</span>
                          <span>{sub.employee_limit === 0 ? "Unlimited" : sub.employee_limit}</span>
                        </div>
                        <div className="billing-current-plan__row">
                          <span>Screenshot Interval</span>
                          <span>
                            {formatValue(sub.limits?.screenshot_min_minutes || sub.screenshot_min_minutes)} min
                          </span>
                        </div>
                        <div className="billing-current-plan__row">
                          <span>Screenshot Retention</span>
                          <span>{formatValue(sub.retention_days)} day(s)</span>
                        </div>
                        <div className="plan-feature-divider" />
                        <div className="plan-feature">
                          <i
                            className={`bi ${sub.allow_addons ? "bi-check-circle-fill text-success" : "bi-x-circle-fill text-danger"} plan-feature-icon`}
                            aria-hidden="true"
                          />
                          <span>Employee add-ons</span>
                        </div>
                        <div className="plan-feature">
                          <i
                            className={`bi ${sub.allow_app_usage ? "bi-check-circle-fill text-success" : "bi-x-circle-fill text-danger"} plan-feature-icon`}
                            aria-hidden="true"
                          />
                          <span>App usage tracking</span>
                        </div>
                        <div className="plan-feature">
                          <i
                            className={`bi ${sub.allow_gaming_ott_usage ? "bi-check-circle-fill text-success" : "bi-x-circle-fill text-danger"} plan-feature-icon`}
                            aria-hidden="true"
                          />
                          <span>OTT/Gaming usage</span>
                        </div>
                        <div className="plan-feature">
                          <i
                            className={`bi ${sub.allow_hr_view ? "bi-check-circle-fill text-success" : "bi-x-circle-fill text-danger"} plan-feature-icon`}
                            aria-hidden="true"
                          />
                          <span>HR view</span>
                        </div>
                      </>
                    )}
                  </div>
                  <div className="billing-current-plan__section">
                    <div className="billing-current-plan__row">
                      <span>Start Date</span>
                      <span>{formatValue(sub.start_date)}</span>
                    </div>
                    <div className="billing-current-plan__row">
                      <span>End Date</span>
                      <span>{formatValue(sub.end_date)}</span>
                    </div>
                    <div className="billing-current-plan__row">
                      <span>Billing Cycle</span>
                      <span>{titleCase(sub.billing_cycle)}</span>
                    </div>
                    {!isAiChatbot && !isStorage && !isBusinessAutopilot ? (
                      <div className="billing-current-plan__row">
                        <span>Screenshot Storage</span>
                        <span>{formatValue(sub.retention_days)} day(s)</span>
                      </div>
                    ) : null}
                    <div className="billing-current-plan__row">
                      <span>Add-ons</span>
                      <span>{formatValue(sub.addon_count)}</span>
                    </div>
                    <div className="billing-current-plan__row">
                      <span>Proration Due Now</span>
                      <span>{formatAmount(showCurrency, sub.addon_proration_amount)}</span>
                    </div>
                  </div>
                  <Link to="/plans" className="btn btn-primary btn-sm w-100 billing-current-plan__cta">
                    Change Plan
                  </Link>
                </>
              ) : (
                <>
                  <p>No active plan found.</p>
                  <Link to="/plans" className="btn btn-primary btn-sm">
                    Choose Plan
                  </Link>
                </>
              )}
            </div>

            {sub && !isAiChatbot && !isStorage ? (
              <div className="card p-3">
                <h6>Add Employee Add-ons</h6>
                {!sub.allow_addons ? (
                  <p className="text-warning mb-0">Add-ons disabled for this plan.</p>
                ) : (
                  <form onSubmit={handleAddonSubmit}>
                    <label className="form-label mb-1">Addon Count</label>
                    <input
                      type="number"
                      min="0"
                      className="form-control form-control-sm"
                      value={addonCount}
                      onChange={(event) => setAddonCount(event.target.value)}
                    />
                    <button className="btn btn-primary btn-sm w-100 mt-2" type="submit">
                      Update
                    </button>
                    <small className="text-secondary d-block mt-2">
                      Proration applies based on remaining days in the current cycle.
                    </small>
                  </form>
                )}
              </div>
            ) : null}
          </div>
        </div>

        <div className="col-12 col-lg-10">
          <div className="card p-3 h-100">
            <h5>Billing History</h5>
            <div className="table-controls">
              <div className="table-length">Show {PAGE_SIZE} entries</div>
              <label className="table-search" htmlFor="billing-history-search">
                <span>Search:</span>
                <input
                  id="billing-history-search"
                  type="text"
                  value={historySearchTerm}
                  onChange={(event) => setHistorySearchTerm(event.target.value)}
                  placeholder="Search history"
                />
              </label>
            </div>
            <div className="table-responsive">
              <table className="table table-dark table-striped table-hover align-middle mt-2">
                <thead>
                  <tr>
                    <th>Plan</th>
                    <th>Status</th>
                    <th>Start Date</th>
                    <th>End Date</th>
                    <th>Action</th>
                    <th>Renew</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredHistory.length ? (
                    pagedHistory.map((entry, index) => (
                      <tr key={`${entry.plan}-${entry.start_date}-${index}`}>
                        <td>{entry.plan || "-"}</td>
                        <td>
                          <span className={getStatusPillClass(entry.status)}>
                            {entry.status_label || titleCase(entry.status)}
                          </span>
                        </td>
                        <td>{entry.start_date || "-"}</td>
                        <td>{entry.end_date || "-"}</td>
                        <td>{entry.action_label || "-"}</td>
                        <td>
                          {entry.renew_pending ? (
                            <span className="text-warning">Waiting for approval</span>
                          ) : entry.renew_available ? (
                            <button
                              type="button"
                              className="btn btn-outline-light btn-sm"
                              onClick={() => openRenewModal(entry)}
                            >
                              Renew
                            </button>
                          ) : (
                            <span className="text-secondary">-</span>
                          )}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan="6">No billing history available.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="table-footer">
              <div className="table-info">
                Showing {historyStartEntry} to {historyEndEntry} of {historyTotalItems} entries
              </div>
              <TablePagination
                page={historyPage}
                totalPages={historyTotalPages}
                onPageChange={setHistoryPage}
                showPageLinks
                showPageLabel={false}
                maxPageLinks={7}
              />
            </div>

            <div className="mt-3">
              <h6>Approved Transfers</h6>
              <div className="table-controls">
                <div className="table-length">Show {PAGE_SIZE} entries</div>
                <label className="table-search" htmlFor="billing-approved-search">
                  <span>Search:</span>
                  <input
                    id="billing-approved-search"
                    type="text"
                    value={approvedSearchTerm}
                    onChange={(event) => setApprovedSearchTerm(event.target.value)}
                    placeholder="Search approved"
                  />
                </label>
              </div>
              <div className="table-responsive">
                <table className="table table-dark table-striped table-hover align-middle mt-2">
                  <thead>
                    <tr>
                      <th>Type</th>
                      <th>Payment Type</th>
                      <th>Plan</th>
                      <th>Amount</th>
                      <th>Status</th>
                      <th>Approved</th>
                      <th>Invoice</th>
                      <th>View</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredApproved.length ? (
                      pagedApproved.map((entry, index) => (
                        <tr key={`${entry.plan}-${entry.updated_at}-${index}`}>
                          <td>{titleCase(entry.request_type)}</td>
                          <td>{formatPaymentType(entry.payment_type)}</td>
                          <td>{entry.plan || "-"}</td>
                          <td>{formatAmount(entry.currency, entry.amount)}</td>
                          <td>
                            <span className={getStatusPillClass(entry.status)}>
                              {entry.status_label || titleCase(entry.status) || "Approved"}
                            </span>
                          </td>
                          <td>{entry.updated_at || "-"}</td>
                          <td>
                            {entry.invoice_available && entry.id ? (
                              <a
                                className="text-info text-decoration-none"
                                href={`/api/dashboard/billing/invoice/${entry.id}`}
                                target="_blank"
                                rel="noopener noreferrer"
                              >
                                Download
                              </a>
                            ) : (
                              "-"
                            )}
                          </td>
                          <td>
                            <button
                              type="button"
                              className="btn btn-outline-light btn-sm"
                              onClick={() => openApprovedView(entry)}
                            >
                              View
                            </button>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan="8">No approved transfers yet.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              <div className="table-footer">
                <div className="table-info">
                  Showing {approvedStartEntry} to {approvedEndEntry} of {approvedTotalItems} entries
                </div>
                <TablePagination
                  page={approvedPage}
                  totalPages={approvedTotalPages}
                  onPageChange={setApprovedPage}
                  showPageLinks
                  showPageLabel={false}
                  maxPageLinks={7}
                />
              </div>
            </div>

            <div className="mt-3">
              <h6>Billing Activity</h6>
              <div className="table-controls">
                <div className="table-length">Show {PAGE_SIZE} entries</div>
                <label className="table-search" htmlFor="billing-pending-search">
                  <span>Search:</span>
                  <input
                    id="billing-pending-search"
                    type="text"
                    value={pendingSearchTerm}
                    onChange={(event) => setPendingSearchTerm(event.target.value)}
                    placeholder="Search activity"
                  />
                </label>
              </div>
              <div className="table-responsive">
                <table className="table table-dark table-striped table-hover align-middle mt-2">
                  <thead>
                    <tr>
                      <th>Type</th>
                      <th>Payment Type</th>
                      <th>Plan</th>
                      <th>Amount</th>
                      <th>Status</th>
                      <th>Submitted</th>
                      <th>Invoice</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredPending.length ? (
                      pagedPending.map((entry, index) => (
                        <tr key={`${entry.plan}-${entry.created_at}-${index}`}>
                          <td>{titleCase(entry.request_type)}</td>
                          <td>{formatPaymentType(entry.payment_type)}</td>
                          <td>{entry.plan || "-"}</td>
                          <td>{formatAmount(entry.currency, entry.amount)}</td>
                          <td>
                            <span className={getStatusPillClass(entry.status)}>
                              {entry.status_label || titleCase(entry.status)}
                            </span>
                          </td>
                          <td>{entry.created_at || "-"}</td>
                          <td>-</td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan="7">No pending payments.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              <div className="table-footer">
                <div className="table-info">
                  Showing {pendingStartEntry} to {pendingEndEntry} of {pendingTotalItems} entries
                </div>
                <TablePagination
                  page={pendingPage}
                  totalPages={pendingTotalPages}
                  onPageChange={setPendingPage}
                  showPageLinks
                  showPageLabel={false}
                  maxPageLinks={7}
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {renewModal.open && renewPlan ? (
        <div className="modal-overlay" onClick={closeRenewModal}>
          <div className="modal-panel" onClick={(event) => event.stopPropagation()}>
            <h5>{isAiChatbot ? "Update Agent Add-ons" : "Update User Count"}</h5>
            <div className="text-secondary mb-2">
              Plan: {renewPlan.name} ({titleCase(renewCycle)})
            </div>
            <div className="mb-2">
              <strong>{isAiChatbot ? "Base Agents Included" : "Base Employees User Limit"}:</strong>{" "}
              {isAiChatbot ? (renewPlan.limits?.included_agents ?? "-") : renewBaseEmployees}
            </div>
            <div className="mb-2">
              <strong>{isAiChatbot ? "Current Existing Agents" : "Current Existing Users"}:</strong>{" "}
              {isAiChatbot ? (renewPlan.limits?.included_agents ?? "-") : renewExistingBase} + {renewExistingAddons} Addons
            </div>
            {renewPlan.allow_addons ? (
              <div className="mb-3">
                <label className="form-label">{isAiChatbot ? "Additional Agents (Add-ons)" : "Additional Users (Add-ons)"}</label>
                <div className="d-flex align-items-center gap-2">
                  <button
                    type="button"
                    className="btn btn-outline-light btn-sm"
                    onClick={() => adjustRenewAddon(-1)}
                    disabled={renewAddonCount <= 0}
                  >
                    -
                  </button>
                  <input
                    type="number"
                    min="0"
                    className="form-control form-control-sm"
                    style={{ maxWidth: "120px" }}
                    value={renewAddonCount}
                    onChange={handleRenewAddonChange}
                  />
                  <button
                    type="button"
                    className="btn btn-outline-light btn-sm"
                    onClick={() => adjustRenewAddon(1)}
                  >
                    +
                  </button>
                </div>
                <div className="text-secondary mt-2">
                  Add-on price: {showCurrency} {renewAddonPrice || "-"}
                </div>
              </div>
            ) : (
              <p className="text-warning mb-3">Add-ons disabled for this plan.</p>
            )}
            <div className="mb-2">
              <strong>{isAiChatbot ? "Total Agents" : "Total Employees"}:</strong>{" "}
              {isAiChatbot ? renewExistingAddons + Number(renewPlan.limits?.included_agents || 0) : renewTotalEmployees}
            </div>
            <div className="mb-3">
              <div className="text-secondary">
                Base: {showCurrency} {renewBasePrice || "-"}
              </div>
              {renewPlan.allow_addons ? (
                <div className="text-secondary">
                  Add-ons: {showCurrency} {renewAddonSubtotal || 0}
                </div>
              ) : null}
              {renewTaxApplies ? (
                <div className="text-secondary">
                  GST ({taxRate}%): {showCurrency} {renewTaxAmount || 0}
                </div>
              ) : null}
              <div className="fw-semibold">
                Total: {showCurrency} {renewTotal || 0}
              </div>
            </div>
            <div className="d-flex justify-content-end gap-2">
              <button type="button" className="btn btn-secondary" onClick={closeRenewModal}>
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={async () => {
                  await submitRenew(renewEntry, renewAddonCount);
                  closeRenewModal();
                }}
              >
                Continue
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {approvedView.open && approvedView.entry ? (
        <div className="modal-overlay" onClick={closeApprovedView}>
          <div className="modal-panel" onClick={(event) => event.stopPropagation()}>
            <h5>Payment Details</h5>
            <div className="text-secondary mb-2">
              {titleCase(approvedView.entry.request_type)} -{" "}
              {formatPaymentType(approvedView.entry.payment_type)}
            </div>
            <div className="mb-2">
              <strong>Plan:</strong> {approvedView.entry.plan || "-"}
            </div>
            <div className="mb-2">
              <strong>Billing Cycle:</strong>{" "}
              {titleCase(approvedView.entry.billing_cycle) || "-"}
            </div>
            <div className="mb-2">
              <strong>Add-ons:</strong> {approvedView.entry.addon_count ?? 0}
            </div>
            <div className="mb-2">
              <strong>Amount:</strong>{" "}
              {formatAmount(approvedView.entry.currency, approvedView.entry.amount)}
            </div>
            <div className="mb-2">
              <strong>Base:</strong>{" "}
              {formatAmount(approvedView.entry.currency, approvedSplit.base)}
            </div>
            <div className="mb-2">
              <strong>GST:</strong>{" "}
              {formatAmount(approvedView.entry.currency, approvedSplit.tax)}
            </div>
            <div className="mb-2">
              <strong>Total:</strong>{" "}
              {formatAmount(approvedView.entry.currency, approvedSplit.total)}
            </div>
            <div className="mb-2">
              <strong>Status:</strong>{" "}
              {approvedView.entry.status_label || titleCase(approvedView.entry.status)}
            </div>
            <div className="mb-2">
              <strong>Approved:</strong> {approvedView.entry.updated_at || "-"}
            </div>
            <div className="mb-2">
              <strong>Reference / UTR:</strong> {approvedView.entry.reference_no || "-"}
            </div>
            <div className="mb-3">
              <strong>Receipt:</strong>{" "}
              {approvedView.entry.receipt_url ? (
                <a
                  href={approvedView.entry.receipt_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-info text-decoration-none"
                >
                  View Receipt
                </a>
              ) : (
                "-"
              )}
            </div>
            <div className="d-flex justify-content-end">
              <button type="button" className="btn btn-secondary" onClick={closeApprovedView}>
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
