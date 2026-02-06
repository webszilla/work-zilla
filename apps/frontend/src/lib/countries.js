import { PHONE_COUNTRIES } from "./phoneCountries.js";

const UNIQUE_NAMES = Array.from(new Set(PHONE_COUNTRIES.map((entry) => entry.label)));
UNIQUE_NAMES.sort((a, b) => a.localeCompare(b));

export const COUNTRY_OPTIONS = UNIQUE_NAMES;
