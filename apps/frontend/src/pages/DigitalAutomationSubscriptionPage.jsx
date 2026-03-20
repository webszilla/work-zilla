import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "../lib/api.js";

const SUBSCRIPTION_STATUS_OPTIONS = ["Active", "Expired", "Cancelled"];
const SUBSCRIPTION_LIST_STATUS_TABS = [
  { key: "all", label: "All" },
  { key: "active", label: "Active" },
  { key: "expired", label: "Expired" },
  { key: "cancelled", label: "Cancelled" },
];
const SUBSCRIPTION_DUE_TABS = [
  { key: "30", label: "30 Days" },
  { key: "15", label: "15 Days" },
  { key: "7", label: "7 Days" },
];
const PLAN_DURATION_OPTIONS = [
  { value: "30", label: "1 Month" },
  { value: "90", label: "3 Months" },
  { value: "180", label: "6 Months" },
  { value: "365", label: "1 Year" },
  { value: "custom", label: "Custom" },
];
const ALERT_DAY_OPTIONS = [0, 1, 3, 5, 7, 10, 15, 30];

function formatAlertDayLabel(value) {
  const day = Number.parseInt(String(value || "0"), 10);
  if (!Number.isFinite(day) || day < 0) return String(value || "");
  if (day === 0) return "Same day";
  if (day === 1) return "One Day Before";
  return `${day} Days Before`;
}

function normalizeStatus(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (raw === "expired") return "Expired";
  if (raw === "cancelled" || raw === "canceled") return "Cancelled";
  return "Active";
}

function normalizeAssignees(value) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  const normalized = [];
  value.forEach((item) => {
    if (!item || typeof item !== "object") return;
    const type = String(item.type || "").trim().toLowerCase();
    const rawValue = String(item.value || "").trim();
    if (!type || !rawValue) return;
    const key = `${type}:${rawValue.toLowerCase()}`;
    if (seen.has(key)) return;
    seen.add(key);
    normalized.push({
      type,
      value: rawValue,
      label: String(item.label || rawValue).trim() || rawValue,
    });
  });
  return normalized;
}

function normalizeAlertDays(value) {
  if (!Array.isArray(value)) return [];
  const next = [];
  const seen = new Set();
  value.forEach((item) => {
    const num = Number.parseInt(String(item), 10);
    if (!Number.isFinite(num) || num < 0) return;
    const text = String(num);
    if (seen.has(text)) return;
    seen.add(text);
    next.push(text);
  });
  return next;
}

function isValidEmail(value) {
  const text = String(value || "").trim().toLowerCase();
  if (!text || !text.includes("@")) return false;
  const [local, domain] = text.split("@");
  if (!local || !domain || !domain.includes(".")) return false;
  return true;
}

function parseExtraEmails(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

function emptyCategoryForm() {
  return { id: "", name: "", description: "" };
}

function emptySubCategoryForm(categoryId = "") {
  return { id: "", categoryId, name: "", description: "" };
}

function emptySubscriptionForm(defaults = {}) {
  return {
    id: "",
    subscriptionTitle: "",
    categoryId: defaults.categoryId || "",
    subCategoryId: defaults.subCategoryId || "",
    customerId: "",
    customerName: "",
    planDuration: "30",
    planDurationDays: "30",
    paymentDescription: "",
    amount: "0",
    currency: "INR",
    startDate: "",
    endDate: "",
    status: "Active",
    emailAlertDays: [],
    whatsappAlertDays: [],
    alertAssignTo: [],
  };
}

function formatAssigneeLabel(row) {
  const type = String(row?.type || "").trim().toLowerCase();
  const label = String(row?.label || row?.value || "").trim();
  if (!label) return "";
  if (type === "department") return `Department: ${label}`;
  if (type === "email") return `Email: ${label}`;
  return `User: ${label}`;
}

export default function DigitalAutomationSubscriptionPage({ subscriptions = [] }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const [categories, setCategories] = useState([]);
  const [subCategories, setSubCategories] = useState([]);
  const [rows, setRows] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [users, setUsers] = useState([]);
  const [departments, setDepartments] = useState([]);

  const [categoryForm, setCategoryForm] = useState(emptyCategoryForm());
  const [subCategoryForm, setSubCategoryForm] = useState(emptySubCategoryForm(""));
  const [form, setForm] = useState(emptySubscriptionForm({}));

  const [savingCategory, setSavingCategory] = useState(false);
  const [savingSubCategory, setSavingSubCategory] = useState(false);
  const [savingSubscription, setSavingSubscription] = useState(false);

  const [categorySearch, setCategorySearch] = useState("");
  const [subCategorySearch, setSubCategorySearch] = useState("");
  const [subscriptionSearch, setSubscriptionSearch] = useState("");
  const [statusTab, setStatusTab] = useState("all");
  const [dueWindowTab, setDueWindowTab] = useState("all");
  const [subscriptionEmailAlertSearch, setSubscriptionEmailAlertSearch] = useState("");
  const [subscriptionWhatsappAlertSearch, setSubscriptionWhatsappAlertSearch] = useState("");
  const [subscriptionAssignSearch, setSubscriptionAssignSearch] = useState("");
  const [subscriptionEmailAlertOpen, setSubscriptionEmailAlertOpen] = useState(false);
  const [subscriptionWhatsappAlertOpen, setSubscriptionWhatsappAlertOpen] = useState(false);
  const [subscriptionAssignOpen, setSubscriptionAssignOpen] = useState(false);
  const [extraEmailsInput, setExtraEmailsInput] = useState("");
  const [viewRow, setViewRow] = useState(null);

  const digitalSubscription = useMemo(() => {
    const now = Date.now();
    return (subscriptions || []).find((sub) => {
      const key = String(sub?.product_slug || "").trim().toLowerCase();
      if (key !== "digital-automation") return false;
      const status = String(sub?.status || "").trim().toLowerCase();
      if (status === "active") return true;
      if (status !== "trialing") return false;
      if (!sub?.trial_end) return true;
      const end = Date.parse(sub.trial_end);
      return Number.isNaN(end) || end >= now;
    }) || null;
  }, [subscriptions]);

  const hasWhmPlanAccess = useMemo(() => {
    const plan = String(digitalSubscription?.plan_name || "").toLowerCase();
    return plan.includes("agency");
  }, [digitalSubscription]);

  const subscriptionStatusTabCounts = useMemo(() => {
    const counts = { all: rows.length, active: 0, expired: 0, cancelled: 0 };
    rows.forEach((row) => {
      const key = String(row?.status || "").trim().toLowerCase();
      if (Object.prototype.hasOwnProperty.call(counts, key)) {
        counts[key] += 1;
      }
    });
    return counts;
  }, [rows]);

  const categoryById = useMemo(() => {
    const map = new Map();
    categories.forEach((row) => map.set(String(row.id), row));
    return map;
  }, [categories]);

  const customerById = useMemo(() => {
    const map = new Map();
    customers.forEach((row) => map.set(String(row.id), row));
    return map;
  }, [customers]);

  const filteredSubCategoryOptions = useMemo(() => {
    const selectedCategoryId = String(form.categoryId || "").trim();
    if (!selectedCategoryId) return subCategories;
    return subCategories.filter((row) => String(row?.categoryId || "").trim() === selectedCategoryId);
  }, [form.categoryId, subCategories]);

  const filteredCategories = useMemo(() => {
    const term = String(categorySearch || "").trim().toLowerCase();
    if (!term) return categories;
    return categories.filter((row) => `${row?.name || ""} ${row?.description || ""}`.toLowerCase().includes(term));
  }, [categorySearch, categories]);

  const filteredSubCategories = useMemo(() => {
    const term = String(subCategorySearch || "").trim().toLowerCase();
    if (!term) return subCategories;
    return subCategories.filter((row) => `${row?.categoryName || ""} ${row?.name || ""} ${row?.description || ""}`.toLowerCase().includes(term));
  }, [subCategorySearch, subCategories]);

  const filteredRows = useMemo(() => {
    const term = String(subscriptionSearch || "").trim().toLowerCase();
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const dueDaysLimit = Number.parseInt(String(dueWindowTab || "all"), 10);
    return rows.filter((row) => {
      const rowStatus = String(row?.status || "").trim().toLowerCase();
      if (statusTab !== "all" && rowStatus !== statusTab) return false;
      if (dueWindowTab !== "all") {
        const endRaw = String(row?.endDate || row?.nextBillingDate || "").trim();
        if (!endRaw) return false;
        const dueDate = new Date(endRaw);
        if (Number.isNaN(dueDate.getTime())) return false;
        const diffMs = dueDate.getTime() - startOfToday.getTime();
        const diffDays = Math.floor(diffMs / 86400000);
        if (diffDays < 0 || diffDays > dueDaysLimit) return false;
      }
      if (!term) return true;
      return [
        row?.subscriptionTitle,
        row?.customerName,
        row?.categoryName,
        row?.subCategoryName,
        row?.amount,
        row?.currency,
        row?.paymentDescription,
      ].some((value) => String(value || "").toLowerCase().includes(term));
    });
  }, [rows, statusTab, dueWindowTab, subscriptionSearch]);

  const subscriptionDueTabCounts = useMemo(() => {
    const counts = { all: rows.length, "30": 0, "15": 0, "7": 0 };
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    rows.forEach((row) => {
      const endRaw = String(row?.endDate || row?.nextBillingDate || "").trim();
      if (!endRaw) return;
      const dueDate = new Date(endRaw);
      if (Number.isNaN(dueDate.getTime())) return;
      const diffDays = Math.floor((dueDate.getTime() - startOfToday.getTime()) / 86400000);
      if (diffDays < 0) return;
      if (diffDays <= 30) counts["30"] += 1;
      if (diffDays <= 15) counts["15"] += 1;
      if (diffDays <= 7) counts["7"] += 1;
    });
    return counts;
  }, [rows]);

  const assigneeOptions = useMemo(() => {
    const departmentRows = (departments || []).map((row) => ({
      type: "department",
      value: String(row?.name || "").trim(),
      label: String(row?.name || "").trim(),
    })).filter((row) => row.value);

    const userRows = (users || []).map((row) => {
      const userId = String(row?.user_id || row?.id || "").trim();
      const userLabel = String(row?.name || row?.email || row?.username || "").trim();
      return {
        type: "user",
        value: userId,
        label: userLabel || userId,
      };
    }).filter((row) => row.value);

    return [...departmentRows, ...userRows];
  }, [departments, users]);

  const filteredEmailAlertOptions = useMemo(() => {
    const term = String(subscriptionEmailAlertSearch || "").trim().toLowerCase();
    const options = ALERT_DAY_OPTIONS.map((day) => ({ value: String(day), label: formatAlertDayLabel(day) }));
    if (!term) return options;
    return options.filter((entry) => entry.label.toLowerCase().includes(term));
  }, [subscriptionEmailAlertSearch]);

  const filteredWhatsappAlertOptions = useMemo(() => {
    const term = String(subscriptionWhatsappAlertSearch || "").trim().toLowerCase();
    const options = ALERT_DAY_OPTIONS.map((day) => ({ value: String(day), label: formatAlertDayLabel(day) }));
    if (!term) return options;
    return options.filter((entry) => entry.label.toLowerCase().includes(term));
  }, [subscriptionWhatsappAlertSearch]);

  const filteredAssigneeOptions = useMemo(() => {
    const term = String(subscriptionAssignSearch || "").trim().toLowerCase();
    if (!term) return assigneeOptions;
    return assigneeOptions.filter((entry) => formatAssigneeLabel(entry).toLowerCase().includes(term));
  }, [subscriptionAssignSearch, assigneeOptions]);

  async function loadAll() {
    setLoading(true);
    setError("");
    try {
      const [
        categoryResult,
        subCategoryResult,
        subscriptionResult,
        usersResult,
      ] = await Promise.allSettled([
        apiFetch("/api/business-autopilot/accounts/subscription-categories"),
        apiFetch("/api/business-autopilot/accounts/sub-categories"),
        apiFetch("/api/business-autopilot/accounts/subscriptions"),
        apiFetch("/api/business-autopilot/users"),
      ]);
      const categoryResponse = categoryResult.status === "fulfilled" ? categoryResult.value : {};
      const subCategoryResponse = subCategoryResult.status === "fulfilled" ? subCategoryResult.value : {};
      const subscriptionResponse = subscriptionResult.status === "fulfilled" ? subscriptionResult.value : {};
      const usersResponse = usersResult.status === "fulfilled" ? usersResult.value : {};

      if (subscriptionResult.status !== "fulfilled") {
        throw subscriptionResult.reason;
      }

      const nextCategories = Array.isArray(categoryResponse?.categories)
        ? categoryResponse.categories
        : Array.isArray(subscriptionResponse?.categoryOptions)
          ? subscriptionResponse.categoryOptions
          : [];

      const nextSubCategories = Array.isArray(subCategoryResponse?.subCategories)
        ? subCategoryResponse.subCategories
        : Array.isArray(subscriptionResponse?.subCategoryOptions)
          ? subscriptionResponse.subCategoryOptions
          : [];

      setCategories(nextCategories);
      setSubCategories(nextSubCategories);
      setRows(Array.isArray(subscriptionResponse?.subscriptions) ? subscriptionResponse.subscriptions : []);
      setCustomers(Array.isArray(subscriptionResponse?.customerOptions) ? subscriptionResponse.customerOptions : []);
      setUsers(Array.isArray(usersResponse?.users) ? usersResponse.users : []);
      setDepartments(Array.isArray(usersResponse?.departments) ? usersResponse.departments : []);

      if (!form.categoryId && nextCategories.length) {
        setForm((prev) => ({ ...prev, categoryId: String(nextCategories[0]?.id || "") }));
      }
      if (!subCategoryForm.categoryId && nextCategories.length) {
        setSubCategoryForm((prev) => ({ ...prev, categoryId: String(nextCategories[0]?.id || "") }));
      }
    } catch (loadError) {
      setError(loadError?.message || "Unable to load subscription data.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAll();
  }, []);

  function resolvePlanDurationDays(nextForm = form) {
    if (String(nextForm.planDuration) === "custom") {
      return String(nextForm.planDurationDays || "").trim();
    }
    return String(nextForm.planDuration || "").trim();
  }

  function resetSubscriptionForm(defaults = {}) {
    setForm(emptySubscriptionForm(defaults));
  }

  function resetCategoryForm() {
    setCategoryForm(emptyCategoryForm());
  }

  function resetSubCategoryForm() {
    setSubCategoryForm(emptySubCategoryForm(form.categoryId || ""));
  }

  function setFormField(key, value) {
    setForm((prev) => {
      const next = { ...prev, [key]: value };
      if (key === "categoryId") {
        next.subCategoryId = "";
      }
      if (key === "planDuration" && String(value) !== "custom") {
        next.planDurationDays = String(value || "");
      }
      return next;
    });
  }

  function toggleAlertDay(fieldName, dayValue) {
    const text = String(dayValue);
    setForm((prev) => {
      const existing = normalizeAlertDays(prev[fieldName]);
      const has = existing.includes(text);
      const next = has ? existing.filter((item) => item !== text) : [...existing, text];
      return { ...prev, [fieldName]: next };
    });
  }

  function toggleAlertAssignee(entry) {
    const entryType = String(entry?.type || "").trim().toLowerCase();
    const entryValue = String(entry?.value || "").trim();
    if (!entryType || !entryValue) return;
    const key = `${entryType}:${entryValue.toLowerCase()}`;
    setForm((prev) => {
      const current = normalizeAssignees(prev.alertAssignTo);
      const has = current.some((item) => `${item.type}:${String(item.value).toLowerCase()}` === key);
      const next = has
        ? current.filter((item) => `${item.type}:${String(item.value).toLowerCase()}` !== key)
        : [...current, { type: entryType, value: entryValue, label: String(entry?.label || entryValue).trim() || entryValue }];
      return { ...prev, alertAssignTo: next };
    });
  }

  function addExtraEmailAssignees() {
    const emails = parseExtraEmails(extraEmailsInput);
    if (!emails.length) {
      setError("Enter one or more emails. Example: info@demo.com, support@demo.com");
      return;
    }
    const invalid = emails.filter((email) => !isValidEmail(email));
    if (invalid.length) {
      setError(`Invalid email(s): ${invalid.join(", ")}`);
      return;
    }
    setError("");
    setForm((prev) => {
      const current = normalizeAssignees(prev.alertAssignTo);
      const seen = new Set(current.map((item) => `${item.type}:${String(item.value).toLowerCase()}`));
      const next = [...current];
      emails.forEach((email) => {
        const key = `email:${email}`;
        if (seen.has(key)) return;
        seen.add(key);
        next.push({ type: "email", value: email, label: email });
      });
      return { ...prev, alertAssignTo: next };
    });
    setExtraEmailsInput("");
  }

  async function saveCategory(event) {
    event.preventDefault();
    const name = String(categoryForm.name || "").trim();
    if (!name) {
      setError("Category name is required.");
      return;
    }

    setSavingCategory(true);
    setError("");
    setNotice("");
    try {
      const payload = {
        name,
        description: String(categoryForm.description || "").trim(),
      };
      if (categoryForm.id) {
        await apiFetch(`/api/business-autopilot/accounts/subscription-categories/${categoryForm.id}`, {
          method: "PUT",
          body: JSON.stringify(payload),
        });
        setNotice("Category updated.");
      } else {
        await apiFetch("/api/business-autopilot/accounts/subscription-categories", {
          method: "POST",
          body: JSON.stringify(payload),
        });
        setNotice("Category created.");
      }
      resetCategoryForm();
      await loadAll();
    } catch (saveError) {
      setError(saveError?.message || "Unable to save category.");
    } finally {
      setSavingCategory(false);
    }
  }

  async function deleteCategory(id) {
    if (!id || !window.confirm("Delete this category?")) return;
    setError("");
    setNotice("");
    try {
      await apiFetch(`/api/business-autopilot/accounts/subscription-categories/${id}`, { method: "DELETE" });
      setNotice("Category deleted.");
      if (String(categoryForm.id) === String(id)) {
        resetCategoryForm();
      }
      await loadAll();
    } catch (deleteError) {
      setError(deleteError?.message || "Unable to delete category.");
    }
  }

  function editCategory(row) {
    setCategoryForm({
      id: String(row?.id || ""),
      name: String(row?.name || ""),
      description: String(row?.description || ""),
    });
  }

  async function saveSubCategory(event) {
    event.preventDefault();
    const name = String(subCategoryForm.name || "").trim();
    const categoryId = String(subCategoryForm.categoryId || "").trim();
    if (!categoryId) {
      setError("Category is required for sub category.");
      return;
    }
    if (!name) {
      setError("Sub category name is required.");
      return;
    }

    setSavingSubCategory(true);
    setError("");
    setNotice("");
    try {
      const payload = {
        categoryId,
        name,
        description: String(subCategoryForm.description || "").trim(),
      };
      if (subCategoryForm.id) {
        await apiFetch(`/api/business-autopilot/accounts/sub-categories/${subCategoryForm.id}`, {
          method: "PUT",
          body: JSON.stringify(payload),
        });
        setNotice("Sub category updated.");
      } else {
        await apiFetch("/api/business-autopilot/accounts/sub-categories", {
          method: "POST",
          body: JSON.stringify(payload),
        });
        setNotice("Sub category created.");
      }
      resetSubCategoryForm();
      await loadAll();
    } catch (saveError) {
      setError(saveError?.message || "Unable to save sub category.");
    } finally {
      setSavingSubCategory(false);
    }
  }

  async function deleteSubCategory(id) {
    if (!id || !window.confirm("Delete this sub category?")) return;
    setError("");
    setNotice("");
    try {
      await apiFetch(`/api/business-autopilot/accounts/sub-categories/${id}`, { method: "DELETE" });
      setNotice("Sub category deleted.");
      if (String(subCategoryForm.id) === String(id)) {
        resetSubCategoryForm();
      }
      await loadAll();
    } catch (deleteError) {
      setError(deleteError?.message || "Unable to delete sub category.");
    }
  }

  function editSubCategory(row) {
    setSubCategoryForm({
      id: String(row?.id || ""),
      categoryId: String(row?.categoryId || ""),
      name: String(row?.name || ""),
      description: String(row?.description || ""),
    });
  }

  function applyCustomerNameSelection(nameValue) {
    const typed = String(nameValue || "").trim();
    const matched = customers.find(
      (row) => String(row?.name || "").trim().toLowerCase() === typed.toLowerCase()
    );
    setForm((prev) => ({
      ...prev,
      customerName: typed,
      customerId: matched ? String(matched.id) : "",
    }));
  }

  async function saveSubscription(event) {
    event.preventDefault();
    setSavingSubscription(true);
    setError("");
    setNotice("");

    try {
      const payload = {
        subscriptionTitle: String(form.subscriptionTitle || "").trim(),
        categoryId: String(form.categoryId || "").trim(),
        subCategoryId: String(form.subCategoryId || "").trim(),
        customerId: String(form.customerId || "").trim(),
        planDurationDays: resolvePlanDurationDays(form),
        paymentDescription: String(form.paymentDescription || "").trim(),
        amount: String(form.amount || "0").trim(),
        currency: String(form.currency || "INR").trim().toUpperCase() || "INR",
        startDate: String(form.startDate || "").trim(),
        endDate: String(form.endDate || "").trim(),
        status: normalizeStatus(form.status),
        emailAlertDays: normalizeAlertDays(form.emailAlertDays),
        whatsappAlertDays: normalizeAlertDays(form.whatsappAlertDays),
        emailAlertAssignTo: normalizeAssignees(form.alertAssignTo),
        whatsappAlertAssignTo: normalizeAssignees(form.alertAssignTo),
      };

      if (!payload.subscriptionTitle || !payload.categoryId || !payload.subCategoryId || !payload.startDate) {
        setError("Subscription title, category, sub category, and start date are required.");
        setSavingSubscription(false);
        return;
      }
      if (!payload.customerId) {
        setError("Please select a valid customer from the customer list.");
        setSavingSubscription(false);
        return;
      }
      if (!/^\d+$/.test(payload.planDurationDays) || Number(payload.planDurationDays) < 1) {
        setError("Plan duration days must be a valid positive number.");
        setSavingSubscription(false);
        return;
      }

      if (form.id) {
        await apiFetch(`/api/business-autopilot/accounts/subscriptions/${form.id}`, {
          method: "PUT",
          body: JSON.stringify(payload),
        });
        setNotice("Subscription updated.");
      } else {
        await apiFetch("/api/business-autopilot/accounts/subscriptions", {
          method: "POST",
          body: JSON.stringify(payload),
        });
        setNotice("Subscription created.");
      }

      resetSubscriptionForm({ categoryId: payload.categoryId, subCategoryId: payload.subCategoryId });
      await loadAll();
    } catch (saveError) {
      setError(saveError?.message || "Unable to save subscription.");
    } finally {
      setSavingSubscription(false);
    }
  }

  async function deleteSubscription(id) {
    if (!id || !window.confirm("Delete this subscription?")) return;
    setError("");
    setNotice("");
    try {
      await apiFetch(`/api/business-autopilot/accounts/subscriptions/${id}`, { method: "DELETE" });
      setNotice("Subscription deleted.");
      if (String(form.id) === String(id)) {
        resetSubscriptionForm({ categoryId: form.categoryId, subCategoryId: form.subCategoryId });
      }
      await loadAll();
    } catch (deleteError) {
      setError(deleteError?.message || "Unable to delete subscription.");
    }
  }

  function editSubscription(row) {
    const customerName = row?.customerName || customerById.get(String(row?.customerId || ""))?.name || "";
    const days = String(row?.planDurationDays || "").trim();
    const planDuration = PLAN_DURATION_OPTIONS.some((option) => option.value === days) ? days : "custom";
    const combinedAssignees = normalizeAssignees(
      (Array.isArray(row?.emailAlertAssignTo) ? row.emailAlertAssignTo : []).concat(
        Array.isArray(row?.whatsappAlertAssignTo) ? row.whatsappAlertAssignTo : []
      )
    );
    setForm({
      id: String(row?.id || ""),
      subscriptionTitle: String(row?.subscriptionTitle || ""),
      categoryId: String(row?.categoryId || ""),
      subCategoryId: String(row?.subCategoryId || ""),
      customerId: String(row?.customerId || ""),
      customerName,
      planDuration,
      planDurationDays: days || "30",
      paymentDescription: String(row?.paymentDescription || ""),
      amount: String(row?.amount || "0"),
      currency: String(row?.currency || "INR"),
      startDate: String(row?.startDate || ""),
      endDate: String(row?.endDate || ""),
      status: normalizeStatus(row?.status),
      emailAlertDays: normalizeAlertDays(row?.emailAlertDays),
      whatsappAlertDays: normalizeAlertDays(row?.whatsappAlertDays),
      alertAssignTo: combinedAssignees,
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return (
    <div className="d-flex flex-column gap-3">
      <div className="card p-3">
        <div className="d-flex flex-wrap align-items-center justify-content-between gap-2">
          <div>
            <h4 className="mb-1">Subscription Management</h4>
            <p className="text-secondary mb-0">
              Full Accounts subscription workflow for creating service plans like hosting, domain, and any custom service.
            </p>
          </div>
          <a className="btn btn-outline-light btn-sm" href="/my-account/billing/renew/start/?product=digital-automation">
            Renew Digital Automation
          </a>
        </div>
        {!hasWhmPlanAccess ? (
          <div className="alert alert-warning mt-3 mb-0">
            WHM full automation access is available on the Agency plan. You can still manage general subscription records.
          </div>
        ) : null}
      </div>

      {error ? <div className="alert alert-danger mb-0">{error}</div> : null}
      {notice ? <div className="alert alert-success mb-0">{notice}</div> : null}

      <div className="row g-3">
        <div className="col-12 col-xl-6">
          <div className="card p-3 h-100">
            <h6 className="mb-3">{categoryForm.id ? "Edit Category" : "Create Category"}</h6>
            <form className="d-flex flex-column gap-3" onSubmit={saveCategory}>
              <div>
                <label className="form-label">Category Name</label>
                <input
                  className="form-control"
                  value={categoryForm.name}
                  onChange={(event) => setCategoryForm((prev) => ({ ...prev, name: event.target.value }))}
                  placeholder="Cloud Hosting"
                />
              </div>
              <div>
                <label className="form-label">Description</label>
                <textarea
                  className="form-control"
                  rows={3}
                  value={categoryForm.description}
                  onChange={(event) => setCategoryForm((prev) => ({ ...prev, description: event.target.value }))}
                />
              </div>
              <div className="d-flex gap-2">
                <button className="btn btn-primary btn-sm" type="submit" disabled={savingCategory || loading}>
                  {savingCategory ? "Saving..." : categoryForm.id ? "Update" : "Create"}
                </button>
                {categoryForm.id ? (
                  <button className="btn btn-outline-light btn-sm" type="button" onClick={resetCategoryForm}>
                    Cancel
                  </button>
                ) : null}
              </div>
            </form>
          </div>
        </div>

        <div className="col-12 col-xl-6">
          <div className="card p-3 h-100">
            <h6 className="mb-3">{subCategoryForm.id ? "Edit Sub Category" : "Create Sub Category"}</h6>
            <form className="d-flex flex-column gap-3" onSubmit={saveSubCategory}>
              <div className="row g-3">
                <div className="col-12 col-md-6">
                  <label className="form-label">Category</label>
                  <select
                    className="form-select"
                    value={subCategoryForm.categoryId}
                    onChange={(event) => setSubCategoryForm((prev) => ({ ...prev, categoryId: event.target.value }))}
                  >
                    <option value="">Select Category</option>
                    {categories.map((row) => (
                      <option key={`sub-form-cat-${row.id}`} value={row.id}>{row.name}</option>
                    ))}
                  </select>
                </div>
                <div className="col-12 col-md-6">
                  <label className="form-label">Sub Category Name</label>
                  <input
                    className="form-control"
                    value={subCategoryForm.name}
                    onChange={(event) => setSubCategoryForm((prev) => ({ ...prev, name: event.target.value }))}
                    placeholder="Basic Plan"
                  />
                </div>
                <div className="col-12">
                  <label className="form-label">Description</label>
                  <textarea
                    className="form-control"
                    rows={3}
                    value={subCategoryForm.description}
                    onChange={(event) => setSubCategoryForm((prev) => ({ ...prev, description: event.target.value }))}
                  />
                </div>
              </div>
              <div className="d-flex gap-2">
                <button className="btn btn-primary btn-sm" type="submit" disabled={savingSubCategory || loading}>
                  {savingSubCategory ? "Saving..." : subCategoryForm.id ? "Update" : "Create"}
                </button>
                {subCategoryForm.id ? (
                  <button className="btn btn-outline-light btn-sm" type="button" onClick={resetSubCategoryForm}>
                    Cancel
                  </button>
                ) : null}
              </div>
            </form>
          </div>
        </div>
      </div>

      <div className="row g-3">
        <div className="col-12 col-xl-6">
          <div className="card p-3">
            <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-2">
              <h6 className="mb-0">Subscription Categories</h6>
              <div className="d-flex align-items-center gap-2">
                <span className="badge text-bg-secondary">{filteredCategories.length} items</span>
                <input
                  className="form-control form-control-sm"
                  style={{ minWidth: 210 }}
                  placeholder="Search subscription categories"
                  value={categorySearch}
                  onChange={(event) => setCategorySearch(event.target.value)}
                />
              </div>
            </div>
            <div className="table-responsive">
              <table className="table table-dark table-borderless align-middle mb-0">
                <thead>
                  <tr>
                    <th>Category</th>
                    <th>Description</th>
                    <th className="text-end">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredCategories.length ? filteredCategories.map((row) => (
                    <tr key={`cat-row-${row.id}`}>
                      <td>{row.name || "-"}</td>
                      <td>{row.description || "-"}</td>
                      <td className="text-end">
                        <div className="d-inline-flex gap-2">
                          <button className="btn btn-outline-light btn-sm" type="button" onClick={() => editCategory(row)}>Edit</button>
                          <button className="btn btn-outline-danger btn-sm" type="button" onClick={() => deleteCategory(row.id)}>Delete</button>
                        </div>
                      </td>
                    </tr>
                  )) : (
                    <tr><td colSpan={3} className="text-secondary">No categories yet.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div className="col-12 col-xl-6">
          <div className="card p-3">
            <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-2">
              <h6 className="mb-0">Subscription Sub Categories</h6>
              <div className="d-flex align-items-center gap-2">
                <span className="badge text-bg-secondary">{filteredSubCategories.length} items</span>
                <input
                  className="form-control form-control-sm"
                  style={{ minWidth: 210 }}
                  placeholder="Search subscription sub categories"
                  value={subCategorySearch}
                  onChange={(event) => setSubCategorySearch(event.target.value)}
                />
              </div>
            </div>
            <div className="table-responsive">
              <table className="table table-dark table-borderless align-middle mb-0">
                <thead>
                  <tr>
                    <th>Category</th>
                    <th>Sub Category</th>
                    <th>Description</th>
                    <th className="text-end">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredSubCategories.length ? filteredSubCategories.map((row) => (
                    <tr key={`sub-cat-row-${row.id}`}>
                      <td>{row.categoryName || categoryById.get(String(row.categoryId))?.name || "-"}</td>
                      <td>{row.name || "-"}</td>
                      <td>{row.description || "-"}</td>
                      <td className="text-end">
                        <div className="d-inline-flex gap-2">
                          <button className="btn btn-outline-light btn-sm" type="button" onClick={() => editSubCategory(row)}>Edit</button>
                          <button className="btn btn-outline-danger btn-sm" type="button" onClick={() => deleteSubCategory(row.id)}>Delete</button>
                        </div>
                      </td>
                    </tr>
                  )) : (
                    <tr><td colSpan={4} className="text-secondary">No sub categories yet.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      <form className="card p-3" onSubmit={saveSubscription}>
        <h6 className="mb-3">{form.id ? "Edit Subscription" : "Create Subscription"}</h6>

        <div className="row g-3">
          <div className="col-12 col-md-3">
            <label className="form-label">Subscription Title</label>
            <input
              className="form-control"
              value={form.subscriptionTitle}
              onChange={(event) => setFormField("subscriptionTitle", event.target.value)}
              placeholder="Domain Renewal Plan"
            />
          </div>

          <div className="col-12 col-md-3">
            <label className="form-label">Category</label>
            <select
              className="form-select"
              value={form.categoryId}
              onChange={(event) => setFormField("categoryId", event.target.value)}
            >
              <option value="">Select Category</option>
              {categories.map((row) => (
                <option key={`sub-cat-opt-${row.id}`} value={row.id}>{row.name}</option>
              ))}
            </select>
          </div>

          <div className="col-12 col-md-3">
            <label className="form-label">Sub Category</label>
            <select
              className="form-select"
              value={form.subCategoryId}
              onChange={(event) => setFormField("subCategoryId", event.target.value)}
            >
              <option value="">Select Sub Category</option>
              {filteredSubCategoryOptions.map((row) => (
                <option key={`sub-cat-opt-list-${row.id}`} value={row.id}>{row.name}</option>
              ))}
            </select>
          </div>

          <div className="col-12 col-md-3">
            <label className="form-label">Client</label>
            <input
              className="form-control"
              list="digital-subscription-customers"
              value={form.customerName}
              onChange={(event) => applyCustomerNameSelection(event.target.value)}
              placeholder="Search client"
            />
            <datalist id="digital-subscription-customers">
              {customers.map((row) => (
                <option key={`cust-option-${row.id}`} value={row.name} />
              ))}
            </datalist>
          </div>

          <div className="col-12 col-md-3">
            <label className="form-label">Plan Duration</label>
            <select
              className="form-select"
              value={form.planDuration}
              onChange={(event) => setFormField("planDuration", event.target.value)}
            >
              {PLAN_DURATION_OPTIONS.map((option) => (
                <option key={`duration-opt-${option.value}`} value={option.value}>{option.label}</option>
              ))}
            </select>
            {String(form.planDuration) === "custom" ? (
              <div className="mt-2">
                <label className="form-label">Duration (Days)</label>
                <input
                  type="number"
                  min="1"
                  step="1"
                  className="form-control"
                  value={form.planDurationDays}
                  onChange={(event) => setFormField("planDurationDays", event.target.value)}
                  placeholder="Enter days"
                />
              </div>
            ) : null}
          </div>

          <div className="col-12 col-md-5">
            <label className="form-label">Payment Description</label>
            <input
              className="form-control"
              value={form.paymentDescription}
              onChange={(event) => setFormField("paymentDescription", event.target.value)}
              placeholder="Monthly recurring payment"
            />
          </div>

          <div className="col-12 col-md-2">
            <label className="form-label">Amount</label>
            <input
              className="form-control"
              type="number"
              min="0"
              step="0.01"
              value={form.amount}
              onChange={(event) => setFormField("amount", event.target.value)}
              placeholder="0.00"
            />
          </div>

          <div className="col-12 col-md-2">
            <label className="form-label">Currency</label>
            <input
              className="form-control"
              value={form.currency}
              onChange={(event) => setFormField("currency", event.target.value)}
              placeholder="INR"
            />
          </div>

          <div className="col-12 col-md-3">
            <label className="form-label">Start Date</label>
            <input
              type="date"
              className="form-control"
              value={form.startDate}
              onChange={(event) => setFormField("startDate", event.target.value)}
            />
          </div>

          <div className="col-12 col-md-3">
            <label className="form-label">End Date</label>
            <input
              type="date"
              className="form-control"
              value={form.endDate}
              onChange={(event) => setFormField("endDate", event.target.value)}
            />
          </div>

          <div className="col-12 col-md-3">
            <label className="form-label">Status</label>
            <select
              className="form-select"
              value={form.status}
              onChange={(event) => setFormField("status", event.target.value)}
            >
              {SUBSCRIPTION_STATUS_OPTIONS.map((status) => (
                <option key={`status-opt-${status}`} value={status}>{status}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="d-flex flex-wrap gap-2 mt-3">
          <button className="btn btn-primary btn-sm" type="submit" disabled={savingSubscription || loading}>
            {savingSubscription ? "Saving..." : form.id ? "Update Subscription" : "Create Subscription"}
          </button>
          {form.id ? (
            <button
              className="btn btn-outline-light btn-sm"
              type="button"
              onClick={() => resetSubscriptionForm({ categoryId: form.categoryId, subCategoryId: form.subCategoryId })}
            >
              Cancel Edit
            </button>
          ) : null}
          <button
            className="btn btn-outline-light btn-sm"
            type="button"
            onClick={() => resetSubscriptionForm({ categoryId: form.categoryId, subCategoryId: form.subCategoryId })}
          >
            Reset
          </button>
        </div>
      </form>

      <div className="card p-3">
        <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-2">
          <h6 className="mb-0">Subscription List</h6>
          <div className="d-flex flex-wrap gap-2 align-items-center">
            {SUBSCRIPTION_LIST_STATUS_TABS.map((tab) => (
              <button
                key={`status-tab-${tab.key}`}
                className={`btn btn-sm ${statusTab === tab.key ? "btn-primary" : "btn-outline-light"}`}
                type="button"
                onClick={() => setStatusTab(tab.key)}
              >
                {tab.label} ({subscriptionStatusTabCounts[tab.key] || 0})
              </button>
            ))}
            {SUBSCRIPTION_DUE_TABS.map((tab) => (
              <button
                key={`due-tab-${tab.key}`}
                className={`btn btn-sm ${dueWindowTab === tab.key ? "btn-primary" : "btn-outline-light"}`}
                type="button"
                onClick={() => setDueWindowTab(tab.key)}
              >
                {tab.label} ({subscriptionDueTabCounts[tab.key] || 0})
              </button>
            ))}
            <input
              className="form-control form-control-sm"
              style={{ minWidth: 230 }}
              value={subscriptionSearch}
              onChange={(event) => setSubscriptionSearch(event.target.value)}
              placeholder="Search subscriptions"
            />
          </div>
        </div>

        {loading ? <div className="text-secondary">Loading subscriptions...</div> : null}

        {!loading ? (
          <div className="table-responsive">
            <table className="table table-dark table-borderless align-middle mb-0">
              <thead>
                <tr>
                  <th>Subscription Title</th>
                  <th>Customer</th>
                  <th>Category</th>
                  <th>Amount</th>
                  <th>Status</th>
                  <th>Start</th>
                  <th>End</th>
                  <th className="text-end">Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.length ? filteredRows.map((row) => (
                  <tr key={`subscription-row-${row.id}`}>
                    <td>{row.subscriptionTitle || "-"}</td>
                    <td>{row.customerName || customerById.get(String(row.customerId || ""))?.name || "-"}</td>
                    <td>{`${row.categoryName || "-"} / ${row.subCategoryName || "-"}`}</td>
                    <td>{`${row.currency || "INR"} ${row.amount || "0"}`}</td>
                    <td>{row.status || "-"}</td>
                    <td>{row.startDate || "-"}</td>
                    <td>{row.endDate || "-"}</td>
                    <td className="text-end">
                      <div className="d-inline-flex gap-2">
                        <button className="btn btn-outline-light btn-sm" type="button" onClick={() => setViewRow(row)}>View</button>
                        <button className="btn btn-outline-success btn-sm" type="button" onClick={() => editSubscription(row)}>Edit</button>
                        <button className="btn btn-outline-danger btn-sm" type="button" onClick={() => deleteSubscription(row.id)}>Delete</button>
                      </div>
                    </td>
                  </tr>
                )) : (
                  <tr>
                    <td colSpan={8} className="text-secondary">No subscriptions found.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>

      <div id="subscription-alert-setting" className="card p-3">
        <h6 className="mb-3">Subscription Alert Setting</h6>
        <div className="row g-3">
          <div className="col-12 col-md-4">
            <label className="form-label small text-secondary mb-1">Email Alert</label>
            <div className="crm-inline-suggestions-wrap">
              <input
                type="search"
                className="form-control"
                autoComplete="off"
                placeholder="Search email alert days"
                value={subscriptionEmailAlertSearch}
                onFocus={() => setSubscriptionEmailAlertOpen(true)}
                onClick={() => setSubscriptionEmailAlertOpen(true)}
                onBlur={() => window.setTimeout(() => setSubscriptionEmailAlertOpen(false), 120)}
                onChange={(event) => {
                  setSubscriptionEmailAlertSearch(event.target.value);
                  setSubscriptionEmailAlertOpen(true);
                }}
              />
              {subscriptionEmailAlertOpen ? (
                <div className="crm-inline-suggestions" style={{ maxHeight: "280px", overflowY: "auto" }}>
                  <div className="crm-inline-suggestions__group">
                    <div className="crm-inline-suggestions__title">Email Alert</div>
                    {filteredEmailAlertOptions.length ? filteredEmailAlertOptions.map((option) => {
                      const optionValue = String(option.value);
                      const checked = form.emailAlertDays.includes(optionValue);
                      return (
                        <button
                          key={`subscription-alert-email-${optionValue}`}
                          type="button"
                          className="crm-inline-suggestions__item"
                          onMouseDown={(event) => event.preventDefault()}
                          onClick={() => {
                            toggleAlertDay("emailAlertDays", optionValue);
                            setSubscriptionEmailAlertSearch("");
                          }}
                        >
                          <span className="d-flex align-items-center gap-2">
                            <input type="checkbox" className="form-check-input mt-0" checked={checked} readOnly />
                            <span className="crm-inline-suggestions__item-main">{option.label}</span>
                          </span>
                        </button>
                      );
                    }) : (
                      <div className="crm-inline-suggestions__item">
                        <span className="crm-inline-suggestions__item-main">No alerts found</span>
                      </div>
                    )}
                  </div>
                </div>
              ) : null}
            </div>
            {form.emailAlertDays.length ? (
              <div className="d-flex flex-wrap gap-2 mt-2">
                {form.emailAlertDays.map((value) => (
                  <span
                    key={`selected-email-alert-${value}`}
                    className="badge text-bg-light border d-inline-flex align-items-center gap-2 px-2 py-2"
                  >
                    <button
                      type="button"
                      className="btn btn-sm p-0 border text-secondary bg-transparent rounded-circle d-inline-flex align-items-center justify-content-center"
                      style={{ width: 18, height: 18, lineHeight: 1 }}
                      onClick={() => toggleAlertDay("emailAlertDays", value)}
                    >
                      <i className="bi bi-x-lg" aria-hidden="true" />
                    </button>
                    <span>{formatAlertDayLabel(value)}</span>
                  </span>
                ))}
              </div>
            ) : null}
          </div>

          <div className="col-12 col-md-4">
            <label className="form-label small text-secondary mb-1">Whatsapp Alert</label>
            <div className="crm-inline-suggestions-wrap">
              <input
                type="search"
                className="form-control"
                autoComplete="off"
                placeholder="Search whatsapp alert days"
                value={subscriptionWhatsappAlertSearch}
                onFocus={() => setSubscriptionWhatsappAlertOpen(true)}
                onClick={() => setSubscriptionWhatsappAlertOpen(true)}
                onBlur={() => window.setTimeout(() => setSubscriptionWhatsappAlertOpen(false), 120)}
                onChange={(event) => {
                  setSubscriptionWhatsappAlertSearch(event.target.value);
                  setSubscriptionWhatsappAlertOpen(true);
                }}
              />
              {subscriptionWhatsappAlertOpen ? (
                <div className="crm-inline-suggestions" style={{ maxHeight: "280px", overflowY: "auto" }}>
                  <div className="crm-inline-suggestions__group">
                    <div className="crm-inline-suggestions__title">Whatsapp Alert</div>
                    {filteredWhatsappAlertOptions.length ? filteredWhatsappAlertOptions.map((option) => {
                      const optionValue = String(option.value);
                      const checked = form.whatsappAlertDays.includes(optionValue);
                      return (
                        <button
                          key={`subscription-alert-whatsapp-${optionValue}`}
                          type="button"
                          className="crm-inline-suggestions__item"
                          onMouseDown={(event) => event.preventDefault()}
                          onClick={() => {
                            toggleAlertDay("whatsappAlertDays", optionValue);
                            setSubscriptionWhatsappAlertSearch("");
                          }}
                        >
                          <span className="d-flex align-items-center gap-2">
                            <input type="checkbox" className="form-check-input mt-0" checked={checked} readOnly />
                            <span className="crm-inline-suggestions__item-main">{option.label}</span>
                          </span>
                        </button>
                      );
                    }) : (
                      <div className="crm-inline-suggestions__item">
                        <span className="crm-inline-suggestions__item-main">No alerts found</span>
                      </div>
                    )}
                  </div>
                </div>
              ) : null}
            </div>
            {form.whatsappAlertDays.length ? (
              <div className="d-flex flex-wrap gap-2 mt-2">
                {form.whatsappAlertDays.map((value) => (
                  <span
                    key={`selected-whatsapp-alert-${value}`}
                    className="badge text-bg-light border d-inline-flex align-items-center gap-2 px-2 py-2"
                  >
                    <button
                      type="button"
                      className="btn btn-sm p-0 border text-secondary bg-transparent rounded-circle d-inline-flex align-items-center justify-content-center"
                      style={{ width: 18, height: 18, lineHeight: 1 }}
                      onClick={() => toggleAlertDay("whatsappAlertDays", value)}
                    >
                      <i className="bi bi-x-lg" aria-hidden="true" />
                    </button>
                    <span>{formatAlertDayLabel(value)}</span>
                  </span>
                ))}
              </div>
            ) : null}
          </div>

          <div className="col-12 col-md-4">
            <label className="form-label small text-secondary mb-1">Assign To</label>
            <div className="crm-inline-suggestions-wrap">
              <input
                type="search"
                className="form-control"
                autoComplete="off"
                placeholder="Search department or user"
                value={subscriptionAssignSearch}
                onFocus={() => setSubscriptionAssignOpen(true)}
                onClick={() => setSubscriptionAssignOpen(true)}
                onBlur={() => window.setTimeout(() => setSubscriptionAssignOpen(false), 120)}
                onChange={(event) => {
                  setSubscriptionAssignSearch(event.target.value);
                  setSubscriptionAssignOpen(true);
                }}
              />
              {subscriptionAssignOpen ? (
                <div className="crm-inline-suggestions" style={{ maxHeight: "280px", overflowY: "auto" }}>
                  <div className="crm-inline-suggestions__group">
                    <div className="crm-inline-suggestions__title">Assign To</div>
                    {filteredAssigneeOptions.length ? filteredAssigneeOptions.map((entry) => {
                      const key = `${entry.type}:${String(entry.value).toLowerCase()}`;
                      const checked = form.alertAssignTo.some((item) => `${item.type}:${String(item.value).toLowerCase()}` === key);
                      return (
                        <button
                          key={`subscription-alert-assignee-${key}`}
                          type="button"
                          className="crm-inline-suggestions__item"
                          onMouseDown={(event) => event.preventDefault()}
                          onClick={() => toggleAlertAssignee(entry)}
                        >
                          <span className="d-flex align-items-center gap-2">
                            <input type="checkbox" className="form-check-input mt-0" checked={checked} readOnly />
                            <span className="crm-inline-suggestions__item-main">{formatAssigneeLabel(entry)}</span>
                          </span>
                        </button>
                      );
                    }) : (
                      <div className="crm-inline-suggestions__item">
                        <span className="crm-inline-suggestions__item-main">No department or user found</span>
                      </div>
                    )}
                  </div>
                </div>
              ) : null}
            </div>
          </div>

          <div className="col-12">
            <label className="form-label small text-secondary mb-1">Extra Org Admin Emails</label>
            <div className="d-flex gap-2">
              <input
                className="form-control"
                value={extraEmailsInput}
                onChange={(event) => setExtraEmailsInput(event.target.value)}
                placeholder="info@demo.com, support@demo.com"
              />
              <button type="button" className="btn btn-primary btn-sm" onClick={addExtraEmailAssignees}>
                Add Emails
              </button>
            </div>
            <div className="form-text">
              Use comma-separated format. Example: info@demo.com, support@demo.com
            </div>
          </div>

          <div className="col-12">
            <div className="d-flex flex-wrap gap-2">
              {form.alertAssignTo.length ? form.alertAssignTo.map((entry) => (
                <span
                  key={`assigned-${entry.type}-${entry.value}`}
                  className="badge text-bg-light border d-inline-flex align-items-center gap-2 px-2 py-2"
                >
                  <button
                    type="button"
                    className="btn btn-sm p-0 border text-secondary bg-transparent rounded-circle d-inline-flex align-items-center justify-content-center"
                    style={{ width: 18, height: 18, lineHeight: 1 }}
                    onClick={() => toggleAlertAssignee(entry)}
                  >
                    <i className="bi bi-x-lg" aria-hidden="true" />
                  </button>
                  <span>{formatAssigneeLabel(entry)}</span>
                </span>
              )) : <span className="text-secondary small">No assignees selected yet.</span>}
            </div>
          </div>
        </div>
      </div>

      {viewRow ? (
        <div
          className="position-fixed top-0 start-0 w-100 h-100 d-flex align-items-center justify-content-center"
          style={{ background: "rgba(0,0,0,0.65)", zIndex: 1050, padding: "1rem" }}
          onClick={() => setViewRow(null)}
        >
          <div className="card p-3" style={{ width: "min(720px, 100%)" }} onClick={(event) => event.stopPropagation()}>
            <div className="d-flex align-items-center justify-content-between gap-2 mb-3">
              <h5 className="mb-0">Subscription Details</h5>
              <button type="button" className="btn btn-sm btn-outline-light" onClick={() => setViewRow(null)}>
                <i className="bi bi-x-lg" aria-hidden="true" />
              </button>
            </div>
            <div className="row g-3">
              <div className="col-12 col-md-6">
                <div><strong>Title:</strong> {viewRow.subscriptionTitle || "-"}</div>
                <div><strong>Category:</strong> {viewRow.categoryName || "-"}</div>
                <div><strong>Sub Category:</strong> {viewRow.subCategoryName || "-"}</div>
                <div><strong>Status:</strong> {viewRow.status || "-"}</div>
              </div>
              <div className="col-12 col-md-6">
                <div><strong>Customer:</strong> {viewRow.customerName || "-"}</div>
                <div><strong>Amount:</strong> {(viewRow.currency || "INR")} {String(viewRow.amount || "0")}</div>
                <div><strong>Start Date:</strong> {viewRow.startDate || "-"}</div>
                <div><strong>End Date:</strong> {viewRow.endDate || "-"}</div>
                <div><strong>Next Billing:</strong> {viewRow.nextBillingDate || "-"}</div>
              </div>
              <div className="col-12">
                <div><strong>Payment Description:</strong></div>
                <p className="mb-0 text-secondary">{viewRow.paymentDescription || "No description added."}</p>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
