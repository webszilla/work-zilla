import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "../lib/api.js";
import TablePagination from "../components/TablePagination.jsx";

const emptyState = {
  loading: true,
  error: "",
  data: null
};

export default function DealerReferralsPage() {
  const [state, setState] = useState(emptyState);
  const [activeTab, setActiveTab] = useState("org");
  const [orgSearchTerm, setOrgSearchTerm] = useState("");
  const [orgSearchQuery, setOrgSearchQuery] = useState("");
  const [orgPage, setOrgPage] = useState(1);
  const [dealerSearchTerm, setDealerSearchTerm] = useState("");
  const [dealerSearchQuery, setDealerSearchQuery] = useState("");
  const [dealerPage, setDealerPage] = useState(1);
  const PAGE_SIZE = 20;

  useEffect(() => {
    let active = true;
    async function loadReferrals() {
      try {
        const data = await apiFetch("/api/dashboard/dealer/referrals");
        if (!active) {
          return;
        }
        setState({ loading: false, error: "", data });
      } catch (error) {
        if (active) {
          setState({
            loading: false,
            error: error?.message || "Unable to load referrals.",
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
      setOrgSearchQuery(orgSearchTerm.trim());
      setOrgPage(1);
    }, 300);
    return () => clearTimeout(handle);
  }, [orgSearchTerm]);

  useEffect(() => {
    const handle = setTimeout(() => {
      setDealerSearchQuery(dealerSearchTerm.trim());
      setDealerPage(1);
    }, 300);
    return () => clearTimeout(handle);
  }, [dealerSearchTerm]);

  const orgReferrals = state.data?.org_referrals || [];
  const dealerReferrals = state.data?.dealer_referrals || [];
  const filteredOrgReferrals = useMemo(() => {
    if (!orgSearchQuery) {
      return orgReferrals;
    }
    const term = orgSearchQuery.toLowerCase();
    return orgReferrals.filter((row) =>
      [
        row.referred_org,
        row.transfer_id,
        row.base_amount,
        row.commission_rate,
        row.commission_amount,
        row.status,
        row.payout_reference,
        row.payout_date
      ].some((value) => String(value || "").toLowerCase().includes(term))
    );
  }, [orgReferrals, orgSearchQuery]);
  const orgTotalPages = Math.max(Math.ceil(filteredOrgReferrals.length / PAGE_SIZE), 1);
  const pagedOrgReferrals = useMemo(
    () => filteredOrgReferrals.slice((orgPage - 1) * PAGE_SIZE, orgPage * PAGE_SIZE),
    [filteredOrgReferrals, orgPage]
  );
  const filteredDealerReferrals = useMemo(() => {
    if (!dealerSearchQuery) {
      return dealerReferrals;
    }
    const term = dealerSearchQuery.toLowerCase();
    return dealerReferrals.filter((row) =>
      [
        row.referred_dealer,
        row.flat_amount,
        row.status,
        row.payout_reference,
        row.payout_date
      ].some((value) => String(value || "").toLowerCase().includes(term))
    );
  }, [dealerReferrals, dealerSearchQuery]);
  const dealerTotalPages = Math.max(Math.ceil(filteredDealerReferrals.length / PAGE_SIZE), 1);
  const pagedDealerReferrals = useMemo(
    () => filteredDealerReferrals.slice((dealerPage - 1) * PAGE_SIZE, dealerPage * PAGE_SIZE),
    [filteredDealerReferrals, dealerPage]
  );

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
      <h2 className="page-title">Referrals</h2>
      <hr className="section-divider" />

      {state.error ? <div className="alert alert-danger">{state.error}</div> : null}

      <div className="d-flex gap-2 flex-wrap mb-3">
        <button
          type="button"
          className={`btn btn-sm ${activeTab === "org" ? "btn-primary" : "btn-outline-light"}`}
          onClick={() => setActiveTab("org")}
        >
          ORG Referrals
        </button>
        <button
          type="button"
          className={`btn btn-sm ${activeTab === "dealer" ? "btn-primary" : "btn-outline-light"}`}
          onClick={() => setActiveTab("dealer")}
        >
          Agent Referrals
        </button>
      </div>

      {activeTab === "org" ? (
        <div className="card p-3">
          <h5>Organization Referrals</h5>
          <div className="table-controls mt-2">
            <div className="table-length">Show {PAGE_SIZE} entries</div>
            <label className="table-search" htmlFor="dealer-org-referrals-search">
              <span>Search:</span>
              <input
                id="dealer-org-referrals-search"
                type="text"
                value={orgSearchTerm}
                onChange={(event) => setOrgSearchTerm(event.target.value)}
                placeholder="Search referrals"
              />
            </label>
          </div>
          <div className="table-responsive">
            <table className="table table-dark table-striped table-hover align-middle mt-2">
              <thead>
                <tr>
                  <th>Organization</th>
                  <th>Transfer</th>
                  <th>Base Amount</th>
                  <th>Rate</th>
                  <th>Commission</th>
                  <th>Status</th>
                  <th>Payout Ref</th>
                  <th>Payout Date</th>
                </tr>
              </thead>
              <tbody>
                {pagedOrgReferrals.length ? (
                  pagedOrgReferrals.map((row) => (
                    <tr key={row.id}>
                      <td>{row.referred_org || "-"}</td>
                      <td>{row.transfer_id || "-"}</td>
                      <td>{row.base_amount ?? "-"}</td>
                      <td>{row.commission_rate ?? 0}%</td>
                      <td>{row.commission_amount ?? "-"}</td>
                      <td>{row.status || "-"}</td>
                      <td>{row.payout_reference || "-"}</td>
                      <td>{row.payout_date || "-"}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan="8">No organization referrals yet.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="table-footer">
            <div className="table-info">
              Showing {pagedOrgReferrals.length ? (orgPage - 1) * PAGE_SIZE + 1 : 0} to{" "}
              {Math.min(orgPage * PAGE_SIZE, filteredOrgReferrals.length)} of {filteredOrgReferrals.length} entries
            </div>
            <TablePagination
              page={orgPage}
              totalPages={orgTotalPages}
              onPageChange={setOrgPage}
              showPageLinks
              showPageLabel={false}
              maxPageLinks={7}
            />
          </div>
        </div>
      ) : (
        <div className="card p-3">
          <h5>Agent Referrals</h5>
          <div className="table-controls mt-2">
            <div className="table-length">Show {PAGE_SIZE} entries</div>
            <label className="table-search" htmlFor="dealer-agent-referrals-search">
              <span>Search:</span>
              <input
                id="dealer-agent-referrals-search"
                type="text"
                value={dealerSearchTerm}
                onChange={(event) => setDealerSearchTerm(event.target.value)}
                placeholder="Search referrals"
              />
            </label>
          </div>
          <div className="table-responsive">
            <table className="table table-dark table-striped table-hover align-middle mt-2">
              <thead>
                <tr>
                  <th>Agent</th>
                  <th>Flat Amount</th>
                  <th>Status</th>
                  <th>Payout Ref</th>
                  <th>Payout Date</th>
                </tr>
              </thead>
              <tbody>
                {pagedDealerReferrals.length ? (
                  pagedDealerReferrals.map((row) => (
                    <tr key={row.id}>
                      <td>{row.referred_dealer || "-"}</td>
                      <td>{row.flat_amount ?? "-"}</td>
                      <td>{row.status || "-"}</td>
                      <td>{row.payout_reference || "-"}</td>
                      <td>{row.payout_date || "-"}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan="5">No agent referrals yet.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="table-footer">
            <div className="table-info">
              Showing {pagedDealerReferrals.length ? (dealerPage - 1) * PAGE_SIZE + 1 : 0} to{" "}
              {Math.min(dealerPage * PAGE_SIZE, filteredDealerReferrals.length)} of{" "}
              {filteredDealerReferrals.length} entries
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
        </div>
      )}
    </>
  );
}
