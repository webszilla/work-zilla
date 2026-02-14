const cardsEl = document.getElementById("cards");
const statusTextEl = document.getElementById("statusText");
const progressBarEl = document.getElementById("progressBar");
const platformPillEl = document.getElementById("platformPill");
const sizeTextEl = document.getElementById("sizeText");

let installing = false;
let activeProduct = "";

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
  subtitle.textContent = product.available
    ? "Download latest installer and run setup."
    : "Not available for this platform in current config.";
  const button = document.createElement("button");
  button.textContent = "Download & Install";
  if (!product.available) {
    button.dataset.unavailable = "1";
  }
  button.disabled = !product.available || installing;
  button.addEventListener("click", () => onInstall(product.key));
  card.append(title, subtitle, button);
  return card;
}

function renderProducts(products, onInstall) {
  cardsEl.innerHTML = "";
  products.forEach((product) => {
    cardsEl.appendChild(createCard(product, onInstall));
  });
}

function setButtonsDisabled(disabled) {
  Array.from(cardsEl.querySelectorAll("button")).forEach((button) => {
    button.disabled = disabled || button.dataset.unavailable === "1";
  });
}

async function boot() {
  const unsubscribe = window.bootstrapApi.onDownloadProgress((payload) => {
    if (!payload || payload.productKey !== activeProduct) return;
    setProgress(payload.downloaded || 0, payload.total || 0);
  });

  try {
    const data = await window.bootstrapApi.getProducts();
    platformPillEl.textContent = data.platform;
    renderProducts(data.products || [], handleInstall);
    setStatus("Ready.");
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
    setStatus(`Installer opened: ${result.filename || result.path}. Complete setup wizard, then launch app from Start Menu/Applications.`);
    setTimeout(() => {
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

boot();
