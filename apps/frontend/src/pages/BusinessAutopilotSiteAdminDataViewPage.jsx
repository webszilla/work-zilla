import { Link, useLocation, useNavigate } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "../lib/api.js";

const STATUS_TABS = [
  { key: "today", label: "Today" },
  { key: "all", label: "All" },
  { key: "paid", label: "Paid" },
  { key: "unpaid", label: "Unpaid" },
  { key: "pending_job", label: "Pending Job" },
  { key: "delivery_pending", label: "Delivery Pending" },
  { key: "cancelled", label: "Cancel" },
];

function SiteAdminHeaderTabs() {
  const location = useLocation();
  const pathname = String(location.pathname || "");
  const isAssistantActive = pathname === "/assistant" || pathname.endsWith("/business-autopilot/assistant");
  const isSiteAdminActive = pathname.includes("/site-admin");

  return (
    <div className="ba-assistant-page-tabs__bar">
      <Link to="/assistant" className={`ba-assistant-page-tabs__tab ${isAssistantActive ? "is-active" : ""}`}>
        AI Assistant
      </Link>
      <Link to="/site-admin" className={`ba-assistant-page-tabs__tab ${isSiteAdminActive ? "is-active" : ""}`}>
        Site Admin
      </Link>
    </div>
  );
}

function formatDateLabel(value) {
  if (!value) {
    return "-";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "-";
  }
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

function formatCurrencyText(value) {
  const numeric = Number.parseFloat(String(value || "0").replace(/,/g, ""));
  if (!Number.isFinite(numeric)) {
    return "-";
  }
  return Number.isInteger(numeric) ? `Rs.${numeric}` : `Rs.${numeric.toFixed(2).replace(/0+$/, "").replace(/\.$/, "")}`;
}

function isTodayDate(value) {
  if (!value) {
    return false;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return false;
  }
  const now = new Date();
  return date.getFullYear() === now.getFullYear()
    && date.getMonth() === now.getMonth()
    && date.getDate() === now.getDate();
}

function matchEstimateFilter(row, filterKey) {
  const paymentStatus = String(row?.payment_status || "").trim().toLowerCase();
  const jobStatus = String(row?.job_status || "").trim().toLowerCase();
  const deliveryStatus = String(row?.delivery_status || "").trim().toLowerCase();
  const estimateStatus = String(row?.status || "").trim().toLowerCase();
  if (filterKey === "paid") {
    return paymentStatus === "completed";
  }
  if (filterKey === "unpaid") {
    return paymentStatus !== "completed";
  }
  if (filterKey === "pending_job") {
    return !["completed", "done", "ready", "cancelled", "canceled"].includes(jobStatus);
  }
  if (filterKey === "delivery_pending") {
    return deliveryStatus !== "completed";
  }
  if (filterKey === "today") {
    return isTodayDate(row?.created_at);
  }
  if (filterKey === "cancelled") {
    return ["cancelled", "canceled"].includes(estimateStatus);
  }
  return true;
}

export default function BusinessAutopilotSiteAdminDataViewPage() {
  const navigate = useNavigate();
  const [viewMode, setViewMode] = useState("estimates");
  const [rows, setRows] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [contactsLoading, setContactsLoading] = useState(false);
  const [notice, setNotice] = useState("");
  const [contactNotice, setContactNotice] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [entityType, setEntityType] = useState("client");
  const [entityQuery, setEntityQuery] = useState("");
  const [tableSearch, setTableSearch] = useState("");
  const [contactSaving, setContactSaving] = useState(false);
  const [editingContactId, setEditingContactId] = useState("");
  const [contactForm, setContactForm] = useState({ client_name: "", mobile: "" });

  useEffect(() => {
    let ignore = false;
    async function load() {
      setLoading(true);
      setNotice("");
      try {
        const data = await apiFetch("/api/business-autopilot/quick-estimates/");
        if (!ignore) {
          setRows(Array.isArray(data?.quick_estimates) ? data.quick_estimates : []);
        }
      } catch (error) {
        if (!ignore) {
          setNotice(error?.message || "Unable to load Quick Estimate data.");
        }
      } finally {
        if (!ignore) {
          setLoading(false);
        }
      }
    }
    load();
    return () => {
      ignore = true;
    };
  }, []);

  async function loadContacts() {
    setContactsLoading(true);
    setContactNotice("");
    try {
      const data = await apiFetch("/api/business-autopilot/quick-estimate-contacts/");
      setContacts(Array.isArray(data?.contacts) ? data.contacts : []);
    } catch (error) {
      setContactNotice(error?.message || "Unable to load contact data.");
    } finally {
      setContactsLoading(false);
    }
  }

  async function openContactView() {
    setViewMode("contacts");
    setEditingContactId("");
    setContactForm({ client_name: "", mobile: "" });
    await loadContacts();
  }

  function openEstimateView() {
    setViewMode("estimates");
    setEditingContactId("");
    setContactForm({ client_name: "", mobile: "" });
    setContactNotice("");
  }

  function startEditContact(row) {
    setEditingContactId(String(row?.id || ""));
    setContactForm({
      client_name: String(row?.client_name || ""),
      mobile: String(row?.mobile || ""),
    });
    setContactNotice("");
  }

  async function saveContactEdit() {
    if (!editingContactId) {
      return;
    }
    setContactSaving(true);
    setContactNotice("");
    try {
      await apiFetch(`/api/business-autopilot/quick-estimate-contacts/${editingContactId}/`, {
        method: "PATCH",
        body: JSON.stringify(contactForm),
      });
      setEditingContactId("");
      setContactForm({ client_name: "", mobile: "" });
      await Promise.all([
        loadContacts(),
        apiFetch("/api/business-autopilot/quick-estimates/").then((data) => {
          setRows(Array.isArray(data?.quick_estimates) ? data.quick_estimates : []);
        }),
      ]);
    } catch (error) {
      setContactNotice(error?.message || "Unable to update contact data.");
    } finally {
      setContactSaving(false);
    }
  }

  async function deleteContact(row) {
    const confirmed = window.confirm(`Delete contact data for ${row?.client_name || row?.mobile || "this client"}?`);
    if (!confirmed) {
      return;
    }
    setContactNotice("");
    try {
      await apiFetch(`/api/business-autopilot/quick-estimate-contacts/${row.id}/`, {
        method: "DELETE",
      });
      if (editingContactId === String(row.id)) {
        setEditingContactId("");
        setContactForm({ client_name: "", mobile: "" });
      }
      await loadContacts();
    } catch (error) {
      setContactNotice(error?.message || "Unable to delete contact data.");
    }
  }

  const entityOptions = useMemo(() => {
    const values = new Map();
    rows.forEach((row) => {
      const label = entityType === "employee"
        ? String(row?.assigned_user_name || "").trim()
        : String(row?.client_name || "").trim();
      if (label) {
        values.set(label.toLowerCase(), label);
      }
    });
    return Array.from(values.values()).sort((left, right) => left.localeCompare(right));
  }, [entityType, rows]);

  const filteredRows = useMemo(() => {
    const entityFilter = entityQuery.trim().toLowerCase();
    const search = tableSearch.trim().toLowerCase();
    return rows.filter((row) => {
      if (!matchEstimateFilter(row, statusFilter)) {
        return false;
      }
      if (entityFilter) {
        if (entityType === "employee") {
          const employeeValue = String(row?.assigned_user_name || "").toLowerCase();
          if (!employeeValue.includes(entityFilter)) {
            return false;
          }
        } else {
          const clientValue = String(row?.client_name || "").toLowerCase();
          if (!clientValue.includes(entityFilter)) {
            return false;
          }
        }
      }
      if (!search) {
        return true;
      }
      const haystack = [
        row?.estimate_number,
        row?.client_name,
        row?.mobile,
        row?.assigned_user_name,
        row?.status,
        row?.payment_status,
        row?.delivery_status,
      ].map((value) => String(value || "").toLowerCase()).join(" ");
      return haystack.includes(search);
    });
  }, [entityQuery, entityType, rows, statusFilter, tableSearch]);

  const filteredContacts = useMemo(() => {
    const search = tableSearch.trim().toLowerCase();
    if (!search) {
      return contacts;
    }
    return contacts.filter((row) => {
      const haystack = [
        row?.client_name,
        row?.mobile,
        row?.email,
        row?.address,
      ].map((value) => String(value || "").toLowerCase()).join(" ");
      return haystack.includes(search);
    });
  }, [contacts, tableSearch]);

  return (
    <div className="ba-assistant ba-assistant--page ba-site-admin-chat ba-site-admin-data-view">
      <div className="ba-assistant__panel">
        <div className="ba-assistant__header">
          <div className="ba-assistant__header-copy" />
          <div className="ba-assistant__header-actions">
            <SiteAdminHeaderTabs />
            <button
              type="button"
              className={`btn ba-site-admin-chat__cta-btn ${viewMode === "contacts" ? "btn-primary" : "btn-outline-light"}`}
              onClick={openContactView}
            >
              Contact Data
            </button>
            {viewMode === "contacts" ? (
              <button
                type="button"
                className="btn btn-outline-light ba-site-admin-chat__cta-btn"
                onClick={openEstimateView}
              >
                Estimate Data
              </button>
            ) : null}
            <button
              type="button"
              className="btn btn-outline-light ba-site-admin-chat__cta-btn"
              onClick={() => navigate("/site-admin")}
            >
              Back
            </button>
          </div>
        </div>

          <div className="ba-site-admin-data-view__body">
          <div className="ba-site-admin-data-view__card">
            <div className="ba-site-admin-data-view__toolbar">
              <div className="ba-site-admin-chat__table-tabs" role="tablist" aria-label="Quick Estimate data filters">
                {viewMode === "estimates" ? STATUS_TABS.map((tab) => (
                  <button
                    key={tab.key}
                    type="button"
                    className={`ba-site-admin-chat__table-tab ${statusFilter === tab.key ? "is-active" : ""}`}
                    onClick={() => setStatusFilter(tab.key)}
                  >
                    {tab.label}
                  </button>
                )) : (
                  <div className="ba-site-admin-data-view__section-title">Quick Enquiry Contact Data</div>
                )}
              </div>

              <div className="ba-site-admin-data-view__filters">
                {viewMode === "estimates" ? (
                  <>
                    <select
                      className="form-select ba-site-admin-data-view__type-select"
                      value={entityType}
                      onChange={(event) => {
                        setEntityType(event.target.value === "employee" ? "employee" : "client");
                        setEntityQuery("");
                      }}
                    >
                      <option value="client">Client</option>
                      <option value="employee">User</option>
                    </select>
                    <input
                      type="search"
                      list="ba-site-admin-data-view-options"
                      className="form-control ba-site-admin-data-view__entity-search"
                      value={entityQuery}
                      onChange={(event) => setEntityQuery(event.target.value)}
                      placeholder={entityType === "employee" ? "Select user..." : "Select client..."}
                    />
                  </>
                ) : <div />}
                <input
                  type="search"
                  className={`form-control ba-site-admin-data-view__search ${viewMode === "contacts" ? "ba-site-admin-data-view__search--contacts" : ""}`}
                  value={tableSearch}
                  onChange={(event) => setTableSearch(event.target.value)}
                  placeholder={viewMode === "contacts" ? "Search contact table..." : "Search table..."}
                />
                {viewMode === "estimates" ? (
                  <datalist id="ba-site-admin-data-view-options">
                    {entityOptions.map((option) => (
                      <option key={option} value={option} />
                    ))}
                  </datalist>
                ) : null}
              </div>
            </div>

            <div className="ba-site-admin-chat__table-count">
              {viewMode === "contacts"
                ? `${filteredContacts.length} contact${filteredContacts.length === 1 ? "" : "s"}`
                : `${filteredRows.length} estimate${filteredRows.length === 1 ? "" : "s"}`}
            </div>
            {viewMode === "contacts"
              ? (contactNotice ? <div className="ba-assistant__setup-note">{contactNotice}</div> : null)
              : (notice ? <div className="ba-assistant__setup-note">{notice}</div> : null)}

            <div className="table-responsive ba-site-admin-chat__table-wrap ba-site-admin-data-view__table-wrap">
              {viewMode === "contacts" ? (
                <table className="table align-middle mb-0">
                  <thead>
                    <tr>
                      <th>S.No</th>
                      <th>Client Name</th>
                      <th>Mobile</th>
                      <th>Linked Estimates</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {contactsLoading ? (
                      <tr>
                        <td colSpan={5} className="text-center py-4 text-secondary">Loading contact data...</td>
                      </tr>
                    ) : filteredContacts.length ? (
                      filteredContacts.map((row, index) => (
                        <tr key={row.id}>
                          <td>{index + 1}</td>
                          <td>{row.client_name || "-"}</td>
                          <td>{row.mobile || "-"}</td>
                          <td>{row.linked_estimate_count || 0}</td>
                          <td>
                            <div className="ba-site-admin-data-view__contact-actions">
                              <button type="button" className="btn btn-sm btn-outline-secondary" onClick={() => startEditContact(row)}>Edit</button>
                              <button type="button" className="btn btn-sm btn-outline-danger" onClick={() => deleteContact(row)}>Delete</button>
                            </div>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={5} className="text-center py-4 text-secondary">No contact data found.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              ) : (
                <table className="table align-middle mb-0">
                  <thead>
                    <tr>
                      <th>S.No</th>
                      <th>Estimate</th>
                      <th>Client</th>
                      <th>Assigned Employee</th>
                      <th>Date</th>
                      <th>Status</th>
                      <th className="text-end">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loading ? (
                      <tr>
                        <td colSpan={7} className="text-center py-4 text-secondary">Loading Quick Estimates...</td>
                      </tr>
                    ) : filteredRows.length ? (
                      filteredRows.map((row, index) => (
                        <tr key={row.id}>
                          <td>{index + 1}</td>
                          <td>{row.estimate_number || "-"}</td>
                          <td>
                            <div className="ba-site-admin-chat__estimate-meta">
                              <strong>{row.client_name || "-"}</strong>
                              <small>{row.mobile || "-"}</small>
                            </div>
                          </td>
                          <td>{row.assigned_user_name || "Unassigned"}</td>
                          <td>{formatDateLabel(row.created_at)}</td>
                          <td>
                            <div className="ba-site-admin-chat__estimate-meta">
                              <span>{String(row.status || "created").replace(/_/g, " ")}</span>
                              <small>
                                Payment: {String(row.payment_status || "").toLowerCase() === "completed" ? "Done" : "Pending"} | Delivery: {String(row.delivery_status || "").toLowerCase() === "completed" ? "Done" : "Pending"}
                              </small>
                            </div>
                          </td>
                          <td className="text-end fw-semibold">{formatCurrencyText(row.total_amount || row.subtotal)}</td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={7} className="text-center py-4 text-secondary">No Quick Estimate data found for this filter.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              )}
            </div>
            {editingContactId ? (
              <div className="ba-site-admin-data-view__contact-editor">
                <div className="row g-3">
                  <div className="col-12 col-md-6">
                    <label className="form-label">Client Name</label>
                    <input
                      type="text"
                      className="form-control"
                      value={contactForm.client_name}
                      onChange={(event) => setContactForm((prev) => ({ ...prev, client_name: event.target.value }))}
                    />
                  </div>
                  <div className="col-12 col-md-6">
                    <label className="form-label">Mobile Number</label>
                    <input
                      type="text"
                      className="form-control"
                      value={contactForm.mobile}
                      onChange={(event) => setContactForm((prev) => ({ ...prev, mobile: event.target.value }))}
                    />
                  </div>
                </div>
                <div className="ba-site-admin-data-view__contact-editor-actions">
                  <button type="button" className="btn btn-outline-light ba-site-admin-chat__cta-btn" onClick={() => setEditingContactId("")}>
                    Cancel
                  </button>
                  <button type="button" className="btn btn-primary ba-site-admin-chat__cta-btn" disabled={contactSaving} onClick={saveContactEdit}>
                    {contactSaving ? "Saving..." : "Save"}
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
