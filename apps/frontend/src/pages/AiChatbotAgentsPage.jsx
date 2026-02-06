import { useEffect, useState } from "react";
import { apiFetch } from "../lib/api.js";
import { PHONE_COUNTRIES } from "../lib/phoneCountries.js";
import EditAgentModal from "../components/EditAgentModal.jsx";

const emptyState = {
  loading: true,
  error: "",
  agents: [],
  toast: "",
  tempPassword: ""
};

const emptyForm = {
  name: "",
  email: "",
  phone: "",
  phoneCountry: "+91",
  password: "",
  chatAccess: ["support"],
};

export default function AiChatbotAgentsPage() {
  const [state, setState] = useState(emptyState);
  const [form, setForm] = useState(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editModal, setEditModal] = useState({ open: false, agent: null });
  const [passwordModal, setPasswordModal] = useState({
    open: false,
    agent: null,
    newPassword: "",
    confirmPassword: "",
    submitting: false
  });

  useEffect(() => {
    let active = true;
    async function loadAgents() {
      setState((prev) => ({ ...prev, loading: true, error: "" }));
      try {
        const data = await apiFetch("/api/ai-chatbot/org/agents");
        if (active) {
          setState((prev) => ({
            ...prev,
            loading: false,
            error: "",
            agents: data.agents || []
          }));
        }
      } catch (error) {
        if (active) {
          setState((prev) => ({
            ...prev,
            loading: false,
            error: error?.message || "Unable to load agents."
          }));
        }
      }
    }
    loadAgents();
    return () => {
      active = false;
    };
  }, []);

  function setToast(message, tempPassword = "") {
    setState((prev) => ({ ...prev, toast: message, tempPassword }));
    if (message) {
      window.setTimeout(() => {
        setState((prev) => ({ ...prev, toast: "", tempPassword: "" }));
      }, 2500);
    }
  }

  function openEditModal(agent) {
    setEditModal({ open: true, agent });
  }
  
  async function refresh() {
    setState((prev) => ({ ...prev, loading: true, error: "" }));
    try {
      const data = await apiFetch("/api/ai-chatbot/org/agents");
      setState((prev) => ({
        ...prev,
        loading: false,
        agents: data.agents || []
      }));
    } catch (error) {
      setState((prev) => ({
        ...prev,
        loading: false,
        error: error?.message || "Unable to load agents."
      }));
    }
  }

  function handleChatAccessChange(event) {
    const { value, checked } = event.target;
    setForm((prev) => {
      const { chatAccess } = prev;
      if (checked) {
        return { ...prev, chatAccess: [...chatAccess, value] };
      } else {
        return { ...prev, chatAccess: chatAccess.filter((v) => v !== value) };
      }
    });
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (!form.email.trim()) {
      setState((prev) => ({ ...prev, error: "Email is required." }));
      return;
    }
    if (!form.password.trim()) {
      setState((prev) => ({ ...prev, error: "Temp password is required." }));
      return;
    }
    if (form.chatAccess.length === 0) {
      setState((prev) => ({ ...prev, error: "Select at least one chat access type." }));
      return;
    }
    setSubmitting(true);
    try {
      const payload = {
        name: form.name.trim(),
        email: form.email.trim(),
        phone: `${form.phoneCountry} ${form.phone.trim()}`.trim(),
        password: form.password.trim(),
        chat_access: form.chatAccess
      };
      const data = await apiFetch("/api/ai-chatbot/org/agents", {
        method: "POST",
        body: JSON.stringify(payload)
      });
      setForm(emptyForm);
      await refresh();
      setToast("Agent created.", data.temp_password || "");
      setShowModal(false);
    } catch (error) {
      setState((prev) => ({ ...prev, error: error?.message || "Unable to create agent." }));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleToggle(agent) {
    try {
      await apiFetch(`/api/ai-chatbot/org/agents/${agent.id}`, {
        method: "PATCH",
        body: JSON.stringify({ is_active: !agent.is_active })
      });
      await refresh();
      setToast(agent.is_active ? "Agent disabled." : "Agent enabled.");
    } catch (error) {
      setState((prev) => ({ ...prev, error: error?.message || "Unable to update agent." }));
    }
  }

  async function handleDelete(agent) {
    const confirmed = window.confirm("Delete this agent? This cannot be undone.");
    if (!confirmed) {
      return;
    }
    try {
      await apiFetch(`/api/ai-chatbot/org/agents/${agent.id}`, { method: "DELETE" });
      setState((prev) => ({
        ...prev,
        agents: prev.agents.filter((row) => row.id !== agent.id)
      }));
      setToast("Agent deleted.");
    } catch (error) {
      setState((prev) => ({ ...prev, error: error?.message || "Unable to delete agent." }));
    }
  }

  function openPasswordModal(agent) {
    setPasswordModal({
      open: true,
      agent,
      newPassword: "",
      confirmPassword: "",
      submitting: false
    });
  }

  async function handlePasswordChange(event) {
    event.preventDefault();
    if (!passwordModal.agent) {
      return;
    }
    if (!passwordModal.newPassword.trim()) {
      setState((prev) => ({ ...prev, error: "New password is required." }));
      return;
    }
    if (passwordModal.newPassword !== passwordModal.confirmPassword) {
      setState((prev) => ({ ...prev, error: "New passwords do not match." }));
      return;
    }
    setPasswordModal((prev) => ({ ...prev, submitting: true }));
    try {
      await apiFetch(`/api/ai-chatbot/org/agents/${passwordModal.agent.id}/password`, {
        method: "POST",
        body: JSON.stringify({
          new_password: passwordModal.newPassword,
          confirm_password: passwordModal.confirmPassword
        })
      });
      setToast("Password updated.");
      setPasswordModal({
        open: false,
        agent: null,
        newPassword: "",
        confirmPassword: "",
        submitting: false
      });
    } catch (error) {
      setState((prev) => ({ ...prev, error: error?.message || "Unable to update password." }));
      setPasswordModal((prev) => ({ ...prev, submitting: false }));
    }
  }

  return (
    <div>
      <div className="d-flex align-items-center justify-content-between flex-wrap gap-2">
        <div>
          <h2 className="page-title">AI Chatbot Agents</h2>
          <div className="text-secondary">Add and manage support agents for AI Chatbot inbox.</div>
        </div>
        <button type="button" className="btn btn-outline-light btn-sm" onClick={refresh}>
          Refresh
        </button>
      </div>
      <hr className="section-divider" />

      <div className="alert alert-info">
        Deleting agent will not delete conversations; it only blocks login.
      </div>

      {state.error ? (
        <div className="alert alert-danger">{state.error}</div>
      ) : null}
      {state.toast ? (
        <div className="alert alert-success">
          {state.toast}
          {state.tempPassword ? (
            <div className="mt-2">
              Temp password: <strong>{state.tempPassword}</strong>
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="d-flex justify-content-end mb-3">
        <button type="button" className="btn btn-primary" onClick={() => setShowModal(true)}>
          Add Agent
        </button>
      </div>

      <div className="card p-3">
        <h5 className="mb-3">Agents</h5>
        {state.loading ? (
          <div className="text-center py-4">Loading agents...</div>
        ) : (
          <div className="table-responsive">
            <table className="table table-dark table-borderless">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Phone</th>
                  <th>Chat Access</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {state.agents.length ? (
                  state.agents.map((agent) => (
                    <tr key={agent.id}>
                      <td>{agent.name || "-"}</td>
                      <td>{agent.email || "-"}</td>
                      <td>{agent.phone || "-"}</td>
                      <td>{agent.chat_access?.join(", ") || "sales, support"}</td>
                      <td>
                        <span className={`badge ${agent.is_active ? "bg-success" : "bg-secondary"}`}>
                          {agent.is_active ? "Active" : "Disabled"}
                        </span>
                      </td>
                      <td className="d-flex gap-2">
                        <button
                          type="button"
                          className="btn btn-outline-info btn-sm"
                          onClick={() => openEditModal(agent)}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          className="btn btn-outline-light btn-sm"
                          onClick={() => handleToggle(agent)}
                        >
                          {agent.is_active ? "Disable" : "Enable"}
                        </button>
                        <button
                          type="button"
                          className="btn btn-outline-danger btn-sm"
                          onClick={() => handleDelete(agent)}
                        >
                          Delete
                        </button>
                        <button
                          type="button"
                          className="btn btn-outline-success btn-sm"
                          onClick={() => openPasswordModal(agent)}
                        >
                          Password Change
                        </button>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={6}>No agents yet.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showModal ? (
        <div className="wz-modal__backdrop">
          <div className="wz-modal wz-agent-modal">
            <div className="modal-header">
              <h5 className="modal-title">Add Agent</h5>
              <button type="button" className="btn-close" onClick={() => setShowModal('')} />
            </div>
            <hr className="section-divider mt-0 mb-3" />
            <form onSubmit={handleSubmit}>
              <div className="modal-body">
                <div className="row g-3">
                  <div className="col-md-6">
                    <label className="form-label">Name</label>
                    <input
                      type="text"
                      className="form-control"
                      value={form.name}
                      onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
                      placeholder="Agent name"
                    />
                  </div>
                  <div className="col-md-6">
                    <label className="form-label">Email</label>
                    <input
                      type="email"
                      className="form-control"
                      value={form.email}
                      onChange={(event) => setForm((prev) => ({ ...prev, email: event.target.value }))}
                      placeholder="agent@example.com"
                      required
                    />
                  </div>
                  <div className="col-12">
                    <label className="form-label">Chat Access</label>
                    <div className="d-flex gap-3">
                      <div className="form-check">
                        <input
                          className="form-check-input"
                          type="checkbox"
                          value="sales"
                          id="access-sales-new"
                          checked={form.chatAccess.includes("sales")}
                          onChange={handleChatAccessChange}
                        />
                        <label className="form-check-label" htmlFor="access-sales-new">
                          Sales
                        </label>
                      </div>
                      <div className="form-check">
                        <input
                          className="form-check-input"
                          type="checkbox"
                          value="support"
                          id="access-support-new"
                          checked={form.chatAccess.includes("support")}
                          onChange={handleChatAccessChange}
                        />
                        <label className="form-check-label" htmlFor="access-support-new">
                          Support
                        </label>
                      </div>
                    </div>
                  </div>
                  <div className="col-md-6">
                    <label className="form-label">Phone</label>
                    <div className="input-group">
                      <select
                        className="form-select"
                        value={form.phoneCountry}
                        onChange={(event) => setForm((prev) => ({ ...prev, phoneCountry: event.target.value }))}
                        style={{ maxWidth: "110px" }}
                      >
                        {PHONE_COUNTRIES.map((entry) => (
                          <option key={`${entry.code}-${entry.label}`} value={entry.code}>
                            {entry.label} {entry.code}
                          </option>
                        ))}
                      </select>
                      <input
                        type="text"
                        className="form-control"
                        value={form.phone}
                        onChange={(event) => setForm((prev) => ({ ...prev, phone: event.target.value }))}
                        placeholder="Phone number"
                      />
                    </div>
                  </div>
                  <div className="col-md-6">
                    <label className="form-label">Temp Password</label>
                    <div className="input-group">
                      <input
                        type="text"
                        className="form-control"
                        value={form.password}
                        onChange={(event) => setForm((prev) => ({ ...prev, password: event.target.value }))}
                        placeholder="Temp@12345"
                        required
                      />
                      <button
                        type="button"
                        className="btn btn-outline-light"
                        onClick={() =>
                          setForm((prev) => ({
                            ...prev,
                            password: `Temp@${Math.random().toString(36).slice(2, 8)}`
                          }))
                        }
                        style={{ minWidth: "130px" }}
                      >
                        Auto-generate
                      </button>
                    </div>
                  </div>
                </div>
              </div>
              <div className="modal-footer wz-modal__actions">
                <button type="button" className="btn btn-outline-light" onClick={() => setShowModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={submitting}>
                  {submitting ? "Saving..." : "Create Agent"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {/* TODO: Edit agent modal */}
      {editModal.open ? (
        <EditAgentModal
          agent={editModal.agent}
          onClose={() => setEditModal({ open: false, agent: null })}
          onSuccess={async () => {
            setEditModal({ open: false, agent: null });
            await refresh();
            setToast("Agent updated.");
          }}
          onError={(error) =>
            setState((prev) => ({
              ...prev,
              error: error?.message || "Unable to update agent."
            }))
          }
        />
      ) : null}

      {passwordModal.open ? (
        <div className="wz-modal__backdrop">
          <div className="wz-modal wz-agent-modal">
            <div className="modal-header">
              <h5 className="modal-title">Change Password</h5>
              <button type="button" className="btn-close" onClick={() => setPasswordModal((prev) => ({ ...prev, open: false }))} />
            </div>
            <form onSubmit={handlePasswordChange}>
              <div className="modal-body">
                <div className="mb-2 text-secondary">
                  Agent: {passwordModal.agent?.name || passwordModal.agent?.email || "-"}
                </div>
                <div className="mb-3">
                  <label className="form-label">New Password</label>
                  <input
                    type="password"
                    className="form-control"
                    value={passwordModal.newPassword}
                    onChange={(event) => setPasswordModal((prev) => ({ ...prev, newPassword: event.target.value }))}
                    required
                  />
                </div>
                <div className="mb-3">
                  <label className="form-label">Confirm New Password</label>
                  <input
                    type="password"
                    className="form-control"
                    value={passwordModal.confirmPassword}
                    onChange={(event) => setPasswordModal((prev) => ({ ...prev, confirmPassword: event.target.value }))}
                    required
                  />
                </div>
              </div>
              <div className="modal-footer wz-modal__actions">
                <button type="button" className="btn btn-outline-light" onClick={() => setPasswordModal((prev) => ({ ...prev, open: false }))}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={passwordModal.submitting}>
                  {passwordModal.submitting ? "Saving..." : "Update Password"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
