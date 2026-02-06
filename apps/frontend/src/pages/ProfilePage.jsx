import { useEffect, useState } from "react";
import { apiFetch } from "../lib/api.js";
import { PHONE_COUNTRIES } from "../lib/phoneCountries.js";
import TablePagination from "../components/TablePagination.jsx";

const emptyState = {
  loading: true,
  error: "",
  data: null
};

const phoneCountries = PHONE_COUNTRIES;
const fallbackTimezones = [
  "UTC",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "Europe/London",
  "Europe/Berlin",
  "Europe/Paris",
  "Asia/Dubai",
  "Asia/Kolkata",
  "Asia/Singapore",
  "Asia/Tokyo",
  "Australia/Sydney"
];

export default function ProfilePage() {
  const [state, setState] = useState(emptyState);
  const [notice, setNotice] = useState("");
  const [adminPage, setAdminPage] = useState(1);
  const [tableSearchTerm, setTableSearchTerm] = useState("");
  const [tableSearchQuery, setTableSearchQuery] = useState("");
  const [usersModal, setUsersModal] = useState({ open: false, users: [] });
  const [email, setEmail] = useState("");
  const [phoneCountry, setPhoneCountry] = useState("+91");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [orgTimezone, setOrgTimezone] = useState("UTC");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [backupLoading, setBackupLoading] = useState(true);
  const [backupError, setBackupError] = useState("");
  const [backupItems, setBackupItems] = useState([]);
  const [backupProducts, setBackupProducts] = useState([]);
  const [backupProductSlug, setBackupProductSlug] = useState("");
  const [backupActionLoading, setBackupActionLoading] = useState(false);
  const [backupNotice, setBackupNotice] = useState("");

  useEffect(() => {
    let active = true;
    async function loadProfile() {
      setNotice("");
      try {
        const params = new URLSearchParams();
        if (adminPage) {
          params.set("admin_page", String(adminPage));
        }
        if (tableSearchQuery) {
          params.set("q", tableSearchQuery);
        }
        const url = params.toString()
          ? `/api/dashboard/profile?${params.toString()}`
          : "/api/dashboard/profile";
        const data = await apiFetch(url);
        if (!active) {
          return;
        }
        setState({ loading: false, error: "", data });
        setEmail(data.user?.email || "");
        setPhoneCountry(data.phone_country || "+91");
        setPhoneNumber(data.phone_number || "");
        setOrgTimezone(data.org_timezone || "UTC");
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
  }, [adminPage, tableSearchQuery]);

  useEffect(() => {
    const handle = setTimeout(() => {
      setTableSearchQuery(tableSearchTerm.trim());
      setAdminPage(1);
    }, 300);
    return () => clearTimeout(handle);
  }, [tableSearchTerm]);

  useEffect(() => {
    let active = true;
    async function loadBackupProducts() {
      try {
        const subs = await apiFetch("/api/auth/subscriptions");
        if (!active) {
          return;
        }
        const products = (subs.subscriptions || [])
          .map((entry) => ({
            slug: entry.product_slug,
            name: entry.product_name || entry.product_slug
          }));
        setBackupProducts(products);
        if (!backupProductSlug && products.length) {
          setBackupProductSlug(products[0].slug);
        }
      } catch (error) {
        if (!active) {
          return;
        }
        setBackupError(error?.message || "Unable to load products for backups.");
      }
    }

    loadBackupProducts();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    async function loadBackups() {
      if (!backupProductSlug) {
        setBackupLoading(false);
        return;
      }
      setBackupLoading(true);
      setBackupError("");
      try {
        const params = new URLSearchParams();
        params.set("limit", "10");
        params.set("product_slug", backupProductSlug);
        const data = await apiFetch(`/api/backup/list?${params.toString()}`);
        if (!active) {
          return;
        }
        setBackupItems(Array.isArray(data.items) ? data.items : []);
        setBackupLoading(false);
      } catch (error) {
        if (!active) {
          return;
        }
        setBackupError(error?.message || "Unable to load backups.");
        setBackupLoading(false);
      }
    }

    loadBackups();
    return () => {
      active = false;
    };
  }, [backupProductSlug]);

  async function handleEmailSubmit(event) {
    event.preventDefault();
    setNotice("");
    try {
      await apiFetch("/api/dashboard/profile/email", {
        method: "POST",
        body: JSON.stringify({
          email,
          phone_country: phoneCountry,
          phone_number: phoneNumber,
          org_timezone: orgTimezone
        })
      });
      setNotice("Email updated successfully.");
    } catch (error) {
      setState((prev) => ({
        ...prev,
        error: error?.message || "Unable to update email."
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

  async function handleGenerateBackup() {
    if (!data.org?.id || !backupProductSlug) {
      setBackupError("Organization or product missing.");
      return;
    }
    setBackupNotice("");
    setBackupError("");
    setBackupActionLoading(true);
    try {
      await apiFetch("/api/backup/request", {
        method: "POST",
        body: JSON.stringify({
          organization_id: data.org.id,
          product_slug: backupProductSlug
        })
      });
      setBackupNotice("Backup request queued. It will appear here once ready.");
      setBackupActionLoading(false);
    } catch (error) {
      setBackupError(error?.message || "Unable to request backup.");
      setBackupActionLoading(false);
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

  const data = state.data || {};
  const user = data.user || {};
  const recentActions = data.recent_actions || [];
  const referral = data.referral || {};
  const referralEarnings = Array.isArray(referral.earnings) ? referral.earnings : [];
  const tzList = typeof Intl.supportedValuesOf === "function"
    ? Intl.supportedValuesOf("timeZone")
    : fallbackTimezones;
  const showTimezone = Boolean(data.org?.id);
  const pagination = data.pagination || {};
  const currentPage = pagination.page || adminPage;
  const pageSize = pagination.page_size || 50;
  const totalItems =
    typeof pagination.total_items === "number"
      ? pagination.total_items
      : recentActions.length;
  const startEntry = totalItems ? (currentPage - 1) * pageSize + 1 : 0;
  const endEntry = totalItems
    ? Math.min(currentPage * pageSize, totalItems)
    : 0;

  function openUsersModal(users) {
    setUsersModal({ open: true, users });
  }

  return (
    <>
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

            <form className="mt-3" onSubmit={handleEmailSubmit}>
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
              {showTimezone ? (
                <div className="mb-2">
                  <label className="form-label">Organization Timezone</label>
                  <select
                    className="form-select"
                    value={orgTimezone}
                    onChange={(event) => setOrgTimezone(event.target.value)}
                  >
                    {tzList.map((tz) => (
                      <option key={tz} value={tz}>
                        {tz}
                      </option>
                    ))}
                  </select>
                </div>
              ) : null}
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

      <div className="card p-3 mt-3">
        <h5>Downloads & Backups</h5>
        <p className="text-secondary">
          Generate a downloadable backup of your organization&apos;s data.
        </p>
        <div className="mb-2">
          <a className="btn btn-outline-light btn-sm" href="/app/backup-history">
            View Full History
          </a>
        </div>
        {backupNotice ? <div className="alert alert-success">{backupNotice}</div> : null}
        {backupError ? <div className="alert alert-danger">{backupError}</div> : null}

        <div className="row g-3 align-items-end">
          <div className="col-12 col-md-4">
            <label className="form-label">Product</label>
            <select
              className="form-select"
              value={backupProductSlug}
              onChange={(event) => setBackupProductSlug(event.target.value)}
            >
              {backupProducts.length ? (
                backupProducts.map((product) => (
                  <option key={product.slug} value={product.slug}>
                    {product.name}
                  </option>
                ))
              ) : (
                <option value="">No products</option>
              )}
            </select>
          </div>
          <div className="col-12 col-md-4">
            <button
              type="button"
              className="btn btn-primary"
              onClick={handleGenerateBackup}
              disabled={backupActionLoading || !backupProductSlug}
            >
              {backupActionLoading ? "Generating..." : "Generate Backup"}
            </button>
          </div>
        </div>

        <div className="table-responsive mt-3">
          <table className="table table-dark table-striped table-hover align-middle">
            <thead>
              <tr>
                <th>Product</th>
                <th>Status</th>
                <th>Size</th>
                <th>Created</th>
                <th>Expires</th>
                <th>Download</th>
              </tr>
            </thead>
            <tbody>
              {backupLoading ? (
                <tr>
                  <td colSpan="6">Loading backups...</td>
                </tr>
              ) : backupItems.length ? (
                backupItems.map((item) => (
                  <tr key={item.id}>
                    <td>{item.product_name || "-"}</td>
                    <td>{item.status || "-"}</td>
                    <td>{item.size_bytes ? `${(item.size_bytes / (1024 * 1024)).toFixed(2)} MB` : "-"}</td>
                    <td>{item.completed_at || item.requested_at || "-"}</td>
                    <td>{item.expires_at || "-"}</td>
                    <td>
                      {item.can_download && item.download_url ? (
                        <a className="btn btn-sm btn-outline-light" href={item.download_url}>
                          Download
                        </a>
                      ) : (
                        "-"
                      )}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="6">No backups yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card p-3 mt-3">
        <h5>Referral Program</h5>
        <p>
          <strong>Commission Rate:</strong> {referral.commission_rate ?? 0}%
        </p>
        {referral.subscription_amount ? (
          <p>
            <strong>Subscription Amount:</strong> {referral.subscription_amount}
          </p>
        ) : null}
        <div className="row g-3">
          <div className="col-12 col-md-4">
            <label className="form-label">Referral Code</label>
            <input
              type="text"
              className="form-control"
              value={referral.code || ""}
              readOnly
            />
          </div>
          <div className="col-12 col-md-8">
            <label className="form-label">Referral Link</label>
            <input
              type="text"
              className="form-control"
              value={referral.link || ""}
              readOnly
            />
          </div>
        </div>
      </div>

      <div className="card p-3 mt-3">
        <h5>Referral Income</h5>
        <div className="table-responsive">
          <table className="table table-dark table-striped table-hover align-middle mt-2">
            <thead>
              <tr>
                <th>Company / Dealer</th>
                <th>Transfer</th>
                <th>Base Amount</th>
                <th>Rate</th>
                <th>Commission</th>
                <th>Flat Amount</th>
                <th>Status</th>
                <th>Payout Ref</th>
                <th>Payout Date</th>
              </tr>
            </thead>
            <tbody>
              {referralEarnings.length ? (
                referralEarnings.map((row) => (
                  <tr key={row.id}>
                    <td>{row.referred_org || row.referred_dealer || "-"}</td>
                    <td>{row.transfer_id || "-"}</td>
                    <td>{row.base_amount ?? "-"}</td>
                    <td>{row.commission_rate ?? 0}%</td>
                    <td>{row.commission_amount ?? "-"}</td>
                    <td>{row.flat_amount ?? "-"}</td>
                    <td>{row.status || "-"}</td>
                    <td>{row.payout_reference || "-"}</td>
                    <td>{row.payout_date || "-"}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="9">No referral income yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card p-3 mt-3">
        <h5>Admin Activity</h5>
        <div className="table-controls">
          <div className="table-length">Show {pageSize} entries</div>
          <label className="table-search" htmlFor="profile-admin-search">
            <span>Search:</span>
            <input
              id="profile-admin-search"
              type="text"
              value={tableSearchTerm}
              onChange={(event) => setTableSearchTerm(event.target.value)}
              placeholder="Search activity"
            />
          </label>
        </div>
        <div className="table-responsive">
          <table className="table table-dark table-striped table-hover align-middle mt-2">
            <thead>
              <tr>
                <th>Time</th>
                <th>Action</th>
                <th>Users</th>
                <th>Details</th>
              </tr>
            </thead>
            <tbody>
              {recentActions.length ? (
                recentActions.map((log, idx) => {
                  const users = Array.isArray(log.employees) ? log.employees : [];
                  return (
                    <tr key={`${log.time}-${idx}`}>
                      <td>{log.time}</td>
                      <td>{log.action}</td>
                      <td>
                        {users.length === 1 ? (
                          users[0]
                        ) : users.length > 1 ? (
                          <button
                            type="button"
                            className="btn btn-link text-info p-0 history-trigger"
                            onClick={() => openUsersModal(users)}
                          >
                            View Users Details
                          </button>
                        ) : (
                          "-"
                        )}
                      </td>
                      <td>{log.details || "-"}</td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan="4">No recent activity.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="table-footer">
          <div className="table-info">
            Showing {startEntry} to {endEntry} of {totalItems} entries
          </div>
          <TablePagination
            page={currentPage}
            totalPages={pagination.total_pages || 1}
            onPageChange={setAdminPage}
            showPageLinks
            showPageLabel={false}
            maxPageLinks={7}
          />
        </div>
      </div>

      {usersModal.open ? (
        <div
          className="modal-overlay"
          onClick={() => setUsersModal({ open: false, users: [] })}
        >
          <div className="modal-panel" onClick={(event) => event.stopPropagation()}>
            <h5>Users Details</h5>
            <div className="table-responsive">
              <table className="table table-dark table-striped align-middle mb-0">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Employee</th>
                  </tr>
                </thead>
                <tbody>
                  {usersModal.users.map((name, index) => (
                    <tr key={`${name}-${index}`}>
                      <td>{index + 1}</td>
                      <td>{name}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="d-flex justify-content-end mt-3">
              <button
                className="modal-close"
                type="button"
                onClick={() => setUsersModal({ open: false, users: [] })}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
