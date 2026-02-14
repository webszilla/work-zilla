const { app, BrowserWindow, ipcMain, shell } = require("electron");
const fs = require("fs");
const path = require("path");
const https = require("https");
const http = require("http");
const { URL } = require("url");

const CONFIG_URL =
  process.env.WORKZILLA_BOOTSTRAP_CONFIG_URL ||
  "https://example.com/workzilla/bootstrap-products.json";

const SUPPORTED_PRODUCTS = {
  monitor: "WorkZilla Monitor",
  storage: "Online Storage",
};

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

function sanitizeFilename(name) {
  return name.replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_").slice(0, 140);
}

function detectInstallerName(productKey, downloadUrl) {
  try {
    const parsed = new URL(downloadUrl);
    const base = path.basename(parsed.pathname) || "";
    if (base) return sanitizeFilename(base);
  } catch (_err) {
    // no-op
  }
  const suffix = getPlatformKey() === "windows" ? ".exe" : ".dmg";
  return `${productKey}-${Date.now()}${suffix}`;
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
        res.resume();
        downloadFile({ urlText: res.headers.location, destination, progressCb })
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
      res.on("error", reject);
      out.on("error", reject);
      out.on("finish", () => {
        out.close(() => resolve(destination));
      });
      res.pipe(out);
    });

    req.on("error", reject);
    req.setTimeout(60000, () => {
      req.destroy(new Error("Download timeout."));
    });
  });
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
  const urlText = section?.[platformKey];
  if (!urlText) {
    throw new Error(`No package for ${platformKey} in ${productKey}`);
  }
  return urlText;
}

ipcMain.handle("bootstrap:get-products", async () => {
  const platform = getPlatformKey();
  if (platform === "unsupported") {
    throw new Error("Platform not supported.");
  }

  const config = await fetchJson(CONFIG_URL);
  const products = Object.entries(SUPPORTED_PRODUCTS).map(([key, label]) => {
    const hasPackage = Boolean(config?.[key]?.[platform]);
    return { key, label, available: hasPackage };
  });

  return {
    configUrl: CONFIG_URL,
    platform,
    products,
  };
});

ipcMain.handle("bootstrap:install-product", async (event, productKey) => {
  const platform = getPlatformKey();
  if (platform === "unsupported") {
    throw new Error("Platform not supported.");
  }
  if (!SUPPORTED_PRODUCTS[productKey]) {
    throw new Error("Unknown product selected.");
  }

  const config = await fetchJson(CONFIG_URL);
  const downloadUrl = validateProductConfig(config, productKey, platform);
  const downloadsDir = path.join(app.getPath("downloads"), "WorkZillaInstallers");
  fs.mkdirSync(downloadsDir, { recursive: true });
  const filename = detectInstallerName(productKey, downloadUrl);
  const destination = path.join(downloadsDir, filename);

  await downloadFile({
    urlText: downloadUrl,
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
  return { ok: true, path: destination, productKey, platform };
});

app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
