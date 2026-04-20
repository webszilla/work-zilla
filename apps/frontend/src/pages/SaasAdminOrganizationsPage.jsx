import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiFetch } from "../lib/api.js";
import TablePagination from "../components/TablePagination.jsx";
import { useConfirm } from "../components/ConfirmDialog.jsx";
import { formatDateLikeValue } from "../lib/datetime.js";

const emptyState = {
  loading: true,
  error: "",
  data: null
};

function formatValue(value) {
  if (value === null || value === undefined || value === "") {
    return "-";
  }
  return formatDateLikeValue(value, "-");
}

function titleCase(value) {
  if (!value) {
    return "-";
  }
  return String(value)
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatAddonUserCount(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return "-";
  }
  return String(Math.trunc(parsed));
}

function normalizeProductStatuses(value) {
  return Array.isArray(value) ? value : [];
}

function formatRemainingDays(value) {
  if (value === null || value === undefined || value === "") {
    return "-";
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return "-";
  }
  return `${Math.max(0, Math.trunc(parsed))} day(s)`;
}

function formatConfiguredDays(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return "-";
  }
  return String(Math.trunc(parsed));
}

function getRestoreActionTitle(org) {
  if (org?.can_restore) {
    return "Restore Organization";
  }
  if (org?.storage_retention?.retention_crossed) {
    return "Restore window expired after hard-delete date";
  }
  return "Restore unavailable: deleted organization record not found";
}

function getPermanentDeleteActionTitle(org) {
  if (org?.can_permanent_delete) {
    return "Permanent Delete";
  }
  const hardDeleteAt = org?.storage_retention?.hard_delete_at;
  if (hardDeleteAt) {
    return `Permanent delete available after ${hardDeleteAt}`;
  }
  return "Permanent delete unavailable";
}

export default function SaasAdminOrganizationsPage() {
  const [state, setState] = useState(emptyState);
  const [searchTerm, setSearchTerm] = useState("");
  const [query, setQuery] = useState("");
  const [productFilter, setProductFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [activeTab, setActiveTab] = useState("org");
  const [dealerSearchTerm, setDealerSearchTerm] = useState("");
  const [dealerQuery, setDealerQuery] = useState("");
  const [dealerPage, setDealerPage] = useState(1);
  const [pendingSearchTerm, setPendingSearchTerm] = useState("");
  const [pendingQuery, setPendingQuery] = useState("");
  const [pendingPage, setPendingPage] = useState(1);
  const [inactiveTab, setInactiveTab] = useState("org");
  const [inactiveSearchTerm, setInactiveSearchTerm] = useState("");
  const [inactiveQuery, setInactiveQuery] = useState("");
  const [inactivePage, setInactivePage] = useState(1);
  const [inactiveDealerSearchTerm, setInactiveDealerSearchTerm] = useState("");
  const [inactiveDealerQuery, setInactiveDealerQuery] = useState("");
  const [inactiveDealerPage, setInactiveDealerPage] = useState(1);
  const [newSearchTerm, setNewSearchTerm] = useState("");
  const [newQuery, setNewQuery] = useState("");
  const [newPage, setNewPage] = useState(1);
  const [deletedTab, setDeletedTab] = useState("org");
  const [deletedSearchTerm, setDeletedSearchTerm] = useState("");
  const [deletedQuery, setDeletedQuery] = useState("");
  const [deletedPage, setDeletedPage] = useState(1);
  const [deletedDealerSearchTerm, setDeletedDealerSearchTerm] = useState("");
  const [deletedDealerQuery, setDeletedDealerQuery] = useState("");
  const [deletedDealerPage, setDeletedDealerPage] = useState(1);
  const [viewModal, setViewModal] = useState({ open: false, loading: false, data: null, error: "" });
  const [productModal, setProductModal] = useState({ open: false, orgName: "", rows: [] });
  const [storageModal, setStorageModal] = useState({
    open: false,
    orgName: "",
    rows: [],
    dataAvailable: true,
    retentionCrossed: false
  });
  const [editModal, setEditModal] = useState({
    open: false,
    loading: false,
    data: null,
    error: "",
    form: {}
  });
  const confirm = useConfirm();
  const navigate = useNavigate();
  const PAGE_SIZE = 10;

  async function refreshOrganizations() {
    const data = await apiFetch("/api/saas-admin/organizations");
    setState({ loading: false, error: "", data });
  }

  useEffect(() => {
    let active = true;
    async function loadOrganizations() {
      try {
        const data = await apiFetch("/api/saas-admin/organizations");
        if (!active) {
          return;
        }
        setState({ loading: false, error: "", data });
      } catch (error) {
        if (active) {
          setState({
            loading: false,
            error: error?.message || "Unable to load organizations.",
            data: null
          });
        }
      }
    }

    loadOrganizations();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const handle = setTimeout(() => {
      setQuery(searchTerm.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(handle);
  }, [searchTerm]);

  useEffect(() => {
    const handle = setTimeout(() => {
      setDealerQuery(dealerSearchTerm.trim());
      setDealerPage(1);
    }, 300);
    return () => clearTimeout(handle);
  }, [dealerSearchTerm]);

  useEffect(() => {
    const handle = setTimeout(() => {
      setPendingQuery(pendingSearchTerm.trim());
      setPendingPage(1);
    }, 300);
    return () => clearTimeout(handle);
  }, [pendingSearchTerm]);

  useEffect(() => {
    const handle = setTimeout(() => {
      setInactiveQuery(inactiveSearchTerm.trim());
      setInactivePage(1);
    }, 300);
    return () => clearTimeout(handle);
  }, [inactiveSearchTerm]);

  useEffect(() => {
    const handle = setTimeout(() => {
      setInactiveDealerQuery(inactiveDealerSearchTerm.trim());
      setInactiveDealerPage(1);
    }, 300);
    return () => clearTimeout(handle);
  }, [inactiveDealerSearchTerm]);

  useEffect(() => {
    const handle = setTimeout(() => {
      setNewQuery(newSearchTerm.trim());
      setNewPage(1);
    }, 300);
    return () => clearTimeout(handle);
  }, [newSearchTerm]);

  useEffect(() => {
    const handle = setTimeout(() => {
      setDeletedQuery(deletedSearchTerm.trim());
      setDeletedPage(1);
    }, 300);
    return () => clearTimeout(handle);
  }, [deletedSearchTerm]);

  useEffect(() => {
    const handle = setTimeout(() => {
      setDeletedDealerQuery(deletedDealerSearchTerm.trim());
      setDeletedDealerPage(1);
    }, 300);
    return () => clearTimeout(handle);
  }, [deletedDealerSearchTerm]);

  const organizations = state.data?.organizations || [];
  const dealers = state.data?.dealers || [];
  const plans = state.data?.plans || [];
  const products = state.data?.products || [];
  const deletedOrgs = state.data?.deleted_orgs || [];
  const deletedDealers = state.data?.deleted_dealers || [];

  const filteredOrgs = useMemo(() => {
    if (!query) {
      if (productFilter === "all") {
        return organizations;
      }
      return organizations.filter((org) =>
        (org.products || []).includes(productFilter)
      );
    }
    const term = query.toLowerCase();
    return organizations.filter((org) => {
      const planName = org.subscription?.plan_name || "";
      const matchesTerm = [
        org.name,
        org.company_key,
        org.owner_name,
        org.owner_email,
        planName,
        org.subscription?.end_date
      ].some((value) => String(value || "").toLowerCase().includes(term));
      const matchesProduct =
        productFilter === "all" ||
        (org.products || []).includes(productFilter);
      return matchesTerm && matchesProduct;
    });
  }, [organizations, query, productFilter]);

  const totalPages = Math.max(Math.ceil(filteredOrgs.length / PAGE_SIZE), 1);
  const pagedOrgs = useMemo(
    () => filteredOrgs.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [filteredOrgs, page]
  );
  const totalItems = filteredOrgs.length;
  const startEntry = totalItems ? (page - 1) * PAGE_SIZE + 1 : 0;
  const endEntry = totalItems ? Math.min(page * PAGE_SIZE, totalItems) : 0;

  const filteredDealers = useMemo(() => {
    if (!dealerQuery) {
      return dealers;
    }
    const term = dealerQuery.toLowerCase();
    return dealers.filter((dealer) =>
      [
        dealer.name,
        dealer.email,
        dealer.referral_code,
        dealer.referred_by,
        dealer.subscription_status,
        dealer.subscription_end
      ].some((value) => String(value || "").toLowerCase().includes(term))
    );
  }, [dealers, dealerQuery]);
  const dealerTotalPages = Math.max(Math.ceil(filteredDealers.length / PAGE_SIZE), 1);
  const pagedDealers = useMemo(
    () => filteredDealers.slice((dealerPage - 1) * PAGE_SIZE, dealerPage * PAGE_SIZE),
    [filteredDealers, dealerPage]
  );
  const dealerTotalItems = filteredDealers.length;
  const dealerStartEntry = dealerTotalItems ? (dealerPage - 1) * PAGE_SIZE + 1 : 0;
  const dealerEndEntry = dealerTotalItems ? Math.min(dealerPage * PAGE_SIZE, dealerTotalItems) : 0;

  const pendingVerificationOrgs = useMemo(() => {
    const base = organizations.filter(
      (org) => org.owner_email && !org.owner_email_verified
    );
    if (!pendingQuery) {
      return base;
    }
    const term = pendingQuery.toLowerCase();
    return base.filter((org) =>
      [
        org.name,
        org.owner_name,
        org.owner_email,
        org.owner_email_verification_sent_at
      ].some((value) => String(value || "").toLowerCase().includes(term))
    );
  }, [organizations, pendingQuery]);
  const pendingTotalPages = Math.max(Math.ceil(pendingVerificationOrgs.length / PAGE_SIZE), 1);
  const pendingPagedOrgs = useMemo(
    () => pendingVerificationOrgs.slice((pendingPage - 1) * PAGE_SIZE, pendingPage * PAGE_SIZE),
    [pendingVerificationOrgs, pendingPage]
  );
  const pendingTotalItems = pendingVerificationOrgs.length;
  const pendingStartEntry = pendingTotalItems ? (pendingPage - 1) * PAGE_SIZE + 1 : 0;
  const pendingEndEntry = pendingTotalItems ? Math.min(pendingPage * PAGE_SIZE, pendingTotalItems) : 0;

  const inactiveOrgs = useMemo(() => {
    return organizations.filter((org) => {
      const planStatus = String(org.subscription?.status || "").toLowerCase();
      const productStatuses = org.product_statuses || [];
      const hasInactiveProduct = productStatuses.some((item) => item.status === "inactive");
      const missingPlan = !org.subscription?.plan_name;
      return hasInactiveProduct || planStatus === "inactive" || planStatus === "expired" || missingPlan;
    });
  }, [organizations]);

  const inactiveFilteredOrgs = useMemo(() => {
    const base = inactiveOrgs.filter((org) => {
      if (productFilter === "all") {
        return true;
      }
      return (org.products || []).includes(productFilter);
    });
    if (!inactiveQuery) {
      return base;
    }
    const term = inactiveQuery.toLowerCase();
    return base.filter((org) => {
      const planName = org.subscription?.plan_name || "";
      return [
        org.name,
        org.company_key,
        org.owner_name,
        org.owner_email,
        planName,
        org.subscription?.end_date
      ].some((value) => String(value || "").toLowerCase().includes(term));
    });
  }, [inactiveOrgs, inactiveQuery, productFilter]);

  const inactiveTotalPages = Math.max(Math.ceil(inactiveFilteredOrgs.length / PAGE_SIZE), 1);
  const inactivePagedOrgs = useMemo(
    () => inactiveFilteredOrgs.slice((inactivePage - 1) * PAGE_SIZE, inactivePage * PAGE_SIZE),
    [inactiveFilteredOrgs, inactivePage]
  );
  const inactiveTotalItems = inactiveFilteredOrgs.length;
  const inactiveStartEntry = inactiveTotalItems ? (inactivePage - 1) * PAGE_SIZE + 1 : 0;
  const inactiveEndEntry = inactiveTotalItems ? Math.min(inactivePage * PAGE_SIZE, inactiveTotalItems) : 0;

  const inactiveDealers = useMemo(
    () => dealers.filter((dealer) => String(dealer.subscription_status || "").toLowerCase() !== "active"),
    [dealers]
  );
  const inactiveFilteredDealers = useMemo(() => {
    if (!inactiveDealerQuery) {
      return inactiveDealers;
    }
    const term = inactiveDealerQuery.toLowerCase();
    return inactiveDealers.filter((dealer) =>
      [
        dealer.name,
        dealer.email,
        dealer.referral_code,
        dealer.referred_by,
        dealer.subscription_status,
        dealer.subscription_end
      ].some((value) => String(value || "").toLowerCase().includes(term))
    );
  }, [inactiveDealers, inactiveDealerQuery]);
  const inactiveDealerTotalPages = Math.max(Math.ceil(inactiveFilteredDealers.length / PAGE_SIZE), 1);
  const inactivePagedDealers = useMemo(
    () => inactiveFilteredDealers.slice((inactiveDealerPage - 1) * PAGE_SIZE, inactiveDealerPage * PAGE_SIZE),
    [inactiveFilteredDealers, inactiveDealerPage]
  );
  const inactiveDealerTotalItems = inactiveFilteredDealers.length;
  const inactiveDealerStartEntry = inactiveDealerTotalItems ? (inactiveDealerPage - 1) * PAGE_SIZE + 1 : 0;
  const inactiveDealerEndEntry = inactiveDealerTotalItems
    ? Math.min(inactiveDealerPage * PAGE_SIZE, inactiveDealerTotalItems)
    : 0;

  const newAccountsOrgs = useMemo(() => {
    return organizations.filter((org) => {
      const hasSubscriptionId = Boolean(org.subscription?.id);
      const hasSubscriptionPlan = Boolean(String(org.subscription?.plan_name || "").trim());
      const hasProductPlan = (org.product_statuses || []).some(
        (item) => String(item?.plan_name || "").trim() && String(item?.plan_name || "").trim() !== "-"
      );
      return !hasSubscriptionId && !hasSubscriptionPlan && !hasProductPlan;
    });
  }, [organizations]);

  const newFilteredOrgs = useMemo(() => {
    const base = newAccountsOrgs.filter((org) => {
      if (productFilter === "all") {
        return true;
      }
      return (org.products || []).includes(productFilter);
    });
    if (!newQuery) {
      return base;
    }
    const term = newQuery.toLowerCase();
    return base.filter((org) =>
      [
        org.name,
        org.company_key,
        org.owner_name,
        org.owner_email,
        org.created_at,
      ].some((value) => String(value || "").toLowerCase().includes(term))
    );
  }, [newAccountsOrgs, newQuery, productFilter]);
  const newTotalPages = Math.max(Math.ceil(newFilteredOrgs.length / PAGE_SIZE), 1);
  const newPagedOrgs = useMemo(
    () => newFilteredOrgs.slice((newPage - 1) * PAGE_SIZE, newPage * PAGE_SIZE),
    [newFilteredOrgs, newPage]
  );
  const newTotalItems = newFilteredOrgs.length;
  const newStartEntry = newTotalItems ? (newPage - 1) * PAGE_SIZE + 1 : 0;
  const newEndEntry = newTotalItems ? Math.min(newPage * PAGE_SIZE, newTotalItems) : 0;

  const deletedFilteredOrgs = useMemo(() => {
    if (!deletedQuery) {
      return deletedOrgs;
    }
    const term = deletedQuery.toLowerCase();
    return deletedOrgs.filter((org) =>
      [
        org.organization_name,
        org.owner_username,
        org.owner_email,
        org.reason,
        org.deleted_at
      ].some((value) => String(value || "").toLowerCase().includes(term))
    );
  }, [deletedOrgs, deletedQuery]);
  const deletedTotalPages = Math.max(Math.ceil(deletedFilteredOrgs.length / PAGE_SIZE), 1);
  const deletedPagedOrgs = useMemo(
    () => deletedFilteredOrgs.slice((deletedPage - 1) * PAGE_SIZE, deletedPage * PAGE_SIZE),
    [deletedFilteredOrgs, deletedPage]
  );
  const deletedTotalItems = deletedFilteredOrgs.length;
  const deletedStartEntry = deletedTotalItems ? (deletedPage - 1) * PAGE_SIZE + 1 : 0;
  const deletedEndEntry = deletedTotalItems ? Math.min(deletedPage * PAGE_SIZE, deletedTotalItems) : 0;

  const deletedFilteredDealers = useMemo(() => {
    if (!deletedDealerQuery) {
      return deletedDealers;
    }
    const term = deletedDealerQuery.toLowerCase();
    return deletedDealers.filter((dealer) =>
      [
        dealer.name,
        dealer.email,
        dealer.reason,
        dealer.deleted_at
      ].some((value) => String(value || "").toLowerCase().includes(term))
    );
  }, [deletedDealers, deletedDealerQuery]);
  const deletedDealerTotalPages = Math.max(Math.ceil(deletedFilteredDealers.length / PAGE_SIZE), 1);
  const deletedPagedDealers = useMemo(
    () => deletedFilteredDealers.slice((deletedDealerPage - 1) * PAGE_SIZE, deletedDealerPage * PAGE_SIZE),
    [deletedFilteredDealers, deletedDealerPage]
  );
  const deletedDealerTotalItems = deletedFilteredDealers.length;
  const deletedDealerStartEntry = deletedDealerTotalItems ? (deletedDealerPage - 1) * PAGE_SIZE + 1 : 0;
  const deletedDealerEndEntry = deletedDealerTotalItems
    ? Math.min(deletedDealerPage * PAGE_SIZE, deletedDealerTotalItems)
    : 0;

  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages);
    }
  }, [page, totalPages]);

  useEffect(() => {
    if (dealerPage > dealerTotalPages) {
      setDealerPage(dealerTotalPages);
    }
  }, [dealerPage, dealerTotalPages]);

  useEffect(() => {
    if (pendingPage > pendingTotalPages) {
      setPendingPage(pendingTotalPages);
    }
  }, [pendingPage, pendingTotalPages]);

  useEffect(() => {
    if (inactivePage > inactiveTotalPages) {
      setInactivePage(inactiveTotalPages);
    }
  }, [inactivePage, inactiveTotalPages]);

  useEffect(() => {
    if (inactiveDealerPage > inactiveDealerTotalPages) {
      setInactiveDealerPage(inactiveDealerTotalPages);
    }
  }, [inactiveDealerPage, inactiveDealerTotalPages]);

  useEffect(() => {
    if (deletedPage > deletedTotalPages) {
      setDeletedPage(deletedTotalPages);
    }
  }, [deletedPage, deletedTotalPages]);

  useEffect(() => {
    if (deletedDealerPage > deletedDealerTotalPages) {
      setDeletedDealerPage(deletedDealerTotalPages);
    }
  }, [deletedDealerPage, deletedDealerTotalPages]);

  function closeView() {
    setViewModal({ open: false, loading: false, data: null, error: "" });
  }

  function closeProductModal() {
    setProductModal({ open: false, orgName: "", rows: [] });
  }

  function closeStorageModal() {
    setStorageModal({ open: false, orgName: "", rows: [], dataAvailable: true, retentionCrossed: false });
  }

  function openProductModal(org) {
    const rows = normalizeProductStatuses(org?.product_statuses).map((item) => ({
      slug: item.slug || "",
      name: item.name || "-",
      plan_name: item.plan_name || "-",
      start_date: item.start_date || "-",
      end_date: item.end_date || "-",
      addon_user_count: formatAddonUserCount(item.addon_user_count),
      status: titleCase(item.status || "-")
    }));
    const fallbackRows = rows.length
      ? rows
      : [{ slug: "", name: "-", plan_name: "-", start_date: "-", end_date: "-", addon_user_count: "-", status: "-" }];
    setProductModal({
      open: true,
      orgName: org?.name || "Organization",
      rows: fallbackRows
    });
  }

  function openStorageModal(org) {
    const retention = org?.storage_retention || {};
    const rows = [
      {
        phase: "Grace Days",
        configured: formatConfiguredDays(retention.grace_days),
        remaining: formatRemainingDays(retention.grace_remaining_days),
        until: retention.grace_until || "-"
      },
      {
        phase: "Active Days",
        configured: formatConfiguredDays(retention.active_days),
        remaining: formatRemainingDays(retention.active_remaining_days),
        until: retention.active_until || "-"
      },
      {
        phase: "Hard Delete Days",
        configured: formatConfiguredDays(retention.hard_delete_days),
        remaining:
          Number(retention.hard_delete_days || 0) > 0
            ? formatRemainingDays(retention.hard_delete_remaining_days)
            : "-",
        until: Number(retention.hard_delete_days || 0) > 0 ? (retention.hard_delete_at || "-") : "Never"
      }
    ];
    setStorageModal({
      open: true,
      orgName: org?.organization_name || org?.name || "Organization",
      rows,
      dataAvailable: retention.data_available !== false,
      retentionCrossed: retention.retention_crossed === true
    });
  }

  function closeEdit() {
    setEditModal({ open: false, loading: false, data: null, error: "", form: {} });
  }

  async function handleDelete(org) {
    if (org?.can_delete === false) {
      setState((prev) => ({
        ...prev,
        error: "Django/SaaS Admin organization cannot be deleted."
      }));
      return;
    }
    const confirmed = await confirm({
      title: "Delete Organization",
      message: `Delete ${org.name}? It will move to Deleted ORG and can be restored later.`,
      confirmText: "Move to Deleted",
      confirmVariant: "danger"
    });
    if (!confirmed) {
      return;
    }
    try {
      await apiFetch(`/api/saas-admin/organizations/${org.id}`, {
        method: "DELETE"
      });
      await refreshOrganizations();
    } catch (error) {
      setState((prev) => ({
        ...prev,
        error: error?.message || "Unable to delete organization."
      }));
    }
  }

  async function handleDeletedOrgRestore(org) {
    if (!org?.can_restore) {
      return;
    }
    const restoreOrgId = org?.id;
    const legacyId = org?.legacy_deleted_account_id;
    const confirmed = await confirm({
      title: "Restore Organization",
      message: `Restore ${org.organization_name || "this organization"} to active/inactive lists?`,
      confirmText: "Restore",
      confirmVariant: "primary"
    });
    if (!confirmed) {
      return;
    }
    try {
      if (restoreOrgId) {
        await apiFetch(`/api/saas-admin/organizations/${restoreOrgId}/restore`, {
          method: "POST"
        });
      } else if (legacyId) {
        await apiFetch(`/api/saas-admin/deleted-accounts/${legacyId}/restore`, {
          method: "POST"
        });
      } else {
        return;
      }
      await refreshOrganizations();
    } catch (error) {
      setState((prev) => ({
        ...prev,
        error: error?.message || "Unable to restore organization."
      }));
    }
  }

  async function handleDeletedOrgPermanentDelete(org) {
    const permanentId = org?.id;
    const legacyId = org?.legacy_deleted_account_id;
    if (!permanentId && !legacyId) {
      return;
    }
    if (!org?.can_permanent_delete) {
      setState((prev) => ({
        ...prev,
        error: getPermanentDeleteActionTitle(org)
      }));
      return;
    }
    const confirmed = await confirm({
      title: "Permanent Delete",
      message: `Permanently delete ${org.organization_name || "this organization"}? This cannot be undone.`,
      confirmText: "Permanent Delete",
      confirmVariant: "danger"
    });
    if (!confirmed) {
      return;
    }
    try {
      if (permanentId) {
        await apiFetch(`/api/saas-admin/organizations/${permanentId}/permanent-delete`, {
          method: "DELETE"
        });
      } else {
        await apiFetch(`/api/saas-admin/deleted-accounts/${legacyId}`, {
          method: "DELETE"
        });
      }
      await refreshOrganizations();
    } catch (error) {
      setState((prev) => ({
        ...prev,
        error: error?.message || "Unable to permanently delete organization."
      }));
    }
  }

  async function handleDealerDelete(dealer) {
    const confirmed = await confirm({
      title: "Delete Dealer",
      message: `Delete ${dealer.name || dealer.email}? This removes the dealer account and user login.`,
      confirmText: "Delete",
      confirmVariant: "danger"
    });
    if (!confirmed) {
      return;
    }
    try {
      await apiFetch(`/api/saas-admin/dealers/${dealer.id}`, {
        method: "DELETE"
      });
      await refreshOrganizations();
    } catch (error) {
      setState((prev) => ({
        ...prev,
        error: error?.message || "Unable to delete dealer."
      }));
    }
  }

  async function handleManualEmailApproval(org) {
    const confirmed = await confirm({
      title: "Manual Email Approval",
      message: `Approve email verification for ${org.owner_email || "this user"}?`,
      confirmText: "Approve Email",
      confirmVariant: "primary"
    });
    if (!confirmed) {
      return;
    }
    try {
      await apiFetch(`/api/saas-admin/organizations/${org.id}/email-manual-verify`, {
        method: "POST"
      });
      await refreshOrganizations();
    } catch (error) {
      setState((prev) => ({
        ...prev,
        error: error?.message || "Unable to approve email verification."
      }));
    }
  }

  if (state.loading) {
    return (
      <div className="card p-4 text-center">
        <div className="spinner" />
        <p className="mb-0">Loading organizations...</p>
      </div>
    );
  }

  return (
    <>
      <h3 className="page-title">Organizations</h3>
      <hr className="section-divider saas-admin-section__divider" />
      {state.error ? <div className="alert alert-danger">{state.error}</div> : null}

      <section className="mt-3 saas-org-table">
        <div className="d-flex gap-2 flex-wrap saas-org-tabs">
          <button
            type="button"
            className={`btn btn-sm ${activeTab === "org" ? "btn-primary" : "btn-outline-light"}`}
            onClick={() => setActiveTab("org")}
          >
            ORG Accounts
          </button>
          <button
            type="button"
            className={`btn btn-sm ${activeTab === "dealer" ? "btn-primary" : "btn-outline-light"}`}
            onClick={() => setActiveTab("dealer")}
          >
            Dealer Accounts
          </button>
          <button
            type="button"
            className={`btn btn-sm ${activeTab === "pending-email" ? "btn-primary" : "btn-outline-light"}`}
            onClick={() => setActiveTab("pending-email")}
          >
            Email Verification
          </button>
        </div>

        {activeTab === "org" ? (
          <>
            <div className="table-controls">
              <div className="table-length">Show {PAGE_SIZE} entries</div>
              <div className="d-flex align-items-center gap-2 flex-wrap saas-org-table__controls-right">
                <label className="table-search" htmlFor="saas-org-search">
                  <span>Search:</span>
                  <input
                    id="saas-org-search"
                    type="text"
                    value={searchTerm}
                    onChange={(event) => setSearchTerm(event.target.value)}
                    placeholder="Search organizations"
                  />
                </label>
                <label className="table-search" htmlFor="saas-org-product">
                  <span>Product:</span>
                  <select
                    id="saas-org-product"
                    value={productFilter}
                    onChange={(event) => {
                      setProductFilter(event.target.value);
                      setPage(1);
                    }}
                  >
                    <option value="all">All</option>
                    {products.map((product) => (
                      <option key={product.slug} value={product.slug}>
                        {product.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </div>
            <div className="table-responsive">
              <table className="table table-dark table-striped table-hover align-middle mb-0">
                <thead>
                  <tr>
                    <th>Organization</th>
                    <th>Admin User Name</th>
                    <th>Email ID</th>
                    <th className="saas-org-table__products">Products</th>
                    <th>Plan</th>
                    <th>Expire Date</th>
                    <th className="table-actions">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {pagedOrgs.length ? (
                    pagedOrgs.map((org) => {
                      return (
                        <tr key={org.id}>
                        <td>{org.name}</td>
                        <td>{formatValue(org.owner_name)}</td>
                        <td>{formatValue(org.owner_email)}</td>
                        <td>
                          <div className="saas-org-products-cell">
                            <button
                              type="button"
                              className="btn btn-outline-light btn-sm"
                              onClick={() => openProductModal(org)}
                              title="View Product Details"
                              aria-label="View Product Details"
                            >
                              <i className="bi bi-eye" aria-hidden="true" />
                            </button>
                          </div>
                        </td>
                        <td>{org.subscription?.plan_name || "-"}</td>
                        <td>{org.subscription?.end_date || "-"}</td>
                        <td className="table-actions">
                          <div className="d-inline-flex align-items-center gap-2 flex-nowrap">
                            <button
                              type="button"
                              className="btn btn-outline-light btn-sm"
                              onClick={() => navigate(`/saas-admin/organizations/${org.id}`)}
                            >
                              View
                            </button>
                            <button
                              type="button"
                              className="btn btn-primary btn-sm"
                              onClick={() => navigate(`/saas-admin/organizations/${org.id}#edit`)}
                            >
                              Edit
                            </button>
                            {org.can_delete !== false ? (
                              <button
                                type="button"
                                className="btn btn-danger btn-sm"
                                onClick={() => handleDelete(org)}
                              >
                                Delete
                              </button>
                            ) : null}
                          </div>
                        </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan="7">No organizations found.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="table-footer">
              <div className="table-info">
                Showing {startEntry} to {endEntry} of {totalItems} entries
              </div>
              <TablePagination
                page={page}
                totalPages={totalPages}
                onPageChange={setPage}
                showPageLinks
                showPageLabel={false}
                maxPageLinks={7}
              />
            </div>
          </>
        ) : activeTab === "dealer" ? (
          <>
            <div className="table-controls">
              <div className="table-length">Show {PAGE_SIZE} entries</div>
              <label className="table-search" htmlFor="saas-dealer-search">
                <span>Search:</span>
                <input
                  id="saas-dealer-search"
                  type="text"
                  value={dealerSearchTerm}
                  onChange={(event) => setDealerSearchTerm(event.target.value)}
                  placeholder="Search dealers"
                />
              </label>
            </div>
            <div className="table-responsive">
              <table className="table table-dark table-striped table-hover align-middle mb-0">
                <thead>
                  <tr>
                    <th>Dealer</th>
                    <th>Email ID</th>
                    <th>Referral Code</th>
                    <th>Referred By</th>
                    <th>Status</th>
                    <th>Start Date</th>
                    <th>End Date</th>
                        <th className="table-actions">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {pagedDealers.length ? (
                    pagedDealers.map((dealer) => (
                      <tr key={dealer.id}>
                        <td>{dealer.name || "-"}</td>
                        <td>{formatValue(dealer.email)}</td>
                        <td>{formatValue(dealer.referral_code)}</td>
                        <td>{formatValue(dealer.referred_by)}</td>
                        <td>{titleCase(dealer.subscription_status)}</td>
                        <td>{dealer.subscription_start || "-"}</td>
                        <td>{dealer.subscription_end || "-"}</td>
                        <td className="table-actions">
                          <div className="d-inline-flex align-items-center gap-2 flex-nowrap">
                            <button
                              type="button"
                              className="btn btn-outline-light btn-sm"
                              onClick={() => navigate(`/saas-admin/dealers/${dealer.id}`)}
                            >
                              View
                            </button>
                            <button
                              type="button"
                              className="btn btn-primary btn-sm"
                              onClick={() => navigate(`/saas-admin/dealers/${dealer.id}#edit`)}
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              className="btn btn-danger btn-sm"
                              onClick={() => handleDealerDelete(dealer)}
                            >
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                  <td colSpan="8">No dealers found.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="table-footer">
              <div className="table-info">
                Showing {dealerStartEntry} to {dealerEndEntry} of {dealerTotalItems} entries
              </div>
              <TablePagination
                page={dealerPage}
                totalPages={dealerTotalPages}
                onPageChange={setDealerPage}
                showPageLinks
                showPageLabel={false}
                maxPageLinks={7}
              />
            </div>
          </>
        ) : (
          <>
            <div className="table-controls">
              <div className="table-length">Show {PAGE_SIZE} entries</div>
              <label className="table-search" htmlFor="saas-pending-email-search">
                <span>Search:</span>
                <input
                  id="saas-pending-email-search"
                  type="text"
                  value={pendingSearchTerm}
                  onChange={(event) => setPendingSearchTerm(event.target.value)}
                  placeholder="Search pending emails"
                />
              </label>
            </div>
            <div className="table-responsive">
              <table className="table table-dark table-striped table-hover align-middle mb-0">
                <thead>
                  <tr>
                    <th>Organization</th>
                    <th>Admin User Name</th>
                    <th>Email ID</th>
                    <th>Verification Sent At</th>
                    <th className="table-actions">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {pendingPagedOrgs.length ? (
                    pendingPagedOrgs.map((org) => (
                      <tr key={`pending-email-${org.id}`}>
                        <td>{org.name}</td>
                        <td>{formatValue(org.owner_name)}</td>
                        <td>{formatValue(org.owner_email)}</td>
                        <td>{formatValue(org.owner_email_verification_sent_at)}</td>
                        <td className="table-actions">
                          <div className="d-inline-flex align-items-center gap-2 flex-nowrap">
                            <button
                              type="button"
                              className="btn btn-outline-light btn-sm"
                              onClick={() => navigate(`/saas-admin/organizations/${org.id}`)}
                            >
                              View
                            </button>
                            <button
                              type="button"
                              className="btn btn-success btn-sm"
                              onClick={() => handleManualEmailApproval(org)}
                            >
                              Approve Email
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan="5">No email verification pending accounts found.</td>
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
          </>
        )}
      </section>

      <section className="mt-4 saas-org-table">
        <div className="d-flex align-items-center justify-content-between flex-wrap gap-2">
          <h4 className="mb-0">Inactive Accounts</h4>
        </div>
        <hr className="section-divider saas-admin-section__divider" />
        <div className="d-flex gap-2 flex-wrap saas-org-tabs mt-3">
          <button
            type="button"
            className={`btn btn-sm ${inactiveTab === "org" ? "btn-primary" : "btn-outline-light"}`}
            onClick={() => setInactiveTab("org")}
          >
            ORG Accounts
          </button>
          <button
            type="button"
            className={`btn btn-sm ${inactiveTab === "dealer" ? "btn-primary" : "btn-outline-light"}`}
            onClick={() => setInactiveTab("dealer")}
          >
            Dealer Accounts
          </button>
          <button
            type="button"
            className={`btn btn-sm ${inactiveTab === "new" ? "btn-primary" : "btn-outline-light"}`}
            onClick={() => setInactiveTab("new")}
          >
            New Accounts
          </button>
        </div>

        {inactiveTab === "org" ? (
          <>
            <div className="table-controls">
              <div className="table-length">Show {PAGE_SIZE} entries</div>
              <div className="d-flex align-items-center gap-2 flex-wrap saas-org-table__controls-right">
                <label className="table-search" htmlFor="saas-inactive-search">
                  <span>Search:</span>
                  <input
                    id="saas-inactive-search"
                    type="text"
                    value={inactiveSearchTerm}
                    onChange={(event) => setInactiveSearchTerm(event.target.value)}
                    placeholder="Search organizations"
                  />
                </label>
                <label className="table-search" htmlFor="saas-inactive-product">
                  <span>Product:</span>
                  <select
                    id="saas-inactive-product"
                    value={productFilter}
                    onChange={(event) => {
                      setProductFilter(event.target.value);
                      setInactivePage(1);
                    }}
                  >
                    <option value="all">All</option>
                    {products.map((product) => (
                      <option key={product.slug} value={product.slug}>
                        {product.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </div>
            <div className="table-responsive">
              <table className="table table-dark table-striped table-hover align-middle mb-0">
                <thead>
                  <tr>
                    <th>Organization</th>
                    <th>Admin User Name</th>
                    <th>Email ID</th>
                    <th className="saas-org-table__products">Products</th>
                    <th>Plan</th>
                    <th>Expire Date</th>
                    <th className="table-actions">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {inactivePagedOrgs.length ? (
                    inactivePagedOrgs.map((org) => {
                      return (
                        <tr key={`inactive-${org.id}`}>
                        <td>{org.name}</td>
                        <td>{formatValue(org.owner_name)}</td>
                        <td>{formatValue(org.owner_email)}</td>
                        <td>
                          <div className="saas-org-products-cell">
                            <button
                              type="button"
                              className="btn btn-outline-light btn-sm"
                              onClick={() => openProductModal(org)}
                              title="View Product Details"
                              aria-label="View Product Details"
                            >
                              <i className="bi bi-eye" aria-hidden="true" />
                            </button>
                          </div>
                        </td>
                        <td>{org.subscription?.plan_name || "-"}</td>
                        <td>{org.subscription?.end_date || "-"}</td>
                        <td className="table-actions">
                          <div className="d-inline-flex align-items-center gap-2 flex-nowrap">
                            <button
                              type="button"
                              className="btn btn-outline-light btn-sm"
                              onClick={() => navigate(`/saas-admin/organizations/${org.id}`)}
                            >
                              View
                            </button>
                            <button
                              type="button"
                              className="btn btn-primary btn-sm"
                              onClick={() => navigate(`/saas-admin/organizations/${org.id}#edit`)}
                            >
                              Edit
                            </button>
                            {org.can_delete !== false ? (
                              <button
                                type="button"
                                className="btn btn-danger btn-sm"
                                onClick={() => handleDelete(org)}
                              >
                                Delete
                              </button>
                            ) : null}
                          </div>
                        </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan="7">No inactive organizations found.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="table-footer">
              <div className="table-info">
                Showing {inactiveStartEntry} to {inactiveEndEntry} of {inactiveTotalItems} entries
              </div>
              <TablePagination
                page={inactivePage}
                totalPages={inactiveTotalPages}
                onPageChange={setInactivePage}
                showPageLinks
                showPageLabel={false}
                maxPageLinks={7}
              />
            </div>
          </>
        ) : inactiveTab === "new" ? (
          <>
            <div className="table-controls">
              <div className="table-length">Show {PAGE_SIZE} entries</div>
              <div className="d-flex align-items-center gap-2 flex-wrap saas-org-table__controls-right">
                <label className="table-search" htmlFor="saas-new-search">
                  <span>Search:</span>
                  <input
                    id="saas-new-search"
                    type="text"
                    value={newSearchTerm}
                    onChange={(event) => setNewSearchTerm(event.target.value)}
                    placeholder="Search new accounts"
                  />
                </label>
                <label className="table-search" htmlFor="saas-new-product">
                  <span>Product:</span>
                  <select
                    id="saas-new-product"
                    value={productFilter}
                    onChange={(event) => {
                      setProductFilter(event.target.value);
                      setNewPage(1);
                    }}
                  >
                    <option value="all">All</option>
                    {products.map((product) => (
                      <option key={product.slug} value={product.slug}>
                        {product.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </div>
            <div className="table-responsive">
              <table className="table table-dark table-striped table-hover align-middle mb-0">
                <thead>
                  <tr>
                    <th>Organization</th>
                    <th>Admin User Name</th>
                    <th>Email ID</th>
                    <th>Created At</th>
                    <th className="table-actions">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {newPagedOrgs.length ? (
                    newPagedOrgs.map((org) => (
                      <tr key={`new-account-${org.id}`}>
                        <td>{org.name}</td>
                        <td>{formatValue(org.owner_name)}</td>
                        <td>{formatValue(org.owner_email)}</td>
                        <td>{formatValue(org.created_at)}</td>
                        <td className="table-actions">
                          <div className="d-inline-flex align-items-center gap-2 flex-nowrap">
                            <button
                              type="button"
                              className="btn btn-outline-light btn-sm"
                              onClick={() => navigate(`/saas-admin/organizations/${org.id}`)}
                            >
                              View
                            </button>
                            <button
                              type="button"
                              className="btn btn-primary btn-sm"
                              onClick={() => navigate(`/saas-admin/organizations/${org.id}#edit`)}
                            >
                              Edit
                            </button>
                            {org.can_delete !== false ? (
                              <button
                                type="button"
                                className="btn btn-danger btn-sm"
                                onClick={() => handleDelete(org)}
                              >
                                Delete
                              </button>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan="5">No new accounts found.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="table-footer">
              <div className="table-info">
                Showing {newStartEntry} to {newEndEntry} of {newTotalItems} entries
              </div>
              <TablePagination
                page={newPage}
                totalPages={newTotalPages}
                onPageChange={setNewPage}
                showPageLinks
                showPageLabel={false}
                maxPageLinks={7}
              />
            </div>
          </>
        ) : (
          <>
            <div className="table-controls">
              <div className="table-length">Show {PAGE_SIZE} entries</div>
              <label className="table-search" htmlFor="saas-inactive-dealer-search">
                <span>Search:</span>
                <input
                  id="saas-inactive-dealer-search"
                  type="text"
                  value={inactiveDealerSearchTerm}
                  onChange={(event) => setInactiveDealerSearchTerm(event.target.value)}
                  placeholder="Search dealers"
                />
              </label>
            </div>
            <div className="table-responsive">
              <table className="table table-dark table-striped table-hover align-middle mb-0">
                <thead>
                  <tr>
                    <th>Dealer</th>
                    <th>Email ID</th>
                    <th>Referral Code</th>
                    <th>Referred By</th>
                    <th>Status</th>
                    <th>Start Date</th>
                    <th>End Date</th>
                    <th className="table-actions">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {inactivePagedDealers.length ? (
                    inactivePagedDealers.map((dealer) => (
                      <tr key={`inactive-dealer-${dealer.id}`}>
                        <td>{dealer.name || "-"}</td>
                        <td>{formatValue(dealer.email)}</td>
                        <td>{formatValue(dealer.referral_code)}</td>
                        <td>{formatValue(dealer.referred_by)}</td>
                        <td>{titleCase(dealer.subscription_status)}</td>
                        <td>{dealer.subscription_start || "-"}</td>
                        <td>{dealer.subscription_end || "-"}</td>
                        <td className="table-actions">
                          <div className="d-inline-flex align-items-center gap-2 flex-nowrap">
                            <button
                              type="button"
                              className="btn btn-outline-light btn-sm"
                              onClick={() => navigate(`/saas-admin/dealers/${dealer.id}`)}
                            >
                              View
                            </button>
                            <button
                              type="button"
                              className="btn btn-primary btn-sm"
                              onClick={() => navigate(`/saas-admin/dealers/${dealer.id}#edit`)}
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              className="btn btn-danger btn-sm"
                              onClick={() => handleDealerDelete(dealer)}
                            >
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan="8">No inactive dealers found.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="table-footer">
              <div className="table-info">
                Showing {inactiveDealerStartEntry} to {inactiveDealerEndEntry} of {inactiveDealerTotalItems} entries
              </div>
              <TablePagination
                page={inactiveDealerPage}
                totalPages={inactiveDealerTotalPages}
                onPageChange={setInactiveDealerPage}
                showPageLinks
                showPageLabel={false}
                maxPageLinks={7}
              />
            </div>
          </>
        )}
      </section>

      <section className="mt-4 saas-org-table">
        <div className="d-flex align-items-center justify-content-between flex-wrap gap-2">
          <h4 className="mb-0">Deleted Accounts</h4>
        </div>
        <hr className="section-divider saas-admin-section__divider" />
        <div className="d-flex gap-2 flex-wrap saas-org-tabs mt-3">
          <button
            type="button"
            className={`btn btn-sm ${deletedTab === "org" ? "btn-primary" : "btn-outline-light"}`}
            onClick={() => setDeletedTab("org")}
          >
            ORG Accounts
          </button>
          <button
            type="button"
            className={`btn btn-sm ${deletedTab === "dealer" ? "btn-primary" : "btn-outline-light"}`}
            onClick={() => setDeletedTab("dealer")}
          >
            Dealer Accounts
          </button>
        </div>

        {deletedTab === "org" ? (
          <>
            <div className="table-controls">
              <div className="table-length">Show {PAGE_SIZE} entries</div>
              <label className="table-search" htmlFor="saas-deleted-search">
                <span>Search:</span>
                <input
                  id="saas-deleted-search"
                  type="text"
                  value={deletedSearchTerm}
                  onChange={(event) => setDeletedSearchTerm(event.target.value)}
                  placeholder="Search organizations"
                />
              </label>
            </div>
            <div className="table-responsive">
              <table className="table table-dark table-striped table-hover align-middle mb-0">
                <thead>
                  <tr>
                    <th>Organization</th>
                    <th>Admin User Name</th>
                    <th>Email ID</th>
                    <th>Deleted At</th>
                    <th>Reason</th>
                    <th className="table-actions">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {deletedPagedOrgs.length ? (
                    deletedPagedOrgs.map((org, index) => (
                      <tr key={`deleted-org-${org.organization_name}-${index}`}>
                        <td>{formatValue(org.organization_name)}</td>
                        <td>{formatValue(org.owner_username)}</td>
                        <td>{formatValue(org.owner_email)}</td>
                        <td>{formatValue(org.deleted_at)}</td>
                        <td>{formatValue(org.reason)}</td>
                        <td className="table-actions">
                          <div className="d-inline-flex align-items-center gap-2 flex-nowrap">
                            <button
                              type="button"
                              className={`btn btn-outline-light btn-sm saas-org-icon-btn ${org.can_restore ? "" : "disabled"}`}
                              onClick={() => {
                                if (!org.can_restore) {
                                  return;
                                }
                                handleDeletedOrgRestore(org);
                              }}
                              title={getRestoreActionTitle(org)}
                              aria-label="Restore Organization"
                              aria-disabled={!org.can_restore}
                            >
                              <i className="bi bi-arrow-counterclockwise" aria-hidden="true" />
                            </button>
                            <button
                              type="button"
                              className="btn btn-outline-light btn-sm saas-org-icon-btn"
                              onClick={() => openStorageModal(org)}
                              title="Storage Retention Details"
                              aria-label="Storage Retention Details"
                            >
                              <i className="bi bi-hdd-stack" aria-hidden="true" />
                            </button>
                            <button
                              type="button"
                              className={`${org.can_permanent_delete ? "btn btn-danger" : "btn btn-outline-danger"} btn-sm saas-org-icon-btn`}
                              onClick={() => handleDeletedOrgPermanentDelete(org)}
                              title={getPermanentDeleteActionTitle(org)}
                              aria-label="Permanent Delete"
                              aria-disabled={!org.can_permanent_delete}
                            >
                              <i className="bi bi-trash3-fill" aria-hidden="true" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan="6">No deleted organizations found.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="table-footer">
              <div className="table-info">
                Showing {deletedStartEntry} to {deletedEndEntry} of {deletedTotalItems} entries
              </div>
              <TablePagination
                page={deletedPage}
                totalPages={deletedTotalPages}
                onPageChange={setDeletedPage}
                showPageLinks
                showPageLabel={false}
                maxPageLinks={7}
              />
            </div>
          </>
        ) : (
          <>
            <div className="table-controls">
              <div className="table-length">Show {PAGE_SIZE} entries</div>
              <label className="table-search" htmlFor="saas-deleted-dealer-search">
                <span>Search:</span>
                <input
                  id="saas-deleted-dealer-search"
                  type="text"
                  value={deletedDealerSearchTerm}
                  onChange={(event) => setDeletedDealerSearchTerm(event.target.value)}
                  placeholder="Search dealers"
                />
              </label>
            </div>
            <div className="table-responsive">
              <table className="table table-dark table-striped table-hover align-middle mb-0">
                <thead>
                  <tr>
                    <th>Dealer</th>
                    <th>Email ID</th>
                    <th>Deleted At</th>
                    <th>Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {deletedPagedDealers.length ? (
                    deletedPagedDealers.map((dealer, index) => (
                      <tr key={`deleted-dealer-${dealer.id || dealer.email}-${index}`}>
                        <td>{formatValue(dealer.name)}</td>
                        <td>{formatValue(dealer.email)}</td>
                        <td>{formatValue(dealer.deleted_at)}</td>
                        <td>{formatValue(dealer.reason)}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan="4">No deleted dealers found.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="table-footer">
              <div className="table-info">
                Showing {deletedDealerStartEntry} to {deletedDealerEndEntry} of {deletedDealerTotalItems} entries
              </div>
              <TablePagination
                page={deletedDealerPage}
                totalPages={deletedDealerTotalPages}
                onPageChange={setDeletedDealerPage}
                showPageLinks
                showPageLabel={false}
                maxPageLinks={7}
              />
            </div>
          </>
        )}
      </section>

      {viewModal.open ? (
        <div className="modal-overlay" onClick={closeView}>
          <div className="modal-panel" onClick={(event) => event.stopPropagation()}>
            <h5>Organization Details</h5>
            <div className="text-secondary">Use the separate organization page to view and edit details.</div>
            <div className="d-flex justify-content-end mt-3">
              <button type="button" className="btn btn-secondary" onClick={closeView}>
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {productModal.open ? (
        <div className="modal-overlay" onClick={closeProductModal}>
          <div className="modal-panel" onClick={(event) => event.stopPropagation()} style={{ maxWidth: "980px", width: "96%" }}>
            <h5 className="mb-2">Products & Plans</h5>
            <div className="text-secondary mb-3">
              {productModal.orgName}
            </div>
            <div className="table-responsive">
              <table className="table table-dark table-striped table-hover align-middle mb-0">
                <thead>
                  <tr>
                    <th>Product</th>
                    <th>Plan</th>
                    <th>Start Date</th>
                    <th>End Date</th>
                    <th>Add-on Users</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {productModal.rows.map((item, index) => (
                    <tr key={`${item.slug || "product"}-${index}`}>
                      <td>{item.name || "-"}</td>
                      <td>{item.plan_name || "-"}</td>
                      <td>{item.start_date || "-"}</td>
                      <td>{item.end_date || "-"}</td>
                      <td>{item.addon_user_count || "-"}</td>
                      <td>{item.status || "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="d-flex justify-content-end mt-3">
              <button type="button" className="btn btn-secondary" onClick={closeProductModal}>
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {storageModal.open ? (
        <div className="modal-overlay" onClick={closeStorageModal}>
          <div className="modal-panel" onClick={(event) => event.stopPropagation()} style={{ maxWidth: "860px", width: "96%" }}>
            <h5 className="mb-2">Storage Retention Timeline</h5>
            <div className="text-secondary mb-2">{storageModal.orgName}</div>
            <div className={`mb-3 ${storageModal.dataAvailable ? "text-success" : "text-danger"}`}>
              {storageModal.dataAvailable && !storageModal.retentionCrossed
                ? "Data is within retention window. Restore and renew can continue."
                : "Retention window crossed. Storage data may not be available."}
            </div>
            <div className="table-responsive">
              <table className="table table-dark table-striped table-hover align-middle mb-0">
                <thead>
                  <tr>
                    <th>Retention Phase</th>
                    <th>Configured Days</th>
                    <th>Remaining Days</th>
                    <th>Until</th>
                  </tr>
                </thead>
                <tbody>
                  {storageModal.rows.map((row, index) => (
                    <tr key={`retention-row-${index}`}>
                      <td>{row.phase}</td>
                      <td>{row.configured}</td>
                      <td>{row.remaining}</td>
                      <td>{row.until}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="d-flex justify-content-end mt-3">
              <button type="button" className="btn btn-secondary" onClick={closeStorageModal}>
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
