const SHARED_UI_VERSION = "20260228-1";
const SHARED_UI_URL = `https://getworkzilla.com/static/public/css/shared-ui.css?v=${SHARED_UI_VERSION}`;

export function loadRemoteSharedUiCss() {
  if (typeof document === "undefined") {
    return;
  }
  if (document.head.querySelector("link[data-shared-ui-remote='1']")) {
    return;
  }
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = SHARED_UI_URL;
  link.dataset.sharedUiRemote = "1";
  link.onload = () => {
    document.documentElement.dataset.sharedUi = "remote";
  };
  link.onerror = () => {
    link.remove();
    document.documentElement.dataset.sharedUi = "local";
  };
  document.head.appendChild(link);
}

