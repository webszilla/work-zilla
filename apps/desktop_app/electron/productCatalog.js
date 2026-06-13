const DESKTOP_PRODUCTS = Object.freeze([
  {
    key: "monitor",
    title: "Work Suite",
    description: "Activity visibility, screenshots, and productivity tracking.",
    launchModule: "monitor",
    enabledSlugs: ["monitor", "worksuite", "work-suite"],
    localInstallKey: "monitor",
    showWhenLoggedOut: true,
    requiresAuthForLaunch: false,
    nativeCapabilities: ["screenshot_capture", "app_tracking", "active_window_tracking", "system_monitoring"]
  },
  {
    key: "storage",
    title: "Online Storage",
    description: "Secure storage sync and file backup.",
    launchModule: "storage",
    enabledSlugs: ["storage", "online-storage"],
    localInstallKey: "storage",
    showWhenLoggedOut: false,
    requiresAuthForLaunch: true,
    nativeCapabilities: ["folder_watcher", "local_sync", "device_storage_sync"]
  },
  {
    key: "imposition",
    title: "Imposition Software",
    description: "Imposition Tool for Digital Printing Press.",
    launchModule: "imposition",
    enabledSlugs: ["imposition", "imposition-software"],
    localInstallKey: "imposition",
    showWhenLoggedOut: true,
    requiresAuthForLaunch: false,
    nativeCapabilities: ["printer_integration", "filesystem_jobs", "local_output_processing"]
  }
]);

const DESKTOP_PRODUCT_KEYS = Object.freeze(DESKTOP_PRODUCTS.map((product) => product.key));

function normalizeProductKey(value) {
  return String(value || "").trim().toLowerCase();
}

function toValueSet(values) {
  return new Set((values || []).map((value) => normalizeProductKey(value)).filter(Boolean));
}

export function getDesktopProducts() {
  return DESKTOP_PRODUCTS;
}

export function getDesktopProduct(productKey) {
  const normalizedKey = normalizeProductKey(productKey);
  return DESKTOP_PRODUCTS.find((product) => product.key === normalizedKey) || null;
}

export function isKnownDesktopProduct(productKey) {
  return DESKTOP_PRODUCT_KEYS.includes(normalizeProductKey(productKey));
}

export function getDesktopProductKeys() {
  return DESKTOP_PRODUCT_KEYS;
}

export function hasDesktopProductAccess(productKey, enabledProducts) {
  const product = getDesktopProduct(productKey);
  if (!product) {
    return false;
  }
  const enabled = toValueSet(enabledProducts);
  return product.enabledSlugs.some((slug) => enabled.has(slug));
}

export function hasDesktopLocalInstall(productKey, localInstalledProducts) {
  const product = getDesktopProduct(productKey);
  if (!product) {
    return false;
  }
  const installed = toValueSet(localInstalledProducts);
  return installed.has(product.localInstallKey);
}

export function canShowDesktopProduct(productKey, authState) {
  const product = getDesktopProduct(productKey);
  if (!product) {
    return false;
  }
  if (!authState?.authenticated) {
    return product.showWhenLoggedOut;
  }
  return (
    hasDesktopProductAccess(productKey, authState?.enabled_products) ||
    hasDesktopLocalInstall(productKey, authState?.local_installed_products)
  );
}
