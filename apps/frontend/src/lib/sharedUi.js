const SHARED_UI_VERSION = "20260228-1";
const SHARED_UI_PATH = `/static/public/css/shared-ui.css?v=${SHARED_UI_VERSION}`;
const SHARED_UI_PROD_URL = `https://getworkzilla.com${SHARED_UI_PATH}`;
const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost", "0.0.0.0"]);

function resolveSharedUiUrl() {
  if (typeof window === "undefined") {
    return SHARED_UI_PROD_URL;
  }
  const { protocol, hostname, origin } = window.location;
  if (protocol.startsWith("http") && LOCAL_HOSTS.has(hostname)) {
    return `${origin}${SHARED_UI_PATH}`;
  }
  return SHARED_UI_PROD_URL;
}

export function loadRemoteSharedUiCss() {
  if (typeof document === "undefined") {
    return;
  }
  if (document.head.querySelector("link[data-shared-ui-remote='1']")) {
    return;
  }
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = resolveSharedUiUrl();
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

