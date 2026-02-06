const COUNTRY_OPTIONS = [
  "India",
  "United States",
  "United Kingdom",
  "United Arab Emirates",
  "Canada",
  "Australia",
  "Singapore",
  "Malaysia",
  "South Africa",
  "Saudi Arabia"
];

const STATE_OPTIONS_BY_COUNTRY = {
  india: [
    "Andhra Pradesh",
    "Arunachal Pradesh",
    "Assam",
    "Bihar",
    "Chhattisgarh",
    "Goa",
    "Gujarat",
    "Haryana",
    "Himachal Pradesh",
    "Jharkhand",
    "Karnataka",
    "Kerala",
    "Madhya Pradesh",
    "Maharashtra",
    "Manipur",
    "Meghalaya",
    "Mizoram",
    "Nagaland",
    "Odisha",
    "Punjab",
    "Rajasthan",
    "Sikkim",
    "Tamil Nadu",
    "Telangana",
    "Tripura",
    "Uttar Pradesh",
    "Uttarakhand",
    "West Bengal",
    "Andaman and Nicobar Islands",
    "Chandigarh",
    "Dadra and Nagar Haveli and Daman and Diu",
    "Delhi",
    "Jammu and Kashmir",
    "Ladakh",
    "Lakshadweep",
    "Puducherry"
  ]
};

function normalizeCountry(value) {
  return String(value || "").trim().toLowerCase();
}

function setDatalistOptions(datalist, options) {
  if (!datalist) return;
  datalist.innerHTML = "";
  options.forEach((option) => {
    const item = document.createElement("option");
    item.value = option;
    datalist.appendChild(item);
  });
}

function setupCountryState(form) {
  const countryInput = form.querySelector("[data-country-input]");
  const stateInput = form.querySelector("[data-state-input]");
  const countryList = form.querySelector("#billing-country-options");
  const stateList = form.querySelector("#billing-state-options");

  setDatalistOptions(countryList, COUNTRY_OPTIONS);

  function refreshStateOptions() {
    const options = STATE_OPTIONS_BY_COUNTRY[normalizeCountry(countryInput?.value)] || [];
    setDatalistOptions(stateList, options);
    if (stateInput) {
      stateInput.disabled = !String(countryInput?.value || "").trim();
      if (!options.length && stateInput.value && !stateInput.disabled) {
        stateInput.value = stateInput.value;
      }
    }
  }

  if (countryInput) {
    countryInput.addEventListener("change", () => {
      refreshStateOptions();
      if (stateInput) stateInput.value = "";
    });
  }

  refreshStateOptions();
}

function splitPhoneValue(value) {
  const raw = String(value || "").trim();
  if (!raw) return { code: "+91", number: "" };
  const match = raw.match(/^(\+?\d{1,4})\s*(.*)$/);
  if (match) {
    return { code: match[1], number: match[2].trim() };
  }
  return { code: "+91", number: raw };
}

function setupPhoneFields(form) {
  const countryInput = form.querySelector("[data-phone-country]");
  const numberInput = form.querySelector("[data-phone-number]");
  const hiddenInput = form.querySelector("[data-phone-hidden]");
  const initialHidden = hiddenInput?.value || "";
  const initialParts = splitPhoneValue(initialHidden);

  if (countryInput && !countryInput.value) {
    countryInput.value = initialParts.code || "+91";
  }
  if (numberInput && !numberInput.value) {
    numberInput.value = initialParts.number || "";
  }

  function syncHidden() {
    if (!hiddenInput) return;
    const code = (countryInput?.value || "").trim();
    const number = (numberInput?.value || "").trim();
    hiddenInput.value = [code, number].filter(Boolean).join(" ").trim();
  }

  ["input", "change"].forEach((evt) => {
    countryInput?.addEventListener(evt, syncHidden);
    numberInput?.addEventListener(evt, syncHidden);
  });

  syncHidden();
}

function initAccountForms() {
  document.querySelectorAll("[data-account-form]").forEach((form) => {
    setupCountryState(form);
    setupPhoneFields(form);
  });
}

document.addEventListener("DOMContentLoaded", initAccountForms);
