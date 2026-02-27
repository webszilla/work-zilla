import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "../lib/api.js";

function toFeatureLabel(key) {
  return key
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export default function ImpositionProductPlanPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [plan, setPlan] = useState(null);
  const [addonModal, setAddonModal] = useState({
    open: false,
    addon: null,
    quantity: 1,
    cycle: "monthly",
    saving: false,
  });

  async function loadPlan() {
    setLoading(true);
    setError("");
    try {
      const data = await apiFetch("/api/product/plan");
      setPlan(data);
    } catch (err) {
      setError(err?.message || "Unable to load plan.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadPlan();
  }, []);

  function openAddonModal(addon) {
    setAddonModal({
      open: true,
      addon,
      quantity: Math.max(1, Number(addon?.current_quantity || 1)),
      cycle: addon?.current_billing_cycle || "monthly",
      saving: false,
    });
  }

  function closeAddonModal() {
    setAddonModal((prev) => ({ ...prev, open: false }));
  }

  async function submitAddonPurchase() {
    if (!addonModal.addon) {
      return;
    }
    setAddonModal((prev) => ({ ...prev, saving: true }));
    setNotice("");
    try {
      const payload = {
        addon_code: addonModal.addon.addon_code,
        quantity: Math.max(0, Number(addonModal.quantity || 0)),
        billing_cycle: addonModal.cycle || "monthly",
      };
      await apiFetch("/api/product/addons/purchase", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      setNotice("Add-on updated successfully.");
      closeAddonModal();
      await loadPlan();
    } catch (err) {
      setNotice(err?.message || "Unable to purchase add-on.");
      setAddonModal((prev) => ({ ...prev, saving: false }));
    }
  }

  const enabledFeatures = useMemo(() => {
    const flags = plan?.features || {};
    return Object.keys(flags).filter((key) => Boolean(flags[key]));
  }, [plan]);
  const addon = (plan?.addons || [])[0] || null;
  const addonQty = Math.max(0, Number(addonModal.quantity || 0));
  const addonCycle = addonModal.cycle === "yearly" ? "yearly" : "monthly";
  const addonPriceInr = Number(addon?.pricing?.[addonCycle]?.inr || 0);
  const addonTotalInr = addonPriceInr * addonQty;
  const addonCycleLabel = addonCycle === "yearly" ? "/ year" : "/ month";

  return (
    <div className="container-fluid">
      <div className="d-flex align-items-center justify-content-between mb-3">
        <div>
          <h2 className="page-title mb-1">Plan</h2>
          <div className="text-secondary">Current subscription and feature access.</div>
        </div>
        <button type="button" className="btn btn-outline-light btn-sm" onClick={loadPlan}>
          Refresh
        </button>
      </div>

      {error ? <div className="alert alert-danger">{error}</div> : null}
      {notice ? <div className="alert alert-info">{notice}</div> : null}

      {loading ? (
        <div className="text-secondary">Loading plan...</div>
      ) : (
        <>
          <div className="card p-3 mb-3">
            <div className="row g-3">
              <div className="col-12 col-md-6">
                <div className="text-secondary small">Plan Name</div>
                <div className="fw-semibold">{plan?.plan_name || "-"}</div>
              </div>
              <div className="col-12 col-md-6">
                <div className="text-secondary small">Billing Cycle</div>
                <div className="fw-semibold">{plan?.billing_cycle || "-"}</div>
              </div>
              <div className="col-12 col-md-6">
                <div className="text-secondary small">Device Limit</div>
                <div className="fw-semibold">{plan?.device_limit ?? 0}</div>
              </div>
              <div className="col-12 col-md-6">
                <div className="text-secondary small">User Limit</div>
                <div className="fw-semibold">{plan?.user_limit ?? 0}</div>
              </div>
              <div className="col-12">
                <div className="text-secondary small mb-1">Features</div>
                <div className="d-flex flex-wrap gap-2">
                  {enabledFeatures.length ? (
                    enabledFeatures.map((key) => (
                      <span className="badge text-bg-success" key={key}>{toFeatureLabel(key)}</span>
                    ))
                  ) : (
                    <span className="text-secondary">No features configured.</span>
                  )}
                </div>
              </div>
            </div>
            <div className="d-flex gap-2 mt-3">
              <a href="/pricing/?product=imposition-software" className="btn btn-primary btn-sm">
                Upgrade Plan
              </a>
              <a href="/pricing/?product=imposition-software" className="btn btn-outline-light btn-sm">
                Change Billing Cycle
              </a>
            </div>
          </div>

          {addon ? (
            <div className="card p-3">
              <h5 className="mb-2">ADD-ONS</h5>
              <div className="border rounded p-3">
                <div className="d-flex align-items-start justify-content-between flex-wrap gap-2 mb-2">
                  <div>
                    <h6 className="mb-1">{addon.addon_name}</h6>
                    <div className="text-secondary small">{addon.description}</div>
                  </div>
                  <button type="button" className="btn btn-primary btn-sm" onClick={() => openAddonModal(addon)}>
                    Buy Add-on
                  </button>
                </div>
                <div className="table-responsive">
                  <table className="table table-dark table-striped align-middle mb-0">
                    <thead>
                      <tr>
                        <th>Cycle</th>
                        <th>INR</th>
                        <th>USD</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td>Monthly</td>
                        <td>{`₹${addon.pricing?.monthly?.inr || 0} / user`}</td>
                        <td>{`$${addon.pricing?.monthly?.usd || 0} / user`}</td>
                      </tr>
                      <tr>
                        <td>Yearly</td>
                        <td>{`₹${addon.pricing?.yearly?.inr || 0} / user`}</td>
                        <td>{`$${addon.pricing?.yearly?.usd || 0} / user`}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                <div className="text-secondary small mt-2">
                  Current Add-on Users: {addon.current_quantity || 0} | Total Allowed Users: {addon.total_allowed_users || plan?.user_limit || 0}
                </div>
              </div>
            </div>
          ) : null}
        </>
      )}

      {addonModal.open && addonModal.addon ? (
        <div className="modal-overlay" onClick={closeAddonModal}>
          <div className="modal-panel" onClick={(event) => event.stopPropagation()}>
            <h5 className="mb-2">Buy Add-on</h5>
            <div className="text-secondary small mb-3">{addonModal.addon.addon_name}</div>
            <div className="mb-2">
              <label className="form-label">Quantity</label>
              <input
                type="number"
                min="0"
                className="form-control"
                value={addonModal.quantity}
                onChange={(event) => setAddonModal((prev) => ({
                  ...prev,
                  quantity: Math.max(0, Number(event.target.value || 0)),
                }))}
              />
            </div>
            <div className="mb-2">
              <label className="form-label">Billing Cycle</label>
              <select
                className="form-select"
                value={addonModal.cycle}
                onChange={(event) => setAddonModal((prev) => ({ ...prev, cycle: event.target.value }))}
              >
                <option value="monthly">Monthly</option>
                <option value="yearly">Yearly</option>
              </select>
            </div>
            <div className="alert alert-secondary">
              <div>Pricing Calculation</div>
              <div>{`${addonQty} Users ${addonCycle === "yearly" ? "Yearly" : "Monthly"}`}</div>
              <div className="fw-semibold">{`₹${addonTotalInr} ${addonCycleLabel}`}</div>
            </div>
            <div className="d-flex justify-content-end gap-2 mt-3">
              <button type="button" className="btn btn-secondary btn-sm" onClick={closeAddonModal}>
                Cancel
              </button>
              <button type="button" className="btn btn-primary btn-sm" disabled={addonModal.saving} onClick={submitAddonPurchase}>
                {addonModal.saving ? "Processing..." : "Confirm Purchase"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
