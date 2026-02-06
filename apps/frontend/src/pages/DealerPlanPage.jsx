import { useEffect, useState } from "react";
import { apiFetch } from "../lib/api.js";

const emptyState = {
  loading: true,
  error: "",
  data: null
};

export default function DealerPlanPage() {
  const [state, setState] = useState(emptyState);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let active = true;
    async function loadPlan() {
      try {
        const data = await apiFetch("/api/dashboard/dealer/plan");
        if (!active) {
          return;
        }
        setState({ loading: false, error: "", data });
      } catch (error) {
        if (active) {
          setState({
            loading: false,
            error: error?.message || "Unable to load plan details.",
            data: null
          });
        }
      }
    }

    loadPlan();
    return () => {
      active = false;
    };
  }, []);

  async function handleSubscribe() {
    setNotice("");
    try {
      const data = await apiFetch("/api/dashboard/dealer/subscribe", {
        method: "POST",
        body: JSON.stringify({})
      });
      if (data?.redirect) {
        window.location.href = data.redirect;
        return;
      }
      setNotice(data?.message || "Subscription created.");
    } catch (error) {
      setNotice("");
      setState((prev) => ({
        ...prev,
        error: error?.message || "Unable to create subscription."
      }));
    }
  }

  if (state.loading) {
    return (
      <div className="card p-4 text-center">
        <div className="spinner" />
        <p className="mb-0">Loading plan...</p>
      </div>
    );
  }

  const plan = state.data || {};
  const dealerName = plan.dealer_name || "Agent";

  return (
    <>
      <h2 className="page-title">Plan</h2>
      <hr className="section-divider" />

      {notice ? <div className="alert alert-success">{notice}</div> : null}
      {state.error ? <div className="alert alert-danger">{state.error}</div> : null}

      <div className="row g-3">
        <div className="col-12 col-lg-6">
          <div className="card p-3 h-100">
            <h5>Dealer Subscription</h5>
            <p>
              <strong>Yearly Amount:</strong> {plan.subscription_amount ?? "-"}
            </p>
            <p>
              <strong>Commission Rate:</strong> {plan.commission_rate ?? 0}%
            </p>
            <button className="btn btn-primary" type="button" onClick={handleSubscribe}>
              Proceed to Bank Transfer
            </button>
          </div>
        </div>
        <div className="col-12 col-lg-6">
          <div className="card p-3 h-100">
            <h5>Welcome {dealerName}</h5>
            <p className="text-secondary mb-0">
              You earn {plan.commission_rate ?? 0}% commission on the first invoice payment from the companies you
              bring to our products. Please complete your subscription payment to enable your account.
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
