import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { apiFetch } from "../lib/api.js";

const emptyState = {
  loading: true,
  saving: false,
  error: "",
  success: "",
  data: null,
  form: {
    is_active: false,
    aws_region: "us-east-1",
    access_key_id: "",
    secret_access_key: "",
    smtp_username: "",
    smtp_password: "",
    sender_email: "",
    sender_name: "",
    reply_to_email: "",
    configuration_set: ""
  }
};

const awsRegions = [
  "us-east-1",
  "us-east-2",
  "us-west-1",
  "us-west-2",
  "ca-central-1",
  "eu-west-1",
  "eu-west-2",
  "eu-central-1",
  "ap-south-1",
  "ap-northeast-1",
  "ap-northeast-2",
  "ap-southeast-1",
  "ap-southeast-2",
  "sa-east-1"
];

export default function SaasAdminSESSettingsPage() {
  const [state, setState] = useState(emptyState);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const data = await apiFetch("/api/saas-admin/settings/ses");
        if (!active) return;
        setState((prev) => ({
          ...prev,
          loading: false,
          error: "",
          data,
          form: {
            is_active: Boolean(data?.is_active),
            aws_region: data?.aws_region || "us-east-1",
            access_key_id: data?.access_key_id || "",
            secret_access_key: data?.secret_access_key || "",
            smtp_username: data?.smtp_username || "",
            smtp_password: "",
            sender_email: data?.sender_email || "",
            sender_name: data?.sender_name || "",
            reply_to_email: data?.reply_to_email || "",
            configuration_set: data?.configuration_set || ""
          }
        }));
      } catch (error) {
        if (!active) return;
        setState((prev) => ({
          ...prev,
          loading: false,
          error: error?.message || "Unable to load Amazon SES settings."
        }));
      }
    };

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
        aws_region: state.form.aws_region,
        access_key_id: state.form.access_key_id,
        secret_access_key: state.form.secret_access_key,
        smtp_username: state.form.smtp_username,
        smtp_password: state.form.smtp_password,
        sender_email: state.form.sender_email,
        sender_name: state.form.sender_name,
        reply_to_email: state.form.reply_to_email,
        configuration_set: state.form.configuration_set
      };
      const data = await apiFetch("/api/saas-admin/settings/ses", {
        method: "PUT",
        body: JSON.stringify(payload)
      });
      setState((prev) => ({
        ...prev,
        saving: false,
        success: "Amazon SES settings saved.",
        data,
        form: {
          ...prev.form,
          access_key_id: data?.access_key_id || "",
          secret_access_key: data?.secret_access_key || "",
          smtp_password: "",
          is_active: Boolean(data?.is_active),
          aws_region: data?.aws_region || prev.form.aws_region,
          smtp_username: data?.smtp_username || prev.form.smtp_username,
          sender_email: data?.sender_email || prev.form.sender_email,
          sender_name: data?.sender_name || prev.form.sender_name,
          reply_to_email: data?.reply_to_email || prev.form.reply_to_email,
          configuration_set: data?.configuration_set || prev.form.configuration_set
        }
      }));
    } catch (error) {
      setState((prev) => ({
        ...prev,
        saving: false,
        error: error?.message || "Unable to save Amazon SES settings."
      }));
    }
  };

  if (state.loading) {
    return (
      <div className="card p-4 text-center">
        <div className="spinner" />
        <p className="mb-0">Loading Amazon SES settings...</p>
      </div>
    );
  }

  return (
    <div className="page-shell">
      <div className="card p-4">
        <div className="d-flex align-items-start justify-content-between gap-2 flex-wrap">
          <div>
            <h3 className="mb-1">Amazon SES</h3>
            <p className="text-secondary mb-0">
              Configure Amazon Simple Email Service for outgoing application mails.
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

          <div className="col-12 col-md-3">
            <label className="form-label">AWS Region</label>
            <select
              className="form-select"
              value={state.form.aws_region}
              onChange={onChange("aws_region")}
            >
              {awsRegions.map((region) => (
                <option value={region} key={region}>{region}</option>
              ))}
            </select>
          </div>

          <div className="col-12 col-md-6">
            <label className="form-label">AWS Access Key ID</label>
            <input
              type="text"
              className="form-control"
              value={state.form.access_key_id}
              onChange={onChange("access_key_id")}
              placeholder="AKIA..."
              autoComplete="off"
            />
          </div>

          <div className="col-12 col-md-6">
            <label className="form-label">AWS Secret Access Key</label>
            <input
              type="text"
              className="form-control"
              value={state.form.secret_access_key}
              onChange={onChange("secret_access_key")}
              placeholder="Your AWS secret"
              autoComplete="new-password"
            />
          </div>

          <div className="col-12 col-md-6">
            <label className="form-label">SMTP Username</label>
            <input
              type="text"
              className="form-control"
              value={state.form.smtp_username}
              onChange={onChange("smtp_username")}
              placeholder="Optional SMTP username"
            />
          </div>

          <div className="col-12 col-md-6">
            <label className="form-label">SMTP Password</label>
            <input
              type="password"
              className="form-control"
              value={state.form.smtp_password}
              onChange={onChange("smtp_password")}
              placeholder={state.data?.has_smtp_password ? "Leave blank to keep existing password" : "Optional SMTP password"}
              autoComplete="new-password"
            />
          </div>

          <div className="col-12 col-md-6">
            <label className="form-label">Sender Email</label>
            <input
              type="email"
              className="form-control"
              value={state.form.sender_email}
              onChange={onChange("sender_email")}
              placeholder="noreply@yourdomain.com"
            />
          </div>

          <div className="col-12 col-md-6">
            <label className="form-label">Sender Name</label>
            <input
              type="text"
              className="form-control"
              value={state.form.sender_name}
              onChange={onChange("sender_name")}
              placeholder="Work Zilla"
            />
          </div>

          <div className="col-12 col-md-6">
            <label className="form-label">Reply-To Email</label>
            <input
              type="email"
              className="form-control"
              value={state.form.reply_to_email}
              onChange={onChange("reply_to_email")}
              placeholder="support@yourdomain.com"
            />
          </div>

          <div className="col-12 col-md-6">
            <label className="form-label">Configuration Set (Optional)</label>
            <input
              type="text"
              className="form-control"
              value={state.form.configuration_set}
              onChange={onChange("configuration_set")}
              placeholder="ses-events"
            />
          </div>
        </div>

        <div className="mt-3">
          <button
            type="button"
            className="btn btn-primary"
            onClick={onSave}
            disabled={state.saving}
          >
            {state.saving ? "Saving..." : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
