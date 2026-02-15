import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "../lib/api.js";

const emptyState = {
  loading: true,
  error: "",
  folders: [],
  basePrefix: "",
  storageMode: "local",
  items: [],
  isTruncated: false,
  nextToken: null,
  currentPrefix: ""
};

const TYPE_OPTIONS = [
  { value: "all", label: "All" },
  { value: "images", label: "Images" },
  { value: "documents", label: "Documents" }
];

function formatBytes(bytes) {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let size = bytes;
  let idx = 0;
  while (size >= 1024 && idx < units.length - 1) {
    size /= 1024;
    idx += 1;
  }
  return `${size.toFixed(size >= 10 || idx === 0 ? 0 : 1)} ${units[idx]}`;
}

export default function MediaLibraryPage({ scope, embedded = false, hideTabs = false, initialCategory = "screenshots", showTabs = false }) {
  const [state, setState] = useState(emptyState);
  const [folderSearch, setFolderSearch] = useState("");
  const [folderPrefix, setFolderPrefix] = useState("");
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [history, setHistory] = useState([]);
  const [token, setToken] = useState(null);
  const [selected, setSelected] = useState(new Set());
  const [confirm, setConfirm] = useState({ open: false, message: "", onConfirm: null });
  const [toast, setToast] = useState("");
  const [orgFilter, setOrgFilter] = useState("");
  const [openCategory, setOpenCategory] = useState(null);
  const [categories, setCategories] = useState([
    { key: "screenshots", label: "Screenshots" },
    { key: "ai_media_library", label: "AI Media Library" },
    { key: "payments", label: "Payments" }
  ]);
  const [category, setCategory] = useState(initialCategory);

  const isSaas = scope === "saas";
  const isOnlineStorageCategory = category === "online_storage";
  const allowPreview = category !== "screenshots" && !isOnlineStorageCategory;

  useEffect(() => {
    let active = true;
    async function loadFolders() {
      setState((prev) => ({ ...prev, loading: true, error: "" }));
      try {
        const params = new URLSearchParams();
        if (category) params.set("category", category);
        if (isSaas && orgFilter) params.set("org_id", orgFilter);
        const data = await apiFetch(`/api/storage/media/folders?${params.toString()}`);
        if (!active) return;
        setState((prev) => ({
          ...prev,
          loading: false,
          error: "",
          folders: data.folders || [],
          basePrefix: data.base_prefix || "",
          storageMode: data.storage_mode || "object"
        }));
        if (data.categories && Array.isArray(data.categories)) {
          setCategories(data.categories);
        }
        setFolderPrefix(data.base_prefix || "");
        setHistory([]);
        setToken(null);
        setSelected(new Set());
      } catch (err) {
        if (!active) return;
        setState((prev) => ({ ...prev, loading: false, error: err?.message || "Unable to load folders." }));
      }
    }
    loadFolders();
    return () => {
      active = false;
    };
  }, [isSaas, orgFilter, category]);

  useEffect(() => {
    let active = true;
    async function loadObjects() {
      if (state.storageMode !== "object") {
        return;
      }
      setState((prev) => ({ ...prev, error: "" }));
      try {
        const params = new URLSearchParams();
        if (folderPrefix) params.set("folder", folderPrefix);
        if (query && !isOnlineStorageCategory) params.set("q", query);
        if (typeFilter && !isOnlineStorageCategory) params.set("type", typeFilter);
        params.set("limit", "25");
        if (token) params.set("continuation_token", token);
        if (category) params.set("category", category);
        if (isSaas && orgFilter) params.set("org_id", orgFilter);
        const data = await apiFetch(`/api/storage/media/objects?${params.toString()}`);
        if (!active) return;
        setState((prev) => ({
          ...prev,
          items: data.items || [],
          isTruncated: Boolean(data.is_truncated),
          nextToken: data.next_token || null,
          currentPrefix: data.current_prefix || folderPrefix
        }));
        setSelected(new Set());
      } catch (err) {
        if (!active) return;
        setState((prev) => ({ ...prev, error: err?.message || "Unable to load objects." }));
      }
    }
    if (folderPrefix || state.basePrefix) {
      loadObjects();
    }
    return () => {
      active = false;
    };
  }, [folderPrefix, query, typeFilter, token, isSaas, orgFilter, category, state.storageMode, state.basePrefix, isOnlineStorageCategory]);

  const filteredFolders = useMemo(() => {
    if (!folderSearch) return state.folders;
    const needle = folderSearch.toLowerCase();
    return state.folders.filter((folder) => {
      const name = String(folder.name || "").toLowerCase();
      const prefix = String(folder.prefix || "").toLowerCase();
      return name.includes(needle) || prefix.includes(needle);
    });
  }, [folderSearch, state.folders]);

  const toggleSelect = (key) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const selectAll = () => {
    setSelected(new Set(state.items.map((item) => item.key)));
  };

  const clearAll = () => {
    setSelected(new Set());
  };

  const copyText = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      setToast("Copied.");
    } catch {
      setToast("Copy failed.");
    }
  };

  const openFile = async (key) => {
    try {
      const params = new URLSearchParams();
      params.set("key", key);
      if (category) params.set("category", category);
      if (isSaas && orgFilter) params.set("org_id", orgFilter);
      const data = await apiFetch(`/api/storage/media/signed-url?${params.toString()}`);
      if (data?.url) {
        window.open(data.url, "_blank", "noopener");
      }
    } catch (err) {
      setToast(err?.message || "Unable to open file.");
    }
  };

  const copyUrl = async (key) => {
    try {
      const params = new URLSearchParams();
      params.set("key", key);
      if (category) params.set("category", category);
      if (isSaas && orgFilter) params.set("org_id", orgFilter);
      const data = await apiFetch(`/api/storage/media/signed-url?${params.toString()}`);
      if (data?.url) {
        await copyText(data.url);
      }
    } catch (err) {
      setToast(err?.message || "Unable to copy URL.");
    }
  };

  const confirmDelete = (keys) => {
    setConfirm({
      open: true,
      message: `Delete ${keys.length} file(s)? This cannot be undone.`,
      onConfirm: () => executeDelete(keys)
    });
  };

  const executeDelete = async (keys) => {
    setConfirm({ open: false, message: "", onConfirm: null });
    try {
      if (keys.length === 1) {
        await apiFetch("/api/storage/media/object", {
          method: "DELETE",
          body: JSON.stringify({
            key: keys[0],
            org_id: isSaas && orgFilter ? orgFilter : undefined,
            category
          })
        });
      } else {
        await apiFetch("/api/storage/media/bulk-delete", {
          method: "POST",
          body: JSON.stringify({
            keys,
            org_id: isSaas && orgFilter ? orgFilter : undefined,
            category
          })
        });
      }
      setToast("Deleted successfully.");
      setSelected(new Set());
      setToken(null);
    } catch (err) {
      setToast(err?.message || "Delete failed.");
    }
  };

  const handleNext = () => {
    if (!state.nextToken) return;
    setHistory((prev) => [...prev, token]);
    setToken(state.nextToken);
  };

  const handlePrev = () => {
    setHistory((prev) => {
      if (!prev.length) return prev;
      const next = [...prev];
      const last = next.pop();
      setToken(last || null);
      return next;
    });
  };

  const allowTabs = showTabs && !hideTabs && !embedded;

  return (
    <div className={`${embedded ? "" : "page-shell"} media-library`}>
      <div className="d-flex align-items-center justify-content-between flex-wrap gap-2">
        <div>
          <h3 className="mb-1">Media Library</h3>
          <p className="text-secondary mb-0">Browse files stored in object storage.</p>
        </div>
        {toast ? <div className="alert alert-info mb-0">{toast}</div> : null}
      </div>

      {state.storageMode !== "object" ? (
        <div className="alert alert-warning mt-3">
          Switch to Object Storage to use Media Library.
        </div>
      ) : null}
      {state.error ? <div className="alert alert-danger mt-3">{state.error}</div> : null}

      {allowTabs ? (
        <div className="d-flex flex-wrap gap-2 mt-3">
          {categories.map((cat) => (
            <button
              key={cat.key}
              type="button"
              className={`btn btn-sm ${category === cat.key ? "btn-primary" : "btn-outline-light"}`}
              onClick={() => {
                setCategory(cat.key);
                setFolderPrefix("");
                setToken(null);
                setHistory([]);
              }}
            >
              {cat.label}
            </button>
          ))}
        </div>
      ) : null}

      <div className={`row g-3 mt-2 ${embedded ? "mt-3" : ""}`}>
        <div className="col-12 col-lg-2">
          <div className="card p-3 h-100">
            <div className="d-flex align-items-center justify-content-between mb-2">
              <h6 className="mb-0">Folders</h6>
              <button type="button" className="btn btn-outline-light btn-sm" onClick={() => setFolderSearch("")}>Clear</button>
            </div>
            <input
              type="text"
              className="form-control mb-2"
              placeholder={isOnlineStorageCategory ? "Search orgs/folders" : "Search folders"}
              value={folderSearch}
              onChange={(e) => setFolderSearch(e.target.value)}
            />
            <div className="list-group media-library-folders">
              {categories.map((cat) => {
                const isOpen = openCategory === cat.key;
                const isActive = category === cat.key;
                return (
                  <div key={cat.key}>
                    <button
                      type="button"
                      className={`list-group-item list-group-item-action d-flex align-items-center justify-content-between media-library-folder__category ${isActive ? "active" : ""} ${isOpen ? "is-open" : ""}`}
                      onClick={() => {
                        setCategory(cat.key);
                        setFolderPrefix("");
                        setToken(null);
                        setHistory([]);
                        setOpenCategory((prev) => (prev === cat.key ? null : cat.key));
                      }}
                    >
                      <span>{cat.label}</span>
                      <span className="media-library-folder__icon">{isOpen ? "-" : "+"}</span>
                    </button>
                    {isOpen ? (
                      <>
                        <button
                          type="button"
                          className={`list-group-item list-group-item-action media-library-folder__item ${folderPrefix === state.basePrefix ? "active" : ""}`}
                          onClick={() => {
                            setFolderPrefix(state.basePrefix);
                            setToken(null);
                            setHistory([]);
                          }}
                        >
                          All
                        </button>
                        {(cat.key === "online_storage" ? filteredFolders : filteredFolders
                          .filter((folder) => {
                            const name = String(folder.name || "").toLowerCase();
                            const isOrgId = /^[0-9]+$/.test(name);
                            const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(name);
                            return isOrgId || isUuid;
                          }))
                          .map((folder) => (
                            <button
                              key={folder.prefix}
                              type="button"
                              className={`list-group-item list-group-item-action media-library-folder__item ${folderPrefix === folder.prefix ? "active" : ""}`}
                              onClick={() => {
                                setFolderPrefix(folder.prefix);
                                setToken(null);
                                setHistory([]);
                              }}
                            >
                              {folder.name}
                            </button>
                          ))}
                      </>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="col-12 col-lg-10">
          <div className="card p-3 h-100">
            <div className="d-flex flex-wrap gap-2 align-items-end mb-2">
              <div className="flex-grow-1" style={{ minWidth: "240px" }}>
                <label className="form-label">{isOnlineStorageCategory ? "Search" : "Search files"}</label>
                <input
                  type="text"
                  className="form-control"
                  placeholder={isOnlineStorageCategory ? "Search by folder path" : "Search by filename or key"}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  disabled={isOnlineStorageCategory}
                />
              </div>
              <div style={{ minWidth: "120px" }}>
                <label className="form-label">Type</label>
                <select className="form-select" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} disabled={isOnlineStorageCategory}>
                  {TYPE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>
              {isSaas ? (
                <div style={{ minWidth: "140px" }}>
                  <label className="form-label">Org ID</label>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="Org ID"
                    value={orgFilter}
                    onChange={(e) => setOrgFilter(e.target.value)}
                    disabled={isOnlineStorageCategory}
                  />
                </div>
              ) : null}
              <div style={{ minWidth: "180px" }}>
                <label className="form-label">Actions</label>
                <div className="d-flex gap-2 flex-wrap">
                  <button type="button" className="btn btn-outline-light btn-sm" onClick={selectAll} disabled={isOnlineStorageCategory}>Select All</button>
                  <button type="button" className="btn btn-outline-light btn-sm" onClick={clearAll} disabled={isOnlineStorageCategory}>Clear</button>
                </div>
              </div>
            </div>

            <div className="table-responsive">
              <table className="table table-dark table-hover align-middle">
                <thead>
                  <tr>
                    <th style={{ width: "40px" }} />
                    <th>{isOnlineStorageCategory ? "Root Folder" : "Full Key"}</th>
                    <th style={{ width: "70px" }}>Size</th>
                    <th style={{ minWidth: "140px", whiteSpace: "nowrap" }}>Content Type</th>
                    <th style={{ minWidth: "180px", whiteSpace: "nowrap" }}>Last Modified</th>
                    <th style={{ minWidth: "200px" }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
              {state.items.length ? state.items.map((item) => (
                <tr key={item.key}>
                      <td>
                        <input
                          type="checkbox"
                          checked={selected.has(item.key)}
                          onChange={() => toggleSelect(item.key)}
                        />
                      </td>
                      <td className="text-secondary small">{item.key}</td>
                      <td>{formatBytes(item.size)}</td>
                      <td>{item.content_type_guess || "-"}</td>
                      <td>{item.last_modified || "-"}</td>
                      <td>
                        <div className="d-flex gap-2 flex-nowrap">
                          {allowPreview ? (
                            <button type="button" className="btn btn-outline-light btn-sm" onClick={() => openFile(item.key)} disabled={state.storageMode !== "object"}>
                              View
                            </button>
                          ) : null}
                          <button type="button" className="btn btn-outline-light btn-sm" onClick={() => copyText(item.key)} disabled={state.storageMode !== "object"}>
                            Copy Key
                          </button>
                          {allowPreview ? (
                            <button type="button" className="btn btn-outline-light btn-sm" onClick={() => copyUrl(item.key)} disabled={state.storageMode !== "object"}>
                              Copy URL
                            </button>
                          ) : null}
                          <button type="button" className="btn btn-outline-danger btn-sm" onClick={() => confirmDelete([item.key])} disabled={state.storageMode !== "object" || isOnlineStorageCategory}>
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
              )) : (
                <tr>
                  <td colSpan={6} className="text-center text-secondary">No files found.</td>
                </tr>
              )}
                </tbody>
              </table>
            </div>

            <div className="d-flex justify-content-between align-items-center mt-3">
              <button type="button" className="btn btn-outline-light" disabled={!history.length} onClick={handlePrev}>
                Prev
              </button>
              <div className="text-secondary small">
                {state.items.length} items
              </div>
              <button type="button" className="btn btn-outline-light" disabled={!state.isTruncated} onClick={handleNext}>
                Next
              </button>
            </div>

            <div className="d-flex justify-content-end mt-3">
              <button
                type="button"
                className="btn btn-danger"
                disabled={!selected.size || state.storageMode !== "object" || isOnlineStorageCategory}
                onClick={() => confirmDelete(Array.from(selected))}
              >
                Delete Selected
              </button>
            </div>
          </div>
        </div>
      </div>

      {confirm.open ? (
        <div className="modal-overlay" onClick={() => setConfirm({ open: false, message: "", onConfirm: null })}>
          <div className="modal-panel" onClick={(e) => e.stopPropagation()}>
            <h5>Confirm</h5>
            <div className="text-secondary mb-3">{confirm.message}</div>
            <div className="d-flex justify-content-end gap-2">
              <button type="button" className="btn btn-outline-light" onClick={() => setConfirm({ open: false, message: "", onConfirm: null })}>
                Cancel
              </button>
              <button type="button" className="btn btn-danger" onClick={() => confirm.onConfirm && confirm.onConfirm()}>
                Delete
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
