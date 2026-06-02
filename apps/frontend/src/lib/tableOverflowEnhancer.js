let mutationObserver = null;
let resizeObserver = null;
let rafId = 0;

const TABLE_WRAPPER_SELECTOR = ".table-responsive, .wz-data-table-wrap";

function hasHorizontalOverflow(wrapper) {
  if (!(wrapper instanceof HTMLElement)) {
    return false;
  }
  const tableNode = wrapper.querySelector(":scope > table, :scope > .table, :scope > .wz-data-table, :scope table");
  const contentNode = tableNode instanceof HTMLElement ? tableNode : wrapper.firstElementChild;
  if (!(contentNode instanceof HTMLElement)) {
    return false;
  }
  return (contentNode.scrollWidth - wrapper.clientWidth) > 2;
}

function updateWrapperOverflowState(wrapper) {
  if (!(wrapper instanceof HTMLElement)) {
    return;
  }
  wrapper.dataset.wzOverflowX = hasHorizontalOverflow(wrapper) ? "true" : "false";
}

function normalizeAll(root = document) {
  root.querySelectorAll?.(TABLE_WRAPPER_SELECTOR).forEach((wrapper) => updateWrapperOverflowState(wrapper));
}

function queueNormalize(root = document) {
  if (rafId) {
    window.cancelAnimationFrame(rafId);
  }
  rafId = window.requestAnimationFrame(() => {
    rafId = 0;
    normalizeAll(root);
  });
}

export function bindGlobalTableOverflowEnhancer() {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return;
  }
  if (window.__wzGlobalTableOverflowEnhancerBound) {
    return;
  }
  window.__wzGlobalTableOverflowEnhancerBound = true;

  normalizeAll(document);

  mutationObserver = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      if (mutation.type === "attributes" && mutation.target instanceof HTMLElement) {
        const wrapper = mutation.target.closest?.(TABLE_WRAPPER_SELECTOR);
        if (wrapper) {
          updateWrapperOverflowState(wrapper);
        }
      }
      mutation.addedNodes.forEach((node) => {
        if (!(node instanceof Element)) {
          return;
        }
        if (node.matches?.(TABLE_WRAPPER_SELECTOR)) {
          updateWrapperOverflowState(node);
          return;
        }
        if (node.querySelector?.(TABLE_WRAPPER_SELECTOR)) {
          normalizeAll(node);
          return;
        }
        const wrapper = node.closest?.(TABLE_WRAPPER_SELECTOR);
        if (wrapper) {
          updateWrapperOverflowState(wrapper);
        }
      });
    });
  });

  mutationObserver.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["class", "style"],
  });

  resizeObserver = new ResizeObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.target instanceof HTMLElement) {
        updateWrapperOverflowState(entry.target);
      }
    });
  });

  document.querySelectorAll(TABLE_WRAPPER_SELECTOR).forEach((wrapper) => {
    if (wrapper instanceof HTMLElement) {
      resizeObserver.observe(wrapper);
      const tableNode = wrapper.querySelector(":scope > table, :scope > .table, :scope > .wz-data-table, :scope table");
      if (tableNode instanceof HTMLElement) {
        resizeObserver.observe(tableNode);
      }
    }
  });

  window.addEventListener("resize", () => queueNormalize(document), { passive: true });
  queueNormalize(document);
}
