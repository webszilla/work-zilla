import { useEffect, useState } from "react";
import { apiFetch } from "../lib/api.js";

function valueOrDash(value) {
  return value || "-";
}

export default function ImpositionProductProfilePage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [profile, setProfile] = useState(null);
  const [license, setLicense] = useState(null);

  async function loadData() {
    setLoading(true);
    setError("");
    try {
      const [me, licenseData] = await Promise.all([
        apiFetch("/api/auth/me"),
        apiFetch("/api/product/license"),
      ]);
      setProfile(me);
      setLicense(licenseData);
    } catch (err) {
      setError(err?.message || "Unable to load profile.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  const org = profile?.profile?.organization || {};
  const user = profile?.user || {};

  return (
    <div className="container-fluid">
      <div className="d-flex align-items-center justify-content-between mb-3">
        <div>
          <h2 className="page-title mb-1">Profile</h2>
          <div className="text-secondary">Organization profile and license details.</div>
        </div>
        <button type="button" className="btn btn-outline-light btn-sm" onClick={loadData}>
          Refresh
        </button>
      </div>

      {error ? <div className="alert alert-danger">{error}</div> : null}
      {loading ? (
        <div className="text-secondary">Loading profile...</div>
      ) : (
        <>
          <div className="card p-3 mb-3">
            <h5 className="mb-3">Organization Product Profile</h5>
            <div className="row g-3">
              <div className="col-12 col-md-6">
                <div className="text-secondary small">Company Name</div>
                <div>{valueOrDash(org.name)}</div>
              </div>
              <div className="col-12 col-md-6">
                <div className="text-secondary small">Contact Email</div>
                <div>{valueOrDash(user.email)}</div>
              </div>
              <div className="col-12 col-md-4">
                <div className="text-secondary small">Phone</div>
                <div>{valueOrDash(profile?.profile?.phone_number)}</div>
              </div>
              <div className="col-12 col-md-4">
                <div className="text-secondary small">Country</div>
                <div>{valueOrDash(profile?.profile?.country)}</div>
              </div>
              <div className="col-12 col-md-4">
                <div className="text-secondary small">Timezone</div>
                <div>{valueOrDash(profile?.org_timezone)}</div>
              </div>
            </div>
          </div>

          <div className="card p-3">
            <h5 className="mb-3">License Info</h5>
            <div className="row g-3">
              <div className="col-12 col-md-4">
                <div className="text-secondary small">License Code</div>
                <div>{valueOrDash(license?.license_code)}</div>
              </div>
              <div className="col-12 col-md-4">
                <div className="text-secondary small">Activation Date</div>
                <div>{valueOrDash(license?.activation_date)}</div>
              </div>
              <div className="col-12 col-md-4">
                <div className="text-secondary small">Plan Expiry Date</div>
                <div>{valueOrDash(license?.plan_expiry_date)}</div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
