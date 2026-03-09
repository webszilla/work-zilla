import { apiFetch } from "../lib/api.js";

export async function fetchInbox({ page = 1, pageSize = 20 } = {}) {
  const params = new URLSearchParams();
  params.set("page", String(page));
  params.set("page_size", String(pageSize));
  return apiFetch(`/api/saas-admin/inbox?${params.toString()}`);
}

export async function markInboxRead(ids) {
  const payload = Array.isArray(ids) ? { ids } : { id: ids };
  return apiFetch("/api/saas-admin/inbox/read", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export async function deleteInboxNotification(id) {
  return apiFetch(`/api/saas-admin/inbox/${id}`, {
    method: "DELETE"
  });
}

export async function fetchSaasTickets({
  page = 1,
  pageSize = 20,
  productSlug = "",
  status = "",
  category = "",
  orgSearch = "",
} = {}) {
  const params = new URLSearchParams();
  params.set("page", String(page));
  params.set("page_size", String(pageSize));
  if (productSlug) params.set("product", String(productSlug));
  if (status) params.set("status", String(status));
  if (category) params.set("category", String(category));
  if (orgSearch) params.set("org_search", String(orgSearch));
  return apiFetch(`/api/saas-admin/tickets?${params.toString()}`);
}

export async function fetchSaasTicketDetail(ticketId) {
  return apiFetch(`/api/saas-admin/tickets/${ticketId}`);
}

export async function replySaasTicket(ticketId, formData) {
  return apiFetch(`/api/saas-admin/tickets/${ticketId}/reply`, {
    method: "POST",
    body: formData,
  });
}

export async function updateSaasTicketStatus(ticketId, status) {
  return apiFetch(`/api/saas-admin/tickets/${ticketId}/status`, {
    method: "POST",
    body: JSON.stringify({ status }),
  });
}
