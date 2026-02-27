import { apiFetch } from "../lib/api.js";

export async function fetchOrgInbox({ page = 1, pageSize = 20, productSlug = "" } = {}) {
  const params = new URLSearchParams();
  params.set("page", String(page));
  params.set("page_size", String(pageSize));
  if (productSlug) {
    params.set("product", String(productSlug));
  }
  return apiFetch(`/api/dashboard/inbox?${params.toString()}`);
}

export async function markOrgInboxRead(ids) {
  const payload = Array.isArray(ids) ? { ids } : { id: ids };
  return apiFetch("/api/dashboard/inbox/read", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function deleteOrgInboxNotification(id) {
  return apiFetch(`/api/dashboard/inbox/${id}`, {
    method: "DELETE",
  });
}

export async function composeOrgInboxNotification(payload) {
  return apiFetch("/api/dashboard/inbox/compose", {
    method: "POST",
    body: JSON.stringify(payload || {}),
  });
}
