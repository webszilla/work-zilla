import { useEffect, useMemo, useRef, useState } from "react";
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

export default function SaasAdminBillingPage() {
  const [state, setState] = useState(emptyState);
  const [billingTransferSearchTerm, setBillingTransferSearchTerm] = useState("");
  const [billingTransferSearchQuery, setBillingTransferSearchQuery] = useState("");
  const [billingTransferPage, setBillingTransferPage] = useState(1);
  const [billingSubSearchTerm, setBillingSubSearchTerm] = useState("");
  const [billingSubSearchQuery, setBillingSubSearchQuery] = useState("");
  const [billingSubPage, setBillingSubPage] = useState(1);
  const [billingViewModal, setBillingViewModal] = useState({ open: false, row: null });
  const [gstFromMonth, setGstFromMonth] = useState("");
  const [gstToMonth, setGstToMonth] = useState("");
  const fromWrapRef = useRef(null);
  const toWrapRef = useRef(null);
  const fromPickerRef = useRef(null);
  const toPickerRef = useRef(null);
  const PAGE_SIZE = 10;

  useEffect(() => {
    let active = true;
    async function loadBillingData() {
      try {
        const data = await apiFetch("/api/saas-admin/billing-history");
        if (active) {
          setState({ loading: false, error: "", data });
        }
      } catch (error) {
        if (active) {
          setState({ loading: false, error: error?.message || "Unable to load billing history.", data: null });
        }
      }
    }

    loadBillingData();
    return () => {
      active = false;
    };
  }, []);

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

  const billingData = state.data || {};
  const billingTransfers = billingData.transfers || [];
  const billingSubscriptions = billingData.subscriptions || [];
  const availableMonths = billingData.available_months || [];

  useEffect(() => {
    if (!availableMonths.length) {
      setGstFromMonth("");
      setGstToMonth("");
      return;
    }
    setGstFromMonth((prev) => prev || availableMonths[0]);
    setGstToMonth((prev) => prev || availableMonths[availableMonths.length - 1]);
  }, [availableMonths]);

  useEffect(() => {
    if (!window.flatpickr) {
      return;
    }
    const enabledDates = availableMonths.map((month) => `${month}-01`);
    const baseConfig = {
      wrap: true,
      altInput: true,
      altFormat: "M Y",
      dateFormat: "Y-m-d",
      altInputClass: "date-input flatpickr-input",
      enable: enabledDates,
      allowInput: false,
      disableMobile: true
    };

    if (fromWrapRef.current && !fromPickerRef.current) {
      fromPickerRef.current = window.flatpickr(fromWrapRef.current, {
        ...baseConfig,
        onChange: (_selected, dateStr) => {
          setGstFromMonth(dateStr ? dateStr.slice(0, 7) : "");
        }
      });
    }
    if (toWrapRef.current && !toPickerRef.current) {
      toPickerRef.current = window.flatpickr(toWrapRef.current, {
        ...baseConfig,
        onChange: (_selected, dateStr) => {
          setGstToMonth(dateStr ? dateStr.slice(0, 7) : "");
        }
      });
    }

    if (fromPickerRef.current) {
      fromPickerRef.current.set("enable", enabledDates);
      if (gstFromMonth) {
        fromPickerRef.current.setDate(`${gstFromMonth}-01`, false);
      } else {
        fromPickerRef.current.clear();
      }
    }
    if (toPickerRef.current) {
      toPickerRef.current.set("enable", enabledDates);
      if (gstToMonth) {
        toPickerRef.current.setDate(`${gstToMonth}-01`, false);
      } else {
        toPickerRef.current.clear();
      }
    }
  }, [availableMonths, gstFromMonth, gstToMonth]);

  useEffect(() => {
    return () => {
      if (fromPickerRef.current) {
        fromPickerRef.current.destroy();
      }
      if (toPickerRef.current) {
        toPickerRef.current.destroy();
      }
    };
  }, []);

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
          row.updated_at
        ].some((value) => String(value || "").toLowerCase().includes(needle))
      );
    };
    const filtered = filterFn(billingTransfers, billingTransferSearchQuery);
    const totalPages = Math.max(Math.ceil(filtered.length / PAGE_SIZE), 1);
    const currentPage = Math.min(billingTransferPage, totalPages);
    const startIndex = (currentPage - 1) * PAGE_SIZE;
    const paged = filtered.slice(startIndex, startIndex + PAGE_SIZE);
    return { filtered, paged, totalPages, currentPage, startIndex };
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
          row.product,
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
    const filtered = filterFn(billingSubscriptions, billingSubSearchQuery);
    const totalPages = Math.max(Math.ceil(filtered.length / PAGE_SIZE), 1);
    const currentPage = Math.min(billingSubPage, totalPages);
    const startIndex = (currentPage - 1) * PAGE_SIZE;
    const paged = filtered.slice(startIndex, startIndex + PAGE_SIZE);
    return { filtered, paged, totalPages, currentPage, startIndex };
  }, [billingSubscriptions, billingSubSearchQuery, billingSubPage]);

  if (state.loading) {
    return (
      <div className="card p-4 text-center">
        <div className="spinner" />
        <p className="mb-0">Loading billing history...</p>
      </div>
    );
  }

  if (state.error) {
    return <div className="alert alert-danger">{state.error}</div>;
  }

  return (
    <>
      <h3 className="page-title">Billing</h3>

      <div className="mt-3">
        <div className="d-flex align-items-center justify-content-between flex-wrap gap-2">
          <h5 className="mb-0">Billing Activity</h5>
          <label className="table-search" htmlFor="saas-billing-transfer-search">
            <span>Search:</span>
            <input
              id="saas-billing-transfer-search"
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
                <th>Product</th>
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
              {billingTransfersPaged.paged.length ? (
                billingTransfersPaged.paged.map((row) => (
                  <tr key={row.id}>
                    <td>{row.organization || "-"}</td>
                    <td>{row.owner_name || "-"}</td>
                    <td>{row.owner_email || "-"}</td>
                    <td>{row.product || "-"}</td>
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
                        onClick={() => setBillingViewModal({ open: true, row })}
                      >
                        View
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="12">No billing activity found.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="table-footer">
          <div className="table-info">
            Showing {billingTransfersPaged.filtered.length ? billingTransfersPaged.startIndex + 1 : 0} to{" "}
            {Math.min(billingTransfersPaged.startIndex + PAGE_SIZE, billingTransfersPaged.filtered.length)} of{" "}
            {billingTransfersPaged.filtered.length} entries
          </div>
          <TablePagination
            page={billingTransfersPaged.currentPage}
            totalPages={billingTransfersPaged.totalPages}
            onPageChange={setBillingTransferPage}
            showPageLinks
            showPageLabel={false}
            maxPageLinks={7}
          />
        </div>
      </div>

      <div className="mt-3">
        <div className="d-flex align-items-center justify-content-between flex-wrap gap-2">
          <h5 className="mb-0">Subscription History</h5>
          <label className="table-search" htmlFor="saas-billing-sub-search">
            <span>Search:</span>
            <input
              id="saas-billing-sub-search"
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
                <th>Product</th>
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
              {billingSubsPaged.paged.length ? (
                billingSubsPaged.paged.map((row) => (
                  <tr key={row.id}>
                    <td>{row.organization || "-"}</td>
                    <td>{row.product || "-"}</td>
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
                  <td colSpan="10">No subscription history found.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="table-footer">
          <div className="table-info">
            Showing {billingSubsPaged.filtered.length ? billingSubsPaged.startIndex + 1 : 0} to{" "}
            {Math.min(billingSubsPaged.startIndex + PAGE_SIZE, billingSubsPaged.filtered.length)} of{" "}
            {billingSubsPaged.filtered.length} entries
          </div>
          <TablePagination
            page={billingSubsPaged.currentPage}
            totalPages={billingSubsPaged.totalPages}
            onPageChange={setBillingSubPage}
            showPageLinks
            showPageLabel={false}
            maxPageLinks={7}
          />
        </div>
      </div>

      <div className="card p-3 mt-3">
        <div className="d-flex align-items-center justify-content-between flex-wrap gap-2">
          <h5 className="mb-0">GST Bills (Monthly)</h5>
        </div>
        {availableMonths.length ? (
          <div className="d-flex flex-wrap align-items-end gap-2 mt-3">
            <label className="gst-date-label">
              <span>From Month</span>
              <div className="date-picker-wrap" ref={fromWrapRef}>
                <input type="text" className="date-input" data-input />
                <button type="button" className="calendar-trigger" title="Open calendar" data-toggle>
                  <i className="bi bi-calendar3" />
                </button>
              </div>
            </label>
            <label className="gst-date-label">
              <span>To Month</span>
              <div className="date-picker-wrap" ref={toWrapRef}>
                <input type="text" className="date-input" data-input />
                <button type="button" className="calendar-trigger" title="Open calendar" data-toggle>
                  <i className="bi bi-calendar3" />
                </button>
              </div>
            </label>
            <button
              type="button"
              className="btn btn-primary"
              disabled={!gstFromMonth || !gstToMonth}
              onClick={() => {
                if (!gstFromMonth || !gstToMonth) {
                  return;
                }
                window.location.assign(
                  `/api/saas-admin/billing-gst-archive?from=${encodeURIComponent(gstFromMonth)}&to=${encodeURIComponent(gstToMonth)}`
                );
              }}
            >
              Download Zip
            </button>
          </div>
        ) : (
          <div className="text-secondary mt-2">No approved GST bills available yet.</div>
        )}
      </div>

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
                <span className="text-secondary">Product</span>
                <div>{formatValue(billingViewModal.row?.product)}</div>
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
    </>
  );
}
