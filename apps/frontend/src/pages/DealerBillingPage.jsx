import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "../lib/api.js";
import TablePagination from "../components/TablePagination.jsx";

const emptyState = {
  loading: true,
  error: "",
  data: null
};

export default function DealerBillingPage() {
  const [state, setState] = useState(emptyState);
  const [searchTerm, setSearchTerm] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 20;

  useEffect(() => {
    let active = true;
    async function loadBilling() {
      try {
        const data = await apiFetch("/api/dashboard/dealer/billing");
        if (!active) {
          return;
        }
        setState({ loading: false, error: "", data });
      } catch (error) {
        if (active) {
          setState({
            loading: false,
            error: error?.message || "Unable to load billing history.",
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
    const handle = setTimeout(() => {
      setSearchQuery(searchTerm.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(handle);
  }, [searchTerm]);

  const transfers = state.data?.transfers || [];
  const filteredTransfers = useMemo(() => {
    if (!searchQuery) {
      return transfers;
    }
    const term = searchQuery.toLowerCase();
    return transfers.filter((row) =>
      [
        row.amount,
        row.currency,
        row.status_label,
        row.status,
        row.created_at,
        row.updated_at
      ].some((value) => String(value || "").toLowerCase().includes(term))
    );
  }, [transfers, searchQuery]);
  const totalPages = Math.max(Math.ceil(filteredTransfers.length / PAGE_SIZE), 1);
  const pagedTransfers = useMemo(
    () => filteredTransfers.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [filteredTransfers, page]
  );

  if (state.loading) {
    return (
      <div className="card p-4 text-center">
        <div className="spinner" />
        <p className="mb-0">Loading billing...</p>
      </div>
    );
  }

  return (
    <>
      <h2 className="page-title">Billing</h2>
      <hr className="section-divider" />

      {state.error ? <div className="alert alert-danger">{state.error}</div> : null}

      <div className="card p-3">
        <h5>Subscription Billing History</h5>
        <div className="table-controls mt-2">
          <div className="table-length">Show {PAGE_SIZE} entries</div>
          <label className="table-search" htmlFor="dealer-billing-search">
            <span>Search:</span>
            <input
              id="dealer-billing-search"
              type="text"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Search billing"
            />
          </label>
        </div>
        <div className="table-responsive">
          <table className="table table-dark table-striped table-hover align-middle mt-2">
            <thead>
              <tr>
                <th>Amount</th>
                <th>Status</th>
                <th>Created</th>
                <th>Updated</th>
              </tr>
            </thead>
            <tbody>
              {pagedTransfers.length ? (
                pagedTransfers.map((row) => (
                  <tr key={row.id}>
                    <td>
                      {row.currency} {row.amount}
                    </td>
                    <td>{row.status_label || row.status}</td>
                    <td>{row.created_at || "-"}</td>
                    <td>{row.updated_at || "-"}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="4">No billing history yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="table-footer">
          <div className="table-info">
            Showing {pagedTransfers.length ? (page - 1) * PAGE_SIZE + 1 : 0} to{" "}
            {Math.min(page * PAGE_SIZE, filteredTransfers.length)} of {filteredTransfers.length} entries
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
