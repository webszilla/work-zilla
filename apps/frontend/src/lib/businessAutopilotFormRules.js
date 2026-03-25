const DEFAULT_INPUT_MAX_LENGTH = 60;
const DEFAULT_TEXTAREA_MAX_LENGTH = 180;
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
  if (key === "first_name" || key === "last_name") return 20;
  if (key === "employee_role" || key === "employee_role_id") return 30;
  if (key === "department" || key === "department_id") return 30;
  if (key === "companyname") return 60;
  if (key === "clientname") return 30;
  if (
    key === "categoryname" ||
    key === "subcategoryname" ||
    key === "sub category name" ||
    key === "category name" ||
    key.includes("subcategory name") ||
    key.includes("sub category name") ||
    (key.includes("category") && key.includes("name"))
  ) return 25;
  if (key.includes("password")) return 16;
  if (key.includes("email")) return 40;
  if (key.includes("phone") || key.includes("mobile")) return 15;
  if (key.includes("pincode") || key.includes("postal") || key.includes("zip")) return 10;
  if (key.includes("gst")) return 15;
  if (key.includes("ticketno") || key.includes("sku")) return 20;
  if (key.includes("country") || key.includes("state") || key.includes("city")) return 30;
  if (key.includes("company")) return 60;
  if (key.includes("name")) return key.includes("company") ? 60 : 30;
  if (key.includes("subject") || key.includes("title")) return 60;
  if (key.includes("address")) return isTextarea ? 150 : 100;
  if (key.includes("remark")) return isTextarea ? 100 : 80;
  if (key.includes("description") || key.includes("notes") || key.includes("remark") || key.includes("terms") || key.includes("footer") || key.includes("message")) {
    return isTextarea ? 180 : 100;
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
