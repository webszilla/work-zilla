const ORG_CURRENCY_KEY = "wz_org_currency";
const FALLBACK_CURRENCY = "INR";
const FALLBACK_CURRENCY_CODES = [
  "INR", "USD", "EUR", "AED", "SGD", "GBP", "AUD", "CAD", "JPY", "CNY",
  "CHF", "SAR", "QAR", "KWD", "OMR", "BHD", "NZD", "MYR", "THB", "IDR",
  "PHP", "ZAR", "NGN", "KES", "EGP", "TRY", "PLN", "SEK", "NOK", "DKK",
  "HKD", "KRW", "VND", "BRL", "MXN", "ARS", "CLP", "COP", "PKR", "BDT"
];

function normalizeCurrency(value) {
  const code = String(value || "").trim().toUpperCase();
  return /^[A-Z]{3}$/.test(code) ? code : FALLBACK_CURRENCY;
}

export function getCurrencyCodeOptions() {
  try {
    if (typeof Intl !== "undefined" && typeof Intl.supportedValuesOf === "function") {
      return Array.from(
        new Set(
          Intl.supportedValuesOf("currency")
            .map((code) => String(code || "").trim().toUpperCase())
            .filter(Boolean)
        )
      ).sort();
    }
  } catch (_error) {
    // Fallback below.
  }
  return [...FALLBACK_CURRENCY_CODES];
}

export function setOrgCurrency(value) {
  const normalized = normalizeCurrency(value);
  if (typeof window !== "undefined") {
    window.localStorage.setItem(ORG_CURRENCY_KEY, normalized);
  }
  return normalized;
}

export function getOrgCurrency() {
  if (typeof window === "undefined") {
    return FALLBACK_CURRENCY;
  }
  const stored = window.localStorage.getItem(ORG_CURRENCY_KEY);
  return setOrgCurrency(stored || FALLBACK_CURRENCY);
}

export function formatCurrencyAmount(amount, currency = FALLBACK_CURRENCY, locale = "en-IN") {
  const numericValue = Number(amount || 0);
  const safeValue = Number.isFinite(numericValue) ? numericValue : 0;
  const normalizedCurrency = normalizeCurrency(currency || FALLBACK_CURRENCY);
  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency: normalizedCurrency,
      maximumFractionDigits: 2,
    }).format(safeValue);
  } catch (_error) {
    return `${normalizedCurrency} ${safeValue.toLocaleString(locale, { maximumFractionDigits: 2 })}`;
  }
}

