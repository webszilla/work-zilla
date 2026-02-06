import { useEffect, useState } from "react";
import { apiFetch } from "../lib/api.js";

const emptyForm = {
  grace_days: 30,
  archive_days: 60,
  hard_delete_days: 0
};

export default function SaasAdminRetentionPolicyPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [saved, setSaved] = useState("");
  const [form, setForm] = useState(emptyForm);

  useEffect(() => {
    let active = true;
    async function loadPolicy() {
      setLoading(true);
      setError("");
      try {
        const data = await apiFetch("/api/saas-admin/settings/retention-policy");
        if (!active) {
          return;
        }
        setForm({
          grace_days: Number(data.grace_days ?? 30),
          archive_days: Number(data.archive_days ?? 60),
          hard_delete_days: Number(data.hard_delete_days ?? 0)
        });
        setSaved(data.updated_at || "");
      } catch (err) {
        if (active) {
          setError(err?.message || "Unable to load retention policy.");
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    loadPolicy();
    return () => {
      active = false;
    };
  }, []);

  async function handleSave() {
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const payload = {
        grace_days: Number(form.grace_days || 0),
        archive_days: Number(form.archive_days || 0),
        hard_delete_days: Number(form.hard_delete_days || 0)
      };
      const data = await apiFetch("/api/saas-admin/settings/retention-policy", {
        method: "PUT",
        body: JSON.stringify(payload)
      });
      setSaved(data.updated_at || new Date().toISOString());
      setNotice("Retention policy saved.");
    } catch (err) {
      setError(err?.message || "Unable to save retention policy.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="card p-3">
      <div className="d-flex align-items-center justify-content-between flex-wrap gap-2">
        <div>
          <h5 className="mb-0">Retention Policy</h5>
          <div className="text-secondary small">
            Applies to all products and organizations.
          </div>
        </div>
        <button
          type="button"
          className="btn btn-primary btn-sm"
          onClick={handleSave}
          disabled={saving || loading}
        >
          {saving ? "Saving..." : "Save"}
        </button>
      </div>

      {loading ? <div className="text-secondary mt-2">Loading...</div> : null}
      {error ? <div className="alert alert-danger mt-2">{error}</div> : null}
      {notice ? <div className="alert alert-success mt-2">{notice}</div> : null}
      {saved ? <div className="text-secondary small mt-2">Last updated: {saved}</div> : null}

      <div className="row g-3 mt-1">
        <div className="col-12 col-md-4">
          <div className="modal-form-field">
          <label>Grace Days</label>
          <input
            type="number"
            min="0"
            value={form.grace_days}
            onChange={(event) =>
              setForm((prev) => ({ ...prev, grace_days: event.target.value }))
            }
          />
          <div className="text-secondary small">
            After plan expiry, organization is read-only until this ends.
          </div>
          </div>
        </div>
        <div className="col-12 col-md-4">
          <div className="modal-form-field">
          <label>Archive Days</label>
          <input
            type="number"
            min="0"
            value={form.archive_days}
            onChange={(event) =>
              setForm((prev) => ({ ...prev, archive_days: event.target.value }))
            }
          />
          <div className="text-secondary small">
            After grace period, organization is archived and cannot log in.
          </div>
          </div>
        </div>
        <div className="col-12 col-md-4">
          <div className="modal-form-field">
          <label>Hard Delete Days</label>
          <input
            type="number"
            min="0"
            value={form.hard_delete_days}
            onChange={(event) =>
              setForm((prev) => ({ ...prev, hard_delete_days: event.target.value }))
            }
          />
          <div className="text-secondary small">
            Optional permanent deletion after archive. 0 means never delete.
          </div>
          </div>
        </div>
      </div>
    </div>
  );
}
