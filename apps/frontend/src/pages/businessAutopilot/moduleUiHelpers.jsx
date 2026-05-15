import { Children, cloneElement, isValidElement } from "react";

export function normalizeCountryName(value) {
  return String(value || "").trim().toLowerCase();
}

function getNodePlainText(node) {
  if (typeof node === "string" || typeof node === "number") {
    return String(node);
  }
  if (Array.isArray(node)) {
    return node.map((item) => getNodePlainText(item)).join("");
  }
  if (isValidElement(node)) {
    return getNodePlainText(node.props?.children);
  }
  return "";
}

function hasBootstrapIconChild(node) {
  if (!isValidElement(node)) {
    if (Array.isArray(node)) {
      return node.some((item) => hasBootstrapIconChild(item));
    }
    return false;
  }
  if (String(node.type || "").toLowerCase() === "i") {
    const className = String(node.props?.className || "");
    if (/\bbi\b/.test(className)) {
      return true;
    }
  }
  return hasBootstrapIconChild(node.props?.children);
}

const ACTION_ICON_RULES = [
  { test: /^(edit|update)\b/i, icon: "bi bi-pencil-square", label: "Edit" },
  { test: /^(delete|remove)\b/i, icon: "bi bi-trash3", label: "Delete" },
  { test: /^(view|preview|open)\b/i, icon: "bi bi-eye", label: "View" },
  { test: /^(history|log|timeline)\b/i, icon: "bi bi-clock-history", label: "History" },
  { test: /^(details?)\b/i, icon: "bi bi-info-circle", label: "Details" },
  { test: /^(convert(ed)?|migrate)\b/i, icon: "bi bi-arrow-left-right", label: "Convert" },
  { test: /^(restore)\b/i, icon: "bi bi-arrow-counterclockwise", label: "Restore" },
  { test: /^(verify|approve)\b/i, icon: "bi bi-patch-check", label: "Verify" },
  { test: /^(reject)\b/i, icon: "bi bi-x-lg", label: "Reject" },
  { test: /^(pdf|download)\b/i, icon: "bi bi-file-earmark-pdf", label: "Download PDF" },
  { test: /^(email|mail|send)\b/i, icon: "bi bi-envelope-paper", label: "Send Email" },
];

function resolveActionIconMeta(actionText, explicitLabel) {
  const candidate = String(explicitLabel || actionText || "").trim();
  if (!candidate) {
    return null;
  }
  const normalized = candidate.toLowerCase();
  for (const rule of ACTION_ICON_RULES) {
    if (rule.test.test(normalized)) {
      return {
        icon: rule.icon,
        label: rule.label,
      };
    }
  }
  return null;
}

export function normalizeTableActionNode(node) {
  if (!isValidElement(node)) {
    if (Array.isArray(node)) {
      return node.map((item) => normalizeTableActionNode(item));
    }
    return node;
  }

  const normalizedChildren = Children.map(node.props?.children, (child) => normalizeTableActionNode(child));
  const nodeType = String(node.type || "").toLowerCase();
  if (nodeType !== "button" && nodeType !== "a") {
    return cloneElement(node, undefined, normalizedChildren);
  }

  const actionText = getNodePlainText(node.props?.children).trim();
  const existingTitle = String(node.props?.title || node.props?.["data-tooltip"] || node.props?.["data-wz-tooltip"] || "").trim();
  const existingAria = String(node.props?.["aria-label"] || "").trim();
  const explicitLabel = existingAria || existingTitle;
  const iconMeta = resolveActionIconMeta(actionText, explicitLabel);
  const hasIcon = hasBootstrapIconChild(node.props?.children);
  const shouldConvertToIcon = Boolean(iconMeta && !hasIcon);
  const label = explicitLabel || iconMeta?.label || actionText;
  const isIconOnly = Boolean(shouldConvertToIcon || (hasIcon && !actionText));

  if (!isIconOnly && !label) {
    return cloneElement(node, undefined, normalizedChildren);
  }

  const mergedClassName = [
    node.props?.className || "",
    "d-inline-flex",
    "align-items-center",
    "justify-content-center",
    isIconOnly ? "saas-org-icon-btn wz-table-action-btn" : "",
  ].filter(Boolean).join(" ");

  return cloneElement(
    node,
    {
      ...node.props,
      className: mergedClassName,
      title: node.props?.title || label || undefined,
      "aria-label": node.props?.["aria-label"] || label || undefined,
      style: isIconOnly
        ? {
          minWidth: 34,
          width: 34,
          height: 30,
          padding: 0,
          ...(node.props?.style || {}),
        }
        : (node.props?.style || undefined),
    },
    shouldConvertToIcon ? <i className={iconMeta.icon} aria-hidden="true" /> : normalizedChildren
  );
}

export function getCurrencyDisplayLabel(currencyCode) {
  const code = String(currencyCode || "").trim().toUpperCase();
  if (!code) {
    return "";
  }
  try {
    const parts = new Intl.NumberFormat("en", {
      style: "currency",
      currency: code,
      currencyDisplay: "narrowSymbol",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).formatToParts(0);
    const symbol = parts.find((part) => part.type === "currency")?.value || code;
    return `${symbol} ${code}`;
  } catch (_error) {
    return code;
  }
}

export const EMAIL_ADDRESS_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function getAccountsTaxUiConfig(countryValue) {
  const country = String(countryValue || "India").trim() || "India";
  const normalized = normalizeCountryName(country);
  if (normalized === "india") {
    return {
      country,
      mode: "gst",
      templatesLabel: "GST Templates",
      templateSingular: "GST Template",
      templateListTitle: "GST Template List",
      createTitle: "Create GST Template",
      editTitle: "Edit GST Template",
      createActionLabel: "Create GST Template",
      editActionLabel: "Update GST Template",
      scopeLabel: "Scope",
      defaultScope: "Intra State",
      scopeOptions: ["Intra State", "Inter State", "Export"],
      namePlaceholder: "India GST 18%",
      notesPlaceholder: "Template notes",
      cgstLabel: "CGST %",
      sgstLabel: "SGST %",
      igstLabel: "IGST %",
      cessLabel: "CESS %",
      helperText: "India billing profile detected. GST rule template defaults are enabled.",
    };
  }
  if (normalized === "united states" || normalized === "usa" || normalized === "us") {
    return {
      country,
      mode: "us_sales_tax",
      templatesLabel: "Tax Templates",
      templateSingular: "Tax Template",
      templateListTitle: "Tax Template List",
      createTitle: "Create Tax Template",
      editTitle: "Edit Tax Template",
      createActionLabel: "Create Tax Template",
      editActionLabel: "Update Tax Template",
      scopeLabel: "Jurisdiction",
      defaultScope: "Same State",
      scopeOptions: ["Same State", "Out of State", "International"],
      namePlaceholder: "US Sales Tax",
      notesPlaceholder: "Tax rule notes",
      cgstLabel: "State Tax %",
      sgstLabel: "County/Local Tax %",
      igstLabel: "Combined Sales Tax %",
      cessLabel: "Extra Tax %",
      helperText: "US billing profile detected. Sales-tax style rule labels are shown.",
    };
  }
  return {
    country,
    mode: "vat",
    templatesLabel: "Tax Templates",
    templateSingular: "Tax Template",
    templateListTitle: "Tax Template List",
    createTitle: "Create Tax Template",
    editTitle: "Edit Tax Template",
    createActionLabel: "Create Tax Template",
    editActionLabel: "Update Tax Template",
    scopeLabel: "Scope",
    defaultScope: "Domestic",
    scopeOptions: ["Domestic", "Cross Border", "Export"],
    namePlaceholder: `${country} VAT`,
    notesPlaceholder: "VAT / tax rule notes",
    cgstLabel: "Regional Tax %",
    sgstLabel: "Local Tax %",
    igstLabel: "VAT / Main Tax %",
    cessLabel: "Additional Tax %",
    helperText: `${country} billing profile detected. VAT/Tax rule labels are shown.`,
  };
}

