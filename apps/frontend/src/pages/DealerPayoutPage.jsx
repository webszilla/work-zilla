import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "../lib/api.js";
import TablePagination from "../components/TablePagination.jsx";

const emptyState = {
  loading: true,
  error: "",
  data: null
};

const PAGE_SIZE = 8;

function normalizeRows(data) {
  const orgRows = (data?.org_referrals || []).map((row) => ({
    id: `org-${row.id}`,
    type: "ORG",
    referred: row.referred_org || "-",
    base_amount: row.base_amount ?? "-",
    commission_rate: row.commission_rate ?? 0,
    commission_amount: row.commission_amount ?? "-",
    flat_amount: "-",
    payout_reference: row.payout_reference || "-",
    payout_date: row.payout_date || "-",
    status: String(row.status || "pending").toLowerCase()
  }));
  const dealerRows = (data?.dealer_referrals || []).map((row) => ({
    id: `dealer-${row.id}`,
    type: "Agent",
    referred: row.referred_dealer || "-",
    base_amount: row.base_amount ?? "-",
    commission_rate: row.commission_rate ?? 0,
    commission_amount: row.commission_amount ?? "-",
    flat_amount: row.flat_amount ?? "-",
    payout_reference: row.payout_reference || "-",
    payout_date: row.payout_date || "-",
    status: String(row.status || "pending").toLowerCase()
  }));
  return [...orgRows, ...dealerRows];
}

function filterRows(rows, term) {
  if (!term) {
    return rows;
  }
  const needle = term.toLowerCase();
  return rows.filter((row) =>
    [
      row.type,
      row.referred,
      row.base_amount,
      row.commission_rate,
      row.commission_amount,
      row.flat_amount,
      row.payout_reference,
      row.payout_date,
      row.status
    ].some((value) => String(value || "").toLowerCase().includes(needle))
  );
}

function getPagedRows(rows, term, page) {
  const filtered = filterRows(rows, term);
  const totalPages = Math.max(Math.ceil(filtered.length / PAGE_SIZE), 1);
  const currentPage = Math.min(page, totalPages);
  const startIndex = (currentPage - 1) * PAGE_SIZE;
  const paged = filtered.slice(startIndex, startIndex + PAGE_SIZE);
  return { filtered, paged, totalPages, currentPage, startIndex };
}

function PayoutTable({ title, rows, tableState, onStateChange, idKey }) {
  const { filtered, paged, totalPages, currentPage, startIndex } = getPagedRows(
    rows,
    tableState.term,
    tableState.page
  );
  const searchId = `payout-${idKey}-search`;
  return (
    <div className="card p-3 mt-3">
      <div className="d-flex align-items-center justify-content-between flex-wrap gap-2">
        <h5 className="mb-0">{title}</h5>
        <label className="table-search" htmlFor={searchId}>
          <span>Search:</span>
          <input
            id={searchId}
            type="text"
            value={tableState.term}
            onChange={(event) => onStateChange({ term: event.target.value, page: 1 })}
            placeholder="Search payouts"
          />
        </label>
      </div>
      <div className="table-responsive mt-2">
        <table className="table table-dark table-striped table-hover align-middle">
          <thead>
            <tr>
              <th>Type</th>
              <th>Referred</th>
              <th>Base Amount</th>
              <th>Rate</th>
              <th>Commission</th>
              <th>Flat</th>
              <th>Payout Ref</th>
              <th>Payout Date</th>
            </tr>
          </thead>
          <tbody>
            {paged.length ? (
              paged.map((row) => (
                <tr key={row.id}>
                  <td>{row.type}</td>
                  <td>{row.referred}</td>
                  <td>{row.base_amount}</td>
                  <td>{row.commission_rate}%</td>
                  <td>{row.commission_amount}</td>
                  <td>{row.flat_amount}</td>
                  <td>{row.payout_reference}</td>
                  <td>{row.payout_date}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan="8">No payouts found.</td>
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
          onPageChange={(nextPage) => onStateChange({ page: nextPage })}
          showPageLinks
          showPageLabel={false}
          maxPageLinks={7}
        />
      </div>
    </div>
  );
}

export default function DealerPayoutPage() {
  const [state, setState] = useState(emptyState);
  const [tableState, setTableState] = useState({
    pending: { term: "", page: 1 },
    paid: { term: "", page: 1 },
    rejected: { term: "", page: 1 }
  });

  useEffect(() => {
    let active = true;
    async function loadPayouts() {
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
            error: error?.message || "Unable to load payouts.",
            data: null
          });
        }
      }
    }

    loadPayouts();
    return () => {
      active = false;
    };
  }, []);

  const rows = useMemo(() => normalizeRows(state.data), [state.data]);
  const pendingRows = rows.filter((row) => row.status === "pending");
  const paidRows = rows.filter((row) => row.status === "paid");
  const rejectedRows = rows.filter((row) => row.status === "rejected");

  if (state.loading) {
    return (
      <div className="card p-4 text-center">
        <div className="spinner" />
        <p className="mb-0">Loading payouts...</p>
      </div>
    );
  }

  return (
    <>
      <h2 className="page-title">Payouts</h2>
      <hr className="section-divider" />

      {state.error ? <div className="alert alert-danger">{state.error}</div> : null}

      <PayoutTable
        title="Pending Payout Payments"
        rows={pendingRows}
        tableState={tableState.pending}
        idKey="pending"
        onStateChange={(patch) =>
          setTableState((prev) => ({ ...prev, pending: { ...prev.pending, ...patch } }))
        }
      />
      <PayoutTable
        title="Paid Payments"
        rows={paidRows}
        tableState={tableState.paid}
        idKey="paid"
        onStateChange={(patch) =>
          setTableState((prev) => ({ ...prev, paid: { ...prev.paid, ...patch } }))
        }
      />
      <PayoutTable
        title="Payment Rejections"
        rows={rejectedRows}
        tableState={tableState.rejected}
        idKey="rejected"
        onStateChange={(patch) =>
          setTableState((prev) => ({ ...prev, rejected: { ...prev.rejected, ...patch } }))
        }
      />
    </>
  );
}
