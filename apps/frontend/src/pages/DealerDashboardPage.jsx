import { useEffect, useState } from "react";
import { apiFetch } from "../lib/api.js";

const emptyState = {
  loading: true,
  error: "",
  data: null
};

export default function DealerDashboardPage() {
  const [state, setState] = useState(emptyState);

  useEffect(() => {
    let active = true;
    async function loadSummary() {
      try {
        const data = await apiFetch("/api/dashboard/dealer/summary");
        if (!active) {
          return;
        }
        setState({ loading: false, error: "", data });
      } catch (error) {
        if (active) {
          setState({
            loading: false,
            error: error?.message || "Unable to load dealer summary.",
            data: null
          });
        }
      }
    }

    loadSummary();
    return () => {
      active = false;
    };
  }, []);

  if (state.loading) {
    return (
      <div className="card p-4 text-center">
        <div className="spinner" />
        <p className="mb-0">Loading dashboard...</p>
      </div>
    );
  }

  const dealer = state.data?.dealer || {};
  const referralAmounts = state.data?.referral_amounts || {};
  const referral = state.data?.referral || {};
  const productsCount = state.data?.products_count ?? 0;

  return (
    <>
      <h2 className="page-title">Dealer Dashboard</h2>
      <hr className="section-divider" />

      {state.error ? <div className="alert alert-danger">{state.error}</div> : null}

      <div className="row g-3">
        <div className="col-12 col-md-6 col-lg-4 col-xl-2">
          <div className="card p-3 h-100">
            <div className="d-flex align-items-center gap-2 mb-2">
              <div className="stat-icon stat-icon-primary">
                <i className="bi bi-cash-stack" aria-hidden="true" />
              </div>
              <h6 className="mb-0">My Total Earnings</h6>
            </div>
            <div className="stat-value">{referralAmounts.total ?? 0}</div>
          </div>
        </div>
        <div className="col-12 col-md-6 col-lg-4 col-xl-2">
          <div className="card p-3 h-100">
            <div className="d-flex align-items-center gap-2 mb-2">
              <div className="stat-icon stat-icon-primary">
                <i className="bi bi-calendar-check" aria-hidden="true" />
              </div>
              <h6 className="mb-0">This Month Earnings</h6>
            </div>
            <div className="stat-value">{referralAmounts.month_total ?? 0}</div>
          </div>
        </div>
        <div className="col-12 col-md-6 col-lg-4 col-xl-2">
          <div className="card p-3 h-100">
            <div className="d-flex align-items-center gap-2 mb-2">
              <div className="stat-icon stat-icon-primary">
                <i className="bi bi-building" aria-hidden="true" />
              </div>
              <h6 className="mb-0">Total ORG Refered</h6>
            </div>
            <div className="stat-value">{referralAmounts.org_count ?? 0}</div>
          </div>
        </div>
        <div className="col-12 col-md-6 col-lg-4 col-xl-2">
          <div className="card p-3 h-100">
            <div className="d-flex align-items-center gap-2 mb-2">
              <div className="stat-icon stat-icon-primary">
                <i className="bi bi-people" aria-hidden="true" />
              </div>
              <h6 className="mb-0">Total Agent Refered</h6>
            </div>
            <div className="stat-value">{referralAmounts.dealer_count ?? 0}</div>
          </div>
        </div>
        <div className="col-12 col-md-6 col-lg-4 col-xl-2">
          <div className="card p-3 h-100">
            <div className="d-flex align-items-center gap-2 mb-2">
              <div className="stat-icon stat-icon-primary">
                <i className="bi bi-calendar-event" aria-hidden="true" />
              </div>
              <h6 className="mb-0">My Plan Expire Date</h6>
            </div>
            <div className="stat-value">{dealer.subscription_end || "-"}</div>
          </div>
        </div>
        <div className="col-12 col-md-6 col-lg-4 col-xl-2">
          <div className="card p-3 h-100">
            <div className="d-flex align-items-center gap-2 mb-2">
              <div className="stat-icon stat-icon-primary">
                <i className="bi bi-boxes" aria-hidden="true" />
              </div>
              <h6 className="mb-0">Work Zilla Products</h6>
            </div>
            <div className="stat-value">{productsCount}</div>
          </div>
        </div>
      </div>

      <div className="card p-3 mt-3">
        <h5>My Subscription</h5>
        <div className="table-responsive">
          <table className="table table-dark table-striped table-hover align-middle mt-2">
            <thead>
              <tr>
                <th>Agent Name</th>
                <th>Email ID</th>
                <th>Start Date</th>
                <th>End Date</th>
                <th>Commission %</th>
                <th>Plan Amount (Yearly)</th>
                <th>Total Earned</th>
                <th>Paid Earned</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>{dealer.name || "-"}</td>
                <td>{dealer.email || "-"}</td>
                <td>{dealer.subscription_start || "-"}</td>
                <td>{dealer.subscription_end || "-"}</td>
                <td>{state.data?.commission_rate ?? 0}%</td>
                <td>{dealer.subscription_amount ?? "-"}</td>
                <td>{referralAmounts.total ?? 0}</td>
                <td>{referralAmounts.paid ?? 0}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div className="card p-3 mt-3">
        <h5>Referral Details</h5>
        <div className="row g-3 mt-1">
          <div className="col-3">
            <label className="form-label">Referral Code</label>
            <input
              className="form-control"
              type="text"
              value={referral.code || ""}
              readOnly
            />
          </div>
        </div>
      </div>
    </>
  );
}
