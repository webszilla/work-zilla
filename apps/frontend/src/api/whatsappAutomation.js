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
};
