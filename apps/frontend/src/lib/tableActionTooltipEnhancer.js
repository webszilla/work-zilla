let observer = null;

function isTableActionElement(node) {
  if (!(node instanceof Element)) {
    return false;
  }
  return Boolean(node.closest("td.table-actions, th.table-actions, .table-actions"));
}

function normalizeTooltipTarget(node) {
  if (!(node instanceof Element)) {
    return;
  }
  if (!isTableActionElement(node)) {
    return;
  }
  const title = String(node.getAttribute("title") || "").trim();
  if (!title) {
    return;
  }
  if (!node.getAttribute("data-wz-tooltip")) {
    node.setAttribute("data-wz-tooltip", title);
  }
  if (!node.getAttribute("aria-label")) {
    node.setAttribute("aria-label", title);
  }
  node.removeAttribute("title");
}

function normalizeAll(root = document) {
  root.querySelectorAll?.(".table-actions [title]").forEach((node) => normalizeTooltipTarget(node));
}

export function bindGlobalTableActionTooltipEnhancer() {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return;
  }
  if (window.__wzGlobalTableActionTooltipEnhancerBound) {
    return;
  }
  window.__wzGlobalTableActionTooltipEnhancerBound = true;
  normalizeAll(document);

  observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      if (mutation.type === "attributes" && mutation.target instanceof Element) {
        normalizeTooltipTarget(mutation.target);
      }
      mutation.addedNodes.forEach((node) => {
        if (!(node instanceof Element)) {
          return;
        }
        if (node.matches?.("[title]")) {
          normalizeTooltipTarget(node);
        }
        normalizeAll(node);
      });
    });
  });
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["title"],
  });
}
