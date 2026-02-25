import { useEffect, useMemo, useState } from "react";
import { waApi } from "../api/whatsappAutomation.js";
import { apiFetch } from "../lib/api.js";
import ProductAccessSection from "../components/ProductAccessSection.jsx";

export default function WhatsappAutomationDashboardPage({ subscriptions = [] }) {
  const [loading, setLoading] = useState(true);
  const [savingSettings, setSavingSettings] = useState(false);
  const [savingRule, setSavingRule] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [settings, setSettings] = useState({ auto_reply_enabled: true, welcome_message: "" });
  const [rules, setRules] = useState([]);
  const [ruleForm, setRuleForm] = useState({ id: null, keyword: "", reply_message: "", is_default: false });
  const [previewInput, setPreviewInput] = useState("Hi");
  const [previewReply, setPreviewReply] = useState("");
  const [products, setProducts] = useState([]);

  async function loadAll() {
    setLoading(true);
    setError("");
    try {
      const [settingsRes, rulesRes] = await Promise.all([waApi.getSettings(), waApi.getRules()]);
      setSettings(settingsRes?.settings || { auto_reply_enabled: true, welcome_message: "" });
      setRules(rulesRes?.rules || []);
      setLoading(false);
    } catch (err) {
      setError(err?.message || "Unable to load WhatsApp automation.");
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAll();
  }, []);

  useEffect(() => {
    let active = true;
    async function loadProducts() {
      try {
        const data = await apiFetch("/api/dashboard/summary");
        if (!active) {
          return;
        }
        setProducts(Array.isArray(data?.products) ? data.products : []);
      } catch {
        if (active) {
          setProducts([]);
        }
      }
    }
    loadProducts();
    return () => {
      active = false;
    };
  }, []);

  async function saveSettings() {
    setSavingSettings(true);
    setError("");
    setSuccess("");
    try {
      const data = await waApi.saveSettings(settings);
      setSettings(data?.settings || settings);
      setSuccess("Settings saved.");
    } catch (err) {
      setError(err?.message || "Unable to save settings.");
    } finally {
      setSavingSettings(false);
    }
  }

  async function saveRule() {
    setSavingRule(true);
    setError("");
    setSuccess("");
    try {
      await waApi.saveRule(ruleForm);
      setRuleForm({ id: null, keyword: "", reply_message: "", is_default: false });
      const data = await waApi.getRules();
      setRules(data?.rules || []);
      setSuccess("Rule saved.");
    } catch (err) {
      setError(err?.message || "Unable to save rule.");
    } finally {
      setSavingRule(false);
    }
  }

  async function deleteRule(id) {
    try {
      await waApi.deleteRule(id);
      setRules((prev) => prev.filter((row) => row.id !== id));
    } catch (err) {
      setError(err?.message || "Unable to delete rule.");
    }
  }

  async function runPreview() {
    try {
      const data = await waApi.previewReply({ message: previewInput, is_first_message: true });
      setPreviewReply(data?.reply || "");
    } catch (err) {
      setError(err?.message || "Unable to preview reply.");
    }
  }

  const sortedRules = useMemo(() => [...rules].sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0)), [rules]);

  if (loading) return <div className="card p-4 text-center"><div className="spinner" /><p className="mb-0">Loading WhatsApp Automation...</p></div>;

  return (
    <div className="d-flex flex-column gap-3">
      <div className="p-2">
        <div className="d-flex align-items-center justify-content-between mb-2">
          <h3 className="mb-0">Whatsapp Automation</h3>
          <button type="button" className="btn btn-primary btn-sm" onClick={saveSettings} disabled={savingSettings}>
            {savingSettings ? "Saving..." : "Save Settings"}
          </button>
        </div>
        {error ? <div className="alert alert-danger">{error}</div> : null}
        {success ? <div className="alert alert-success">{success}</div> : null}
        <div className="row g-2">
          <div className="col-12">
            <label className="form-label">Auto Reply</label>
            <div className="form-check form-switch mt-2">
              <input type="checkbox" className="form-check-input" checked={Boolean(settings.auto_reply_enabled)} onChange={(e) => setSettings((p) => ({ ...p, auto_reply_enabled: e.target.checked }))} />
              <label className="form-check-label">{settings.auto_reply_enabled ? "Enabled" : "Disabled"}</label>
            </div>
          </div>
          <div className="col-12 col-xl-6">
            <label className="form-label">Welcome Message</label>
            <textarea className="form-control" rows="5" value={settings.welcome_message || ""} onChange={(e) => setSettings((p) => ({ ...p, welcome_message: e.target.value }))} />
          </div>
          <div className="col-12 col-xl-6">
            <label className="form-label">Automation Preview (Internal Only)</label>
            <div className="d-flex gap-2 flex-wrap">
              <input className="form-control" value={previewInput} onChange={(e) => setPreviewInput(e.target.value)} placeholder="Type customer message" />
              <button type="button" className="btn btn-primary" onClick={runPreview}>Preview Reply</button>
            </div>
            {previewReply ? (
              <pre className="mt-2 mb-0 p-2 rounded border" style={{ whiteSpace: "pre-wrap" }}>{previewReply}</pre>
            ) : null}
          </div>
        </div>
      </div>

      <div className="card p-4">
        <h4 className="mb-3">Keyword Reply Rules</h4>
        <div className="row g-3">
          <div className="col-12 col-md-4">
            <label className="form-label">Keyword</label>
            <input className="form-control" value={ruleForm.keyword} onChange={(e) => setRuleForm((p) => ({ ...p, keyword: e.target.value }))} placeholder="price / support / hello" />
          </div>
          <div className="col-12 col-md-8">
            <label className="form-label">Reply Message</label>
            <textarea className="form-control" rows="2" value={ruleForm.reply_message} onChange={(e) => setRuleForm((p) => ({ ...p, reply_message: e.target.value }))} />
          </div>
          <div className="col-12 d-flex align-items-center gap-3">
            <div className="form-check">
              <input className="form-check-input" type="checkbox" checked={Boolean(ruleForm.is_default)} onChange={(e) => setRuleForm((p) => ({ ...p, is_default: e.target.checked }))} id="waRuleDefault" />
              <label className="form-check-label" htmlFor="waRuleDefault">Set as default fallback rule</label>
            </div>
            <button type="button" className="btn btn-primary btn-sm" onClick={saveRule} disabled={savingRule}>
              {savingRule ? "Saving..." : ruleForm.id ? "Update Rule" : "Add Rule"}
            </button>
            {ruleForm.id ? <button type="button" className="btn btn-outline-light btn-sm" onClick={() => setRuleForm({ id: null, keyword: "", reply_message: "", is_default: false })}>Cancel Edit</button> : null}
          </div>
        </div>

        <div className="table-responsive mt-3">
          <table className="table table-dark table-hover align-middle">
            <thead>
              <tr>
                <th style={{ width: "20%" }}>Keyword</th>
                <th style={{ width: "56%" }}>Reply</th>
                <th style={{ width: "10%" }}>Default</th>
                <th style={{ width: "14%" }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {sortedRules.length ? sortedRules.map((row) => (
                <tr key={row.id}>
                  <td>{row.keyword || "-"}</td>
                  <td className="text-secondary" style={{ whiteSpace: "normal", wordBreak: "break-word" }}>{row.reply_message}</td>
                  <td>{row.is_default ? <span className="badge bg-success">Yes</span> : <span className="badge bg-secondary">No</span>}</td>
                  <td>
                    <div className="d-flex gap-1 justify-content-start flex-nowrap">
                    <button type="button" className="btn btn-outline-light btn-sm" onClick={() => setRuleForm({ id: row.id, keyword: row.keyword || "", reply_message: row.reply_message || "", is_default: Boolean(row.is_default) })}>Edit</button>
                    <button type="button" className="btn btn-outline-danger btn-sm" onClick={() => deleteRule(row.id)}>Delete</button>
                    </div>
                  </td>
                </tr>
              )) : (
                <tr><td colSpan="4" className="text-secondary">No rules added yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <ProductAccessSection
        products={products}
        subscriptions={subscriptions}
        currentProductKey="whatsapp-automation"
      />

    </div>
  );
}
