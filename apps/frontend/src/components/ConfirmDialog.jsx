import { createContext, useContext, useMemo, useState } from "react";

const ConfirmContext = createContext(null);

const defaultState = {
  open: false,
  title: "",
  message: "",
  confirmText: "Confirm",
  cancelText: "Cancel",
  confirmVariant: "primary",
  resolve: null
};

function toAlertTitleCase(value) {
  const text = String(value || "").trim();
  if (!text) {
    return "";
  }
  return text
    .split(/(\s+)/)
    .map((part) => {
      if (/^\s+$/.test(part)) {
        return part;
      }
      if (/[:/@<>\[\]{}|\\]/.test(part)) {
        return part;
      }
      const match = part.match(/^([A-Za-z]+(?:'[A-Za-z]+)?)([^A-Za-z']*)$/);
      if (!match) {
        return part;
      }
      const [, word, suffix] = match;
      return `${word.charAt(0).toUpperCase()}${word.slice(1).toLowerCase()}${suffix}`;
    })
    .join("");
}

export function ConfirmProvider({ children }) {
  const [dialog, setDialog] = useState(defaultState);

  const confirm = useMemo(
    () => (options) =>
      new Promise((resolve) => {
        setDialog({
          open: true,
          title: toAlertTitleCase(options?.title || "Please Confirm"),
          message: toAlertTitleCase(options?.message || ""),
          confirmText: toAlertTitleCase(options?.confirmText || "Confirm"),
          cancelText: toAlertTitleCase(options?.cancelText || "Cancel"),
          confirmVariant: options?.confirmVariant || "primary",
          resolve
        });
      }),
    []
  );

  const closeDialog = (result) => {
    if (dialog.resolve) {
      dialog.resolve(result);
    }
    setDialog(defaultState);
  };

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {dialog.open ? (
        <div className="modal-overlay" data-confirm-dialog="true" data-no-delete-confirm="true" onClick={() => closeDialog(false)}>
          <div className="modal-panel" data-confirm-dialog="true" data-no-delete-confirm="true" onClick={(event) => event.stopPropagation()}>
            <h5>{dialog.title}</h5>
            {dialog.message ? (
              <div className="text-secondary mb-2">{dialog.message}</div>
            ) : null}
            <div className="d-flex justify-content-end gap-2 mt-3">
              <button
                type="button"
                className="btn app-btn-secondary"
                data-no-delete-confirm="true"
                onClick={() => closeDialog(false)}
              >
                {dialog.cancelText}
              </button>
              <button
                type="button"
                className={`btn btn-${dialog.confirmVariant}`}
                data-no-delete-confirm="true"
                onClick={() => closeDialog(true)}
              >
                {dialog.confirmText}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  const ctx = useContext(ConfirmContext);
  if (!ctx) {
    throw new Error("useConfirm must be used inside ConfirmProvider");
  }
  return ctx;
}
