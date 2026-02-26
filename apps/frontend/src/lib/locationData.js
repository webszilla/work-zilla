import { PHONE_COUNTRIES } from "./phoneCountries.js";

const PRIORITY_COUNTRIES = [
  "India",
  "United States",
  "United Arab Emirates",
  "United Kingdom",
  "Singapore",
  "Australia",
  "Canada",
];

export const COUNTRY_OPTIONS = Array.from(
  new Set(PHONE_COUNTRIES.map((item) => String(item?.label || "").trim()).filter(Boolean))
).sort((a, b) => {
  const ai = PRIORITY_COUNTRIES.indexOf(a);
  const bi = PRIORITY_COUNTRIES.indexOf(b);
  if (ai !== -1 || bi !== -1) {
    if (ai === -1) return 1;
    if (bi === -1) return -1;
    return ai - bi;
  }
  return a.localeCompare(b);
});

export const DIAL_CODE_OPTIONS = Array.from(
  new Set(PHONE_COUNTRIES.map((item) => String(item?.code || "").trim()).filter(Boolean))
).sort((a, b) => {
  if (a === "+91") return -1;
  if (b === "+91") return 1;
  return a.localeCompare(b, undefined, { numeric: true });
});

function preferredCountryNameForDialCode(code) {
  const normalized = String(code || "").trim();
  if (!normalized) {
    return "";
  }
  const matches = PHONE_COUNTRIES
    .filter((item) => String(item?.code || "").trim() === normalized)
    .map((item) => String(item?.label || "").trim())
    .filter(Boolean);
  if (!matches.length) {
    return "";
  }
  const unique = Array.from(new Set(matches));
  const prioritized = unique.find((name) => PRIORITY_COUNTRIES.includes(name));
  return prioritized || unique[0];
}

export function getDialCodeDisplayLabel(code) {
  const normalized = String(code || "").trim();
  if (!normalized) {
    return "";
  }
  const country = preferredCountryNameForDialCode(normalized);
  return country ? `${country} ${normalized}` : normalized;
}

export const DIAL_CODE_LABEL_OPTIONS = DIAL_CODE_OPTIONS.map((code) => ({
  value: code,
  label: getDialCodeDisplayLabel(code),
}));

const STATE_OPTIONS_BY_COUNTRY = {
  India: [
    "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chhattisgarh", "Goa", "Gujarat", "Haryana",
    "Himachal Pradesh", "Jharkhand", "Karnataka", "Kerala", "Madhya Pradesh", "Maharashtra", "Manipur",
    "Meghalaya", "Mizoram", "Nagaland", "Odisha", "Punjab", "Rajasthan", "Sikkim", "Tamil Nadu", "Telangana",
    "Tripura", "Uttar Pradesh", "Uttarakhand", "West Bengal", "Andaman and Nicobar Islands", "Chandigarh",
    "Dadra and Nagar Haveli and Daman and Diu", "Delhi", "Jammu and Kashmir", "Ladakh", "Lakshadweep",
    "Puducherry",
  ],
  "United States": [
    "Alabama","Alaska","Arizona","Arkansas","California","Colorado","Connecticut","Delaware","Florida","Georgia",
    "Hawaii","Idaho","Illinois","Indiana","Iowa","Kansas","Kentucky","Louisiana","Maine","Maryland",
    "Massachusetts","Michigan","Minnesota","Mississippi","Missouri","Montana","Nebraska","Nevada","New Hampshire",
    "New Jersey","New Mexico","New York","North Carolina","North Dakota","Ohio","Oklahoma","Oregon","Pennsylvania",
    "Rhode Island","South Carolina","South Dakota","Tennessee","Texas","Utah","Vermont","Virginia","Washington",
    "West Virginia","Wisconsin","Wyoming",
  ],
  Canada: [
    "Alberta","British Columbia","Manitoba","New Brunswick","Newfoundland and Labrador","Nova Scotia",
    "Ontario","Prince Edward Island","Quebec","Saskatchewan","Northwest Territories","Nunavut","Yukon",
  ],
  Australia: [
    "New South Wales", "Victoria", "Queensland", "Western Australia", "South Australia", "Tasmania",
    "Australian Capital Territory", "Northern Territory",
  ],
  "United Arab Emirates": ["Abu Dhabi", "Ajman", "Dubai", "Fujairah", "Ras Al Khaimah", "Sharjah", "Umm Al Quwain"],
  "United Kingdom": ["England", "Scotland", "Wales", "Northern Ireland"],
  Singapore: ["Central Region", "East Region", "North Region", "North-East Region", "West Region"],
  Malaysia: [
    "Johor","Kedah","Kelantan","Malacca","Negeri Sembilan","Pahang","Penang","Perak","Perlis","Sabah","Sarawak",
    "Selangor","Terengganu","Kuala Lumpur","Labuan","Putrajaya",
  ],
  "Saudi Arabia": [
    "Riyadh","Makkah","Madinah","Eastern Province","Asir","Tabuk","Qassim","Hail","Jazan","Najran",
    "Al Bahah","Al Jawf","Northern Borders",
  ],
  "South Africa": ["Eastern Cape","Free State","Gauteng","KwaZulu-Natal","Limpopo","Mpumalanga","Northern Cape","North West","Western Cape"],
  Germany: ["Baden-Wurttemberg","Bavaria","Berlin","Brandenburg","Bremen","Hamburg","Hesse","Lower Saxony","Mecklenburg-Vorpommern","North Rhine-Westphalia","Rhineland-Palatinate","Saarland","Saxony","Saxony-Anhalt","Schleswig-Holstein","Thuringia"],
};

export function getStateOptionsForCountry(countryName) {
  const key = String(countryName || "").trim();
  return STATE_OPTIONS_BY_COUNTRY[key] || [];
}
