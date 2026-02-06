import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { apiFetch } from "../lib/api.js";
import { COUNTRY_OPTIONS } from "../lib/countries.js";

const emptyState = {
  loading: true,
  error: "",
  data: null
};

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
  ],
  "united states": [
    "Alabama",
    "Alaska",
    "Arizona",
    "Arkansas",
    "California",
    "Colorado",
    "Connecticut",
    "Delaware",
    "Florida",
    "Georgia",
    "Hawaii",
    "Idaho",
    "Illinois",
    "Indiana",
    "Iowa",
    "Kansas",
    "Kentucky",
    "Louisiana",
    "Maine",
    "Maryland",
    "Massachusetts",
    "Michigan",
    "Minnesota",
    "Mississippi",
    "Missouri",
    "Montana",
    "Nebraska",
    "Nevada",
    "New Hampshire",
    "New Jersey",
    "New Mexico",
    "New York",
    "North Carolina",
    "North Dakota",
    "Ohio",
    "Oklahoma",
    "Oregon",
    "Pennsylvania",
    "Rhode Island",
    "South Carolina",
    "South Dakota",
    "Tennessee",
    "Texas",
    "Utah",
    "Vermont",
    "Virginia",
    "Washington",
    "West Virginia",
    "Wisconsin",
    "Wyoming"
  ],
  canada: [
    "Alberta",
    "British Columbia",
    "Manitoba",
    "New Brunswick",
    "Newfoundland and Labrador",
    "Nova Scotia",
    "Ontario",
    "Prince Edward Island",
    "Quebec",
    "Saskatchewan",
    "Northwest Territories",
    "Nunavut",
    "Yukon"
  ],
  australia: [
    "Australian Capital Territory",
    "New South Wales",
    "Northern Territory",
    "Queensland",
    "South Australia",
    "Tasmania",
    "Victoria",
    "Western Australia"
  ],
  "united kingdom": [
    "England",
    "Northern Ireland",
    "Scotland",
    "Wales"
  ]
};

function normalizeCountry(value) {
  return String(value || "").trim().toLowerCase();
}

function getStateOptions(country) {
  return STATE_OPTIONS_BY_COUNTRY[normalizeCountry(country)] || [];
}

function formatValue(value) {
  if (value === null || value === undefined || value === "") {
    return "-";
  }
  return value;
}

function titleCase(value) {
  if (!value) {
    return "-";
  }
  return String(value)
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export default function SaasAdminOrganizationPage() {
  const { orgId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const [state, setState] = useState(emptyState);
  const [notice, setNotice] = useState("");
  const [plans, setPlans] = useState([]);
  const [form, setForm] = useState({
    name: "",
    company_key: "",
    owner_username: "",
    owner_first_name: "",
    owner_last_name: "",
    owner_email: "",
    plan_id: "",
    billing_cycle: "monthly",
    status: "active",
    end_date: "",
    addon_count: 0
  });
  const [billingForm, setBillingForm] = useState({
    contact_name: "",
    company_name: "",
    email: "",
    phone: "",
    address_line1: "",
    address_line2: "",
    city: "",
    state: "",
    postal_code: "",
    country: "",
    gstin: ""
  });

  useEffect(() => {
    let active = true;
    async function loadOrg() {
      setNotice("");
      try {
        const data = await apiFetch(`/api/saas-admin/organizations/${orgId}`);
        if (!active) {
          return;
        }
        setState({ loading: false, error: "", data });
        const owner = data.owner || {};
        const subscription = data.subscription || {};
        const billingProfile = data.billing_profile || {};
        setForm({
          name: data.organization?.name || "",
          company_key: data.organization?.company_key || "",
          owner_username: owner.username || "",
          owner_first_name: owner.first_name || "",
          owner_last_name: owner.last_name || "",
          owner_email: owner.email || "",
          plan_id: subscription.plan_id || "",
          billing_cycle: subscription.billing_cycle || "monthly",
          status: subscription.status || "active",
          end_date: subscription.end_date || "",
          addon_count: subscription.addon_count ?? 0
        });
        setBillingForm({
          contact_name: billingProfile.contact_name || "",
          company_name: billingProfile.company_name || "",
          email: billingProfile.email || "",
          phone: billingProfile.phone || "",
          address_line1: billingProfile.address_line1 || "",
          address_line2: billingProfile.address_line2 || "",
          city: billingProfile.city || "",
          state: billingProfile.state || "",
          postal_code: billingProfile.postal_code || "",
          country: billingProfile.country || "",
          gstin: billingProfile.gstin || ""
        });
      } catch (error) {
        if (active) {
          setState({
            loading: false,
            error: error?.message || "Unable to load organization.",
            data: null
          });
        }
      }
    }

    loadOrg();
    return () => {
      active = false;
    };
  }, [orgId]);

  useEffect(() => {
    let active = true;
    async function loadPlans() {
      try {
        const data = await apiFetch("/api/saas-admin/plans");
        if (!active) {
          return;
        }
        setPlans(data.plans || []);
      } catch {
        if (active) {
          setPlans([]);
        }
      }
    }

    loadPlans();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (location.hash === "#edit") {
      const node = document.getElementById("org-edit-section");
      if (node) {
        node.scrollIntoView({ behavior: "smooth" });
      }
    }
  }, [location.hash]);

  async function handleSave(event) {
    event.preventDefault();
    setNotice("");
    try {
      await apiFetch(`/api/saas-admin/organizations/${orgId}`, {
        method: "PUT",
        body: JSON.stringify({
          name: form.name,
          company_key: form.company_key,
          owner_username: form.owner_username,
          owner_first_name: form.owner_first_name,
          owner_last_name: form.owner_last_name,
          owner_email: form.owner_email,
          plan_id: form.plan_id || null,
          billing_cycle: form.billing_cycle,
          status: form.status,
          end_date: form.end_date,
          addon_count: form.addon_count,
          billing_contact_name: billingForm.contact_name,
          billing_company_name: billingForm.company_name,
          billing_email: billingForm.email,
          billing_phone: billingForm.phone,
          billing_address_line1: billingForm.address_line1,
          billing_address_line2: billingForm.address_line2,
          billing_city: billingForm.city,
          billing_state: billingForm.state,
          billing_postal_code: billingForm.postal_code,
          billing_country: billingForm.country,
          billing_gstin: billingForm.gstin
        })
      });
      setNotice("Organization updated.");
    } catch (error) {
      setState((prev) => ({
        ...prev,
        error: error?.message || "Unable to update organization."
      }));
    }
  }

  if (state.loading) {
    return (
      <div className="card p-4 text-center">
        <div className="spinner" />
        <p className="mb-0">Loading organization...</p>
      </div>
    );
  }

  const org = state.data?.organization || {};
  const owner = state.data?.owner || {};
  const subscription = state.data?.subscription || {};
  const billingProfile = state.data?.billing_profile || {};
  const settings = state.data?.settings || {};

  return (
    <>
      <div className="d-flex align-items-center justify-content-between flex-wrap gap-2">
        <h3 className="page-title">Organization Details</h3>
        <button
          type="button"
          className="btn btn-outline-light btn-sm"
          onClick={() => navigate("/saas-admin/organizations")}
        >
          Back
        </button>
      </div>

      {notice ? <div className="alert alert-success mt-2">{notice}</div> : null}
      {state.error ? <div className="alert alert-danger mt-2">{state.error}</div> : null}

      <div className="card p-3 mt-3">
        <div className="row g-3">
          <div className="col-12 col-lg-6">
            <h5>Profile</h5>
            <div className="mb-2">
              <strong>Name:</strong> {formatValue(org.name)}
            </div>
            <div className="mb-2">
              <strong>Company Key:</strong> {formatValue(org.company_key)}
            </div>
            <div className="mb-2">
              <strong>Created:</strong> {formatValue(org.created_at)}
            </div>
            <div className="mb-2">
              <strong>Owner:</strong>{" "}
              {formatValue(`${owner.first_name || ""} ${owner.last_name || ""}`.trim())}
            </div>
            <div className="mb-2">
              <strong>Owner Email:</strong> {formatValue(owner.email)}
            </div>
            <div className="mb-2">
              <strong>Owner Phone:</strong> {formatValue(state.data?.profile?.phone_number)}
            </div>
            <div className="mb-2">
              <strong>Owner Username:</strong> {formatValue(owner.username)}
            </div>
            <div className="mb-2">
              <strong>Plan:</strong> {formatValue(subscription.plan_name)}
            </div>
            <div className="mb-2">
              <strong>Status:</strong> {titleCase(subscription.status)}
            </div>
            <div className="mb-2">
              <strong>Billing Cycle:</strong> {titleCase(subscription.billing_cycle)}
            </div>
            <div className="mb-2">
              <strong>End Date:</strong> {formatValue(subscription.end_date)}
            </div>
            <div className="mb-2">
              <strong>Add-ons:</strong> {formatValue(subscription.addon_count)}
            </div>
          </div>
          <div className="col-12 col-lg-6">
            <h5>Billing Profile</h5>
            <div className="mb-2">
              <strong>Contact Name:</strong> {formatValue(billingProfile.contact_name)}
            </div>
            <div className="mb-2">
              <strong>Company Name:</strong> {formatValue(billingProfile.company_name)}
            </div>
            <div className="mb-2">
              <strong>Email:</strong> {formatValue(billingProfile.email)}
            </div>
            <div className="mb-2">
              <strong>Phone:</strong> {formatValue(billingProfile.phone)}
            </div>
            <div className="mb-2">
              <strong>Address:</strong> {formatValue(billingProfile.address_line1)}
            </div>
            <div className="mb-2">
              <strong>Address 2:</strong> {formatValue(billingProfile.address_line2)}
            </div>
            <div className="mb-2">
              <strong>City:</strong> {formatValue(billingProfile.city)}
            </div>
            <div className="mb-2">
              <strong>State:</strong> {formatValue(billingProfile.state)}
            </div>
            <div className="mb-2">
              <strong>Postal Code:</strong> {formatValue(billingProfile.postal_code)}
            </div>
            <div className="mb-2">
              <strong>Country:</strong> {formatValue(billingProfile.country)}
            </div>
            <div className="mb-2">
              <strong>GSTIN:</strong> {formatValue(billingProfile.gstin)}
            </div>
            <div className="mb-2">
              <strong>Updated:</strong> {formatValue(billingProfile.updated_at)}
            </div>
          </div>
        </div>
      </div>

      <div className="card p-3 mt-3" id="org-edit-section">
        <h5>Edit Organization</h5>
        <form onSubmit={handleSave}>
          <div className="modal-form-grid">
            <div className="modal-form-field">
              <label className="form-label">Organization Name</label>
              <input
                type="text"
                className="form-control"
                value={form.name}
                onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
              />
            </div>
            <div className="modal-form-field">
              <label className="form-label">Company Key</label>
              <input
                type="text"
                className="form-control"
                value={form.company_key}
                onChange={(event) => setForm((prev) => ({ ...prev, company_key: event.target.value }))}
              />
            </div>
            <div className="modal-form-field">
              <label className="form-label">Admin Username</label>
              <input
                type="text"
                className="form-control"
                value={form.owner_username}
                onChange={(event) => setForm((prev) => ({ ...prev, owner_username: event.target.value }))}
              />
            </div>
            <div className="modal-form-field">
              <label className="form-label">Admin First Name</label>
              <input
                type="text"
                className="form-control"
                value={form.owner_first_name}
                onChange={(event) => setForm((prev) => ({ ...prev, owner_first_name: event.target.value }))}
              />
            </div>
            <div className="modal-form-field">
              <label className="form-label">Admin Last Name</label>
              <input
                type="text"
                className="form-control"
                value={form.owner_last_name}
                onChange={(event) => setForm((prev) => ({ ...prev, owner_last_name: event.target.value }))}
              />
            </div>
            <div className="modal-form-field">
              <label className="form-label">Admin Email</label>
              <input
                type="email"
                className="form-control"
                value={form.owner_email}
                onChange={(event) => setForm((prev) => ({ ...prev, owner_email: event.target.value }))}
              />
            </div>
            <div className="modal-form-field">
              <label className="form-label">Plan</label>
              <select
                className="form-select"
                value={form.plan_id || ""}
                onChange={(event) => setForm((prev) => ({ ...prev, plan_id: Number(event.target.value) || "" }))}
              >
                <option value="">Select Plan</option>
                {plans.map((plan) => (
                  <option key={plan.id} value={plan.id}>
                    {plan.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="modal-form-field">
              <label className="form-label">Billing Cycle</label>
              <select
                className="form-select"
                value={form.billing_cycle}
                onChange={(event) => setForm((prev) => ({ ...prev, billing_cycle: event.target.value }))}
              >
                <option value="monthly">Monthly</option>
                <option value="yearly">Yearly</option>
              </select>
            </div>
            <div className="modal-form-field">
              <label className="form-label">Status</label>
              <select
                className="form-select"
                value={form.status}
                onChange={(event) => setForm((prev) => ({ ...prev, status: event.target.value }))}
              >
                <option value="active">Active</option>
                <option value="pending">Pending</option>
                <option value="expired">Expired</option>
              </select>
            </div>
            <div className="modal-form-field">
              <label className="form-label">Expire Date</label>
              <input
                type="date"
                className="form-control"
                value={form.end_date || ""}
                onChange={(event) => setForm((prev) => ({ ...prev, end_date: event.target.value }))}
              />
            </div>
            <div className="modal-form-field">
              <label className="form-label">Add-on Count</label>
              <input
                type="number"
                min="0"
                className="form-control"
                value={form.addon_count ?? 0}
                onChange={(event) => setForm((prev) => ({ ...prev, addon_count: event.target.value }))}
              />
            </div>
          </div>
          <div className="d-flex justify-content-end gap-2 mt-3">
            <button type="submit" className="btn btn-primary">
              Save
            </button>
          </div>
        </form>
      </div>

      <div className="card p-3 mt-3">
        <h5>Edit Billing Profile</h5>
        <form onSubmit={handleSave}>
          <div className="modal-form-grid">
            <div className="modal-form-field">
              <label className="form-label">Contact Name</label>
              <input
                type="text"
                className="form-control"
                value={billingForm.contact_name}
                onChange={(event) => setBillingForm((prev) => ({ ...prev, contact_name: event.target.value }))}
              />
            </div>
            <div className="modal-form-field">
              <label className="form-label">Company Name</label>
              <input
                type="text"
                className="form-control"
                value={billingForm.company_name}
                onChange={(event) => setBillingForm((prev) => ({ ...prev, company_name: event.target.value }))}
              />
            </div>
            <div className="modal-form-field">
              <label className="form-label">Email</label>
              <input
                type="email"
                className="form-control"
                value={billingForm.email}
                onChange={(event) => setBillingForm((prev) => ({ ...prev, email: event.target.value }))}
              />
            </div>
            <div className="modal-form-field">
              <label className="form-label">Phone</label>
              <input
                type="text"
                className="form-control"
                value={billingForm.phone}
                onChange={(event) => setBillingForm((prev) => ({ ...prev, phone: event.target.value }))}
              />
            </div>
            <div className="modal-form-field">
              <label className="form-label">Address Line 1</label>
              <input
                type="text"
                className="form-control"
                value={billingForm.address_line1}
                onChange={(event) => setBillingForm((prev) => ({ ...prev, address_line1: event.target.value }))}
              />
            </div>
            <div className="modal-form-field">
              <label className="form-label">Address Line 2</label>
              <input
                type="text"
                className="form-control"
                value={billingForm.address_line2}
                onChange={(event) => setBillingForm((prev) => ({ ...prev, address_line2: event.target.value }))}
              />
            </div>
            <div className="modal-form-field">
              <label className="form-label">City</label>
              <input
                type="text"
                className="form-control"
                value={billingForm.city}
                onChange={(event) => setBillingForm((prev) => ({ ...prev, city: event.target.value }))}
              />
            </div>
            <div className="modal-form-field">
              <label className="form-label">Postal Code</label>
              <input
                type="text"
                className="form-control"
                value={billingForm.postal_code}
                onChange={(event) => setBillingForm((prev) => ({ ...prev, postal_code: event.target.value }))}
              />
            </div>
            <div className="modal-form-field">
              <label className="form-label">Country</label>
              <input
                type="text"
                className="form-control"
                value={billingForm.country}
                onChange={(event) => {
                  const nextCountry = event.target.value;
                  const nextOptions = getStateOptions(nextCountry);
                  setBillingForm((prev) => ({
                    ...prev,
                    country: nextCountry,
                    state: nextOptions.length && !nextOptions.includes(prev.state) ? "" : prev.state
                  }));
                }}
                list="country-options"
              />
            </div>
            <div className="modal-form-field">
              <label className="form-label">State</label>
              <input
                type="text"
                className="form-control"
                value={billingForm.state}
                onChange={(event) => setBillingForm((prev) => ({ ...prev, state: event.target.value }))}
                list="state-options"
                disabled={!String(billingForm.country || "").trim()}
              />
            </div>
            <div className="modal-form-field">
              <label className="form-label">GSTIN</label>
              <input
                type="text"
                className="form-control"
                value={billingForm.gstin}
                onChange={(event) => setBillingForm((prev) => ({ ...prev, gstin: event.target.value }))}
              />
            </div>
          </div>
          <div className="d-flex justify-content-end gap-2 mt-3">
            <button type="submit" className="btn btn-primary">
              Save Billing Profile
            </button>
          </div>
        </form>
        <datalist id="country-options">
          {COUNTRY_OPTIONS.map((option) => (
            <option key={option} value={option} />
          ))}
        </datalist>
        <datalist id="state-options">
          {getStateOptions(billingForm.country).map((option) => (
            <option key={option} value={option} />
          ))}
        </datalist>
      </div>

      <div className="card p-3 mt-3">
        <h5>Settings</h5>
        <div className="mb-2">
          <strong>Screenshot Interval:</strong> {formatValue(settings.screenshot_interval_minutes)}
        </div>
        <div className="mb-2">
          <strong>Monitoring Mode:</strong> {titleCase(settings.monitoring_mode)}
        </div>
      </div>
    </>
  );
}
