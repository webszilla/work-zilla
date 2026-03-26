import { apiFetch } from "../lib/api.js";

export async function getSocialAutomationOverview(socialCompanyId = "") {
  const query = socialCompanyId ? `?social_company_id=${encodeURIComponent(socialCompanyId)}` : "";
  return apiFetch(`/api/dashboard/social-media-automation/overview${query}`);
}

export async function getSocialAutomationPosts(page = 1, pageSize = 20, socialCompanyId = "") {
  const params = new URLSearchParams({ page: String(page), page_size: String(pageSize) });
  if (socialCompanyId) params.set("social_company_id", String(socialCompanyId));
  return apiFetch(`/api/dashboard/social-media-automation/posts?${params.toString()}`);
}

export async function getSocialAutomationCompanies() {
  return apiFetch("/api/dashboard/social-media-automation/companies");
}

export async function createSocialAutomationCompany(payload) {
  try {
    return await apiFetch("/api/dashboard/social-media-automation/companies", {
      method: "POST",
      body: JSON.stringify(payload || {}),
    });
  } catch (error) {
    if (error?.status !== 404) throw error;
    return apiFetch("/api/dashboard/social-media-automation/companies/", {
      method: "POST",
      body: JSON.stringify(payload || {}),
    });
  }
}

export async function updateSocialAutomationCompany(companyId, payload) {
  return apiFetch(`/api/dashboard/social-media-automation/companies/${companyId}`, {
    method: "PUT",
    body: JSON.stringify(payload || {}),
  });
}

export async function deleteSocialAutomationCompany(companyId) {
  return apiFetch(`/api/dashboard/social-media-automation/companies/${companyId}`, {
    method: "DELETE",
    body: JSON.stringify({}),
  });
}

export async function saveSocialConnection(payload) {
  return apiFetch("/api/dashboard/social-media-automation/connections", {
    method: "POST",
    body: JSON.stringify(payload || {}),
  });
}

export async function disconnectSocialConnection(platform, payload = {}) {
  return apiFetch(`/api/dashboard/social-media-automation/connections/${encodeURIComponent(platform)}/disconnect`, {
    method: "POST",
    body: JSON.stringify(payload || {}),
  });
}

export async function createSocialPost(payload) {
  return apiFetch("/api/dashboard/social-media-automation/posts", {
    method: "POST",
    body: JSON.stringify(payload || {}),
  });
}

export async function publishSocialPost(postId) {
  return apiFetch(`/api/dashboard/social-media-automation/posts/${postId}/publish`, {
    method: "POST",
    body: JSON.stringify({}),
  });
}
