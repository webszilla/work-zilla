export const UPLOAD_ALERT_EVENT = "wz:upload-alert";

export function showUploadAlert(message, title = "Upload Alert") {
  const text = String(message || "").trim();
  if (!text) return;
  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent(UPLOAD_ALERT_EVENT, {
        detail: {
          message: text,
          title: String(title || "").trim() || "Upload Alert"
        }
      })
    );
  }
}
