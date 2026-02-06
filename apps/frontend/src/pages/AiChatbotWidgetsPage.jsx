import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "../lib/api.js";

const emptyState = {
  loading: true,
  error: "",
  widgets: []
};

const emptyForm = {
  id: null,
  name: "",
  allowedDomains: "",
  themePreset: "emerald",
  themePrimary: "",
  themeAccent: "",
  themeBackground: ""
};

const themePresets = [
  { value: "emerald", label: "Emerald" },
  { value: "ocean", label: "Ocean" },
  { value: "violet", label: "Violet" },
  { value: "amber", label: "Amber" },
  { value: "graphite", label: "Graphite" },
  { value: "custom", label: "Custom" }
];

function formatDomains(domains) {
  if (!domains || !domains.length) {
    return "All domains";
  }
  return domains.join(", ");
}

function buildSnippet(widgetKey) {
  return `<script src="/static/js/ai_chatbot_widget.js" data-widget-key="${widgetKey}"></script>`;
}

function getQrUrl(type, widgetId) {
  return `/api/org/ai-chatbox/qr.${type}?widget_id=${encodeURIComponent(widgetId)}`;
}

export default function AiChatbotWidgetsPage() {
  const [state, setState] = useState(emptyState);
  const [form, setForm] = useState(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");
  const [search, setSearch] = useState("");

  const snippetValue = useMemo(() => {
    if (!form.id || !form.name) {
      return "";
    }
    const widget = state.widgets.find((item) => item.id === form.id);
    return widget ? buildSnippet(widget.widget_key) : "";
  }, [form.id, form.name, state.widgets]);

  const filteredWidgets = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) {
      return state.widgets;
    }
    return state.widgets.filter((widget) => {
      const name = widget.name || "";
      const domains = (widget.allowed_domains || []).join(", ");
      const status = widget.is_active ? "active" : "inactive";
      const theme = widget.theme?.preset || "emerald";
      const publicUrl = widget.public_chat_url || "";
      return [name, domains, status, theme, publicUrl]
        .some((value) => String(value).toLowerCase().includes(query));
    });
  }, [search, state.widgets]);

  useEffect(() => {
    let active = true;
    async function loadWidgets() {
      setState((prev) => ({ ...prev, loading: true, error: "" }));
      try {
        const data = await apiFetch("/api/ai-chatbot/widgets");
        if (active) {
          setState({ loading: false, error: "", widgets: data.widgets || [] });
        }
      } catch (error) {
        if (active) {
          setState({
            loading: false,
            error: error?.message || "Unable to load widgets.",
            widgets: []
          });
        }
      }
    }

    loadWidgets();
    return () => {
      active = false;
    };
  }, []);

  async function refresh() {
    setSuccessMessage("");
    setState((prev) => ({ ...prev, loading: true, error: "" }));
    try {
      const data = await apiFetch("/api/ai-chatbot/widgets");
      setState({ loading: false, error: "", widgets: data.widgets || [] });
    } catch (error) {
      setState({
        loading: false,
        error: error?.message || "Unable to load widgets.",
        widgets: []
      });
    }
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (!form.name.trim()) {
      setState((prev) => ({ ...prev, error: "Widget name is required." }));
      return;
    }
    setSubmitting(true);
    setSuccessMessage("");
    try {
      const payload = {
        name: form.name.trim(),
        allowed_domains: form.allowedDomains,
        theme: {
          preset: form.themePreset,
          primary: form.themePrimary,
          accent: form.themeAccent,
          background: form.themeBackground
        }
      };
      let data = null;
      if (form.id) {
        data = await apiFetch(`/api/ai-chatbot/widgets/${form.id}`, {
          method: "PATCH",
          body: JSON.stringify(payload)
        });
      } else {
        data = await apiFetch("/api/ai-chatbot/widgets", {
          method: "POST",
          body: JSON.stringify(payload)
        });
      }
      setForm({
        id: null,
        name: "",
        allowedDomains: "",
        themePreset: "emerald",
        themePrimary: "",
        themeAccent: "",
        themeBackground: ""
      });
      await refresh();
      setSuccessMessage(form.id ? "Widget updated." : "Widget created.");
      return data;
    } catch (error) {
      setState((prev) => ({
        ...prev,
        error: error?.message || "Unable to save widget."
      }));
    } finally {
      setSubmitting(false);
    }
  }

  function handleEdit(widget) {
    const theme = widget.theme || {};
    setForm({
      id: widget.id,
      name: widget.name || "",
      allowedDomains: (widget.allowed_domains || []).join("\n"),
      themePreset: theme.preset || "emerald",
      themePrimary: theme.primary || "",
      themeAccent: theme.accent || "",
      themeBackground: theme.background || ""
    });
    setSuccessMessage("");
  }

  async function handleToggle(widget) {
    setSuccessMessage("");
    try {
      await apiFetch(`/api/ai-chatbot/widgets/${widget.id}`, {
        method: "PATCH",
        body: JSON.stringify({ is_active: !widget.is_active })
      });
      await refresh();
    } catch (error) {
      setState((prev) => ({
        ...prev,
        error: error?.message || "Unable to update widget."
      }));
    }
  }

  async function handleDelete(widget) {
    const confirmed = window.confirm("Delete this widget? This cannot be undone.");
    if (!confirmed) {
      return;
    }
    setSuccessMessage("");
    try {
      await apiFetch(`/api/ai-chatbot/widgets/${widget.id}`, { method: "DELETE" });
      await refresh();
    } catch (error) {
      setState((prev) => ({
        ...prev,
        error: error?.message || "Unable to delete widget."
      }));
    }
  }

  async function handleCopy(value) {
    if (!value) {
      return;
    }
    try {
      await navigator.clipboard.writeText(value);
      setSuccessMessage("Embed snippet copied.");
    } catch (error) {
      setState((prev) => ({
        ...prev,
        error: "Copy failed. Please copy manually."
      }));
    }
  }

  return (
    <div className="container-fluid">
      <div className="d-flex align-items-center justify-content-between mb-3">
        <div>
          <h2 className="mb-1">AI Chatbot Widgets</h2>
          <div className="text-secondary">Create widgets and copy the embed snippet.</div>
        </div>
        <button type="button" className="btn btn-outline-light btn-sm" onClick={refresh}>
          Refresh
        </button>
      </div>

      {state.error ? (
        <div className="alert alert-danger">{state.error}</div>
      ) : null}
      {successMessage ? (
        <div className="alert alert-success">{successMessage}</div>
      ) : null}

      <div className="user-panel mb-4">
        <div className="user-panel-header">
          <div className="user-panel-title">{form.id ? "Edit Widget" : "New Widget"}</div>
        </div>
        <form onSubmit={handleSubmit} className="p-3">
          <div className="row g-3 align-items-end">
            <div className="col-lg-6">
              <label className="form-label">Widget Name</label>
              <input
                type="text"
                className="form-control"
                value={form.name}
                onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
                placeholder="Support Widget"
              />
            </div>
            <div className="col-lg-6">
              <label className="form-label">Theme Preset</label>
              <select
                className="form-select"
                value={form.themePreset}
                onChange={(event) => setForm((prev) => ({ ...prev, themePreset: event.target.value }))}
              >
                {themePresets.map((preset) => (
                  <option key={preset.value} value={preset.value}>
                    {preset.label}
                  </option>
                ))}
              </select>
            </div>
            {form.themePreset === "custom" ? (
              <>
                <div className="col-lg-2">
                  <label className="form-label">Primary</label>
                  <input
                    type="color"
                    className="form-control form-control-color"
                    value={form.themePrimary || "#22c55e"}
                    onChange={(event) => setForm((prev) => ({ ...prev, themePrimary: event.target.value }))}
                  />
                </div>
                <div className="col-lg-2">
                  <label className="form-label">Accent</label>
                  <input
                    type="color"
                    className="form-control form-control-color"
                    value={form.themeAccent || "#2563eb"}
                    onChange={(event) => setForm((prev) => ({ ...prev, themeAccent: event.target.value }))}
                  />
                </div>
                <div className="col-lg-2">
                  <label className="form-label">Background</label>
                  <input
                    type="color"
                    className="form-control form-control-color"
                    value={form.themeBackground || "#0f172a"}
                    onChange={(event) => setForm((prev) => ({ ...prev, themeBackground: event.target.value }))}
                  />
                </div>
              </>
            ) : null}
            <div className="col-lg-9">
              <label className="form-label">Allowed Domains (comma or newline)</label>
              <textarea
                className="form-control"
                rows={2}
                value={form.allowedDomains}
                onChange={(event) => setForm((prev) => ({ ...prev, allowedDomains: event.target.value }))}
                placeholder="example.com, app.example.com"
              />
            </div>
            <div className="col-lg-3 d-flex gap-2">
              <button type="submit" className="btn btn-primary" disabled={submitting}>
                {submitting ? "Saving..." : form.id ? "Update" : "Create"}
              </button>
              {form.id ? (
                <button
                  type="button"
                  className="btn btn-outline-light"
                  onClick={() => setForm(emptyForm)}
                >
                  Cancel
                </button>
              ) : null}
            </div>
          </div>
        </form>
      </div>

      <div className="user-panel">
        <div className="user-panel-header ai-chatbot-widgets-header">
          <div className="user-panel-title">Widgets</div>
          <div className="ai-chatbot-widgets-search">
            <input
              type="search"
              className="form-control form-control-sm"
              placeholder="Search widgets..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
        </div>
        <div className="table-responsive">
          <table className="table table-dark table-striped align-middle mb-0 ai-chatbot-widgets-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Domains</th>
                <th>Status</th>
                <th>Theme</th>
                <th>Public Chat URL</th>
                <th>Embed Script</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {state.loading ? (
                <tr>
                  <td colSpan={7}>Loading...</td>
                </tr>
              ) : filteredWidgets.length ? (
                filteredWidgets.map((widget) => {
                  const snippet = buildSnippet(widget.widget_key);
                  return (
                    <tr key={widget.id}>
                      <td>{widget.name}</td>
                      <td>{formatDomains(widget.allowed_domains)}</td>
                      <td>{widget.is_active ? "Active" : "Inactive"}</td>
                      <td>{widget.theme?.preset || "emerald"}</td>
                      <td>
                        <div className="ai-chatbot-widgets-actions">
                          <div className="ai-chatbot-widgets-actions-row">
                            <button
                              type="button"
                              className="btn btn-outline-light btn-sm"
                              onClick={() => handleCopy(widget.public_chat_url)}
                              disabled={!widget.public_chat_url}
                            >
                              Copy URL
                            </button>
                            <a
                              className="btn btn-outline-light btn-sm"
                              href={getQrUrl("png", widget.id)}
                            >
                              QR PNG
                            </a>
                            <a
                              className="btn btn-outline-light btn-sm"
                              href={getQrUrl("svg", widget.id)}
                            >
                              QR SVG
                            </a>
                          </div>
                        </div>
                      </td>
                      <td>
                        <button
                          type="button"
                          className="btn btn-outline-light btn-sm"
                          onClick={() => handleCopy(snippet)}
                        >
                          Copy
                        </button>
                      </td>
                      <td className="d-flex gap-2">
                        <button
                          type="button"
                          className="btn btn-outline-light btn-sm"
                          onClick={() => handleEdit(widget)}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          className="btn btn-outline-light btn-sm"
                          onClick={() => handleToggle(widget)}
                        >
                          {widget.is_active ? "Disable" : "Enable"}
                        </button>
                        <button
                          type="button"
                          className="btn btn-outline-danger btn-sm"
                          onClick={() => handleDelete(widget)}
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={7}>
                    {state.widgets.length ? "No matches found." : "No widgets yet."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {snippetValue ? (
        <div className="mt-3 text-secondary">
          Embed snippet ready for copy.
        </div>
      ) : null}
    </div>
  );
}
