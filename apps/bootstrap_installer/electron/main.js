const { app, BrowserWindow, ipcMain, shell } = require("electron");
const fs = require("fs");
const path = require("path");
const https = require("https");
const http = require("http");
const os = require("os");
const { execFile, spawn } = require("child_process");
const { URL } = require("url");

const CONFIG_URLS = [
  process.env.WORKZILLA_BOOTSTRAP_CONFIG_URL,
  "http://127.0.0.1:8000/downloads/bootstrap-products.json",
  "http://localhost:8000/downloads/bootstrap-products.json",
  "https://getworkzilla.com/downloads/bootstrap-products.json",
  "https://getworkzilla.com/static/downloads/bootstrap-products.json",
].filter(Boolean);

const SUPPORTED_PRODUCTS = {
  monitor: {
    label: "Work Suite",
    description: "Employee monitoring and productivity insights.",
    packageBasename: { windows: "monitor-win-installer", mac: "monitor-mac-installer" },
  },
  storage: {
    label: "Online Storage",
    description: "Secure cloud sync and backup.",
    packageBasename: { windows: "storage-win-installer", mac: "storage-mac-installer" },
  },
  imposition: {
    label: "Imposition Software",
    description: "Imposition Tool for Digital Printing Press",
    packageBasename: { windows: "imposition-win", mac: "imposition-mac" },
  },
};
const gotSingleInstanceLock = app.requestSingleInstanceLock();
const PRODUCT_KEYS = Object.keys(SUPPORTED_PRODUCTS);
const PRODUCT_CONFIG_ALIASES = {
  monitor: ["monitor"],
  storage: ["storage"],
  imposition: ["imposition", "imposition-software"],
};
const SHARED_LAUNCH_PREF_PATH = path.join(os.homedir(), ".workzilla-product-launch.json");

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

function savePreferredProduct(productKey) {
  try {
    fs.writeFileSync(
      SHARED_LAUNCH_PREF_PATH,
      `${JSON.stringify({ preferredProduct: productKey, updatedAt: new Date().toISOString() }, null, 2)}\n`,
      "utf8",
    );
  } catch (_err) {
    // no-op
  }
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
    const timeoutMs = ["127.0.0.1", "localhost"].includes(urlObj.hostname) ? 1200 : 15000;
    req.setTimeout(timeoutMs, () => {
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

function mergeBootstrapConfig(remoteConfig, bundledConfig) {
  const merged = { ...(bundledConfig || {}), ...(remoteConfig || {}) };
  for (const key of Object.keys(bundledConfig || {})) {
    const bundledSection = bundledConfig?.[key];
    const remoteSection = remoteConfig?.[key];
    if (
      bundledSection
      && typeof bundledSection === "object"
      && !Array.isArray(bundledSection)
      && remoteSection
      && typeof remoteSection === "object"
      && !Array.isArray(remoteSection)
    ) {
      merged[key] = { ...bundledSection, ...remoteSection };
    }
  }
  return merged;
}

async function fetchConfigWithFallback() {
  let lastError = null;
  const bundled = loadBundledConfig();
  for (const url of CONFIG_URLS) {
    try {
      const remoteConfig = await fetchJson(url);
      const config = mergeBootstrapConfig(remoteConfig, bundled);
      return { config, source: url };
    } catch (error) {
      lastError = error;
    }
  }
  if (bundled) {
    return { config: bundled, source: "bundled" };
  }
  throw lastError || new Error("Unable to load bootstrap config.");
}

function sanitizeFilename(name) {
  return name.replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_").slice(0, 140);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isLockedFileError(error) {
  const code = String(error?.code || "").toUpperCase();
  return code === "EBUSY" || code === "EPERM" || code === "EACCES";
}

async function removeFileWithRetry(filePath, maxAttempts = 10, waitMs = 350) {
  let lastError = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      if (!fs.existsSync(filePath)) {
        return;
      }
      fs.unlinkSync(filePath);
      return;
    } catch (error) {
      lastError = error;
      if (!isLockedFileError(error) || attempt === maxAttempts) {
        throw error;
      }
      await sleep(waitMs);
    }
  }
  if (lastError) {
    throw lastError;
  }
}

async function finalizeDownloadedInstaller(tempPath, targetPath) {
  if (fs.existsSync(targetPath)) {
    try {
      await removeFileWithRetry(targetPath);
    } catch (error) {
      if (!isLockedFileError(error)) {
        throw error;
      }
      const parsed = path.parse(targetPath);
      const fallbackName = `${parsed.name}-${Date.now()}${parsed.ext || ""}`;
      const fallbackPath = path.join(parsed.dir, fallbackName);
      fs.renameSync(tempPath, fallbackPath);
      return fallbackPath;
    }
  }
  fs.renameSync(tempPath, targetPath);
  return targetPath;
}

function detectInstallerName(productKey, downloadUrl) {
  const platform = getPlatformKey();
  const defaultSuffix = platform === "windows" ? ".exe" : ".dmg";
  const meta = SUPPORTED_PRODUCTS[productKey] || {};
  const preferredBase = sanitizeFilename(meta.packageBasename?.[platform] || `${productKey}-installer`);
  let suffix = defaultSuffix;
  try {
    const parsed = new URL(downloadUrl);
    const ext = path.extname(path.basename(parsed.pathname) || "");
    if (ext) {
      suffix = ext;
    }
  } catch (_err) {
    // no-op
  }
  return `${preferredBase}${suffix}`;
}

function extractVersionFromText(value) {
  const text = String(value || "");
  if (!text) {
    return "";
  }
  const match = text.match(/\b(\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?)\b/);
  return match ? match[1] : "";
}

function compareSemver(a, b) {
  const parse = (version) => {
    const core = String(version || "").split("-", 1)[0] || "";
    const [major = "0", minor = "0", patch = "0"] = core.split(".");
    return [
      Number.parseInt(major, 10) || 0,
      Number.parseInt(minor, 10) || 0,
      Number.parseInt(patch, 10) || 0,
    ];
  };
  const left = parse(a);
  const right = parse(b);
  for (let i = 0; i < 3; i += 1) {
    if (left[i] !== right[i]) {
      return left[i] - right[i];
    }
  }
  return 0;
}

function isUpdateAvailable(installedVersion, latestVersion) {
  const installed = extractVersionFromText(installedVersion);
  const latest = extractVersionFromText(latestVersion);
  if (!latest) {
    return false;
  }
  if (!installed) {
    return true;
  }
  return compareSemver(latest, installed) > 0;
}

function detectLatestVersionFromUrls(urls = []) {
  for (const item of urls) {
    try {
      const parsed = new URL(String(item || "").trim());
      const version = extractVersionFromText(path.basename(parsed.pathname || ""));
      if (version) {
        return version;
      }
    } catch (_err) {
      const version = extractVersionFromText(item);
      if (version) {
        return version;
      }
    }
  }
  return "";
}

function ensureHttpsDownload(urlText) {
  const parsed = new URL(urlText);
  if (!["https:", "http:", "file:"].includes(parsed.protocol)) {
    throw new Error("Unsupported download URL protocol.");
  }
}

function copyLocalFileWithProgress({ urlText, destination, progressCb }) {
  return new Promise((resolve, reject) => {
    try {
      const sourcePath = decodeURIComponent(new URL(urlText).pathname);
      const total = fs.statSync(sourcePath).size;
      let downloaded = 0;
      const readStream = fs.createReadStream(sourcePath);
      const writeStream = fs.createWriteStream(destination);
      readStream.on("data", (chunk) => {
        downloaded += chunk.length;
        progressCb({ downloaded, total });
      });
      readStream.on("error", reject);
      writeStream.on("error", reject);
      writeStream.on("finish", () => resolve(destination));
      readStream.pipe(writeStream);
    } catch (error) {
      reject(error);
    }
  });
}

function fetchRemoteFileSize(urlText) {
  return new Promise((resolve) => {
    try {
      const urlObj = new URL(urlText);
      const client = urlObj.protocol === "http:" ? http : https;
      const req = client.request(urlObj, { method: "HEAD" }, (res) => {
        const contentLength = Number(res.headers["content-length"] || 0);
        resolve(contentLength > 0 ? contentLength : 0);
        res.resume();
      });
      req.on("error", () => resolve(0));
      req.setTimeout(15000, () => {
        req.destroy();
        resolve(0);
      });
      req.end();
    } catch (_err) {
      resolve(0);
    }
  });
}

function resolveDownloadTotal(res, offset) {
  const contentRange = String(res.headers["content-range"] || "");
  const rangeMatch = contentRange.match(/bytes\s+\d+-\d+\/(\d+)/i);
  if (rangeMatch) {
    return Number(rangeMatch[1] || 0);
  }
  const contentLength = Number(res.headers["content-length"] || 0);
  if (res.statusCode === 206 && contentLength > 0) {
    return offset + contentLength;
  }
  return contentLength;
}

function downloadFile({ urlText, destination, progressCb, offset = 0 }) {
  return new Promise((resolve, reject) => {
    ensureHttpsDownload(urlText);
    const urlObj = new URL(urlText);
    const client = urlObj.protocol === "http:" ? http : https;
    const headers = {};
    if (offset > 0) {
      headers.Range = `bytes=${offset}-`;
    }
    const req = client.get(urlObj, { headers }, (res) => {
      if (res.statusCode && [301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
        let redirectUrl = res.headers.location;
        if (redirectUrl.startsWith("/")) {
          redirectUrl = `${urlObj.protocol}//${urlObj.host}${redirectUrl}`;
        }
        res.resume();
        downloadFile({ urlText: redirectUrl, destination, progressCb, offset })
          .then(resolve)
          .catch(reject);
        return;
      }
      if (res.statusCode && res.statusCode >= 400) {
        reject(new Error(`Download failed (${res.statusCode})`));
        res.resume();
        return;
      }

      const supportsResume = res.statusCode === 206;
      const startingOffset = supportsResume ? offset : 0;
      if (offset > 0 && !supportsResume && fs.existsSync(destination)) {
        fs.unlinkSync(destination);
      }
      const total = resolveDownloadTotal(res, startingOffset);
      let downloaded = startingOffset;
      const out = fs.createWriteStream(destination, { flags: startingOffset > 0 ? "a" : "w" });
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
  if (new URL(urlText).protocol === "file:") {
    if (fs.existsSync(destination)) {
      fs.unlinkSync(destination);
    }
    return copyLocalFileWithProgress({ urlText, destination, progressCb });
  }
  if (process.platform === "darwin") {
    return downloadFileWithCurl({ urlText, destination, progressCb });
  }
  let attempt = 0;
  let lastError = null;
  while (attempt < retries) {
    attempt += 1;
    try {
      const offset = fs.existsSync(destination) ? fs.statSync(destination).size : 0;
      if (offset > 0) {
        progressCb({ downloaded: offset, total: 0 });
      }
      return await downloadFile({ urlText, destination, progressCb, offset });
    } catch (error) {
      lastError = error;
      const message = String(error?.message || "").toLowerCase();
      const isRangeNotSatisfiable = message.includes("download failed (416)");
      if (isRangeNotSatisfiable && fs.existsSync(destination)) {
        // Stale/oversized partial file can trigger HTTP 416 on resumed downloads.
        // Remove local partial and retry from byte 0.
        try {
          fs.unlinkSync(destination);
        } catch (_unlinkError) {
          // no-op, normal retry logic below will surface final error if needed.
        }
      }
      const retryable = message.includes("timeout")
        || message.includes("interrupted")
        || message.includes("econnreset")
        || message.includes("socket hang up")
        || message.includes("aborted")
        || message.includes("download failed (5")
        || message.includes("download failed (429)")
        || isRangeNotSatisfiable;
      if (!retryable || attempt >= retries) {
        break;
      }
    }
  }
  throw lastError || new Error("Download failed.");
}

function downloadFileWithCurl({ urlText, destination, progressCb, allowResume = true }) {
  return new Promise(async (resolve, reject) => {
    ensureHttpsDownload(urlText);
    const total = await fetchRemoteFileSize(urlText);
    let stderr = "";
    let settled = false;
    const reportProgress = () => {
      try {
        const downloaded = fs.existsSync(destination) ? fs.statSync(destination).size : 0;
        progressCb({ downloaded, total });
      } catch (_err) {
        progressCb({ downloaded: 0, total });
      }
    };
    reportProgress();
    const timer = setInterval(reportProgress, 500);
    const curlArgs = [
      "--location",
      "--fail",
      "--http1.1",
      "--retry", "8",
      "--retry-all-errors",
      "--retry-delay", "2",
      "--connect-timeout", "30",
      "--speed-time", "30",
      "--speed-limit", "1024",
      `--output=${destination}`,
      urlText,
    ];
    if (allowResume) {
      curlArgs.splice(curlArgs.length - 1, 0, "--continue-at=-");
    }
    const curl = spawn("/usr/bin/curl", curlArgs, {
      stdio: ["ignore", "ignore", "pipe"],
    });

    curl.stderr.on("data", (chunk) => {
      stderr += String(chunk || "");
    });

    curl.on("error", (error) => {
      if (settled) return;
      settled = true;
      clearInterval(timer);
      reject(error);
    });

    curl.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearInterval(timer);
      reportProgress();
      if (code === 0) {
        resolve(destination);
        return;
      }
      const normalizedError = (stderr || `curl exited with code ${code}`).trim();
      const cannotResume = normalizedError.includes("curl: (33)")
        || normalizedError.toLowerCase().includes("cannot resume")
        || normalizedError.toLowerCase().includes("doesn't seem to support byte ranges");
      if (allowResume && cannotResume) {
        try {
          if (fs.existsSync(destination)) {
            fs.unlinkSync(destination);
          }
        } catch (_err) {
          // no-op
        }
        downloadFileWithCurl({ urlText, destination, progressCb, allowResume: false })
          .then(resolve)
          .catch(reject);
        return;
      }
      reject(new Error(cannotResume ? "Download resume not supported by server. Restarted download failed." : normalizedError));
    });
  });
}

async function openInstaller(installerPath) {
  const result = await shell.openPath(installerPath);
  if (result) {
    throw new Error(result);
  }
}

async function runSilentInstall(installerPath) {
  const platform = getPlatformKey();
  const ext = path.extname(installerPath).toLowerCase();
  if (platform === "windows") {
    if (ext === ".msi") {
      await runExecFile("msiexec", ["/i", installerPath, "/qn", "/norestart"]);
      return true;
    }
    // Prefer interactive flow for .exe installers so the user can see
    // and complete wizard/UAC steps reliably.
    return false;
  }
  // macOS pkg silent install needs elevated privileges; use interactive fallback.
  return false;
}

function validateProductConfig(config, productKey, platformKey) {
  const keys = PRODUCT_CONFIG_ALIASES[productKey] || [productKey];
  const section = keys.map((key) => config?.[key]).find((item) => Boolean(item));
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
  if (productKey !== "imposition") {
    return normalized;
  }

  const fallbacks = [];
  for (const item of normalized) {
    try {
      const parsed = new URL(item);
      const fallbackPath = platformKey === "mac" ? "/downloads/mac-agent/" : "/downloads/windows-agent/";
      fallbacks.push(`${parsed.protocol}//${parsed.host}${fallbackPath}`);
    } catch (_err) {
      // no-op
    }
  }
  const deduped = [];
  for (const item of [...normalized, ...fallbacks]) {
    if (!deduped.includes(item)) {
      deduped.push(item);
    }
  }
  return deduped;
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

async function detectInstalledProducts() {
  const initial = PRODUCT_KEYS.reduce((acc, key) => {
    acc[key] = { installed: false, version: "" };
    return acc;
  }, {});
  const baseInstalled = isBaseAgentInstalled();
  if (!baseInstalled) {
    return initial;
  }
  const installedVersion = await getInstalledBaseAgentVersion();
  const state = readInstalledState();
  const hasAnyProductInstalled = PRODUCT_KEYS.some((key) => state[key] === true);
  if (!hasAnyProductInstalled) {
    return initial;
  }
  return PRODUCT_KEYS.reduce((acc, key) => {
    const isInstalled = Boolean(state[key]);
    acc[key] = {
      installed: isInstalled,
      version: isInstalled ? installedVersion : "",
    };
    return acc;
  }, {});
}

function isBaseAgentInstalled() {
  const platform = getPlatformKey();
  if (platform === "windows") {
    const candidates = [
      path.join(process.env.LOCALAPPDATA || "", "Programs", "Work Zilla Agent", "Work Zilla Agent.exe"),
      path.join(process.env.ProgramFiles || "", "Work Zilla Agent", "Work Zilla Agent.exe"),
      path.join(process.env["ProgramFiles(x86)"] || "", "Work Zilla Agent", "Work Zilla Agent.exe"),
    ];
    return candidates.some((candidate) => candidate && fs.existsSync(candidate));
  }
  if (platform === "mac") {
    const candidates = [
      "/Applications/Work Zilla Agent.app",
      path.join(os.homedir(), "Applications", "Work Zilla Agent.app"),
    ];
    return candidates.some((candidate) => fs.existsSync(candidate));
  }
  return false;
}

function getInstalledStatePath() {
  return path.join(app.getPath("userData"), "installed-products.json");
}

function normalizeInstalledState(raw) {
  const normalized = {
    lastInstalledProduct: PRODUCT_KEYS.includes(raw?.lastInstalledProduct)
      ? raw.lastInstalledProduct
      : "",
  };
  for (const key of PRODUCT_KEYS) {
    normalized[key] = Boolean(raw?.[key]);
  }
  return normalized;
}

function readInstalledState() {
  const statePath = getInstalledStatePath();
  try {
    if (!fs.existsSync(statePath)) {
      return normalizeInstalledState({});
    }
    const raw = JSON.parse(fs.readFileSync(statePath, "utf8"));
    return normalizeInstalledState(raw);
  } catch (_err) {
    return normalizeInstalledState({});
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
  for (const key of PRODUCT_KEYS) {
    state[key] = Boolean(state[key]);
  }
  state[productKey] = true;
  state.lastInstalledProduct = productKey;
  writeInstalledState(state);
}

function markProductUninstalled(productKey) {
  const state = readInstalledState();
  state[productKey] = false;
  if (state.lastInstalledProduct === productKey) {
    state.lastInstalledProduct = "";
  }
  writeInstalledState(state);
  return state;
}

function runExecFile(file, args = []) {
  return new Promise((resolve, reject) => {
    execFile(file, args, { windowsHide: true }, (error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}

function runExecFileWithOutput(file, args = []) {
  return new Promise((resolve, reject) => {
    execFile(file, args, { windowsHide: true }, (error, stdout, stderr) => {
      if (error) {
        reject(error);
        return;
      }
      resolve({ stdout: String(stdout || ""), stderr: String(stderr || "") });
    });
  });
}

async function queryWindowsRegistryValue(rootKey, subKey, valueName) {
  try {
    const fullPath = `${rootKey}\\${subKey}`;
    const { stdout } = await runExecFileWithOutput("reg", ["query", fullPath, "/v", valueName]);
    const lines = stdout.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    const row = lines.find((line) => line.toLowerCase().startsWith(valueName.toLowerCase()));
    if (!row) {
      return "";
    }
    const parts = row.split(/\s{2,}/).filter(Boolean);
    return String(parts[parts.length - 1] || "").trim();
  } catch (_err) {
    return "";
  }
}

async function getInstalledBaseAgentVersion() {
  const platform = getPlatformKey();
  if (platform === "windows") {
    const uninstallKeys = [
      "Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\Work Zilla Agent",
      "Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\Work Zilla Agent_is1",
      "Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\com.workzilla.agent",
      "Software\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\Work Zilla Agent",
      "Software\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\Work Zilla Agent_is1",
      "Software\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\com.workzilla.agent",
    ];
    for (const root of ["HKCU", "HKLM"]) {
      for (const subKey of uninstallKeys) {
        const displayVersion = await queryWindowsRegistryValue(root, subKey, "DisplayVersion");
        if (displayVersion) {
          return displayVersion;
        }
      }
    }
    return isBaseAgentInstalled() ? "Installed (version unknown)" : "";
  }
  if (platform === "mac") {
    const appCandidates = [
      "/Applications/Work Zilla Agent.app/Contents/Info.plist",
      path.join(os.homedir(), "Applications", "Work Zilla Agent.app", "Contents", "Info.plist"),
    ];
    for (const plistPath of appCandidates) {
      if (!fs.existsSync(plistPath)) {
        continue;
      }
      try {
        const { stdout } = await runExecFileWithOutput("/usr/libexec/PlistBuddy", ["-c", "Print :CFBundleShortVersionString", plistPath]);
        const version = String(stdout || "").trim();
        if (version) {
          return version;
        }
      } catch (_err) {
        // no-op
      }
      try {
        const { stdout } = await runExecFileWithOutput("/usr/libexec/PlistBuddy", ["-c", "Print :CFBundleVersion", plistPath]);
        const version = String(stdout || "").trim();
        if (version) {
          return version;
        }
      } catch (_err) {
        // no-op
      }
    }
    return isBaseAgentInstalled() ? "Installed (version unknown)" : "";
  }
  return "";
}

async function uninstallBaseAgentForWindows() {
  const uninstallers = [
    path.join(process.env.LOCALAPPDATA || "", "Programs", "Work Zilla Agent", "Uninstall Work Zilla Agent.exe"),
    path.join(process.env.ProgramFiles || "", "Work Zilla Agent", "Uninstall Work Zilla Agent.exe"),
    path.join(process.env["ProgramFiles(x86)"] || "", "Work Zilla Agent", "Uninstall Work Zilla Agent.exe"),
  ].filter(Boolean);
  const existing = uninstallers.filter((candidate) => fs.existsSync(candidate));
  if (!existing.length) {
    throw new Error("Uninstaller not found for Work Zilla Agent.");
  }

  let lastError = null;
  for (const uninstaller of existing) {
    for (const args of [[], ["/S"], ["/quiet"]]) {
      try {
        await runExecFile(uninstaller, args);
        return;
      } catch (error) {
        lastError = error;
      }
    }
  }
  throw lastError || new Error("Unable to run Work Zilla Agent uninstaller.");
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForBaseAgentInstall(maxWaitMs = 120000, stepMs = 2500) {
  const deadline = Date.now() + maxWaitMs;
  while (Date.now() < deadline) {
    if (isBaseAgentInstalled()) {
      return true;
    }
    await delay(stepMs);
  }
  return isBaseAgentInstalled();
}

function uninstallBaseAgentForMac() {
  const candidates = [
    "/Applications/Work Zilla Agent.app",
    path.join(os.homedir(), "Applications", "Work Zilla Agent.app"),
  ];
  const existing = candidates.filter((candidate) => fs.existsSync(candidate));
  if (!existing.length) {
    throw new Error("Work Zilla Agent app not found.");
  }
  for (const appPath of existing) {
    fs.rmSync(appPath, { recursive: true, force: true });
  }
}

async function uninstallBaseAgent() {
  const platform = getPlatformKey();
  if (platform === "windows") {
    await uninstallBaseAgentForWindows();
    return;
  }
  if (platform === "mac") {
    uninstallBaseAgentForMac();
    return;
  }
  throw new Error("Uninstall is not supported on this platform.");
}

function resolveBootstrapUninstallerPath() {
  const installDir = path.dirname(process.execPath);
  const candidates = [
    path.join(installDir, "Uninstall Work Zilla Installer.exe"),
    path.join(installDir, `Uninstall ${app.getName()}.exe`),
    path.join(installDir, "Uninstall.exe"),
  ];
  for (const candidate of candidates) {
    if (candidate && fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return "";
}

ipcMain.handle("bootstrap:get-products", async () => {
  const platform = getPlatformKey();
  if (platform === "unsupported") {
    throw new Error("Platform not supported.");
  }

  const { config, source } = await fetchConfigWithFallback();
  const installed = await detectInstalledProducts();
  const products = Object.entries(SUPPORTED_PRODUCTS).map(([key, meta]) => {
    const aliases = PRODUCT_CONFIG_ALIASES[key] || [key];
    const urls = aliases
      .flatMap((alias) => {
        const raw = config?.[alias]?.[platform];
        return Array.isArray(raw) ? raw : [raw];
      })
      .map((item) => String(item || "").trim())
      .filter(Boolean);
    const hasPackage = urls.length > 0;
    const installedInfo = installed[key] || { installed: false, version: "" };
    const latestVersion = detectLatestVersionFromUrls(urls) || "latest";
    return {
      key,
      label: meta.label,
      description: meta.description || "",
      available: hasPackage,
      installed: Boolean(installedInfo.installed),
      installedVersion: installedInfo.version || "",
      latestVersion,
      updateAvailable: Boolean(installedInfo.installed) && hasPackage && isUpdateAvailable(installedInfo.version || "", latestVersion),
    };
  });

  return {
    installerVersion: app.getVersion(),
    configUrl: source,
    platform,
    products,
  };
});

ipcMain.handle("bootstrap:get-installed-products", async () => detectInstalledProducts());

async function installProductFlow(event, productKey) {
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
  const filename = detectInstallerName(productKey, downloadUrls[0]);
  const destination = path.join(downloadsDir, filename);
  const tempDestination = `${destination}.part`;

  const usedUrl = await downloadFromUrls({
    urls: downloadUrls,
    destination: tempDestination,
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
  const installerPath = await finalizeDownloadedInstaller(tempDestination, destination);

  let installMode = "interactive";
  let installDetected = false;
  try {
    savePreferredProduct(productKey);
    const silentlyInstalled = await runSilentInstall(installerPath);
    if (!silentlyInstalled) {
      await openInstaller(installerPath);
      installDetected = await waitForBaseAgentInstall();
    } else {
      installMode = "silent";
      installDetected = true;
    }
  } catch (_err) {
    await openInstaller(installerPath);
    installDetected = await waitForBaseAgentInstall();
  }
  if (installDetected) {
    markProductInstalled(productKey);
  }
  const installedInfo = await detectInstalledProducts();
  const installedMarked = Boolean(installedInfo?.[productKey]?.installed);
  return {
    ok: true,
    path: installerPath,
    productKey,
    platform,
    sourceUrl: usedUrl,
    filename: path.basename(installerPath),
    latestVersion: detectLatestVersionFromUrls(downloadUrls) || "latest",
    installedVersion: installedInfo?.[productKey]?.version || "",
    installedMarked,
    message: installedMarked
      ? `${SUPPORTED_PRODUCTS[productKey].label} installation detected.`
      : "Installer opened. Complete setup wizard and then click Refresh/Restart installer.",
    installMode,
    firstLaunch: {
      activationRequired: productKey === "imposition",
      licenseEndpoint: "/api/imposition/license/validate",
      registerEndpoint: "/api/imposition/device/register",
      checkEndpoint: "/api/imposition/device/check",
    },
  };
}

ipcMain.handle("bootstrap:install-product", async (event, productKey) => installProductFlow(event, productKey));

ipcMain.handle("bootstrap:uninstall-product", async (_event, productKey) => {
  if (!SUPPORTED_PRODUCTS[productKey]) {
    throw new Error("Unknown product selected.");
  }
  const state = readInstalledState();
  if (!state[productKey]) {
    return {
      ok: true,
      productKey,
      message: `${SUPPORTED_PRODUCTS[productKey].label} is already not installed.`,
    };
  }

  const nextState = { ...state, [productKey]: false };
  const hasOtherProducts = PRODUCT_KEYS.some((key) => key !== productKey && nextState[key] === true);
  if (hasOtherProducts) {
    writeInstalledState(nextState);
    return {
      ok: true,
      productKey,
      message: `${SUPPORTED_PRODUCTS[productKey].label} module removed. Shared app kept for other installed modules.`,
    };
  }

  if (!isBaseAgentInstalled()) {
    markProductUninstalled(productKey);
    return {
      ok: true,
      productKey,
      message: `${SUPPORTED_PRODUCTS[productKey].label} module removed.`,
    };
  }

  try {
    await uninstallBaseAgent();
    markProductUninstalled(productKey);
    return {
      ok: true,
      productKey,
      message: `${SUPPORTED_PRODUCTS[productKey].label} uninstalled from this computer.`,
    };
  } catch (error) {
    throw new Error(error?.message || "Uninstall failed.");
  }
});

ipcMain.handle("bootstrap:update-product", async (event, productKey) => {
  if (!SUPPORTED_PRODUCTS[productKey]) {
    throw new Error("Unknown product selected.");
  }
  const installed = await detectInstalledProducts();
  const installedInfo = installed[productKey] || { installed: false, version: "" };
  if (!installedInfo.installed) {
    throw new Error("This module is not installed on this device.");
  }
  const platform = getPlatformKey();
  if (platform === "unsupported") {
    throw new Error("Platform not supported.");
  }
  const { config } = await fetchConfigWithFallback();
  const downloadUrls = validateProductConfig(config, productKey, platform);
  const latestVersion = detectLatestVersionFromUrls(downloadUrls) || "latest";
  if (!isUpdateAvailable(installedInfo.version || "", latestVersion)) {
    throw new Error("Already running the latest version.");
  }
  return installProductFlow(event, productKey);
});

ipcMain.handle("bootstrap:uninstall-installer", async () => {
  if (process.platform !== "win32") {
    throw new Error("Installer uninstall is supported only on Windows.");
  }
  const uninstallerPath = resolveBootstrapUninstallerPath();
  if (!uninstallerPath) {
    throw new Error("Work Zilla Installer uninstaller not found.");
  }
  const child = spawn(uninstallerPath, [], {
    detached: true,
    stdio: "ignore",
  });
  child.unref();
  app.quit();
  return { ok: true };
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
