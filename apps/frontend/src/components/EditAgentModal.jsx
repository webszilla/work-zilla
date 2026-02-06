import { useEffect, useState } from "react";
import { apiFetch } from "../lib/api.js";
import { PHONE_COUNTRIES } from "../lib/phoneCountries.js";

function parsePhone(phoneStr) {
  if (!phoneStr) {
    return { country: "+91", phone: "" };
  }
  const parts = phoneStr.split(" ");
  if (parts.length > 1) {
    const country = parts[0];
    const phone = parts.slice(1).join(" ");
    if (PHONE_COUNTRIES.some((c) => c.code === country)) {
      return { country, phone };
    }
  }
  return { country: "+91", phone: phoneStr };
}

export default function EditAgentModal({ agent, onClose, onSuccess, onError }) {
  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    phoneCountry: "+91",
    agentRole: "support"
  });
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (agent) {
      const { country, phone } = parsePhone(agent.phone);
      setForm({
        name: agent.name || "",
        email: agent.email || "",
        phone: phone || "",
        phoneCountry: country || "+91",
        agentRole: agent.agent_role || "support"
      });
    }
  }, [agent]);

  async function handleUpdate(event) {
    event.preventDefault();
    if (!agent) {
      return;
    }
    setSubmitting(true);
    try {
      const payload = {
        name: form.name.trim(),
        email: form.email.trim(),
        phone: `${form.phoneCountry} ${form.phone.trim()}`.trim(),
        agent_role: form.agentRole
      };
      await apiFetch(`/api/ai-chatbot/org/agents/${agent.id}`, {
        method: "PATCH",
        body: JSON.stringify(payload)
      });
      onSuccess();
    } catch (error) {
      onError(error);
    } finally {
      setSubmitting(false);
    }
  }

  if (!agent) {
    return null;
  }

  return (
    <div className="wz-modal__backdrop">
      <div className="wz-modal wz-agent-modal">
        <div className="modal-header d-flex justify-content-between align-items-center">
          <h5 className="modal-title">Edit Agent</h5>
          <button type="button" className="btn-close" onClick={onClose} />
        </div>
        <hr className="section-divider mt-0 mb-3" />
        <form onSubmit={handleUpdate}>
          <div className="modal-body">
            <div className="row g-3">
              <div className="col-md-6">
                <label className="form-label">Name</label>
                <input
                  type="text"
                  className="form-control"
                  value={form.name}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, name: event.target.value }))
                  }
                  placeholder="Agent name"
                />
              </div>
              <div className="col-md-6">
                <label className="form-label">Email</label>
                <input
                  type="email"
                  className="form-control"
                  value={form.email}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, email: event.target.value }))
                  }
                  placeholder="agent@example.com"
                  required
                />
              </div>
              <div className="col-12">
                <label className="form-label">Role</label>
                <select
                  className="form-select"
                  value={form.agentRole}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, agentRole: event.target.value }))
                  }
                >
                  <option value="support">Support</option>
                  <option value="sales">Sales</option>
                  <option value="both">Both</option>
                </select>
              </div>
              <div className="col-md-6">
                <label className="form-label">Phone</label>
                <div className="input-group">
                  <select
                    className="form-select wz-phone-country-select"
                    value={form.phoneCountry}
                    onChange={(event) =>
                      setForm((prev) => ({
                        ...prev,
                        phoneCountry: event.target.value
                      }))
                    }
                  >
                    {PHONE_COUNTRIES.map((entry) => (
                      <option
                        key={`${entry.code}-${entry.label}`}
                        value={entry.code}
                      >
                        {entry.label} {entry.code}
                      </option>
                    ))}
                  </select>
                  <input
                    type="text"
                    className="form-control"
                    value={form.phone}
                    onChange={(event) =>
                      setForm((prev) => ({ ...prev, phone: event.target.value }))
                    }
                    placeholder="Phone number"
                  />
                </div>
              </div>
            </div>
          </div>
          <div className="modal-footer wz-modal__actions">
            <button
              type="button"
              className="btn btn-outline-light"
              onClick={onClose}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={submitting}
            >
              {submitting ? "Saving..." : "Update Agent"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
