import { DEFAULT_PRODUCT_KEY } from "@/core/products/catalog";

const FALLBACK_API_BASE_URL = "https://getworkzilla.com";

function normalizeBaseUrl(value: string | undefined) {
  const raw = String(value || "").trim();
  if (!raw) {
    return FALLBACK_API_BASE_URL;
  }
  return raw.replace(/\/+$/, "");
}

export const API_BASE_URL = normalizeBaseUrl(process.env.EXPO_PUBLIC_API_BASE_URL);
export { DEFAULT_PRODUCT_KEY };
export const WEBSITE_SIGNUP_URL = `${API_BASE_URL}/auth/signup/?next=/pricing/`;
export const WEBSITE_LOGIN_URL = `${API_BASE_URL}/auth/login/`;
export const WEBSITE_PRICING_URL = `${API_BASE_URL}/pricing/`;
export const FORGOT_PASSWORD_API_PATH = `/api/auth/forgot-password`;
