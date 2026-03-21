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

const MANUAL_ISO_BY_LABEL = {
  "Aland Islands": "AX",
  "American Samoa": "AS",
  Antarctica: "AQ",
  "British Indian Ocean Territory": "IO",
  "British Virgin Islands": "VG",
  "Cocos (Keeling) Islands": "CC",
  "Congo (DRC)": "CD",
  "Congo (Republic)": "CG",
  "Cote d'Ivoire": "CI",
  Curacao: "CW",
  Eswatini: "SZ",
  "Falkland Islands": "FK",
  "Faroe Islands": "FO",
  "French Guiana": "GF",
  "French Polynesia": "PF",
  Guernsey: "GG",
  "Isle of Man": "IM",
  Jersey: "JE",
  Kosovo: "XK",
  Laos: "LA",
  Macao: "MO",
  Micronesia: "FM",
  Moldova: "MD",
  Palestine: "PS",
  Reunion: "RE",
  Russia: "RU",
  "Saint Barthelemy": "BL",
  "Saint Helena": "SH",
  "Saint Kitts and Nevis": "KN",
  "Saint Lucia": "LC",
  "Saint Martin": "MF",
  "Saint Pierre and Miquelon": "PM",
  "Saint Vincent and the Grenadines": "VC",
  "Sao Tome and Principe": "ST",
  "South Korea": "KR",
  "North Korea": "KP",
  Taiwan: "TW",
  "Timor-Leste": "TL",
  Turkey: "TR",
  "United Kingdom": "GB",
  "United States": "US",
  "Vatican City": "VA",
  "Wallis and Futuna": "WF",
  "Western Sahara": "EH",
};

function normalizeCountry(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizeCountryLabel(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, " and ")
    .replace(/[()]/g, " ")
    .replace(/[^a-z0-9]+/gi, " ")
    .trim()
    .toLowerCase();
}

function flagFromIso2(iso2) {
  const normalized = String(iso2 || "").trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(normalized)) {
    return "🌐";
  }
  const first = normalized.codePointAt(0) - 65 + 0x1f1e6;
  const second = normalized.codePointAt(1) - 65 + 0x1f1e6;
  return String.fromCodePoint(first, second);
}

const NORMALIZED_MANUAL_ISO_BY_LABEL = Object.entries(MANUAL_ISO_BY_LABEL).reduce((acc, [label, iso2]) => {
  acc[normalizeCountryLabel(label)] = String(iso2 || "").trim().toUpperCase();
  return acc;
}, {});

function buildIntlRegionMap() {
  const map = {};
  try {
    if (typeof Intl === "undefined" || typeof Intl.DisplayNames !== "function") {
      return map;
    }
    const display = new Intl.DisplayNames(["en"], { type: "region" });
    for (let first = 65; first <= 90; first += 1) {
      for (let second = 65; second <= 90; second += 1) {
        const iso2 = String.fromCharCode(first, second);
        let name = "";
        try {
          name = display.of(iso2);
        } catch {
          name = "";
        }
        if (!name || String(name).trim().toUpperCase() === iso2) continue;
        const key = normalizeCountryLabel(name);
        if (key && !map[key]) map[key] = iso2;
      }
    }
  } catch {
    return map;
  }
  return map;
}

const INTL_REGION_MAP = buildIntlRegionMap();

function resolveIso2FromLabel(label) {
  const key = normalizeCountryLabel(label);
  if (!key) return "";
  if (NORMALIZED_MANUAL_ISO_BY_LABEL[key]) return NORMALIZED_MANUAL_ISO_BY_LABEL[key];
  return INTL_REGION_MAP[key] || "";
}

function decoratePhoneCountryOptions(select) {
  if (!select || select.dataset.phoneFlagsReady === "1") {
    return;
  }
  Array.from(select.options || []).forEach((option) => {
    const rawText = String(option.textContent || "").trim();
    const code = String(option.value || "").trim();
    const label = rawText.replace(new RegExp(`${code.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`), "").trim();
    const iso2 = resolveIso2FromLabel(label);
    const flag = flagFromIso2(iso2);
    option.textContent = `${flag} ${label} ${code}`.trim();
  });
  select.dataset.phoneFlagsReady = "1";
}

function closePhoneCountryDropdown(container) {
  if (!container) return;
  container.classList.remove("is-open");
}

function buildPhoneCountryPicker(select) {
  if (!select || select.dataset.phonePickerReady === "1") {
    return;
  }
  decoratePhoneCountryOptions(select);
  select.dataset.phonePickerReady = "1";
  select.classList.add("phone-country-native");

  const wrapper = document.createElement("div");
  wrapper.className = "phone-country-picker";

  const trigger = document.createElement("button");
  trigger.type = "button";
  trigger.className = "phone-country-trigger";
  trigger.setAttribute("aria-label", "Choose country code");

  const dropdown = document.createElement("div");
  dropdown.className = "phone-country-dropdown";

  const search = document.createElement("input");
  search.type = "search";
  search.className = "phone-country-search";
  search.placeholder = "Search country or code";
  search.style.width = "100%";

  const list = document.createElement("div");
  list.className = "phone-country-list";

  function updateTrigger() {
    const selected = select.options[select.selectedIndex];
    const text = String(selected?.textContent || "").trim();
    const flagMatch = text.match(/^(\S+)/);
    trigger.textContent = flagMatch?.[1] || "🌐";
  }

  function buildList(query = "") {
    const normalizedQuery = String(query || "").trim().toLowerCase();
    list.innerHTML = "";
    Array.from(select.options || []).forEach((option) => {
      const text = String(option.textContent || "").trim();
      const value = String(option.value || "").trim();
      if (!text || !value) return;
      if (normalizedQuery && !text.toLowerCase().includes(normalizedQuery) && !value.toLowerCase().includes(normalizedQuery)) {
        return;
      }
      const item = document.createElement("button");
      item.type = "button";
      item.className = "phone-country-option";
      if (option.selected) {
        item.classList.add("is-selected");
      }
      item.innerHTML = `<span class="phone-country-option-label">${text}</span>`;
      item.addEventListener("click", () => {
        select.value = value;
        select.dispatchEvent(new Event("change", { bubbles: true }));
        buildList(search.value);
        updateTrigger();
        closePhoneCountryDropdown(wrapper);
      });
      list.appendChild(item);
    });
    if (!list.children.length) {
      const empty = document.createElement("div");
      empty.className = "phone-country-empty";
      empty.textContent = "No countries found.";
      list.appendChild(empty);
    }
  }

  trigger.addEventListener("click", () => {
    const isOpen = wrapper.classList.toggle("is-open");
    if (isOpen) {
      buildList(search.value);
      window.setTimeout(() => search.focus(), 0);
    }
  });

  search.addEventListener("input", () => {
    buildList(search.value);
  });

  document.addEventListener("click", (event) => {
    if (!wrapper.contains(event.target)) {
      closePhoneCountryDropdown(wrapper);
    }
  });

  select.addEventListener("change", () => {
    updateTrigger();
    buildList(search.value);
  });

  wrapper.appendChild(trigger);
  dropdown.appendChild(search);
  dropdown.appendChild(list);
  wrapper.appendChild(dropdown);
  select.parentNode.insertBefore(wrapper, select);
  wrapper.appendChild(select);
  updateTrigger();
  buildList("");
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
  const startCodeMatch = raw.match(/^(\+?\d{1,4})\s*(.*)$/);
  if (startCodeMatch) {
    return { code: startCodeMatch[1], number: startCodeMatch[2].trim() };
  }
  const inlineCodeMatch = raw.match(/(\+\d{1,4})/);
  if (inlineCodeMatch) {
    const code = inlineCodeMatch[1];
    const number = raw
      .slice(raw.indexOf(code) + code.length)
      .replace(/^[^0-9]*/, "")
      .trim();
    return { code, number };
  }
  const numberMatch = raw.match(/([0-9][0-9\s-]{5,})$/);
  if (numberMatch) {
    return { code: "+91", number: numberMatch[1].trim() };
  }
  return { code: "+91", number: raw.replace(/[^0-9\s-]/g, "").trim() };
}

function setupPhoneFields(form) {
  const countryInput = form.querySelector("[data-phone-country]");
  const numberInput = form.querySelector("[data-phone-number]");
  const hiddenInput = form.querySelector("[data-phone-hidden]");
  const initialHidden = hiddenInput?.value || "";
  const initialParts = splitPhoneValue(initialHidden);
  const preferNativePicker = String(countryInput?.dataset?.phonePicker || "").toLowerCase() === "native";

  if (!preferNativePicker) {
    buildPhoneCountryPicker(countryInput);
  } else {
    decoratePhoneCountryOptions(countryInput);
  }

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

function findFieldLabel(form, field) {
  if (!field || !form) return null;
  const fieldId = String(field.id || "").trim();
  if (fieldId) {
    const byFor = form.querySelector(`label[for="${fieldId}"]`);
    if (byFor) return byFor;
  }
  const scope = field.closest(".form-field, .mb-3, .mb-2, .ticket-form-row, .col, .row, .form-group, div");
  if (!scope) return null;
  return scope.querySelector("label");
}

function markRequiredLabels() {
  const forms = document.querySelectorAll("form");
  forms.forEach((form) => {
    const fields = form.querySelectorAll("input, select, textarea");
    fields.forEach((field) => {
      if (!(field instanceof HTMLElement) || !field.willValidate || !field.required || field.disabled) {
        return;
      }
      const fieldType = String(field.getAttribute("type") || "").toLowerCase();
      if (fieldType === "hidden" || fieldType === "button" || fieldType === "submit" || fieldType === "reset") {
        return;
      }
      const label = findFieldLabel(form, field);
      if (!label) return;
      if (label.querySelector(".field-required-marker")) return;
      if (label.textContent && label.textContent.includes("*")) return;
      const marker = document.createElement("span");
      marker.className = "field-required-marker";
      marker.textContent = " *";
      marker.setAttribute("aria-hidden", "true");
      label.appendChild(marker);
    });
  });
}

function attachRequiredValidation() {
  const forms = document.querySelectorAll("form");
  forms.forEach((form) => {
    if (form.dataset.requiredValidationBound === "1") {
      return;
    }
    form.dataset.requiredValidationBound = "1";
    form.addEventListener("submit", (event) => {
      if (!(form instanceof HTMLFormElement)) {
        return;
      }
      if (form.checkValidity()) {
        return;
      }
      event.preventDefault();
      const firstInvalid = form.querySelector(":invalid");
      if (firstInvalid instanceof HTMLElement) {
        firstInvalid.focus();
      }
      form.reportValidity();
    });
  });
}

function initAccountForms() {
  markRequiredLabels();
  attachRequiredValidation();
  document.querySelectorAll("[data-account-form]").forEach((form) => {
    setupCountryState(form);
    setupPhoneFields(form);
  });
}

document.addEventListener("DOMContentLoaded", initAccountForms);
