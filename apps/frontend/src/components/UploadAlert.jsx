import { useEffect, useState } from "react";
import { UPLOAD_ALERT_EVENT } from "../lib/uploadAlert.js";

const emptyAlert = { open: false, message: "", title: "Upload Alert" };

export function UploadAlertProvider({ children }) {
  const [alertState, setAlertState] = useState(emptyAlert);

  useEffect(() => {
    const onUploadAlert = (event) => {
      const message = String(event?.detail?.message || "").trim();
      if (!message) return;
      const title = String(event?.detail?.title || "").trim() || "Upload Alert";
      setAlertState({ open: true, message, title });
    };
    window.addEventListener(UPLOAD_ALERT_EVENT, onUploadAlert);
    return () => window.removeEventListener(UPLOAD_ALERT_EVENT, onUploadAlert);
  }, []);

  return (
    <>
      {children}
      {alertState.open ? (
        <div className="modal-overlay" onClick={() => setAlertState(emptyAlert)}>
          <div className="modal-panel" onClick={(event) => event.stopPropagation()}>
            <h5>{alertState.title}</h5>
            <div className="text-secondary mb-2">{alertState.message}</div>
            <div className="d-flex justify-content-end mt-3">
              <button type="button" className="btn btn-primary" onClick={() => setAlertState(emptyAlert)}>
                OK
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
