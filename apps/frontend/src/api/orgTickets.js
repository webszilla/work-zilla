import { apiFetch } from "../lib/api.js";

export async function fetchOrgTickets({
  page = 1,
  pageSize = 20,
  productSlug = "",
  status = "",
  category = "",
} = {}) {
  const params = new URLSearchParams();
  params.set("page", String(page));
  params.set("page_size", String(pageSize));
  if (productSlug) params.set("product", String(productSlug));
  if (status) params.set("status", String(status));
  if (category) params.set("category", String(category));
  return apiFetch(`/api/dashboard/tickets?${params.toString()}`);
}

export async function createOrgTicket(formData) {
  return apiFetch("/api/dashboard/tickets", {
    method: "POST",
    body: formData,
  });
}

export async function fetchOrgTicketDetail(ticketId) {
  return apiFetch(`/api/dashboard/tickets/${ticketId}`);
}

export async function replyOrgTicket(ticketId, formData) {
  return apiFetch(`/api/dashboard/tickets/${ticketId}/reply`, {
    method: "POST",
    body: formData,
  });
}

export async function updateOrgTicketStatus(ticketId, status) {
  return apiFetch(`/api/dashboard/tickets/${ticketId}/status`, {
    method: "POST",
    body: JSON.stringify({ status }),
  });
}
