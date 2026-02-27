import { useEffect, useState } from "react";
import { apiFetch } from "../lib/api.js";

export default function ImpositionProductBillingPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [items, setItems] = useState([]);

  async function loadBilling() {
    setLoading(true);
    setError("");
    try {
      const data = await apiFetch("/api/product/billing");
      setItems(data.items || []);
    } catch (err) {
      setError(err?.message || "Unable to load billing history.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadBilling();
  }, []);

  return (
    <div className="container-fluid">
      <div className="d-flex align-items-center justify-content-between mb-3">
        <div>
          <h2 className="page-title mb-1">Billing History</h2>
          <div className="text-secondary">Invoices and payment history for Imposition Software.</div>
        </div>
        <button type="button" className="btn btn-outline-light btn-sm" onClick={loadBilling}>
          Refresh
        </button>
      </div>

      {error ? <div className="alert alert-danger">{error}</div> : null}

      <div className="card p-3">
        <div className="table-responsive">
          <table className="table table-dark table-striped align-middle">
            <thead>
              <tr>
                <th>Invoice Number</th>
                <th>Plan</th>
                <th>Amount</th>
                <th>Currency</th>
                <th>Payment Method</th>
                <th>Status</th>
                <th>Date</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan="8">Loading...</td></tr>
              ) : items.length ? (
                items.map((row) => (
                  <tr key={row.invoice_number}>
                    <td>{row.invoice_number}</td>
                    <td>{row.plan || "-"}</td>
                    <td>{row.amount ?? "-"}</td>
                    <td>{row.currency || "-"}</td>
                    <td>{row.payment_method || "-"}</td>
                    <td>{row.status || "-"}</td>
                    <td>{row.date || "-"}</td>
                    <td className="d-flex gap-2">
                      {row.invoice_url ? (
                        <a href={row.invoice_url} className="btn btn-outline-light btn-sm" target="_blank" rel="noreferrer">
                          Download Invoice
                        </a>
                      ) : (
                        <button type="button" className="btn btn-outline-light btn-sm" disabled>
                          Download Invoice
                        </button>
                      )}
                      <a href="/pricing/?product=imposition-software" className="btn btn-primary btn-sm">
                        Renew Plan
                      </a>
                    </td>
                  </tr>
                ))
              ) : (
                <tr><td colSpan="8">No billing records found.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
