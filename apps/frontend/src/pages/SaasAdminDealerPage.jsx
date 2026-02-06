import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
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

export default function SaasAdminDealerPage() {
  const { dealerId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const [state, setState] = useState(emptyState);
  const [notice, setNotice] = useState("");
  const [activeTab, setActiveTab] = useState("org");
  const [searchTerm, setSearchTerm] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [dealerForm, setDealerForm] = useState({
    name: "",
    email: "",
    phone_number: "",
    address_line1: "",
    address_line2: "",
    city: "",
    state: "",
    postal_code: "",
    bank_name: "",
    bank_account_number: "",
    bank_ifsc: "",
    upi_id: "",
    subscription_status: "pending"
  });
  const PAGE_SIZE = 8;

  useEffect(() => {
    let active = true;
    async function loadDealer() {
      setNotice("");
      try {
        const data = await apiFetch(`/api/saas-admin/dealers/${dealerId}`);
        if (!active) {
          return;
        }
        setState({ loading: false, error: "", data });
        const dealer = data.dealer || {};
        setDealerForm({
          name: dealer.name || "",
          email: dealer.email || "",
          phone_number: dealer.phone_number || "",
          address_line1: dealer.address_line1 || "",
          address_line2: dealer.address_line2 || "",
          city: dealer.city || "",
          state: dealer.state || "",
          postal_code: dealer.postal_code || "",
          bank_name: dealer.bank_name || "",
          bank_account_number: dealer.bank_account_number || "",
          bank_ifsc: dealer.bank_ifsc || "",
          upi_id: dealer.upi_id || "",
          subscription_status: dealer.subscription_status || "pending"
        });
      } catch (error) {
        if (active) {
          setState({
            loading: false,
            error: error?.message || "Unable to load dealer details.",
            data: null
          });
        }
      }
    }

    loadDealer();
    return () => {
      active = false;
    };
  }, [dealerId]);

  useEffect(() => {
    const handle = setTimeout(() => {
      setQuery(searchTerm.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(handle);
  }, [searchTerm]);

  useEffect(() => {
    if (location.hash === "#edit") {
      const node = document.getElementById("dealer-edit-section");
      if (node) {
        node.scrollIntoView({ behavior: "smooth" });
      }
    }
  }, [location.hash]);

  async function handleSave(event) {
    event.preventDefault();
    setNotice("");
    try {
      await apiFetch(`/api/saas-admin/dealers/${dealerId}`, {
        method: "PUT",
        body: JSON.stringify(dealerForm)
      });
      setNotice("Dealer details updated.");
    } catch (error) {
      setState((prev) => ({
        ...prev,
        error: error?.message || "Unable to update dealer."
      }));
    }
  }

  const orgRows = state.data?.org_referrals || [];
  const dealerRows = state.data?.dealer_referrals || [];
  const rows = activeTab === "dealer" ? dealerRows : orgRows;

  const filteredRows = useMemo(() => {
    if (!query) {
      return rows;
    }
    const term = query.toLowerCase();
    return rows.filter((row) =>
      [
        row.referred_org,
        row.referred_dealer,
        row.transfer_id,
        row.base_amount,
        row.commission_rate,
        row.commission_amount,
        row.flat_amount,
        row.status,
        row.payout_reference,
        row.payout_date,
        row.created_at
      ].some((value) => String(value || "").toLowerCase().includes(term))
    );
  }, [rows, query]);

  const totalPages = Math.max(Math.ceil(filteredRows.length / PAGE_SIZE), 1);
  const pagedRows = useMemo(
    () => filteredRows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [filteredRows, page]
  );
  const totalItems = filteredRows.length;
  const startEntry = totalItems ? (page - 1) * PAGE_SIZE + 1 : 0;
  const endEntry = totalItems ? Math.min(page * PAGE_SIZE, totalItems) : 0;

  if (state.loading) {
    return (
      <div className="card p-4 text-center">
        <div className="spinner" />
        <p className="mb-0">Loading dealer...</p>
      </div>
    );
  }

  const dealer = state.data?.dealer || {};

  return (
    <>
      <div className="d-flex align-items-center justify-content-between flex-wrap gap-2">
        <h3 className="page-title">Dealer Details</h3>
        <button
          type="button"
          className="btn btn-outline-light btn-sm"
          onClick={() => navigate("/saas-admin/organizations")}
        >
          Back
        </button>
      </div>

      {notice ? <div className="alert alert-success mt-2">{notice}</div> : null}
      {state.error ? <div className="alert alert-danger mt-2">{state.error}</div> : null}

      <div className="card p-3 mt-3">
        <div className="row g-3">
          <div className="col-12 col-lg-6">
            <h5>Profile</h5>
            <div className="mb-2">
              <strong>Referral Code:</strong> {formatValue(dealer.referral_code)}
            </div>
            <div className="mb-2">
              <strong>Referred By:</strong> {formatValue(dealer.referred_by)}
            </div>
            <div className="mb-2">
              <strong>Subscription Status:</strong> {titleCase(dealer.subscription_status)}
            </div>
            <div className="mb-2">
              <strong>Start Date:</strong> {formatValue(dealer.subscription_start)}
            </div>
            <div className="mb-2">
              <strong>End Date:</strong> {formatValue(dealer.subscription_end)}
            </div>
          </div>
          <div className="col-12 col-lg-6" id="dealer-edit-section">
            <h5>Edit Dealer</h5>
            <form onSubmit={handleSave}>
              <div className="mb-2">
                <label className="form-label">Name</label>
                <input
                  type="text"
                  className="form-control"
                  value={dealerForm.name}
                  onChange={(event) => setDealerForm((prev) => ({ ...prev, name: event.target.value }))}
                  required
                />
              </div>
              <div className="mb-2">
                <label className="form-label">Email</label>
                <input
                  type="email"
                  className="form-control"
                  value={dealerForm.email}
                  onChange={(event) => setDealerForm((prev) => ({ ...prev, email: event.target.value }))}
                  required
                />
              </div>
              <div className="mb-2">
                <label className="form-label">Phone</label>
                <input
                  type="text"
                  className="form-control"
                  value={dealerForm.phone_number}
                  onChange={(event) => setDealerForm((prev) => ({ ...prev, phone_number: event.target.value }))}
                />
              </div>
              <div className="mb-2">
                <label className="form-label">Status</label>
                <select
                  className="form-select"
                  value={dealerForm.subscription_status}
                  onChange={(event) => setDealerForm((prev) => ({ ...prev, subscription_status: event.target.value }))}
                >
                  <option value="pending">Pending</option>
                  <option value="active">Active</option>
                  <option value="expired">Expired</option>
                </select>
              </div>
              <button className="btn btn-primary btn-sm">Save</button>
            </form>
          </div>
        </div>
      </div>

      <div className="card p-3 mt-3">
        <div className="row g-3">
          <div className="col-12 col-lg-6">
            <h5>Bank Details</h5>
            <form onSubmit={handleSave}>
              <div className="row g-2">
                <div className="col-12 col-md-6">
                  <label className="form-label">Bank Name</label>
                  <input
                    type="text"
                    className="form-control"
                    value={dealerForm.bank_name}
                    onChange={(event) => setDealerForm((prev) => ({ ...prev, bank_name: event.target.value }))}
                  />
                </div>
                <div className="col-12 col-md-6">
                  <label className="form-label">Account Number</label>
                  <input
                    type="text"
                    className="form-control"
                    value={dealerForm.bank_account_number}
                    onChange={(event) => setDealerForm((prev) => ({ ...prev, bank_account_number: event.target.value }))}
                  />
                </div>
                <div className="col-12 col-md-6">
                  <label className="form-label">IFSC</label>
                  <input
                    type="text"
                    className="form-control"
                    value={dealerForm.bank_ifsc}
                    onChange={(event) => setDealerForm((prev) => ({ ...prev, bank_ifsc: event.target.value }))}
                  />
                </div>
                <div className="col-12 col-md-6">
                  <label className="form-label">UPI ID</label>
                  <input
                    type="text"
                    className="form-control"
                    value={dealerForm.upi_id}
                    onChange={(event) => setDealerForm((prev) => ({ ...prev, upi_id: event.target.value }))}
                  />
                </div>
              </div>
              <button className="btn btn-primary btn-sm mt-3">Save Bank Details</button>
            </form>
          </div>
          <div className="col-12 col-lg-6">
            <h5>Address</h5>
            <form onSubmit={handleSave}>
              <div className="row g-2">
                <div className="col-12">
                  <label className="form-label">Address Line 1</label>
                  <input
                    type="text"
                    className="form-control"
                    value={dealerForm.address_line1}
                    onChange={(event) => setDealerForm((prev) => ({ ...prev, address_line1: event.target.value }))}
                  />
                </div>
                <div className="col-12">
                  <label className="form-label">Address Line 2</label>
                  <input
                    type="text"
                    className="form-control"
                    value={dealerForm.address_line2}
                    onChange={(event) => setDealerForm((prev) => ({ ...prev, address_line2: event.target.value }))}
                  />
                </div>
                <div className="col-12 col-md-6">
                  <label className="form-label">City</label>
                  <input
                    type="text"
                    className="form-control"
                    value={dealerForm.city}
                    onChange={(event) => setDealerForm((prev) => ({ ...prev, city: event.target.value }))}
                  />
                </div>
                <div className="col-12 col-md-6">
                  <label className="form-label">State</label>
                  <input
                    type="text"
                    className="form-control"
                    value={dealerForm.state}
                    onChange={(event) => setDealerForm((prev) => ({ ...prev, state: event.target.value }))}
                  />
                </div>
                <div className="col-12 col-md-6">
                  <label className="form-label">Pincode</label>
                  <input
                    type="text"
                    className="form-control"
                    value={dealerForm.postal_code}
                    onChange={(event) => setDealerForm((prev) => ({ ...prev, postal_code: event.target.value }))}
                  />
                </div>
              </div>
              <button className="btn btn-primary btn-sm mt-3">Save Address</button>
            </form>
          </div>
        </div>
      </div>

      <div className="card p-3 mt-3">
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
            Dealer Referrals
          </button>
        </div>
        <div className="table-controls">
          <div className="table-length">Show {PAGE_SIZE} entries</div>
          <label className="table-search" htmlFor="dealer-referral-search">
            <span>Search:</span>
            <input
              id="dealer-referral-search"
              type="text"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Search referrals"
            />
          </label>
        </div>
        <div className="table-responsive mt-2">
          <table className="table table-dark table-striped table-hover align-middle">
            <thead>
              {activeTab === "org" ? (
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
              ) : (
                <tr>
                  <th>Dealer</th>
                  <th>Flat Amount</th>
                  <th>Status</th>
                  <th>Payout Ref</th>
                  <th>Payout Date</th>
                </tr>
              )}
            </thead>
            <tbody>
              {pagedRows.length ? (
                pagedRows.map((row) => (
                  <tr key={row.id}>
                    {activeTab === "org" ? (
                      <>
                        <td>{row.referred_org || "-"}</td>
                        <td>{row.transfer_id || "-"}</td>
                        <td>{row.base_amount ?? "-"}</td>
                        <td>{row.commission_rate ?? 0}%</td>
                        <td>{row.commission_amount ?? "-"}</td>
                        <td>{titleCase(row.status)}</td>
                        <td>{row.payout_reference || "-"}</td>
                        <td>{row.payout_date || "-"}</td>
                      </>
                    ) : (
                      <>
                        <td>{row.referred_dealer || "-"}</td>
                        <td>{row.flat_amount ?? "-"}</td>
                        <td>{titleCase(row.status)}</td>
                        <td>{row.payout_reference || "-"}</td>
                        <td>{row.payout_date || "-"}</td>
                      </>
                    )}
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={activeTab === "org" ? 8 : 5}>No referrals found.</td>
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
      </div>
    </>
  );
}
