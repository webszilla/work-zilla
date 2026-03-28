const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i;
const FEEDBACK_SELECTOR = "[data-email-feedback]";
const LISTENER_KEY = "__wzEmailRealtimeValidation";

function getTextParts(input) {
  return [
    input.type || "",
    input.name || "",
    input.id || "",
    input.placeholder || "",
    input.getAttribute("aria-label") || "",
    input.autocomplete || ""
  ]
    .join(" ")
    .toLowerCase();
}

function isEmailCandidate(input) {
  if (!(input instanceof HTMLInputElement)) return false;
  if (input.disabled || input.readOnly) return false;
  if (input.dataset?.skipEmailValidation === "true") return false;
  if (input.type === "email") return true;
  const text = getTextParts(input);
  return /\bemail\b/.test(text);
}

function ensureFeedbackNode(input) {
  if (!input?.parentElement) return null;
  let node = input.parentElement.querySelector(FEEDBACK_SELECTOR);
  if (node) return node;
  node = document.createElement("div");
  node.dataset.emailFeedback = "true";
  node.className = "text-danger small mt-1";
  node.style.display = "none";
  input.parentElement.appendChild(node);
  return node;
}

function setEmailError(input, message) {
  input.setCustomValidity(message || "");
  if (message) {
    input.classList.add("is-invalid");
    const feedback = ensureFeedbackNode(input);
    if (feedback) {
      feedback.textContent = message;
      feedback.style.display = "block";
    }
    return false;
  }
  input.classList.remove("is-invalid");
  const feedback = input.parentElement?.querySelector(FEEDBACK_SELECTOR);
  if (feedback) {
    feedback.textContent = "";
    feedback.style.display = "none";
  }
  return true;
}

function validateEmailInput(input, { showRequired = false } = {}) {
  if (!isEmailCandidate(input)) return true;
  const rawValue = String(input.value || "");
  const value = rawValue.trim();
  if (!value) {
    return setEmailError(input, "");
  }
  if (!EMAIL_REGEX.test(value)) {
    return setEmailError(input, "Enter a valid email address.");
  }
  return setEmailError(input, "");
}

function collectEmailInputs(form) {
  if (!(form instanceof HTMLFormElement)) return [];
  return Array.from(form.querySelectorAll("input")).filter((input) => isEmailCandidate(input));
}

export function bindGlobalEmailRealtimeValidation() {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return () => {};
  }
  const existing = window[LISTENER_KEY];
  if (existing?.bound) {
    return existing.cleanup;
  }

  const onInput = (event) => {
    const input = event.target;
    if (!(input instanceof HTMLInputElement)) return;
    validateEmailInput(input, { showRequired: false });
  };

  const onBlur = (event) => {
    const input = event.target;
    if (!(input instanceof HTMLInputElement)) return;
    validateEmailInput(input, { showRequired: true });
  };

  const onSubmit = (event) => {
    const form = event.target;
    if (!(form instanceof HTMLFormElement)) return;
    const inputs = collectEmailInputs(form);
    if (!inputs.length) return;
    let firstInvalid = null;
    for (const input of inputs) {
      const valid = validateEmailInput(input, { showRequired: true });
      if (!valid && !firstInvalid) {
        firstInvalid = input;
      }
    }
    if (firstInvalid) {
      event.preventDefault();
      event.stopPropagation();
      firstInvalid.focus();
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
    if (window[LISTENER_KEY]?.cleanup === cleanup) {
      delete window[LISTENER_KEY];
    }
  };

  window[LISTENER_KEY] = { bound: true, cleanup };
  return cleanup;
}
