import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { apiFetch } from "../lib/api.js";
import { COUNTRY_OPTIONS } from "../lib/countries.js";

const emptyState = {
  loading: true,
  error: "",
  data: null
};

const emptyBillingProfile = {
  contact_name: "",
  company_name: "",
  email: "",
  phone: "",
  address_line1: "",
  address_line2: "",
  city: "",
  state: "",
  postal_code: "",
  country: "India",
  gstin: ""
};

const requiredBillingFields = [
  "contact_name",
  "company_name",
  "email",
  "address_line1",
  "city",
  "state",
  "postal_code",
  "country",
  "gstin"
];

const STATE_OPTIONS_BY_COUNTRY = {
  india: [
    "Andhra Pradesh",
    "Arunachal Pradesh",
    "Assam",
    "Bihar",
    "Chhattisgarh",
    "Goa",
    "Gujarat",
    "Haryana",
    "Himachal Pradesh",
    "Jharkhand",
    "Karnataka",
    "Kerala",
    "Madhya Pradesh",
    "Maharashtra",
    "Manipur",
    "Meghalaya",
    "Mizoram",
    "Nagaland",
    "Odisha",
    "Punjab",
    "Rajasthan",
    "Sikkim",
    "Tamil Nadu",
    "Telangana",
    "Tripura",
    "Uttar Pradesh",
    "Uttarakhand",
    "West Bengal",
    "Andaman and Nicobar Islands",
    "Chandigarh",
    "Dadra and Nagar Haveli and Daman and Diu",
    "Delhi",
    "Jammu and Kashmir",
    "Ladakh",
    "Lakshadweep",
    "Puducherry"
  ]
};

function normalizeCountry(value) {
  return String(value || "").trim().toLowerCase();
}

function getStateOptions(country) {
  return STATE_OPTIONS_BY_COUNTRY[normalizeCountry(country)] || [];
}

function getMissingBillingFields(profile) {
  return requiredBillingFields.filter(
    (field) => !String(profile?.[field] || "").trim()
  );
}

export default function CompanySettingsPage() {
  const [state, setState] = useState(emptyState);
  const [notice, setNotice] = useState("");
  const [intervalValue, setIntervalValue] = useState("");
  const [billingProfile, setBillingProfile] = useState(emptyBillingProfile);
  const [billingLoaded, setBillingLoaded] = useState(false);
  const [billingSaving, setBillingSaving] = useState(false);
  const [billingNotice, setBillingNotice] = useState("");
  const [billingError, setBillingError] = useState("");
  const [billingMissing, setBillingMissing] = useState([]);

  async function refreshCompany() {
    const data = await apiFetch("/api/dashboard/company");
    setState({ loading: false, error: "", data });
    setIntervalValue(data.settings?.screenshot_interval_minutes ?? "");
  }

  useEffect(() => {
    const activeFlag = { current: true };
    async function loadCompany() {
      setNotice("");
      try {
        const data = await apiFetch("/api/dashboard/company");
        if (activeFlag && !activeFlag.current) {
          return;
        }
        setState({ loading: false, error: "", data });
        setIntervalValue(data.settings?.screenshot_interval_minutes ?? "");
      } catch (error) {
        if (error?.data?.redirect) {
          window.location.href = error.data.redirect;
          return;
        }
        if (!activeFlag || activeFlag.current) {
          setState({
            loading: false,
            error: error?.message || "Unable to load company settings.",
            data: null
          });
        }
      }
    }

    loadCompany();
    loadBillingProfile(activeFlag);
    return () => {
      activeFlag.current = false;
    };
  }, []);

  async function loadBillingProfile(activeFlag) {
    setBillingNotice("");
    setBillingError("");
    try {
      const data = await apiFetch("/api/dashboard/billing-profile");
      if (activeFlag && !activeFlag.current) {
        return;
      }
      setBillingProfile(data.profile || emptyBillingProfile);
      setBillingMissing(data.missing_fields || []);
      setBillingLoaded(true);
    } catch (error) {
      if (error?.data?.redirect) {
        window.location.href = error.data.redirect;
        return;
      }
      if (!activeFlag || activeFlag.current) {
        setBillingError(error?.message || "Unable to load billing details.");
        setBillingLoaded(true);
      }
    }
  }

  async function handleIntervalSubmit(event) {
    event.preventDefault();
    setNotice("");
    try {
      const data = await apiFetch("/api/dashboard/company/interval", {
        method: "POST",
        body: JSON.stringify({ interval: intervalValue })
      });
      setNotice(`Screenshot interval updated to ${data.screenshot_interval_minutes} minutes.`);
      await refreshCompany();
    } catch (error) {
      setNotice("");
      setState((prev) => ({
        ...prev,
        error: error?.message || "Unable to update interval."
      }));
    }
  }

  function updateBillingField(event) {
    const { name, value } = event.target;
    setBillingProfile((prev) => {
      if (name === "country") {
        return {
          ...prev,
          country: value,
          state: prev.state && prev.state.trim() ? prev.state : ""
        };
      }
      return { ...prev, [name]: value };
    });
  }

  async function handleBillingSave(event) {
    event.preventDefault();
    setBillingNotice("");
    setBillingError("");
    setBillingSaving(true);
    try {
      const data = await apiFetch("/api/dashboard/billing-profile", {
        method: "POST",
        body: JSON.stringify(billingProfile)
      });
      setBillingProfile(data.profile || emptyBillingProfile);
      setBillingMissing(data.missing_fields || []);
      setBillingNotice("Billing details saved.");
    } catch (error) {
      if (error?.data?.redirect) {
        window.location.href = error.data.redirect;
        return;
      }
      if (error?.data?.missing_fields) {
        setBillingMissing(error.data.missing_fields);
      }
      if (error?.message === "invalid_gstin") {
        setBillingError("Please enter a valid GSTIN.");
      } else {
        setBillingError(error?.message || "Unable to save billing details.");
      }
    } finally {
      setBillingSaving(false);
    }
  }

  if (state.loading) {
    return (
      <div className="card p-4 text-center">
        <div className="spinner" />
        <p className="mb-0">Loading company settings...</p>
      </div>
    );
  }

  const data = state.data || {};
  const org = data.org || {};
  const sub = data.subscription || null;
  const counts = data.counts || {};
  const allowedIntervals = data.allowed_intervals || [];
  const missingBillingFields = getMissingBillingFields(billingProfile);
  const invalidBillingFields = billingMissing.length ? billingMissing : missingBillingFields;
  const billingComplete = missingBillingFields.length === 0;

  return (
    <>
      <h2 className="page-title">{org.name || "Company Settings"}</h2>
      <hr className="section-divider" />

      {notice ? <div className="alert alert-success">{notice}</div> : null}
      {state.error ? <div className="alert alert-danger">{state.error}</div> : null}

      <div className="row g-3">
        <div className="col-12 col-lg-3">
          <div className="card p-3 h-100 monitor-summary-card">
            <h4>Company Details</h4>
            <div className="monitor-summary-row">
              <span>Name</span>
              <strong>{org.name || "-"}</strong>
            </div>
            <div className="monitor-summary-row">
              <span>Company Key</span>
              <strong>{org.company_key || "-"}</strong>
            </div>
            <div className="monitor-summary-row">
              <span>Created</span>
              <strong>{org.created_at || "-"}</strong>
            </div>

            <Link to="/company/edit" className="btn btn-primary mt-3">
              Edit Company
            </Link>
          </div>
        </div>

        <div className="col-12 col-lg-3">
          <div className="card p-3 h-100 monitor-summary-card">
            <h4>Subscription</h4>
            {sub ? (
              <>
                <div className="monitor-summary-row">
                  <span>Plan</span>
                  <strong>{sub.plan}</strong>
                </div>
                <div className="monitor-summary-row">
                  <span>Employees Allowed</span>
                  <strong>{sub.employee_limit === 0 ? "Unlimited" : sub.employee_limit}</strong>
                </div>
                {sub.end_date ? (
                  <div className="monitor-summary-row">
                    <span>Valid Till</span>
                    <strong>{sub.end_date}</strong>
                  </div>
                ) : null}
              </>
            ) : (
              <div className="monitor-summary-note">No Active Subscription</div>
            )}

            <Link to="/plans" className="btn btn-outline-primary mt-2 manage-plan-btn">
              Manage Plan
            </Link>
          </div>
        </div>
        <div className="col-12 col-lg-2">
          <div className="card p-3 h-100 monitor-summary-card">
            <h4>Plan Limits</h4>
            {sub ? (
              <>
                <div className="monitor-summary-row">
                  <span>Employee Limit</span>
                  <strong>{sub.employee_limit === 0 ? "Unlimited" : sub.employee_limit}</strong>
                </div>
                <div className="monitor-summary-row">
                  <span>Retention Days</span>
                  <strong>{sub.plan_retention_days ?? "-"}</strong>
                </div>
                <div className="monitor-summary-row">
                  <span>Min Screenshot</span>
                  <strong>{sub.screenshot_min_minutes} minutes</strong>
                </div>
              </>
            ) : (
              <div className="monitor-summary-note">No active plan details.</div>
            )}
          </div>
        </div>
        <div className="col-12 col-lg-2">
          <div className="card p-3 h-100 monitor-summary-card">
            <h4>Usage Summary</h4>
            <div className="monitor-summary-row">
              <span>Total Employees</span>
              <strong>{counts.employees ?? 0}</strong>
            </div>
            <div className="monitor-summary-row">
              <span>Total Activities</span>
              <strong>{counts.activities ?? 0}</strong>
            </div>
            <div className="monitor-summary-row">
              <span>Total Screenshots</span>
              <strong>{counts.screenshots ?? 0}</strong>
            </div>
          </div>
        </div>
        <div className="col-12 col-lg-2">
          <div className="card p-3 h-100 monitor-summary-card">
            <h4>Screenshot Interval</h4>
            <form className="mt-2" onSubmit={handleIntervalSubmit}>
              <div className="d-flex gap-2 align-items-center monitor-summary-row monitor-summary-row--accent">
                <select
                  className="form-select"
                  style={{ maxWidth: "140px" }}
                  value={intervalValue}
                  onChange={(event) => setIntervalValue(event.target.value)}
                >
                  {allowedIntervals.map((interval) => (
                    <option key={interval} value={interval}>
                      {interval} minutes
                    </option>
                  ))}
                </select>
                <button className="btn btn-primary" type="submit">
                  Save
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>

      <hr className="section-divider" />

      <div className="card p-3 mt-3" id="billing-details">
        <div className="d-flex flex-wrap align-items-center justify-content-between gap-2">
          <div>
            <h5 className="mb-1">Billing Information & GST</h5>
            <p className="text-secondary mb-0">
              Required before paid plans and used for invoice generation.
            </p>
          </div>
          <span className={`badge ${billingComplete ? "bg-success" : "bg-warning text-dark"}`}>
            {billingComplete ? "Complete" : "Incomplete"}
          </span>
        </div>
        {billingNotice ? <div className="alert alert-success mt-2">{billingNotice}</div> : null}
        {billingError ? <div className="alert alert-danger mt-2">{billingError}</div> : null}
        {!billingLoaded ? (
          <div className="text-secondary mt-2">Loading billing details...</div>
        ) : (
          <form onSubmit={handleBillingSave}>
            <div className="row g-3 mt-1">
              <div className="col-12 col-md-3">
                <label className="form-label">Contact Name</label>
                <input
                  type="text"
                  name="contact_name"
                  className={`form-control ${invalidBillingFields.includes("contact_name") ? "is-invalid" : ""}`}
                  value={billingProfile.contact_name}
                  onChange={updateBillingField}
                  required
                />
              </div>
              <div className="col-12 col-md-3">
                <label className="form-label">Company Name</label>
                <input
                  type="text"
                  name="company_name"
                  className={`form-control ${invalidBillingFields.includes("company_name") ? "is-invalid" : ""}`}
                  value={billingProfile.company_name}
                  onChange={updateBillingField}
                  required
                />
              </div>
              <div className="col-12 col-md-3">
                <label className="form-label">Email</label>
                <input
                  type="email"
                  name="email"
                  className={`form-control ${invalidBillingFields.includes("email") ? "is-invalid" : ""}`}
                  value={billingProfile.email}
                  onChange={updateBillingField}
                  required
                />
              </div>
              <div className="col-12 col-md-3">
                <label className="form-label">Phone (optional)</label>
                <input
                  type="tel"
                  name="phone"
                  className="form-control"
                  value={billingProfile.phone}
                  onChange={updateBillingField}
                />
              </div>
              <div className="col-12 col-md-4">
                <label className="form-label">Address Line 1</label>
                <input
                  type="text"
                  name="address_line1"
                  className={`form-control ${invalidBillingFields.includes("address_line1") ? "is-invalid" : ""}`}
                  value={billingProfile.address_line1}
                  onChange={updateBillingField}
                  required
                />
              </div>
              <div className="col-12 col-md-4">
                <label className="form-label">Address Line 2 (optional)</label>
                <input
                  type="text"
                  name="address_line2"
                  className="form-control"
                  value={billingProfile.address_line2}
                  onChange={updateBillingField}
                />
              </div>
              <div className="col-12 col-md-4">
                <label className="form-label">City</label>
                <input
                  type="text"
                  name="city"
                  className={`form-control ${invalidBillingFields.includes("city") ? "is-invalid" : ""}`}
                  value={billingProfile.city}
                  onChange={updateBillingField}
                  required
                />
              </div>
              <div className="col-12 col-md-3">
                <label className="form-label">Country</label>
                <input
                  type="text"
                  name="country"
                  className={`form-control ${invalidBillingFields.includes("country") ? "is-invalid" : ""}`}
                  value={billingProfile.country}
                  onChange={updateBillingField}
                  list="country-options"
                  required
                />
              </div>
              <div className="col-12 col-md-3">
                <label className="form-label">State</label>
                <input
                  type="text"
                  name="state"
                  className={`form-control ${invalidBillingFields.includes("state") ? "is-invalid" : ""}`}
                  value={billingProfile.state}
                  onChange={updateBillingField}
                  list="state-options"
                  disabled={!String(billingProfile.country || "").trim()}
                  required
                />
              </div>
              <div className="col-12 col-md-3">
                <label className="form-label">Postal Code</label>
                <input
                  type="text"
                  name="postal_code"
                  className={`form-control ${invalidBillingFields.includes("postal_code") ? "is-invalid" : ""}`}
                  value={billingProfile.postal_code}
                  onChange={updateBillingField}
                  required
                />
              </div>
              <div className="col-12 col-md-3">
                <label className="form-label">GSTIN</label>
                <input
                  type="text"
                  name="gstin"
                  className={`form-control ${invalidBillingFields.includes("gstin") ? "is-invalid" : ""}`}
                  value={billingProfile.gstin}
                  onChange={(event) =>
                    updateBillingField({
                      target: { name: "gstin", value: event.target.value.toUpperCase() }
                    })
                  }
                  maxLength={15}
                  placeholder="15-character GSTIN"
                  required
                />
              </div>
            </div>
            <datalist id="country-options">
              {COUNTRY_OPTIONS.map((option) => (
                <option key={option} value={option} />
              ))}
            </datalist>
            <datalist id="state-options">
              {getStateOptions(billingProfile.country).map((option) => (
                <option key={option} value={option} />
              ))}
            </datalist>
            <button className="btn btn-primary btn-sm mt-3" type="submit" disabled={billingSaving}>
              {billingSaving ? "Saving..." : "Save Billing Details"}
            </button>
          </form>
        )}
      </div>

    </>
  );
}
