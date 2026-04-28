import { apiFetch } from "./api.js";

export function fetchAiArchitectStatus() {
  return apiFetch("/api/saas-admin/ai-architect/status");
}

export function fetchAiArchitectSettings() {
  return apiFetch("/api/saas-admin/ai-architect/settings");
}

export function saveAiArchitectSettings(payload) {
  return apiFetch("/api/saas-admin/ai-architect/settings", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export function testAiArchitectConnection(payload = {}) {
  return apiFetch("/api/saas-admin/ai-architect/test", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export function sendAiArchitectChat(payload) {
  return apiFetch("/api/saas-admin/ai-architect/chat", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export function fetchAiArchitectHistory(sessionId = "") {
  const qs = sessionId ? `?session_id=${encodeURIComponent(sessionId)}` : "";
  return apiFetch(`/api/saas-admin/ai-architect/history${qs}`);
}

export function fetchAiArchitectUsage() {
  return apiFetch("/api/saas-admin/ai-architect/usage");
}
