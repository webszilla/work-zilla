import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { apiFetch } from "../lib/api.js";

const emptyState = {
  loading: true,
  saving: false,
  error: "",
  success: "",
  data: null,
  notificationCatalog: { admin: [], user: [] },
  form: {
    is_active: false,
    phone_number_id: "",
    access_token: "",
    admin_phone: "",
    notify_admin_new_user: true,
    notify_user_welcome: true,
    notification_toggles: { admin: {}, user: {} },
    admin_template_name: "new_user_admin_alert",
    user_welcome_template_name: "welcome_user_signup",
    template_language: "en_US",
    graph_api_version: "v21.0",
    timeout_seconds: 15
  }
};

const ADMIN_NEW_USER_NOTIFICATION_KEY = "admin_new_user_registration_alert";
const USER_WELCOME_NOTIFICATION_KEY = "user_welcome_message";

function formatApiError(error, fallback) {
  const data = error?.data;
  if (data && typeof data === "object" && !Array.isArray(data)) {
    const parts = Object.entries(data)
      .map(([key, value]) => {
        if (Array.isArray(value)) {
          return `${key}: ${value.join(", ")}`;
        }
        if (typeof value === "string") {
          return `${key}: ${value}`;
        }
        return null;
      })
      .filter(Boolean);
    if (parts.length) {
      return parts.join(" | ");
    }
  }
  return error?.message || fallback;
}

export default function SaasAdminWhatsAppSettingsPage() {
  const [state, setState] = useState(emptyState);

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const data = await apiFetch("/api/saas-admin/settings/whatsapp-cloud");
        if (!active) return;
        setState((prev) => ({
          ...prev,
          loading: false,
          data,
          error: "",
          form: {
            is_active: Boolean(data?.is_active),
            phone_number_id: data?.phone_number_id || "",
            access_token: "",
            admin_phone: data?.admin_phone || "",
            notify_admin_new_user: Boolean(data?.notify_admin_new_user ?? true),
            notify_user_welcome: Boolean(data?.notify_user_welcome ?? true),
            notification_toggles: {
              admin: { ...(data?.notification_toggles?.admin || {}) },
              user: { ...(data?.notification_toggles?.user || {}) },
            },
            admin_template_name: data?.admin_template_name || "new_user_admin_alert",
            user_welcome_template_name: data?.user_welcome_template_name || "welcome_user_signup",
            template_language: data?.template_language || "en_US",
            graph_api_version: data?.graph_api_version || "v21.0",
            timeout_seconds: Number(data?.timeout_seconds || 15),
          },
          notificationCatalog: {
            admin: Array.isArray(data?.notification_catalog?.admin) ? data.notification_catalog.admin : [],
            user: Array.isArray(data?.notification_catalog?.user) ? data.notification_catalog.user : [],
          },
        }));
      } catch (error) {
        if (!active) return;
        setState((prev) => ({
          ...prev,
          loading: false,
          error: error?.message || "Unable to load WhatsApp Cloud settings."
        }));
      }
    }
    load();
    return () => {
      active = false;
    };
  }, []);

  const onChange = (key) => (event) => {
    const value = key === "is_active" ? event.target.checked : event.target.value;
    setState((prev) => ({
      ...prev,
      error: "",
      success: "",
      form: { ...prev.form, [key]: value }
    }));
  };

  const onSave = async () => {
    setState((prev) => ({ ...prev, saving: true, error: "", success: "" }));
    try {
      const payload = {
        is_active: Boolean(state.form.is_active),
        phone_number_id: state.form.phone_number_id,
        access_token: state.form.access_token,
        admin_phone: state.form.admin_phone,
        notify_admin_new_user: Boolean(state.form.notify_admin_new_user),
        notify_user_welcome: Boolean(state.form.notify_user_welcome),
        notification_toggles: {
          admin: { ...(state.form.notification_toggles?.admin || {}) },
          user: { ...(state.form.notification_toggles?.user || {}) },
        },
        admin_template_name: state.form.admin_template_name,
        user_welcome_template_name: state.form.user_welcome_template_name,
        template_language: state.form.template_language,
        graph_api_version: state.form.graph_api_version,
        timeout_seconds: Number(state.form.timeout_seconds || 15),
      };
      const data = await apiFetch("/api/saas-admin/settings/whatsapp-cloud", {
        method: "PUT",
        body: JSON.stringify(payload),
      });
      setState((prev) => ({
        ...prev,
        saving: false,
        success: "WhatsApp Cloud API settings saved.",
        data,
        form: {
          ...prev.form,
          access_token: "",
          is_active: Boolean(data?.is_active),
          phone_number_id: data?.phone_number_id || "",
          admin_phone: data?.admin_phone || "",
          notify_admin_new_user: Boolean(data?.notify_admin_new_user ?? prev.form.notify_admin_new_user),
          notify_user_welcome: Boolean(data?.notify_user_welcome ?? prev.form.notify_user_welcome),
          notification_toggles: {
            admin: { ...(data?.notification_toggles?.admin || prev.form.notification_toggles?.admin || {}) },
            user: { ...(data?.notification_toggles?.user || prev.form.notification_toggles?.user || {}) },
          },
          admin_template_name: data?.admin_template_name || prev.form.admin_template_name,
          user_welcome_template_name: data?.user_welcome_template_name || prev.form.user_welcome_template_name,
          template_language: data?.template_language || prev.form.template_language,
          graph_api_version: data?.graph_api_version || prev.form.graph_api_version,
          timeout_seconds: Number(data?.timeout_seconds || prev.form.timeout_seconds || 15),
        }
      }));
    } catch (error) {
      setState((prev) => ({
        ...prev,
        saving: false,
        error: formatApiError(error, "Unable to save WhatsApp Cloud settings.")
      }));
    }
  };

  const toggleNotification = (section, key) => {
    setState((prev) => ({
      ...prev,
      error: "",
      success: "",
      form: {
        ...prev.form,
        notification_toggles: {
          ...(prev.form.notification_toggles || {}),
          [section]: {
            ...((prev.form.notification_toggles && prev.form.notification_toggles[section]) || {}),
            [key]: !Boolean(prev.form.notification_toggles?.[section]?.[key]),
          },
        },
        notify_admin_new_user:
          key === ADMIN_NEW_USER_NOTIFICATION_KEY
            ? !Boolean(prev.form.notification_toggles?.admin?.[ADMIN_NEW_USER_NOTIFICATION_KEY])
            : prev.form.notify_admin_new_user,
        notify_user_welcome:
          key === USER_WELCOME_NOTIFICATION_KEY
            ? !Boolean(prev.form.notification_toggles?.user?.[USER_WELCOME_NOTIFICATION_KEY])
            : prev.form.notify_user_welcome,
      }
    }));
  };

  if (state.loading) {
    return (
      <div className="card p-4 text-center">
        <div className="spinner" />
        <p className="mb-0">Loading WhatsApp Cloud settings...</p>
      </div>
    );
  }

  return (
    <div className="page-shell">
      <div className="card p-4">
        <div className="d-flex align-items-start justify-content-between gap-2 flex-wrap">
          <div>
            <h3 className="mb-1">WhatsApp Cloud API</h3>
            <p className="text-secondary mb-0">
              Configure Meta WhatsApp Cloud API for signup admin alerts and user welcome messages.
            </p>
            {state.data?.updated_at ? (
              <div className="text-secondary small mt-2">Last updated: {state.data.updated_at}</div>
            ) : null}
          </div>
          <Link to="/saas-admin" className="btn btn-outline-light btn-sm">
            Back to Overview
          </Link>
        </div>

        {state.error ? <div className="alert alert-danger mt-3">{state.error}</div> : null}
        {state.success ? <div className="alert alert-success mt-3">{state.success}</div> : null}

        <div className="row g-3 mt-2">
          <div className="col-12 col-md-3">
            <label className="form-label">Enable Integration</label>
            <div className="form-check form-switch mt-2">
              <input
                type="checkbox"
                className="form-check-input"
                checked={Boolean(state.form.is_active)}
                onChange={onChange("is_active")}
              />
              <label className="form-check-label">
                {state.form.is_active ? "Active" : "Inactive"}
              </label>
            </div>
          </div>

          <div className="col-12 col-md-5">
            <label className="form-label">WhatsApp Phone Number ID</label>
            <input
              type="text"
              className="form-control"
              value={state.form.phone_number_id}
              onChange={onChange("phone_number_id")}
              placeholder="999319036601668"
            />
          </div>

          <div className="col-12 col-md-4">
            <label className="form-label">Admin WhatsApp Number</label>
            <input
              type="text"
              className="form-control"
              value={state.form.admin_phone}
              onChange={onChange("admin_phone")}
              placeholder="9198XXXXXXXX"
            />
            <div className="text-secondary small mt-1">
              Use international format digits (without `+` also okay).
            </div>
          </div>

          <div className="col-12">
            <label className="form-label">Access Token</label>
            <input
              type="password"
              className="form-control"
              value={state.form.access_token}
              onChange={onChange("access_token")}
              placeholder={
                state.data?.has_access_token
                  ? `Leave blank to keep existing token (${state.data.access_token_masked})`
                  : "Paste Meta WhatsApp Cloud access token"
              }
            />
          </div>

          <div className="col-12 col-md-4">
            <label className="form-label">Template Language</label>
            <input
              type="text"
              className="form-control"
              value={state.form.template_language}
              onChange={onChange("template_language")}
              placeholder="en_US"
            />
          </div>

          <div className="col-12 col-md-4">
            <label className="form-label">Graph API Version</label>
            <input
              type="text"
              className="form-control"
              value={state.form.graph_api_version}
              onChange={onChange("graph_api_version")}
              placeholder="v21.0"
            />
          </div>

          <div className="col-12 col-md-4">
            <label className="form-label">HTTP Timeout (sec)</label>
            <input
              type="number"
              className="form-control"
              min="5"
              max="60"
              value={state.form.timeout_seconds}
              onChange={onChange("timeout_seconds")}
            />
          </div>
        </div>

      </div>

      <div className="mt-4">
        <h4 className="mb-2">WhatsApp Notification Features</h4>
        <div className="text-secondary small mb-3">
          Like Email Notifications, choose which WhatsApp notifications should be sent.
        </div>
        <div className="row g-4">
          <div className="col-12 col-xl-6">
            <h6 className="mb-2">Admin Notifications</h6>
            <div className="table-responsive">
              <table className="table table-dark table-hover align-middle">
                <thead>
                  <tr>
                    <th>Title</th>
                    <th className="text-end">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {(state.notificationCatalog.admin || []).map((item) => {
                    const enabled = Boolean(state.form.notification_toggles?.admin?.[item.key]);
                    return (
                      <tr key={item.key}>
                        <td>{item.title}</td>
                        <td className="text-end">
                          <div className="d-inline-flex align-items-center gap-2">
                            <span className="small text-secondary">{enabled ? "On" : "Off"}</span>
                            <div className="form-check form-switch mb-0">
                              <input
                                type="checkbox"
                                className="form-check-input"
                                checked={enabled}
                                onChange={() => toggleNotification("admin", item.key)}
                                aria-label={`Toggle ${item.title} notification`}
                              />
                            </div>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div className="col-12 col-xl-6">
            <h6 className="mb-2">User Notifications</h6>
            <div className="table-responsive">
              <table className="table table-dark table-hover align-middle">
                <thead>
                  <tr>
                    <th>Title</th>
                    <th className="text-end">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {(state.notificationCatalog.user || []).map((item) => {
                    const enabled = Boolean(state.form.notification_toggles?.user?.[item.key]);
                    return (
                      <tr key={item.key}>
                        <td>{item.title}</td>
                        <td className="text-end">
                          <div className="d-inline-flex align-items-center gap-2">
                            <span className="small text-secondary">{enabled ? "On" : "Off"}</span>
                            <div className="form-check form-switch mb-0">
                              <input
                                type="checkbox"
                                className="form-check-input"
                                checked={enabled}
                                onChange={() => toggleNotification("user", item.key)}
                                aria-label={`Toggle ${item.title} notification`}
                              />
                            </div>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div className="d-flex gap-2 mt-3">
          <button
            type="button"
            className="btn btn-primary"
            onClick={onSave}
            disabled={state.saving}
          >
            {state.saving ? "Saving..." : "Save WhatsApp Settings"}
          </button>
          <Link to="/saas-admin" className="btn btn-outline-light">
            Cancel
          </Link>
        </div>
      </div>
    </div>
  );
}
