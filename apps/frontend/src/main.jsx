import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import "./styles/tailwind.css";
import "./index.css";
import "./dashboard.css";
import "./styles/admin-shell.css";
import { ConfirmProvider } from "./components/ConfirmDialog.jsx";
import { loadRemoteSharedUiCss } from "./lib/sharedUi.js";
import { bindGlobalEmailRealtimeValidation } from "./lib/emailRealtimeValidation.js";
import { bindGlobalRequiredFieldValidation } from "./lib/requiredFieldValidation.js";
import { bindGlobalDatePickerEnhancer } from "./lib/datePickerEnhancer.js";
import { bindGlobalSelectPlaceholderShortener } from "./lib/selectPlaceholderShortener.js";
import { bindGlobalTableActionTooltipEnhancer } from "./lib/tableActionTooltipEnhancer.js";
import { bindGlobalTableOverflowEnhancer } from "./lib/tableOverflowEnhancer.js";

// Debug build marker (helps verify the browser is running the latest frontend bundle).
window.__WZ_FRONTEND_BUILD_ID = "2026-07-01T17:45+05:30";

loadRemoteSharedUiCss();
bindGlobalEmailRealtimeValidation();
bindGlobalRequiredFieldValidation();
bindGlobalDatePickerEnhancer();
bindGlobalSelectPlaceholderShortener();
bindGlobalTableActionTooltipEnhancer();
bindGlobalTableOverflowEnhancer();

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <ConfirmProvider>
      <App />
    </ConfirmProvider>
  </React.StrictMode>
);
