import { useEffect, useState } from "react";
import { apiFetch } from "../lib/api.js";
import { PHONE_COUNTRIES } from "../lib/phoneCountries.js";

const emptyState = {
  loading: true,
  error: "",
  data: null
};

const phoneCountries = PHONE_COUNTRIES;

export default function SaasAdminProfilePage() {
  const [state, setState] = useState(emptyState);
  const [notice, setNotice] = useState("");
  const [email, setEmail] = useState("");
  const [phoneCountry, setPhoneCountry] = useState("+91");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  useEffect(() => {
    let active = true;
    async function loadProfile() {
      setNotice("");
      try {
        const data = await apiFetch("/api/dashboard/profile");
        if (!active) {
          return;
        }
        setState({ loading: false, error: "", data });
        setEmail(data.user?.email || "");
        setPhoneCountry(data.phone_country || "+91");
        setPhoneNumber(data.phone_number || "");
      } catch (error) {
        if (error?.data?.redirect) {
          window.location.href = error.data.redirect;
          return;
        }
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

  async function handleDetailsSubmit(event) {
    event.preventDefault();
    setNotice("");
    try {
      await apiFetch("/api/dashboard/profile/email", {
        method: "POST",
        body: JSON.stringify({
          email,
          phone_country: phoneCountry,
          phone_number: phoneNumber
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
      await apiFetch("/api/dashboard/profile/password", {
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

  const user = state.data?.user || {};

  return (
    <div className="wz-profile-workspace">
      <h2 className="page-title">Profile</h2>
      <hr className="section-divider" />

      {notice ? <div className="alert alert-success">{notice}</div> : null}
      {state.error ? <div className="alert alert-danger">{state.error}</div> : null}

      <div className="row g-3 mt-1">
        <div className="col-12 col-lg-6">
          <div className="card p-3 h-100">
            <h5>Account</h5>
            <p>
              <strong>Username:</strong> {user.username || "-"}
            </p>

            <form className="mt-3" onSubmit={handleDetailsSubmit}>
              <div className="mb-2">
                <label className="form-label">Email</label>
                <input
                  type="email"
                  className="form-control"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  required
                />
              </div>
              <div className="mb-2">
                <label className="form-label">Mobile Number</label>
                <div className="input-group">
                  <select
                    className="form-select"
                    value={phoneCountry}
                    onChange={(event) => setPhoneCountry(event.target.value)}
                    style={{ maxWidth: "170px" }}
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
                  />
                </div>
              </div>
              <button className="btn btn-primary btn-sm">Update Details</button>
            </form>
          </div>
        </div>

        <div className="col-12 col-lg-6">
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
              <button className="btn btn-warning btn-sm">Update Password</button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
