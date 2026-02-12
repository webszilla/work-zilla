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
