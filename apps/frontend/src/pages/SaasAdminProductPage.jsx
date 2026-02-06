
import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import { apiFetch } from "../lib/api.js";
import { estimateCostInr } from "../lib/aiCost.js";
import TablePagination from "../components/TablePagination.jsx";
import { useConfirm } from "../components/ConfirmDialog.jsx";
import SaasAdminObservabilityPage from "./SaasAdminObservabilityPage.jsx";

const emptyState = {
  loading: true,
  error: "",
  data: null
};

const defaultAiCostAssumptions = {
  tokensPerReply: 300,
  usdPer1k: 0.002,
  usdToInr: 85,
  warnHighInr: 500,
  warnVeryHighInr: 2000
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

export default function SaasAdminProductPage() {
  const { slug } = useParams();
  const location = useLocation();
  const confirm = useConfirm();
  const [state, setState] = useState(emptyState);
  const [activeSection, setActiveSection] = useState("organizations");

  const [orgState, setOrgState] = useState(emptyState);
  const [orgTypeTab, setOrgTypeTab] = useState("org");
  const [orgStatusTab, setOrgStatusTab] = useState("active");
  const [dealerStatusTab, setDealerStatusTab] = useState("active");
  const [orgTableState, setOrgTableState] = useState({
    org: {
      active: { term: "", page: 1 },
      inactive: { term: "", page: 1 },
      expired: { term: "", page: 1 },
      deleted: { term: "", page: 1 }
    },
    dealer: {
      active: { term: "", page: 1 },
      inactive: { term: "", page: 1 },
      expired: { term: "", page: 1 },
      deleted: { term: "", page: 1 }
    }
  });

  const [userState, setUserState] = useState(emptyState);
  const [userSearchTerm, setUserSearchTerm] = useState("");
  const [userSearchQuery, setUserSearchQuery] = useState("");
  const [userPage, setUserPage] = useState(1);

  const [planState, setPlanState] = useState(emptyState);
  const [planModal, setPlanModal] = useState({
    open: false,
    mode: "create",
    form: {},
    error: "",
    fieldErrors: {},
    loading: false,
    planId: null
  });
  const [aiCostAssumptions, setAiCostAssumptions] = useState(() => {
    try {
      const raw = window.localStorage.getItem("wz_ai_cost_assumptions");
      if (raw) {
        return { ...defaultAiCostAssumptions, ...JSON.parse(raw) };
      }
    } catch (error) {
      // Ignore storage errors.
    }
    return defaultAiCostAssumptions;
  });
  const [showAiCostAssumptions, setShowAiCostAssumptions] = useState(false);

  function getFieldError(field) {
    const message = planModal.fieldErrors?.[field];
    if (!message) {
      return null;
    }
    const text = Array.isArray(message) ? message.join(", ") : message;
    return <div className="text-danger small">{text}</div>;
  }

  useEffect(() => {
    try {
      window.localStorage.setItem("wz_ai_cost_assumptions", JSON.stringify(aiCostAssumptions));
    } catch (error) {
      // Ignore storage errors.
    }
  }, [aiCostAssumptions]);

  function getAiCostEstimate(aiReplies) {
    const replies = Number(aiReplies);
    if (!Number.isFinite(replies) || replies <= 0) {
      return null;
    }
    const tokensPerReply = Number(aiCostAssumptions.tokensPerReply);
    const usdPer1k = Number(aiCostAssumptions.usdPer1k);
    const usdToInr = Number(aiCostAssumptions.usdToInr);
    return estimateCostInr(replies, tokensPerReply, usdPer1k, usdToInr);
  }

  const [pendingState, setPendingState] = useState(emptyState);
  const [pendingTab, setPendingTab] = useState("org");
  const [pendingSearchTerm, setPendingSearchTerm] = useState("");
  const [pendingSearchQuery, setPendingSearchQuery] = useState("");
  const [pendingPage, setPendingPage] = useState(1);
  const [historyState, setHistoryState] = useState(emptyState);
  const [historyTab, setHistoryTab] = useState("approved");
  const [historyType, setHistoryType] = useState("org");
  const [historySearchTerm, setHistorySearchTerm] = useState("");
  const [historySearchQuery, setHistorySearchQuery] = useState("");
  const [historyPage, setHistoryPage] = useState(1);
  const [renewalsState, setRenewalsState] = useState(emptyState);
  const [renewalsTab, setRenewalsTab] = useState("upcoming");
  const [renewalsCycle, setRenewalsCycle] = useState("monthly");
  const [renewalsSearchTerm, setRenewalsSearchTerm] = useState("");
  const [renewalsSearchQuery, setRenewalsSearchQuery] = useState("");
  const [renewalsPage, setRenewalsPage] = useState(1);
  const [billingState, setBillingState] = useState(emptyState);
  const [billingTransferSearchTerm, setBillingTransferSearchTerm] = useState("");
  const [billingTransferSearchQuery, setBillingTransferSearchQuery] = useState("");
  const [billingTransferPage, setBillingTransferPage] = useState(1);
  const [billingSubSearchTerm, setBillingSubSearchTerm] = useState("");
  const [billingSubSearchQuery, setBillingSubSearchQuery] = useState("");
  const [billingSubPage, setBillingSubPage] = useState(1);
  const [referralsState, setReferralsState] = useState(emptyState);
  const [referralsTab, setReferralsTab] = useState("org");
  const [referralTableState, setReferralTableState] = useState({
    org: {
      pending: { term: "", page: 1 },
      paid: { term: "", page: 1 },
      rejected: { term: "", page: 1 }
    },
    dealer: {
      pending: { term: "", page: 1 },
      paid: { term: "", page: 1 },
      rejected: { term: "", page: 1 }
    }
  });
  const [supportState, setSupportState] = useState(emptyState);
  const [aiUsageState, setAiUsageState] = useState(emptyState);
  const [aiUsageDays, setAiUsageDays] = useState(7);
  const [aiUsageOrgId, setAiUsageOrgId] = useState("");
  const [aiUsageYear, setAiUsageYear] = useState(new Date().getFullYear());
  const [aiUsageMonth, setAiUsageMonth] = useState(new Date().getMonth() + 1);
  const [aiUsageTrend, setAiUsageTrend] = useState({
    open: false,
    loading: false,
    error: "",
    org: null,
    rows: []
  });
  const [openAiState, setOpenAiState] = useState({
    loading: false,
    error: "",
    data: null,
    form: {
      api_key: "",
      model: "gpt-4o-mini",
      input_cost_per_1k_tokens_inr: "",
      output_cost_per_1k_tokens_inr: "",
      fixed_markup_percent: "",
      is_active: true
    },
    saved: ""
  });
  const [openAiTestState, setOpenAiTestState] = useState({
    loading: false,
    message: "",
    ok: null
  });

  const [viewModal, setViewModal] = useState({ open: false, loading: false, data: null, error: "" });
  const [transferModal, setTransferModal] = useState({
    open: false,
    loading: false,
    data: null,
    error: "",
    clearing: false,
    receiptPreview: ""
  });
  const [receiptModal, setReceiptModal] = useState({ open: false, url: "", transferId: null, clearing: false });
  const [bankModal, setBankModal] = useState({ open: false, title: "", details: {} });
  const [payoutModal, setPayoutModal] = useState({
    open: false,
    row: null,
    type: "org",
    note: "",
    error: "",
    saving: false
  });
  const [editModal, setEditModal] = useState({
    open: false,
    loading: false,
    data: null,
    error: "",
    form: {}
  });
  const [billingViewModal, setBillingViewModal] = useState({ open: false, row: null });
  const [userViewModal, setUserViewModal] = useState({ open: false, loading: false, data: null, error: "" });
  const [userEditModal, setUserEditModal] = useState({ open: false, loading: false, data: null, error: "", form: {} });
  const PAGE_SIZE = 10;

  useEffect(() => {
    const hash = (location.hash || "").replace("#", "").trim();
    if (hash) {
      setActiveSection(hash);
    } else {
      setActiveSection("organizations");
    }
  }, [location.hash, location.pathname, slug]);

  useEffect(() => {
    let active = true;
    async function loadProduct() {
      try {
        const data = await apiFetch(`/api/saas-admin/products/${slug}`);
        if (!active) {
          return;
        }
        setState({ loading: false, error: "", data });
      } catch (error) {
        if (active) {
          setState({
            loading: false,
            error: error?.message || "Unable to load product dashboard.",
            data: null
          });
        }
      }
    }

    loadProduct();
    return () => {
      active = false;
    };
  }, [slug]);


  async function refreshOrganizations() {
    const data = await apiFetch(`/api/saas-admin/products/${slug}/organizations`);
    setOrgState({ loading: false, error: "", data });
  }

  async function refreshUsers() {
    const data = await apiFetch(`/api/saas-admin/products/${slug}/users`);
    setUserState({ loading: false, error: "", data });
  }

  async function refreshPlans() {
    const data = (slug === "storage" || slug === "online-storage")
      ? await apiFetch("/api/saas-admin/storage/plan")
      : await apiFetch(`/api/saas-admin/plans?product=${slug}`);
    setPlanState({ loading: false, error: "", data });
  }

  async function refreshPending() {
    const data = await apiFetch(`/api/saas-admin/products/${slug}/pending-transfers`);
    setPendingState({ loading: false, error: "", data });
  }

  async function refreshHistory() {
    const data = await apiFetch(`/api/saas-admin/products/${slug}/transfer-history`);
    setHistoryState({ loading: false, error: "", data });
  }

  async function refreshRenewals() {
    const data = await apiFetch(`/api/saas-admin/products/${slug}/renewals`);
    setRenewalsState({ loading: false, error: "", data });
  }

  async function refreshBilling() {
    const data = await apiFetch(`/api/saas-admin/products/${slug}/billing-history`);
    setBillingState({ loading: false, error: "", data });
  }

  async function refreshReferrals() {
    const data = await apiFetch(`/api/saas-admin/products/${slug}/referrals`);
    setReferralsState({ loading: false, error: "", data });
  }

  async function refreshSupport() {
    const data = await apiFetch(`/api/saas-admin/products/${slug}/support-access`);
    setSupportState({ loading: false, error: "", data });
  }

  async function refreshAiUsage() {
    const params = new URLSearchParams();
    params.set("days", String(aiUsageDays));
    params.set("year", String(aiUsageYear));
    params.set("month", String(aiUsageMonth));
    if (aiUsageOrgId) {
      params.set("org_id", aiUsageOrgId);
    }
    const data = await apiFetch(`/api/saas-admin/ai-chatbot/usage/summary?${params.toString()}`);
    setAiUsageState({ loading: false, error: "", data });
  }

  async function openAiUsageTrend(orgRow) {
    if (!orgRow?.org_id) {
      return;
    }
    setAiUsageTrend({
      open: true,
      loading: true,
      error: "",
      org: orgRow,
      rows: []
    });
    try {
      const params = new URLSearchParams();
      params.set("org_id", String(orgRow.org_id));
      params.set("months", "6");
      const data = await apiFetch(`/api/saas-admin/ai-chatbot/usage/trend?${params.toString()}`);
      setAiUsageTrend((prev) => ({
        ...prev,
        loading: false,
        error: "",
        rows: data.trend || []
      }));
    } catch (error) {
      setAiUsageTrend((prev) => ({
        ...prev,
        loading: false,
        error: error?.message || "Unable to load usage trend."
      }));
    }
  }

  async function refreshOpenAiSettings() {
    setOpenAiState((prev) => ({ ...prev, loading: true, error: "" }));
    try {
      const data = await apiFetch("/api/saas-admin/ai-chatbot/openai/settings");
      setOpenAiState((prev) => ({
        ...prev,
        loading: false,
        error: "",
        data,
        form: {
          api_key: "",
          model: data.model || "gpt-4o-mini",
          input_cost_per_1k_tokens_inr: data.input_cost_per_1k_tokens_inr ?? "",
          output_cost_per_1k_tokens_inr: data.output_cost_per_1k_tokens_inr ?? "",
          fixed_markup_percent: data.fixed_markup_percent ?? "",
          is_active: Boolean(data.is_active)
        },
        saved: data.updated_at || ""
      }));
    } catch (error) {
      setOpenAiState((prev) => ({
        ...prev,
        loading: false,
        error: error?.message || "Unable to load OpenAI settings."
      }));
    }
  }

  async function saveOpenAiSettings() {
    setOpenAiState((prev) => ({ ...prev, loading: true, error: "" }));
    try {
      const payload = {
        api_key: openAiState.form.api_key,
        model: openAiState.form.model,
        input_cost_per_1k_tokens_inr: Number(openAiState.form.input_cost_per_1k_tokens_inr || 0),
        output_cost_per_1k_tokens_inr: Number(openAiState.form.output_cost_per_1k_tokens_inr || 0),
        fixed_markup_percent: Number(openAiState.form.fixed_markup_percent || 0),
        is_active: Boolean(openAiState.form.is_active)
      };
      const data = await apiFetch("/api/saas-admin/ai-chatbot/openai/settings", {
        method: "POST",
        body: JSON.stringify(payload)
      });
      setOpenAiState((prev) => ({
        ...prev,
        loading: false,
        error: "",
        data,
        form: {
          ...prev.form,
          api_key: "",
          model: data.model || prev.form.model,
          input_cost_per_1k_tokens_inr: data.input_cost_per_1k_tokens_inr ?? prev.form.input_cost_per_1k_tokens_inr,
          output_cost_per_1k_tokens_inr: data.output_cost_per_1k_tokens_inr ?? prev.form.output_cost_per_1k_tokens_inr,
          fixed_markup_percent: data.fixed_markup_percent ?? prev.form.fixed_markup_percent,
          is_active: Boolean(data.is_active)
        },
        saved: data.updated_at || new Date().toISOString()
      }));
    } catch (error) {
      setOpenAiState((prev) => ({
        ...prev,
        loading: false,
        error: error?.message || "Unable to save OpenAI settings."
      }));
    }
  }

  async function testOpenAiConnection() {
    setOpenAiTestState({ loading: true, message: "", ok: null });
    try {
      const payload = {
        api_key: openAiState.form.api_key,
        model: openAiState.form.model
      };
      const data = await apiFetch("/api/saas-admin/ai-chatbot/openai/test", {
        method: "POST",
        body: JSON.stringify(payload)
      });
      setOpenAiTestState({
        loading: false,
        message: `Connection OK (${data.model || "model"})`,
        ok: true
      });
    } catch (error) {
      setOpenAiTestState({
        loading: false,
        message: error?.message || "Connection failed.",
        ok: false
      });
    }
  }

  useEffect(() => {
    let active = true;
    async function loadOrgData() {
      try {
        const data = await apiFetch(`/api/saas-admin/products/${slug}/organizations`);
        if (active) {
          setOrgState({ loading: false, error: "", data });
        }
      } catch (error) {
        if (active) {
          setOrgState({ loading: false, error: error?.message || "Unable to load organizations.", data: null });
        }
      }
    }

    loadOrgData();
    return () => {
      active = false;
    };
  }, [slug]);

  useEffect(() => {
    let active = true;
    async function loadUserData() {
      try {
        const data = await apiFetch(`/api/saas-admin/products/${slug}/users`);
        if (active) {
          setUserState({ loading: false, error: "", data });
        }
      } catch (error) {
        if (active) {
          setUserState({ loading: false, error: error?.message || "Unable to load users.", data: null });
        }
      }
    }

    loadUserData();
    return () => {
      active = false;
    };
  }, [slug]);

  useEffect(() => {
    let active = true;
    async function loadPlanData() {
      try {
        const data = (slug === "storage" || slug === "online-storage")
          ? await apiFetch("/api/saas-admin/storage/plan")
          : await apiFetch(`/api/saas-admin/plans?product=${slug}`);
        if (active) {
          setPlanState({ loading: false, error: "", data });
        }
      } catch (error) {
        if (active) {
          setPlanState({ loading: false, error: error?.message || "Unable to load plans.", data: null });
        }
      }
    }

    loadPlanData();
    return () => {
      active = false;
    };
  }, [slug]);

  useEffect(() => {
    let active = true;
    async function loadPendingData() {
      try {
        const data = await apiFetch(`/api/saas-admin/products/${slug}/pending-transfers`);
        if (active) {
          setPendingState({ loading: false, error: "", data });
        }
      } catch (error) {
        if (active) {
          setPendingState({ loading: false, error: error?.message || "Unable to load pending transfers.", data: null });
        }
      }
    }

    loadPendingData();
    return () => {
      active = false;
    };
  }, [slug]);

  useEffect(() => {
    let active = true;
    async function loadHistoryData() {
      try {
        const data = await apiFetch(`/api/saas-admin/products/${slug}/transfer-history`);
        if (active) {
          setHistoryState({ loading: false, error: "", data });
        }
      } catch (error) {
        if (active) {
          setHistoryState({ loading: false, error: error?.message || "Unable to load transfer history.", data: null });
        }
      }
    }

    loadHistoryData();
    return () => {
      active = false;
    };
  }, [slug]);

  useEffect(() => {
    let active = true;
    async function loadRenewalsData() {
      try {
        const data = await apiFetch(`/api/saas-admin/products/${slug}/renewals`);
        if (active) {
          setRenewalsState({ loading: false, error: "", data });
        }
      } catch (error) {
        if (active) {
          setRenewalsState({ loading: false, error: error?.message || "Unable to load renewals.", data: null });
        }
      }
    }

    loadRenewalsData();
    return () => {
      active = false;
    };
  }, [slug]);

  useEffect(() => {
    let active = true;
    async function loadBillingData() {
      try {
        const data = await apiFetch(`/api/saas-admin/products/${slug}/billing-history`);
        if (active) {
          setBillingState({ loading: false, error: "", data });
        }
      } catch (error) {
        if (active) {
          setBillingState({ loading: false, error: error?.message || "Unable to load billing history.", data: null });
        }
      }
    }

    loadBillingData();
    return () => {
      active = false;
    };
  }, [slug]);

  useEffect(() => {
    let active = true;
    async function loadReferralsData() {
      try {
        const data = await apiFetch(`/api/saas-admin/products/${slug}/referrals`);
        if (active) {
          setReferralsState({ loading: false, error: "", data });
        }
      } catch (error) {
        if (active) {
          setReferralsState({ loading: false, error: error?.message || "Unable to load referrals.", data: null });
        }
      }
    }

    loadReferralsData();
    return () => {
      active = false;
    };
  }, [slug]);

  useEffect(() => {
    let active = true;
    async function loadSupportData() {
      try {
        const data = await apiFetch(`/api/saas-admin/products/${slug}/support-access`);
        if (active) {
          setSupportState({ loading: false, error: "", data });
        }
      } catch (error) {
        if (active) {
          setSupportState({ loading: false, error: error?.message || "Unable to load support access.", data: null });
        }
      }
    }

    loadSupportData();
    return () => {
      active = false;
    };
  }, [slug]);

  useEffect(() => {
    const handle = setTimeout(() => {
      setPendingSearchQuery(pendingSearchTerm.trim());
      setPendingPage(1);
    }, 300);
    return () => clearTimeout(handle);
  }, [pendingSearchTerm]);

  useEffect(() => {
    const handle = setTimeout(() => {
      setHistorySearchQuery(historySearchTerm.trim());
      setHistoryPage(1);
    }, 300);
    return () => clearTimeout(handle);
  }, [historySearchTerm]);

  useEffect(() => {
    const handle = setTimeout(() => {
      setRenewalsSearchQuery(renewalsSearchTerm.trim());
      setRenewalsPage(1);
    }, 300);
    return () => clearTimeout(handle);
  }, [renewalsSearchTerm]);

  useEffect(() => {
    const handle = setTimeout(() => {
      setBillingTransferSearchQuery(billingTransferSearchTerm.trim());
      setBillingTransferPage(1);
    }, 300);
    return () => clearTimeout(handle);
  }, [billingTransferSearchTerm]);

  useEffect(() => {
    const handle = setTimeout(() => {
      setBillingSubSearchQuery(billingSubSearchTerm.trim());
      setBillingSubPage(1);
    }, 300);
    return () => clearTimeout(handle);
  }, [billingSubSearchTerm]);

  useEffect(() => {
    const handle = setTimeout(() => {
      setUserSearchQuery(userSearchTerm.trim());
      setUserPage(1);
    }, 300);
    return () => clearTimeout(handle);
  }, [userSearchTerm]);

  const orgs = orgState.data?.organizations || [];
  const orgPlans = orgState.data?.plans || planState.data?.plans || [];
  const deletedOrgs = orgState.data?.deleted_orgs || [];
  const dealers = orgState.data?.dealers || [];
  const deletedDealers = orgState.data?.deleted_dealers || [];
  const orgsByStatus = useMemo(() => splitOrgByStatus(orgs), [orgs]);
  const dealersByStatus = useMemo(() => splitDealerByStatus(dealers), [dealers]);

  const users = userState.data?.users || [];
  const filteredUsers = useMemo(() => {
    if (!userSearchQuery) {
      return users;
    }
    const term = userSearchQuery.toLowerCase();
    return users.filter((user) =>
      [user.name, user.email, user.org_name, user.device_id, user.pc_name].some((value) =>
        String(value || "").toLowerCase().includes(term)
      )
    );
  }, [users, userSearchQuery]);
  const userTotalPages = Math.max(Math.ceil(filteredUsers.length / PAGE_SIZE), 1);
  const userPaged = useMemo(
    () => filteredUsers.slice((userPage - 1) * PAGE_SIZE, userPage * PAGE_SIZE),
    [filteredUsers, userPage]
  );

  const plans = planState.data?.plans || [];
  const orgTransfers = pendingState.data?.org_transfers || [];
  const dealerTransfers = pendingState.data?.dealer_transfers || [];
  const transfers = pendingTab === "dealer" ? dealerTransfers : orgTransfers;
  const pendingNameLabel = pendingTab === "dealer" ? "Dealer" : "Organization";
  const pendingFiltered = useMemo(() => {
    if (!pendingSearchQuery) {
      return transfers;
    }
    const term = pendingSearchQuery.toLowerCase();
    return transfers.filter((row) =>
      [
        row.organization,
        row.plan,
        row.request_type,
        row.billing_cycle,
        row.amount,
        row.currency,
        row.created_at
      ].some((value) => String(value || "").toLowerCase().includes(term))
    );
  }, [transfers, pendingSearchQuery]);
  const pendingTotalPages = Math.max(Math.ceil(pendingFiltered.length / PAGE_SIZE), 1);
  const pendingPaged = useMemo(
    () => pendingFiltered.slice((pendingPage - 1) * PAGE_SIZE, pendingPage * PAGE_SIZE),
    [pendingFiltered, pendingPage]
  );

  const historyTransfers = historyState.data?.transfers || [];
  const historyFilteredByStatus = useMemo(
    () => historyTransfers.filter((row) => row.status === historyTab),
    [historyTransfers, historyTab]
  );
  const historyFilteredByType = useMemo(() => {
    if (historyType === "dealer") {
      return historyFilteredByStatus.filter((row) => row.request_type === "dealer");
    }
    return historyFilteredByStatus.filter((row) => row.request_type !== "dealer");
  }, [historyFilteredByStatus, historyType]);
  const historyFiltered = useMemo(() => {
    if (!historySearchQuery) {
      return historyFilteredByType;
    }
    const term = historySearchQuery.toLowerCase();
    return historyFilteredByType.filter((row) =>
      [
        row.organization,
        row.plan,
        row.request_type,
        row.billing_cycle,
        row.amount,
        row.currency,
        row.updated_at
      ].some((value) => String(value || "").toLowerCase().includes(term))
    );
  }, [historyFilteredByType, historySearchQuery]);
  const historyTotalPages = Math.max(Math.ceil(historyFiltered.length / PAGE_SIZE), 1);
  const historyPaged = useMemo(
    () => historyFiltered.slice((historyPage - 1) * PAGE_SIZE, historyPage * PAGE_SIZE),
    [historyFiltered, historyPage]
  );
  const renewalsData = renewalsState.data || {};
  const upcomingRenewals = renewalsData.upcoming || [];
  const missedRenewals = renewalsData.missed || [];
  const deletedRenewals = renewalsData.deleted || [];
  const renewalsRows =
    renewalsTab === "missed"
      ? missedRenewals
      : renewalsTab === "deleted"
      ? deletedRenewals
      : upcomingRenewals;
  const renewalsFiltered = useMemo(() => {
    const cycleFiltered = renewalsTab === "deleted" || renewalsCycle === "all"
      ? renewalsRows
      : renewalsRows.filter((row) => row.billing_cycle === renewalsCycle);
    if (!renewalsSearchQuery) {
      return cycleFiltered;
    }
    const term = renewalsSearchQuery.toLowerCase();
    return cycleFiltered.filter((row) => {
      const values = renewalsTab === "deleted"
        ? [
          row.organization_name,
          row.owner_username,
          row.owner_email,
          row.reason,
          row.deleted_at
        ]
        : [
          row.organization,
          row.owner_name,
          row.owner_email,
          row.plan,
          row.billing_cycle,
          row.end_date,
          row.status,
          row.days_remaining,
          row.days_overdue
        ];
      return values.some((value) => String(value || "").toLowerCase().includes(term));
    });
  }, [renewalsRows, renewalsSearchQuery, renewalsTab, renewalsCycle]);
  const renewalsTotalPages = Math.max(Math.ceil(renewalsFiltered.length / PAGE_SIZE), 1);
  const renewalsPaged = useMemo(
    () => renewalsFiltered.slice((renewalsPage - 1) * PAGE_SIZE, renewalsPage * PAGE_SIZE),
    [renewalsFiltered, renewalsPage]
  );
  const billingData = billingState.data || {};
  const billingTransfers = billingData.transfers || [];
  const billingSubscriptions = billingData.subscriptions || [];
  const billingTransfersPaged = useMemo(() => {
    const filterFn = (rows, term) => {
      if (!term) {
        return rows;
      }
      const needle = term.toLowerCase();
      return rows.filter((row) =>
        [
          row.organization,
          row.owner_name,
          row.owner_email,
          row.request_type,
          row.billing_cycle,
          row.plan,
          row.amount,
          row.currency,
          row.status,
          row.paid_on,
          row.reference_no,
          row.created_at,
          row.updated_at
        ].some((value) => String(value || "").toLowerCase().includes(needle))
      );
    };
    return getPagedRows(billingTransfers, billingTransferSearchQuery, billingTransferPage, filterFn);
  }, [billingTransfers, billingTransferSearchQuery, billingTransferPage]);
  const billingSubsPaged = useMemo(() => {
    const filterFn = (rows, term) => {
      if (!term) {
        return rows;
      }
      const needle = term.toLowerCase();
      return rows.filter((row) =>
        [
          row.organization,
          row.plan,
          row.status,
          row.billing_cycle,
          row.start_date,
          row.end_date,
          row.created_at,
          row.user_name,
          row.user_email
        ].some((value) => String(value || "").toLowerCase().includes(needle))
      );
    };
    return getPagedRows(billingSubscriptions, billingSubSearchQuery, billingSubPage, filterFn);
  }, [billingSubscriptions, billingSubSearchQuery, billingSubPage]);
  const {
    filtered: billingTransferFiltered,
    paged: billingTransferPaged,
    totalPages: billingTransferTotalPages,
    currentPage: billingTransferCurrentPage,
    startIndex: billingTransferStartIndex
  } = billingTransfersPaged;
  const {
    filtered: billingSubFiltered,
    paged: billingSubPaged,
    totalPages: billingSubTotalPages,
    currentPage: billingSubCurrentPage,
    startIndex: billingSubStartIndex
  } = billingSubsPaged;
  const referralsData = referralsState.data || {};
  const orgReferralRows = referralsData.org_referrals || [];
  const dealerReferralRows = referralsData.dealer_referrals || [];
  const referralsRows = referralsTab === "dealer" ? dealerReferralRows : orgReferralRows;
  const referralsByStatus = useMemo(
    () => splitReferralsByStatus(referralsRows),
    [referralsRows]
  );
  const supportRows = supportState.data?.rows || [];
  const aiUsageTotals = aiUsageState.data?.totals || {};
  const aiUsageTopOrgs = aiUsageState.data?.top_orgs || [];
  const aiUsageAlerts = aiUsageState.data?.alerts || [];
  const aiUsagePeriod = aiUsageState.data?.period || "";
  const aiUsageTokenRate = Number(aiCostAssumptions.usdPer1k);
  const aiUsageTokenPerReply = Number(aiCostAssumptions.tokensPerReply);
  const aiUsageUsdToInr = Number(aiCostAssumptions.usdToInr);
  const aiUsageTokensTotal = Number(aiUsageTotals.tokens_total ?? 0);
  const aiUsageRepliesTotal = Number(aiUsageTotals.ai_replies_used ?? 0);
  const aiUsageLimit = Number(aiUsageTotals.ai_replies_limit ?? 0);
  const aiUsagePercent = aiUsageLimit ? Math.round((aiUsageRepliesTotal / aiUsageLimit) * 100) : 0;
  const aiUsageEstimateFromTokens = aiUsageTokensTotal > 0
    ? estimateCostInr(aiUsageTokensTotal / aiUsageTokenPerReply, aiUsageTokenPerReply, aiUsageTokenRate, aiUsageUsdToInr)
    : null;
  const aiUsageEstimateFromReplies = aiUsageRepliesTotal > 0
    ? estimateCostInr(aiUsageRepliesTotal, aiUsageTokenPerReply, aiUsageTokenRate, aiUsageUsdToInr)
    : null;
  const aiUsageDisplayInr = Number(aiUsageTotals.cost_inr_est ?? 0) || aiUsageEstimateFromTokens?.costInr || aiUsageEstimateFromReplies?.costInr || 0;
  const aiUsageLocalAlert =
    aiUsageLimit && aiUsagePercent >= 100
      ? { level: "danger", message: "AI usage limit reached. Upgrade plan to continue." }
      : aiUsageLimit && aiUsagePercent >= 80
      ? { level: "warning", message: "AI usage is above 80% for this org." }
      : null;
  const currentYear = new Date().getFullYear();
  const aiUsageYears = [currentYear - 1, currentYear, currentYear + 1];
  const aiUsageMonths = Array.from({ length: 12 }, (_, index) => index + 1);

  const openAiMaskedKey = openAiState.data?.api_key_masked || "";
  const openAiHasKey = Boolean(openAiMaskedKey || openAiState.form.api_key);

  const data = state.data || {};
  const product = data.product || {};
  const resolvedSlug = product?.slug || slug;
  const isAiChatbotProduct = resolvedSlug === "ai-chatbot";
  const isStorageProduct = resolvedSlug === "storage" || resolvedSlug === "online-storage";
  const stats = data.stats || {};
  const monthlySales = data.monthly_sales || {};
  const monthlyInr = monthlySales.INR ?? 0;
  const monthlyUsd = monthlySales.USD ?? 0;
  const monthlyLabel = monthlyUsd ? `INR ${monthlyInr} / USD ${monthlyUsd}` : `INR ${monthlyInr}`;
  const statCards = [
    { label: "Total Orgs", value: stats.total ?? 0, icon: "bi-building" },
    { label: "Active Orgs", value: stats.active ?? 0, icon: "bi-check2-circle" },
    { label: "Trial Orgs", value: stats.trial ?? 0, icon: "bi-clock" },
    { label: "Inactive Orgs", value: stats.inactive ?? 0, icon: "bi-slash-circle" },
    { label: "Pending Approvals", value: stats.pending_approvals ?? 0, icon: "bi-hourglass-split" },
    { label: "Monthly Sales (30d)", value: monthlyLabel, icon: "bi-cash-stack" }
  ];

  useEffect(() => {
    if (!isAiChatbotProduct || activeSection !== "ai-usage") {
      return;
    }
    let active = true;
    async function loadAiUsage() {
      try {
        const params = new URLSearchParams();
        params.set("days", String(aiUsageDays));
        params.set("year", String(aiUsageYear));
        params.set("month", String(aiUsageMonth));
        if (aiUsageOrgId) {
          params.set("org_id", aiUsageOrgId);
        }
        const data = await apiFetch(`/api/saas-admin/ai-chatbot/usage/summary?${params.toString()}`);
        if (active) {
          setAiUsageState({ loading: false, error: "", data });
        }
      } catch (error) {
        if (active) {
          setAiUsageState({ loading: false, error: error?.message || "Unable to load AI usage.", data: null });
        }
      }
    }
    setAiUsageState((prev) => ({ ...prev, loading: true, error: "" }));
    loadAiUsage();
    return () => {
      active = false;
    };
  }, [activeSection, aiUsageDays, aiUsageOrgId, aiUsageYear, aiUsageMonth, isAiChatbotProduct]);

  useEffect(() => {
    if (!isAiChatbotProduct || activeSection !== "openai-settings") {
      return;
    }
    refreshOpenAiSettings();
  }, [activeSection, isAiChatbotProduct]);

  function getProductDescription(value, slugValue) {
    if (slugValue === "monitor") {
      return "Work Zilla Monitoring and Productivity Insights.";
    }
    return value || "-";
  }

  async function openOrgView(orgId) {
    setViewModal({ open: true, loading: true, data: null, error: "" });
    try {
      const data = await apiFetch(`/api/saas-admin/organizations/${orgId}`);
      setViewModal({ open: true, loading: false, data, error: "" });
    } catch (error) {
      setViewModal({ open: true, loading: false, data: null, error: error?.message || "Unable to load organization." });
    }
  }

  async function openTransferView(transferId) {
    setTransferModal({ open: true, loading: true, data: null, error: "", clearing: false, receiptPreview: "" });
    try {
      const data = await apiFetch(`/api/saas-admin/products/${slug}/pending-transfers/${transferId}`);
      setTransferModal({ open: true, loading: false, data, error: "", clearing: false, receiptPreview: "" });
    } catch (error) {
      setTransferModal({
        open: true,
        loading: false,
        data: null,
        error: error?.message || "Unable to load transfer details.",
        clearing: false,
        receiptPreview: ""
      });
    }
  }

  async function handleReceiptClear(transferId) {
    const confirmed = await confirm({
      title: "Clear Receipt",
      message: "Delete the uploaded receipt image?",
      confirmText: "Delete",
      confirmVariant: "danger"
    });
    if (!confirmed) {
      return;
    }
    setTransferModal((prev) => ({ ...prev, clearing: true }));
    try {
      await apiFetch(`/api/saas-admin/products/${slug}/pending-transfers/${transferId}/receipt-clear`, {
        method: "POST"
      });
      await refreshPending();
      const data = await apiFetch(`/api/saas-admin/products/${slug}/pending-transfers/${transferId}`);
      setTransferModal({ open: true, loading: false, data, error: "", clearing: false });
    } catch (error) {
      setTransferModal((prev) => ({
        ...prev,
        clearing: false,
        error: error?.message || "Unable to clear receipt."
      }));
    }
  }

  async function handleHistoryReceiptClear(transferId) {
    const confirmed = await confirm({
      title: "Delete Attachment",
      message: "Delete the uploaded receipt image?",
      confirmText: "Delete",
      confirmVariant: "danger"
    });
    if (!confirmed) {
      return;
    }
    try {
      await apiFetch(`/api/saas-admin/products/${slug}/pending-transfers/${transferId}/receipt-clear`, {
        method: "POST"
      });
      await refreshHistory();
    } catch (error) {
      setHistoryState((prev) => ({
        ...prev,
        error: error?.message || "Unable to clear attachment."
      }));
    }
  }

  async function handleReceiptModalClear() {
    if (!receiptModal.transferId) {
      return;
    }
    const confirmed = await confirm({
      title: "Clear Receipt",
      message: "Delete the uploaded receipt image?",
      confirmText: "Delete",
      confirmVariant: "danger"
    });
    if (!confirmed) {
      return;
    }
    setReceiptModal((prev) => ({ ...prev, clearing: true }));
    try {
      await apiFetch(`/api/saas-admin/products/${slug}/pending-transfers/${receiptModal.transferId}/receipt-clear`, {
        method: "POST"
      });
      await refreshPending();
      await refreshHistory();
      setReceiptModal({ open: false, url: "", transferId: null, clearing: false });
    } catch (error) {
      setReceiptModal((prev) => ({ ...prev, clearing: false }));
      setPendingState((prev) => ({
        ...prev,
        error: error?.message || "Unable to clear receipt."
      }));
    }
  }

  async function openOrgEdit(orgId) {
    setEditModal({ open: true, loading: true, data: null, error: "", form: {} });
    try {
      const data = await apiFetch(`/api/saas-admin/organizations/${orgId}`);
      const owner = data.owner || {};
      const subscription = data.subscription || {};
      const form = {
        name: data.organization?.name || "",
        company_key: data.organization?.company_key || "",
        owner_username: owner.username || "",
        owner_first_name: owner.first_name || "",
        owner_last_name: owner.last_name || "",
        owner_email: owner.email || "",
        plan_id: subscription.plan_id || "",
        billing_cycle: subscription.billing_cycle || "monthly",
        status: subscription.status || "active",
        end_date: subscription.end_date || "",
        addon_count: subscription.addon_count ?? 0
      };
      setEditModal({ open: true, loading: false, data, error: "", form });
    } catch (error) {
      setEditModal({ open: true, loading: false, data: null, error: error?.message || "Unable to load organization.", form: {} });
    }
  }

  async function handleOrgDelete(org) {
    const confirmed = await confirm({
      title: "Delete Organization",
      message: `Delete ${org.name}? This removes the organization and owner user.`,
      confirmText: "Delete",
      confirmVariant: "danger"
    });
    if (!confirmed) {
      return;
    }
    try {
      await apiFetch(`/api/saas-admin/organizations/${org.id}`, { method: "DELETE" });
      await refreshOrganizations();
    } catch (error) {
      setOrgState((prev) => ({ ...prev, error: error?.message || "Unable to delete organization." }));
    }
  }

  async function handleOrgSave() {
    if (!editModal.data?.organization?.id) {
      return;
    }
    setEditModal((prev) => ({ ...prev, loading: true, error: "" }));
    try {
      const payload = {
        name: editModal.form.name,
        company_key: editModal.form.company_key,
        owner_username: editModal.form.owner_username,
        owner_first_name: editModal.form.owner_first_name,
        owner_last_name: editModal.form.owner_last_name,
        owner_email: editModal.form.owner_email,
        plan_id: editModal.form.plan_id || null,
        billing_cycle: editModal.form.billing_cycle,
        status: editModal.form.status,
        end_date: editModal.form.end_date,
        addon_count: editModal.form.addon_count
      };
      await apiFetch(`/api/saas-admin/organizations/${editModal.data.organization.id}`, {
        method: "PUT",
        body: JSON.stringify(payload)
      });
      await refreshOrganizations();
      setEditModal({ open: false, loading: false, data: null, error: "", form: {} });
    } catch (error) {
      setEditModal((prev) => ({ ...prev, loading: false, error: error?.message || "Unable to update organization." }));
    }
  }

  async function openUserView(userId) {
    setUserViewModal({ open: true, loading: true, data: null, error: "" });
    try {
      const data = await apiFetch(`/api/saas-admin/products/${slug}/users/${userId}`);
      setUserViewModal({ open: true, loading: false, data, error: "" });
    } catch (error) {
      setUserViewModal({ open: true, loading: false, data: null, error: error?.message || "Unable to load user." });
    }
  }

  async function openUserEdit(userId) {
    setUserEditModal({ open: true, loading: true, data: null, error: "", form: {} });
    try {
      const data = await apiFetch(`/api/saas-admin/products/${slug}/users/${userId}`);
      const user = data.user || {};
      const form = {
        name: user.name || "",
        email: user.email || "",
        pc_name: user.pc_name || "",
        device_id: user.device_id || ""
      };
      setUserEditModal({ open: true, loading: false, data, error: "", form });
    } catch (error) {
      setUserEditModal({ open: true, loading: false, data: null, error: error?.message || "Unable to load user.", form: {} });
    }
  }

  async function handleUserSave() {
    if (!userEditModal.data?.user?.id) {
      return;
    }
    setUserEditModal((prev) => ({ ...prev, loading: true, error: "" }));
    try {
      await apiFetch(`/api/saas-admin/products/${slug}/users/${userEditModal.data.user.id}`, {
        method: "PUT",
        body: JSON.stringify({
          name: userEditModal.form.name,
          email: userEditModal.form.email,
          pc_name: userEditModal.form.pc_name,
          device_id: userEditModal.form.device_id
        })
      });
      await refreshUsers();
      setUserEditModal({ open: false, loading: false, data: null, error: "", form: {} });
    } catch (error) {
      setUserEditModal((prev) => ({ ...prev, loading: false, error: error?.message || "Unable to update user." }));
    }
  }

  async function handleUserDelete(user) {
    const confirmed = await confirm({
      title: "Delete User",
      message: `Delete ${user.name}?`,
      confirmText: "Delete",
      confirmVariant: "danger"
    });
    if (!confirmed) {
      return;
    }
    try {
      await apiFetch(`/api/saas-admin/products/${slug}/users/${user.id}`, { method: "DELETE" });
      await refreshUsers();
    } catch (error) {
      setUserState((prev) => ({ ...prev, error: error?.message || "Unable to delete user." }));
    }
  }

  function openPlanModal(mode, plan = null) {
    const limits = plan?.limits || {};
    const features = plan?.features || {};
    const form = isStorageProduct
      ? (plan
        ? {
            name: plan.name || "",
            monthly_price_inr: plan.monthly_price_inr ?? plan.monthly_price ?? "",
            yearly_price_inr: plan.yearly_price_inr ?? plan.yearly_price ?? "",
            monthly_price_usd: plan.monthly_price_usd ?? plan.usd_monthly_price ?? "",
            yearly_price_usd: plan.yearly_price_usd ?? plan.usd_yearly_price ?? "",
            max_users: plan.max_users ?? "",
            device_limit_per_user: plan.device_limit_per_user ?? "",
            storage_limit_gb: plan.storage_limit_gb ?? "",
            bandwidth_limit_gb_monthly: plan.bandwidth_limit_gb_monthly ?? "",
            is_bandwidth_limited: plan.is_bandwidth_limited !== false,
            is_active: plan.is_active !== false,
          }
        : {
            name: "",
            monthly_price_inr: "",
            yearly_price_inr: "",
            monthly_price_usd: "",
            yearly_price_usd: "",
            max_users: "",
            device_limit_per_user: "",
            storage_limit_gb: "",
            bandwidth_limit_gb_monthly: "",
            is_bandwidth_limited: true,
            is_active: true,
          })
      : plan
        ? {
            plan_template: "Custom",
            name: plan.name || "",
            monthly_price: plan.monthly_price ?? "",
            yearly_price: plan.yearly_price ?? "",
            usd_monthly_price: plan.usd_monthly_price ?? "",
            usd_yearly_price: plan.usd_yearly_price ?? "",
            addon_monthly_price: plan.addon_monthly_price ?? "",
            addon_yearly_price: plan.addon_yearly_price ?? "",
            addon_usd_monthly_price: plan.addon_usd_monthly_price ?? "",
            addon_usd_yearly_price: plan.addon_usd_yearly_price ?? "",
            employee_limit: plan.employee_limit ?? 0,
            retention_days: plan.retention_days ?? 30,
            screenshot_min_minutes: plan.screenshot_min_minutes ?? 5,
            ai_library_limit_mb: plan.ai_library_limit_mb ?? "",
            website_page_limit: plan.website_page_limit ?? "",
            allow_addons: Boolean(plan.allow_addons),
            allow_app_usage: Boolean(plan.allow_app_usage),
            allow_hr_view: Boolean(plan.allow_hr_view),
            widgets: limits.widgets ?? "",
            included_agents: limits.included_agents ?? "",
            conversations_per_month: limits.conversations_per_month ?? "",
            chat_history_days: limits.chat_history_days ?? "",
            max_messages_per_conversation: limits.max_messages_per_conversation ?? "",
            max_chars_per_message: limits.max_chars_per_message ?? "",
            remove_branding: Boolean(features.remove_branding),
            analytics_basic: Boolean(features.analytics_basic),
            csv_export: Boolean(features.csv_export),
            agent_inbox: Boolean(features.agent_inbox),
            ai_enabled: Boolean(features.ai_enabled ?? true),
            ai_replies_per_month: limits.ai_replies_per_month ?? "",
            ai_max_messages_per_conversation: limits.ai_max_messages_per_conversation ?? "",
            ai_max_chars_per_message: limits.ai_max_chars_per_message ?? ""
          }
        : {
            plan_template: "Custom",
            name: "",
            monthly_price: "",
            yearly_price: "",
            usd_monthly_price: "",
            usd_yearly_price: "",
            addon_monthly_price: "",
            addon_yearly_price: "",
            addon_usd_monthly_price: "",
            addon_usd_yearly_price: "",
            employee_limit: 0,
            retention_days: 30,
            screenshot_min_minutes: 5,
            ai_library_limit_mb: "",
            website_page_limit: "",
            allow_addons: true,
            allow_app_usage: false,
            allow_hr_view: false,
            widgets: "",
            included_agents: "",
            conversations_per_month: "",
            chat_history_days: "",
            max_messages_per_conversation: "",
            max_chars_per_message: "",
            remove_branding: false,
            analytics_basic: false,
            csv_export: false,
            agent_inbox: true,
            ai_enabled: true,
            ai_replies_per_month: "",
            ai_max_messages_per_conversation: "",
            ai_max_chars_per_message: ""
          };
    setPlanModal({ open: true, mode, form, error: "", fieldErrors: {}, loading: false, planId: plan?.id || null });
  }

  function getAiChatbotTemplateDefaults(template) {
    if (!template || template === "Custom") {
      return null;
    }
    const templates = {
      "Free Trial": {
        widgets: 1,
        included_agents: 1,
        conversations_per_month: 200,
        chat_history_days: 7,
        max_messages_per_conversation: 15,
        max_chars_per_message: 700,
        ai_enabled: true,
        ai_replies_per_month: 50,
        allow_addons: false,
        remove_branding: false,
        analytics_basic: false,
        csv_export: false,
        agent_inbox: true
      },
      Starter: {
        widgets: 1,
        included_agents: 1,
        conversations_per_month: 1000,
        chat_history_days: 30,
        max_messages_per_conversation: 20,
        max_chars_per_message: 900,
        ai_enabled: true,
        ai_replies_per_month: 1000,
        allow_addons: true,
        remove_branding: false,
        analytics_basic: true,
        csv_export: false,
        agent_inbox: true
      },
      Growth: {
        widgets: 3,
        included_agents: 3,
        conversations_per_month: 10000,
        chat_history_days: 90,
        max_messages_per_conversation: 30,
        max_chars_per_message: 1200,
        ai_enabled: true,
        ai_replies_per_month: 10000,
        allow_addons: true,
        remove_branding: true,
        analytics_basic: true,
        csv_export: false,
        agent_inbox: true
      },
      Pro: {
        widgets: 10,
        included_agents: 10,
        conversations_per_month: 50000,
        chat_history_days: 180,
        max_messages_per_conversation: 40,
        max_chars_per_message: 1500,
        ai_enabled: true,
        ai_replies_per_month: 50000,
        allow_addons: true,
        remove_branding: true,
        analytics_basic: true,
        csv_export: true,
        agent_inbox: true
      }
    };
    return templates[template] || null;
  }

  async function handlePlanSave() {
    setPlanModal((prev) => ({ ...prev, loading: true, error: "", fieldErrors: {} }));
    try {
      if (isStorageProduct) {
        const trimmedName = (planModal.form.name || "").trim();
        const requiredFields = [
          "name",
          "monthly_price_inr",
          "yearly_price_inr",
          "monthly_price_usd",
          "yearly_price_usd",
          "storage_limit_gb",
          "bandwidth_limit_gb_monthly",
          "device_limit_per_user"
        ];
        const requiredErrors = {};
        const isEmptyValue = (value) => value === "" || value === null || value === undefined;
        requiredFields.forEach((field) => {
          const value = field === "name" ? trimmedName : planModal.form[field];
          if (isEmptyValue(value)) {
            requiredErrors[field] = ["This field is required."];
          }
        });
        if (Object.keys(requiredErrors).length) {
          setPlanModal((prev) => ({
            ...prev,
            loading: false,
            fieldErrors: requiredErrors,
            error: "Please fix the highlighted fields."
          }));
          return;
        }
        const payload = {
          id: planModal.mode === "edit" ? planModal.planId : undefined,
          name: trimmedName,
          monthly_price_inr: planModal.form.monthly_price_inr,
          yearly_price_inr: planModal.form.yearly_price_inr,
          monthly_price_usd: planModal.form.monthly_price_usd,
          yearly_price_usd: planModal.form.yearly_price_usd,
          max_users: planModal.form.max_users === "" ? null : planModal.form.max_users,
          device_limit_per_user: planModal.form.device_limit_per_user === "" ? null : planModal.form.device_limit_per_user,
          storage_limit_gb: planModal.form.storage_limit_gb,
          bandwidth_limit_gb_monthly: planModal.form.bandwidth_limit_gb_monthly,
          is_bandwidth_limited: planModal.form.is_bandwidth_limited !== false,
          is_active: planModal.form.is_active !== false
        };
        await apiFetch("/api/saas-admin/storage/plan", {
          method: "POST",
          body: JSON.stringify(payload)
        });
        await refreshPlans();
        setPlanModal({ open: false, mode: "create", form: {}, error: "", fieldErrors: {}, loading: false, planId: null });
        return;
      }
      const trimmedName = (planModal.form.name || "").trim();
      const requiredFields = isAiChatbotProduct
        ? [
            "name",
            "widgets",
            "included_agents",
            "conversations_per_month",
            "chat_history_days",
            "max_messages_per_conversation",
            "max_chars_per_message",
            "ai_replies_per_month",
            "monthly_price",
            "yearly_price",
            "usd_monthly_price",
            "usd_yearly_price",
            "addon_monthly_price",
            "addon_yearly_price",
            "addon_usd_monthly_price",
            "addon_usd_yearly_price"
          ]
        : [
            "name",
            "employee_limit",
            "retention_days",
            "screenshot_min_minutes",
            "monthly_price",
            "yearly_price",
            "usd_monthly_price",
            "usd_yearly_price",
            "addon_monthly_price",
            "addon_yearly_price",
            "addon_usd_monthly_price",
            "addon_usd_yearly_price"
          ];
      const requiredErrors = {};
      const isEmptyValue = (value) => value === "" || value === null || value === undefined;
      requiredFields.forEach((field) => {
        const value = field === "name" ? trimmedName : planModal.form[field];
        if (isEmptyValue(value)) {
          requiredErrors[field] = ["This field is required."];
        }
      });
      if (Object.keys(requiredErrors).length) {
        setPlanModal((prev) => ({
          ...prev,
          loading: false,
          fieldErrors: requiredErrors,
          error: "Please fix the highlighted fields."
        }));
        return;
      }
      const limits = {
        widgets: planModal.form.widgets ? Number(planModal.form.widgets) : undefined,
        included_agents: planModal.form.included_agents ? Number(planModal.form.included_agents) : undefined,
        conversations_per_month: planModal.form.conversations_per_month ? Number(planModal.form.conversations_per_month) : undefined,
        chat_history_days: planModal.form.chat_history_days ? Number(planModal.form.chat_history_days) : undefined,
        max_messages_per_conversation: planModal.form.max_messages_per_conversation ? Number(planModal.form.max_messages_per_conversation) : undefined,
        max_chars_per_message: planModal.form.max_chars_per_message ? Number(planModal.form.max_chars_per_message) : undefined,
        ai_replies_per_month: planModal.form.ai_replies_per_month ? Number(planModal.form.ai_replies_per_month) : undefined,
        ai_max_messages_per_conversation: planModal.form.ai_max_messages_per_conversation ? Number(planModal.form.ai_max_messages_per_conversation) : undefined,
        ai_max_chars_per_message: planModal.form.ai_max_chars_per_message ? Number(planModal.form.ai_max_chars_per_message) : undefined
      };
      Object.keys(limits).forEach((key) => {
        if (limits[key] === undefined || Number.isNaN(limits[key])) {
          delete limits[key];
        }
      });
      const features = {
        remove_branding: Boolean(planModal.form.remove_branding),
        analytics_basic: Boolean(planModal.form.analytics_basic),
        csv_export: Boolean(planModal.form.csv_export),
        agent_inbox: Boolean(planModal.form.agent_inbox),
        ai_enabled: Boolean(planModal.form.ai_enabled)
      };
      const payload = {
        name: trimmedName,
        product_slug: slug,
        monthly_price: planModal.form.monthly_price,
        yearly_price: planModal.form.yearly_price,
        usd_monthly_price: planModal.form.usd_monthly_price,
        usd_yearly_price: planModal.form.usd_yearly_price,
        addon_monthly_price: planModal.form.addon_monthly_price,
        addon_yearly_price: planModal.form.addon_yearly_price,
        addon_usd_monthly_price: planModal.form.addon_usd_monthly_price,
        addon_usd_yearly_price: planModal.form.addon_usd_yearly_price,
        employee_limit: planModal.form.employee_limit,
        retention_days: planModal.form.retention_days,
        screenshot_min_minutes: planModal.form.screenshot_min_minutes,
        ai_library_limit_mb: planModal.form.ai_library_limit_mb,
        website_page_limit: planModal.form.website_page_limit,
        allow_addons: Boolean(planModal.form.allow_addons),
        allow_app_usage: Boolean(planModal.form.allow_app_usage),
        allow_hr_view: Boolean(planModal.form.allow_hr_view),
        limits,
        features
      };
      [
        "monthly_price",
        "yearly_price",
        "usd_monthly_price",
        "usd_yearly_price",
        "addon_monthly_price",
        "addon_yearly_price",
        "addon_usd_monthly_price",
        "addon_usd_yearly_price",
        "employee_limit",
        "retention_days",
        "screenshot_min_minutes",
        "ai_library_limit_mb",
        "website_page_limit"
      ].forEach((key) => {
        if (payload[key] === "") {
          delete payload[key];
        }
      });
      if (planModal.mode === "edit") {
        await apiFetch(`/api/saas-admin/plans/${planModal.planId}`, {
          method: "PUT",
          body: JSON.stringify(payload)
        });
      } else {
        await apiFetch("/api/saas-admin/plans", { method: "POST", body: JSON.stringify(payload) });
      }
      await refreshPlans();
      setPlanModal({ open: false, mode: "create", form: {}, error: "", fieldErrors: {}, loading: false, planId: null });
    } catch (error) {
      const data = error?.data;
      console.error("Plan save failed", error);
      console.error("Plan save response", data);
      const fieldErrors =
        data && typeof data === "object" && !Array.isArray(data) && !data.error && !data.detail ? data : null;
      setPlanModal((prev) => ({
        ...prev,
        loading: false,
        fieldErrors: fieldErrors || {},
        error: data?.detail || (fieldErrors ? "Please fix the highlighted fields." : error?.message || "Unable to save plan.")
      }));
    }
  }

  async function handlePlanDelete(plan) {
    const confirmed = await confirm({
      title: "Delete Plan",
      message: `Delete ${plan.name}?`,
      confirmText: "Delete",
      confirmVariant: "danger"
    });
    if (!confirmed) {
      return;
    }
    try {
      await apiFetch(`/api/saas-admin/plans/${plan.id}`, { method: "DELETE" });
      await refreshPlans();
    } catch (error) {
      setPlanState((prev) => ({ ...prev, error: error?.message || "Unable to delete plan." }));
    }
  }

  async function handleTransferAction(transferId, action) {
    const actionLabel = action === "approve" ? "Approve" : "Reject";
    const confirmed = await confirm({
      title: `${actionLabel} Transfer`,
      message: `Are you sure you want to ${actionLabel.toLowerCase()} this transfer?`,
      confirmText: actionLabel,
      confirmVariant: action === "approve" ? "primary" : "danger"
    });
    if (!confirmed) {
      return;
    }
    try {
      await apiFetch(`/api/saas-admin/products/${slug}/pending-transfers/${transferId}/${action}`, {
        method: "POST"
      });
      await refreshPending();
      await refreshHistory();
    } catch (error) {
      setPendingState((prev) => ({ ...prev, error: error?.message || "Unable to update transfer." }));
    }
  }

  function openBankDetails(row, titleLabel) {
    setBankModal({ open: true, title: titleLabel, details: row?.bank_details || {} });
  }

  function openBillingView(row) {
    setBillingViewModal({ open: true, row });
  }

  function openPayoutModal(row, type) {
    setPayoutModal({
      open: true,
      row,
      type,
      note: row?.payout_reference || "",
      error: "",
      saving: false
    });
  }

  async function handlePayoutAction(action) {
    if (!payoutModal.row) {
      return;
    }
    const note = payoutModal.note.trim();
    if (!note) {
      setPayoutModal((prev) => ({ ...prev, error: "Please enter details before proceeding." }));
      return;
    }
    setPayoutModal((prev) => ({ ...prev, saving: true, error: "" }));
    try {
      const payload = {
        status: action,
        payout_reference: note,
        payout_date: action === "paid" ? new Date().toISOString().slice(0, 10) : ""
      };
      const endpoint = payoutModal.type === "dealer"
        ? `/api/saas-admin/referrals/dealer-earnings/${payoutModal.row.id}`
        : `/api/saas-admin/referrals/earnings/${payoutModal.row.id}`;
      await apiFetch(endpoint, { method: "POST", body: JSON.stringify(payload) });
      await refreshReferrals();
      setPayoutModal({ open: false, row: null, type: "org", note: "", error: "", saving: false });
    } catch (error) {
      setPayoutModal((prev) => ({
        ...prev,
        saving: false,
        error: error?.message || "Unable to update payout."
      }));
    }
  }

  async function handlePayoutReset(row, type) {
    const confirmed = await confirm({
      title: "Reset Payout",
      message: "Reset this payout back to pending?",
      confirmText: "Reset",
      confirmVariant: "warning"
    });
    if (!confirmed) {
      return;
    }
    try {
      const endpoint = type === "dealer"
        ? `/api/saas-admin/referrals/dealer-earnings/${row.id}`
        : `/api/saas-admin/referrals/earnings/${row.id}`;
      await apiFetch(endpoint, {
        method: "POST",
        body: JSON.stringify({
          status: "pending",
          payout_reference: "",
          payout_date: ""
        })
      });
      await refreshReferrals();
    } catch (error) {
      setReferralsState((prev) => ({
        ...prev,
        error: error?.message || "Unable to reset payout."
      }));
    }
  }

  function updateReferralTable(tab, status, patch) {
    setReferralTableState((prev) => ({
      ...prev,
      [tab]: {
        ...prev[tab],
        [status]: { ...prev[tab][status], ...patch }
      }
    }));
  }

  function filterReferralRows(rows, term) {
    if (!term) {
      return rows;
    }
    const needle = term.toLowerCase();
    return rows.filter((row) =>
      [
        row.referrer_org,
        row.referred_org,
        row.referrer_dealer,
        row.referred_dealer,
        row.base_amount,
        row.commission_rate,
        row.commission_amount,
        row.flat_amount,
        row.status,
        row.payout_reference,
        row.created_at
      ].some((value) => String(value || "").toLowerCase().includes(needle))
    );
  }

  function getPagedRows(rows, term, page, filterFn) {
    const filterRows = filterFn || filterReferralRows;
    const filtered = filterRows(rows, term);
    const totalPages = Math.max(Math.ceil(filtered.length / PAGE_SIZE), 1);
    const currentPage = Math.min(page, totalPages);
    const startIndex = (currentPage - 1) * PAGE_SIZE;
    const paged = filtered.slice(startIndex, startIndex + PAGE_SIZE);
    return { filtered, paged, totalPages, currentPage, startIndex };
  }

  function updateOrgTable(tab, status, patch) {
    setOrgTableState((prev) => ({
      ...prev,
      [tab]: {
        ...prev[tab],
        [status]: { ...prev[tab][status], ...patch }
      }
    }));
  }

  function filterOrgRows(rows, term) {
    if (!term) {
      return rows;
    }
    const needle = term.toLowerCase();
    return rows.filter((row) =>
      [
        row.name,
        row.company_key,
        row.owner_name,
        row.owner_email,
        row.subscription?.plan_name,
        row.subscription?.end_date
      ].some((value) => String(value || "").toLowerCase().includes(needle))
    );
  }

  function filterDealerRows(rows, term) {
    if (!term) {
      return rows;
    }
    const needle = term.toLowerCase();
    return rows.filter((row) =>
      [
        row.name,
        row.username,
        row.email,
        row.referral_code,
        row.referred_by,
        row.subscription_status,
        row.subscription_start,
        row.subscription_end,
        row.subscription_amount
      ].some((value) => String(value || "").toLowerCase().includes(needle))
    );
  }

  function filterDeletedOrgRows(rows, term) {
    if (!term) {
      return rows;
    }
    const needle = term.toLowerCase();
    return rows.filter((row) =>
      [
        row.organization_name,
        row.owner_username,
        row.owner_email,
        row.deleted_at,
        row.reason
      ].some((value) => String(value || "").toLowerCase().includes(needle))
    );
  }

  function filterDeletedDealerRows(rows, term) {
    if (!term) {
      return rows;
    }
    const needle = term.toLowerCase();
    return rows.filter((row) =>
      [
        row.name,
        row.username,
        row.email,
        row.deleted_at,
        row.reason
      ].some((value) => String(value || "").toLowerCase().includes(needle))
    );
  }

  function getOrgStatus(row) {
    const subscription = row.subscription || null;
    if (!subscription) {
      return "inactive";
    }
    if (subscription.status === "expired") {
      return "expired";
    }
    if (subscription.status === "active") {
      if (subscription.end_date) {
        const endDate = new Date(`${subscription.end_date}T23:59:59`);
        if (endDate < new Date()) {
          return "expired";
        }
      }
      return "active";
    }
    return "inactive";
  }

  function splitOrgByStatus(rows) {
    const buckets = { active: [], inactive: [], expired: [] };
    rows.forEach((row) => {
      const status = getOrgStatus(row);
      if (status === "active") {
        buckets.active.push(row);
      } else if (status === "expired") {
        buckets.expired.push(row);
      } else {
        buckets.inactive.push(row);
      }
    });
    return buckets;
  }

  function splitDealerByStatus(rows) {
    const buckets = { active: [], inactive: [], expired: [] };
    rows.forEach((row) => {
      const status = String(row.subscription_status || "").toLowerCase();
      if (status === "active") {
        buckets.active.push(row);
      } else if (status === "expired") {
        buckets.expired.push(row);
      } else {
        buckets.inactive.push(row);
      }
    });
    return buckets;
  }

  function splitReferralsByStatus(rows) {
    const buckets = { pending: [], paid: [], rejected: [] };
    rows.forEach((row) => {
      const status = String(row.status || "pending").toLowerCase();
      if (status === "paid") {
        buckets.paid.push(row);
      } else if (status === "rejected") {
        buckets.rejected.push(row);
      } else {
        buckets.pending.push(row);
      }
    });
    return buckets;
  }

  function renderOrgReferralTable(rows, label, status) {
    const tableState = referralTableState[referralsTab][status];
    const { filtered, paged, totalPages, currentPage, startIndex } = getPagedRows(
      rows,
      tableState.term,
      tableState.page
    );
    return (
      <div className="card p-3 mt-3">
        <div className="d-flex align-items-center justify-content-between flex-wrap gap-2">
          <h6 className="mb-0">{label}</h6>
          <label className="table-search" htmlFor={`referrals-${referralsTab}-${status}-search`}>
            <span>Search:</span>
            <input
              id={`referrals-${referralsTab}-${status}-search`}
              type="text"
              value={tableState.term}
              onChange={(event) =>
                updateReferralTable(referralsTab, status, { term: event.target.value, page: 1 })
              }
              placeholder="Search"
            />
          </label>
        </div>
        <div className="table-responsive mt-2">
          <table className="table table-dark table-striped table-hover align-middle">
            <thead>
              <tr>
                <th>Referrer Org</th>
                <th>Referred Org</th>
                <th>Base</th>
                <th>Rate</th>
                <th>Commission</th>
                <th>Bank Details</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {paged.length ? (
                paged.map((row) => (
                  <tr key={row.id}>
                    <td>{row.referrer_org || "-"}</td>
                    <td>{row.referred_org || "-"}</td>
                    <td>{row.base_amount ?? "-"}</td>
                    <td>{row.commission_rate ?? 0}%</td>
                    <td>{row.commission_amount ?? "-"}</td>
                    <td>
                      <button
                        type="button"
                        className="btn btn-outline-info btn-sm"
                        onClick={() => openBankDetails(row, row.referrer_org || "ORG Account")}
                      >
                        View Account
                      </button>
                    </td>
                    <td>
                      {row.status === "paid" ? (
                        <div className="d-flex align-items-center gap-2 flex-wrap">
                          <span className="badge bg-success">Paid</span>
                          <button
                            type="button"
                            className="btn btn-outline-light btn-sm"
                            onClick={() => handlePayoutReset(row, "org")}
                          >
                            Reset
                          </button>
                        </div>
                      ) : row.status === "rejected" ? (
                        <div className="d-flex align-items-center gap-2 flex-wrap">
                          <span className="badge bg-danger">Rejected</span>
                          <button
                            type="button"
                            className="btn btn-outline-light btn-sm"
                            onClick={() => handlePayoutReset(row, "org")}
                          >
                            Reset
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          className="btn btn-outline-warning btn-sm"
                          onClick={() => openPayoutModal(row, "org")}
                        >
                          Pending
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="7">No referrals found.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="table-footer">
          <div className="table-info">
            Showing {filtered.length ? startIndex + 1 : 0} to {Math.min(startIndex + PAGE_SIZE, filtered.length)} of{" "}
            {filtered.length} entries
          </div>
          <TablePagination
            page={currentPage}
            totalPages={totalPages}
            onPageChange={(nextPage) => updateReferralTable(referralsTab, status, { page: nextPage })}
            showPageLinks
            showPageLabel={false}
            maxPageLinks={7}
          />
        </div>
      </div>
    );
  }

  function renderDealerReferralTable(rows, label, status) {
    const tableState = referralTableState[referralsTab][status];
    const { filtered, paged, totalPages, currentPage, startIndex } = getPagedRows(
      rows,
      tableState.term,
      tableState.page
    );
    return (
      <div className="card p-3 mt-3">
        <div className="d-flex align-items-center justify-content-between flex-wrap gap-2">
          <h6 className="mb-0">{label}</h6>
          <label className="table-search" htmlFor={`referrals-${referralsTab}-${status}-search`}>
            <span>Search:</span>
            <input
              id={`referrals-${referralsTab}-${status}-search`}
              type="text"
              value={tableState.term}
              onChange={(event) =>
                updateReferralTable(referralsTab, status, { term: event.target.value, page: 1 })
              }
              placeholder="Search"
            />
          </label>
        </div>
        <div className="table-responsive mt-2">
          <table className="table table-dark table-striped table-hover align-middle">
            <thead>
              <tr>
                <th>Referrer Dealer</th>
                <th>Referred Org</th>
                <th>Referred Dealer</th>
                <th>Base</th>
                <th>Rate</th>
                <th>Commission</th>
                <th>Flat</th>
                <th>Bank Details</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {paged.length ? (
                paged.map((row) => (
                  <tr key={row.id}>
                    <td>{row.referrer_dealer || "-"}</td>
                    <td>{row.referred_org || "-"}</td>
                    <td>{row.referred_dealer || "-"}</td>
                    <td>{row.base_amount ?? "-"}</td>
                    <td>{row.commission_rate ?? 0}%</td>
                    <td>{row.commission_amount ?? "-"}</td>
                    <td>{row.flat_amount ?? "-"}</td>
                    <td>
                      <button
                        type="button"
                        className="btn btn-outline-info btn-sm"
                        onClick={() => openBankDetails(row, row.referrer_dealer || "Dealer Account")}
                      >
                        View Account
                      </button>
                    </td>
                    <td>
                      {row.status === "paid" ? (
                        <div className="d-flex align-items-center gap-2 flex-wrap">
                          <span className="badge bg-success">Paid</span>
                          <button
                            type="button"
                            className="btn btn-outline-light btn-sm"
                            onClick={() => handlePayoutReset(row, "dealer")}
                          >
                            Reset
                          </button>
                        </div>
                      ) : row.status === "rejected" ? (
                        <div className="d-flex align-items-center gap-2 flex-wrap">
                          <span className="badge bg-danger">Rejected</span>
                          <button
                            type="button"
                            className="btn btn-outline-light btn-sm"
                            onClick={() => handlePayoutReset(row, "dealer")}
                          >
                            Reset
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          className="btn btn-outline-warning btn-sm"
                          onClick={() => openPayoutModal(row, "dealer")}
                        >
                          Pending
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="9">No referrals found.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="table-footer">
          <div className="table-info">
            Showing {filtered.length ? startIndex + 1 : 0} to {Math.min(startIndex + PAGE_SIZE, filtered.length)} of{" "}
            {filtered.length} entries
          </div>
          <TablePagination
            page={currentPage}
            totalPages={totalPages}
            onPageChange={(nextPage) => updateReferralTable(referralsTab, status, { page: nextPage })}
            showPageLinks
            showPageLabel={false}
            maxPageLinks={7}
          />
        </div>
      </div>
    );
  }

  function renderOrgStatusTable(statusKey, label) {
    const rows = statusKey === "deleted" ? deletedOrgs : (orgsByStatus[statusKey] || []);
    const tableState = orgTableState.org[statusKey];
    const filterFn = statusKey === "deleted" ? filterDeletedOrgRows : filterOrgRows;
    const { filtered, paged, totalPages, currentPage, startIndex } = getPagedRows(
      rows,
      tableState.term,
      tableState.page,
      filterFn
    );
    return (
      <div className="card p-3 mt-3">
        <div className="d-flex align-items-center justify-content-between flex-wrap gap-2">
          <h6 className="mb-0">{label}</h6>
          <label className="table-search" htmlFor={`org-${statusKey}-search`}>
            <span>Search:</span>
            <input
              id={`org-${statusKey}-search`}
              type="text"
              value={tableState.term}
              onChange={(event) => updateOrgTable("org", statusKey, { term: event.target.value, page: 1 })}
              placeholder="Search organizations"
            />
          </label>
        </div>
        <div className="table-responsive mt-2">
          <table className="table table-dark table-striped table-hover align-middle">
            <thead>
              {statusKey === "deleted" ? (
                <tr>
                  <th>Organization</th>
                  <th>Owner Username</th>
                  <th>Email ID</th>
                  <th>Deleted At</th>
                  <th>Reason</th>
                </tr>
              ) : (
                <tr>
                  <th>Organization</th>
                  <th>Admin User Name</th>
                  <th>Email ID</th>
                  <th>Plan</th>
                  <th>Expire Date</th>
                  <th>Action</th>
                </tr>
              )}
            </thead>
            <tbody>
              {paged.length ? (
                paged.map((org) =>
                  statusKey === "deleted" ? (
                    <tr key={`${org.organization_name}-${org.deleted_at}`}>
                      <td>{org.organization_name || "-"}</td>
                      <td>{org.owner_username || "-"}</td>
                      <td>{org.owner_email || "-"}</td>
                      <td>{org.deleted_at || "-"}</td>
                      <td>{org.reason || "-"}</td>
                    </tr>
                  ) : (
                    <tr key={org.id}>
                      <td>{org.name}</td>
                      <td>{formatValue(org.owner_name)}</td>
                      <td>{formatValue(org.owner_email)}</td>
                      <td>{org.subscription?.plan_name || "-"}</td>
                      <td>{org.subscription?.end_date || "-"}</td>
                      <td>
                        <button
                          type="button"
                          className="btn btn-outline-light btn-sm me-2"
                          onClick={() => openOrgView(org.id)}
                        >
                          View
                        </button>
                        <button
                          type="button"
                          className="btn btn-primary btn-sm me-2"
                          onClick={() => openOrgEdit(org.id)}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          className="btn btn-danger btn-sm"
                          onClick={() => handleOrgDelete(org)}
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  )
                )
              ) : (
                <tr>
                  <td colSpan={statusKey === "deleted" ? 5 : 6}>
                    {statusKey === "deleted" ? "No deleted organizations found." : "No organizations found."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="table-footer">
          <div className="table-info">
            Showing {filtered.length ? startIndex + 1 : 0} to {Math.min(startIndex + PAGE_SIZE, filtered.length)} of{" "}
            {filtered.length} entries
          </div>
          <TablePagination
            page={currentPage}
            totalPages={totalPages}
            onPageChange={(nextPage) => updateOrgTable("org", statusKey, { page: nextPage })}
            showPageLinks
            showPageLabel={false}
            maxPageLinks={7}
          />
        </div>
      </div>
    );
  }

  function renderDealerStatusTable(statusKey, label) {
    const rows = statusKey === "deleted" ? deletedDealers : (dealersByStatus[statusKey] || []);
    const tableState = orgTableState.dealer[statusKey];
    const filterFn = statusKey === "deleted" ? filterDeletedDealerRows : filterDealerRows;
    const { filtered, paged, totalPages, currentPage, startIndex } = getPagedRows(
      rows,
      tableState.term,
      tableState.page,
      filterFn
    );
    return (
      <div className="card p-3 mt-3">
        <div className="d-flex align-items-center justify-content-between flex-wrap gap-2">
          <h6 className="mb-0">{label}</h6>
          <label className="table-search" htmlFor={`dealer-${statusKey}-search`}>
            <span>Search:</span>
            <input
              id={`dealer-${statusKey}-search`}
              type="text"
              value={tableState.term}
              onChange={(event) => updateOrgTable("dealer", statusKey, { term: event.target.value, page: 1 })}
              placeholder="Search dealers"
            />
          </label>
        </div>
        <div className="table-responsive mt-2">
          <table className="table table-dark table-striped table-hover align-middle">
            <thead>
              {statusKey === "deleted" ? (
                <tr>
                  <th>Dealer</th>
                  <th>Email</th>
                  <th>Deleted At</th>
                  <th>Reason</th>
                </tr>
              ) : (
                <tr>
                  <th>Dealer</th>
                  <th>Email</th>
                  <th>Referral Code</th>
                  <th>Referred By</th>
                  <th>Start</th>
                  <th>End</th>
                  <th>Amount</th>
                  <th>Status</th>
                </tr>
              )}
            </thead>
            <tbody>
              {paged.length ? (
                paged.map((dealer) =>
                  statusKey === "deleted" ? (
                    <tr key={`${dealer.email}-${dealer.deleted_at}`}>
                      <td>{dealer.name || dealer.username || "-"}</td>
                      <td>{dealer.email || "-"}</td>
                      <td>{dealer.deleted_at || "-"}</td>
                      <td>{dealer.reason || "-"}</td>
                    </tr>
                  ) : (
                    <tr key={dealer.id}>
                      <td>{dealer.name || dealer.username || "-"}</td>
                      <td>{dealer.email || "-"}</td>
                      <td>{dealer.referral_code || "-"}</td>
                      <td>{dealer.referred_by || "-"}</td>
                      <td>{dealer.subscription_start || "-"}</td>
                      <td>{dealer.subscription_end || "-"}</td>
                      <td>{dealer.subscription_amount ?? "-"}</td>
                      <td>{titleCase(dealer.subscription_status)}</td>
                    </tr>
                  )
                )
              ) : (
                <tr>
                  <td colSpan={statusKey === "deleted" ? 4 : 8}>
                    {statusKey === "deleted" ? "No deleted dealers found." : "No dealers found."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="table-footer">
          <div className="table-info">
            Showing {filtered.length ? startIndex + 1 : 0} to {Math.min(startIndex + PAGE_SIZE, filtered.length)} of{" "}
            {filtered.length} entries
          </div>
          <TablePagination
            page={currentPage}
            totalPages={totalPages}
            onPageChange={(nextPage) => updateOrgTable("dealer", statusKey, { page: nextPage })}
            showPageLinks
            showPageLabel={false}
            maxPageLinks={7}
          />
        </div>
      </div>
    );
  }

  if (state.loading) {
    return (
      <div className="card p-4 text-center">
        <div className="spinner" />
        <p className="mb-0">Loading product dashboard...</p>
      </div>
    );
  }

  if (state.error) {
    return <div className="alert alert-danger">{state.error}</div>;
  }

  let sections = [
    { key: "organizations", label: "Organizations", icon: "bi-building" },
    { key: "users", label: "Users", icon: "bi-people" },
    { key: "plans", label: "Plans", icon: "bi-clipboard-check" },
    { key: "pending-transfers", label: "Pending Transfers", icon: "bi-hourglass-split" },
    { key: "renewals", label: "Renewals", icon: "bi-arrow-repeat" },
    { key: "billing", label: "Billing", icon: "bi-receipt" },
    { key: "referrals", label: "Referrals", icon: "bi-people-fill" },
    { key: "support-access", label: "Support Access", icon: "bi-shield-lock" },
    { key: "observability", label: "Observability", icon: "bi-bar-chart" }
  ];
  if (isAiChatbotProduct) {
    sections.splice(6, 0, { key: "ai-usage", label: "AI Usage & Spend", icon: "bi-cpu" });
    sections.splice(7, 0, { key: "openai-settings", label: "API Settings", icon: "bi-key" });
  }
  const orgStatusLabels = {
    active: "Active ORG",
    inactive: "Inactive ORG",
    expired: "Expired ORG",
    deleted: "Deleted ORG"
  };
  const dealerStatusLabels = {
    active: "Active Dealers",
    inactive: "Inactive Dealers",
    expired: "Expired Dealers",
    deleted: "Deleted Dealers"
  };

  return (
    <>
      <div className="d-flex align-items-center justify-content-between flex-wrap gap-2">
        <div>
          <h2 className="page-title">{product.name || "Product Dashboard"}</h2>
          <div className="text-secondary">
            {getProductDescription(product.description, product.slug || slug)}
          </div>
        </div>
        <Link to="/saas-admin" className="btn btn-outline-light btn-sm">
          Back to SaaS Admin
        </Link>
      </div>
      <hr className="section-divider" />

      <div className="row g-3">
        {statCards.map((card) => (
          <div className="col-12 col-md-6 col-lg-4 col-xl-2" key={card.label}>
            <div className="card p-3 h-100 stat-card">
              <div className="stat-icon stat-icon-primary">
                <i className={`bi ${card.icon}`} aria-hidden="true" />
              </div>
              <h6 className="mb-1">{card.label}</h6>
              <div className="stat-value">{card.value}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="product-admin-layout mt-4">
        <aside className="product-admin-sidebar">
          <div className="card p-3">
            <div className="product-admin-nav">
              {sections.map((section) => (
                <Link
                  key={section.key}
                  to={`/saas-admin/products/${slug}#${section.key}`}
                  className={`product-admin-link ${activeSection === section.key ? "active" : ""}`}
                >
                  <i className={`bi ${section.icon}`} aria-hidden="true" />
                  <span>{section.label}</span>
                </Link>
              ))}
            </div>
          </div>
        </aside>

        <section className="product-admin-content">
          {activeSection === "organizations" ? (
            <div className="card p-3">
              <div className="d-flex align-items-center justify-content-between flex-wrap gap-2">
                <h5 className="mb-0">Organizations</h5>
              </div>
              {orgState.error ? (
                <div className="alert alert-danger mt-2">{orgState.error}</div>
              ) : null}
              <div className="d-flex gap-2 flex-wrap mt-2">
                <button
                  type="button"
                  className={`btn btn-sm ${orgTypeTab === "org" ? "btn-primary" : "btn-outline-light"}`}
                  onClick={() => setOrgTypeTab("org")}
                >
                  ORG
                </button>
                <button
                  type="button"
                  className={`btn btn-sm ${orgTypeTab === "dealer" ? "btn-primary" : "btn-outline-light"}`}
                  onClick={() => setOrgTypeTab("dealer")}
                >
                  Dealers
                </button>
              </div>
              {orgTypeTab === "org" ? (
                <div className="d-flex gap-2 flex-wrap mt-2">
                  {Object.keys(orgStatusLabels).map((status) => (
                    <button
                      key={status}
                      type="button"
                      className={`btn btn-sm ${orgStatusTab === status ? "btn-primary" : "btn-outline-light"}`}
                      onClick={() => setOrgStatusTab(status)}
                    >
                      {orgStatusLabels[status]}
                    </button>
                  ))}
                </div>
              ) : (
                <div className="d-flex gap-2 flex-wrap mt-2">
                  {Object.keys(dealerStatusLabels).map((status) => (
                    <button
                      key={status}
                      type="button"
                      className={`btn btn-sm ${dealerStatusTab === status ? "btn-primary" : "btn-outline-light"}`}
                      onClick={() => setDealerStatusTab(status)}
                    >
                      {dealerStatusLabels[status]}
                    </button>
                  ))}
                </div>
              )}
              {orgTypeTab === "org"
                ? renderOrgStatusTable(orgStatusTab, orgStatusLabels[orgStatusTab])
                : renderDealerStatusTable(dealerStatusTab, dealerStatusLabels[dealerStatusTab])}
            </div>
          ) : null}

          {activeSection === "users" ? (
            <div className="card p-3">
              <div className="d-flex align-items-center justify-content-between flex-wrap gap-2">
                <h5 className="mb-0">Users</h5>
                <label className="table-search" htmlFor="product-user-search">
                  <span>Search:</span>
                  <input
                    id="product-user-search"
                    type="text"
                    value={userSearchTerm}
                    onChange={(event) => setUserSearchTerm(event.target.value)}
                    placeholder="Search users"
                  />
                </label>
              </div>
              {userState.error ? (
                <div className="alert alert-danger mt-2">{userState.error}</div>
              ) : null}
              <div className="table-responsive mt-2">
                <table className="table table-dark table-striped table-hover align-middle">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Email</th>
                      <th>Organization</th>
                      <th>Device ID</th>
                      <th>PC Name</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {userPaged.length ? (
                      userPaged.map((user) => (
                        <tr key={user.id}>
                          <td>{user.name}</td>
                          <td>{formatValue(user.email)}</td>
                          <td>{formatValue(user.org_name)}</td>
                          <td>{formatValue(user.device_id)}</td>
                          <td>{formatValue(user.pc_name)}</td>
                          <td>
                            <button
                              type="button"
                              className="btn btn-outline-light btn-sm me-2"
                              onClick={() => openUserView(user.id)}
                            >
                              View
                            </button>
                            {isStorageProduct ? null : (
                              <>
                                <button
                                  type="button"
                                  className="btn btn-primary btn-sm me-2"
                                  onClick={() => openUserEdit(user.id)}
                                >
                                  Edit
                                </button>
                                <button
                                  type="button"
                                  className="btn btn-danger btn-sm"
                                  onClick={() => handleUserDelete(user)}
                                >
                                  Delete
                                </button>
                              </>
                            )}
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan="6">No users found.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              <div className="table-footer">
                <div className="table-info">
                  Showing {userPaged.length ? (userPage - 1) * PAGE_SIZE + 1 : 0} to {userPaged.length ? Math.min(userPage * PAGE_SIZE, filteredUsers.length) : 0} of {filteredUsers.length} entries
                </div>
                <TablePagination
                  page={userPage}
                  totalPages={userTotalPages}
                  onPageChange={setUserPage}
                  showPageLinks
                  showPageLabel={false}
                  maxPageLinks={7}
                />
              </div>
            </div>
          ) : null}

          {activeSection === "plans" ? (
            <div className="card p-3">
              <div className="d-flex align-items-center justify-content-between flex-wrap gap-2">
                <h5 className="mb-0">Plans</h5>
                <button type="button" className="btn btn-primary btn-sm" onClick={() => openPlanModal("create")}>Create Plan</button>
              </div>
              {planState.error ? (
                <div className="alert alert-danger mt-2">{planState.error}</div>
              ) : null}
              <div className="table-responsive mt-2">
                <table className="table table-dark table-striped table-hover align-middle">
                  <thead>
                    <tr>
                      <th>Plan</th>
                      <th>Monthly</th>
                      {isStorageProduct ? (
                        <>
                          <th>Max Users</th>
                          <th>Device/User</th>
                          <th>Storage (GB)</th>
                          <th>Status</th>
                        </>
                      ) : (
                        <th>Yearly</th>
                      )}
                      {isStorageProduct ? null : isAiChatbotProduct ? (
                        <>
                          <th>Widgets</th>
                          <th>Agents</th>
                          <th>Conversations/mo</th>
                          <th>Chat history (days)</th>
                          <th>AI replies/mo</th>
                          <th>Add-ons</th>
                        </>
                      ) : (
                        <>
                          <th>Employees</th>
                          <th>Add-ons</th>
                          <th>App Usage</th>
                        </>
                      )}
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {plans.length ? (
                      plans.map((plan) => (
                        <tr key={plan.id}>
                          <td>{plan.name}</td>
                          <td>{formatValue(plan.monthly_price_inr ?? plan.monthly_price)}</td>
                          {isStorageProduct ? (
                            <>
                              <td>{formatValue(plan.max_users ?? "-")}</td>
                              <td>{formatValue(plan.device_limit_per_user ?? "-")}</td>
                              <td>{formatValue(plan.storage_limit_gb ?? "-")}</td>
                              <td>{plan.is_active === false ? "Inactive" : "Active"}</td>
                            </>
                          ) : (
                            <td>{formatValue(plan.yearly_price)}</td>
                          )}
                          {isStorageProduct ? null : isAiChatbotProduct ? (
                            <>
                              <td>{plan.limits?.widgets ?? "-"}</td>
                              <td>{plan.limits?.included_agents ?? "-"}</td>
                              <td>{plan.limits?.conversations_per_month ?? "-"}</td>
                              <td>{plan.limits?.chat_history_days ?? "-"}</td>
                              <td>{plan.limits?.ai_replies_per_month ?? "-"}</td>
                              <td>{plan.allow_addons ? "Enabled" : "Disabled"}</td>
                            </>
                          ) : (
                            <>
                              <td>{plan.employee_limit === 0 ? "Unlimited" : plan.employee_limit}</td>
                              <td>{plan.allow_addons ? "Enabled" : "Disabled"}</td>
                              <td>{plan.allow_app_usage ? "Enabled" : "Disabled"}</td>
                            </>
                          )}
                          <td>
                            <button
                              type="button"
                              className="btn btn-outline-light btn-sm me-2"
                              onClick={() => openPlanModal("edit", plan)}
                            >
                              Edit
                            </button>
                            {isStorageProduct ? null : (
                              <button
                                type="button"
                                className="btn btn-danger btn-sm"
                                onClick={() => handlePlanDelete(plan)}
                              >
                                Delete
                              </button>
                            )}
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={isStorageProduct ? 7 : isAiChatbotProduct ? 10 : 7}>No plans found.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}

          {activeSection === "observability" ? (
            <div className="card p-3">
              <div className="d-flex align-items-center justify-content-between flex-wrap gap-2">
                <h5 className="mb-0">Observability</h5>
                <Link to="/saas-admin/observability" className="btn btn-outline-light btn-sm">
                  Open Full View
                </Link>
              </div>
              <div className="mt-3">
                <SaasAdminObservabilityPage
                  initialProduct={product.slug || slug}
                  showTitle={false}
                />
              </div>
            </div>
          ) : null}

          {activeSection === "ai-usage" ? (
            <div className="card p-3">
              <div className="d-flex align-items-center justify-content-between flex-wrap gap-2">
                <div>
                  <h5 className="mb-0">AI Usage & Spend</h5>
                  {aiUsagePeriod ? <div className="text-secondary small">Period: {aiUsagePeriod}</div> : null}
                </div>
                <button type="button" className="btn btn-outline-light btn-sm" onClick={refreshAiUsage}>
                  Refresh
                </button>
              </div>
              <div className="d-flex gap-3 flex-wrap align-items-center mt-2">
                <label className="d-flex align-items-center gap-2">
                  <span>Days</span>
                  <select
                    className="form-select form-select-sm"
                    value={aiUsageDays}
                    onChange={(event) => setAiUsageDays(Number(event.target.value))}
                  >
                    <option value={7}>7 days</option>
                    <option value={14}>14 days</option>
                    <option value={30}>30 days</option>
                  </select>
                </label>
                <label className="d-flex align-items-center gap-2">
                  <span>Year</span>
                  <select
                    className="form-select form-select-sm"
                    value={aiUsageYear}
                    onChange={(event) => setAiUsageYear(Number(event.target.value))}
                  >
                    {aiUsageYears.map((year) => (
                      <option key={year} value={year}>
                        {year}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="d-flex align-items-center gap-2">
                  <span>Month</span>
                  <select
                    className="form-select form-select-sm"
                    value={aiUsageMonth}
                    onChange={(event) => setAiUsageMonth(Number(event.target.value))}
                  >
                    {aiUsageMonths.map((month) => (
                      <option key={month} value={month}>
                        {month.toString().padStart(2, "0")}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="d-flex align-items-center gap-2">
                  <span>Organization</span>
                  <select
                    className="form-select form-select-sm"
                    value={aiUsageOrgId}
                    onChange={(event) => setAiUsageOrgId(event.target.value)}
                  >
                    <option value="">All</option>
                    {orgs.map((org) => (
                      <option key={org.id} value={String(org.id)}>
                        {org.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              {aiUsageState.loading ? <div className="text-secondary mt-2">Loading...</div> : null}
              {aiUsageState.error ? <div className="alert alert-danger mt-2">{aiUsageState.error}</div> : null}
              {aiUsageAlerts.length || aiUsageLocalAlert ? (
                <div className={`alert ${aiUsageLocalAlert?.level === "danger" ? "alert-danger" : "alert-warning"} mt-2`}>
                  {aiUsageLocalAlert ? <div>{aiUsageLocalAlert.message}</div> : null}
                  {aiUsageAlerts.map((alert, index) => (
                    <div key={`${alert.level}-${index}`}>{alert.message}</div>
                  ))}
                </div>
              ) : null}
              <div className="row g-3 mt-1">
                <div className="col-12 col-md-4">
                  <div className="card p-3 h-100 stat-card">
                    <div className="stat-icon stat-icon-primary">
                      <i className="bi bi-robot" aria-hidden="true" />
                    </div>
                    <h6 className="mb-1">AI Replies Used</h6>
                    <div className="stat-value">
                      {Number(aiUsageTotals.ai_replies_used ?? 0).toLocaleString()}
                    </div>
                  </div>
                </div>
                <div className="col-12 col-md-4">
                  <div className="card p-3 h-100 stat-card">
                    <div className="stat-icon stat-icon-primary">
                      <i className="bi bi-speedometer2" aria-hidden="true" />
                    </div>
                    <h6 className="mb-1">AI Usage Limit</h6>
                    <div className="stat-value">
                      {aiUsageLimit ? aiUsageLimit.toLocaleString() : "-"}
                    </div>
                    {aiUsageLimit ? (
                      <div className="text-secondary small">{aiUsagePercent}% used</div>
                    ) : null}
                  </div>
                </div>
                <div className="col-12 col-md-4">
                  <div className="card p-3 h-100 stat-card">
                    <div className="stat-icon stat-icon-primary">
                      <i className="bi bi-hash" aria-hidden="true" />
                    </div>
                    <h6 className="mb-1">Tokens Total</h6>
                    <div className="stat-value">
                      {Number(aiUsageTotals.tokens_total ?? 0).toLocaleString()}
                    </div>
                  </div>
                </div>
                <div className="col-12 col-md-4">
                  <div className="card p-3 h-100 stat-card">
                    <div className="stat-icon stat-icon-primary">
                      <i className="bi bi-currency-rupee" aria-hidden="true" />
                    </div>
                    <h6 className="mb-1">Estimated Cost (INR)</h6>
                    <div className="stat-value">
                      INR {Number(aiUsageDisplayInr).toLocaleString()}
                    </div>
                  </div>
                </div>
              </div>
              <div className="table-responsive mt-3">
                <table className="table table-dark table-striped table-hover align-middle">
                  <thead>
                    <tr>
                      <th>Organization</th>
                      <th>Replies</th>
                      <th>Tokens</th>
                      <th>Estimated INR</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {aiUsageTopOrgs.length ? (
                      aiUsageTopOrgs.map((row) => {
                        const rowTokens = Number(row.tokens_total ?? 0);
                        const rowReplies = Number(row.ai_replies_used ?? 0);
                        const rowEstimateFromTokens = rowTokens > 0
                          ? estimateCostInr(rowTokens / aiUsageTokenPerReply, aiUsageTokenPerReply, aiUsageTokenRate, aiUsageUsdToInr)
                          : null;
                        const rowEstimateFromReplies = rowReplies > 0
                          ? estimateCostInr(rowReplies, aiUsageTokenPerReply, aiUsageTokenRate, aiUsageUsdToInr)
                          : null;
                        const rowDisplayInr = Number(row.cost_inr_est ?? 0) || rowEstimateFromTokens?.costInr || rowEstimateFromReplies?.costInr || 0;
                        return (
                          <tr key={row.org_id}>
                            <td>{row.org_name || "-"}</td>
                            <td>{rowReplies.toLocaleString()}</td>
                            <td>{rowTokens.toLocaleString()}</td>
                            <td>INR {Number(rowDisplayInr).toLocaleString()}</td>
                            <td>
                              <button
                                type="button"
                                className="btn btn-outline-light btn-sm"
                                onClick={() => openAiUsageTrend(row)}
                              >
                                View Trend
                              </button>
                            </td>
                          </tr>
                        );
                      })
                    ) : (
                      <tr>
                        <td colSpan={5}>No usage data found.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}

          {activeSection === "openai-settings" ? (
            <div className="card p-3">
              <div className="d-flex align-items-center justify-content-between flex-wrap gap-2">
                <h5 className="mb-0">API Settings</h5>
                <button
                  type="button"
                  className="btn btn-outline-light btn-sm"
                  onClick={refreshOpenAiSettings}
                >
                  Refresh
                </button>
              </div>
              {openAiState.error ? <div className="alert alert-danger mt-2">{openAiState.error}</div> : null}
              {!openAiHasKey || !openAiState.form.is_active ? (
                <div className="alert alert-warning mt-2">
                  {!openAiHasKey ? <div>OpenAI API key is missing.</div> : null}
                  {!openAiState.form.is_active ? <div>AI is currently disabled globally.</div> : null}
                </div>
              ) : null}
              <div className="text-secondary small mt-1">
                {openAiMaskedKey ? `API Key: ${openAiMaskedKey}` : "API Key: Not set"}
              </div>
              {openAiState.saved ? (
                <div className="text-secondary small">Last updated: {openAiState.saved}</div>
              ) : null}
              <div className="modal-form-grid mt-3">
                <div className="modal-form-field">
                  <label>OpenAI API Key</label>
                  <input
                    type="password"
                    value={openAiState.form.api_key}
                    onChange={(event) =>
                      setOpenAiState((prev) => ({
                        ...prev,
                        form: { ...prev.form, api_key: event.target.value }
                      }))
                    }
                    placeholder="Enter new key to update"
                  />
                </div>
                <div className="modal-form-field">
                  <label>Default Model</label>
                  <input
                    type="text"
                    value={openAiState.form.model}
                    onChange={(event) =>
                      setOpenAiState((prev) => ({
                        ...prev,
                        form: { ...prev.form, model: event.target.value }
                      }))
                    }
                  />
                </div>
                <div className="modal-form-field">
                  <label>Input Cost / 1K Tokens (INR)</label>
                  <input
                    type="number"
                    value={openAiState.form.input_cost_per_1k_tokens_inr}
                    onChange={(event) =>
                      setOpenAiState((prev) => ({
                        ...prev,
                        form: { ...prev.form, input_cost_per_1k_tokens_inr: event.target.value }
                      }))
                    }
                  />
                </div>
                <div className="modal-form-field">
                  <label>Output Cost / 1K Tokens (INR)</label>
                  <input
                    type="number"
                    value={openAiState.form.output_cost_per_1k_tokens_inr}
                    onChange={(event) =>
                      setOpenAiState((prev) => ({
                        ...prev,
                        form: { ...prev.form, output_cost_per_1k_tokens_inr: event.target.value }
                      }))
                    }
                  />
                </div>
                <div className="modal-form-field">
                  <label>Markup %</label>
                  <input
                    type="number"
                    value={openAiState.form.fixed_markup_percent}
                    onChange={(event) =>
                      setOpenAiState((prev) => ({
                        ...prev,
                        form: { ...prev.form, fixed_markup_percent: event.target.value }
                      }))
                    }
                  />
                </div>
                <div className="modal-form-field">
                  <label>AI Enabled</label>
                  <select
                    value={openAiState.form.is_active ? "yes" : "no"}
                    onChange={(event) =>
                      setOpenAiState((prev) => ({
                        ...prev,
                        form: { ...prev.form, is_active: event.target.value === "yes" }
                      }))
                    }
                  >
                    <option value="yes">Yes</option>
                    <option value="no">No</option>
                  </select>
                </div>
              </div>
              {openAiTestState.message ? (
                <div className={`alert mt-3 ${openAiTestState.ok ? "alert-success" : "alert-danger"}`}>
                  {openAiTestState.message}
                </div>
              ) : null}
              <div className="d-flex justify-content-end gap-2 mt-3">
                <button
                  type="button"
                  className="btn btn-outline-light"
                  onClick={testOpenAiConnection}
                  disabled={openAiTestState.loading || openAiState.loading}
                >
                  {openAiTestState.loading ? "Testing..." : "Test Connection"}
                </button>
                <button
                  type="button"
                  className="btn btn-success"
                  onClick={saveOpenAiSettings}
                  disabled={openAiState.loading}
                >
                  {openAiState.loading ? "Saving..." : "Save"}
                </button>
              </div>
            </div>
          ) : null}

          {activeSection === "pending-transfers" ? (
            <div className="card p-3">
              <div className="d-flex align-items-center justify-content-between flex-wrap gap-2">
                <h5 className="mb-0">Pending Transfers</h5>
              </div>
              <div className="d-flex gap-2 flex-wrap mt-2">
                <button
                  type="button"
                  className={`btn btn-sm ${pendingTab === "org" ? "btn-primary" : "btn-outline-light"}`}
                  onClick={() => setPendingTab("org")}
                >
                  ORG Transfers
                </button>
                <button
                  type="button"
                  className={`btn btn-sm ${pendingTab === "dealer" ? "btn-primary" : "btn-outline-light"}`}
                  onClick={() => setPendingTab("dealer")}
                >
                  Dealer Transfers
                </button>
              </div>
              {pendingState.error ? (
                <div className="alert alert-danger mt-2">{pendingState.error}</div>
              ) : null}
              <div className="table-controls mt-2">
                <div className="table-length">Show {PAGE_SIZE} entries</div>
                <label className="table-search" htmlFor="pending-search">
                  <span>Search:</span>
                  <input
                    id="pending-search"
                    type="text"
                    value={pendingSearchTerm}
                    onChange={(event) => setPendingSearchTerm(event.target.value)}
                    placeholder="Search transfers"
                  />
                </label>
              </div>
              <div className="table-responsive mt-2">
                <table className="table table-dark table-striped table-hover align-middle">
                  <thead>
                    <tr>
                      <th>{pendingNameLabel}</th>
                      <th>Type</th>
                      <th>Plan</th>
                      <th>Amount</th>
                      <th>Billing Cycle</th>
                      <th>Created</th>
                      <th>Receipt</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pendingPaged.length ? (
                      pendingPaged.map((transfer) => (
                        <tr key={transfer.id}>
                          <td>{transfer.organization}</td>
                          <td>{titleCase(transfer.request_type)}</td>
                          <td>{transfer.plan}</td>
                          <td>{transfer.currency} {transfer.amount}</td>
                          <td>{titleCase(transfer.billing_cycle)}</td>
                          <td>{transfer.created_at || "-"}</td>
                          <td>
                            {transfer.receipt_url ? (
                              <button
                                type="button"
                                className="btn btn-outline-light btn-sm"
                                onClick={() =>
                                  setReceiptModal({
                                    open: true,
                                    url: transfer.receipt_url,
                                    transferId: transfer.id,
                                    clearing: false
                                  })
                                }
                              >
                                View Image
                              </button>
                            ) : (
                              <span className="text-secondary">Not Available</span>
                            )}
                          </td>
                          <td>
                            <button
                              type="button"
                              className="btn btn-outline-info btn-sm me-2"
                              onClick={() => openTransferView(transfer.id)}
                            >
                              View
                            </button>
                            <button
                              type="button"
                              className="btn btn-success btn-sm me-2"
                              onClick={() => handleTransferAction(transfer.id, "approve")}
                            >
                              Approve
                            </button>
                            <button
                              type="button"
                              className="btn btn-danger btn-sm"
                              onClick={() => handleTransferAction(transfer.id, "reject")}
                            >
                              Reject
                            </button>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan="8">No pending transfers.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              <div className="table-footer">
                <div className="table-info">
                  Showing {pendingFiltered.length ? (pendingPage - 1) * PAGE_SIZE + 1 : 0}
                  {" "}to {Math.min(pendingPage * PAGE_SIZE, pendingFiltered.length)} of {pendingFiltered.length} entries
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
          ) : null}

          {activeSection === "pending-transfers" ? (
            <div className="card p-3 mt-3">
              <div className="d-flex align-items-center justify-content-between flex-wrap gap-2">
                <h5 className="mb-0">Transfer History</h5>
              </div>
              <div className="d-flex gap-2 flex-wrap mt-2">
                <button
                  type="button"
                  className={`btn btn-sm ${historyTab === "approved" ? "btn-primary" : "btn-outline-light"}`}
                  onClick={() => setHistoryTab("approved")}
                >
                  Approved Transfers
                </button>
                <button
                  type="button"
                  className={`btn btn-sm ${historyTab === "rejected" ? "btn-primary" : "btn-outline-light"}`}
                  onClick={() => setHistoryTab("rejected")}
                >
                  Rejected Transfers
                </button>
              </div>
              <div className="d-flex gap-2 flex-wrap mt-2">
                <button
                  type="button"
                  className={`btn btn-sm ${historyType === "org" ? "btn-primary" : "btn-outline-light"}`}
                  onClick={() => setHistoryType("org")}
                >
                  ORG Transfers
                </button>
                <button
                  type="button"
                  className={`btn btn-sm ${historyType === "dealer" ? "btn-primary" : "btn-outline-light"}`}
                  onClick={() => setHistoryType("dealer")}
                >
                  Dealer Transfers
                </button>
              </div>
              {historyState.error ? (
                <div className="alert alert-danger mt-2">{historyState.error}</div>
              ) : null}
              <div className="table-controls mt-2">
                <div className="table-length">Show {PAGE_SIZE} entries</div>
                <label className="table-search" htmlFor="history-search">
                  <span>Search:</span>
                  <input
                    id="history-search"
                    type="text"
                    value={historySearchTerm}
                    onChange={(event) => setHistorySearchTerm(event.target.value)}
                    placeholder="Search transfers"
                  />
                </label>
              </div>
              <div className="table-responsive mt-2">
                <table className="table table-dark table-striped table-hover align-middle">
                  <thead>
                    <tr>
                      <th>Organization / Dealer</th>
                      <th>Type</th>
                      <th>Plan</th>
                      <th>Amount</th>
                      <th>Billing Cycle</th>
                      <th>Updated</th>
                      <th>{historyTab === "approved" ? "Attachment" : "Receipt"}</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {historyPaged.length ? (
                      historyPaged.map((transfer) => (
                        <tr key={transfer.id}>
                          <td>{transfer.organization}</td>
                          <td>{titleCase(transfer.request_type)}</td>
                          <td>{transfer.plan}</td>
                          <td>{transfer.currency} {transfer.amount}</td>
                          <td>{titleCase(transfer.billing_cycle)}</td>
                          <td>{transfer.updated_at || "-"}</td>
                          <td>
                            {transfer.receipt_url ? (
                              <div className="d-flex gap-2 flex-wrap">
                                <button
                                  type="button"
                                  className="btn btn-outline-light btn-sm"
                                  onClick={() =>
                                    setReceiptModal({
                                      open: true,
                                      url: transfer.receipt_url,
                                      transferId: transfer.id,
                                      clearing: false
                                    })
                                  }
                                >
                                  {historyTab === "approved" ? "Attachment" : "View Image"}
                                </button>
                                {historyTab === "approved" ? (
                                  <button
                                    type="button"
                                    className="btn btn-outline-danger btn-sm"
                                    onClick={() => handleHistoryReceiptClear(transfer.id)}
                                  >
                                    Delete
                                  </button>
                                ) : null}
                              </div>
                            ) : (
                              <span className="text-secondary">Not Available</span>
                            )}
                          </td>
                          <td>{titleCase(transfer.status)}</td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan="8">No transfer history.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              <div className="table-footer">
                <div className="table-info">
                  Showing {historyFiltered.length ? (historyPage - 1) * PAGE_SIZE + 1 : 0}
                  {" "}to {Math.min(historyPage * PAGE_SIZE, historyFiltered.length)} of {historyFiltered.length} entries
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
            </div>
          ) : null}

          {activeSection === "renewals" ? (
            <div className="card p-3">
              <div className="d-flex align-items-center justify-content-between flex-wrap gap-2">
                <h5 className="mb-0">Renewals</h5>
              </div>
              <div className="d-flex gap-2 flex-wrap mt-2">
                <button
                  type="button"
                  className={`btn btn-sm ${renewalsTab === "upcoming" ? "btn-primary" : "btn-outline-light"}`}
                  onClick={() => {
                    setRenewalsTab("upcoming");
                    setRenewalsCycle("monthly");
                    setRenewalsPage(1);
                  }}
                >
                  Upcoming Renewals
                </button>
                <button
                  type="button"
                  className={`btn btn-sm ${renewalsTab === "missed" ? "btn-primary" : "btn-outline-light"}`}
                  onClick={() => {
                    setRenewalsTab("missed");
                    setRenewalsCycle("monthly");
                    setRenewalsPage(1);
                  }}
                >
                  Missed Renewals
                </button>
                <button
                  type="button"
                  className={`btn btn-sm ${renewalsTab === "deleted" ? "btn-primary" : "btn-outline-light"}`}
                  onClick={() => {
                    setRenewalsTab("deleted");
                    setRenewalsCycle("monthly");
                    setRenewalsPage(1);
                  }}
                >
                  Deleted Accounts
                </button>
              </div>
              {renewalsTab !== "deleted" ? (
                <div className="d-flex gap-2 flex-wrap mt-2">
                  <button
                    type="button"
                    className={`btn btn-sm ${renewalsCycle === "monthly" ? "btn-primary" : "btn-outline-light"}`}
                    onClick={() => {
                      setRenewalsCycle("monthly");
                      setRenewalsPage(1);
                    }}
                  >
                    Monthly
                  </button>
                  <button
                    type="button"
                    className={`btn btn-sm ${renewalsCycle === "yearly" ? "btn-primary" : "btn-outline-light"}`}
                    onClick={() => {
                      setRenewalsCycle("yearly");
                      setRenewalsPage(1);
                    }}
                  >
                    Yearly
                  </button>
                </div>
              ) : null}
              {renewalsState.error ? (
                <div className="alert alert-danger mt-2">{renewalsState.error}</div>
              ) : null}
              <div className="table-controls mt-2">
                <div className="table-length">Show {PAGE_SIZE} entries</div>
                <label className="table-search" htmlFor="renewals-search">
                  <span>Search:</span>
                  <input
                    id="renewals-search"
                    type="text"
                    value={renewalsSearchTerm}
                    onChange={(event) => setRenewalsSearchTerm(event.target.value)}
                    placeholder="Search renewals"
                  />
                </label>
              </div>
              <div className="table-responsive mt-2">
                <table className="table table-dark table-striped table-hover align-middle">
                  {renewalsTab === "deleted" ? (
                    <>
                      <thead>
                        <tr>
                          <th>Organization</th>
                          <th>Owner</th>
                          <th>Email</th>
                          <th>Deleted At</th>
                          <th>Reason</th>
                        </tr>
                      </thead>
                      <tbody>
                        {renewalsPaged.length ? (
                          renewalsPaged.map((row, idx) => (
                            <tr key={`${row.organization_name}-${idx}`}>
                              <td>{row.organization_name || "-"}</td>
                              <td>{row.owner_username || "-"}</td>
                              <td>{row.owner_email || "-"}</td>
                              <td>{row.deleted_at || "-"}</td>
                              <td>{row.reason || "-"}</td>
                            </tr>
                          ))
                        ) : (
                          <tr>
                            <td colSpan="5">No deleted accounts.</td>
                          </tr>
                        )}
                      </tbody>
                    </>
                  ) : (
                    <>
                      <thead>
                        <tr>
                          <th>Organization</th>
                          <th>Owner</th>
                          <th>Email</th>
                          <th>Plan</th>
                          <th>Billing Cycle</th>
                          <th>End Date</th>
                          <th>{renewalsTab === "missed" ? "Days Overdue" : "Days Remaining"}</th>
                          <th>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {renewalsPaged.length ? (
                          renewalsPaged.map((row, idx) => (
                            <tr key={`${row.organization}-${idx}`}>
                              <td>{row.organization || "-"}</td>
                              <td>{row.owner_name || "-"}</td>
                              <td>{row.owner_email || "-"}</td>
                              <td>{row.plan || "-"}</td>
                              <td>{titleCase(row.billing_cycle)}</td>
                              <td>{row.end_date || "-"}</td>
                              <td>
                                {renewalsTab === "missed"
                                  ? row.days_overdue ?? "-"
                                  : row.days_remaining ?? "-"}
                              </td>
                              <td>{titleCase(row.status)}</td>
                            </tr>
                          ))
                        ) : (
                          <tr>
                            <td colSpan="8">No renewals found.</td>
                          </tr>
                        )}
                      </tbody>
                    </>
                  )}
                </table>
              </div>
              <div className="table-footer">
                <div className="table-info">
                  Showing {renewalsFiltered.length ? (renewalsPage - 1) * PAGE_SIZE + 1 : 0}
                  {" "}to {Math.min(renewalsPage * PAGE_SIZE, renewalsFiltered.length)} of {renewalsFiltered.length} entries
                </div>
                <TablePagination
                  page={renewalsPage}
                  totalPages={renewalsTotalPages}
                  onPageChange={setRenewalsPage}
                  showPageLinks
                  showPageLabel={false}
                  maxPageLinks={7}
                />
              </div>
            </div>
          ) : null}

          {activeSection === "billing" ? (
            <div className="card p-3">
              <div className="d-flex align-items-center justify-content-between flex-wrap gap-2">
                <h5 className="mb-0">Billing</h5>
                <button type="button" className="btn btn-outline-light btn-sm" onClick={refreshBilling}>
                  Refresh
                </button>
              </div>
              {billingState.error ? (
                <div className="alert alert-danger mt-2">{billingState.error}</div>
              ) : null}

              <div className="card p-3 mt-3">
                <div className="d-flex align-items-center justify-content-between flex-wrap gap-2">
                  <h6 className="mb-0">Billing Activity</h6>
                  <label className="table-search" htmlFor="billing-transfer-search">
                    <span>Search:</span>
                    <input
                      id="billing-transfer-search"
                      type="text"
                      value={billingTransferSearchTerm}
                      onChange={(event) => setBillingTransferSearchTerm(event.target.value)}
                      placeholder="Search billing activity"
                    />
                  </label>
                </div>
                <div className="table-responsive mt-2">
                  <table className="table table-dark table-striped table-hover align-middle">
                    <thead>
                      <tr>
                        <th>Organization</th>
                        <th>Owner</th>
                        <th>Email</th>
                        <th>Plan</th>
                        <th>Type</th>
                        <th>Cycle</th>
                        <th>Amount</th>
                        <th>Status</th>
                        <th>Paid On</th>
                        <th>GST Bill</th>
                        <th>View</th>
                      </tr>
                    </thead>
                    <tbody>
                      {billingTransferPaged.length ? (
                        billingTransferPaged.map((row) => (
                          <tr key={row.id}>
                            <td>{row.organization || "-"}</td>
                            <td>{row.owner_name || "-"}</td>
                            <td>{row.owner_email || "-"}</td>
                            <td>{row.plan || "-"}</td>
                            <td>{row.request_type || "-"}</td>
                            <td>{row.billing_cycle || "-"}</td>
                            <td>{row.currency ? `${row.currency} ${formatValue(row.amount)}` : formatValue(row.amount)}</td>
                            <td>{row.status || "-"}</td>
                            <td>{row.paid_on || "-"}</td>
                            <td>
                              {row.invoice_available && row.invoice_url ? (
                                <a
                                  className="btn btn-outline-light btn-sm"
                                  href={row.invoice_url}
                                  target="_blank"
                                  rel="noreferrer"
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
                                onClick={() => openBillingView(row)}
                              >
                                View
                              </button>
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan="11">No billing activity found.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
                <div className="table-footer">
                  <div className="table-info">
                    Showing {billingTransferFiltered.length ? billingTransferStartIndex + 1 : 0} to{" "}
                    {Math.min(billingTransferStartIndex + PAGE_SIZE, billingTransferFiltered.length)} of{" "}
                    {billingTransferFiltered.length} entries
                  </div>
                  <TablePagination
                    page={billingTransferCurrentPage}
                    totalPages={billingTransferTotalPages}
                    onPageChange={setBillingTransferPage}
                    showPageLinks
                    showPageLabel={false}
                    maxPageLinks={7}
                  />
                </div>
              </div>

              <div className="card p-3 mt-3">
                <div className="d-flex align-items-center justify-content-between flex-wrap gap-2">
                  <h6 className="mb-0">Subscription History</h6>
                  <label className="table-search" htmlFor="billing-sub-search">
                    <span>Search:</span>
                    <input
                      id="billing-sub-search"
                      type="text"
                      value={billingSubSearchTerm}
                      onChange={(event) => setBillingSubSearchTerm(event.target.value)}
                      placeholder="Search subscription history"
                    />
                  </label>
                </div>
                <div className="table-responsive mt-2">
                  <table className="table table-dark table-striped table-hover align-middle">
                    <thead>
                      <tr>
                        <th>Organization</th>
                        <th>Plan</th>
                        <th>Status</th>
                        <th>Cycle</th>
                        <th>Start</th>
                        <th>End</th>
                        <th>Created</th>
                        <th>User</th>
                        <th>Email</th>
                      </tr>
                    </thead>
                    <tbody>
                      {billingSubPaged.length ? (
                        billingSubPaged.map((row) => (
                          <tr key={row.id}>
                            <td>{row.organization || "-"}</td>
                            <td>{row.plan || "-"}</td>
                            <td>{row.status || "-"}</td>
                            <td>{row.billing_cycle || "-"}</td>
                            <td>{row.start_date || "-"}</td>
                            <td>{row.end_date || "-"}</td>
                            <td>{row.created_at || "-"}</td>
                            <td>{row.user_name || "-"}</td>
                            <td>{row.user_email || "-"}</td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan="9">No subscription history found.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
                <div className="table-footer">
                  <div className="table-info">
                    Showing {billingSubFiltered.length ? billingSubStartIndex + 1 : 0} to{" "}
                    {Math.min(billingSubStartIndex + PAGE_SIZE, billingSubFiltered.length)} of{" "}
                    {billingSubFiltered.length} entries
                  </div>
                  <TablePagination
                    page={billingSubCurrentPage}
                    totalPages={billingSubTotalPages}
                    onPageChange={setBillingSubPage}
                    showPageLinks
                    showPageLabel={false}
                    maxPageLinks={7}
                  />
                </div>
              </div>
            </div>
          ) : null}

          {activeSection === "referrals" ? (
            <div className="card p-3">
              <div className="d-flex align-items-center justify-content-between flex-wrap gap-2">
                <h5 className="mb-0">Referrals</h5>
              </div>
              <div className="d-flex gap-2 flex-wrap mt-2">
                  <button
                    type="button"
                    className={`btn btn-sm ${referralsTab === "org" ? "btn-primary" : "btn-outline-light"}`}
                    onClick={() => {
                      setReferralsTab("org");
                    }}
                  >
                    ORG Referrals
                  </button>
                  <button
                    type="button"
                    className={`btn btn-sm ${referralsTab === "dealer" ? "btn-primary" : "btn-outline-light"}`}
                    onClick={() => {
                      setReferralsTab("dealer");
                    }}
                  >
                    Dealer Referrals
                  </button>
              </div>
              {referralsState.error ? (
                <div className="alert alert-danger mt-2">{referralsState.error}</div>
              ) : null}
                {referralsTab === "org" ? (
                  <>
                    {renderOrgReferralTable(referralsByStatus.pending, "Pending Payments", "pending")}
                    {renderOrgReferralTable(referralsByStatus.paid, "Completed Payments", "paid")}
                    {renderOrgReferralTable(referralsByStatus.rejected, "Rejected Payments", "rejected")}
                  </>
                ) : (
                  <>
                    {renderDealerReferralTable(referralsByStatus.pending, "Pending Payments", "pending")}
                    {renderDealerReferralTable(referralsByStatus.paid, "Completed Payments", "paid")}
                    {renderDealerReferralTable(referralsByStatus.rejected, "Rejected Payments", "rejected")}
                  </>
                )}
              </div>
            ) : null}

          {activeSection === "support-access" ? (
            <div className="card p-3">
              <div className="d-flex align-items-center justify-content-between flex-wrap gap-2">
                <h5 className="mb-0">Support Access</h5>
              </div>
              {supportState.error ? (
                <div className="alert alert-danger mt-2">{supportState.error}</div>
              ) : null}
              <div className="table-responsive mt-2">
                <table className="table table-dark table-striped table-hover align-middle">
                  <thead>
                    <tr>
                      <th>Organization</th>
                      <th>Admin</th>
                      <th>Monitoring Mode</th>
                      <th>Approved Duration</th>
                      <th>Access Until</th>
                    </tr>
                  </thead>
                  <tbody>
                    {supportRows.length ? (
                      supportRows.map((row) => (
                        <tr key={row.org_id}>
                          <td>{row.organization}</td>
                          <td>
                            <div>{row.admin_name}</div>
                            <small className="text-secondary">{row.admin_email}</small>
                          </td>
                          <td>{row.monitoring_mode}</td>
                          <td>{row.approved_duration}</td>
                          <td>{row.support_access_until || "-"}</td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan="5">No support access entries.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}
        </section>
      </div>

      {aiUsageTrend.open ? (
        <div
          className="modal-overlay"
          onClick={() =>
            setAiUsageTrend({ open: false, loading: false, error: "", org: null, rows: [] })
          }
        >
          <div className="modal-panel" onClick={(event) => event.stopPropagation()}>
            <h5>AI Usage Trend</h5>
            <div className="text-secondary small mb-2">
              {aiUsageTrend.org?.org_name ? `Organization: ${aiUsageTrend.org.org_name}` : "Organization"}
            </div>
            {aiUsageTrend.loading ? <div className="text-secondary">Loading...</div> : null}
            {aiUsageTrend.error ? <div className="alert alert-danger">{aiUsageTrend.error}</div> : null}
            {!aiUsageTrend.loading ? (
              <div className="table-responsive mt-2">
                <table className="table table-dark table-striped table-hover align-middle">
                  <thead>
                    <tr>
                      <th>Month</th>
                      <th>Replies</th>
                      <th>Tokens</th>
                      <th>Cost (INR)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {aiUsageTrend.rows.length ? (
                      aiUsageTrend.rows.map((row) => (
                        <tr key={`${row.year}-${row.month}`}>
                          <td>{`${row.year}-${String(row.month).padStart(2, "0")}`}</td>
                          <td>{Number(row.ai_replies_used ?? 0).toLocaleString()}</td>
                          <td>{Number(row.total_tokens ?? 0).toLocaleString()}</td>
                          <td>INR {Number(row.cost_inr ?? 0).toLocaleString()}</td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={4}>No trend data.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            ) : null}
            <div className="d-flex justify-content-end mt-3">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() =>
                  setAiUsageTrend({ open: false, loading: false, error: "", org: null, rows: [] })
                }
              >
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {viewModal.open ? (
        <div className="modal-overlay" onClick={() => setViewModal({ open: false, loading: false, data: null, error: "" })}>
          <div
            className={`modal-panel ${isAiChatbotProduct ? "ai-chatbot-plan-modal" : ""}`}
            onClick={(event) => event.stopPropagation()}
          >
            <h5>Organization Details</h5>
            {viewModal.loading ? (
              <div className="text-center">
                <div className="spinner" />
                <p className="mb-0">Loading...</p>
              </div>
            ) : viewModal.error ? (
              <div className="alert alert-danger">{viewModal.error}</div>
            ) : viewModal.data ? (
              <>
                <div className="row g-3">
                  <div className="col-12 col-lg-6">
                    <div className="mb-2">
                      <strong>Name:</strong> {formatValue(viewModal.data.organization?.name)}
                    </div>
                    <div className="mb-2">
                      <strong>Company Key:</strong> {formatValue(viewModal.data.organization?.company_key)}
                    </div>
                    <div className="mb-2">
                      <strong>Created:</strong> {formatValue(viewModal.data.organization?.created_at)}
                    </div>
                    <div className="mb-2">
                      <strong>Owner:</strong>{" "}
                      {formatValue(`${viewModal.data.owner?.first_name || ""} ${viewModal.data.owner?.last_name || ""}`.trim())}
                    </div>
                <div className="mb-2">
                  <strong>Owner Email:</strong> {formatValue(viewModal.data.owner?.email)}
                </div>
                <div className="mb-2">
                  <strong>User Phone:</strong> {formatValue(viewModal.data.profile?.phone_number)}
                </div>
                <div className="mb-2">
                  <strong>Owner Username:</strong> {formatValue(viewModal.data.owner?.username)}
                </div>
                    <div className="mb-2">
                      <strong>Plan:</strong> {formatValue(viewModal.data.subscription?.plan_name)}
                    </div>
                    <div className="mb-2">
                      <strong>Status:</strong> {titleCase(viewModal.data.subscription?.status)}
                    </div>
                    <div className="mb-2">
                      <strong>Billing Cycle:</strong> {titleCase(viewModal.data.subscription?.billing_cycle)}
                    </div>
                    <div className="mb-2">
                      <strong>End Date:</strong> {formatValue(viewModal.data.subscription?.end_date)}
                    </div>
                    <div className="mb-2">
                      <strong>Add-ons:</strong> {formatValue(viewModal.data.subscription?.addon_count)}
                    </div>
                    <div className="border-top pt-2 mt-3">
                      <div className="fw-semibold mb-2">Settings</div>
                      <div className="mb-2">
                        <strong>Screenshot Interval:</strong>{" "}
                        {formatValue(viewModal.data.settings?.screenshot_interval_minutes)}
                      </div>
                      <div className="mb-2">
                        <strong>Monitoring Mode:</strong> {formatValue(viewModal.data.settings?.monitoring_mode)}
                      </div>
                    </div>
                  </div>
                  <div className="col-12 col-lg-6">
                    <div className="fw-semibold mb-2">Billing Profile</div>
                    <div className="mb-2">
                      <strong>Contact Name:</strong> {formatValue(viewModal.data.billing_profile?.contact_name)}
                    </div>
                    <div className="mb-2">
                      <strong>Company Name:</strong> {formatValue(viewModal.data.billing_profile?.company_name)}
                    </div>
                    <div className="mb-2">
                      <strong>Email:</strong> {formatValue(viewModal.data.billing_profile?.email)}
                    </div>
                    <div className="mb-2">
                      <strong>Phone:</strong> {formatValue(viewModal.data.billing_profile?.phone)}
                    </div>
                    <div className="mb-2">
                      <strong>Address:</strong> {formatValue(viewModal.data.billing_profile?.address_line1)}
                    </div>
                    <div className="mb-2">
                      <strong>Address 2:</strong> {formatValue(viewModal.data.billing_profile?.address_line2)}
                    </div>
                    <div className="mb-2">
                      <strong>City:</strong> {formatValue(viewModal.data.billing_profile?.city)}
                    </div>
                    <div className="mb-2">
                      <strong>State:</strong> {formatValue(viewModal.data.billing_profile?.state)}
                    </div>
                    <div className="mb-2">
                      <strong>Postal Code:</strong> {formatValue(viewModal.data.billing_profile?.postal_code)}
                    </div>
                    <div className="mb-2">
                      <strong>Country:</strong> {formatValue(viewModal.data.billing_profile?.country)}
                    </div>
                    <div className="mb-2">
                      <strong>GSTIN:</strong> {formatValue(viewModal.data.billing_profile?.gstin)}
                    </div>
                    <div className="mb-2">
                      <strong>Updated:</strong> {formatValue(viewModal.data.billing_profile?.updated_at)}
                    </div>
                  </div>
                </div>
              </>
            ) : null}
            <div className="d-flex justify-content-end mt-3">
              <button type="button" className="btn btn-secondary" onClick={() => setViewModal({ open: false, loading: false, data: null, error: "" })}>
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {transferModal.open ? (
        <div
          className="modal-overlay"
          onClick={() =>
            setTransferModal({ open: false, loading: false, data: null, error: "", clearing: false, receiptPreview: "" })
          }
        >
          <div className="modal-panel" onClick={(event) => event.stopPropagation()}>
            <h5>Pending Transfer Details</h5>
            {transferModal.loading ? (
              <div className="text-center">
                <div className="spinner" />
                <p className="mb-0">Loading...</p>
              </div>
            ) : transferModal.error ? (
              <div className="alert alert-danger">{transferModal.error}</div>
            ) : transferModal.data ? (
              <>
                <div className="mb-2">
                  <strong>Organization / Dealer:</strong>{" "}
                  {formatValue(transferModal.data.transfer?.organization || transferModal.data.transfer?.dealer)}
                </div>
                <div className="mb-2">
                  <strong>Type:</strong> {titleCase(transferModal.data.transfer?.request_type)}
                </div>
                <div className="mb-2">
                  <strong>Plan:</strong> {formatValue(transferModal.data.transfer?.plan)}
                </div>
                <div className="mb-2">
                  <strong>Amount:</strong> {formatValue(transferModal.data.transfer?.currency)}{" "}
                  {formatValue(transferModal.data.transfer?.amount)}
                </div>
                {transferModal.data.transfer?.request_type === "addon" ||
                transferModal.data.transfer?.addon_count !== undefined ? (
                  <div className="mb-2">
                    <strong>Add-on Users:</strong> {formatValue(transferModal.data.transfer?.addon_count ?? "-")}
                  </div>
                ) : null}
                <div className="mb-2">
                  <strong>Billing Cycle:</strong> {titleCase(transferModal.data.transfer?.billing_cycle)}
                </div>
                <div className="mb-2">
                  <strong>Reference No:</strong> {formatValue(transferModal.data.transfer?.reference_no)}
                </div>
                <div className="mb-2">
                  <strong>Status:</strong> {titleCase(transferModal.data.transfer?.status)}
                </div>
                <div className="mb-2">
                  <strong>Created:</strong> {formatValue(transferModal.data.transfer?.created_at)}
                </div>
                <div className="mb-2">
                  <strong>Updated:</strong> {formatValue(transferModal.data.transfer?.updated_at)}
                </div>
                {transferModal.data.transfer?.notes ? (
                  <div className="mb-2">
                    <strong>Notes:</strong> {transferModal.data.transfer?.notes}
                  </div>
                ) : null}
                {transferModal.data.transfer?.receipt_url ? (
                  <div className="mb-2">
                    <strong>Receipt:</strong>
                    <div className="mt-2">
                      {transferModal.receiptPreview ? (
                        <img
                          src={transferModal.receiptPreview}
                          alt="Receipt"
                          style={{ maxWidth: "100%", borderRadius: "8px" }}
                        />
                      ) : (
                        <span className="text-secondary">Not Available</span>
                      )}
                    </div>
                    <div className="d-flex gap-2 flex-wrap mt-2">
                      {transferModal.receiptPreview ? null : (
                        <button
                          type="button"
                          className="btn btn-outline-light btn-sm"
                          onClick={() =>
                            setTransferModal((prev) => ({
                              ...prev,
                              receiptPreview: prev.data?.transfer?.receipt_url || ""
                            }))
                          }
                        >
                          View Image
                        </button>
                      )}
                      <button
                        type="button"
                        className="btn btn-danger btn-sm"
                        onClick={() => handleReceiptClear(transferModal.data.transfer.id)}
                        disabled={transferModal.clearing}
                      >
                        {transferModal.clearing ? "Clearing..." : "Clear Image"}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="mb-2">
                    <strong>Receipt:</strong> -
                  </div>
                )}
              </>
            ) : null}
          </div>
        </div>
      ) : null}

        {receiptModal.open ? (
          <div className="modal-overlay" onClick={() => setReceiptModal({ open: false, url: "", transferId: null, clearing: false })}>
            <div className="modal-panel" style={{ width: "min(520px, 90vw)" }} onClick={(event) => event.stopPropagation()}>
              <h5>Receipt Image</h5>
              <div className="mt-3">
                {receiptModal.url ? (
                  <img src={receiptModal.url} alt="Receipt" style={{ width: "100%", borderRadius: "8px" }} />
                ) : (
                  <div className="text-secondary">Not Available</div>
                )}
              </div>
            <div className="d-flex justify-content-end gap-2 mt-3">
              <button
                type="button"
                className="btn btn-danger"
                onClick={handleReceiptModalClear}
                disabled={receiptModal.clearing}
              >
                {receiptModal.clearing ? "Clearing..." : "Clear Image"}
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setReceiptModal({ open: false, url: "", transferId: null, clearing: false })}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {billingViewModal.open ? (
        <div className="modal-overlay" onClick={() => setBillingViewModal({ open: false, row: null })}>
          <div className="modal-panel" onClick={(event) => event.stopPropagation()}>
            <h5>Billing Details</h5>
            <div className="modal-form-grid billing-modal-grid mt-3">
              <div className="modal-form-field">
                <span className="text-secondary">Organization</span>
                <div>{formatValue(billingViewModal.row?.organization)}</div>
              </div>
              <div className="modal-form-field">
                <span className="text-secondary">Owner</span>
                <div>{formatValue(billingViewModal.row?.owner_name)}</div>
              </div>
              <div className="modal-form-field">
                <span className="text-secondary">Email</span>
                <div>{formatValue(billingViewModal.row?.owner_email)}</div>
              </div>
              <div className="modal-form-field">
                <span className="text-secondary">Plan</span>
                <div>{formatValue(billingViewModal.row?.plan)}</div>
              </div>
              <div className="modal-form-field">
                <span className="text-secondary">Type</span>
                <div>{formatValue(billingViewModal.row?.request_type)}</div>
              </div>
              <div className="modal-form-field">
                <span className="text-secondary">Cycle</span>
                <div>{formatValue(billingViewModal.row?.billing_cycle)}</div>
              </div>
              <div className="modal-form-field">
                <span className="text-secondary">Amount</span>
                <div>
                  {billingViewModal.row?.currency
                    ? `${billingViewModal.row.currency} ${formatValue(billingViewModal.row?.amount)}`
                    : formatValue(billingViewModal.row?.amount)}
                </div>
              </div>
              <div className="modal-form-field">
                <span className="text-secondary">Status</span>
                <div>{formatValue(billingViewModal.row?.status)}</div>
              </div>
              <div className="modal-form-field">
                <span className="text-secondary">Paid On</span>
                <div>{formatValue(billingViewModal.row?.paid_on)}</div>
              </div>
              <div className="modal-form-field">
                <span className="text-secondary">Reference</span>
                <div>{formatValue(billingViewModal.row?.reference_no)}</div>
              </div>
              <div className="modal-form-field">
                <span className="text-secondary">Created</span>
                <div>{formatValue(billingViewModal.row?.created_at)}</div>
              </div>
              <div className="modal-form-field">
                <span className="text-secondary">Updated</span>
                <div>{formatValue(billingViewModal.row?.updated_at)}</div>
              </div>
              <div className="modal-form-field">
                <span className="text-secondary">Notes</span>
                <div>{formatValue(billingViewModal.row?.notes)}</div>
              </div>
              <div className="modal-form-field">
                <span className="text-secondary">Receipt</span>
                {billingViewModal.row?.receipt_url ? (
                  <a
                    className="btn btn-outline-light btn-sm"
                    href={billingViewModal.row.receipt_url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    View
                  </a>
                ) : (
                  <div>-</div>
                )}
              </div>
              <div className="modal-form-field">
                <span className="text-secondary">GST Bill</span>
                {billingViewModal.row?.invoice_available && billingViewModal.row?.invoice_url ? (
                  <a
                    className="btn btn-outline-light btn-sm"
                    href={billingViewModal.row.invoice_url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Download
                  </a>
                ) : (
                  <div>-</div>
                )}
              </div>
            </div>
            <div className="d-flex justify-content-end mt-3">
              <button type="button" className="btn btn-secondary" onClick={() => setBillingViewModal({ open: false, row: null })}>
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {bankModal.open ? (
        <div
          className="modal-overlay"
          onClick={() => setBankModal({ open: false, title: "", details: {} })}
        >
          <div className="modal-panel" onClick={(event) => event.stopPropagation()}>
            <h5>Bank Details - {bankModal.title || "Account"}</h5>
            <div className="modal-form-grid mt-3">
              <div className="modal-form-field">
                <span className="text-secondary">Contact Name</span>
                <div>{formatValue(bankModal.details?.contact_name || bankModal.details?.name)}</div>
              </div>
              <div className="modal-form-field">
                <span className="text-secondary">Company Name</span>
                <div>{formatValue(bankModal.details?.company_name)}</div>
              </div>
              <div className="modal-form-field">
                <span className="text-secondary">Email</span>
                <div>{formatValue(bankModal.details?.email)}</div>
              </div>
              <div className="modal-form-field">
                <span className="text-secondary">Phone</span>
                <div>{formatValue(bankModal.details?.phone)}</div>
              </div>
              <div className="modal-form-field">
                <span className="text-secondary">Bank Name</span>
                <div>{formatValue(bankModal.details?.bank_name)}</div>
              </div>
              <div className="modal-form-field">
                <span className="text-secondary">Account Number</span>
                <div>{formatValue(bankModal.details?.bank_account_number)}</div>
              </div>
              <div className="modal-form-field">
                <span className="text-secondary">IFSC</span>
                <div>{formatValue(bankModal.details?.bank_ifsc)}</div>
              </div>
              <div className="modal-form-field">
                <span className="text-secondary">UPI</span>
                <div>{formatValue(bankModal.details?.upi_id)}</div>
              </div>
              <div className="modal-form-field">
                <span className="text-secondary">Address Line 1</span>
                <div>{formatValue(bankModal.details?.address_line1)}</div>
              </div>
              <div className="modal-form-field">
                <span className="text-secondary">Address Line 2</span>
                <div>{formatValue(bankModal.details?.address_line2)}</div>
              </div>
              <div className="modal-form-field">
                <span className="text-secondary">City</span>
                <div>{formatValue(bankModal.details?.city)}</div>
              </div>
              <div className="modal-form-field">
                <span className="text-secondary">State</span>
                <div>{formatValue(bankModal.details?.state)}</div>
              </div>
              <div className="modal-form-field">
                <span className="text-secondary">Postal Code</span>
                <div>{formatValue(bankModal.details?.postal_code)}</div>
              </div>
              <div className="modal-form-field">
                <span className="text-secondary">Country</span>
                <div>{formatValue(bankModal.details?.country)}</div>
              </div>
              <div className="modal-form-field">
                <span className="text-secondary">GSTIN</span>
                <div>{formatValue(bankModal.details?.gstin)}</div>
              </div>
            </div>
            <div className="d-flex justify-content-end mt-3">
              <button type="button" className="btn btn-secondary" onClick={() => setBankModal({ open: false, title: "", details: {} })}>
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {payoutModal.open ? (
        <div
          className="modal-overlay"
          onClick={() => setPayoutModal({ open: false, row: null, type: "org", note: "", error: "", saving: false })}
        >
          <div className="modal-panel" onClick={(event) => event.stopPropagation()}>
            <h5>Update Referral Payout</h5>
            <p className="text-secondary mb-2">
              Add payment or rejection details before updating the status.
            </p>
            {payoutModal.error ? <div className="alert alert-danger">{payoutModal.error}</div> : null}
            <div className="mb-3">
              <label className="form-label">Details</label>
              <textarea
                className="form-control"
                rows="3"
                value={payoutModal.note}
                onChange={(event) => setPayoutModal((prev) => ({ ...prev, note: event.target.value }))}
                placeholder="Ref: 251245 / Date: 03/01/2026 / Reason"
              />
            </div>
            <div className="d-flex justify-content-end gap-2">
              <button
                type="button"
                className="btn btn-outline-light"
                onClick={() => setPayoutModal({ open: false, row: null, type: "org", note: "", error: "", saving: false })}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-danger"
                onClick={() => handlePayoutAction("rejected")}
                disabled={payoutModal.saving}
              >
                {payoutModal.saving ? "Saving..." : "Reject"}
              </button>
              <button
                type="button"
                className="btn btn-success"
                onClick={() => handlePayoutAction("paid")}
                disabled={payoutModal.saving}
              >
                {payoutModal.saving ? "Saving..." : "Paid"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {editModal.open ? (
        <div className="modal-overlay" onClick={() => setEditModal({ open: false, loading: false, data: null, error: "", form: {} })}>
          <div className="modal-panel" onClick={(event) => event.stopPropagation()}>
            <h5>Edit Organization</h5>
            {editModal.error ? <div className="alert alert-danger">{editModal.error}</div> : null}
            {editModal.loading ? (
              <div className="text-center">
                <div className="spinner" />
                <p className="mb-0">Loading...</p>
              </div>
            ) : (
              <>
                <div className="modal-form-grid">
                  <div className="modal-form-field">
                    <label className="form-label">Organization Name</label>
                    <input
                      type="text"
                      className="form-control"
                      value={editModal.form.name || ""}
                      onChange={(event) => setEditModal((prev) => ({ ...prev, form: { ...prev.form, name: event.target.value } }))}
                    />
                  </div>
                  <div className="modal-form-field">
                    <label className="form-label">Company Key</label>
                    <input
                      type="text"
                      className="form-control"
                      value={editModal.form.company_key || ""}
                      onChange={(event) => setEditModal((prev) => ({ ...prev, form: { ...prev.form, company_key: event.target.value } }))}
                    />
                  </div>
                  <div className="modal-form-field">
                    <label className="form-label">Admin Username</label>
                    <input
                      type="text"
                      className="form-control"
                      value={editModal.form.owner_username || ""}
                      onChange={(event) => setEditModal((prev) => ({ ...prev, form: { ...prev.form, owner_username: event.target.value } }))}
                    />
                  </div>
                  <div className="modal-form-field">
                    <label className="form-label">Admin First Name</label>
                    <input
                      type="text"
                      className="form-control"
                      value={editModal.form.owner_first_name || ""}
                      onChange={(event) => setEditModal((prev) => ({ ...prev, form: { ...prev.form, owner_first_name: event.target.value } }))}
                    />
                  </div>
                  <div className="modal-form-field">
                    <label className="form-label">Admin Last Name</label>
                    <input
                      type="text"
                      className="form-control"
                      value={editModal.form.owner_last_name || ""}
                      onChange={(event) => setEditModal((prev) => ({ ...prev, form: { ...prev.form, owner_last_name: event.target.value } }))}
                    />
                  </div>
                  <div className="modal-form-field">
                    <label className="form-label">Admin Email</label>
                    <input
                      type="email"
                      className="form-control"
                      value={editModal.form.owner_email || ""}
                      onChange={(event) => setEditModal((prev) => ({ ...prev, form: { ...prev.form, owner_email: event.target.value } }))}
                    />
                  </div>
                  <div className="modal-form-field">
                    <label className="form-label">Plan</label>
                    <select
                      className="form-select"
                      value={editModal.form.plan_id || ""}
                      onChange={(event) => setEditModal((prev) => ({ ...prev, form: { ...prev.form, plan_id: Number(event.target.value) || "" } }))}
                    >
                      <option value="">Select Plan</option>
                      {orgPlans.map((plan) => (
                        <option key={plan.id} value={plan.id}>
                          {plan.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="modal-form-field">
                    <label className="form-label">Billing Cycle</label>
                    <select
                      className="form-select"
                      value={editModal.form.billing_cycle || "monthly"}
                      onChange={(event) => setEditModal((prev) => ({ ...prev, form: { ...prev.form, billing_cycle: event.target.value } }))}
                    >
                      <option value="monthly">Monthly</option>
                      <option value="yearly">Yearly</option>
                    </select>
                  </div>
                  <div className="modal-form-field">
                    <label className="form-label">Status</label>
                    <select
                      className="form-select"
                      value={editModal.form.status || "active"}
                      onChange={(event) => setEditModal((prev) => ({ ...prev, form: { ...prev.form, status: event.target.value } }))}
                    >
                      <option value="active">Active</option>
                      <option value="pending">Pending</option>
                      <option value="expired">Expired</option>
                    </select>
                  </div>
                  <div className="modal-form-field">
                    <label className="form-label">Expire Date</label>
                    <input
                      type="date"
                      className="form-control"
                      value={editModal.form.end_date || ""}
                      onChange={(event) => setEditModal((prev) => ({ ...prev, form: { ...prev.form, end_date: event.target.value } }))}
                    />
                  </div>
                  <div className="modal-form-field">
                    <label className="form-label">Add-on Count</label>
                    <input
                      type="number"
                      min="0"
                      className="form-control"
                      value={editModal.form.addon_count ?? 0}
                      onChange={(event) => setEditModal((prev) => ({ ...prev, form: { ...prev.form, addon_count: event.target.value } }))}
                    />
                  </div>
                </div>
              </>
            )}
            <div className="d-flex justify-content-end gap-2 mt-3">
              <button type="button" className="btn btn-secondary" onClick={() => setEditModal({ open: false, loading: false, data: null, error: "", form: {} })}>
                Cancel
              </button>
              <button type="button" className="btn btn-primary" onClick={handleOrgSave} disabled={editModal.loading}>
                Save
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {userViewModal.open ? (
        <div className="modal-overlay" onClick={() => setUserViewModal({ open: false, loading: false, data: null, error: "" })}>
          <div className="modal-panel" onClick={(event) => event.stopPropagation()}>
            <h5>User Details</h5>
            {userViewModal.loading ? (
              <div className="text-center">
                <div className="spinner" />
                <p className="mb-0">Loading...</p>
              </div>
            ) : userViewModal.error ? (
              <div className="alert alert-danger">{userViewModal.error}</div>
            ) : userViewModal.data ? (
              <>
                <div className="mb-2">
                  <strong>Name:</strong> {formatValue(userViewModal.data.user?.name)}
                </div>
                <div className="mb-2">
                  <strong>Email:</strong> {formatValue(userViewModal.data.user?.email)}
                </div>
                <div className="mb-2">
                  <strong>Organization:</strong> {formatValue(userViewModal.data.user?.org_name)}
                </div>
                <div className="mb-2">
                  <strong>Device ID:</strong> {formatValue(userViewModal.data.user?.device_id)}
                </div>
                <div className="mb-2">
                  <strong>PC Name:</strong> {formatValue(userViewModal.data.user?.pc_name)}
                </div>
                <div className="mb-2">
                  <strong>Created:</strong> {formatValue(userViewModal.data.user?.created_at)}
                </div>
              </>
            ) : null}
            <div className="d-flex justify-content-end mt-3">
              <button type="button" className="btn btn-secondary" onClick={() => setUserViewModal({ open: false, loading: false, data: null, error: "" })}>
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {userEditModal.open ? (
        <div className="modal-overlay" onClick={() => setUserEditModal({ open: false, loading: false, data: null, error: "", form: {} })}>
          <div className="modal-panel" onClick={(event) => event.stopPropagation()}>
            <h5>Edit User</h5>
            {userEditModal.error ? <div className="alert alert-danger">{userEditModal.error}</div> : null}
            {userEditModal.loading ? (
              <div className="text-center">
                <div className="spinner" />
                <p className="mb-0">Loading...</p>
              </div>
            ) : (
              <div className="modal-form-grid">
                <div className="modal-form-field">
                  <label className="form-label">Name</label>
                  <input
                    type="text"
                    className="form-control"
                    value={userEditModal.form.name || ""}
                    onChange={(event) => setUserEditModal((prev) => ({ ...prev, form: { ...prev.form, name: event.target.value } }))}
                  />
                </div>
                <div className="modal-form-field">
                  <label className="form-label">Email</label>
                  <input
                    type="email"
                    className="form-control"
                    value={userEditModal.form.email || ""}
                    onChange={(event) => setUserEditModal((prev) => ({ ...prev, form: { ...prev.form, email: event.target.value } }))}
                  />
                </div>
                <div className="modal-form-field">
                  <label className="form-label">PC Name</label>
                  <input
                    type="text"
                    className="form-control"
                    value={userEditModal.form.pc_name || ""}
                    onChange={(event) => setUserEditModal((prev) => ({ ...prev, form: { ...prev.form, pc_name: event.target.value } }))}
                  />
                </div>
                <div className="modal-form-field">
                  <label className="form-label">Device ID</label>
                  <input
                    type="text"
                    className="form-control"
                    value={userEditModal.form.device_id || ""}
                    onChange={(event) => setUserEditModal((prev) => ({ ...prev, form: { ...prev.form, device_id: event.target.value } }))}
                  />
                </div>
              </div>
            )}
            <div className="d-flex justify-content-end gap-2 mt-3">
              <button type="button" className="btn btn-secondary" onClick={() => setUserEditModal({ open: false, loading: false, data: null, error: "", form: {} })}>
                Cancel
              </button>
              <button type="button" className="btn btn-primary" onClick={handleUserSave} disabled={userEditModal.loading}>
                Save
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {planModal.open ? (
        <div className="modal-overlay" onClick={() => setPlanModal({ open: false, mode: "create", form: {}, error: "", fieldErrors: {}, loading: false, planId: null })}>
          <div
            className={`modal-panel ${isAiChatbotProduct ? "ai-chatbot-plan-modal" : ""}`}
            onClick={(event) => event.stopPropagation()}
          >
            <h5>{planModal.mode === "edit" ? "Edit Plan" : "Create Plan"}</h5>
            {planModal.error ? <div className="alert alert-danger">{planModal.error}</div> : null}
            {isStorageProduct ? (
              <div className="modal-form-grid">
                <div className="modal-form-field">
                  <label className="form-label">Plan Name</label>
                  <input
                    type="text"
                    className="form-control"
                    value={planModal.form.name || ""}
                    onChange={(event) => setPlanModal((prev) => ({ ...prev, form: { ...prev.form, name: event.target.value } }))}
                  />
                  {getFieldError("name")}
                </div>
                <div className="modal-form-field">
                  <label className="form-label">Monthly Price (INR)</label>
                  <input
                    type="number"
                    step="0.01"
                    className="form-control"
                    value={planModal.form.monthly_price_inr ?? ""}
                    onChange={(event) =>
                      setPlanModal((prev) => ({
                        ...prev,
                        form: { ...prev.form, monthly_price_inr: event.target.value }
                      }))
                    }
                  />
                  {getFieldError("monthly_price_inr")}
                </div>
                <div className="modal-form-field">
                  <label className="form-label">Yearly Price (INR)</label>
                  <input
                    type="number"
                    step="0.01"
                    className="form-control"
                    value={planModal.form.yearly_price_inr ?? ""}
                    onChange={(event) =>
                      setPlanModal((prev) => ({
                        ...prev,
                        form: { ...prev.form, yearly_price_inr: event.target.value }
                      }))
                    }
                  />
                  {getFieldError("yearly_price_inr")}
                </div>
                <div className="modal-form-field">
                  <label className="form-label">Monthly Price (USD)</label>
                  <input
                    type="number"
                    step="0.01"
                    className="form-control"
                    value={planModal.form.monthly_price_usd ?? ""}
                    onChange={(event) =>
                      setPlanModal((prev) => ({
                        ...prev,
                        form: { ...prev.form, monthly_price_usd: event.target.value }
                      }))
                    }
                  />
                  {getFieldError("monthly_price_usd")}
                </div>
                <div className="modal-form-field">
                  <label className="form-label">Yearly Price (USD)</label>
                  <input
                    type="number"
                    step="0.01"
                    className="form-control"
                    value={planModal.form.yearly_price_usd ?? ""}
                    onChange={(event) =>
                      setPlanModal((prev) => ({
                        ...prev,
                        form: { ...prev.form, yearly_price_usd: event.target.value }
                      }))
                    }
                  />
                  {getFieldError("yearly_price_usd")}
                </div>
                <div className="modal-form-field">
                  <label className="form-label">Max Users</label>
                  <input
                    type="number"
                    min="0"
                    className="form-control"
                    value={planModal.form.max_users ?? ""}
                    onChange={(event) => setPlanModal((prev) => ({ ...prev, form: { ...prev.form, max_users: event.target.value } }))}
                  />
                  {getFieldError("max_users")}
                </div>
                <div className="modal-form-field">
                  <label className="form-label">Device Limit per User</label>
                  <input
                    type="number"
                    min="1"
                    className="form-control"
                    value={planModal.form.device_limit_per_user ?? ""}
                    onChange={(event) =>
                      setPlanModal((prev) => ({
                        ...prev,
                        form: { ...prev.form, device_limit_per_user: event.target.value }
                      }))
                    }
                  />
                  {getFieldError("device_limit_per_user")}
                </div>
                <div className="modal-form-field">
                  <label className="form-label">Storage Limit (GB)</label>
                  <input
                    type="number"
                    min="0"
                    className="form-control"
                    value={planModal.form.storage_limit_gb ?? ""}
                    onChange={(event) => setPlanModal((prev) => ({ ...prev, form: { ...prev.form, storage_limit_gb: event.target.value } }))}
                  />
                  {getFieldError("storage_limit_gb")}
                </div>
                <div className="modal-form-field">
                  <label className="form-label">Bandwidth Limit (GB / month)</label>
                  <input
                    type="number"
                    min="0"
                    className="form-control"
                    value={planModal.form.bandwidth_limit_gb_monthly ?? ""}
                    onChange={(event) => setPlanModal((prev) => ({ ...prev, form: { ...prev.form, bandwidth_limit_gb_monthly: event.target.value } }))}
                  />
                  {getFieldError("bandwidth_limit_gb_monthly")}
                </div>
                <div className="modal-form-field">
                  <label className="form-label">Bandwidth Limited</label>
                  <select
                    className="form-select"
                    value={planModal.form.is_bandwidth_limited === false ? "false" : "true"}
                    onChange={(event) =>
                      setPlanModal((prev) => ({
                        ...prev,
                        form: { ...prev.form, is_bandwidth_limited: event.target.value === "true" }
                      }))
                    }
                  >
                    <option value="true">Yes</option>
                    <option value="false">No</option>
                  </select>
                </div>
                <div className="modal-form-field">
                  <label className="form-label">Status</label>
                  <select
                    className="form-select"
                    value={planModal.form.is_active ? "true" : "false"}
                    onChange={(event) =>
                      setPlanModal((prev) => ({
                        ...prev,
                        form: { ...prev.form, is_active: event.target.value === "true" }
                      }))
                    }
                  >
                    <option value="true">Active</option>
                    <option value="false">Inactive</option>
                  </select>
                </div>
              </div>
            ) : (
              <div
                className="modal-form-grid"
                style={isAiChatbotProduct ? { gridTemplateColumns: "repeat(4, minmax(0, 1fr))" } : undefined}
              >
              {isAiChatbotProduct ? (
                <>
                  <div className="modal-form-field">
                    <label className="form-label">Plan Template</label>
                    <select
                      className="form-select"
                      value={planModal.form.plan_template || "Custom"}
                      onChange={(event) => {
                        const template = event.target.value;
                        const defaults = getAiChatbotTemplateDefaults(template);
                        setPlanModal((prev) => ({
                          ...prev,
                          form: {
                            ...prev.form,
                            plan_template: template,
                            ...(defaults || {})
                          }
                        }));
                      }}
                    >
                      <option value="Free Trial">Free Trial</option>
                      <option value="Starter">Starter</option>
                      <option value="Growth">Growth</option>
                      <option value="Pro">Pro</option>
                      <option value="Custom">Custom</option>
                    </select>
                  </div>
                  <div className="modal-form-field">
                    <label className="form-label">Plan Name</label>
                    <input
                      type="text"
                      className="form-control"
                      value={planModal.form.name || ""}
                      onChange={(event) => setPlanModal((prev) => ({ ...prev, form: { ...prev.form, name: event.target.value } }))}
                    />
                    {getFieldError("name")}
                  </div>
                </>
              ) : (
                <div className="modal-form-field">
                  <label className="form-label">Plan Name</label>
                  <input
                    type="text"
                    className="form-control"
                    value={planModal.form.name || ""}
                    onChange={(event) => setPlanModal((prev) => ({ ...prev, form: { ...prev.form, name: event.target.value } }))}
                  />
                  {getFieldError("name")}
                </div>
              )}
              {isAiChatbotProduct ? (
                <>
                  <div className="modal-form-field">
                    <label className="form-label">Widgets</label>
                    <input
                      type="number"
                      min="0"
                      className="form-control"
                      value={planModal.form.widgets ?? ""}
                      onChange={(event) => setPlanModal((prev) => ({ ...prev, form: { ...prev.form, widgets: event.target.value } }))}
                    />
                    {getFieldError("widgets")}
                  </div>
                  <div className="modal-form-field">
                    <label className="form-label">Agents Included</label>
                    <input
                      type="number"
                      min="0"
                      className="form-control"
                      value={planModal.form.included_agents ?? ""}
                      onChange={(event) => setPlanModal((prev) => ({ ...prev, form: { ...prev.form, included_agents: event.target.value } }))}
                    />
                    {getFieldError("included_agents")}
                  </div>
                  <div className="modal-form-field">
                    <label className="form-label">Conversations / Month</label>
                    <input
                      type="number"
                      min="0"
                      className="form-control"
                      value={planModal.form.conversations_per_month ?? ""}
                      onChange={(event) => setPlanModal((prev) => ({ ...prev, form: { ...prev.form, conversations_per_month: event.target.value } }))}
                    />
                    {getFieldError("conversations_per_month")}
                  </div>
                  <div className="modal-form-field">
                    <label className="form-label">Chat History (days)</label>
                    <input
                      type="number"
                      min="1"
                      className="form-control"
                      value={planModal.form.chat_history_days ?? ""}
                      onChange={(event) => setPlanModal((prev) => ({ ...prev, form: { ...prev.form, chat_history_days: event.target.value } }))}
                    />
                    {getFieldError("chat_history_days")}
                  </div>
                  <div className="modal-form-field">
                    <label className="form-label">Max Messages / Conversation</label>
                    <input
                      type="number"
                      min="1"
                      className="form-control"
                      value={planModal.form.max_messages_per_conversation ?? ""}
                      onChange={(event) => setPlanModal((prev) => ({ ...prev, form: { ...prev.form, max_messages_per_conversation: event.target.value } }))}
                    />
                    {getFieldError("max_messages_per_conversation")}
                  </div>
                  <div className="modal-form-field">
                    <label className="form-label">Max Chars / Message</label>
                    <input
                      type="number"
                      min="1"
                      className="form-control"
                      value={planModal.form.max_chars_per_message ?? ""}
                      onChange={(event) => setPlanModal((prev) => ({ ...prev, form: { ...prev.form, max_chars_per_message: event.target.value } }))}
                    />
                    {getFieldError("max_chars_per_message")}
                  </div>
                  <div className="modal-form-field">
                    <label className="form-label">AI Max Messages / Conversation</label>
                    <input
                      type="number"
                      min="1"
                      className="form-control"
                      value={planModal.form.ai_max_messages_per_conversation ?? ""}
                      onChange={(event) => setPlanModal((prev) => ({ ...prev, form: { ...prev.form, ai_max_messages_per_conversation: event.target.value } }))}
                    />
                    {getFieldError("ai_max_messages_per_conversation")}
                  </div>
                  <div className="modal-form-field">
                    <label className="form-label">AI Max Chars / Message</label>
                    <input
                      type="number"
                      min="1"
                      className="form-control"
                      value={planModal.form.ai_max_chars_per_message ?? ""}
                      onChange={(event) => setPlanModal((prev) => ({ ...prev, form: { ...prev.form, ai_max_chars_per_message: event.target.value } }))}
                    />
                    {getFieldError("ai_max_chars_per_message")}
                  </div>
                  <div className="modal-form-field">
                    <label className="form-label">AI Library Limit (MB)</label>
                    <input
                      type="number"
                      min="0"
                      className="form-control"
                      value={planModal.form.ai_library_limit_mb ?? ""}
                      onChange={(event) => setPlanModal((prev) => ({ ...prev, form: { ...prev.form, ai_library_limit_mb: event.target.value } }))}
                    />
                    {getFieldError("ai_library_limit_mb")}
                  </div>
                  <div className="modal-form-field">
                    <label className="form-label">Maximum Website Pages Allowed for AI Import</label>
                    <input
                      type="number"
                      min="0"
                      className="form-control"
                      value={planModal.form.website_page_limit ?? ""}
                      onChange={(event) => setPlanModal((prev) => ({ ...prev, form: { ...prev.form, website_page_limit: event.target.value } }))}
                    />
                    {getFieldError("website_page_limit")}
                  </div>
                </>
              ) : (
                <div className="modal-form-field">
                  <label className="form-label">Employee Limit</label>
                  <input
                    type="number"
                    min="0"
                    className="form-control"
                    value={planModal.form.employee_limit ?? 0}
                    onChange={(event) => setPlanModal((prev) => ({ ...prev, form: { ...prev.form, employee_limit: event.target.value } }))}
                  />
                  {getFieldError("employee_limit")}
                </div>
              )}
              <div className="modal-form-field">
                <label className="form-label">Monthly Price (INR)</label>
                <input
                  type="number"
                  step="0.01"
                  className="form-control"
                  value={planModal.form.monthly_price ?? ""}
                  onChange={(event) => setPlanModal((prev) => ({ ...prev, form: { ...prev.form, monthly_price: event.target.value } }))}
                />
                {getFieldError("monthly_price")}
              </div>
              <div className="modal-form-field">
                <label className="form-label">Yearly Price (INR)</label>
                <input
                  type="number"
                  step="0.01"
                  className="form-control"
                  value={planModal.form.yearly_price ?? ""}
                  onChange={(event) => setPlanModal((prev) => ({ ...prev, form: { ...prev.form, yearly_price: event.target.value } }))}
                />
                {getFieldError("yearly_price")}
              </div>
              <div className="modal-form-field">
                <label className="form-label">Monthly Price (USD)</label>
                <input
                  type="number"
                  step="0.01"
                  className="form-control"
                  value={planModal.form.usd_monthly_price ?? ""}
                  onChange={(event) => setPlanModal((prev) => ({ ...prev, form: { ...prev.form, usd_monthly_price: event.target.value } }))}
                />
                {getFieldError("usd_monthly_price")}
              </div>
              <div className="modal-form-field">
                <label className="form-label">Yearly Price (USD)</label>
                <input
                  type="number"
                  step="0.01"
                  className="form-control"
                  value={planModal.form.usd_yearly_price ?? ""}
                  onChange={(event) => setPlanModal((prev) => ({ ...prev, form: { ...prev.form, usd_yearly_price: event.target.value } }))}
                />
                {getFieldError("usd_yearly_price")}
              </div>
              <div className="modal-form-field">
                <label className="form-label">Addon Monthly (INR)</label>
                <input
                  type="number"
                  step="0.01"
                  className="form-control"
                  value={planModal.form.addon_monthly_price ?? ""}
                  onChange={(event) => setPlanModal((prev) => ({ ...prev, form: { ...prev.form, addon_monthly_price: event.target.value } }))}
                />
                {getFieldError("addon_monthly_price")}
              </div>
              <div className="modal-form-field">
                <label className="form-label">Addon Yearly (INR)</label>
                <input
                  type="number"
                  step="0.01"
                  className="form-control"
                  value={planModal.form.addon_yearly_price ?? ""}
                  onChange={(event) => setPlanModal((prev) => ({ ...prev, form: { ...prev.form, addon_yearly_price: event.target.value } }))}
                />
                {getFieldError("addon_yearly_price")}
              </div>
              <div className="modal-form-field">
                <label className="form-label">Addon Monthly (USD)</label>
                <input
                  type="number"
                  step="0.01"
                  className="form-control"
                  value={planModal.form.addon_usd_monthly_price ?? ""}
                  onChange={(event) => setPlanModal((prev) => ({ ...prev, form: { ...prev.form, addon_usd_monthly_price: event.target.value } }))}
                />
                {getFieldError("addon_usd_monthly_price")}
              </div>
              <div className="modal-form-field">
                <label className="form-label">Addon Yearly (USD)</label>
                <input
                  type="number"
                  step="0.01"
                  className="form-control"
                  value={planModal.form.addon_usd_yearly_price ?? ""}
                  onChange={(event) => setPlanModal((prev) => ({ ...prev, form: { ...prev.form, addon_usd_yearly_price: event.target.value } }))}
                />
                {getFieldError("addon_usd_yearly_price")}
              </div>
              {!isAiChatbotProduct ? (
                <>
                  <div className="modal-form-field">
                    <label className="form-label">Retention Days</label>
                  <input
                    type="number"
                    min="1"
                    className="form-control"
                    value={planModal.form.retention_days ?? 30}
                    onChange={(event) => setPlanModal((prev) => ({ ...prev, form: { ...prev.form, retention_days: event.target.value } }))}
                  />
                  {getFieldError("retention_days")}
                </div>
                <div className="modal-form-field">
                  <label className="form-label">Screenshot Interval (min)</label>
                  <input
                    type="number"
                    min="1"
                    className="form-control"
                    value={planModal.form.screenshot_min_minutes ?? 5}
                    onChange={(event) => setPlanModal((prev) => ({ ...prev, form: { ...prev.form, screenshot_min_minutes: event.target.value } }))}
                  />
                  {getFieldError("screenshot_min_minutes")}
                </div>
                </>
              ) : null}
              <div className="modal-form-field">
                <label className="form-label">Allow Add-ons</label>
                <select
                  className="form-select"
                  value={planModal.form.allow_addons ? "true" : "false"}
                  onChange={(event) =>
                    setPlanModal((prev) => ({
                      ...prev,
                      form: { ...prev.form, allow_addons: event.target.value === "true" }
                    }))
                  }
                >
                  <option value="true">Yes</option>
                  <option value="false">No</option>
                </select>
                {getFieldError("allow_addons")}
              </div>
              {!isAiChatbotProduct ? (
                <>
                  <div className="modal-form-field">
                    <label className="form-label">Allow App Usage</label>
                    <select
                      className="form-select"
                      value={planModal.form.allow_app_usage ? "true" : "false"}
                      onChange={(event) =>
                        setPlanModal((prev) => ({
                          ...prev,
                          form: { ...prev.form, allow_app_usage: event.target.value === "true" }
                        }))
                      }
                    >
                      <option value="true">Yes</option>
                      <option value="false">No</option>
                    </select>
                    {getFieldError("allow_app_usage")}
                  </div>
                  <div className="modal-form-field">
                    <label className="form-label">Allow HR View Login</label>
                    <select
                      className="form-select"
                      value={planModal.form.allow_hr_view ? "true" : "false"}
                      onChange={(event) =>
                        setPlanModal((prev) => ({
                          ...prev,
                          form: { ...prev.form, allow_hr_view: event.target.value === "true" }
                        }))
                      }
                    >
                      <option value="true">Yes</option>
                      <option value="false">No</option>
                    </select>
                    {getFieldError("allow_hr_view")}
                  </div>
                </>
              ) : (
                <>
                  <div className="modal-form-field">
                    <label className="form-label">Remove Branding</label>
                    <select
                      className="form-select"
                      value={planModal.form.remove_branding ? "true" : "false"}
                      onChange={(event) =>
                        setPlanModal((prev) => ({
                          ...prev,
                          form: { ...prev.form, remove_branding: event.target.value === "true" }
                        }))
                      }
                    >
                      <option value="true">Yes</option>
                      <option value="false">No</option>
                    </select>
                    {getFieldError("remove_branding")}
                  </div>
                  <div className="modal-form-field">
                    <label className="form-label">Analytics (Basic)</label>
                    <select
                      className="form-select"
                      value={planModal.form.analytics_basic ? "true" : "false"}
                      onChange={(event) =>
                        setPlanModal((prev) => ({
                          ...prev,
                          form: { ...prev.form, analytics_basic: event.target.value === "true" }
                        }))
                      }
                    >
                      <option value="true">Yes</option>
                      <option value="false">No</option>
                    </select>
                    {getFieldError("analytics_basic")}
                  </div>
                  <div className="modal-form-field">
                    <label className="form-label">CSV Export</label>
                    <select
                      className="form-select"
                      value={planModal.form.csv_export ? "true" : "false"}
                      onChange={(event) =>
                        setPlanModal((prev) => ({
                          ...prev,
                          form: { ...prev.form, csv_export: event.target.value === "true" }
                        }))
                      }
                    >
                      <option value="true">Yes</option>
                      <option value="false">No</option>
                    </select>
                    {getFieldError("csv_export")}
                  </div>
                  <div className="modal-form-field">
                    <label className="form-label">Agent Inbox</label>
                    <select
                      className="form-select"
                      value={planModal.form.agent_inbox ? "true" : "false"}
                      onChange={(event) =>
                        setPlanModal((prev) => ({
                          ...prev,
                          form: { ...prev.form, agent_inbox: event.target.value === "true" }
                        }))
                      }
                    >
                      <option value="true">Yes</option>
                      <option value="false">No</option>
                    </select>
                    {getFieldError("agent_inbox")}
                  </div>
                  <div className="modal-form-field">
                    <label className="form-label">AI Enabled</label>
                    <select
                      className="form-select"
                      value={planModal.form.ai_enabled ? "true" : "false"}
                      onChange={(event) =>
                        setPlanModal((prev) => ({
                          ...prev,
                          form: { ...prev.form, ai_enabled: event.target.value === "true" }
                        }))
                      }
                    >
                      <option value="true">Yes</option>
                      <option value="false">No</option>
                    </select>
                    {getFieldError("ai_enabled")}
                  </div>
                  <div className="modal-form-field">
                    <label className="form-label">AI Replies / Month</label>
                    <input
                      type="number"
                      min="0"
                      className="form-control"
                      value={planModal.form.ai_replies_per_month ?? ""}
                      onChange={(event) => setPlanModal((prev) => ({ ...prev, form: { ...prev.form, ai_replies_per_month: event.target.value } }))}
                    />
                    {getFieldError("ai_replies_per_month")}
                    {(() => {
                      const estimate = getAiCostEstimate(planModal.form.ai_replies_per_month);
                      if (!estimate) {
                        return null;
                      }
                      const costInr = estimate.costInr;
                      const warnHigh = costInr >= aiCostAssumptions.warnHighInr;
                      const warnVeryHigh = costInr >= aiCostAssumptions.warnVeryHighInr;
                      return (
                        <div className="text-secondary small mt-1">
                          <div>
                            Estimated OpenAI cost (Approx): INR {costInr.toFixed(0)} / month
                          </div>
                          <div>
                            Assumes {estimate.tokensPerReply} tokens per reply, ${estimate.usdPer1k}/1k tokens, 1 USD=INR {estimate.usdToInr}
                          </div>
                          {warnVeryHigh ? (
                            <div className="text-danger">Very high AI cost - review limits</div>
                          ) : warnHigh ? (
                            <div className="text-warning">High AI cost</div>
                          ) : null}
                        </div>
                      );
                    })()}
                    <button
                      type="button"
                      className="btn btn-outline-light btn-sm mt-2"
                      onClick={() => setShowAiCostAssumptions((prev) => !prev)}
                    >
                      {showAiCostAssumptions ? "Hide assumptions" : "Edit assumptions"}
                    </button>
                    {showAiCostAssumptions ? (
                      <div className="mt-2">
                        <div className="d-flex gap-2 flex-wrap">
                          <div className="flex-grow-1">
                            <label className="form-label">Avg tokens/reply</label>
                            <input
                              type="number"
                              min="1"
                              className="form-control"
                              value={aiCostAssumptions.tokensPerReply}
                              onChange={(event) =>
                                setAiCostAssumptions((prev) => ({
                                  ...prev,
                                  tokensPerReply: Number(event.target.value)
                                }))
                              }
                            />
                          </div>
                          <div className="flex-grow-1">
                            <label className="form-label">USD / 1k tokens</label>
                            <input
                              type="number"
                              step="0.0001"
                              min="0"
                              className="form-control"
                              value={aiCostAssumptions.usdPer1k}
                              onChange={(event) =>
                                setAiCostAssumptions((prev) => ({
                                  ...prev,
                                  usdPer1k: Number(event.target.value)
                                }))
                              }
                            />
                          </div>
                          <div className="flex-grow-1">
                            <label className="form-label">USD to INR</label>
                            <input
                              type="number"
                              min="1"
                              className="form-control"
                              value={aiCostAssumptions.usdToInr}
                              onChange={(event) =>
                                setAiCostAssumptions((prev) => ({
                                  ...prev,
                                  usdToInr: Number(event.target.value)
                                }))
                              }
                            />
                          </div>
                        </div>
                      </div>
                    ) : null}
                  </div>
                </>
              )}
            </div>
            )}
            <div className="d-flex justify-content-end gap-2 mt-3">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setPlanModal({ open: false, mode: "create", form: {}, error: "", fieldErrors: {}, loading: false, planId: null })}
              >
                Cancel
              </button>
              <button type="button" className="btn btn-primary" onClick={handlePlanSave} disabled={planModal.loading}>
                Save
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
