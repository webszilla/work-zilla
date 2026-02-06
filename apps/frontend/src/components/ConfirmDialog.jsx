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

export function ConfirmProvider({ children }) {
  const [dialog, setDialog] = useState(defaultState);

  const confirm = useMemo(
    () => (options) =>
      new Promise((resolve) => {
        setDialog({
          open: true,
          title: options?.title || "Please Confirm",
          message: options?.message || "",
          confirmText: options?.confirmText || "Confirm",
          cancelText: options?.cancelText || "Cancel",
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
        <div className="modal-overlay" onClick={() => closeDialog(false)}>
          <div className="modal-panel" onClick={(event) => event.stopPropagation()}>
            <h5>{dialog.title}</h5>
            {dialog.message ? (
              <div className="text-secondary mb-2">{dialog.message}</div>
            ) : null}
            <div className="d-flex justify-content-end gap-2 mt-3">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => closeDialog(false)}
              >
                {dialog.cancelText}
              </button>
              <button
                type="button"
                className={`btn btn-${dialog.confirmVariant}`}
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
