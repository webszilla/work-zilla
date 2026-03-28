let observer = null;

function normalizeSelectPlaceholder(select) {
  if (!(select instanceof HTMLSelectElement)) {
    return;
  }
  const emptyOption = Array.from(select.options || []).find((option) => String(option.value || "").trim() === "");
  if (!emptyOption) {
    return;
  }
  const label = String(emptyOption.textContent || "").trim();
  if (!label) {
    return;
  }
  if (/^select\b/i.test(label) && label.toLowerCase() !== "select") {
    emptyOption.textContent = "Select";
  }
}

function normalizeAll(root = document) {
  root.querySelectorAll?.("select").forEach((select) => normalizeSelectPlaceholder(select));
}

export function bindGlobalSelectPlaceholderShortener() {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return;
  }
  if (window.__wzGlobalSelectPlaceholderShortenerBound) {
    return;
  }
  window.__wzGlobalSelectPlaceholderShortenerBound = true;
  normalizeAll(document);
  observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      mutation.addedNodes.forEach((node) => {
        if (!(node instanceof Element)) {
          return;
        }
        if (node.matches?.("select")) {
          normalizeSelectPlaceholder(node);
          return;
        }
        normalizeAll(node);
      });
    });
  });
  observer.observe(document.body, { childList: true, subtree: true });
}
