import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "../lib/api.js";
import TablePagination from "../components/TablePagination.jsx";

const emptyState = {
  loading: true,
  error: "",
  data: null
};

export default function SaasAdminReferralsPage() {
  const [state, setState] = useState(emptyState);
  const [notice, setNotice] = useState("");
  const [activeTab, setActiveTab] = useState("org");
  const [commissionRate, setCommissionRate] = useState("0");
  const [dealerCommissionRate, setDealerCommissionRate] = useState("0");
  const [dealerSubscriptionAmount, setDealerSubscriptionAmount] = useState("0");
  const [dealerReferralFlatAmount, setDealerReferralFlatAmount] = useState("0");
  const [rowEdits, setRowEdits] = useState({});
  const [dealerEdits, setDealerEdits] = useState({});
  const [dealerEarningEdits, setDealerEarningEdits] = useState({});
  const [dealerSubSearchTerm, setDealerSubSearchTerm] = useState("");
  const [dealerSubQuery, setDealerSubQuery] = useState("");
  const [dealerSubPage, setDealerSubPage] = useState(1);
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
  const PAGE_SIZE = 10;

  useEffect(() => {
    let active = true;
    async function loadReferrals() {
      setNotice("");
      try {
        const data = await apiFetch("/api/saas-admin/referrals");
        if (!active) {
          return;
        }
        setState({ loading: false, error: "", data });
        setCommissionRate(String(data.settings?.commission_rate ?? 0));
        setDealerCommissionRate(String(data.settings?.dealer_commission_rate ?? 0));
        setDealerSubscriptionAmount(String(data.settings?.dealer_subscription_amount ?? 0));
        setDealerReferralFlatAmount(String(data.settings?.dealer_referral_flat_amount ?? 0));
      } catch (error) {
        if (active) {
          setState({
            loading: false,
            error: error?.message || "Unable to load referral data.",
            data: null
          });
        }
      }
    }

    loadReferrals();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const handle = setTimeout(() => {
      setDealerSubQuery(dealerSubSearchTerm.trim());
      setDealerSubPage(1);
    }, 300);
    return () => clearTimeout(handle);
  }, [dealerSubSearchTerm]);

  const orgEarnings = state.data?.org_earnings || [];
  const dealerEarnings = state.data?.dealer_earnings || [];
  const dealers = state.data?.dealers || [];

  const orgRows = useMemo(
    () => orgEarnings.map((row) => ({
      ...row,
      form: rowEdits[row.id] || {
        status: row.status,
        payout_reference: row.payout_reference || "",
        payout_date: row.payout_date || ""
      }
    })),
    [orgEarnings, rowEdits]
  );

  const dealerRows = useMemo(
    () => dealerEarnings.map((row) => ({
      ...row,
      form: dealerEarningEdits[row.id] || {
        status: row.status,
        payout_reference: row.payout_reference || "",
        payout_date: row.payout_date || ""
      }
    })),
    [dealerEarnings, dealerEarningEdits]
  );

  const dealerAccounts = useMemo(
    () => dealers.map((dealer) => ({
      ...dealer,
      form: dealerEdits[dealer.id] || {
        subscription_status: dealer.subscription_status,
        subscription_start: normalizeDateValue(dealer.subscription_start),
        subscription_end: normalizeDateValue(dealer.subscription_end),
        subscription_amount: dealer.subscription_amount ?? 0
      }
    })),
    [dealers, dealerEdits]
  );

  function normalizeDateValue(value) {
    if (!value) {
      return "";
    }
    const text = String(value);
    if (text.includes("T")) {
      return text.split("T")[0];
    }
    if (text.includes(" ")) {
      return text.split(" ")[0];
    }
    return text;
  }

  const filteredDealerAccounts = useMemo(() => {
    if (!dealerSubQuery) {
      return dealerAccounts;
    }
    const term = dealerSubQuery.toLowerCase();
    return dealerAccounts.filter((dealer) =>
      [
        dealer.username,
        dealer.email,
        dealer.referral_code,
        dealer.referred_by,
        dealer.form?.subscription_status,
        dealer.form?.subscription_start,
        dealer.form?.subscription_end,
        dealer.form?.subscription_amount
      ].some((value) => String(value || "").toLowerCase().includes(term))
    );
  }, [dealerAccounts, dealerSubQuery]);
  const dealerSubTotalPages = Math.max(Math.ceil(filteredDealerAccounts.length / PAGE_SIZE), 1);
  const pagedDealerAccounts = useMemo(
    () => filteredDealerAccounts.slice((dealerSubPage - 1) * PAGE_SIZE, dealerSubPage * PAGE_SIZE),
    [filteredDealerAccounts, dealerSubPage]
  );
  const dealerSubTotalItems = filteredDealerAccounts.length;
  const dealerSubStartEntry = dealerSubTotalItems ? (dealerSubPage - 1) * PAGE_SIZE + 1 : 0;
  const dealerSubEndEntry = dealerSubTotalItems ? Math.min(dealerSubPage * PAGE_SIZE, dealerSubTotalItems) : 0;

  useEffect(() => {
    if (dealerSubPage > dealerSubTotalPages) {
      setDealerSubPage(dealerSubTotalPages);
    }
  }, [dealerSubPage, dealerSubTotalPages]);

  function updateReferralTable(tab, status, patch) {
    setReferralTableState((prev) => ({
      ...prev,
      [tab]: {
        ...prev[tab],
        [status]: { ...prev[tab][status], ...patch }
      }
    }));
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
        row.transfer_id,
        row.base_amount,
        row.commission_rate,
        row.commission_amount,
        row.flat_amount,
        row.status,
        row.payout_reference,
        row.payout_date
      ].some((value) => String(value || "").toLowerCase().includes(needle))
    );
  }

  function getPagedRows(rows, term, page) {
    const filtered = filterReferralRows(rows, term);
    const totalPages = Math.max(Math.ceil(filtered.length / PAGE_SIZE), 1);
    const currentPage = Math.min(page, totalPages);
    const startIndex = (currentPage - 1) * PAGE_SIZE;
    const paged = filtered.slice(startIndex, startIndex + PAGE_SIZE);
    return { filtered, paged, totalPages, currentPage, startIndex };
  }

  const orgRowsByStatus = useMemo(() => splitReferralsByStatus(orgRows), [orgRows]);
  const dealerRowsByStatus = useMemo(() => splitReferralsByStatus(dealerRows), [dealerRows]);

  function renderOrgReferralTable(rows, label, status) {
    const tableState = referralTableState.org[status];
    const { filtered, paged, totalPages, currentPage, startIndex } = getPagedRows(
      rows,
      tableState.term,
      tableState.page
    );
    return (
      <div className="card p-3 mt-3">
        <div className="d-flex align-items-center justify-content-between flex-wrap gap-2">
          <h6 className="mb-0">{label}</h6>
          <label className="table-search" htmlFor={`referrals-org-${status}-search`}>
            <span>Search:</span>
            <input
              id={`referrals-org-${status}-search`}
              type="text"
              value={tableState.term}
              onChange={(event) => updateReferralTable("org", status, { term: event.target.value, page: 1 })}
              placeholder="Search"
            />
          </label>
        </div>
        <div className="table-responsive mt-2">
          <table className="table table-dark table-striped table-hover align-middle">
            <thead>
              <tr>
                <th>Referrer</th>
                <th>Referred Org</th>
                <th>Transfer</th>
                <th>Base Amount</th>
                <th>Rate</th>
                <th>Commission</th>
                <th>Status</th>
                <th>Payout Ref</th>
                <th>Payout Date</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {paged.length ? (
                paged.map((row) => (
                  <tr key={row.id}>
                    <td>{row.referrer_org || "-"}</td>
                    <td>{row.referred_org || "-"}</td>
                    <td>{row.transfer_id || "-"}</td>
                    <td>{row.base_amount ?? "-"}</td>
                    <td>{row.commission_rate ?? 0}%</td>
                    <td>{row.commission_amount ?? "-"}</td>
                    <td>
                      <select
                        className="form-select form-select-sm"
                        value={row.form.status || "pending"}
                        onChange={(event) => updateRowForm(row.id, "status", event.target.value)}
                      >
                        <option value="pending">Pending</option>
                        <option value="paid">Paid</option>
                        <option value="rejected">Rejected</option>
                      </select>
                    </td>
                    <td>
                      <input
                        type="text"
                        className="form-control form-control-sm"
                        value={row.form.payout_reference || ""}
                        onChange={(event) => updateRowForm(row.id, "payout_reference", event.target.value)}
                        placeholder="Ref: 251245"
                      />
                    </td>
                    <td>
                      <input
                        type="date"
                        className="form-control form-control-sm"
                        value={row.form.payout_date || ""}
                        onChange={(event) => updateRowForm(row.id, "payout_date", event.target.value)}
                      />
                    </td>
                    <td>
                      <button
                        className="btn btn-outline-light btn-sm"
                        type="button"
                        onClick={() => handleRowSave(row)}
                      >
                        Update
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="10">No referrals found.</td>
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
            onPageChange={(nextPage) => updateReferralTable("org", status, { page: nextPage })}
            showPageLinks
            showPageLabel={false}
            maxPageLinks={7}
          />
        </div>
      </div>
    );
  }

  function renderDealerReferralTable(rows, label, status) {
    const tableState = referralTableState.dealer[status];
    const { filtered, paged, totalPages, currentPage, startIndex } = getPagedRows(
      rows,
      tableState.term,
      tableState.page
    );
    return (
      <div className="card p-3 mt-3">
        <div className="d-flex align-items-center justify-content-between flex-wrap gap-2">
          <h6 className="mb-0">{label}</h6>
          <label className="table-search" htmlFor={`referrals-dealer-${status}-search`}>
            <span>Search:</span>
            <input
              id={`referrals-dealer-${status}-search`}
              type="text"
              value={tableState.term}
              onChange={(event) => updateReferralTable("dealer", status, { term: event.target.value, page: 1 })}
              placeholder="Search"
            />
          </label>
        </div>
        <div className="table-responsive mt-2">
          <table className="table table-dark table-striped table-hover align-middle">
            <thead>
              <tr>
                <th>Referrer</th>
                <th>Referred Org</th>
                <th>Referred Dealer</th>
                <th>Transfer</th>
                <th>Base</th>
                <th>Rate</th>
                <th>Commission</th>
                <th>Flat</th>
                <th>Status</th>
                <th>Payout Ref</th>
                <th>Payout Date</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {paged.length ? (
                paged.map((row) => (
                  <tr key={row.id}>
                    <td>{row.referrer_dealer || "-"}</td>
                    <td>{row.referred_org || "-"}</td>
                    <td>{row.referred_dealer || "-"}</td>
                    <td>{row.transfer_id || "-"}</td>
                    <td>{row.base_amount ?? "-"}</td>
                    <td>{row.commission_rate ?? 0}%</td>
                    <td>{row.commission_amount ?? "-"}</td>
                    <td>{row.flat_amount ?? "-"}</td>
                    <td>
                      <select
                        className="form-select form-select-sm"
                        value={row.form.status || "pending"}
                        onChange={(event) => updateDealerEarningForm(row.id, "status", event.target.value)}
                      >
                        <option value="pending">Pending</option>
                        <option value="paid">Paid</option>
                        <option value="rejected">Rejected</option>
                      </select>
                    </td>
                    <td>
                      <input
                        type="text"
                        className="form-control form-control-sm"
                        value={row.form.payout_reference || ""}
                        onChange={(event) => updateDealerEarningForm(row.id, "payout_reference", event.target.value)}
                        placeholder="Ref: 251245"
                      />
                    </td>
                    <td>
                      <input
                        type="date"
                        className="form-control form-control-sm"
                        value={row.form.payout_date || ""}
                        onChange={(event) => updateDealerEarningForm(row.id, "payout_date", event.target.value)}
                      />
                    </td>
                    <td>
                      <button
                        className="btn btn-outline-light btn-sm"
                        type="button"
                        onClick={() => handleDealerEarningSave(row)}
                      >
                        Update
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="12">No referrals found.</td>
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
            onPageChange={(nextPage) => updateReferralTable("dealer", status, { page: nextPage })}
            showPageLinks
            showPageLabel={false}
            maxPageLinks={7}
          />
        </div>
      </div>
    );
  }

  function updateRowForm(id, field, value) {
    setRowEdits((prev) => ({
      ...prev,
      [id]: { ...(prev[id] || {}), [field]: value }
    }));
  }

  function updateDealerForm(id, field, value) {
    setDealerEdits((prev) => ({
      ...prev,
      [id]: { ...(prev[id] || {}), [field]: value }
    }));
  }

  function updateDealerEarningForm(id, field, value) {
    setDealerEarningEdits((prev) => ({
      ...prev,
      [id]: { ...(prev[id] || {}), [field]: value }
    }));
  }

  async function handleSettingsSubmit(event) {
    event.preventDefault();
    setNotice("");
    try {
      const data = await apiFetch("/api/saas-admin/referrals/settings", {
        method: "POST",
        body: JSON.stringify({
          commission_rate: commissionRate,
          dealer_commission_rate: dealerCommissionRate,
          dealer_subscription_amount: dealerSubscriptionAmount,
          dealer_referral_flat_amount: dealerReferralFlatAmount
        })
      });
      setNotice("Referral commission updated.");
      setCommissionRate(String(data.commission_rate ?? 0));
      setDealerCommissionRate(String(data.dealer_commission_rate ?? 0));
      setDealerSubscriptionAmount(String(data.dealer_subscription_amount ?? 0));
      setDealerReferralFlatAmount(String(data.dealer_referral_flat_amount ?? 0));
    } catch (error) {
      setNotice("");
      setState((prev) => ({
        ...prev,
        error: error?.message || "Unable to update commission rate."
      }));
    }
  }

  async function handleRowSave(row) {
    setNotice("");
    try {
      const payload = row.form || {};
      await apiFetch(`/api/saas-admin/referrals/earnings/${row.id}`, {
        method: "POST",
        body: JSON.stringify(payload)
      });
      setNotice("Referral payout updated.");
      setRowEdits((prev) => {
        const next = { ...prev };
        delete next[row.id];
        return next;
      });
      const refreshed = await apiFetch("/api/saas-admin/referrals");
      setState({ loading: false, error: "", data: refreshed });
    } catch (error) {
      setNotice("");
      setState((prev) => ({
        ...prev,
        error: error?.message || "Unable to update payout."
      }));
    }
  }

  async function handleDealerSave(dealer) {
    setNotice("");
    try {
      await apiFetch(`/api/saas-admin/referrals/dealers/${dealer.id}`, {
        method: "POST",
        body: JSON.stringify(dealer.form || {})
      });
      setNotice("Dealer subscription updated.");
      setDealerEdits((prev) => {
        const next = { ...prev };
        delete next[dealer.id];
        return next;
      });
      const refreshed = await apiFetch("/api/saas-admin/referrals");
      setState({ loading: false, error: "", data: refreshed });
    } catch (error) {
      setNotice("");
      setState((prev) => ({
        ...prev,
        error: error?.message || "Unable to update dealer subscription."
      }));
    }
  }

  async function handleDealerEarningSave(row) {
    setNotice("");
    try {
      const payload = row.form || {};
      await apiFetch(`/api/saas-admin/referrals/dealer-earnings/${row.id}`, {
        method: "POST",
        body: JSON.stringify(payload)
      });
      setNotice("Dealer payout updated.");
      setDealerEarningEdits((prev) => {
        const next = { ...prev };
        delete next[row.id];
        return next;
      });
      const refreshed = await apiFetch("/api/saas-admin/referrals");
      setState({ loading: false, error: "", data: refreshed });
    } catch (error) {
      setNotice("");
      setState((prev) => ({
        ...prev,
        error: error?.message || "Unable to update dealer payout."
      }));
    }
  }

  if (state.loading) {
    return (
      <div className="card p-4 text-center">
        <div className="spinner" />
        <p className="mb-0">Loading referrals...</p>
      </div>
    );
  }

  return (
    <>
      <h2 className="page-title">Referral Program</h2>
      <hr className="section-divider" />

      {notice ? <div className="alert alert-success">{notice}</div> : null}
      {state.error ? <div className="alert alert-danger">{state.error}</div> : null}

      <div className="card p-3 mb-3">
        <h5>Referral Commission Settings</h5>
        <form onSubmit={handleSettingsSubmit} className="referral-settings-grid">
          <div className="referral-settings-field">
            <label className="form-label">ORG Commission Rate (%)</label>
            <input
              type="number"
              min="0"
              step="0.01"
              className="form-control"
              value={commissionRate}
              onChange={(event) => setCommissionRate(event.target.value)}
            />
          </div>
          <div className="referral-settings-field">
            <label className="form-label">Dealer Commission Rate (%)</label>
            <input
              type="number"
              min="0"
              step="0.01"
              className="form-control"
              value={dealerCommissionRate}
              onChange={(event) => setDealerCommissionRate(event.target.value)}
            />
          </div>
          <div className="referral-settings-field">
            <label className="form-label">Dealer Subscription Amount (Yearly)</label>
            <input
              type="number"
              min="0"
              step="0.01"
              className="form-control"
              value={dealerSubscriptionAmount}
              onChange={(event) => setDealerSubscriptionAmount(event.target.value)}
            />
          </div>
          <div className="referral-settings-field">
            <label className="form-label">Dealer Referral Flat Amount</label>
            <input
              type="number"
              min="0"
              step="0.01"
              className="form-control"
              value={dealerReferralFlatAmount}
              onChange={(event) => setDealerReferralFlatAmount(event.target.value)}
            />
          </div>
          <div className="referral-settings-action">
            <button className="btn btn-primary w-100" type="submit">
              Save
            </button>
          </div>
        </form>
      </div>

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
          {renderOrgReferralTable(orgRowsByStatus.pending, "Pending Payments", "pending")}
          {renderOrgReferralTable(orgRowsByStatus.paid, "Completed Payments", "paid")}
          {renderOrgReferralTable(orgRowsByStatus.rejected, "Rejected Payments", "rejected")}
        </>
      ) : (
        <>
          <div className="card p-3 mb-3">
            <h5>Dealer Subscriptions</h5>
            <div className="table-controls">
              <div className="table-length">Show {PAGE_SIZE} entries</div>
              <label className="table-search" htmlFor="saas-dealer-sub-search">
                <span>Search:</span>
                <input
                  id="saas-dealer-sub-search"
                  type="text"
                  value={dealerSubSearchTerm}
                  onChange={(event) => setDealerSubSearchTerm(event.target.value)}
                  placeholder="Search dealers"
                />
              </label>
            </div>
            <div className="table-responsive">
              <table className="table table-dark table-striped table-hover align-middle mt-2">
                <thead>
                  <tr>
                    <th>Dealer</th>
                    <th>Email</th>
                    <th>Referral Code</th>
                    <th>Referred By</th>
                    <th>Status</th>
                    <th>Start</th>
                    <th>End</th>
                    <th>Amount</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {pagedDealerAccounts.length ? (
                    pagedDealerAccounts.map((dealer) => (
                      <tr key={dealer.id}>
                        <td>{dealer.username}</td>
                        <td>{dealer.email || "-"}</td>
                        <td>{dealer.referral_code || "-"}</td>
                        <td>{dealer.referred_by || "-"}</td>
                        <td>
                          <select
                            className="form-select form-select-sm"
                            value={dealer.form.subscription_status || "pending"}
                            onChange={(event) => updateDealerForm(dealer.id, "subscription_status", event.target.value)}
                          >
                            <option value="pending">Pending</option>
                            <option value="active">Active</option>
                            <option value="expired">Expired</option>
                          </select>
                        </td>
                        <td>
                          <input
                            type="date"
                            className="form-control form-control-sm"
                            value={dealer.form.subscription_start || ""}
                            onChange={(event) => updateDealerForm(dealer.id, "subscription_start", event.target.value)}
                          />
                        </td>
                        <td>
                          <input
                            type="date"
                            className="form-control form-control-sm"
                            value={dealer.form.subscription_end || ""}
                            onChange={(event) => updateDealerForm(dealer.id, "subscription_end", event.target.value)}
                          />
                        </td>
                        <td>
                          <input
                            type="number"
                            className="form-control form-control-sm"
                            value={dealer.form.subscription_amount ?? 0}
                            onChange={(event) => updateDealerForm(dealer.id, "subscription_amount", event.target.value)}
                          />
                        </td>
                        <td>
                          <button
                            className="btn btn-outline-light btn-sm"
                            type="button"
                            onClick={() => handleDealerSave(dealer)}
                          >
                            Update
                          </button>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan="9">No dealers found.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="table-footer">
              <div className="table-info">
                Showing {dealerSubStartEntry} to {dealerSubEndEntry} of {dealerSubTotalItems} entries
              </div>
              <TablePagination
                page={dealerSubPage}
                totalPages={dealerSubTotalPages}
                onPageChange={setDealerSubPage}
                showPageLinks
                showPageLabel={false}
                maxPageLinks={7}
              />
            </div>
          </div>

          {renderDealerReferralTable(dealerRowsByStatus.pending, "Pending Payments", "pending")}
          {renderDealerReferralTable(dealerRowsByStatus.paid, "Completed Payments", "paid")}
          {renderDealerReferralTable(dealerRowsByStatus.rejected, "Rejected Payments", "rejected")}
        </>
      )}
    </>
  );
}
