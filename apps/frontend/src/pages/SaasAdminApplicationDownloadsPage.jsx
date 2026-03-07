import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { apiFetch } from "../lib/api.js";

const emptyState = {
  loading: true,
  error: "",
  items: [],
  storage_mode: "local",
  object_ready: false,
  folder_prefix: "",
  public_page_path: "",
  public_routes: []
};

function detectPlatformKey(item) {
  const platform = String(item?.platform || "").toLowerCase();
  const filename = String(item?.filename || "").toLowerCase();
  const relativeKey = String(item?.relative_key || "").toLowerCase();
  const haystack = `${platform} ${filename} ${relativeKey}`;

  if (haystack.includes("mac") || filename.endsWith(".dmg") || filename.endsWith(".pkg")) {
    return "mac";
  }
  if (
    haystack.includes("windows") ||
    haystack.includes(" win") ||
    filename.endsWith(".exe") ||
    filename.endsWith(".msi")
  ) {
    return "windows";
  }
  return "other";
}

function detectRoutePlatformKey(route) {
  const label = String(route?.label || "").toLowerCase();
  const path = String(route?.path || "").toLowerCase();
  const haystack = `${label} ${path}`;
  if (haystack.includes("mac")) {
    return "mac";
  }
  if (haystack.includes("windows") || haystack.includes("-win")) {
    return "windows";
  }
  return "other";
}

function detectRouteFamily(route) {
  const label = String(route?.label || "").toLowerCase();
  const path = String(route?.path || "").toLowerCase();
  const haystack = `${label} ${path}`;
  if (haystack.includes("monitor")) {
    return "monitor";
  }
  if (haystack.includes("storage")) {
    return "storage";
  }
  if (haystack.includes("imposition")) {
    return "imposition";
  }
  return "bootstrap";
}

function inferRouteProduct(route) {
  const label = String(route?.label || "").toLowerCase();
  if (label.includes("work suite") || label.includes("monitor")) {
    return "Work Suite";
  }
  if (label.includes("online storage") || label.includes("storage")) {
    return "Online Storage";
  }
  if (label.includes("imposition")) {
    return "Print Marks";
  }
  return "Bootstrap Installer";
}

function formatBytes(bytes) {
  const value = Number(bytes || 0);
  if (!value) {
    return "0 B";
  }
  const units = ["B", "KB", "MB", "GB"];
  let unitIndex = 0;
  let size = value;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }
  return `${size.toFixed(size >= 100 || unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

export default function SaasAdminApplicationDownloadsPage() {
  const [state, setState] = useState(emptyState);
  const [busyKey, setBusyKey] = useState("");
  const [notice, setNotice] = useState("");
  const [platformTab, setPlatformTab] = useState("mac");

  const filteredItems = useMemo(() => {
    return state.items.filter((item) => {
      if (platformTab === "mac") {
        return detectPlatformKey(item) === "mac";
      }
      if (platformTab === "windows") {
        return detectPlatformKey(item) === "windows";
      }
      return true;
    });
  }, [platformTab, state.items]);

  const routeFallbackItems = useMemo(() => {
    const macItems = state.items.filter((item) => detectPlatformKey(item) === "mac");
    const firstMacItem = macItems[0] || null;
    const macFamilyReference = macItems.reduce((acc, item) => {
      const family = String(item?.family || "").toLowerCase();
      const familyKey = family.includes("monitor")
        ? "monitor"
        : family.includes("storage")
          ? "storage"
          : family.includes("imposition")
            ? "imposition"
            : family.includes("bootstrap")
              ? "bootstrap"
              : "";
      if (!familyKey || acc[familyKey]) {
        return acc;
      }
      return { ...acc, [familyKey]: item };
    }, {});

    return state.public_routes
      .filter((route) => detectRoutePlatformKey(route) === platformTab)
      .map((route) => {
        const familyKey = detectRouteFamily(route);
        const routeProduct = inferRouteProduct(route);
        const productReference = macItems.find(
          (item) => String(item?.product || "").toLowerCase() === routeProduct.toLowerCase()
        );
        const macReference = macFamilyReference[familyKey] || productReference || firstMacItem;
        return {
          family: "route",
          filename: route.label || route.path || "Download Route",
          relative_key: route.path || "",
          product: macReference?.product || routeProduct,
          platform: platformTab === "mac" ? "macOS" : "Windows",
          arch: macReference?.arch || "x64",
          size_bytes: Number(macReference?.size_bytes || 0),
          updated_at: macReference?.updated_at || "-",
          download_url: route.path || "",
          is_route_fallback: true
        };
      });
  }, [platformTab, state.items, state.public_routes]);

  const tableItems = filteredItems.length ? filteredItems : routeFallbackItems;

  async function loadData() {
    setState((prev) => ({ ...prev, loading: true, error: "" }));
    try {
      const data = await apiFetch("/api/saas-admin/settings/application-downloads");
      setState({
        loading: false,
        error: "",
        items: Array.isArray(data?.items) ? data.items : [],
        storage_mode: data?.storage_mode || "local",
        object_ready: Boolean(data?.object_ready),
        folder_prefix: data?.folder_prefix || "",
        public_page_path: data?.public_page_path || "",
        public_routes: Array.isArray(data?.public_routes) ? data.public_routes : []
      });
    } catch (error) {
      setState((prev) => ({
        ...prev,
        loading: false,
        error: error?.message || "Unable to load application downloads."
      }));
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  async function handleRemove(item) {
    if (!window.confirm(`Remove ${item.filename} from Backblaze application folder?`)) {
      return;
    }
    setBusyKey(item.relative_key);
    setNotice("");
    try {
      await apiFetch("/api/saas-admin/settings/application-downloads", {
        method: "DELETE",
        body: JSON.stringify({ relative_key: item.relative_key })
      });
      setNotice(`${item.filename} removed.`);
      await loadData();
    } catch (error) {
      setNotice(error?.message || "Unable to remove file.");
    } finally {
      setBusyKey("");
    }
  }

  return (
    <>
        <div className="d-flex justify-content-between align-items-start gap-3 flex-wrap">
          <div>
            <h3 className="mb-1">Application Downloads</h3>
            <p className="text-secondary mb-1">
              Manage installer files from the Backblaze application folder.
            </p>
            <div className="small text-secondary">
              Folder: <code>{state.folder_prefix || "application-downloads/"}</code>
            </div>
            <div className="small text-secondary">
              Public page: <a href={state.public_page_path || "/downloads/application-files/"} target="_blank" rel="noreferrer">{state.public_page_path || "/downloads/application-files/"}</a>
            </div>
          </div>
          <div className="d-flex gap-2">
            <button type="button" className="btn btn-outline-light btn-sm" onClick={loadData}>
              Refresh
            </button>
            <Link to="/saas-admin" className="btn btn-outline-light btn-sm">
              Back to SaaS Admin
            </Link>
          </div>
        </div>

        {state.error ? <div className="alert alert-danger mt-3">{state.error}</div> : null}
        {notice ? <div className="alert alert-info mt-3">{notice}</div> : null}
        {!state.object_ready ? (
          <div className="alert alert-warning mt-3">
            Object storage is not ready. Configure Backblaze in Media Storage first.
          </div>
        ) : null}

        <div className="row g-3 mt-1 application-downloads__routes">
          {state.public_routes.map((route) => (
            <div className="col-12 col-md-6 col-xl-3" key={route.path}>
              <a className="card p-3 h-100 admin-feature-card" href={route.path} target="_blank" rel="noreferrer">
                <div className="stat-icon stat-icon-primary">
                  <i className="bi bi-box-arrow-up-right" aria-hidden="true" />
                </div>
                <h5 className="mb-1">{route.label}</h5>
                <p className="text-secondary mb-0">{route.path}</p>
              </a>
            </div>
          ))}
        </div>

        <div className="d-flex align-items-center gap-2 mt-4 mb-3">
          <span className="small text-secondary">Platform:</span>
          <div className="btn-group btn-group-sm" role="tablist" aria-label="Platform tabs">
            <button
              type="button"
              role="tab"
              aria-selected={platformTab === "mac"}
              className={`btn ${platformTab === "mac" ? "btn-primary" : "btn-outline-light"}`}
              onClick={() => setPlatformTab("mac")}
            >
              macOS
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={platformTab === "windows"}
              className={`btn ${platformTab === "windows" ? "btn-primary" : "btn-outline-light"}`}
              onClick={() => setPlatformTab("windows")}
            >
              Windows
            </button>
          </div>
        </div>

        <div className="table-responsive">
          <table className="table table-dark table-hover align-middle mb-0">
            <thead>
              <tr>
                <th>File</th>
                <th>Product</th>
                <th>Platform</th>
                <th>Arch</th>
                <th>Size</th>
                <th>Updated</th>
                <th className="text-end">Actions</th>
              </tr>
            </thead>
            <tbody>
              {tableItems.length ? tableItems.map((item) => (
                <tr key={item.relative_key || item.filename}>
                  <td title={item.filename || ""}>
                    <span
                      className="d-inline-block text-truncate align-middle"
                      style={{ maxWidth: "260px" }}
                    >
                      {item.filename}
                    </span>
                  </td>
                  <td>{item.product || "-"}</td>
                  <td>
                    {item.platform || (detectPlatformKey(item) === "mac" ? "macOS" : detectPlatformKey(item) === "windows" ? "Windows" : "-")}
                  </td>
                  <td>{item.arch || "-"}</td>
                  <td>{item.size_bytes ? formatBytes(item.size_bytes) : "-"}</td>
                  <td>{item.updated_at || "-"}</td>
                  <td className="text-end">
                    <div className="d-flex justify-content-end gap-2 application-downloads__actions">
                      <a
                        className="btn btn-primary btn-sm application-downloads__action-btn"
                        href={item.download_url}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Download
                      </a>
                      <button
                        type="button"
                        className="btn btn-outline-danger btn-sm application-downloads__action-btn"
                        onClick={() => handleRemove(item)}
                        disabled={item.is_route_fallback || !state.object_ready || busyKey === item.relative_key}
                      >
                        {item.is_route_fallback ? "Route" : busyKey === item.relative_key ? "Removing..." : "Remove"}
                      </button>
                    </div>
                  </td>
                </tr>
              )) : (
                <tr>
                  <td colSpan="7" className="text-center text-secondary">
                    No {platformTab === "mac" ? "macOS" : "Windows"} installer files found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
    </>
  );
}
