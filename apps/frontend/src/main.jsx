import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import "./styles/tailwind.css";
import "./index.css";
import "./dashboard.css";
import "./styles/admin-shell.css";
import { ConfirmProvider } from "./components/ConfirmDialog.jsx";
import { loadRemoteSharedUiCss } from "./lib/sharedUi.js";

loadRemoteSharedUiCss();

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <ConfirmProvider>
      <App />
    </ConfirmProvider>
  </React.StrictMode>
);
