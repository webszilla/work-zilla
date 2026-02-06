import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { apiFetch, getCsrfToken } from "../lib/api.js";

const emptyState = {
  loading: true,
  error: "",
  data: null
};

function formatValue(value, fallback = "-") {
  if (value === null || value === undefined || value === "") {
    return fallback;
  }
  if (typeof value === "object") {
    try {
      return JSON.stringify(value);
    } catch (error) {
      return fallback;
    }
  }
  return String(value);
}

export default function BankTransferPage() {
  const { transferId } = useParams();
  const [state, setState] = useState(emptyState);
  const [notice, setNotice] = useState("");
  const [referenceNo, setReferenceNo] = useState("");
  const [receiptFile, setReceiptFile] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  async function loadTransfer(activeFlag) {
    setNotice("");
    try {
      const endpoint = transferId
        ? `/api/dashboard/bank-transfer/${transferId}`
        : "/api/dashboard/bank-transfer";
      const data = await apiFetch(endpoint);
      if (data?.redirect) {
        window.location.href = data.redirect;
        return;
      }
      if (activeFlag && !activeFlag.current) {
        return;
      }
      setState({ loading: false, error: "", data });
    } catch (error) {
      if (error?.data?.redirect) {
        window.location.href = error.data.redirect;
        return;
      }
      if (!activeFlag || activeFlag.current) {
        setState({
          loading: false,
          error: error?.message || "Unable to load bank transfer details.",
          data: null
        });
      }
    }
  }

  useEffect(() => {
    const activeFlag = { current: true };
    loadTransfer(activeFlag);
    return () => {
      activeFlag.current = false;
    };
  }, [transferId]);

  const transfer = state.data?.transfer || null;
  const shouldRedirectToPlans = !state.loading && !state.error && !transfer && !transferId;
  const noticeText = formatValue(notice, "");
  const errorText = formatValue(state.error, "");

  useEffect(() => {
    if (shouldRedirectToPlans) {
      window.location.href = "/plans";
    }
  }, [shouldRedirectToPlans]);

  async function handleSubmit(event) {
    event.preventDefault();
    if (!referenceNo.trim()) {
      setNotice("Please enter the reference / UTR number.");
      return;
    }
    setNotice("");
    setSubmitting(true);
    try {
      const endpoint = transferId
        ? `/api/dashboard/bank-transfer/${transferId}/submit`
        : "/api/dashboard/bank-transfer/submit";
      const formData = new FormData();
      formData.append("reference_no", referenceNo.trim());
      if (receiptFile) {
        formData.append("receipt", receiptFile);
      }
      const response = await fetch(endpoint, {
        method: "POST",
        credentials: "include",
        headers: {
          "X-CSRFToken": getCsrfToken()
        },
        body: formData
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        setNotice(data?.error || "Unable to submit payment.");
        setSubmitting(false);
        return;
      }
      if (data?.message) {
        setNotice(data.message);
      }
      if (data?.redirect) {
        window.location.href = data.redirect;
      } else {
        await loadTransfer();
      }
    } catch (error) {
      setNotice("Unable to submit payment.");
    } finally {
      setSubmitting(false);
    }
  }

  if (state.loading) {
    return (
      <div className="card p-4 text-center">
        <div className="spinner" />
        <p className="mb-0">Loading bank transfer...</p>
      </div>
    );
  }

  return (
    <>
      <h2 className="page-title">Bank Transfer</h2>
      <p className="text-secondary mb-1">
        Submit your payment details. We will verify and activate your plan.
      </p>
      <hr className="section-divider" />

      {noticeText ? <div className="alert alert-info">{noticeText}</div> : null}
      {errorText ? <div className="alert alert-danger">{errorText}</div> : null}

      {transfer ? (
        <div className="row g-3">
          <div className="col-12 col-lg-6">
            <div className="card p-3 h-100">
              <h5 className="mb-3">Plan Summary</h5>
              <table className="table table-borderless mb-0">
                <tbody>
                  <tr>
                    <td className="fw-semibold">Company</td>
                    <td>{formatValue(transfer.org_name)}</td>
                  </tr>
                  <tr>
                    <td className="fw-semibold">Plan</td>
                    <td>{formatValue(transfer.plan_name)}</td>
                  </tr>
                  <tr>
                    <td className="fw-semibold">Billing Cycle</td>
                    <td>{formatValue(transfer.billing_cycle, "monthly")}</td>
                  </tr>
                  <tr>
                    <td className="fw-semibold">Amount</td>
                    <td>
                      {formatValue(transfer.currency, "INR")} {formatValue(transfer.base_amount ?? transfer.amount, "0")}
                    </td>
                  </tr>
                  {transfer.tax_amount ? (
                    <tr>
                      <td className="fw-semibold">GST</td>
                      <td>
                        {formatValue(transfer.currency, "INR")} {formatValue(transfer.tax_amount, "0")}
                      </td>
                    </tr>
                  ) : null}
                  {transfer.tax_amount ? (
                    <tr>
                      <td className="fw-semibold">Total Payable</td>
                      <td>
                        {formatValue(transfer.currency, "INR")} {formatValue(transfer.total_amount, "0")}
                      </td>
                    </tr>
                  ) : null}
                  {transfer.addon_count ? (
                    <tr>
                      <td className="fw-semibold">Add-ons</td>
                      <td>{formatValue(transfer.addon_count)}</td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>
          <div className="col-12 col-lg-6">
            <div className="card p-3 h-100">
              <h5 className="mb-3">Payment Details</h5>
              <form onSubmit={handleSubmit}>
                {transfer.bank_account_details ? (
                  <div className="mb-3">
                    <label className="form-label">Bank Account Details</label>
                    <div className="form-control" style={{ whiteSpace: "pre-wrap" }}>
                      {transfer.bank_account_details}
                    </div>
                  </div>
                ) : null}
                <div className="mb-3">
                  <label className="form-label">Reference / UTR Number</label>
                  <input
                    type="text"
                    className="form-control"
                    value={referenceNo}
                    onChange={(event) => setReferenceNo(event.target.value)}
                    placeholder="Enter reference or UTR number"
                    required
                  />
                </div>
                <div className="mb-3">
                  <label className="form-label">Transaction Screenshot</label>
                  <input
                    type="file"
                    className="form-control"
                    required
                    onChange={(event) => setReceiptFile(event.target.files?.[0] || null)}
                  />
                </div>
                <button className="btn btn-primary" type="submit" disabled={submitting}>
                  {submitting ? "Submitting..." : "Submit for Approval"}
                </button>
                <p className="text-secondary mt-3 mb-0">
                  Your account will be activated after verification.
                </p>
              </form>
            </div>
          </div>
        </div>
      ) : transferId ? (
        <div className="alert alert-warning">No pending payment request found.</div>
      ) : shouldRedirectToPlans ? (
        <div className="alert alert-info">
          No pending payment request found. Redirecting to Plans...
        </div>
      ) : null}
    </>
  );
}
