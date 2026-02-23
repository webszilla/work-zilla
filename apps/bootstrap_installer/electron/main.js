const { app, BrowserWindow, ipcMain, shell } = require("electron");
const fs = require("fs");
const path = require("path");
const https = require("https");
const http = require("http");
const os = require("os");
const { URL } = require("url");

const CONFIG_URLS = [
  process.env.WORKZILLA_BOOTSTRAP_CONFIG_URL,
  "https://getworkzilla.com/downloads/bootstrap-products.json",
  "https://getworkzilla.com/static/downloads/bootstrap-products.json",
].filter(Boolean);

const SUPPORTED_PRODUCTS = {
  monitor: "Work Suite",
  storage: "Online Storage",
};
const gotSingleInstanceLock = app.requestSingleInstanceLock();
const PRODUCT_KEYS = Object.keys(SUPPORTED_PRODUCTS);

function getPlatformKey() {
  if (process.platform === "win32") return "windows";
  if (process.platform === "darwin") return "mac";
  return "unsupported";
}

function createWindow() {
  const win = new BrowserWindow({
    width: 860,
    height: 560,
    minWidth: 760,
    minHeight: 500,
    title: "Work Zilla Installer",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.removeMenu();
  win.loadFile(path.join(__dirname, "../renderer/index.html"));
}

function fetchJson(urlText) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(urlText);
    const client = urlObj.protocol === "http:" ? http : https;
    const req = client.get(urlObj, (res) => {
      if (res.statusCode && res.statusCode >= 400) {
        reject(new Error(`Config download failed (${res.statusCode})`));
        res.resume();
        return;
      }
      let body = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => {
        body += chunk;
      });
      res.on("end", () => {
        try {
          const parsed = JSON.parse(body);
          resolve(parsed);
        } catch (error) {
          reject(new Error("Invalid bootstrap config JSON."));
        }
      });
    });
    req.on("error", () => reject(new Error("Unable to fetch bootstrap config.")));
    req.setTimeout(15000, () => {
      req.destroy(new Error("Bootstrap config request timeout."));
    });
  });
}

function loadBundledConfig() {
  const fallbackPath = path.join(__dirname, "bootstrap-products.local.json");
  try {
    const raw = fs.readFileSync(fallbackPath, "utf8");
    return JSON.parse(raw);
  } catch (_err) {
    return null;
  }
}

async function fetchConfigWithFallback() {
  let lastError = null;
  for (const url of CONFIG_URLS) {
    try {
      const config = await fetchJson(url);
      return { config, source: url };
    } catch (error) {
      lastError = error;
    }
  }
  const bundled = loadBundledConfig();
  if (bundled) {
    return { config: bundled, source: "bundled" };
  }
  throw lastError || new Error("Unable to load bootstrap config.");
}

function sanitizeFilename(name) {
  return name.replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_").slice(0, 140);
}

function detectInstallerName(productKey, downloadUrl) {
  const platform = getPlatformKey();
  const defaultSuffix = platform === "windows" ? ".exe" : ".dmg";
  try {
    const parsed = new URL(downloadUrl);
    const base = path.basename(parsed.pathname) || "";
    if (base) {
      const safe = sanitizeFilename(base);
      if (path.extname(safe)) {
        return safe;
      }
      return `${safe}${defaultSuffix}`;
    }
  } catch (_err) {
    // no-op
  }
  return `${productKey}-${Date.now()}${defaultSuffix}`;
}

function ensureHttpsDownload(urlText) {
  const parsed = new URL(urlText);
  if (!["https:", "http:"].includes(parsed.protocol)) {
    throw new Error("Unsupported download URL protocol.");
  }
}

function downloadFile({ urlText, destination, progressCb }) {
  return new Promise((resolve, reject) => {
    ensureHttpsDownload(urlText);
    const urlObj = new URL(urlText);
    const client = urlObj.protocol === "http:" ? http : https;

    const req = client.get(urlObj, (res) => {
      if (res.statusCode && [301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
        let redirectUrl = res.headers.location;
        if (redirectUrl.startsWith("/")) {
          redirectUrl = `${urlObj.protocol}//${urlObj.host}${redirectUrl}`;
        }
        res.resume();
        downloadFile({ urlText: redirectUrl, destination, progressCb })
          .then(resolve)
          .catch(reject);
        return;
      }
      if (res.statusCode && res.statusCode >= 400) {
        reject(new Error(`Download failed (${res.statusCode})`));
        res.resume();
        return;
      }

      const total = Number(res.headers["content-length"] || 0);
      let downloaded = 0;
      const out = fs.createWriteStream(destination);
      res.on("data", (chunk) => {
        downloaded += chunk.length;
        progressCb({ downloaded, total });
      });
      res.on("aborted", () => reject(new Error("Download interrupted by server.")));
      res.on("error", reject);
      out.on("error", reject);
      out.on("finish", () => {
        out.close(() => resolve(destination));
      });
      res.pipe(out);
    });

    req.on("error", reject);
    req.setTimeout(300000, () => {
      req.destroy(new Error("Download timeout."));
    });
  });
}

async function downloadFileWithRetry({ urlText, destination, progressCb, retries = 3 }) {
  let attempt = 0;
  let lastError = null;
  while (attempt < retries) {
    attempt += 1;
    try {
      if (fs.existsSync(destination)) {
        fs.unlinkSync(destination);
      }
      return await downloadFile({ urlText, destination, progressCb });
    } catch (error) {
      lastError = error;
      const message = String(error?.message || "").toLowerCase();
      const retryable = message.includes("timeout")
        || message.includes("interrupted")
        || message.includes("econnreset")
        || message.includes("socket hang up")
        || message.includes("aborted")
        || message.includes("download failed (5")
        || message.includes("download failed (429)");
      if (!retryable || attempt >= retries) {
        break;
      }
    }
  }
  throw lastError || new Error("Download failed.");
}

async function openInstaller(installerPath) {
  const result = await shell.openPath(installerPath);
  if (result) {
    throw new Error(result);
  }
}

function validateProductConfig(config, productKey, platformKey) {
  const section = config?.[productKey];
  if (!section) {
    throw new Error(`Missing product config: ${productKey}`);
  }
  const raw = section?.[platformKey];
  if (!raw) {
    throw new Error(`No package for ${platformKey} in ${productKey}`);
  }
  const urls = Array.isArray(raw) ? raw : [raw];
  const normalized = urls
    .map((item) => String(item || "").trim())
    .filter(Boolean);
  if (!normalized.length) {
    throw new Error(`No package URL for ${platformKey} in ${productKey}`);
  }
  return normalized;
}

async function downloadFromUrls({ urls, destination, progressCb }) {
  let lastError = null;
  for (const urlText of urls) {
    try {
      await downloadFileWithRetry({ urlText, destination, progressCb });
      return urlText;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error("Download failed.");
}

function detectInstalledProducts() {
  const initial = { monitor: false, storage: false };
  const platform = getPlatformKey();
  let baseInstalled = false;
  if (platform === "windows") {
    const candidates = [
      path.join(process.env.LOCALAPPDATA || "", "Programs", "Work Zilla Agent", "Work Zilla Agent.exe"),
      path.join(process.env.ProgramFiles || "", "Work Zilla Agent", "Work Zilla Agent.exe"),
      path.join(process.env["ProgramFiles(x86)"] || "", "Work Zilla Agent", "Work Zilla Agent.exe"),
    ];
    baseInstalled = candidates.some((p) => p && fs.existsSync(p));
  } else if (platform === "mac") {
    const candidates = [
      "/Applications/Work Zilla Agent.app",
      path.join(os.homedir(), "Applications", "Work Zilla Agent.app"),
    ];
    baseInstalled = candidates.some((p) => fs.existsSync(p));
  }
  if (!baseInstalled) {
    return initial;
  }
  const state = readInstalledState();
  const hasAnyProductInstalled = PRODUCT_KEYS.some((key) => state[key] === true);
  if (!hasAnyProductInstalled) {
    return initial;
  }
  return {
    monitor: Boolean(state.monitor),
    storage: Boolean(state.storage),
  };
}

function getInstalledStatePath() {
  return path.join(app.getPath("userData"), "installed-products.json");
}

function normalizeInstalledState(raw) {
  return {
    monitor: Boolean(raw?.monitor),
    storage: Boolean(raw?.storage),
  };
}

function readInstalledState() {
  const statePath = getInstalledStatePath();
  try {
    if (!fs.existsSync(statePath)) {
      return { monitor: false, storage: false };
    }
    const raw = JSON.parse(fs.readFileSync(statePath, "utf8"));
    return normalizeInstalledState(raw);
  } catch (_err) {
    return { monitor: false, storage: false };
  }
}

function writeInstalledState(nextState) {
  const statePath = getInstalledStatePath();
  try {
    fs.mkdirSync(path.dirname(statePath), { recursive: true });
    fs.writeFileSync(statePath, `${JSON.stringify(normalizeInstalledState(nextState), null, 2)}\n`, "utf8");
  } catch (_err) {
    // no-op
  }
}

function markProductInstalled(productKey) {
  const state = readInstalledState();
  state[productKey] = true;
  writeInstalledState(state);
}

ipcMain.handle("bootstrap:get-products", async () => {
  const platform = getPlatformKey();
  if (platform === "unsupported") {
    throw new Error("Platform not supported.");
  }

  const { config, source } = await fetchConfigWithFallback();
  const installed = detectInstalledProducts();
  const products = Object.entries(SUPPORTED_PRODUCTS).map(([key, label]) => {
    const hasPackage = Boolean(config?.[key]?.[platform]);
    return { key, label, available: hasPackage, installed: Boolean(installed[key]) };
  });

  return {
    configUrl: source,
    platform,
    products,
  };
});

ipcMain.handle("bootstrap:get-installed-products", async () => detectInstalledProducts());

ipcMain.handle("bootstrap:install-product", async (event, productKey) => {
  const platform = getPlatformKey();
  if (platform === "unsupported") {
    throw new Error("Platform not supported.");
  }
  if (!SUPPORTED_PRODUCTS[productKey]) {
    throw new Error("Unknown product selected.");
  }

  const { config } = await fetchConfigWithFallback();
  const downloadUrls = validateProductConfig(config, productKey, platform);
  const downloadsDir = path.join(app.getPath("downloads"), "WorkZillaInstallers");
  fs.mkdirSync(downloadsDir, { recursive: true });
  const filename = `${Date.now()}-${detectInstallerName(productKey, downloadUrls[0])}`;
  const destination = path.join(downloadsDir, filename);

  const usedUrl = await downloadFromUrls({
    urls: downloadUrls,
    destination,
    progressCb: (progress) => {
      event.sender.send("bootstrap:download-progress", {
        productKey,
        ...progress,
      });
    },
  });

  event.sender.send("bootstrap:download-progress", {
    productKey,
    downloaded: 1,
    total: 1,
    done: true,
  });

  await openInstaller(destination);
  markProductInstalled(productKey);
  return {
    ok: true,
    path: destination,
    productKey,
    platform,
    sourceUrl: usedUrl,
    filename: path.basename(destination),
  };
});

if (!gotSingleInstanceLock) {
  app.quit();
} else {
  app.whenReady().then(() => {
    createWindow();
  });

  app.on("second-instance", () => {
    if (!app.isReady()) {
      app.whenReady().then(() => {
        if (BrowserWindow.getAllWindows().length === 0) {
          createWindow();
        }
      });
      return;
    }
    let win = BrowserWindow.getAllWindows()[0];
    if (!win) {
      createWindow();
      win = BrowserWindow.getAllWindows()[0];
    }
    if (!win) {
      return;
    }
    if (win.isMinimized()) {
      win.restore();
    }
    win.show();
    win.focus();
  });
}

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (!app.isReady()) {
    return;
  }
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
