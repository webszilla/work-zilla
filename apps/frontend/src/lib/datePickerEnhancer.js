let observer = null;
let retryTimer = null;

function enhanceDateInput(input) {
  if (!input || input.dataset.wzDateEnhance === "off" || input.__wzFlatpickrInstance) {
    return;
  }
  if (input.disabled || input.readOnly) {
    return;
  }
  if (!window.flatpickr) {
    return;
  }
  const config = {
    dateFormat: "Y-m-d",
    allowInput: true,
    disableMobile: true,
    monthSelectorType: "dropdown",
  };
  if (input.min) {
    config.minDate = input.min;
  }
  if (input.max) {
    config.maxDate = input.max;
  }
  input.__wzFlatpickrInstance = window.flatpickr(input, config);
}

function enhanceAllDateInputs(root = document) {
  root.querySelectorAll?.("input[type='date']").forEach((input) => enhanceDateInput(input));
}

export function bindGlobalDatePickerEnhancer() {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return;
  }
  if (window.__wzDatePickerEnhancerBound) {
    return;
  }
  window.__wzDatePickerEnhancerBound = true;

  const bindNow = () => {
    if (!window.flatpickr) {
      retryTimer = window.setTimeout(bindNow, 400);
      return;
    }
    enhanceAllDateInputs(document);
    observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (!(mutation.target instanceof Element)) {
          return;
        }
        mutation.addedNodes.forEach((node) => {
          if (!(node instanceof Element)) {
            return;
          }
          if (node.matches?.("input[type='date']")) {
            enhanceDateInput(node);
          } else {
            enhanceAllDateInputs(node);
          }
        });
      });
    });
    observer.observe(document.body, { childList: true, subtree: true });
  };

  bindNow();
}

