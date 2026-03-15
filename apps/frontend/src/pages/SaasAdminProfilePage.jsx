import { useEffect, useState } from "react";
import { apiFetch } from "../lib/api.js";
import { PHONE_COUNTRIES } from "../lib/phoneCountries.js";
import PhoneCountryCodePicker from "../components/PhoneCountryCodePicker.jsx";

const emptyState = {
  loading: true,
  error: "",
  data: null
};

const phoneCountries = PHONE_COUNTRIES;

function getProfilePhotoFallbackLabel(user = {}) {
  const fullName = `${String(user?.first_name || "").trim()} ${String(user?.last_name || "").trim()}`.trim();
  if (fullName) {
    return fullName.slice(0, 1).toUpperCase();
  }
  const username = String(user?.username || "").trim();
  if (username) {
    return username.slice(0, 1).toUpperCase();
  }
  const email = String(user?.email || "").trim();
  if (email) {
    return email.slice(0, 1).toUpperCase();
  }
  return "U";
}

export default function SaasAdminProfilePage() {
  const [state, setState] = useState(emptyState);
  const [notice, setNotice] = useState("");
  const [email, setEmail] = useState("");
  const [phoneCountry, setPhoneCountry] = useState("+91");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [publicServerIp, setPublicServerIp] = useState("");
  const [publicServerDomain, setPublicServerDomain] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [profilePhotoUrl, setProfilePhotoUrl] = useState("");
  const [photoUploadState, setPhotoUploadState] = useState({ loading: false, error: "", success: "" });

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
        setPublicServerIp(data.public_server_ip || "");
        setPublicServerDomain(data.public_server_domain || "");
        setProfilePhotoUrl(data.user?.profile_photo_url || "");
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
          phone_number: phoneNumber,
          public_server_ip: publicServerIp,
          public_server_domain: publicServerDomain
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

  async function handleProfilePhotoChange(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) {
      return;
    }
    setPhotoUploadState({ loading: true, error: "", success: "" });
    try {
      const formData = new FormData();
      formData.set("photo", file);
      const response = await apiFetch("/api/dashboard/profile/photo", {
        method: "POST",
        body: formData,
      });
      setProfilePhotoUrl(response?.profile_photo_url || "");
      setState((prev) => ({
        ...prev,
        data: prev.data
          ? {
              ...prev.data,
              user: {
                ...(prev.data.user || {}),
                profile_photo_url: response?.profile_photo_url || "",
              },
            }
          : prev.data,
      }));
      setPhotoUploadState({ loading: false, error: "", success: "Profile photo updated successfully." });
    } catch (error) {
      setPhotoUploadState({ loading: false, error: error?.message || "Unable to upload profile photo.", success: "" });
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
  const profilePhotoFallback = getProfilePhotoFallbackLabel(user);

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

            <div className="wz-profile-photo-card mb-3">
              <div className="wz-profile-photo-card__preview">
                {profilePhotoUrl ? (
                  <img src={profilePhotoUrl} alt="Profile" className="wz-profile-photo-card__image" />
                ) : (
                  <div className="wz-profile-photo-card__fallback">{profilePhotoFallback}</div>
                )}
              </div>
              <div className="wz-profile-photo-card__body">
                <h6 className="mb-1">Profile Photo</h6>
                <p className="text-secondary mb-0">Recommended size: 250x250px. Maximum file size: 500MB.</p>
                <div className="wz-profile-photo-card__actions">
                  <label className="btn btn-outline-light btn-sm wz-profile-photo-card__upload-btn">
                    {photoUploadState.loading ? "Uploading..." : "Upload Photo"}
                    <input type="file" accept="image/*" className="d-none" onChange={handleProfilePhotoChange} disabled={photoUploadState.loading} />
                  </label>
                </div>
                {photoUploadState.error ? <div className="text-danger small mt-2">{photoUploadState.error}</div> : null}
                {photoUploadState.success ? <div className="text-success small mt-2">{photoUploadState.success}</div> : null}
              </div>
            </div>

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
                  <PhoneCountryCodePicker
                    value={phoneCountry}
                    onChange={(code) => setPhoneCountry(code)}
                    options={phoneCountries}
                    style={{ maxWidth: "170px" }}
                    ariaLabel="SaaS admin phone country code"
                  />
                  <input
                    type="tel"
                    className="form-control"
                    value={phoneNumber}
                    onChange={(event) => setPhoneNumber(event.target.value)}
                    placeholder="Phone number"
                  />
                </div>
              </div>
              <div className="mb-2">
                <label className="form-label">Online Server IP</label>
                <input
                  type="text"
                  className="form-control"
                  value={publicServerIp}
                  onChange={(event) => setPublicServerIp(event.target.value)}
                  placeholder="203.0.113.10"
                />
              </div>
              <div className="mb-2">
                <label className="form-label">Online Server Domain URL</label>
                <input
                  type="text"
                  className="form-control"
                  value={publicServerDomain}
                  onChange={(event) => setPublicServerDomain(event.target.value)}
                  placeholder="app.yourdomain.com"
                />
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
