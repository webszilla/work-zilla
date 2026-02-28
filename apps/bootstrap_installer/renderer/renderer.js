const cardsEl = document.getElementById("cards");
const statusTextEl = document.getElementById("statusText");
const progressBarEl = document.getElementById("progressBar");
const platformPillEl = document.getElementById("platformPill");
const sizeTextEl = document.getElementById("sizeText");
const themeLightBtn = document.getElementById("themeLightBtn");
const themeDarkBtn = document.getElementById("themeDarkBtn");
const SHARED_UI_VERSION = "20260228-1";
const SHARED_UI_URL = `https://getworkzilla.com/static/public/css/shared-ui.css?v=${SHARED_UI_VERSION}`;

let installing = false;
let activeProduct = "";
let productState = [];
let theme = "dark";

function loadRemoteSharedUiCss() {
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

function applyTheme(nextTheme) {
  theme = nextTheme === "light" ? "light" : "dark";
  document.documentElement.dataset.theme = theme;
  window.localStorage.setItem("wz-installer-theme", theme);
  themeLightBtn?.classList.toggle("active", theme === "light");
  themeDarkBtn?.classList.toggle("active", theme === "dark");
}

function setStatus(text) {
  statusTextEl.textContent = text;
}

function formatBytes(bytes) {
  const value = Number(bytes || 0);
  if (!Number.isFinite(value) || value <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const idx = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1);
  const sized = value / (1024 ** idx);
  return `${sized.toFixed(idx === 0 ? 0 : 2)} ${units[idx]}`;
}

function setSizeText(downloaded, total) {
  const downloadedText = formatBytes(downloaded);
  const totalText = total > 0 ? formatBytes(total) : "Unknown";
  const pct = total > 0 ? Math.round((downloaded / total) * 100) : 0;
  sizeTextEl.textContent = total > 0
    ? `Downloaded: ${downloadedText} / Total: ${totalText} (${pct}%)`
    : `Downloaded: ${downloadedText} / Total: ${totalText}`;
}

function setProgress(downloaded, total) {
  if (!total || total <= 0) {
    progressBarEl.style.width = "0%";
    setSizeText(downloaded || 0, total || 0);
    return;
  }
  const pct = Math.max(0, Math.min(100, Math.round((downloaded / total) * 100)));
  progressBarEl.style.width = `${pct}%`;
  setSizeText(downloaded, total);
}

function createCard(product, onInstall) {
  const card = document.createElement("article");
  card.className = "card";
  const title = document.createElement("h2");
  title.textContent = product.label;
  const subtitle = document.createElement("p");
  if (!product.available) {
    subtitle.textContent = "Not available for this platform in current config.";
  } else if (product.description) {
    subtitle.textContent = product.description;
  } else if (product.installed) {
    subtitle.textContent = "Installed in this computer. If needed, reinstall again.";
  } else {
    subtitle.textContent = "Download latest installer and run setup.";
  }
  const button = document.createElement("button");
  button.className = "btn-install";
  button.textContent = product.installed ? "Install Again" : "Install";
  if (!product.available) {
    button.dataset.unavailable = "1";
  }
  button.disabled = !product.available || installing;
  button.addEventListener("click", () => onInstall(product.key));

  const uninstallButton = document.createElement("button");
  uninstallButton.className = "btn-uninstall";
  uninstallButton.textContent = "Uninstall";
  uninstallButton.dataset.productKey = product.key;
  uninstallButton.disabled = !product.installed || installing;
  uninstallButton.addEventListener("click", () => handleUninstall(product.key));

  const actions = document.createElement("div");
  actions.className = "card-actions";
  actions.append(button, uninstallButton);

  card.append(title, subtitle, actions);
  return card;
}

function renderProducts(products, onInstall) {
  productState = products || [];
  cardsEl.innerHTML = "";
  productState.forEach((product) => {
    cardsEl.appendChild(createCard(product, onInstall));
  });
}

function setButtonsDisabled(disabled) {
  Array.from(cardsEl.querySelectorAll("button")).forEach((button) => {
    const isUnavailableInstall = button.classList.contains("btn-install") && button.dataset.unavailable === "1";
    const isUninstallButton = button.classList.contains("btn-uninstall");
    if (isUninstallButton) {
      const key = button.dataset.productKey;
      const product = productState.find((item) => item.key === key);
      button.disabled = disabled || !product?.installed;
      return;
    }
    button.disabled = disabled || isUnavailableInstall;
  });
}

async function boot() {
  applyTheme(window.localStorage.getItem("wz-installer-theme") || "dark");
  loadRemoteSharedUiCss();
  themeLightBtn?.addEventListener("click", () => applyTheme("light"));
  themeDarkBtn?.addEventListener("click", () => applyTheme("dark"));

  const unsubscribe = window.bootstrapApi.onDownloadProgress((payload) => {
    if (!payload || payload.productKey !== activeProduct) return;
    setProgress(payload.downloaded || 0, payload.total || 0);
  });

  try {
    const data = await window.bootstrapApi.getProducts();
    platformPillEl.textContent = data.platform;
    renderProducts(data.products || [], handleInstall);
    setStatus("Ready.");
    setInterval(refreshInstalledState, 5000);
  } catch (error) {
    setStatus(error?.message || "Unable to load product catalog.");
  }

  window.addEventListener("beforeunload", () => {
    if (typeof unsubscribe === "function") unsubscribe();
  });
}

async function handleInstall(productKey) {
  if (installing) return;
  installing = true;
  activeProduct = productKey;
  setButtonsDisabled(true);
  setProgress(0, 1);
  setStatus("Downloading installer...");
  try {
    const result = await window.bootstrapApi.installProduct(productKey);
    setProgress(1, 1);
    const activationNote = result?.firstLaunch?.activationRequired
      ? " First launch will ask License Code, validate via SaaS, and register this device."
      : "";
    const modeLabel = result?.installMode === "silent" ? "Installed silently" : "Installer opened";
    setStatus(`${modeLabel}: ${result.filename || result.path}.${activationNote}`);
    setTimeout(() => {
      refreshInstalledState();
      setStatus("Ready.");
      setProgress(0, 0);
    }, 1800);
  } catch (error) {
    setStatus(error?.message || "Install failed.");
    setProgress(0, 1);
  } finally {
    installing = false;
    activeProduct = "";
    setButtonsDisabled(false);
  }
}

async function handleUninstall(productKey) {
  if (installing) return;
  installing = true;
  activeProduct = productKey;
  setButtonsDisabled(true);
  setStatus("Uninstalling selected module...");
  setProgress(0, 0);
  try {
    const result = await window.bootstrapApi.uninstallProduct(productKey);
    setStatus(result?.message || "Uninstall completed.");
    await refreshInstalledState();
    setTimeout(() => {
      setStatus("Ready.");
    }, 1500);
  } catch (error) {
    setStatus(error?.message || "Uninstall failed.");
  } finally {
    installing = false;
    activeProduct = "";
    setButtonsDisabled(false);
  }
}

async function refreshInstalledState() {
  if (!window.bootstrapApi?.getInstalledProducts || productState.length === 0) return;
  try {
    const installed = await window.bootstrapApi.getInstalledProducts();
    const next = productState.map((item) => ({
      ...item,
      installed: Boolean(installed?.[item.key]),
    }));
    renderProducts(next, handleInstall);
  } catch {
    // no-op
  }
}

boot();
