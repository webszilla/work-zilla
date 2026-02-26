import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "../lib/api.js";
import { useConfirm } from "../components/ConfirmDialog.jsx";
import { COUNTRY_OPTIONS } from "../lib/countries.js";
import { PHONE_COUNTRIES } from "../lib/phoneCountries.js";

const emptyState = {
  loading: true,
  error: "",
  data: null
};

const emptyBillingProfile = {
  contact_name: "",
  company_name: "",
  email: "",
  phone: "",
  phone_country: "+91",
  address_line1: "",
  address_line2: "",
  city: "",
  state: "",
  postal_code: "",
  country: "India",
  gstin: ""
};

const requiredBillingFields = [
  "contact_name",
  "company_name",
  "email",
  "phone",
  "address_line1",
  "city",
  "state",
  "postal_code",
  "country"
];

const STATE_OPTIONS_BY_COUNTRY = {
  india: [
    "Andhra Pradesh",
    "Arunachal Pradesh",
    "Assam",
    "Bihar",
    "Chhattisgarh",
    "Goa",
    "Gujarat",
    "Haryana",
    "Himachal Pradesh",
    "Jharkhand",
    "Karnataka",
    "Kerala",
    "Madhya Pradesh",
    "Maharashtra",
    "Manipur",
    "Meghalaya",
    "Mizoram",
    "Nagaland",
    "Odisha",
    "Punjab",
    "Rajasthan",
    "Sikkim",
    "Tamil Nadu",
    "Telangana",
    "Tripura",
    "Uttar Pradesh",
    "Uttarakhand",
    "West Bengal",
    "Andaman and Nicobar Islands",
    "Chandigarh",
    "Dadra and Nagar Haveli and Daman and Diu",
    "Delhi",
    "Jammu and Kashmir",
    "Ladakh",
    "Lakshadweep",
    "Puducherry"
  ]
};

function normalizeCountry(value) {
  return String(value || "").trim().toLowerCase();
}

function getStateOptions(country) {
  return STATE_OPTIONS_BY_COUNTRY[normalizeCountry(country)] || [];
}

function getMissingBillingFields(profile) {
  return requiredBillingFields.filter(
    (field) => !String(profile?.[field] || "").trim()
  );
}

function hasPaidPrice(plan) {
  return Boolean(
    plan.monthly_price ||
      plan.yearly_price ||
      plan.usd_monthly_price ||
      plan.usd_yearly_price
  );
}

function formatCurrencyLabel(currency) {
  return currency === "USD" ? "USD" : "INR";
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

function getDeviceLimitPerUser(plan) {
  const limits = plan?.limits || {};
  const value = limits.device_limit_per_user ?? plan?.device_limit_per_user ?? 0;
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

function formatDeviceLimit(value) {
  if (!value) {
    return "-";
  }
  return `Up to ${value} devices per user`;
}

function normalizeBillingProfile(profile) {
  return {
    ...emptyBillingProfile,
    ...(profile || {}),
    phone_country: profile?.phone_country || profile?.phone_code || "+91"
  };
}

function titleCase(value) {
  if (!value) {
    return "-";
  }
  return String(value)
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function getPlanPrice(plan, cycle, currency) {
  if (currency === "USD") {
    return cycle === "yearly" ? plan.usd_yearly_price : plan.usd_monthly_price;
  }
  return cycle === "yearly" ? plan.yearly_price : plan.monthly_price;
}

function getAddonPrice(plan, cycle, currency) {
  if (currency === "USD") {
    return cycle === "yearly" ? plan.addon_usd_yearly_price : plan.addon_usd_monthly_price;
  }
  return cycle === "yearly" ? plan.addon_yearly_price : plan.addon_monthly_price;
}

function getErpPerUserPrice(plan, cycle, currency) {
  const limits = plan?.limits || {};
  if (currency === "USD") {
    return cycle === "yearly"
      ? (limits.user_price_usdt_year ?? limits.user_price_usd_year ?? null)
      : (limits.user_price_usdt_month ?? limits.user_price_usd_month ?? null);
  }
  return cycle === "yearly"
    ? (limits.user_price_inr_year ?? null)
    : (limits.user_price_inr_month ?? null);
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
  const configuredModuleLabels = configuredModules
    .map((slug) => moduleLabelMap[slug])
    .filter(Boolean);
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
    if (roleBasedAccessEnabled) {
      features.push("Role Based Access");
    }
    if (configuredModuleLabels.length) {
      features.push(...configuredModuleLabels);
    }
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
    if (roleBasedAccessEnabled) {
      features.push("Role Based Access");
    }
    if (configuredModuleLabels.length) {
      features.push(...configuredModuleLabels);
    }
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
    if (roleBasedAccessEnabled && !features.includes("Role Based Access")) {
      features.push("Role Based Access");
    }
    if (configuredModuleLabels.length) {
      features.push(...configuredModuleLabels);
    }
    return features;
  }
  const fallback = configuredModuleLabels.length
    ? configuredModuleLabels
    : [
    "CRM Module",
    "HR Management",
    "Projects",
    "Accounts / ERP",
    ];
  if (roleBasedAccessEnabled) {
    fallback.push("Role Based Access");
  }
  return Array.from(new Set(fallback));
}

function getBusinessAutopilotPlanDisplayName(planName) {
  const raw = String(planName || "").trim();
  if (!raw) return "-";
  return raw.replace(/\s+ERP$/i, "");
}

function getProrationNote(plan, cycle, activeSub) {
  if (!activeSub || !activeSub.end_ts || !activeSub.start_ts) {
    return "";
  }
  if (Number(activeSub.plan_id) === Number(plan.id)) {
    return "";
  }
  if (activeSub.billing_cycle && activeSub.billing_cycle !== cycle) {
    return "Billing cycle change applies at full price.";
  }
  const nowSec = Date.now() / 1000;
  const totalDays = Math.max((activeSub.end_ts - activeSub.start_ts) / 86400, 0);
  const remainingDays = Math.max((activeSub.end_ts - nowSec) / 86400, 0);
  if (!totalDays || !remainingDays) {
    return "";
  }
  const planPrice = cycle === "yearly" ? plan.yearly_price : plan.monthly_price;
  const currentPrice = cycle === "yearly" ? activeSub.current_yearly : activeSub.current_monthly;
  if (!planPrice || !currentPrice) {
    return "";
  }
  const delta = Number(planPrice) - Number(currentPrice);
  if (delta > 0) {
    const prorated = Math.round((delta * (remainingDays / totalDays)) * 100) / 100;
    return `Prorated upgrade: INR ${prorated} (based on remaining days).`;
  }
  if (delta < 0) {
    return "Downgrade: no refund will be issued.";
  }
  return "Plan change at no additional charge.";
}

function dedupePlans(list) {
  const rows = Array.isArray(list) ? list : [];
  const seen = new Set();
  return rows.filter((plan) => {
    const key = [
      String(plan?.name || "").trim().toLowerCase(),
      String(plan?.monthly_price ?? ""),
      String(plan?.yearly_price ?? ""),
      String(plan?.usd_monthly_price ?? ""),
      String(plan?.usd_yearly_price ?? ""),
      String(plan?.employee_limit ?? ""),
      String(plan?.retention_days ?? ""),
      String(plan?.allow_addons ?? ""),
    ].join("|");
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

export default function PlansPage() {
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
  const [currency, setCurrency] = useState("INR");
  const [billingCycles, setBillingCycles] = useState({});
  const [notice, setNotice] = useState("");
  const [billingProfile, setBillingProfile] = useState(emptyBillingProfile);
  const [billingLoaded, setBillingLoaded] = useState(false);
  const [billingSaving, setBillingSaving] = useState(false);
  const [billingNotice, setBillingNotice] = useState("");
  const [billingError, setBillingError] = useState("");
  const [billingMissing, setBillingMissing] = useState([]);
  const [addonModal, setAddonModal] = useState({
    open: false,
    plan: null,
    cycle: "monthly",
    addonCount: 1
  });
  const confirm = useConfirm();

  async function loadPlans(activeFlag) {
    setNotice("");
    try {
      const data = await apiFetch(`/api/dashboard/plans?product=${apiProductSlug}`);
      if (activeFlag && !activeFlag.current) {
        return;
      }
      setState({ loading: false, error: "", data });
    } catch (error) {
      if (error?.data?.redirect) {
        window.location.href = error.data.redirect;
        return;
      }
      if (!activeFlag || activeFlag.current) {
        setState({
          loading: false,
          error: error?.message || "Unable to load plans.",
          data: null
        });
      }
    }
  }

  async function loadBillingProfile(activeFlag) {
    setBillingNotice("");
    setBillingError("");
    try {
      const data = await apiFetch("/api/dashboard/billing-profile");
      if (activeFlag && !activeFlag.current) {
        return;
      }
      setBillingProfile(normalizeBillingProfile(data.profile));
      setBillingMissing(data.missing_fields || []);
      setBillingLoaded(true);
    } catch (error) {
      if (error?.data?.redirect) {
        window.location.href = error.data.redirect;
        return;
      }
      if (!activeFlag || activeFlag.current) {
        setBillingError(error?.message || "Unable to load billing details.");
        setBillingLoaded(true);
      }
    }
  }

  useEffect(() => {
    const activeFlag = { current: true };
    loadPlans(activeFlag);
    loadBillingProfile(activeFlag);
    return () => {
      activeFlag.current = false;
    };
  }, []);

  const plans = useMemo(() => dedupePlans(state.data?.plans || []), [state.data?.plans]);
  const freeEligible = state.data?.free_eligible !== false;
  const activeSub = state.data?.active_sub || null;
  const activeTrialPlanId =
    activeSub && String(activeSub.status || "").toLowerCase() === "trialing"
      ? Number(activeSub.plan_id)
      : null;
  const activePlan = useMemo(() => {
    if (!activeSub || !state.data?.plans) {
      return null;
    }
    return dedupePlans(state.data.plans).find((plan) => Number(plan.id) === Number(activeSub.plan_id)) || null;
  }, [activeSub, state.data?.plans]);
  const rollback = state.data?.rollback || null;
  const taxRate = Number(state.data?.tax_rate || 0);
  const taxCurrency = state.data?.tax_currency || "INR";
  const missingBillingFields = getMissingBillingFields(billingProfile);
  const invalidBillingFields = billingMissing.length ? billingMissing : missingBillingFields;
  const billingComplete = missingBillingFields.length === 0;

  const displayPlans = useMemo(() => {
    if (productSlug !== "storage") {
      return plans;
    }
    const freePlan = plans.find((plan) => !hasPaidPrice(plan));
    const paidPlans = plans.filter((plan) => hasPaidPrice(plan));
    const showFreePlan = freeEligible || (freePlan && Number(freePlan.id) === activeTrialPlanId);
    if (showFreePlan && freePlan) {
      return [freePlan, ...paidPlans.filter((plan) => Number(plan.id) !== Number(freePlan.id))];
    }
    return paidPlans;
  }, [plans, freeEligible, productSlug, activeTrialPlanId]);

  const initialCycles = useMemo(() => {
    const map = {};
    displayPlans.forEach((plan) => {
      map[plan.id] = billingCycles[plan.id] || "monthly";
    });
    return map;
  }, [displayPlans, billingCycles]);

  async function submitSubscribe(plan, addonCount) {
    setNotice("");
    setBillingError("");
    setBillingNotice("");
    const cycle = initialCycles[plan.id] || "monthly";
    const currentInr = cycle === "yearly" ? activeSub?.current_yearly : activeSub?.current_monthly;
    const targetInr = cycle === "yearly" ? plan.yearly_price : plan.monthly_price;
    if (hasPaidPrice(plan)) {
      if (!billingLoaded) {
        setBillingError("Billing details are still loading. Please try again.");
        return;
      }
      if (!billingComplete) {
        setBillingMissing(missingBillingFields);
        setBillingError("Please complete billing details before proceeding.");
        document.getElementById("billing-details")?.scrollIntoView({ behavior: "smooth" });
        return;
      }
    }
    const isDowngrade =
      activeSub &&
      Number(activeSub.plan_id) !== Number(plan.id) &&
      (hasPaidPrice(plan) ? Number(targetInr || 0) < Number(currentInr || 0) : true);
    if (isDowngrade) {
      const confirmed = await confirm({
        title: "Confirm Downgrade",
        message: "You are downgrading your plan. Existing benefits will be replaced. Continue?",
        confirmText: "Continue",
        confirmVariant: "warning"
      });
      if (!confirmed) {
        return;
      }
    }
    try {
    const data = await apiFetch(`/api/dashboard/plans/subscribe/${plan.id}`, {
      method: "POST",
      body: JSON.stringify({ billing_cycle: cycle, addon_count: addonCount, product: apiProductSlug })
    });
      if (data?.redirect) {
        window.location.href = data.redirect;
        return;
      }
      if (data?.message) {
        setNotice(data.message);
      }
    } catch (error) {
      if (error?.data?.redirect) {
        window.location.href = error.data.redirect;
        return;
      }
      if (error?.data?.missing_fields) {
        setBillingMissing(error.data.missing_fields);
        setBillingError("Please complete billing details before proceeding.");
        document.getElementById("billing-details")?.scrollIntoView({ behavior: "smooth" });
        return;
      }
      setState((prev) => ({
        ...prev,
        error: error?.message || "Unable to update plan."
      }));
    }
  }

  function handleSubscribe(plan) {
    if (!hasPaidPrice(plan)) {
      submitSubscribe(plan, 0);
      return;
    }
    if (isAiChatbot) {
      submitSubscribe(plan, 0);
      return;
    }
    const cycle = initialCycles[plan.id] || "monthly";
    const defaultAddon = plan.allow_addons ? 1 : 0;
    setAddonModal({
      open: true,
      plan,
      cycle,
      addonCount: defaultAddon
    });
  }

  async function handleRollback() {
    if (!rollback) {
      return;
    }
    const confirmed = await confirm({
      title: "Rollback Plan",
      message: `Rollback to ${rollback.plan} (valid till ${rollback.end_date})?`,
      confirmText: "Rollback",
      confirmVariant: "warning"
    });
    if (!confirmed) {
      return;
    }
    try {
      const data = await apiFetch("/api/dashboard/plans/rollback", { method: "POST" });
      if (data?.message) {
        setNotice(data.message);
      }
      await loadPlans();
    } catch (error) {
      if (error?.data?.redirect) {
        window.location.href = error.data.redirect;
        return;
      }
      setState((prev) => ({
        ...prev,
        error: error?.message || "Unable to rollback plan."
      }));
    }
  }

  function updateBillingField(event) {
    const { name, value } = event.target;
    setBillingProfile((prev) => {
      if (name === "country") {
        return {
          ...prev,
          country: value,
          state: prev.state && prev.state.trim() ? prev.state : ""
        };
      }
      return { ...prev, [name]: value };
    });
  }

  async function handleBillingSave(event) {
    event.preventDefault();
    setBillingNotice("");
    setBillingError("");
    setBillingSaving(true);
    try {
      const data = await apiFetch("/api/dashboard/billing-profile", {
        method: "POST",
        body: JSON.stringify(normalizeBillingProfile(billingProfile))
      });
      setBillingProfile(normalizeBillingProfile(data.profile));
      setBillingMissing(data.missing_fields || []);
      setBillingNotice("Billing details saved.");
    } catch (error) {
      if (error?.data?.redirect) {
        window.location.href = error.data.redirect;
        return;
      }
      if (error?.data?.missing_fields) {
        setBillingMissing(error.data.missing_fields);
      }
      if (error?.message === "invalid_gstin") {
        setBillingError("Please enter a valid GSTIN.");
      } else if (error?.message === "billing_profile_incomplete") {
        setBillingError("Please complete billing details.");
      } else {
        setBillingError(error?.message || "Unable to save billing details.");
      }
    } finally {
      setBillingSaving(false);
    }
  }

  function closeAddonModal() {
    setAddonModal((prev) => ({ ...prev, open: false }));
  }

  function adjustAddonCount(delta) {
    setAddonModal((prev) => {
      const next = Math.max(0, Number(prev.addonCount || 0) + delta);
      return { ...prev, addonCount: next };
    });
  }

  function handleAddonCountChange(event) {
    const value = Number(event.target.value || 0);
    setAddonModal((prev) => ({
      ...prev,
      addonCount: Number.isNaN(value) ? 0 : Math.max(0, value)
    }));
  }

  async function confirmAddonModal() {
    if (!addonModal.plan) {
      return;
    }
    await submitSubscribe(addonModal.plan, addonModal.addonCount);
    closeAddonModal();
  }

  if (state.loading) {
    return (
      <div className="card p-4 text-center">
        <div className="spinner" />
        <p className="mb-0">Loading plans...</p>
      </div>
    );
  }

  const modalPlan = addonModal.plan;
  const modalCycle = addonModal.cycle || "monthly";
  const modalAddonCount = Number(addonModal.addonCount || 0);
  const modalBasePrice = modalPlan ? Number(getPlanPrice(modalPlan, modalCycle, currency) || 0) : 0;
  const modalAddonPrice =
    modalPlan && modalPlan.allow_addons
      ? Number(getAddonPrice(modalPlan, modalCycle, currency) || 0)
      : 0;
  const modalAddonSubtotal = Math.round((modalAddonPrice * modalAddonCount) * 100) / 100;
  const modalSubtotal = Math.round((modalBasePrice + modalAddonSubtotal) * 100) / 100;
  const modalTaxApplies = currency === taxCurrency && taxRate > 0;
  const modalTaxAmount = modalTaxApplies
    ? Math.round((modalSubtotal * (taxRate / 100)) * 100) / 100
    : 0;
  const modalTotal = Math.round((modalSubtotal + modalTaxAmount) * 100) / 100;
  const modalBaseEmployees =
    modalPlan && modalPlan.employee_limit === 0 ? "Unlimited" : modalPlan?.employee_limit ?? "-";
  const modalTotalEmployees =
    modalPlan && modalPlan.employee_limit === 0
      ? "Unlimited"
      : Number(modalPlan?.employee_limit || 0) + modalAddonCount;
  const modalExistingAddons =
    activeSub && modalPlan && Number(activeSub.plan_id) === Number(modalPlan.id)
      ? Number(activeSub.addon_count || 0)
      : 0;
  const modalExistingBaseRaw =
    modalPlan && modalPlan.employee_limit === 0 ? "Unlimited" : modalPlan?.employee_limit ?? "-";
  const modalExistingBase = modalExistingBaseRaw === "Unlimited" ? 1 : modalExistingBaseRaw;

  return (
    <>
      <h2 className="page-title">Choose a Plan</h2>
      <hr className="section-divider" />

      {activeSub ? (
        <p className="text-secondary">
          Current Plan: <strong>{isBusinessAutopilot ? getBusinessAutopilotPlanDisplayName(activeSub.plan) : activeSub.plan}</strong>
          {activeSub.end_date ? ` (Valid till ${activeSub.end_date})` : ""}
        </p>
      ) : null}

      <div className="mt-2">
        <div className="currency-toggle" role="group" aria-label="Currency toggle">
          <button
            type="button"
            className={currency === "USD" ? "active" : ""}
            onClick={() => setCurrency("USD")}
          >
            USD Payment
          </button>
          <button
            type="button"
            className={currency === "INR" ? "active" : ""}
            onClick={() => setCurrency("INR")}
          >
            INR Payment
          </button>
        </div>
      </div>

      {notice ? <div className="alert alert-success mt-3">{notice}</div> : null}
      {state.error ? <div className="alert alert-danger mt-3">{state.error}</div> : null}
      {rollback ? (
        <div className="alert alert-warning mt-3 d-flex flex-wrap align-items-center justify-content-between gap-2">
          <span>
            Rollback available: <strong>{rollback.plan}</strong>
            {rollback.end_date ? ` (Valid till ${rollback.end_date})` : ""}
          </span>
          <button type="button" className="btn btn-warning btn-sm" onClick={handleRollback}>
            Rollback Plan
          </button>
        </div>
      ) : null}

      <div className="card p-3 mt-3" id="billing-details">
        <div className="d-flex flex-wrap align-items-center justify-content-between gap-2">
          <div>
            <h5 className="mb-1">Billing Information & GST</h5>
            <p className="text-secondary mb-0">
              Required before paid plans and used for invoice generation.
            </p>
          </div>
          <span className={`badge ${billingComplete ? "bg-success" : "bg-warning text-dark"}`}>
            {billingComplete ? "Complete" : "Incomplete"}
          </span>
        </div>
        {billingNotice ? <div className="alert alert-success mt-2">{billingNotice}</div> : null}
        {billingError ? <div className="alert alert-danger mt-2">{billingError}</div> : null}
        <form onSubmit={handleBillingSave}>
          <div className="row g-3 mt-1">
            <div className="col-12 col-md-3">
              <label className="form-label">Contact Name</label>
              <input
                type="text"
                name="contact_name"
                className={`form-control ${invalidBillingFields.includes("contact_name") ? "is-invalid" : ""}`}
                value={billingProfile.contact_name}
                onChange={updateBillingField}
                required
              />
            </div>
            <div className="col-12 col-md-3">
              <label className="form-label">Company Name</label>
              <input
                type="text"
                name="company_name"
                className={`form-control ${invalidBillingFields.includes("company_name") ? "is-invalid" : ""}`}
                value={billingProfile.company_name}
                onChange={updateBillingField}
                required
              />
            </div>
            <div className="col-12 col-md-3">
              <label className="form-label">Email</label>
              <input
                type="email"
                name="email"
                className={`form-control ${invalidBillingFields.includes("email") ? "is-invalid" : ""}`}
                value={billingProfile.email}
                onChange={updateBillingField}
                required
              />
            </div>
            <div className="col-12 col-md-3">
              <label className="form-label">Phone</label>
              <div className="input-group">
                <select
                  className="form-select"
                  style={{ maxWidth: "140px" }}
                  value={billingProfile.phone_country || "+91"}
                  onChange={(event) =>
                    setBillingProfile((prev) => ({
                      ...prev,
                      phone_country: event.target.value
                    }))
                  }
                >
                  {PHONE_COUNTRIES.map((entry) => (
                    <option key={`${entry.code}-${entry.label}`} value={entry.code}>
                      {entry.code} ({entry.label})
                    </option>
                  ))}
                </select>
                <input
                  type="tel"
                  name="phone"
                  className={`form-control ${invalidBillingFields.includes("phone") ? "is-invalid" : ""}`}
                  value={billingProfile.phone}
                  onChange={updateBillingField}
                  required
                  placeholder="Phone number"
                />
              </div>
            </div>
            <div className="col-12 col-md-3">
              <label className="form-label">Address Line 1</label>
              <input
                type="text"
                name="address_line1"
                className={`form-control ${invalidBillingFields.includes("address_line1") ? "is-invalid" : ""}`}
                value={billingProfile.address_line1}
                onChange={updateBillingField}
                required
              />
            </div>
            <div className="col-12 col-md-3">
              <label className="form-label">Address Line 2 (optional)</label>
              <input
                type="text"
                name="address_line2"
                className="form-control"
                value={billingProfile.address_line2}
                onChange={updateBillingField}
              />
            </div>
            <div className="col-12 col-md-3">
              <label className="form-label">City</label>
              <input
                type="text"
                name="city"
                className={`form-control ${invalidBillingFields.includes("city") ? "is-invalid" : ""}`}
                value={billingProfile.city}
                onChange={updateBillingField}
                required
              />
            </div>
            <div className="col-12 col-md-3">
              <label className="form-label">Country</label>
              <input
                type="text"
                name="country"
                className={`form-control plans-billing-datalist-field ${invalidBillingFields.includes("country") ? "is-invalid" : ""}`}
                value={billingProfile.country}
                onChange={updateBillingField}
                list="country-options"
                required
              />
            </div>
            <div className="col-12 col-md-3">
              <label className="form-label">State</label>
              <input
                type="text"
                name="state"
                className={`form-control plans-billing-datalist-field ${invalidBillingFields.includes("state") ? "is-invalid" : ""}`}
                value={billingProfile.state}
                onChange={updateBillingField}
                list="state-options"
                disabled={!String(billingProfile.country || "").trim()}
                required
              />
            </div>
            <div className="col-12 col-md-3">
              <label className="form-label">Postal Code</label>
              <input
                type="text"
                name="postal_code"
                className={`form-control ${invalidBillingFields.includes("postal_code") ? "is-invalid" : ""}`}
                value={billingProfile.postal_code}
                onChange={updateBillingField}
                required
              />
            </div>
            <div className="col-12 col-md-3">
              <label className="form-label">GSTIN (optional)</label>
              <input
                type="text"
                name="gstin"
                className="form-control"
                value={billingProfile.gstin}
                onChange={(event) =>
                  updateBillingField({
                    target: { name: "gstin", value: event.target.value.toUpperCase() }
                  })
                }
                maxLength={15}
                placeholder="15-character GSTIN"
              />
            </div>
            <div className="col-12 col-md-3 d-flex align-items-end">
              <button className="btn btn-primary btn-sm w-100" type="submit" disabled={billingSaving}>
                {billingSaving ? "Saving..." : "Save Billing Details"}
              </button>
            </div>
          </div>
          <datalist id="country-options">
            {COUNTRY_OPTIONS.map((option) => (
              <option key={option} value={option} />
            ))}
          </datalist>
          <datalist id="state-options">
            {getStateOptions(billingProfile.country).map((option) => (
              <option key={option} value={option} />
            ))}
          </datalist>
        </form>
      </div>

      <div className="row mt-4 g-3">
        {displayPlans.length ? (
          displayPlans.map((plan) => {
            const cycle = initialCycles[plan.id] || "monthly";
            const planPrice = getPlanPrice(plan, "monthly", currency);
            const planYearly = getPlanPrice(plan, "yearly", currency);
            const addonMonthly = getAddonPrice(plan, "monthly", currency);
            const addonYearly = getAddonPrice(plan, "yearly", currency);
            const isActive = activeSub && Number(activeSub.plan_id) === Number(plan.id);
            const isTrialActive =
              isActive &&
              String(activeSub?.status || "").toLowerCase() === "trialing" &&
              !hasPaidPrice(plan);
            const isFreePlan = !hasPaidPrice(plan);
            const compareEnabled = Boolean(activePlan && !isActive);
            const priceMonthlyDiff = compareEnabled
              ? Number(planPrice || 0) !== Number(getPlanPrice(activePlan, "monthly", currency) || 0)
              : false;
            const priceYearlyDiff = compareEnabled
              ? Number(planYearly || 0) !== Number(getPlanPrice(activePlan, "yearly", currency) || 0)
              : false;
            const storageDiff = compareEnabled
              ? getStorageLimitGb(plan) !== getStorageLimitGb(activePlan)
              : false;
            const bandwidthDiff = compareEnabled
              ? (getBandwidthLimitGb(plan) !== getBandwidthLimitGb(activePlan) || isBandwidthLimited(plan) !== isBandwidthLimited(activePlan))
              : false;
            const deviceDiff = compareEnabled
              ? getDeviceLimitPerUser(plan) !== getDeviceLimitPerUser(activePlan)
              : false;
            const prorationNote = getProrationNote(plan, cycle, activeSub);
            const taxApplies = currency === taxCurrency && taxRate > 0;
            const baseSelected = Number(getPlanPrice(plan, cycle, currency) || 0);
            const gstAmount = taxApplies ? Math.round(baseSelected * (taxRate / 100) * 100) / 100 : 0;
            const totalAmount = taxApplies
              ? Math.round((baseSelected + gstAmount) * 100) / 100
              : baseSelected;
            return (
              <div className="col-12 col-md-6 col-xl-3" key={plan.id}>
                <div className="card p-3 plan-card h-100">
                  <h4 className="mb-2">{isBusinessAutopilot ? getBusinessAutopilotPlanDisplayName(plan.name) : plan.name}</h4>
                  <p className="price-monthly">
                    Monthly: {formatCurrencyLabel(currency)}{" "}
                    <span className={priceMonthlyDiff ? "highlight-text" : ""}>{planPrice || "-"}</span>
                  </p>
                  <p className="price-yearly">
                    Yearly: {formatCurrencyLabel(currency)}{" "}
                    <span className={priceYearlyDiff ? "highlight-text" : ""}>{planYearly || "-"}</span>
                  </p>
                  {isAiChatbot ? (
                    <>
                      <div className="plan-feature-list">
                        <div className="plan-metric">Website Chat Widgets: {plan.limits?.widgets ?? "-"}</div>
                        <div className="plan-metric">Agents included: {plan.limits?.included_agents ?? "-"}</div>
                        <div className="plan-metric">Conversations/month: {plan.limits?.conversations_per_month ?? "-"}</div>
                        <div className="plan-metric">AI replies/month: {plan.limits?.ai_replies_per_month ?? "-"}</div>
                        <div className="plan-metric">Chat history: {plan.limits?.chat_history_days ?? "-"} days</div>
                        <div className="plan-metric">Max messages/conversation: {plan.limits?.max_messages_per_conversation ?? "-"}</div>
                        <div className="plan-metric">Max chars/message: {plan.limits?.max_chars_per_message ?? "-"}</div>
                        <div className="plan-feature-divider" />
                        <div className="plan-feature">
                          <i className="bi bi-check-circle-fill plan-feature-icon text-success" aria-hidden="true" />
                          <span>Quick enquiry form</span>
                        </div>
                        <div className="plan-feature">
                          <i
                            className={`bi ${plan.allow_addons ? "bi-check-circle-fill text-success" : "bi-x-circle-fill text-danger"} plan-feature-icon`}
                            aria-hidden="true"
                          />
                          <span>Allow Agent Add-Ons</span>
                        </div>
                        <div className="plan-feature">
                          <i
                            className={`bi ${plan.features?.remove_branding ? "bi-check-circle-fill text-success" : "bi-x-circle-fill text-danger"} plan-feature-icon`}
                            aria-hidden="true"
                          />
                          <span>Remove branding</span>
                        </div>
                        <div className="plan-feature">
                          <i
                            className={`bi ${plan.features?.analytics_basic ? "bi-check-circle-fill text-success" : "bi-x-circle-fill text-danger"} plan-feature-icon`}
                            aria-hidden="true"
                          />
                          <span>Analytics (basic)</span>
                        </div>
                        <div className="plan-feature">
                          <i
                            className={`bi ${plan.features?.csv_export ? "bi-check-circle-fill text-success" : "bi-x-circle-fill text-danger"} plan-feature-icon`}
                            aria-hidden="true"
                          />
                          <span>CSV export</span>
                        </div>
                        <div className="plan-feature">
                          <i
                            className={`bi ${plan.features?.agent_inbox ? "bi-check-circle-fill text-success" : "bi-x-circle-fill text-danger"} plan-feature-icon`}
                            aria-hidden="true"
                          />
                          <span>Agent inbox</span>
                        </div>
                      </div>
                    </>
                  ) : isStorage ? (
                    <>
                      <div className="plan-feature-list">
                        <div className="plan-metric">
                          Storage limit:{" "}
                          <span className={storageDiff ? "highlight-text" : ""}>
                            {formatStorageLimit(getStorageLimitGb(plan))}
                          </span>
                        </div>
                        <div className="plan-metric">
                          Bandwidth limit:{" "}
                          <span className={bandwidthDiff ? "highlight-text" : ""}>
                            {formatBandwidthLimit(getBandwidthLimitGb(plan), isBandwidthLimited(plan))}
                          </span>
                        </div>
                        <div className="plan-metric">
                          Device limit:{" "}
                          <span className={deviceDiff ? "highlight-text" : ""}>
                            {formatDeviceLimit(getDeviceLimitPerUser(plan))}
                          </span>
                        </div>
                        <div className="plan-metric">
                          Users allowed: {formatUserLimit(getMaxUsers(plan))}
                        </div>
                        {plan.allow_addons ? (
                          <>
                            <div className="plan-metric">
                              Add-on Monthly: {formatCurrencyLabel(currency)} {addonMonthly || "-"}
                            </div>
                            <div className="plan-metric">
                              Add-on Yearly: {formatCurrencyLabel(currency)} {addonYearly || "-"}
                            </div>
                          </>
                        ) : (
                          <div className="plan-metric">Add-ons disabled</div>
                        )}
                      </div>
                    </>
                  ) : isBusinessAutopilot ? (
                    <>
                      <div className="plan-feature-list">
                        <div className="plan-metric">
                          Base platform ({currency}): {formatCurrencyLabel(currency)}{" "}
                          {getPlanPrice(plan, cycle, currency) || "-"} / {cycle === "yearly" ? "year" : "month"}
                        </div>
                        <div className="plan-metric">
                          Per user ({currency}): {formatCurrencyLabel(currency)}{" "}
                          {getErpPerUserPrice(plan, cycle, currency) || "-"} / {cycle === "yearly" ? "year" : "month"}
                        </div>
                        <div className="plan-metric">
                          Employees allowed: {plan.employee_limit === 0 ? "Unlimited" : plan.employee_limit}
                        </div>
                        {plan.allow_addons ? (
                          <>
                            <div className="plan-metric">
                              Add-on Monthly: {formatCurrencyLabel(currency)} {addonMonthly || "-"}
                            </div>
                            <div className="plan-metric">
                              Add-on Yearly: {formatCurrencyLabel(currency)} {addonYearly || "-"}
                            </div>
                          </>
                        ) : (
                          <div className="plan-metric">Add-ons disabled</div>
                        )}
                        <div className="plan-feature-divider" />
                        {getErpPlanFeatures(plan).map((feature) => (
                          <div className="plan-feature" key={`${plan.id}-${feature}`}>
                            <i className="bi bi-check-circle-fill plan-feature-icon text-success" aria-hidden="true" />
                            <span>{feature}</span>
                          </div>
                        ))}
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="plan-feature-list">
                        <div className="plan-metric">
                          Employees allowed: {plan.employee_limit === 0 ? "Unlimited" : plan.employee_limit}
                        </div>
                        {plan.allow_addons ? (
                          <>
                            <div className="plan-metric">
                              Add-on Monthly: {formatCurrencyLabel(currency)} {addonMonthly || "-"}
                            </div>
                            <div className="plan-metric">
                              Add-on Yearly: {formatCurrencyLabel(currency)} {addonYearly || "-"}
                            </div>
                          </>
                        ) : (
                          <div className="plan-metric">Add-ons disabled</div>
                        )}
                        <div className="plan-feature-divider" />
                        <div className="plan-feature">
                          <i
                            className={`bi ${plan.allow_app_usage ? "bi-check-circle-fill text-success" : "bi-x-circle-fill text-danger"} plan-feature-icon`}
                            aria-hidden="true"
                          />
                          <span>App usage tracking</span>
                        </div>
                        <div className="plan-feature">
                          <i
                            className={`bi ${plan.allow_gaming_ott_usage ? "bi-check-circle-fill text-success" : "bi-x-circle-fill text-danger"} plan-feature-icon`}
                            aria-hidden="true"
                          />
                          <span>OTT/Gaming usage</span>
                        </div>
                        <div className="plan-feature">
                          <i
                            className={`bi ${plan.allow_hr_view ? "bi-check-circle-fill text-success" : "bi-x-circle-fill text-danger"} plan-feature-icon`}
                            aria-hidden="true"
                          />
                          <span>HR view</span>
                        </div>
                      </div>
                    </>
                  )}

                  {isActive ? (
                    <>
                      <div className="mt-2">
                        <label className="form-label">Billing Cycle</label>
                        <div className="text-secondary">
                          {cycle === "yearly" ? "Yearly" : "Monthly"}
                        </div>
                      </div>
                      {!isAiChatbot && !isStorage && !isBusinessAutopilot ? (
                        <div className="mt-2">
                          <label className="form-label">Screenshot Storage History</label>
                          <div className="retention-text">
                            Screenshot Retention:{" "}
                            <span className="highlight-text">{plan.retention_days} Days</span>
                          </div>
                        </div>
                      ) : null}
                      {taxApplies && baseSelected ? (
                        <div className="mt-2">
                          <div className="text-secondary">
                            GST ({taxRate}%): {formatCurrencyLabel(currency)} {gstAmount}
                          </div>
                          <div className="fw-semibold">
                            Total: {formatCurrencyLabel(currency)} {totalAmount}
                          </div>
                        </div>
                      ) : null}
                      <button
                        type="button"
                        className="btn btn-success btn-sm mt-2"
                        disabled={isTrialActive}
                      >
                        {isTrialActive ? "Activated" : "Active"}
                      </button>
                      {isTrialActive ? (
                        <div className="text-success small mt-2">Free trial active.</div>
                      ) : null}
                    </>
                  ) : (
                    <>
                      <div className="mt-2">
                        <label className="form-label">Billing Cycle</label>
                        {hasPaidPrice(plan) ? (
                          <select
                            className="form-select form-select-sm"
                            value={cycle}
                            onChange={(event) =>
                              setBillingCycles((prev) => ({
                                ...prev,
                                [plan.id]: event.target.value
                              }))
                            }
                          >
                            <option value="monthly">Monthly</option>
                            <option value="yearly">Yearly</option>
                          </select>
                        ) : (
                          <>
                            <div className="text-secondary">Monthly (1 month)</div>
                            <input type="hidden" value="monthly" />
                          </>
                        )}
                      </div>
                      {!isAiChatbot && !isStorage && !isBusinessAutopilot ? (
                        <div className="mt-2">
                          <label className="form-label">Screenshot Storage History</label>
                          <div className="retention-text">
                            Screenshot Retention:{" "}
                            <span className="highlight-text">{plan.retention_days} Days</span>
                          </div>
                        </div>
                      ) : null}
                      <button
                        type="button"
                        className={`btn ${hasPaidPrice(plan) ? "btn-primary" : "btn-outline-light"} btn-sm mt-2`}
                        onClick={() => handleSubscribe(plan)}
                        disabled={isFreePlan ? !freeEligible : false}
                      >
                        {hasPaidPrice(plan)
                          ? "Proceed to Bank Transfer"
                          : freeEligible
                          ? "Activate"
                          : "Free Trial Used"}
                      </button>
                      {isFreePlan && !freeEligible ? (
                        <div className="text-warning small mt-2">
                          Free trial is only available once. Please choose a paid plan.
                        </div>
                      ) : null}
                      {taxApplies && baseSelected ? (
                        <div className="mt-2">
                          <div className="text-secondary">
                            GST ({taxRate}%): {formatCurrencyLabel(currency)} {gstAmount}
                          </div>
                          <div className="fw-semibold">
                            Total: {formatCurrencyLabel(currency)} {totalAmount}
                          </div>
                        </div>
                      ) : null}
                      {prorationNote ? (
                        <small className="text-secondary d-block mt-2 proration-note">
                          {prorationNote}
                        </small>
                      ) : (
                        <small className="text-secondary d-block mt-2 proration-note" />
                      )}
                    </>
                  )}
                </div>
              </div>
            );
          })
        ) : (
          <div className="col-12">
            <p>No plans available.</p>
          </div>
        )}
      </div>

      {addonModal.open && modalPlan ? (
        <div className="modal-overlay" onClick={closeAddonModal}>
          <div className="modal-panel" onClick={(event) => event.stopPropagation()}>
            <h5>Update User Count</h5>
            <div className="text-secondary mb-2">
              Plan: {modalPlan.name} ({titleCase(modalCycle)})
            </div>
            <div className="mb-2">
              <strong>Base Employees User Limit:</strong> {modalBaseEmployees}
            </div>
            <div className="mb-2">
              <strong>Current Existing Users:</strong> {modalExistingBase} + {modalExistingAddons} Addons
            </div>
            {modalPlan.allow_addons ? (
              <div className="mb-3">
                <label className="form-label">Additional Users (Add-ons)</label>
                <div className="d-flex align-items-center gap-2">
                  <button
                    type="button"
                    className="btn btn-outline-light btn-sm"
                    onClick={() => adjustAddonCount(-1)}
                    disabled={modalAddonCount <= 0}
                  >
                    -
                  </button>
                  <input
                    type="number"
                    min="0"
                    className="form-control form-control-sm"
                    style={{ maxWidth: "120px" }}
                    value={modalAddonCount}
                    onChange={handleAddonCountChange}
                  />
                  <button
                    type="button"
                    className="btn btn-outline-light btn-sm"
                    onClick={() => adjustAddonCount(1)}
                  >
                    +
                  </button>
                </div>
                <div className="text-secondary mt-2">
                  Add-on price: {formatCurrencyLabel(currency)} {modalAddonPrice || "-"}
                </div>
              </div>
            ) : (
              <p className="text-warning mb-3">Add-ons disabled for this plan.</p>
            )}
            <div className="mb-2">
              <strong>Total Employees:</strong> {modalTotalEmployees}
            </div>
            <div className="mb-3">
              <div className="text-secondary">
                Base: {formatCurrencyLabel(currency)} {modalBasePrice || "-"}
              </div>
              {modalPlan.allow_addons ? (
                <div className="text-secondary">
                  Add-ons: {formatCurrencyLabel(currency)} {modalAddonSubtotal || 0}
                </div>
              ) : null}
              {modalTaxApplies ? (
                <div className="text-secondary">
                  GST ({taxRate}%): {formatCurrencyLabel(currency)} {modalTaxAmount || 0}
                </div>
              ) : null}
              <div className="fw-semibold">
                Total: {formatCurrencyLabel(currency)} {modalTotal || 0}
              </div>
            </div>
            <div className="d-flex justify-content-end gap-2">
              <button type="button" className="btn btn-secondary" onClick={closeAddonModal}>
                Cancel
              </button>
              <button type="button" className="btn btn-primary" onClick={confirmAddonModal}>
                Continue
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
