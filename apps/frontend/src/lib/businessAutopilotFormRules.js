const DEFAULT_INPUT_MAX_LENGTH = 120;
const DEFAULT_TEXTAREA_MAX_LENGTH = 500;
const IMAGE_MAX_BYTES = 500 * 1024;
const PDF_MAX_BYTES = 5 * 1024 * 1024;

function normalizeKey(fieldKey) {
  return String(fieldKey || "").trim().toLowerCase();
}

export function getBusinessAutopilotMaxLength(fieldKey, { isTextarea = false } = {}) {
  const key = normalizeKey(fieldKey);
  if (!key) {
    return isTextarea ? DEFAULT_TEXTAREA_MAX_LENGTH : DEFAULT_INPUT_MAX_LENGTH;
  }
  if (key.includes("password")) return 64;
  if (key.includes("email")) return 120;
  if (key.includes("phone") || key.includes("mobile")) return 15;
  if (key.includes("pincode") || key.includes("postal") || key.includes("zip")) return 12;
  if (key.includes("gst")) return 20;
  if (key.includes("ticketno") || key.includes("sku")) return 40;
  if (key.includes("country") || key.includes("state") || key.includes("city")) return 80;
  if (key.includes("company")) return 120;
  if (key.includes("name")) return key.includes("company") ? 120 : 80;
  if (key.includes("subject") || key.includes("title")) return 150;
  if (key.includes("address")) return isTextarea ? 500 : 255;
  if (key.includes("description") || key.includes("notes") || key.includes("remark") || key.includes("terms") || key.includes("footer") || key.includes("message")) {
    return isTextarea ? 1000 : 255;
  }
  return isTextarea ? DEFAULT_TEXTAREA_MAX_LENGTH : DEFAULT_INPUT_MAX_LENGTH;
}

export function clampBusinessAutopilotText(fieldKey, value, { isTextarea = false } = {}) {
  const raw = String(value ?? "");
  const maxLength = getBusinessAutopilotMaxLength(fieldKey, { isTextarea });
  return raw.length > maxLength ? raw.slice(0, maxLength) : raw;
}

function hasAllowedExtension(fileName, extensions) {
  const lower = String(fileName || "").trim().toLowerCase();
  return extensions.some((ext) => lower.endsWith(ext));
}

export function validateBusinessAutopilotImage(file, { label = "Image", maxBytes = IMAGE_MAX_BYTES } = {}) {
  if (!file) {
    return { ok: false, message: `${label} file is missing.` };
  }
  const mime = String(file.type || "").trim().toLowerCase();
  const validMime = mime === "image/jpeg" || mime === "image/jpg" || mime === "image/png";
  const validExt = hasAllowedExtension(file.name, [".jpg", ".jpeg", ".png"]);
  if (!validMime && !validExt) {
    return { ok: false, message: `${label} must be JPG, JPEG, or PNG.` };
  }
  if (Number(file.size || 0) > maxBytes) {
    return { ok: false, message: `${label} size must be under 500 KB.` };
  }
  return { ok: true };
}

export function validateBusinessAutopilotPdf(file, { label = "PDF", maxBytes = PDF_MAX_BYTES } = {}) {
  if (!file) {
    return { ok: false, message: `${label} file is missing.` };
  }
  const mime = String(file.type || "").trim().toLowerCase();
  const validMime = mime === "application/pdf";
  const validExt = hasAllowedExtension(file.name, [".pdf"]);
  if (!validMime && !validExt) {
    return { ok: false, message: `${label} must be PDF only.` };
  }
  if (Number(file.size || 0) > maxBytes) {
    return { ok: false, message: `${label} size must be under 5 MB.` };
  }
  return { ok: true };
}

export function validateBusinessAutopilotImageOrPdf(file, { label = "File" } = {}) {
  if (!file) {
    return { ok: false, message: `${label} file is missing.` };
  }
  const mime = String(file.type || "").trim().toLowerCase();
  const lowerName = String(file.name || "").trim().toLowerCase();
  const isPdf = mime === "application/pdf" || lowerName.endsWith(".pdf");
  if (isPdf) {
    return validateBusinessAutopilotPdf(file, { label });
  }
  return validateBusinessAutopilotImage(file, { label });
}

