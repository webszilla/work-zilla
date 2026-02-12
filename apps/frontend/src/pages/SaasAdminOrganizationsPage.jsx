import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiFetch } from "../lib/api.js";
import TablePagination from "../components/TablePagination.jsx";
import { useConfirm } from "../components/ConfirmDialog.jsx";

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
  const [inactiveTab, setInactiveTab] = useState("org");
  const [inactiveSearchTerm, setInactiveSearchTerm] = useState("");
  const [inactiveQuery, setInactiveQuery] = useState("");
  const [inactivePage, setInactivePage] = useState(1);
  const [inactiveDealerSearchTerm, setInactiveDealerSearchTerm] = useState("");
  const [inactiveDealerQuery, setInactiveDealerQuery] = useState("");
  const [inactiveDealerPage, setInactiveDealerPage] = useState(1);
  const [deletedTab, setDeletedTab] = useState("org");
  const [deletedSearchTerm, setDeletedSearchTerm] = useState("");
  const [deletedQuery, setDeletedQuery] = useState("");
  const [deletedPage, setDeletedPage] = useState(1);
  const [deletedDealerSearchTerm, setDeletedDealerSearchTerm] = useState("");
  const [deletedDealerQuery, setDeletedDealerQuery] = useState("");
  const [deletedDealerPage, setDeletedDealerPage] = useState(1);
  const [viewModal, setViewModal] = useState({ open: false, loading: false, data: null, error: "" });
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

  function closeEdit() {
    setEditModal({ open: false, loading: false, data: null, error: "", form: {} });
  }

  async function handleDelete(org) {
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

  async function handleDeletedOrgDelete(org) {
    if (!org?.id) {
      return;
    }
    const confirmed = await confirm({
      title: "Delete Deleted Account",
      message: `Delete deleted account entry for ${org.organization_name || "this organization"}?`,
      confirmText: "Delete",
      confirmVariant: "danger"
    });
    if (!confirmed) {
      return;
    }
    try {
      await apiFetch(`/api/saas-admin/deleted-accounts/${org.id}`, {
        method: "DELETE"
      });
      await refreshOrganizations();
    } catch (error) {
      setState((prev) => ({
        ...prev,
        error: error?.message || "Unable to delete deleted account."
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
      {state.error ? <div className="alert alert-danger">{state.error}</div> : null}

      <div className="card p-3 mt-3">
        <div className="d-flex gap-2 flex-wrap mb-3">
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
        </div>

        {activeTab === "org" ? (
          <>
            <div className="table-controls">
              <div className="table-length">Show {PAGE_SIZE} entries</div>
              <div className="d-flex align-items-center gap-2 flex-wrap">
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
              <table className="table table-dark table-striped table-hover align-middle mt-2">
                <thead>
                  <tr>
                    <th>Organization</th>
                    <th>Admin User Name</th>
                    <th>Email ID</th>
                    <th>Products</th>
                    <th>Plan</th>
                    <th>Expire Date</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {pagedOrgs.length ? (
                    pagedOrgs.map((org) => (
                      <tr key={org.id}>
                        <td>{org.name}</td>
                        <td>{formatValue(org.owner_name)}</td>
                        <td>{formatValue(org.owner_email)}</td>
                        <td>
                          {org.product_statuses && org.product_statuses.length
                            ? org.product_statuses.map((item) => item.name).join(", ")
                            : "-"}
                        </td>
                        <td>{org.subscription?.plan_name || "-"}</td>
                        <td>{org.subscription?.end_date || "-"}</td>
                        <td>
                          <button
                            type="button"
                            className="btn btn-outline-light btn-sm me-2"
                            onClick={() => navigate(`/saas-admin/organizations/${org.id}`)}
                          >
                            View
                          </button>
                          <button
                            type="button"
                            className="btn btn-primary btn-sm me-2"
                            onClick={() => navigate(`/saas-admin/organizations/${org.id}#edit`)}
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            className="btn btn-danger btn-sm"
                            onClick={() => handleDelete(org)}
                          >
                            Delete
                          </button>
                        </td>
                      </tr>
                    ))
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
        ) : (
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
              <table className="table table-dark table-striped table-hover align-middle mt-2">
                <thead>
                  <tr>
                    <th>Dealer</th>
                    <th>Email ID</th>
                    <th>Referral Code</th>
                    <th>Referred By</th>
                    <th>Status</th>
                    <th>Start Date</th>
                    <th>End Date</th>
                        <th>Action</th>
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
                        <td>
                          <button
                            type="button"
                            className="btn btn-outline-light btn-sm me-2"
                            onClick={() => navigate(`/saas-admin/dealers/${dealer.id}`)}
                          >
                            View
                          </button>
                          <button
                            type="button"
                            className="btn btn-primary btn-sm me-2"
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
        )}
      </div>

      <div className="card p-3 mt-4">
        <div className="d-flex align-items-center justify-content-between flex-wrap gap-2">
          <h4 className="mb-0">Inactive Accounts</h4>
        </div>
        <div className="d-flex gap-2 flex-wrap mt-3 mb-3">
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
        </div>

        {inactiveTab === "org" ? (
          <>
            <div className="table-controls">
              <div className="table-length">Show {PAGE_SIZE} entries</div>
              <div className="d-flex align-items-center gap-2 flex-wrap">
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
              <table className="table table-dark table-striped table-hover align-middle mt-2">
                <thead>
                  <tr>
                    <th>Organization</th>
                    <th>Admin User Name</th>
                    <th>Email ID</th>
                    <th>Products</th>
                    <th>Plan</th>
                    <th>Expire Date</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {inactivePagedOrgs.length ? (
                    inactivePagedOrgs.map((org) => (
                      <tr key={`inactive-${org.id}`}>
                        <td>{org.name}</td>
                        <td>{formatValue(org.owner_name)}</td>
                        <td>{formatValue(org.owner_email)}</td>
                        <td>
                          {org.product_statuses && org.product_statuses.length
                            ? org.product_statuses.map((item) => item.name).join(", ")
                            : "-"}
                        </td>
                        <td>{org.subscription?.plan_name || "-"}</td>
                        <td>{org.subscription?.end_date || "-"}</td>
                        <td>
                          <button
                            type="button"
                            className="btn btn-outline-light btn-sm me-2"
                            onClick={() => navigate(`/saas-admin/organizations/${org.id}`)}
                          >
                            View
                          </button>
                          <button
                            type="button"
                            className="btn btn-primary btn-sm me-2"
                            onClick={() => navigate(`/saas-admin/organizations/${org.id}#edit`)}
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            className="btn btn-danger btn-sm"
                            onClick={() => handleDelete(org)}
                          >
                            Delete
                          </button>
                        </td>
                      </tr>
                    ))
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
              <table className="table table-dark table-striped table-hover align-middle mt-2">
                <thead>
                  <tr>
                    <th>Dealer</th>
                    <th>Email ID</th>
                    <th>Referral Code</th>
                    <th>Referred By</th>
                    <th>Status</th>
                    <th>Start Date</th>
                    <th>End Date</th>
                    <th>Action</th>
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
                        <td>
                          <button
                            type="button"
                            className="btn btn-outline-light btn-sm me-2"
                            onClick={() => navigate(`/saas-admin/dealers/${dealer.id}`)}
                          >
                            View
                          </button>
                          <button
                            type="button"
                            className="btn btn-primary btn-sm me-2"
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
      </div>

      <div className="card p-3 mt-4">
        <div className="d-flex align-items-center justify-content-between flex-wrap gap-2">
          <h4 className="mb-0">Deleted Accounts</h4>
        </div>
        <div className="d-flex gap-2 flex-wrap mt-3 mb-3">
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
              <table className="table table-dark table-striped table-hover align-middle mt-2">
                <thead>
                  <tr>
                    <th>Organization</th>
                    <th>Admin User Name</th>
                    <th>Email ID</th>
                    <th>Deleted At</th>
                    <th>Reason</th>
                    <th>Action</th>
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
                        <td>
                          <button
                            type="button"
                            className="btn btn-danger btn-sm"
                            onClick={() => handleDeletedOrgDelete(org)}
                            disabled={!org.id}
                          >
                            Delete
                          </button>
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
              <table className="table table-dark table-striped table-hover align-middle mt-2">
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
      </div>

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
    </>
  );
}
