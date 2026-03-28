const LISTENER_KEY = "__wzRequiredFieldValidation";
const FORM_ALERT_SELECTOR = "[data-wz-form-required-alert]";
const FORM_ALERT_TEXT = "Please fill mandatory fields.";

function normalizeIsoDate(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const dmy = raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (!dmy) return "";
  const day = Number(dmy[1]);
  const month = Number(dmy[2]);
  const year = Number(dmy[3]);
  const parsed = new Date(year, month - 1, day);
  if (parsed.getFullYear() !== year || parsed.getMonth() !== month - 1 || parsed.getDate() !== day) {
    return "";
  }
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function normalizeIsoTime(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const hm = raw.match(/^(\d{1,2}):(\d{2})$/);
  if (hm) {
    const hours = Number(hm[1]);
    const minutes = Number(hm[2]);
    if (Number.isFinite(hours) && Number.isFinite(minutes) && hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59) {
      return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
    }
  }
  const ampm = raw.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!ampm) return "";
  let hours = Number(ampm[1]);
  const minutes = Number(ampm[2]);
  const suffix = String(ampm[3] || "").toUpperCase();
  if (!Number.isFinite(hours) || !Number.isFinite(minutes) || hours < 1 || hours > 12 || minutes < 0 || minutes > 59) {
    return "";
  }
  if (suffix === "PM" && hours < 12) hours += 12;
  if (suffix === "AM" && hours === 12) hours = 0;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function getFlatpickrSyncedValue(control) {
  if (!(control instanceof HTMLInputElement)) {
    return String(control?.value || "").trim();
  }
  const picker = control.__wzFlatpickrInstance;
  if (!picker) {
    return String(control.value || "").trim();
  }
  const inputType = String(control.type || "").toLowerCase();
  const altValue = String(picker.altInput?.value || "").trim();
  const rawValue = String(control.value || "").trim();
  if (inputType === "date") {
    const normalized = normalizeIsoDate(rawValue) || normalizeIsoDate(altValue);
    if (normalized && control.value !== normalized) {
      control.value = normalized;
    }
    return normalized;
  }
  if (inputType === "time") {
    const normalized = normalizeIsoTime(rawValue) || normalizeIsoTime(altValue);
    if (normalized && control.value !== normalized) {
      control.value = normalized;
    }
    return normalized;
  }
  return rawValue || altValue;
}

function isSupportedControl(node) {
  return (
    node instanceof HTMLInputElement
    || node instanceof HTMLSelectElement
    || node instanceof HTMLTextAreaElement
  );
}

function isHiddenControl(control) {
  if (!(control instanceof HTMLElement)) return false;
  if (control.type === "hidden") return true;
  if (control.closest("[hidden], .d-none")) return true;
  return false;
}

function hasRequiredLabelMarker(control) {
  const labels = getAssociatedLabels(control);
  return labels.some((label) => /\*/.test(String(label?.textContent || "")));
}

function isMarkedRequired(control) {
  if (!isSupportedControl(control)) return false;
  if (control.required) return true;
  const ariaRequired = String(control.getAttribute("aria-required") || "").trim().toLowerCase();
  if (ariaRequired === "true") return true;
  const dataRequired = String(control.getAttribute("data-required") || "").trim().toLowerCase();
  if (dataRequired === "true") return true;
  return hasRequiredLabelMarker(control);
}

function shouldValidate(control) {
  if (!isSupportedControl(control)) return false;
  if (String(control.getAttribute("data-wz-required-ignore") || "").trim().toLowerCase() === "true") return false;
  if (!isMarkedRequired(control)) return false;
  if (control.disabled || control.readOnly) return false;
  if (isHiddenControl(control)) return false;
  return true;
}

function getAssociatedLabels(control) {
  const labels = new Set(Array.from(control.labels || []));
  const id = String(control.id || "").trim();
  if (id) {
    document.querySelectorAll(`label[for="${id}"]`).forEach((label) => labels.add(label));
  }
  let container = control.parentElement;
  for (let i = 0; i < 4 && container; i += 1) {
    const directLabel = container.querySelector(":scope > .form-label");
    if (directLabel) {
      labels.add(directLabel);
      break;
    }
    container = container.parentElement;
  }
  return Array.from(labels);
}

function setValidationState(control, invalid) {
  control.classList.toggle("is-invalid", Boolean(invalid));
  control.setAttribute("aria-invalid", invalid ? "true" : "false");
  getAssociatedLabels(control).forEach((label) => {
    label.classList.toggle("wz-required-invalid", Boolean(invalid));
  });
}

function hasNearbySelectedChip(control) {
  let container = control.parentElement;
  for (let i = 0; i < 5 && container; i += 1) {
    if (container.querySelector(".wz-selected-chip")) {
      return true;
    }
    container = container.parentElement;
  }
  return false;
}

function validateRequiredControl(control, { force = false } = {}) {
  if (!shouldValidate(control)) {
    if (isSupportedControl(control)) {
      setValidationState(control, false);
    }
    return true;
  }
  if (!force && !control.classList.contains("is-invalid")) {
    return true;
  }
  const value = "value" in control ? getFlatpickrSyncedValue(control) : "";
  let valid = value.length > 0;
  if (!valid && control instanceof HTMLInputElement && control.type === "search") {
    valid = hasNearbySelectedChip(control);
  }
  if (control instanceof HTMLInputElement && (control.type === "checkbox" || control.type === "radio")) {
    valid = control.checked;
  }
  if (control.required) {
    valid = valid && control.checkValidity();
  }
  setValidationState(control, !valid);
  return valid;
}

function collectRequiredControls(form) {
  if (!(form instanceof HTMLFormElement)) return [];
  return Array.from(form.querySelectorAll("input, select, textarea")).filter((control) => shouldValidate(control));
}

function ensureNoValidate(form) {
  if (!(form instanceof HTMLFormElement)) return;
  if (!form.hasAttribute("novalidate")) {
    form.setAttribute("novalidate", "novalidate");
  }
}

function getControlLabelText(control) {
  const label = getAssociatedLabels(control).find((item) => String(item?.textContent || "").trim());
  return String(label?.textContent || "")
    .replace(/\s+/g, " ")
    .replace(/\*/g, "")
    .trim();
}

function buildMissingFieldsText(controls) {
  const labels = Array.from(new Set(
    controls
      .map((control) => getControlLabelText(control))
      .filter(Boolean)
  ));
  if (!labels.length) return FORM_ALERT_TEXT;
  return `${FORM_ALERT_TEXT} ${labels.join(", ")}`;
}

function upsertFormAlert(form, message) {
  if (!(form instanceof HTMLFormElement)) return;
  let alertNode = form.querySelector(FORM_ALERT_SELECTOR);
  if (!alertNode) {
    alertNode = document.createElement("div");
    alertNode.setAttribute("data-wz-form-required-alert", "true");
    alertNode.className = "alert alert-danger py-2 px-3 mb-3";
    alertNode.setAttribute("role", "alert");
    form.prepend(alertNode);
  }
  alertNode.textContent = String(message || FORM_ALERT_TEXT).trim();
}

function clearFormAlert(form) {
  if (!(form instanceof HTMLFormElement)) return;
  const alertNode = form.querySelector(FORM_ALERT_SELECTOR);
  if (alertNode) {
    alertNode.remove();
  }
}

function validateFormRequiredControls(form, { focusFirstInvalid = false } = {}) {
  const requiredControls = collectRequiredControls(form);
  if (!requiredControls.length) {
    clearFormAlert(form);
    return { valid: true, invalidControls: [] };
  }
  const invalidControls = [];
  requiredControls.forEach((control) => {
    const valid = validateRequiredControl(control, { force: true });
    if (!valid) {
      invalidControls.push(control);
    }
  });
  if (invalidControls.length) {
    upsertFormAlert(form, buildMissingFieldsText(invalidControls));
    if (focusFirstInvalid) {
      invalidControls[0].focus();
    }
    return { valid: false, invalidControls };
  }
  clearFormAlert(form);
  return { valid: true, invalidControls: [] };
}

export function bindGlobalRequiredFieldValidation() {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return () => {};
  }
  const existing = window[LISTENER_KEY];
  if (existing?.bound) {
    return existing.cleanup;
  }

  document.querySelectorAll("form").forEach((form) => ensureNoValidate(form));
  const formObserver = new MutationObserver((mutationList) => {
    mutationList.forEach((mutation) => {
      mutation.addedNodes.forEach((node) => {
        if (!(node instanceof HTMLElement)) return;
        if (node.tagName === "FORM") {
          ensureNoValidate(node);
        }
        node.querySelectorAll?.("form").forEach((form) => ensureNoValidate(form));
      });
    });
  });
  formObserver.observe(document.body, { childList: true, subtree: true });

  const onInput = (event) => {
    const control = event.target;
    if (!isSupportedControl(control)) return;
    validateRequiredControl(control, { force: false });
    const form = control.form;
    if (!(form instanceof HTMLFormElement)) return;
    if (form.querySelector(FORM_ALERT_SELECTOR)) {
      validateFormRequiredControls(form, { focusFirstInvalid: false });
    }
  };

  const onBlur = (event) => {
    const control = event.target;
    if (!isSupportedControl(control)) return;
    validateRequiredControl(control, { force: true });
  };

  const onSubmit = (event) => {
    const form = event.target;
    if (!(form instanceof HTMLFormElement)) return;
    ensureNoValidate(form);
    const result = validateFormRequiredControls(form, { focusFirstInvalid: true });
    if (!result.valid) {
      event.preventDefault();
      event.stopPropagation();
    }
  };

  document.addEventListener("input", onInput, true);
  document.addEventListener("change", onInput, true);
  document.addEventListener("blur", onBlur, true);
  document.addEventListener("submit", onSubmit, true);

  const cleanup = () => {
    document.removeEventListener("input", onInput, true);
    document.removeEventListener("change", onInput, true);
    document.removeEventListener("blur", onBlur, true);
    document.removeEventListener("submit", onSubmit, true);
    formObserver.disconnect();
    if (window[LISTENER_KEY]?.cleanup === cleanup) {
      delete window[LISTENER_KEY];
    }
  };

  window[LISTENER_KEY] = { bound: true, cleanup };
  return cleanup;
}
