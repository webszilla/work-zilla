import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "../lib/api.js";

const emptyState = {
  loading: true,
  error: "",
  leads: [],
  widgets: [],
  retentionDays: 30,
  toast: ""
};

const dayOptions = [
  { value: 7, label: "Last 7 days" },
  { value: 14, label: "Last 14 days" },
  { value: 30, label: "Last 30 days" }
];

function formatDate(value) {
  if (!value) {
    return "-";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString();
}

function truncate(text, limit = 80) {
  const value = String(text || "");
  if (value.length <= limit) {
    return value || "-";
  }
  return `${value.slice(0, limit)}...`;
}

export default function AiChatbotLeadsPage() {
  const [state, setState] = useState(emptyState);
  const [days, setDays] = useState(7);
  const [widgetId, setWidgetId] = useState("");

  const widgetOptions = useMemo(() => {
    return state.widgets || [];
  }, [state.widgets]);

  useEffect(() => {
    let active = true;
    async function load() {
      setState((prev) => ({ ...prev, loading: true, error: "" }));
      try {
        const [leadData, widgetData] = await Promise.all([
          apiFetch(`/api/ai-chatbot/leads?days=${days}${widgetId ? `&widget_id=${widgetId}` : ""}`),
          apiFetch("/api/ai-chatbot/widgets")
        ]);
        if (active) {
          setState({
            loading: false,
            error: "",
            leads: leadData.leads || [],
            widgets: widgetData.widgets || [],
            retentionDays: leadData.retention_days || 30,
            toast: ""
          });
        }
      } catch (error) {
        if (active) {
          setState({
            loading: false,
            error: error?.message || "Unable to load leads.",
            leads: [],
            widgets: [],
            retentionDays: 30,
            toast: ""
          });
        }
      }
    }

    load();
    return () => {
      active = false;
    };
  }, [days, widgetId]);

  function setToast(message) {
    setState((prev) => ({ ...prev, toast: message }));
    if (message) {
      window.setTimeout(() => {
        setState((prev) => ({ ...prev, toast: "" }));
      }, 2000);
    }
  }

  async function handleStatusChange(leadId, nextStatus) {
    setState((prev) => ({
      ...prev,
      leads: prev.leads.map((lead) => (
        lead.id === leadId ? { ...lead, status: nextStatus } : lead
      ))
    }));
    try {
      await apiFetch(`/api/ai-chatbot/leads/${leadId}`, {
        method: "PATCH",
        body: JSON.stringify({ status: nextStatus })
      });
      setToast("Updated");
    } catch (error) {
      setState((prev) => ({ ...prev, error: error?.message || "Unable to update status." }));
    }
  }

  async function handleDelete(leadId) {
    const confirmed = window.confirm("Delete this lead? This cannot be undone.");
    if (!confirmed) {
      return;
    }
    try {
      await apiFetch(`/api/ai-chatbot/leads/${leadId}/delete`, { method: "DELETE" });
      setState((prev) => ({
        ...prev,
        leads: prev.leads.filter((lead) => lead.id !== leadId)
      }));
      setToast("Deleted");
    } catch (error) {
      setState((prev) => ({ ...prev, error: error?.message || "Unable to delete lead." }));
    }
  }

  return (
    <div>
      <div className="d-flex align-items-center justify-content-between flex-wrap gap-2">
        <div>
          <h2 className="page-title">AI Chatbot Leads</h2>
          <div className="text-secondary">Latest enquiry form submissions from your widget.</div>
        </div>
      </div>
      <hr className="section-divider" />

      <div className="wz-alert wz-alert--info">
        <div>Leads are retained for {state.retentionDays} days based on your plan’s Chat History setting. Older leads are auto-deleted.</div>
      </div>

      {state.toast ? (
        <div className="wz-alert wz-alert--success">{state.toast}</div>
      ) : null}

      <div className="card p-3">
        <div className="table-controls">
          <div className="table-search">
            <label htmlFor="leads-days">Days</label>
            <select
              id="leads-days"
              className="form-select"
              value={days}
              onChange={(event) => setDays(Number(event.target.value))}
            >
              {dayOptions.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </div>
          <div className="table-search">
            <label htmlFor="leads-widget">Widget</label>
            <select
              id="leads-widget"
              className="form-select"
              value={widgetId}
              onChange={(event) => setWidgetId(event.target.value)}
            >
              <option value="">All widgets</option>
              {widgetOptions.map((widget) => (
                <option key={widget.id} value={widget.id}>
                  {widget.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {state.loading ? (
          <div className="text-center py-4">Loading leads...</div>
        ) : state.error ? (
          <div className="alert alert-danger">{state.error}</div>
        ) : (
          <div className="table-responsive">
            <table className="table table-dark table-borderless">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Phone</th>
                  <th>Email</th>
                  <th>Message</th>
                  <th>Date</th>
                  <th>Widget</th>
                  <th>Source</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {state.leads.length ? (
                  state.leads.map((lead) => (
                    <tr key={lead.id}>
                      <td>{lead.name || "-"}</td>
                      <td>{lead.phone || "-"}</td>
                      <td>{lead.email || "-"}</td>
                      <td title={lead.message || ""}>{truncate(lead.message || "")}</td>
                      <td>{formatDate(lead.created_at)}</td>
                      <td>{lead.widget_name || "-"}</td>
                      <td>
                        {lead.source_url ? (
                          <a href={lead.source_url} target="_blank" rel="noreferrer">
                            {truncate(lead.source_url, 40)}
                          </a>
                        ) : "-"}
                      </td>
                      <td>
                        <select
                          className="form-select form-select-sm"
                          value={lead.status || "fresh"}
                          onChange={(event) => handleStatusChange(lead.id, event.target.value)}
                        >
                          <option value="fresh">Fresh</option>
                          <option value="following">Following</option>
                          <option value="completed">Completed</option>
                        </select>
                      </td>
                      <td>
                        <button
                          type="button"
                          className="btn btn-outline-danger btn-sm"
                          onClick={() => handleDelete(lead.id)}
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={9}>No leads found.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
