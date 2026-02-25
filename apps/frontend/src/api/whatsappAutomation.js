import { apiFetch } from "../lib/api.js";

export const waApi = {
  getCompanyProfile() {
    return apiFetch("/api/whatsapp-automation/company-profile");
  },
  saveCompanyProfile(payload) {
    return apiFetch("/api/whatsapp-automation/company-profile", {
      method: "PUT",
      body: JSON.stringify(payload),
    });
  },
  getSettings() {
    return apiFetch("/api/whatsapp-automation/settings");
  },
  saveSettings(payload) {
    return apiFetch("/api/whatsapp-automation/settings", {
      method: "PUT",
      body: JSON.stringify(payload),
    });
  },
  getRules() {
    return apiFetch("/api/whatsapp-automation/rules");
  },
  saveRule(payload) {
    return apiFetch("/api/whatsapp-automation/rules", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },
  deleteRule(id) {
    return apiFetch(`/api/whatsapp-automation/rules/${id}`, { method: "DELETE" });
  },
  previewReply(payload) {
    return apiFetch("/api/whatsapp-automation/preview-reply", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },
  getCatalogueProducts() {
    return apiFetch("/api/whatsapp-automation/catalogue/products");
  },
  getCataloguePage() {
    return apiFetch("/api/whatsapp-automation/catalogue/page");
  },
  saveCataloguePage(payload) {
    return apiFetch("/api/whatsapp-automation/catalogue/page", {
      method: "PUT",
      body: JSON.stringify(payload),
    });
  },
  saveCatalogueProduct(payload) {
    return apiFetch("/api/whatsapp-automation/catalogue/products", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },
  deleteCatalogueProduct(id) {
    return apiFetch(`/api/whatsapp-automation/catalogue/products/${id}`, { method: "DELETE" });
  },
  getDigitalCards(params = {}) {
    const search = new URLSearchParams();
    if (params.q) search.set("q", params.q);
    if (params.page) search.set("page", String(params.page));
    if (params.pageSize) search.set("page_size", String(params.pageSize));
    const qs = search.toString();
    return apiFetch(`/api/whatsapp-automation/digital-cards${qs ? `?${qs}` : ""}`);
  },
  saveDigitalCard(payload) {
    return apiFetch("/api/whatsapp-automation/digital-cards", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },
  checkDigitalCardSlug(slug, id) {
    const search = new URLSearchParams();
    if (slug) search.set("slug", String(slug));
    if (id) search.set("id", String(id));
    const qs = search.toString();
    return apiFetch(`/api/whatsapp-automation/digital-cards/slug-check${qs ? `?${qs}` : ""}`);
  },
  getDigitalCard(id) {
    return apiFetch(`/api/whatsapp-automation/digital-cards/${id}`);
  },
  deleteDigitalCard(id) {
    return apiFetch(`/api/whatsapp-automation/digital-cards/${id}`, { method: "DELETE" });
  },
};
