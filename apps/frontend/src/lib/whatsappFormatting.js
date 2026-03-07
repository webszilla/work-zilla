function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatWhatsappInlineToHtml(text) {
  let line = String(text || "");
  line = line.replace(/`([^`]+)`/g, "<code>$1</code>");
  line = line.replace(/\*([^*\n]+)\*/g, "<strong>$1</strong>");
  line = line.replace(/_([^_\n]+)_/g, "<em>$1</em>");
  line = line.replace(/~([^~\n]+)~/g, "<s>$1</s>");
  return line;
}

function normalizePlainText(value) {
  return String(value || "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function decodeHtmlEntities(value) {
  const raw = String(value || "");
  if (!raw) return "";
  if (typeof window === "undefined" || typeof document === "undefined") {
    return raw
      .replace(/&nbsp;/gi, " ")
      .replace(/&amp;/gi, "&")
      .replace(/&lt;/gi, "<")
      .replace(/&gt;/gi, ">")
      .replace(/&quot;/gi, "\"")
      .replace(/&#39;/gi, "'");
  }
  const el = document.createElement("textarea");
  el.innerHTML = raw;
  return el.value;
}

function htmlToTextByMarkup(rawHtml) {
  let text = String(rawHtml || "");
  text = text.replace(/<\s*(script|style)\b[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, "");
  text = text.replace(/<\s*br\s*\/?\s*>/gi, "\n");
  text = text.replace(/<\s*li\b[^>]*>/gi, "\n- ");
  text = text.replace(/<\s*\/\s*(p|div|section|article|header|footer|h[1-6]|pre|blockquote|li|ul|ol)\s*>/gi, "\n");
  text = text.replace(/<[^>]+>/g, "");
  text = decodeHtmlEntities(text);
  return normalizePlainText(text);
}

function isBlockTagName(tag) {
  return [
    "p", "div", "section", "article", "header", "footer",
    "h1", "h2", "h3", "h4", "h5", "h6",
    "pre", "blockquote", "ul", "ol", "li",
  ].includes(String(tag || "").toLowerCase());
}

function isBlockNode(node) {
  return Boolean(node && node.nodeType === 1 && isBlockTagName(node.tagName));
}

function normalizeTextNodeContent(value) {
  return String(value || "")
    .replace(/\u00a0/g, " ")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/\t/g, " ")
    .replace(/[^\S\n]{2,}/g, " ");
}

function shouldInsertInlineSpace(prevText, nextText) {
  const prev = String(prevText || "");
  const next = String(nextText || "");
  if (!prev || !next) return false;
  if (/\s$/.test(prev) || /^\s/.test(next)) return false;
  const prevChar = prev.slice(-1);
  const nextChar = next.charAt(0);
  if (/\n/.test(prevChar) || /\n/.test(nextChar)) return false;
  if (/[,.!?;:%)\]}]/.test(nextChar)) return false;
  if (/[(\[{/@#]/.test(prevChar)) return false;
  return /[A-Za-z0-9*_~`]/.test(prevChar) && /[A-Za-z0-9*_~`]/.test(nextChar);
}

function serializeNodeToWhatsapp(node, options = {}) {
  const nodeType = node?.nodeType;
  if (!nodeType) {
    return "";
  }
  if (nodeType === 3) {
    return normalizeTextNodeContent(node.textContent || "");
  }
  if (nodeType !== 1) {
    return "";
  }
  const tag = (node.tagName || "").toLowerCase();
  let children = "";
  const childNodes = Array.from(node.childNodes || []);
  childNodes.forEach((child, idx) => {
    const part = serializeNodeToWhatsapp(child, {
      ...options,
      index: idx,
      parentTag: tag,
    });
    if (!part) {
      return;
    }
    if (idx > 0) {
      const prev = childNodes[idx - 1];
      if ((isBlockNode(prev) || isBlockNode(child)) && !children.endsWith("\n")) {
        children += "\n";
      } else if (shouldInsertInlineSpace(children, part)) {
        children += " ";
      }
    }
    children += part;
  });

  if (tag === "br") return "\n";
  if (tag === "strong" || tag === "b") return children.trim() ? `*${children.trim()}*` : "";
  if (tag === "em" || tag === "i") return children.trim() ? `_${children.trim()}_` : "";
  if (tag === "s" || tag === "strike" || tag === "del") return children.trim() ? `~${children.trim()}~` : "";
  if (tag === "code") return children.trim() ? `\`${children.trim()}\`` : "";
  if (tag === "a") {
    const href = (node.getAttribute("href") || "").trim();
    const label = children.trim();
    if (!href) return label;
    if (!label || label === href) return href;
    return `${label} (${href})`;
  }
  if (tag === "li") {
    const parentTag = String(options.parentTag || "").toLowerCase();
    if (parentTag === "ol") {
      const index = Number(options.index || 0) + 1;
      return `${index}. ${children.trim()}\n`;
    }
    return `- ${children.trim()}\n`;
  }
  if (tag === "ul" || tag === "ol") {
    return `\n${children.trim()}\n`;
  }
  if (tag === "blockquote") {
    return children
      .split("\n")
      .map((line) => line.trim() ? `> ${line.trim()}` : "")
      .filter(Boolean)
      .join("\n");
  }
  if (isBlockTagName(tag) && !["ul", "ol", "li", "blockquote"].includes(tag)) {
    return `${children.trim()}\n`;
  }
  return children;
}

export function htmlToWhatsappText(htmlValue) {
  const raw = String(htmlValue || "").trim();
  if (!raw) {
    return "";
  }
  if (typeof window === "undefined" || typeof DOMParser === "undefined") {
    return normalizePlainText(raw.replace(/<[^>]+>/g, " "));
  }
  const doc = new DOMParser().parseFromString(raw, "text/html");
  const body = doc.body;
  const serialized = Array.from(body.childNodes || []).map((node, idx) => serializeNodeToWhatsapp(node, { index: idx })).join("");
  const normalizedSerialized = normalizePlainText(serialized);
  const visualText = normalizePlainText(String(body.innerText || "").replace(/\u00a0/g, " "));
  const markupText = htmlToTextByMarkup(raw);
  const candidates = [normalizedSerialized, visualText, markupText].filter(Boolean);
  if (!candidates.length) {
    return "";
  }
  const scored = candidates.map((item) => ({
    item,
    breaks: (item.match(/\n/g) || []).length,
    length: item.length,
  }));
  scored.sort((a, b) => {
    if (b.breaks !== a.breaks) return b.breaks - a.breaks;
    return b.length - a.length;
  });
  return scored[0].item;
}

export function plainTextToHtml(value) {
  const normalized = normalizePlainText(value);
  if (!normalized) {
    return "";
  }
  return normalized
    .split("\n")
    .map((line) => formatWhatsappInlineToHtml(escapeHtml(line)))
    .join("<br>");
}
