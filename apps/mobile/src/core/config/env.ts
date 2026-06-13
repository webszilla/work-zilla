import { DEFAULT_PRODUCT_KEY } from "@/core/products/catalog";

export const API_BASE_URL = "http://localhost:8000";
export { DEFAULT_PRODUCT_KEY };
export const WEBSITE_SIGNUP_URL = `${API_BASE_URL}/auth/signup/?next=/pricing/`;
export const WEBSITE_LOGIN_URL = `${API_BASE_URL}/auth/login/`;
export const WEBSITE_PRICING_URL = `${API_BASE_URL}/pricing/`;
export const FORGOT_PASSWORD_API_PATH = `/api/auth/forgot-password`;
