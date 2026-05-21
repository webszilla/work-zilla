import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { apiFetch } from "../lib/api.js";
import TablePagination from "../components/TablePagination.jsx";
import { formatDateLikeValue } from "../lib/datetime.js";
import { useConfirm } from "../components/ConfirmDialog.jsx";

const emptyState = {
  loading: true,
  error: "",
  data: null,
};

function formatValue(value) {
  if (value === null || value === undefined || value === "") {
    return "-";
  }
  return formatDateLikeValue(value, "-");
}

function normalizeStatus(value) {
  return String(value || "").trim().toLowerCase();
}

function buildPagedRows(rows, searchQuery, page, pageSize) {
  const term = String(searchQuery || "").trim().toLowerCase();
  const filtered = term
    ? (rows || []).filter((row) =>
        [
          row.organization,
          row.owner_name,
          row.owner_email,
          row.product,
          row.request_type,
          row.billing_cycle,
          row.plan,
          row.amount,
          row.currency,
          row.status,
          row.paid_on,
          row.reference_no,
          row.created_at,
          row.updated_at,
        ].some((value) => String(value || "").toLowerCase().includes(term))
      )
    : rows || [];

  const totalPages = Math.max(Math.ceil(filtered.length / pageSize), 1);
  const currentPage = Math.min(Math.max(1, page), totalPages);
  const startIndex = (currentPage - 1) * pageSize;
  const paged = filtered.slice(startIndex, startIndex + pageSize);
  return { filtered, paged, totalPages, currentPage, startIndex };
}

function TransfersTable({
  title,
  badgeLabel,
  rows,
  showStatus = true,
  showUpdated = true,
  allowActions = false,
  onAction = null,
  onViewReceipt = null,
  searchId,
  searchTerm,
  onSearchTerm,
  page,
  onPage,
  pageSize,
}) {
  const pagedState = useMemo(
    () => buildPagedRows(rows, searchTerm, page, pageSize),
    [rows, searchTerm, page, pageSize]
  );

  useEffect(() => {
    if (page !== pagedState.currentPage) {
      onPage(pagedState.currentPage);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pagedState.currentPage]);

  return (
    <div className="d-flex flex-column gap-2">
      <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-2">
        <div className="d-flex align-items-center gap-2">
          <h5 className="mb-0">{title}</h5>
          <span className="badge bg-secondary">{badgeLabel}</span>
        </div>
        <label className="table-search" htmlFor={searchId}>
          <span>Search:</span>
          <input id={searchId} type="text" value={searchTerm} onChange={(e) => onSearchTerm(e.target.value)} />
        </label>
      </div>

      <div className="table-responsive">
        <table className="table table-dark table-hover align-middle mb-0">
          <thead>
            <tr>
              <th>Organization</th>
              <th>Product</th>
              <th>Plan</th>
              {showStatus ? <th>Status</th> : null}
              <th>Amount</th>
              <th>Paid On</th>
              <th>Reference</th>
              <th>Created</th>
              {showUpdated ? <th>Updated</th> : null}
              <th className="table-actions">Action</th>
            </tr>
          </thead>
          <tbody>
            {pagedState.paged.length ? (
              pagedState.paged.map((row) => (
                <tr key={`transfer-${row.id}`}>
                  <td>
                    <div className="fw-semibold">{row.organization || "-"}</div>
                    <div className="text-secondary small">{row.owner_email || "-"}</div>
                  </td>
                  <td>{row.product || "-"}</td>
                  <td>{row.plan || "-"}</td>
                  {showStatus ? <td className="text-capitalize">{row.status || "-"}</td> : null}
                  <td>
                    {String(row.currency || "INR").toUpperCase()} {Number(row.amount || 0).toFixed(2)}
                  </td>
                  <td>{formatValue(row.paid_on)}</td>
                  <td style={{ maxWidth: 220, whiteSpace: "normal" }}>{row.reference_no || "-"}</td>
                  <td>{formatValue(row.created_at)}</td>
                  {showUpdated ? <td>{formatValue(row.updated_at)}</td> : null}
                  <td className="table-actions">
                    <div className="d-inline-flex gap-2">
                      {row.receipt_url ? (
                        <button
                          type="button"
                          className="btn btn-sm btn-outline-light saas-org-icon-btn wz-table-action-btn d-inline-flex align-items-center justify-content-center"
                          title="View Receipt"
                          data-wz-tooltip="View Receipt"
                          aria-label="View Receipt"
                          onClick={() => onViewReceipt?.(row)}
                        >
                          <i className="bi bi-image" aria-hidden="true" />
                        </button>
                      ) : null}
                      {allowActions ? (
                        <>
                          <button
                            type="button"
                            className="btn btn-sm btn-outline-success saas-org-icon-btn wz-table-action-btn d-inline-flex align-items-center justify-content-center"
                            title="Approve"
                            data-wz-tooltip="Approve"
                            aria-label="Approve"
                            onClick={() => onAction?.("approve", row)}
                          >
                            <i className="bi bi-check2-circle" aria-hidden="true" />
                          </button>
                          <button
                            type="button"
                            className="btn btn-sm btn-outline-danger saas-org-icon-btn wz-table-action-btn d-inline-flex align-items-center justify-content-center"
                            data-no-delete-confirm="true"
                            title="Reject"
                            data-wz-tooltip="Reject"
                            aria-label="Reject"
                            onClick={() => onAction?.("reject", row)}
                          >
                            <i className="bi bi-x-circle" aria-hidden="true" />
                          </button>
                        </>
                      ) : null}
                      {row.invoice_url ? (
                        <a
                          className="btn btn-sm btn-outline-success saas-org-icon-btn wz-table-action-btn d-inline-flex align-items-center justify-content-center"
                          href={row.invoice_url}
                          target="_blank"
                          rel="noreferrer"
                          title="View Invoice"
                          data-wz-tooltip="View Invoice"
                          aria-label="View Invoice"
                        >
                          <i className="bi bi-file-earmark-pdf" aria-hidden="true" />
                        </a>
                      ) : null}
                      <Link
                        className="btn btn-sm btn-outline-info saas-org-icon-btn wz-table-action-btn d-inline-flex align-items-center justify-content-center"
                        to={`/saas-admin/billing?status=${encodeURIComponent(String(row.status || ""))}&product=${encodeURIComponent(String(row.product_slug || ""))}#billing-activity`}
                        title="Open In Billing"
                        data-wz-tooltip="Open In Billing"
                        aria-label="Open In Billing"
                      >
                        <i className="bi bi-box-arrow-up-right" aria-hidden="true" />
                      </Link>
                    </div>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={6 + (showStatus ? 1 : 0) + (showUpdated ? 1 : 0) + 1}>No transfers found.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="d-flex justify-content-end mt-2">
        <TablePagination
          page={pagedState.currentPage}
          totalPages={pagedState.totalPages}
          onPageChange={(nextPage) => onPage(nextPage)}
          showPageLinks
        />
      </div>
    </div>
  );
}

export default function SaasAdminTransfersPage() {
  const confirm = useConfirm();
  const [state, setState] = useState(emptyState);
  const [pendingSearch, setPendingSearch] = useState("");
  const [approvedSearch, setApprovedSearch] = useState("");
  const [pendingPage, setPendingPage] = useState(1);
  const [approvedPage, setApprovedPage] = useState(1);
  const [actionState, setActionState] = useState({ busyId: "", error: "" });
  const [receiptModal, setReceiptModal] = useState({ open: false, row: null });
  const PAGE_SIZE = 10;

  useEffect(() => {
    let active = true;
    async function loadTransfers() {
      try {
        const data = await apiFetch("/api/saas-admin/billing-history");
        if (!active) return;
        setState({ loading: false, error: "", data });
      } catch (error) {
        if (!active) return;
        setState({ loading: false, error: error?.message || "Unable to load transfers.", data: null });
      }
    }
    loadTransfers();
    return () => {
      active = false;
    };
  }, []);

  async function reloadTransfers() {
    const data = await apiFetch("/api/saas-admin/billing-history");
    setState({ loading: false, error: "", data });
  }

  async function handlePendingAction(action, row) {
    const transferId = row?.id;
    if (!transferId) return;
    if (actionState.busyId) return;
    const label = action === "approve" ? "Approve" : action === "reject" ? "Reject" : "Update";
    const confirmed = await confirm({
      title: `${label} Transfer`,
      message: `${label} this transfer?`,
      confirmText: label,
      cancelText: "Cancel",
      confirmVariant: action === "reject" ? "danger" : "primary",
    });
    if (!confirmed) return;
    setActionState({ busyId: String(transferId), error: "" });
    try {
      await apiFetch(`/api/saas-admin/transfers/${encodeURIComponent(String(transferId))}/${encodeURIComponent(String(action))}`, {
        method: "POST",
      });
      await reloadTransfers();
    } catch (error) {
      setActionState({ busyId: "", error: error?.message || "Unable to update transfer." });
      return;
    }
    setActionState({ busyId: "", error: "" });
  }

  function openReceiptModal(row) {
    if (!row?.receipt_url) return;
    setReceiptModal({ open: true, row });
  }

  function closeReceiptModal() {
    setReceiptModal({ open: false, row: null });
  }

  async function handleReceiptDelete() {
    const row = receiptModal.row;
    const transferId = row?.id;
    if (!transferId) {
      closeReceiptModal();
      return;
    }
    if (actionState.busyId) return;
    const confirmed = await confirm({
      title: "Delete Receipt",
      message: "Delete this receipt image?",
      confirmText: "Delete",
      cancelText: "Cancel",
      confirmVariant: "danger",
    });
    if (!confirmed) return;
    setActionState({ busyId: String(transferId), error: "" });
    try {
      await apiFetch(`/api/saas-admin/transfers/${encodeURIComponent(String(transferId))}/receipt-clear`, {
        method: "POST",
      });
      // Close immediately so the user doesn't see a broken image while data refreshes.
      closeReceiptModal();
      try {
        await reloadTransfers();
      } catch (error) {
        setActionState({ busyId: "", error: error?.message || "Receipt deleted, but failed to refresh transfers." });
        return;
      }
    } catch (error) {
      setActionState({ busyId: "", error: error?.message || "Unable to delete receipt." });
      return;
    }
    setActionState({ busyId: "", error: "" });
  }

  const transfers = state.data?.transfers || [];
  const pendingTransfers = useMemo(
    () => transfers.filter((row) => normalizeStatus(row.status) === "pending"),
    [transfers]
  );
  const approvedTransfers = useMemo(
    () => transfers.filter((row) => normalizeStatus(row.status) === "approved"),
    [transfers]
  );

  useEffect(() => {
    const handle = setTimeout(() => setPendingPage(1), 250);
    return () => clearTimeout(handle);
  }, [pendingSearch]);

  useEffect(() => {
    const handle = setTimeout(() => setApprovedPage(1), 250);
    return () => clearTimeout(handle);
  }, [approvedSearch]);

  if (state.loading) {
    return (
      <div className="card p-4 text-center">
        <div className="spinner" />
        <p className="mb-0">Loading transfers...</p>
      </div>
    );
  }

  if (state.error) {
    return <div className="alert alert-danger">{state.error}</div>;
  }

  return (
    <div className="d-flex flex-column gap-3">
      <div className="d-flex flex-wrap align-items-center justify-content-between gap-2">
        <h3 className="page-title mb-0">Transfers</h3>
        <Link className="btn btn-sm btn-outline-light" to="/saas-admin/billing#billing-activity">
          Open Billing History
        </Link>
      </div>

      {actionState.error ? <div className="alert alert-danger py-2 mb-0">{actionState.error}</div> : null}

      <TransfersTable
        title="Pending Transfers"
        badgeLabel={`${pendingTransfers.length} items`}
        rows={pendingTransfers}
        showStatus={false}
        showUpdated={false}
        allowActions
        onAction={handlePendingAction}
        onViewReceipt={openReceiptModal}
        searchId="saas-admin-pending-transfer-search"
        searchTerm={pendingSearch}
        onSearchTerm={setPendingSearch}
        page={pendingPage}
        onPage={setPendingPage}
        pageSize={PAGE_SIZE}
      />

      <TransfersTable
        title="Approved Transfers"
        badgeLabel={`${approvedTransfers.length} items`}
        rows={approvedTransfers}
        showUpdated={false}
        onViewReceipt={openReceiptModal}
        searchId="saas-admin-approved-transfer-search"
        searchTerm={approvedSearch}
        onSearchTerm={setApprovedSearch}
        page={approvedPage}
        onPage={setApprovedPage}
        pageSize={PAGE_SIZE}
      />

      {receiptModal.open && receiptModal.row ? (
        <div className="modal-overlay" data-no-delete-confirm="true" onClick={closeReceiptModal}>
          <div className="modal-panel" data-no-delete-confirm="true" onClick={(event) => event.stopPropagation()}>
            <div className="d-flex align-items-center justify-content-between gap-2">
              <h5 className="mb-0">Receipt</h5>
              <button
                type="button"
                className="btn btn-sm btn-outline-light saas-org-icon-btn wz-table-action-btn d-inline-flex align-items-center justify-content-center"
                title="Close"
                data-wz-tooltip="Close"
                aria-label="Close"
                onClick={closeReceiptModal}
              >
                <i className="bi bi-x-lg" aria-hidden="true" />
              </button>
            </div>
            <div className="text-secondary small mt-2" style={{ whiteSpace: "normal" }}>
              {receiptModal.row.organization || "-"} • {receiptModal.row.product || "-"} • {receiptModal.row.plan || "-"}
            </div>
            <div className="mt-3">
              <img
                src={receiptModal.row.receipt_url}
                alt="Payment receipt"
                style={{ width: "100%", maxHeight: "70vh", objectFit: "contain", borderRadius: 12, border: "1px solid rgba(255,255,255,0.12)" }}
              />
            </div>
            <div className="d-flex justify-content-end gap-2 mt-3">
              <a className="btn btn-outline-light btn-sm" href={receiptModal.row.receipt_url} target="_blank" rel="noreferrer">
                Open in new tab
              </a>
              <button type="button" className="btn btn-outline-danger btn-sm" data-no-delete-confirm="true" onClick={handleReceiptDelete}>
                Delete Receipt
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
