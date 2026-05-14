import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  fetchAiArchitectSettings,
  fetchAiArchitectUsage,
  saveAiArchitectSettings,
  testAiArchitectConnection
} from "../lib/saasAdminAiArchitectApi.js";

const MIN_TOKENS = 300;
const DEFAULT_TOKENS = 900;
const MAX_TOKENS = 3000;

const defaultScopes = {
  code_structure_read: true,
  django_models_read: true,
  database_schema_read: true,
  error_logs_read: false,
  business_metrics_read: true
};

const responseModes = [
  { key: "quick", label: "Quick Answer", tokens: 500 },
  { key: "standard", label: "Standard Analysis", tokens: 900 },
  { key: "deep", label: "Deep Analysis", tokens: 1800 }
];

const emptyState = {
  loading: true,
  saving: false,
  testing: false,
  error: "",
  success: "",
  testResult: "",
  usage: null,
  data: null,
  editingApiKey: false,
  form: {
    provider: "openai",
    enabled: false,
    response_mode: "standard",
    api_key: "",
    openai_organization_id: "",
    openai_project_id: "",
    model_name: "gpt-4o-mini",
    max_tokens: DEFAULT_TOKENS,
    monthly_budget_inr: 5000,
    warning_threshold_percent: 80,
    hard_stop_enabled: true,
    allow_error_logs_read: false,
    allowed_scopes: { ...defaultScopes }
  }
};

function normalizeScopes(scopes) {
  if (!scopes || typeof scopes !== "object") {
    return { ...defaultScopes };
  }
  return {
    code_structure_read: scopes.code_structure_read !== false,
    django_models_read: scopes.django_models_read !== false,
    database_schema_read: scopes.database_schema_read !== false,
    error_logs_read: Boolean(scopes.error_logs_read),
    business_metrics_read: scopes.business_metrics_read !== false
  };
}

export default function SaasAdminAIArchitectSettingsPage() {
  const [state, setState] = useState(emptyState);
  const apiKeyRef = useRef(null);

  const maskedKey = useMemo(() => String(state.data?.api_key_masked || "").trim(), [state.data]);
  const hasSavedKey = useMemo(() => Boolean(state.data?.has_api_key), [state.data]);
  const backendBuild = useMemo(() => String(state.data?.backend_build || "").trim(), [state.data]);
  const savedKeyKind = useMemo(() => String(state.data?.api_key_kind || "").trim(), [state.data]);
  const savedKeyFingerprint = useMemo(() => String(state.data?.api_key_fingerprint || "").trim(), [state.data]);
  const savedKeyLen = useMemo(() => Number(state.data?.api_key_len || 0), [state.data]);
  const maskedKeyDisplay = useMemo(() => {
    if (!maskedKey) return "";
    const tail = maskedKey.startsWith("sk-****") ? maskedKey.slice("sk-****".length) : maskedKey.slice(-4);
    return `********${tail}`;
  }, [maskedKey]);

  const showMaskedKeyInInput = hasSavedKey && !state.editingApiKey && !String(state.form.api_key || "");
  const typedKeyLooksMasked = useMemo(() => {
    const raw = String(state.form.api_key || "").trim();
    return raw.startsWith("********") || raw.startsWith("sk-****");
  }, [state.form.api_key]);

  const isProjectScopedKey = useMemo(() => {
    const raw = String(state.form.api_key || "").trim();
    return raw.startsWith("sk-proj-") || raw.startsWith("sk-svcacct-");
  }, [state.form.api_key]);

  const isProjectScopedEffective = isProjectScopedKey || savedKeyKind === "project_scoped";

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const [data, usageResp] = await Promise.all([
          fetchAiArchitectSettings(),
          fetchAiArchitectUsage().catch(() => null)
        ]);
        if (!active) return;
        setState((prev) => ({
          ...prev,
          loading: false,
          error: "",
          data,
          usage: usageResp?.usage || null,
          editingApiKey: false,
          form: {
            provider: data?.provider || "openai",
            enabled: Boolean(data?.enabled),
            response_mode: data?.response_mode || "standard",
            api_key: "",
            openai_organization_id: data?.openai_organization_id || "",
            openai_project_id: data?.openai_project_id || "",
            model_name: data?.model_name || "gpt-4o-mini",
            max_tokens: Number(data?.max_tokens || DEFAULT_TOKENS),
            monthly_budget_inr: Number(data?.monthly_budget_inr || 5000),
            warning_threshold_percent: Number(data?.warning_threshold_percent || 80),
            hard_stop_enabled: data?.hard_stop_enabled !== false,
            allow_error_logs_read: Boolean(data?.allow_error_logs_read),
            allowed_scopes: normalizeScopes(data?.allowed_scopes)
          }
        }));
      } catch (error) {
        if (!active) return;
        setState((prev) => ({
          ...prev,
          loading: false,
          error: error?.message || "Unable to load AI Architect settings."
        }));
      }
    };
    load();
    return () => {
      active = false;
    };
  }, []);

  const onChange = (key) => (event) => {
    const value = key === "enabled" ? event.target.checked : event.target.value;
    setState((prev) => ({
      ...prev,
      error: "",
      success: "",
      testResult: "",
      form: { ...prev.form, [key]: value }
    }));
  };

  const onNumberChange = (key) => (event) => {
    const raw = event.target.value;
    setState((prev) => ({
      ...prev,
      error: "",
      success: "",
      testResult: "",
      form: { ...prev.form, [key]: raw }
    }));
  };

  const clampMaxTokens = (value) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return DEFAULT_TOKENS;
    if (parsed < MIN_TOKENS) return MIN_TOKENS;
    if (parsed > MAX_TOKENS) return MAX_TOKENS;
    return Math.round(parsed);
  };

  const onResponseModeChange = (event) => {
    const mode = String(event.target.value || "standard");
    const modeConfig = responseModes.find((item) => item.key === mode) || responseModes[1];
    setState((prev) => ({
      ...prev,
      error: "",
      success: "",
      testResult: "",
      form: {
        ...prev.form,
        response_mode: modeConfig.key,
        max_tokens: modeConfig.tokens
      }
    }));
  };

  const onScopeToggle = (key) => (event) => {
    const next = Boolean(event.target.checked);
    setState((prev) => ({
      ...prev,
      error: "",
      success: "",
      testResult: "",
      form: {
        ...prev.form,
        allowed_scopes: { ...prev.form.allowed_scopes, [key]: next }
      }
    }));
  };

  const onAllowErrorLogsToggle = (event) => {
    const next = Boolean(event.target.checked);
    setState((prev) => ({
      ...prev,
      error: "",
      success: "",
      testResult: "",
      form: {
        ...prev.form,
        allow_error_logs_read: next,
        allowed_scopes: {
          ...prev.form.allowed_scopes,
          error_logs_read: next ? prev.form.allowed_scopes.error_logs_read : false
        }
      }
    }));
  };

  const onSave = async () => {
    setState((prev) => ({ ...prev, saving: true, error: "", success: "", testResult: "" }));
    try {
      const apiKeyValue = showMaskedKeyInInput
        ? ""
        : String(apiKeyRef.current?.value || state.form.api_key || "").trim();
      if (!apiKeyValue && !hasSavedKey) {
        setState((prev) => ({
          ...prev,
          saving: false,
          error: "API key is required for first-time setup."
        }));
        return;
      }
      if (typedKeyLooksMasked) {
        setState((prev) => ({
          ...prev,
          saving: false,
          error: "Please paste the full API key (masked value cannot be saved)."
        }));
        return;
      }
      const maxTokensValue = state.form.max_tokens === "" || state.form.max_tokens === null
        ? DEFAULT_TOKENS
        : clampMaxTokens(state.form.max_tokens);
      const payload = {
        provider: "openai",
        enabled: Boolean(state.form.enabled),
        response_mode: String(state.form.response_mode || "standard"),
        api_key: apiKeyValue,
        openai_organization_id: String(state.form.openai_organization_id || "").trim(),
        openai_project_id: String(state.form.openai_project_id || "").trim(),
        model_name: String(state.form.model_name || "gpt-4o-mini").trim(),
        max_tokens: maxTokensValue,
        monthly_budget_inr: Number(state.form.monthly_budget_inr || 5000),
        warning_threshold_percent: Number(state.form.warning_threshold_percent || 80),
        hard_stop_enabled: state.form.hard_stop_enabled !== false,
        allow_error_logs_read: Boolean(state.form.allow_error_logs_read),
        allowed_scopes: normalizeScopes(state.form.allowed_scopes)
      };
      await saveAiArchitectSettings(payload);
      const [refreshed, usageResp] = await Promise.all([
        fetchAiArchitectSettings(),
        fetchAiArchitectUsage().catch(() => null)
      ]);
      setState((prev) => ({
        ...prev,
        saving: false,
        success: "AI Architect settings saved.",
        data: refreshed,
        usage: usageResp?.usage || prev.usage,
        editingApiKey: false,
        form: { ...prev.form, api_key: "" }
      }));
    } catch (error) {
      const serverMessage = String(error?.data?.message || "").trim();
      const fallback = String(error?.message || "").trim();
      let normalized = serverMessage || fallback || "Unable to save AI Architect settings.";
      if (normalized.startsWith("{") && normalized.includes("\"message\"")) {
        try {
          const parsed = JSON.parse(normalized);
          normalized = parsed?.error?.message || parsed?.message || normalized;
        } catch {
          // ignore
        }
      }
      setState((prev) => ({
        ...prev,
        saving: false,
        error: normalized
      }));
    }
  };

  const onTest = async () => {
    setState((prev) => ({ ...prev, testing: true, error: "", success: "", testResult: "" }));
    try {
      const payload = {};
      const apiKey = String(state.form.api_key || "").trim();
      if (apiKey) {
        payload.api_key = apiKey;
      } else if (!hasSavedKey) {
        setState((prev) => ({
          ...prev,
          testing: false,
          error: "Please enter API key or save it first."
        }));
        return;
      }
      const result = await testAiArchitectConnection(payload);
      const message = result?.ok
        ? "Connection OK."
        : `Connection failed (status ${result?.status_code || "?"}).`;
      setState((prev) => ({
        ...prev,
        testing: false,
        testResult: message
      }));
    } catch (error) {
      const serverMessage = String(error?.data?.message || "").trim();
      const fallback = String(error?.message || "").trim();
      let normalized = serverMessage || fallback || "Unable to test AI connection.";
      if (normalized.startsWith("{") && normalized.includes("\"message\"")) {
        try {
          const parsed = JSON.parse(normalized);
          normalized = parsed?.error?.message || parsed?.message || normalized;
        } catch {
          // ignore
        }
      }
      setState((prev) => ({
        ...prev,
        testing: false,
        error: normalized
      }));
    }
  };

  const usage = state.usage;
  const monthCost = Number(usage?.month_cost_inr || 0);
  const monthBudget = Number(usage?.monthly_budget_inr || state.form.monthly_budget_inr || 5000);
  const remaining = Number(usage?.remaining_inr || Math.max(0, monthBudget - monthCost));
  const resetDate = String(usage?.billing_cycle_reset_date || "");

  if (state.loading) {
    return (
      <div className="card p-4 text-center">
        <div className="spinner" />
        <p className="mb-0">Loading AI Architect settings...</p>
      </div>
    );
  }

  return (
    <div className="page-shell">
      <div className="card p-4">
        <div className="d-flex align-items-start justify-content-between gap-2 flex-wrap">
          <div>
            <h3 className="mb-1">AI Architect Settings</h3>
            <p className="text-secondary mb-0">
              Configure the SaaS Admin-only read-only AI Architect assistant.
            </p>
            {maskedKey ? (
              <div className="text-secondary small mt-2">Saved API key: {maskedKey}</div>
            ) : (
              <div className="text-secondary small mt-2">Saved API key: Not configured</div>
            )}
            {backendBuild ? (
              <div className="text-secondary small mt-1">Backend build: {backendBuild}</div>
            ) : null}
            {hasSavedKey && savedKeyFingerprint ? (
              <div className="text-secondary small mt-1">
                Saved key fingerprint: {savedKeyFingerprint} ({savedKeyLen} chars)
              </div>
            ) : null}
          </div>
          <Link to="/saas-admin" className="btn btn-outline-light btn-sm">
            Back to Overview
          </Link>
        </div>

        {state.error ? <div className="alert alert-danger mt-3">{state.error}</div> : null}
        {state.success ? <div className="alert alert-success mt-3">{state.success}</div> : null}
        {state.testResult ? <div className="alert alert-info mt-3 mb-0">{state.testResult}</div> : null}

        <div className="row g-3 mt-2">
          <div className="col-12 col-md-2">
            <label className="form-label">Enable AI Architect</label>
            <div className="form-check form-switch mt-2">
              <input
                type="checkbox"
                className="form-check-input"
                checked={Boolean(state.form.enabled)}
                onChange={onChange("enabled")}
              />
              <label className="form-check-label">
                {state.form.enabled ? "Enabled" : "Disabled"}
              </label>
            </div>
          </div>

          <div className="col-12 col-md-2">
            <label className="form-label">Provider</label>
            <input type="text" className="form-control" value="OpenAI" disabled />
          </div>

          <div className="col-12 col-md-2">
            <label className="form-label">Model Name</label>
            <input
              type="text"
              className="form-control"
              value={state.form.model_name}
              onChange={onChange("model_name")}
              placeholder="gpt-4o-mini"
              autoComplete="off"
            />
          </div>

          <div className="col-12 col-md-3">
            <label className="form-label">OpenAI Organization ID (optional)</label>
            <input
              type="text"
              className="form-control"
              value={state.form.openai_organization_id}
              onChange={onChange("openai_organization_id")}
              placeholder="org_..."
              autoComplete="off"
            />
            <div className="form-text text-secondary">
              Only required if this API key belongs to a different OpenAI organization than the default.
            </div>
          </div>

          <div className="col-12 col-md-3">
            <label className="form-label">OpenAI Project ID (optional)</label>
            <input
              type="text"
              className="form-control"
              value={state.form.openai_project_id}
              onChange={onChange("openai_project_id")}
              placeholder="proj_..."
              autoComplete="off"
            />
            <div className="form-text text-secondary">
              If you are using a project-scoped key (`sk-proj-...` / `sk-svcacct-...`) and authentication fails, set the project id here.
            </div>
            {isProjectScopedEffective && !String(state.form.openai_project_id || "").trim() ? (
              <div className="form-text text-danger">
                This looks like a project-scoped key. Paste your Project ID (`proj_...`) to avoid 401 errors.
              </div>
            ) : null}
          </div>

          <div className="col-12 col-md-3">
            <label className="form-label">Response Mode</label>
            <select className="form-select" value={state.form.response_mode} onChange={onResponseModeChange}>
              {responseModes.map((mode) => (
                <option value={mode.key} key={mode.key}>
                  {mode.label} — {mode.tokens} tokens
                </option>
              ))}
            </select>
          </div>

          <div className="col-12 col-md-9">
            <label className="form-label mb-2">API Key</label>
            <div className="d-flex gap-2 align-items-start">
              <div className="flex-grow-1">
                <input
                  type="password"
                  className="form-control"
                  value={showMaskedKeyInInput ? maskedKeyDisplay : state.form.api_key}
                  onChange={onChange("api_key")}
                  disabled={showMaskedKeyInInput}
                  placeholder={maskedKey ? "Paste new key to replace saved key" : "sk-..."}
                  autoComplete="new-password"
                  ref={apiKeyRef}
                  maxLength={180}
                />
                <div className="form-text text-secondary">
                  API key is encrypted in DB and never returned to the frontend after saving.
                </div>
                {!showMaskedKeyInInput && String(state.form.api_key || "").trim() ? (
                  <div className="form-text text-secondary">
                    Entered key length: {String(state.form.api_key || "").trim().length}
                  </div>
                ) : null}
                {hasSavedKey && showMaskedKeyInInput ? (
                  <div className="form-text text-secondary">Saved key will be used for Test/Chat. Click Change to replace.</div>
                ) : null}
              </div>
              <div className="d-flex flex-column align-items-end justify-content-start">
                {hasSavedKey && showMaskedKeyInInput ? (
                  <button
                    type="button"
                    className="btn btn-outline-light btn-sm"
                    onClick={() =>
                      setState((prev) => ({
                        ...prev,
                        editingApiKey: true,
                        form: { ...prev.form, api_key: "" }
                      }))
                    }
                  >
                    Change
                  </button>
                ) : null}
              </div>
            </div>
          </div>

          <div className="col-12 col-md-3">
            <label className="form-label">Max Tokens</label>
            <input
              type="number"
              className="form-control"
              value={state.form.max_tokens}
              onChange={onNumberChange("max_tokens")}
              min={MIN_TOKENS}
              max={MAX_TOKENS}
            />
            <div className="form-text text-secondary">
              Max Tokens controls the maximum AI response length. Higher value gives longer analysis but increases API cost.
              Recommended: {MIN_TOKENS}–{MAX_TOKENS} (default {DEFAULT_TOKENS}).
            </div>
          </div>

          <div className="col-12 col-md-9">
            <label className="form-label">Allowed Analysis Scope</label>
            <div className="border rounded p-2">
              <div className="row g-2">
                <div className="col-12 col-md-3">
                  <div className="form-check">
                    <input
                      className="form-check-input"
                      type="checkbox"
                      checked={Boolean(state.form.allowed_scopes.code_structure_read)}
                      onChange={onScopeToggle("code_structure_read")}
                      id="ai-scope-code"
                    />
                    <label className="form-check-label" htmlFor="ai-scope-code">
                      Code structure read
                    </label>
                  </div>
                </div>
                <div className="col-12 col-md-3">
                  <div className="form-check">
                    <input
                      className="form-check-input"
                      type="checkbox"
                      checked={Boolean(state.form.allowed_scopes.django_models_read)}
                      onChange={onScopeToggle("django_models_read")}
                      id="ai-scope-models"
                    />
                    <label className="form-check-label" htmlFor="ai-scope-models">
                      Django models read
                    </label>
                  </div>
                </div>
                <div className="col-12 col-md-3">
                  <div className="form-check">
                    <input
                      className="form-check-input"
                      type="checkbox"
                      checked={Boolean(state.form.allowed_scopes.database_schema_read)}
                      onChange={onScopeToggle("database_schema_read")}
                      id="ai-scope-schema"
                    />
                    <label className="form-check-label" htmlFor="ai-scope-schema">
                      Database schema read
                    </label>
                  </div>
                </div>
                <div className="col-12 col-md-3">
                  <div className="form-check">
                    <input
                      className="form-check-input"
                      type="checkbox"
                      checked={Boolean(state.form.allow_error_logs_read)}
                      onChange={onAllowErrorLogsToggle}
                      id="ai-allow-logs"
                    />
                    <label className="form-check-label" htmlFor="ai-allow-logs">
                      Error logs read
                    </label>
                  </div>
                </div>
                <div className="col-12">
                  <div className="form-check mt-1">
                    <input
                      className="form-check-input"
                      type="checkbox"
                      checked={Boolean(state.form.allowed_scopes.business_metrics_read)}
                      onChange={onScopeToggle("business_metrics_read")}
                      id="ai-scope-metrics"
                    />
                    <label className="form-check-label" htmlFor="ai-scope-metrics">
                      Business metrics read (SaaS totals only)
                    </label>
                  </div>
                  <div className="small text-secondary">
                    Allows the assistant to answer questions like “this month sales” using aggregated totals (no PII).
                  </div>
                </div>
                <div className="col-12">
                  <div className="small text-secondary">
                    Error logs may contain sensitive data. Logs will be masked and limited before AI analysis.
                  </div>
                  {state.form.allow_error_logs_read ? (
                    <div className="form-check mt-2">
                      <input
                        className="form-check-input"
                        type="checkbox"
                        checked={Boolean(state.form.allowed_scopes.error_logs_read)}
                        onChange={onScopeToggle("error_logs_read")}
                        id="ai-scope-logs"
                      />
                      <label className="form-check-label" htmlFor="ai-scope-logs">
                        Include masked log tail in AI context
                      </label>
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          </div>
        </div>

        <hr className="my-4" />

        <h5 className="mb-2">Monthly AI Budget</h5>
        <div className="row g-3 align-items-end">
          <div className="col-12 col-md-3">
            <label className="form-label">Monthly Budget Limit (INR)</label>
            <input
              type="number"
              className="form-control"
              value={state.form.monthly_budget_inr}
              onChange={onNumberChange("monthly_budget_inr")}
              min={0}
            />
          </div>
          <div className="col-12 col-md-2">
            <label className="form-label">Warning Threshold %</label>
            <input
              type="number"
              className="form-control"
              value={state.form.warning_threshold_percent}
              onChange={onNumberChange("warning_threshold_percent")}
              min={0}
              max={100}
            />
          </div>
          <div className="col-12 col-md-2">
            <label className="form-label">Hard Stop</label>
            <div className="form-check form-switch mt-2">
              <input
                type="checkbox"
                className="form-check-input"
                checked={Boolean(state.form.hard_stop_enabled)}
                onChange={(e) =>
                  setState((prev) => ({
                    ...prev,
                    form: { ...prev.form, hard_stop_enabled: Boolean(e.target.checked) }
                  }))
                }
              />
              <label className="form-check-label">
                {state.form.hard_stop_enabled ? "Enabled" : "Disabled"}
              </label>
            </div>
          </div>
          <div className="col-12 col-md-5">
            <label className="form-label">Usage Summary</label>
            <div className="border rounded p-2">
              <div className="row g-2">
                <div className="col-12 col-md-3">
                  <div className="text-secondary small">Today Usage</div>
                  <div className="fw-bold">₹{Number(usage?.today_cost_inr || 0).toFixed(2)}</div>
                  <div className="text-secondary small">Resets daily</div>
                </div>
                <div className="col-12 col-md-3">
                  <div className="text-secondary small">This Month Usage</div>
                  <div className="fw-bold">
                    ₹{monthCost.toFixed(2)} / ₹{monthBudget.toFixed(0)}
                  </div>
                </div>
                <div className="col-12 col-md-3">
                  <div className="text-secondary small">Remaining Budget</div>
                  <div className="fw-bold">₹{remaining.toFixed(2)}</div>
                </div>
                <div className="col-12 col-md-3">
                  <div className="text-secondary small">Billing Cycle Reset</div>
                  <div className="fw-bold">{resetDate || "—"}</div>
                </div>
              </div>
              <div className="small text-secondary mt-2">
                Usage values may show ₹0 until pricing configuration is enabled on the server.
              </div>
            </div>
          </div>
        </div>

        <div className="d-flex justify-content-end gap-2 mt-4 flex-wrap">
          <button type="button" className="btn btn-outline-light" onClick={onTest} disabled={state.testing}>
            {state.testing ? (
              <span className="spinner-border spinner-border-sm" role="status" aria-hidden="true" />
            ) : (
              "Test Connection"
            )}
          </button>
          <button type="button" className="btn btn-primary" onClick={onSave} disabled={state.saving}>
            {state.saving ? (
              <span className="spinner-border spinner-border-sm" role="status" aria-hidden="true" />
            ) : (
              "Save"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
