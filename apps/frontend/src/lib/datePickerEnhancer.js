let observer = null;
let retryTimer = null;

function setInputValueAndDispatch(input, nextValue) {
  if (!(input instanceof HTMLInputElement)) {
    return;
  }
  const normalizedNext = String(nextValue || "");
  const previousValue = String(input.value || "");
  const prototype = Object.getPrototypeOf(input);
  const descriptor = Object.getOwnPropertyDescriptor(prototype, "value");
  if (descriptor && typeof descriptor.set === "function") {
    descriptor.set.call(input, normalizedNext);
  } else {
    input.value = normalizedNext;
  }
  const tracker = input._valueTracker;
  if (tracker && typeof tracker.setValue === "function") {
    tracker.setValue(previousValue);
  }
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

function toIsoDate(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    return "";
  }
  const year = String(date.getFullYear());
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function normalizePickerDateValue(selectedDates, dateStr) {
  const primaryDate = Array.isArray(selectedDates) ? selectedDates[0] : null;
  const fromSelected = toIsoDate(primaryDate);
  if (fromSelected) {
    return fromSelected;
  }
  const normalizedRaw = String(dateStr || "").trim();
  if (!normalizedRaw) {
    return "";
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(normalizedRaw)) {
    return normalizedRaw;
  }
  const dayMonthYearMatch = normalizedRaw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (dayMonthYearMatch) {
    const day = Number(dayMonthYearMatch[1]);
    const month = Number(dayMonthYearMatch[2]);
    const year = Number(dayMonthYearMatch[3]);
    const parsed = new Date(year, month - 1, day);
    if (parsed.getFullYear() === year && parsed.getMonth() === month - 1 && parsed.getDate() === day) {
      return toIsoDate(parsed);
    }
  }
  return "";
}

function toIsoTime(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    return "";
  }
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${hours}:${minutes}`;
}

function normalizePickerTimeValue(selectedDates, dateStr) {
  const primaryDate = Array.isArray(selectedDates) ? selectedDates[0] : null;
  const fromSelected = toIsoTime(primaryDate);
  if (fromSelected) {
    return fromSelected;
  }
  const normalizedRaw = String(dateStr || "").trim();
  if (!normalizedRaw) {
    return "";
  }
  const isoMatch = normalizedRaw.match(/^(\d{1,2}):(\d{2})$/);
  if (isoMatch) {
    const hours = Number(isoMatch[1]);
    const minutes = Number(isoMatch[2]);
    if (Number.isFinite(hours) && Number.isFinite(minutes) && hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59) {
      return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
    }
  }
  const amPmMatch = normalizedRaw.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (amPmMatch) {
    let hours = Number(amPmMatch[1]);
    const minutes = Number(amPmMatch[2]);
    const suffix = String(amPmMatch[3] || "").toUpperCase();
    if (!Number.isFinite(hours) || !Number.isFinite(minutes) || hours < 1 || hours > 12 || minutes < 0 || minutes > 59) {
      return "";
    }
    if (suffix === "PM" && hours < 12) hours += 12;
    if (suffix === "AM" && hours === 12) hours = 0;
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
  }
  return "";
}

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
    altInput: true,
    altFormat: "d-m-Y",
    dateFormat: "Y-m-d",
    allowInput: false,
    disableMobile: true,
    monthSelectorType: "dropdown",
    onValueUpdate: (selectedDates, dateStr) => {
      const nextValue = normalizePickerDateValue(selectedDates, dateStr);
      setInputValueAndDispatch(input, nextValue);
    },
  };
  if (input.dataset.wzHideDisabledDates === "true") {
    const applyHiddenDisabledDateMode = (_selectedDates, _dateStr, instance) => {
      instance?.calendarContainer?.classList.add("wz-hide-disabled-dates");
    };
    const hidePastDateCells = (_selectedDates, _dateStr, instance, dayElem) => {
      if (!instance || !dayElem || !instance.config?.minDate) {
        return;
      }
      const minDate = instance.config.minDate instanceof Date
        ? instance.config.minDate
        : new Date(instance.config.minDate);
      const dayDate = dayElem.dateObj instanceof Date ? dayElem.dateObj : null;
      if (!(minDate instanceof Date) || Number.isNaN(minDate.getTime()) || !dayDate || Number.isNaN(dayDate.getTime())) {
        return;
      }
      if (dayDate < minDate) {
        dayElem.classList.add("wz-flatpickr-hidden-day");
      }
    };
    config.onReady = applyHiddenDisabledDateMode;
    config.onOpen = applyHiddenDisabledDateMode;
    config.onDayCreate = hidePastDateCells;
  }
  if (input.min) {
    config.minDate = input.min;
  }
  if (input.max) {
    config.maxDate = input.max;
  }
  input.__wzFlatpickrInstance = window.flatpickr(input, config);
}

function enhanceTimeInput(input) {
  if (!input || input.dataset.wzTimeEnhance === "off" || input.__wzFlatpickrInstance) {
    return;
  }
  if (input.disabled || input.readOnly) {
    return;
  }
  if (!window.flatpickr) {
    return;
  }
  const config = {
    enableTime: true,
    noCalendar: true,
    altInput: true,
    altFormat: "h:i K",
    dateFormat: "H:i",
    time_24hr: false,
    allowInput: false,
    disableMobile: true,
    minuteIncrement: 1,
    onValueUpdate: (selectedDates, dateStr) => {
      const nextValue = normalizePickerTimeValue(selectedDates, dateStr);
      setInputValueAndDispatch(input, nextValue);
    },
  };
  input.__wzFlatpickrInstance = window.flatpickr(input, config);
}

function enhanceAllDateInputs(root = document) {
  root.querySelectorAll?.("input[type='date']").forEach((input) => enhanceDateInput(input));
  root.querySelectorAll?.("input[type='time']").forEach((input) => enhanceTimeInput(input));
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
          } else if (node.matches?.("input[type='time']")) {
            enhanceTimeInput(node);
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
