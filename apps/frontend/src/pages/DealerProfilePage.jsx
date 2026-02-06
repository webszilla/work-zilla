import { useEffect, useState } from "react";
import { apiFetch } from "../lib/api.js";
import { PHONE_COUNTRIES } from "../lib/phoneCountries.js";
import { COUNTRY_OPTIONS } from "../lib/countries.js";

const emptyState = {
  loading: true,
  error: "",
  data: null
};

const phoneCountries = PHONE_COUNTRIES;

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

function splitPhone(value) {
  const raw = String(value || "").trim();
  if (!raw) {
    return { country: "+91", number: "" };
  }
  if (raw.startsWith("+")) {
    const parts = raw.split(" ");
    if (parts.length > 1) {
      return { country: parts[0], number: parts.slice(1).join(" ").trim() };
    }
    return { country: raw, number: "" };
  }
  return { country: "+91", number: raw };
}

export default function DealerProfilePage() {
  const [state, setState] = useState(emptyState);
  const [notice, setNotice] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phoneCountry, setPhoneCountry] = useState("+91");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [addressLine1, setAddressLine1] = useState("");
  const [addressLine2, setAddressLine2] = useState("");
  const [city, setCity] = useState("");
  const [stateName, setStateName] = useState("");
  const [country, setCountry] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [bankName, setBankName] = useState("");
  const [bankAccountNumber, setBankAccountNumber] = useState("");
  const [bankIfsc, setBankIfsc] = useState("");
  const [upiId, setUpiId] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  useEffect(() => {
    let active = true;
    async function loadProfile() {
      setNotice("");
      try {
        const data = await apiFetch("/api/dashboard/dealer/profile");
        if (!active) {
          return;
        }
        setState({ loading: false, error: "", data });
        const user = data.user || {};
        const dealer = data.dealer || {};
        setName(user.name || "");
        setEmail(user.email || "");
        const phone = splitPhone(data.phone_number || "");
        setPhoneCountry(phone.country);
        setPhoneNumber(phone.number);
        setAddressLine1(dealer.address_line1 || "");
        setAddressLine2(dealer.address_line2 || "");
        setCity(dealer.city || "");
        setStateName(dealer.state || "");
        setCountry(dealer.country || "India");
        setPostalCode(dealer.postal_code || "");
        setBankName(dealer.bank_name || "");
        setBankAccountNumber(dealer.bank_account_number || "");
        setBankIfsc(dealer.bank_ifsc || "");
        setUpiId(dealer.upi_id || "");
      } catch (error) {
        if (active) {
          setState({
            loading: false,
            error: error?.message || "Unable to load profile.",
            data: null
          });
        }
      }
    }

    loadProfile();
    return () => {
      active = false;
    };
  }, []);

  async function handleProfileSubmit(event) {
    event.preventDefault();
    setNotice("");
    try {
      await apiFetch("/api/dashboard/dealer/profile", {
        method: "POST",
        body: JSON.stringify({
          name,
          email,
          phone_country: phoneCountry,
          phone_number: phoneNumber,
          address_line1: addressLine1,
          address_line2: addressLine2,
          city,
          state: stateName,
          country,
          postal_code: postalCode,
          bank_name: bankName,
          bank_account_number: bankAccountNumber,
          bank_ifsc: bankIfsc,
          upi_id: upiId
        })
      });
      setNotice("Profile updated successfully.");
    } catch (error) {
      setState((prev) => ({
        ...prev,
        error: error?.message || "Unable to update profile."
      }));
    }
  }

  async function handlePasswordSubmit(event) {
    event.preventDefault();
    setNotice("");
    try {
      await apiFetch("/api/dashboard/dealer/profile/password", {
        method: "POST",
        body: JSON.stringify({
          current_password: currentPassword,
          new_password: newPassword,
          confirm_password: confirmPassword
        })
      });
      setNotice("Password updated successfully.");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (error) {
      setState((prev) => ({
        ...prev,
        error: error?.message || "Unable to update password."
      }));
    }
  }

  if (state.loading) {
    return (
      <div className="card p-4 text-center">
        <div className="spinner" />
        <p className="mb-0">Loading profile...</p>
      </div>
    );
  }

  return (
    <>
      <h2 className="page-title">My Profile</h2>
      <hr className="section-divider" />

      {notice ? <div className="alert alert-success">{notice}</div> : null}
      {state.error ? <div className="alert alert-danger">{state.error}</div> : null}

      <form id="dealer-profile-form" onSubmit={handleProfileSubmit} />
      <div className="row g-3">
        <div className="col-12 col-lg-4">
          <div className="card p-3 h-100">
            <h5>Profile Details</h5>
            <div className="mb-2">
              <label className="form-label">Name</label>
              <input
                type="text"
                className="form-control"
                value={name}
                onChange={(event) => setName(event.target.value)}
                form="dealer-profile-form"
                required
              />
            </div>
            <div className="mb-2">
              <label className="form-label">Email ID</label>
              <input
                type="email"
                className="form-control"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                form="dealer-profile-form"
                required
              />
            </div>
            <div className="mb-2">
              <label className="form-label">Phone Number</label>
              <div className="input-group">
                <select
                  className="form-select"
                  value={phoneCountry}
                  onChange={(event) => setPhoneCountry(event.target.value)}
                  style={{ maxWidth: "170px" }}
                  form="dealer-profile-form"
                >
                  {phoneCountries.map((entry) => (
                    <option key={`${entry.code}-${entry.label}`} value={entry.code}>
                      {entry.label} {entry.code}
                    </option>
                  ))}
                </select>
                <input
                  type="tel"
                  className="form-control"
                  value={phoneNumber}
                  onChange={(event) => setPhoneNumber(event.target.value)}
                  placeholder="Phone number"
                  form="dealer-profile-form"
                />
              </div>
            </div>
            <div className="mb-2">
              <label className="form-label">Address Line 1</label>
              <input
                type="text"
                className="form-control"
                value={addressLine1}
                onChange={(event) => setAddressLine1(event.target.value)}
                form="dealer-profile-form"
              />
            </div>
            <div className="mb-2">
              <label className="form-label">Address Line 2</label>
              <input
                type="text"
                className="form-control"
                value={addressLine2}
                onChange={(event) => setAddressLine2(event.target.value)}
                form="dealer-profile-form"
              />
            </div>
            <div className="row g-2">
              <div className="col-12 col-md-6">
                <label className="form-label">City</label>
                <input
                  type="text"
                  className="form-control"
                  value={city}
                  onChange={(event) => setCity(event.target.value)}
                  form="dealer-profile-form"
                />
              </div>
              <div className="col-12 col-md-6">
                <label className="form-label">Country</label>
                <input
                  type="text"
                  className="form-control"
                  value={country}
                  onChange={(event) => {
                    const nextCountry = event.target.value;
                    const nextOptions = getStateOptions(nextCountry);
                    setCountry(nextCountry);
                    if (nextOptions.length && !nextOptions.includes(stateName)) {
                      setStateName("");
                    }
                  }}
                  list="country-options"
                  form="dealer-profile-form"
                />
              </div>
              <div className="col-12 col-md-6">
                <label className="form-label">State</label>
                {getStateOptions(country).length ? (
                  <select
                    className="form-select"
                    value={stateName}
                    onChange={(event) => setStateName(event.target.value)}
                    form="dealer-profile-form"
                  >
                    <option value="">Select state</option>
                    {getStateOptions(country).map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    className="form-control"
                    value={stateName}
                    onChange={(event) => setStateName(event.target.value)}
                    placeholder="State"
                    form="dealer-profile-form"
                  />
                )}
              </div>
              <div className="col-12 col-md-6">
                <label className="form-label">Pincode</label>
                <input
                  type="text"
                  className="form-control"
                  value={postalCode}
                  onChange={(event) => setPostalCode(event.target.value)}
                  form="dealer-profile-form"
                />
              </div>
            </div>
          </div>
        </div>

        <div className="col-12 col-lg-4">
          <div className="card p-3 h-100">
            <h5>Bank Details</h5>
            <div className="mb-2">
              <label className="form-label">Bank Name</label>
              <input
                type="text"
                className="form-control"
                value={bankName}
                onChange={(event) => setBankName(event.target.value)}
                form="dealer-profile-form"
              />
            </div>
            <div className="mb-2">
              <label className="form-label">Account Number</label>
              <input
                type="text"
                className="form-control"
                value={bankAccountNumber}
                onChange={(event) => setBankAccountNumber(event.target.value)}
                form="dealer-profile-form"
              />
            </div>
            <div className="mb-2">
              <label className="form-label">IFSC</label>
              <input
                type="text"
                className="form-control"
                value={bankIfsc}
                onChange={(event) => setBankIfsc(event.target.value)}
                form="dealer-profile-form"
              />
            </div>
            <div className="mb-2">
              <label className="form-label">UPI ID</label>
              <input
                type="text"
                className="form-control"
                value={upiId}
                onChange={(event) => setUpiId(event.target.value)}
                form="dealer-profile-form"
              />
            </div>
            <button className="btn btn-primary btn-sm" type="submit" form="dealer-profile-form">
              Save Profile
            </button>
          </div>
        </div>

        <div className="col-12 col-lg-4">
          <div className="card p-3 h-100">
            <h5>Update Password</h5>
            <form onSubmit={handlePasswordSubmit}>
              <div className="mb-2">
                <label className="form-label">Current Password</label>
                <input
                  type="password"
                  className="form-control"
                  value={currentPassword}
                  onChange={(event) => setCurrentPassword(event.target.value)}
                  required
                />
              </div>
              <div className="mb-2">
                <label className="form-label">New Password</label>
                <input
                  type="password"
                  className="form-control"
                  value={newPassword}
                  onChange={(event) => setNewPassword(event.target.value)}
                  required
                />
              </div>
              <div className="mb-2">
                <label className="form-label">Confirm New Password</label>
                <input
                  type="password"
                  className="form-control"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  required
                />
              </div>
              <button className="btn btn-warning btn-sm" type="submit">
                Update Password
              </button>
            </form>
          </div>
        </div>
      </div>

      <datalist id="country-options">
        {COUNTRY_OPTIONS.map((option) => (
          <option key={option} value={option} />
        ))}
      </datalist>

    </>
  );
}
