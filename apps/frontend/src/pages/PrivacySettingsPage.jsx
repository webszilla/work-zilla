import { useEffect, useState } from "react";
import { apiFetch } from "../lib/api.js";

const emptyState = {
  loading: true,
  error: "",
  data: null
};

export default function PrivacySettingsPage() {
  const [state, setState] = useState(emptyState);
  const [notice, setNotice] = useState("");
  const [supportHours, setSupportHours] = useState(2);
  const [supportEnabled, setSupportEnabled] = useState(false);
  const [ignorePatterns, setIgnorePatterns] = useState("");
  const [keywordRules, setKeywordRules] = useState("");
  const [autoBlurPasswordFields, setAutoBlurPasswordFields] = useState(true);
  const [autoBlurOtpFields, setAutoBlurOtpFields] = useState(true);
  const [autoBlurCardFields, setAutoBlurCardFields] = useState(true);
  const [autoBlurEmailInbox, setAutoBlurEmailInbox] = useState(true);
  const [privacyUrlInput, setPrivacyUrlInput] = useState("");
  const [privacyModal, setPrivacyModal] = useState({ open: false, message: "" });
  const [privacyRulesModalOpen, setPrivacyRulesModalOpen] = useState(false);

  async function refreshCompany() {
    const data = await apiFetch("/api/dashboard/company");
    setState({ loading: false, error: "", data });
    setSupportHours(data.privacy?.support_duration_selected || 2);
    setSupportEnabled(Boolean(data.privacy?.support_access_enabled));
    setIgnorePatterns(data.settings?.screenshot_ignore_patterns ?? "");
    setKeywordRules(data.settings?.privacy_keyword_rules ?? "");
    setAutoBlurPasswordFields(data.settings?.auto_blur_password_fields ?? true);
    setAutoBlurOtpFields(data.settings?.auto_blur_otp_fields ?? true);
    setAutoBlurCardFields(data.settings?.auto_blur_card_fields ?? true);
    setAutoBlurEmailInbox(data.settings?.auto_blur_email_inbox ?? true);
  }

  useEffect(() => {
    let active = true;
    async function loadCompany() {
      setNotice("");
      try {
        const data = await apiFetch("/api/dashboard/company");
        if (!active) {
          return;
        }
        setState({ loading: false, error: "", data });
        setSupportHours(data.privacy?.support_duration_selected || 2);
        setSupportEnabled(Boolean(data.privacy?.support_access_enabled));
        setIgnorePatterns(data.settings?.screenshot_ignore_patterns ?? "");
        setKeywordRules(data.settings?.privacy_keyword_rules ?? "");
        setAutoBlurPasswordFields(data.settings?.auto_blur_password_fields ?? true);
        setAutoBlurOtpFields(data.settings?.auto_blur_otp_fields ?? true);
        setAutoBlurCardFields(data.settings?.auto_blur_card_fields ?? true);
        setAutoBlurEmailInbox(data.settings?.auto_blur_email_inbox ?? true);
      } catch (error) {
        if (error?.data?.redirect) {
          window.location.href = error.data.redirect;
          return;
        }
        if (active) {
          setState({
            loading: false,
            error: error?.message || "Unable to load privacy settings.",
            data: null
          });
        }
      }
    }

    loadCompany();
    return () => {
      active = false;
    };
  }, []);

  async function handleSupportSubmit(event) {
    event.preventDefault();
    setNotice("");
    try {
      await apiFetch("/api/dashboard/company/support-access", {
        method: "POST",
        body: JSON.stringify({
          support_access_enabled: supportEnabled,
          support_access_hours: supportHours
        })
      });
      setNotice("Support access settings updated.");
      await refreshCompany();
    } catch (error) {
      setNotice("");
      setState((prev) => ({
        ...prev,
        error: error?.message || "Unable to update support access."
      }));
    }
  }

  async function handlePrivacyListSubmit(event) {
    event.preventDefault();
    setNotice("");
    try {
      await apiFetch("/api/dashboard/company/screenshot-privacy", {
        method: "POST",
        body: JSON.stringify({
          ignore_patterns: ignorePatterns,
          privacy_keyword_rules: keywordRules,
          auto_blur_password_fields: autoBlurPasswordFields,
          auto_blur_otp_fields: autoBlurOtpFields,
          auto_blur_card_fields: autoBlurCardFields,
          auto_blur_email_inbox: autoBlurEmailInbox
        })
      });
      setNotice("Screenshot privacy list updated.");
      await refreshCompany();
    } catch (error) {
      setNotice("");
      setState((prev) => ({
        ...prev,
        error: error?.message || "Unable to update screenshot privacy list."
      }));
    }
  }

  function normalizePrivacyPattern(rawValue) {
    const value = (rawValue || "").trim();
    if (!value) {
      return "";
    }
    const lower = value.toLowerCase();
    if (
      lower.startsWith("url:") ||
      lower.startsWith("app:") ||
      lower.startsWith("title:") ||
      lower.startsWith("window:")
    ) {
      return value;
    }
    const cleaned = value.replace(/^https?:\/\//i, "").replace(/^www\./i, "");
    return `*${cleaned}*`;
  }

  function handleAddPrivacyUrl() {
    const pattern = normalizePrivacyPattern(privacyUrlInput);
    if (!pattern) {
      setPrivacyModal({ open: true, message: "Please enter a website URL." });
      return;
    }
    setIgnorePatterns((prev) => (prev.trim() ? `${prev.trim()}\n${pattern}` : pattern));
    setPrivacyModal({ open: true, message: `Added to privacy list: ${pattern}` });
    setPrivacyUrlInput("");
  }

  if (state.loading) {
    return (
      <div className="card p-4 text-center">
        <div className="spinner" />
        <p className="mb-0">Loading privacy settings...</p>
      </div>
    );
  }

  const data = state.data || {};
  const org = data.org || {};
  const privacy = data.privacy || {};

  return (
    <>
      <h2 className="page-title">Privacy Settings</h2>
      <p className="text-secondary mb-1">
        Organization: <strong>{org.name || "-"}</strong>
      </p>
      <hr className="section-divider" />

      {notice ? <div className="alert alert-success">{notice}</div> : null}
      {state.error ? <div className="alert alert-danger">{state.error}</div> : null}

      {!privacy.show ? (
        <div className="alert alert-warning">
          Privacy settings are managed by super admin for this account.
        </div>
      ) : (
        <div className="row g-3 mt-2">
          <div className="col-12 col-lg-6">
            <div className="card p-3 h-100">
              <h5>Monitoring Mode</h5>
              <div className="mt-2">
                <span className="badge bg-primary">Privacy Lock - Enabled</span>
                <div className="text-secondary mt-2">
                  Only org admins can access employee activity and screenshot data.
                  Even super admins do not have access in this mode.
                </div>
              </div>
              <hr className="section-divider my-3" />
              <h5>Support Access Duration (hours)</h5>
              <form className="mt-2" onSubmit={handleSupportSubmit}>
                <select
                  className="form-select"
                  value={supportHours}
                  onChange={(event) => setSupportHours(Number(event.target.value))}
                >
                  {(privacy.support_duration_options || []).map((hours) => (
                    <option key={hours} value={hours}>
                      {hours} hour{hours !== 1 ? "s" : ""}
                    </option>
                  ))}
                </select>
                <div className="form-text text-secondary">
                  Applies only when support access is enabled.
                </div>
                <div className="form-text text-secondary">
                  Support access is available only in Privacy Lock mode.
                </div>
                <div className="form-check mt-2">
                  <input
                    className="form-check-input"
                    type="checkbox"
                    id="supportAccessEnabled"
                    checked={supportEnabled}
                    onChange={(event) => setSupportEnabled(event.target.checked)}
                  />
                  <label className="form-check-label" htmlFor="supportAccessEnabled">
                    Enable Temporary Support Access
                  </label>
                </div>
                <div className="mt-3">
                  {privacy.support_active ? (
                    <span className="badge bg-success">
                      Active until {privacy.support_access_until}
                      {privacy.support_remaining ? ` (${privacy.support_remaining} left)` : ""}
                    </span>
                  ) : privacy.support_access_until ? (
                    <span className="badge bg-danger">Support access expired</span>
                  ) : (
                    <span className="text-secondary">Support access is disabled.</span>
                  )}
                </div>
                <button className="btn btn-primary mt-3" type="submit">
                  Save Support Access
                </button>
              </form>
            </div>
          </div>
          <div className="col-12 col-lg-6">
            <div className="card p-3 h-100">
              <h5>Screenshot Privacy List</h5>
              <p className="text-secondary mb-2">
                Add URL or app patterns to blur screenshots on sensitive screens.
              </p>
              <div className="alert alert-info py-2">
                Default blur rules apply for user privacy purpose.
                <button
                  type="button"
                  className="btn btn-link p-0 ms-2"
                  onClick={() => setPrivacyRulesModalOpen(true)}
                >
                  Click to View
                </button>
              </div>
              <form onSubmit={handlePrivacyListSubmit}>
                <textarea
                  className="form-control"
                  rows="6"
                  value={ignorePatterns}
                  onChange={(event) => setIgnorePatterns(event.target.value)}
                  placeholder={`https://netbanking*\nhttps://admin.company.com/*\noutlook.office.com/*`}
                />
                <div className="form-text text-secondary">
                  One pattern per line. Use * wildcards. Matches URL, app name, or window title.
                  Prefix with url:, app:, or title: to target one field.
                </div>
                <div className="d-flex flex-wrap gap-2 mt-3">
                  <input
                    type="text"
                    className="form-control"
                    style={{ maxWidth: "260px" }}
                    placeholder="Add website URL"
                    value={privacyUrlInput}
                    onChange={(event) => setPrivacyUrlInput(event.target.value)}
                  />
                  <button className="btn btn-outline-primary" type="button" onClick={handleAddPrivacyUrl}>
                    Add Website URL
                  </button>
                </div>
                <hr className="section-divider my-3" />
                <h6>Additional Keyword Rules</h6>
                <p className="text-secondary mb-2">
                  Add extra keywords for your company. Default rules stay active and cannot be removed.
                </p>
                <textarea
                  className="form-control"
                  rows="5"
                  value={keywordRules}
                  onChange={(event) => setKeywordRules(event.target.value)}
                  placeholder={`netbank\ninternet banking\npayment gateway\nupi`}
                />
                <div className="form-text text-secondary">
                  One keyword per line. Matching happens on URL or window title.
                </div>
                <div className="mt-3">
                  <h6>Auto-Blur Switches</h6>
                  <div className="form-check">
                    <input
                      className="form-check-input"
                      type="checkbox"
                      id="autoBlurPasswordFields"
                      checked={autoBlurPasswordFields}
                      onChange={(event) => setAutoBlurPasswordFields(event.target.checked)}
                    />
                    <label className="form-check-label" htmlFor="autoBlurPasswordFields">
                      Blur when password fields are detected
                    </label>
                  </div>
                  <div className="form-check">
                    <input
                      className="form-check-input"
                      type="checkbox"
                      id="autoBlurOtpFields"
                      checked={autoBlurOtpFields}
                      onChange={(event) => setAutoBlurOtpFields(event.target.checked)}
                    />
                    <label className="form-check-label" htmlFor="autoBlurOtpFields">
                      Blur when OTP fields are detected
                    </label>
                  </div>
                  <div className="form-check">
                    <input
                      className="form-check-input"
                      type="checkbox"
                      id="autoBlurCardFields"
                      checked={autoBlurCardFields}
                      onChange={(event) => setAutoBlurCardFields(event.target.checked)}
                    />
                    <label className="form-check-label" htmlFor="autoBlurCardFields">
                      Blur on card or payment forms
                    </label>
                  </div>
                  <div className="form-check">
                    <input
                      className="form-check-input"
                      type="checkbox"
                      id="autoBlurEmailInbox"
                      checked={autoBlurEmailInbox}
                      onChange={(event) => setAutoBlurEmailInbox(event.target.checked)}
                    />
                    <label className="form-check-label" htmlFor="autoBlurEmailInbox">
                      Blur email inbox views
                    </label>
                  </div>
                </div>
                <div className="d-flex flex-wrap gap-2 mt-3">
                  <button className="btn btn-primary" type="submit">
                    Save Privacy List
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {privacyModal.open ? (
        <div className="modal-overlay" onClick={() => setPrivacyModal({ open: false, message: "" })}>
          <div className="modal-panel" onClick={(event) => event.stopPropagation()}>
            <h5>Privacy List Updated</h5>
            <div className="text-secondary mb-2">{privacyModal.message}</div>
            <div className="d-flex justify-content-end gap-2 mt-3">
              <button
                className="btn btn-primary"
                type="button"
                onClick={() => setPrivacyModal({ open: false, message: "" })}
              >
                OK
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {privacyRulesModalOpen ? (
        <div className="modal-overlay" onClick={() => setPrivacyRulesModalOpen(false)}>
          <div className="modal-panel" onClick={(event) => event.stopPropagation()}>
            <h5>Blur Action Lists</h5>
            <div className="text-secondary mb-3">
              These are the privacy rules applied to blur sensitive screens.
            </div>
            <div className="mb-3">
              <strong>Phase 1: Domain / URL Match (optional)</strong>
              <div className="text-secondary">Examples: admin.company.com/*, myhr.internal/*</div>
            </div>
            <div className="mb-3">
              <strong>Phase 2: Keyword-Based Rules</strong>
              <div className="text-secondary">
                Blur if URL or title contains keywords like: netbank, netbanking, internet banking,
                payment gateway, upi, card payment, account login, sign in, mail inbox, webmail, roundcube.
              </div>
            </div>
            <div className="mb-3">
              <strong>Phase 3: Page Type Detection Rules</strong>
              <div className="text-secondary">
                Blur when we detect password fields, credit card fields, OTP fields, or netbanking forms.
              </div>
            </div>
            <div className="mb-3">
              <strong>Phase 4: Sensitive Page Auto-Detection (Toggle)</strong>
              <div className="text-secondary">
                Admin can enable: blur when password fields exist, blur when OTP field exists,
                blur on card or payment forms, blur email inbox view.
              </div>
            </div>
            <div className="mb-3">
              <strong>Global Keyword Privacy Rules</strong>
              <div className="text-secondary">
                Examples: netbank, internet banking, loan account, credit card payment,
                beneficiary transfer, income tax portal, payslip, salary slip, confidential.
              </div>
            </div>
            <div className="d-flex justify-content-end gap-2 mt-3">
              <button
                className="btn btn-primary"
                type="button"
                onClick={() => setPrivacyRulesModalOpen(false)}
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
