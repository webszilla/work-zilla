import { useEffect, useMemo, useRef, useState } from "react";

const emptyState = {
  loading: true,
  error: "",
  items: [],
  folderId: null,
  path: []
};

function formatBytes(bytes) {
  const value = Number(bytes || 0);
  if (!value) {
    return "0 B";
  }
  const kb = value / 1024;
  if (kb < 1024) {
    return `${kb.toFixed(1)} KB`;
  }
  const mb = kb / 1024;
  if (mb < 1024) {
    return `${mb.toFixed(1)} MB`;
  }
  return `${(mb / 1024).toFixed(2)} GB`;
}

function formatDate(value) {
  if (!value) {
    return "-";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString();
}

function normalizeAlias(value) {
  const fallback = "user";
  const base = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return base || fallback;
}

function sortItems(items) {
  const folders = items.filter((item) => item.type === "folder").sort((a, b) => (a.name || "").localeCompare(b.name || ""));
  const files = items.filter((item) => item.type === "file").sort((a, b) => (a.name || "").localeCompare(b.name || ""));
  return [...folders, ...files];
}

function buildInlineRows(items, expandedFolders, depth = 0, visited = new Set()) {
  const rows = [];
  const ordered = sortItems(items || []);
  ordered.forEach((item) => {
    rows.push({ kind: "item", key: `${item.type}-${item.id}-${depth}`, item, depth });
    if (item.type !== "folder") {
      return;
    }
    const expanded = expandedFolders[item.id];
    if (!expanded) {
      return;
    }
    if (expanded.loading) {
      rows.push({
        kind: "meta",
        key: `meta-${item.id}-loading-${depth}`,
        depth: depth + 1,
        text: "Loading..."
      });
      return;
    }
    if (expanded.error) {
      rows.push({
        kind: "meta",
        key: `meta-${item.id}-error-${depth}`,
        depth: depth + 1,
        text: `Error: ${expanded.error}`
      });
      return;
    }

    const nextItems = expanded.items || [];
    if (!nextItems.length) {
      rows.push({
        kind: "meta",
        key: `meta-${item.id}-empty-${depth}`,
        depth: depth + 1,
        text: "No files/folders"
      });
      return;
    }

    if (visited.has(item.id)) {
      return;
    }
    const nextVisited = new Set(visited);
    nextVisited.add(item.id);
    rows.push(...buildInlineRows(nextItems, expandedFolders, depth + 1, nextVisited));
  });
  return rows;
}

export default function StorageFilesScreen() {
  const [state, setState] = useState(emptyState);
  const [notice, setNotice] = useState("");
  const [contextMenu, setContextMenu] = useState(null);
  const [expandedFolders, setExpandedFolders] = useState({});
  const [userAlias, setUserAlias] = useState("user");
  const [dragActive, setDragActive] = useState(false);
  const [uploadProgress, setUploadProgress] = useState({ active: false, completed: 0, total: 0 });
  const [selectedItems, setSelectedItems] = useState({});
  const scrollByFolderRef = useRef({});
  const tableWrapRef = useRef(null);

  const breadcrumb = useMemo(() => state.path, [state.path]);
  const folderCount = state.items.filter((item) => item.type === "folder").length;
  const fileCount = state.items.filter((item) => item.type === "file").length;
  const inlineRows = useMemo(() => buildInlineRows(state.items, expandedFolders), [state.items, expandedFolders]);
  const selectedCount = Object.keys(selectedItems).length;
  const currentPath = useMemo(() => {
    if (!state.path.length) {
      return "Root";
    }
    return state.path.map((entry) => entry.name).join(" / ");
  }, [state.path]);

  async function loadProfileAlias() {
    try {
      const auth = await window.storageApi.getAuthStatus?.();
      const raw = auth?.user?.name || auth?.user?.email?.split("@")[0] || auth?.profile?.name || "user";
      const alias = normalizeAlias(raw);
      setUserAlias(alias);
      return alias;
    } catch {
      setUserAlias("user");
      return "user";
    }
  }

  async function ensureOnlineRootFolder(aliasValue = userAlias) {
    const onlineRootName = `${normalizeAlias(aliasValue)}-online-storage`;
    const rootData = await window.storageApi.getStorageRoot({});
    const rootItems = rootData.items || [];
    let onlineRoot = rootItems.find((item) => item.type === "folder" && item.name === onlineRootName);
    if (!onlineRoot && rootData.folder_id) {
      onlineRoot = await window.storageApi.createStorageFolder({
        parentId: rootData.folder_id,
        name: onlineRootName
      });
    }
    if (!onlineRoot?.id) {
      throw new Error("Unable to access online storage root.");
    }
    return {
      id: onlineRoot.id,
      name: onlineRoot.name || onlineRootName
    };
  }

  async function loadRoot(aliasValue = userAlias) {
    if (state.folderId && tableWrapRef.current) {
      scrollByFolderRef.current[state.folderId] = tableWrapRef.current.scrollTop || 0;
    }
    setState((prev) => ({ ...prev, loading: true, error: "" }));
    setExpandedFolders({});
    try {
      const onlineRoot = await ensureOnlineRootFolder(aliasValue);
      const data = await window.storageApi.getStorageFolder({ folderId: onlineRoot.id });
      setSelectedItems({});
      setState({
        loading: false,
        error: "",
        items: sortItems(data.items || []),
        folderId: data.folder_id || onlineRoot.id,
        path: [{ id: onlineRoot.id, name: onlineRoot.name }]
      });
    } catch (error) {
      setState({
        loading: false,
        error: error?.message || "Unable to load cloud files.",
        items: [],
        folderId: null,
        path: []
      });
    }
  }

  async function loadFolder(folderId, nextPath) {
    if (!folderId) {
      await loadRoot();
      return;
    }
    if (state.folderId && tableWrapRef.current) {
      scrollByFolderRef.current[state.folderId] = tableWrapRef.current.scrollTop || 0;
    }
    setState((prev) => ({ ...prev, loading: true, error: "" }));
    setExpandedFolders({});
    try {
      const data = await window.storageApi.getStorageFolder({ folderId });
      setSelectedItems({});
      setState({
        loading: false,
        error: "",
        items: sortItems(data.items || []),
        folderId: data.folder_id || folderId,
        path: nextPath
      });
    } catch (error) {
      setState((prev) => ({
        ...prev,
        loading: false,
        error: error?.message || "Unable to open folder."
      }));
    }
  }

  async function handleFolderClick(item) {
    if (!item?.id) {
      return;
    }
    const nextPath = [...state.path, { id: item.id, name: item.name || "Folder" }];
    await loadFolder(item.id, nextPath);
  }

  async function handleToggleFolderInline(item) {
    if (!item?.id || item.type !== "folder") {
      return;
    }
    const existing = expandedFolders[item.id];
    if (existing) {
      setExpandedFolders((prev) => {
        const next = { ...prev };
        delete next[item.id];
        return next;
      });
      return;
    }

    setExpandedFolders((prev) => ({
      ...prev,
      [item.id]: { loading: true, error: "", items: [] }
    }));

    try {
      const data = await window.storageApi.getStorageFolder({ folderId: item.id });
      setExpandedFolders((prev) => ({
        ...prev,
        [item.id]: {
          loading: false,
          error: "",
          items: sortItems(data.items || [])
        }
      }));
    } catch (error) {
      setExpandedFolders((prev) => ({
        ...prev,
        [item.id]: {
          loading: false,
          error: error?.message || "Unable to load folder.",
          items: []
        }
      }));
    }
  }

  async function handleBack() {
    if (state.path.length <= 1) {
      return;
    }
    const nextPath = state.path.slice(0, -1);
    const nextFolderId = nextPath[nextPath.length - 1]?.id;
    await loadFolder(nextFolderId, nextPath);
  }

  async function handleRefresh() {
    if (!state.folderId) {
      await loadRoot();
      return;
    }
    await loadFolder(state.folderId, state.path);
  }

  async function handleCreateFolder() {
    if (!state.folderId) {
      return;
    }
    const rawName = window.prompt("Enter new folder name");
    const name = (rawName || "").trim();
    if (!name) {
      return;
    }
    try {
      await window.storageApi.createStorageFolder({
        parentId: state.folderId,
        name
      });
      setNotice(`Folder "${name}" created.`);
      await handleRefresh();
    } catch (error) {
      setNotice(error?.message || "Unable to create folder.");
    }
  }

  async function handleRenameFolder(item, depth = 0) {
    if (!item?.id || item.type !== "folder") {
      return;
    }
    const currentName = item?.name || "Folder";
    const rawName = window.prompt("Rename folder", currentName);
    const name = (rawName || "").trim();
    if (!name || name === item.name) {
      return;
    }
    try {
      await window.storageApi.renameStorageFolder({
        folderId: item.id,
        name
      });
      setNotice(`Folder renamed to "${name}".`);
      await handleRefresh();
    } catch (error) {
      setNotice(error?.message || "Unable to rename folder.");
    }
  }

  async function handleUploadFiles() {
    if (!state.folderId) {
      return;
    }
    try {
      const result = await window.storageApi.uploadStorageFiles({
        folderId: state.folderId
      });
      if (result?.failed?.length) {
        setNotice(`${result.uploaded || 0} uploaded, ${result.failed.length} failed.`);
      } else if (result?.uploaded) {
        setNotice(`${result.uploaded} file(s) uploaded successfully.`);
      }
      await handleRefresh();
    } catch (error) {
      setNotice(error?.message || "Upload failed.");
    }
  }

  async function handleUploadPaths(filePaths) {
    if (!state.folderId || !filePaths?.length) {
      return;
    }
    setUploadProgress({ active: true, completed: 0, total: filePaths.length });
    try {
      const result = await window.storageApi.uploadStoragePaths({
        folderId: state.folderId,
        filePaths
      });
      if (result?.failed?.length) {
        setNotice(`${result.uploaded || 0} uploaded, ${result.failed.length} failed.`);
      } else if (result?.uploaded) {
        setNotice(`${result.uploaded} file(s) uploaded successfully.`);
      }
      await handleRefresh();
    } catch (error) {
      setNotice(error?.message || "Upload failed.");
    } finally {
      setUploadProgress({ active: false, completed: 0, total: 0 });
    }
  }

  function getItemKey(item) {
    return `${item.type}:${item.id}`;
  }

  function toggleSelectItem(item, forceValue = null) {
    const key = getItemKey(item);
    setSelectedItems((prev) => {
      const next = { ...prev };
      const shouldSelect = forceValue === null ? !next[key] : forceValue;
      if (shouldSelect) {
        next[key] = item;
      } else {
        delete next[key];
      }
      return next;
    });
  }

  function handleRowClick(event, item) {
    if (event?.metaKey || event?.ctrlKey) {
      toggleSelectItem(item);
      return;
    }
    setSelectedItems({ [getItemKey(item)]: item });
  }

  function clearSelection() {
    setSelectedItems({});
  }

  async function handleBulkDownload(items = Object.values(selectedItems)) {
    if (!items?.length) {
      return;
    }
    const fileIds = items.filter((item) => item.type === "file").map((item) => item.id);
    const folderIds = items.filter((item) => item.type === "folder").map((item) => item.id);
    try {
      const result = await window.storageApi.downloadBulk({
        fileIds,
        folderIds
      });
      if (result?.path) {
        setNotice(`Downloaded to ${result.path}`);
      } else if (result?.error) {
        setNotice(result.error);
      }
    } catch (error) {
      setNotice(error?.message || "Bulk download failed.");
    }
  }

  async function handleDownloadFolder(folderId, folderName) {
    if (!folderId) {
      return;
    }
    try {
      const result = await window.storageApi.downloadFile({
        folderId,
        filename: folderName ? `${folderName}.zip` : undefined
      });
      if (result?.cancelled) {
        setNotice("Download cancelled.");
        return;
      }
      if (result?.path) {
        setNotice(`Downloaded to ${result.path}`);
      } else if (result?.error) {
        setNotice(result.error);
      }
    } catch (error) {
      setNotice(error?.message || "Download failed.");
    }
  }

  async function handleDownloadFile(item) {
    if (!item?.id) {
      return;
    }
    try {
      const result = await window.storageApi.downloadFile({
        fileId: item.id,
        filename: item.name
      });
      if (result?.cancelled) {
        setNotice("Download cancelled.");
        return;
      }
      if (result?.path) {
        setNotice(`Downloaded to ${result.path}`);
      } else if (result?.error) {
        setNotice(result.error);
      }
    } catch (error) {
      setNotice(error?.message || "Download failed.");
    }
  }

  function openItemContextMenu(event, item, depth = 0) {
    event.preventDefault();
    if (!item) {
      return;
    }
    const itemKey = getItemKey(item);
    const selected = selectedItems[itemKey];
    const multiSelection = selected ? Object.values(selectedItems) : [item];
    setContextMenu({
      x: event.clientX,
      y: event.clientY,
      item,
      depth,
      multiSelection
    });
  }

  async function handleContextAction(action, item, depth = 0) {
    setContextMenu(null);
    if (!item) {
      return;
    }
    if (action === "open-folder" && item.type === "folder") {
      await handleToggleFolderInline(item);
      return;
    }
    if (action === "expand-folder" && item.type === "folder") {
      await handleToggleFolderInline(item);
      return;
    }
    if (action === "rename-folder" && item.type === "folder") {
      await handleRenameFolder(item, depth);
      return;
    }
    if (action === "download-file" && item.type === "file") {
      await handleDownloadFile(item);
      return;
    }
    if (action === "download-folder" && item.type === "folder") {
      await handleDownloadFolder(item.id, item.name);
      return;
    }
    if (action === "bulk-download") {
      await handleBulkDownload(contextMenu?.multiSelection || []);
    }
  }

  async function handleBreadcrumbClick(index) {
    if (index < 0) {
      await loadRoot();
      return;
    }
    const targetPath = breadcrumb.slice(0, index + 1);
    const targetId = targetPath[targetPath.length - 1]?.id;
    await loadFolder(targetId, targetPath);
  }

  useEffect(() => {
    async function init() {
      const alias = await loadProfileAlias();
      await loadRoot(alias);
    }
    init();
  }, []);

  useEffect(() => {
    if (!window.storageApi.onStorageUploadProgress) {
      return undefined;
    }
    const unsubscribe = window.storageApi.onStorageUploadProgress((status) => {
      setUploadProgress((prev) => ({
        ...prev,
        active: true,
        completed: Number(status?.completed || 0),
        total: Number(status?.total || prev.total || 0)
      }));
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (!state.folderId || !tableWrapRef.current) {
      return;
    }
    const top = scrollByFolderRef.current[state.folderId] || 0;
    tableWrapRef.current.scrollTop = top;
  }, [state.folderId, inlineRows.length]);

  function handleDragOver(event) {
    event.preventDefault();
    if (!dragActive) {
      setDragActive(true);
    }
  }

  function handleDragLeave(event) {
    event.preventDefault();
    if (event.currentTarget.contains(event.relatedTarget)) {
      return;
    }
    setDragActive(false);
  }

  async function handleDrop(event) {
    event.preventDefault();
    setDragActive(false);
    const filePaths = Array.from(event.dataTransfer?.files || [])
      .map((file) => file.path)
      .filter(Boolean);
    await handleUploadPaths(filePaths);
  }

  useEffect(() => {
    function handleWindowClick() {
      setContextMenu(null);
    }
    function handleEscape(event) {
      if (event.key === "Escape") {
        setContextMenu(null);
      }
    }
    window.addEventListener("click", handleWindowClick);
    window.addEventListener("keydown", handleEscape);
    return () => {
      window.removeEventListener("click", handleWindowClick);
      window.removeEventListener("keydown", handleEscape);
    };
  }, []);

  return (
    <div className="screen">
      <div className="screen-header">
        <h2>File Storage</h2>
        <p className="text-muted">Browse and manage online cloud storage.</p>
      </div>
      {notice ? <div className="alert alert-info">{notice}</div> : null}
      {state.error ? <div className="alert alert-danger">{state.error}</div> : null}

      <div className="explorer-main">
        <div className="card">
          <div className="row">
            <div>
              <div className="list-title">Cloud Storage</div>
              <div className="list-subtitle">Create folders, upload files, and manage downloads.</div>
            </div>
            <div className="button-row" style={{ marginTop: 0 }}>
              {state.path.length > 1 ? (
                <button type="button" className="btn btn-secondary" onClick={handleBack}>
                  Up
                </button>
              ) : null}
              <button type="button" className="btn btn-secondary" onClick={handleRefresh}>
                Refresh
              </button>
              {state.path.length >= 1 ? (
                <button type="button" className="btn btn-secondary" onClick={handleCreateFolder}>
                  New Folder
                </button>
              ) : null}
              <button type="button" className="btn btn-secondary" onClick={handleUploadFiles}>
                Upload Files
              </button>
              {selectedCount > 1 ? (
                <button type="button" className="btn btn-secondary" onClick={() => handleBulkDownload()}>
                  Bulk Download ({selectedCount})
                </button>
              ) : null}
              {selectedCount ? (
                <button type="button" className="btn btn-secondary" onClick={clearSelection}>
                  Clear Selection
                </button>
              ) : null}
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => handleDownloadFolder(state.folderId, state.path[state.path.length - 1]?.name || "folder")}
              >
                Download Folder
              </button>
            </div>
          </div>
          {uploadProgress.active ? (
            <div className="text-muted mt-2">
              Uploading... {uploadProgress.completed}/{uploadProgress.total}
            </div>
          ) : null}
        </div>

        <div
          className={`card explorer-list-panel ${dragActive ? "drag-active" : ""}`}
          onDragOver={handleDragOver}
          onDragEnter={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          {dragActive ? <div className="drop-overlay">Drop files here to upload</div> : null}
          <div className="file-list-header">
            <div>
              <div className="list-title">File Location</div>
              <div className="file-location">
                <button type="button" className="breadcrumb-link" onClick={() => handleBreadcrumbClick(-1)}>
                  Root
                </button>
                {breadcrumb.map((entry, index) => (
                  <div className="breadcrumb-item" key={entry.id}>
                    <span className="breadcrumb-sep">/</span>
                    <button type="button" className="breadcrumb-link" onClick={() => handleBreadcrumbClick(index)}>
                      {entry.name}
                    </button>
                  </div>
                ))}
              </div>
            </div>
            <div className="file-counts">
              Folders: {folderCount} • Files: {fileCount}
            </div>
          </div>

          {state.loading ? (
            <div className="text-muted">Loading cloud files...</div>
          ) : inlineRows.length ? (
            <div className="table-wrap" ref={tableWrapRef}>
              <table className="table-ui">
                <thead>
                  <tr>
                    <th>
                      <input
                        type="checkbox"
                        checked={selectedCount > 0 && selectedCount === inlineRows.filter((row) => row.kind === "item").length}
                        onChange={(event) => {
                          if (event.target.checked) {
                            const allItems = {};
                            inlineRows.forEach((row) => {
                              if (row.kind === "item") {
                                allItems[getItemKey(row.item)] = row.item;
                              }
                            });
                            setSelectedItems(allItems);
                            return;
                          }
                          clearSelection();
                        }}
                      />
                    </th>
                    <th>Name</th>
                    <th>Type</th>
                    <th>Size</th>
                    <th>Modified</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {inlineRows.map((row) => {
                    if (row.kind === "meta") {
                      return (
                        <tr key={row.key}>
                          <td />
                          <td colSpan={5}>
                            <div className="tree-meta-row">
                              {row.text}
                            </div>
                          </td>
                        </tr>
                      );
                    }

                    const item = row.item;
                    const isFolder = item.type === "folder";
                    const expanded = Boolean(expandedFolders[item.id]);
                    const displayName = item.name || "-";

                    return (
                      <tr
                        key={row.key}
                        onContextMenu={(event) => openItemContextMenu(event, item, row.depth)}
                        onClick={(event) => handleRowClick(event, item)}
                        className={selectedItems[getItemKey(item)] ? "row-selected" : ""}
                      >
                        <td onClick={(event) => event.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={Boolean(selectedItems[getItemKey(item)])}
                            onChange={(event) => toggleSelectItem(item, event.target.checked)}
                          />
                        </td>
                        <td>
                          {isFolder ? (
                            <button
                              type="button"
                              className="item-link tree-item-link"
                              onClick={() => handleToggleFolderInline(item)}
                            >
                              <span className="tree-caret">{expanded ? "▾" : "▸"}</span>
                              <span>📁 {displayName}</span>
                            </button>
                          ) : (
                            <span>📄 {displayName}</span>
                          )}
                        </td>
                        <td>{isFolder ? "Folder" : "File"}</td>
                        <td>{item.type === "file" ? formatBytes(item.size) : "-"}</td>
                        <td>{formatDate(item.created_at)}</td>
                        <td>
                          {isFolder ? (
                            <div className="button-row" style={{ marginTop: 0 }}>
                              <button type="button" className="btn btn-secondary btn-sm" onClick={() => handleToggleFolderInline(item)}>
                                Open
                              </button>
                              <button type="button" className="btn btn-secondary btn-sm" onClick={() => handleRenameFolder(item, row.depth)}>
                                Rename
                              </button>
                            </div>
                          ) : (
                            <button type="button" className="btn btn-secondary" onClick={() => handleDownloadFile(item)}>
                              Download
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="empty-cloud-state">Create a new folder or drag files to upload.</div>
          )}

          <div className="file-status-bar">
            <span>Location: {currentPath}</span>
            <span>{folderCount + fileCount} items</span>
          </div>
        </div>
      </div>

      {contextMenu ? (
        <div
          className="item-context-menu"
          style={{ top: `${contextMenu.y}px`, left: `${contextMenu.x}px` }}
          onClick={(event) => event.stopPropagation()}
        >
          {contextMenu.item.type === "folder" ? (
            <>
              {(contextMenu?.multiSelection?.length || 0) > 1 ? (
                <button type="button" className="item-context-menu-action" onClick={() => handleContextAction("bulk-download", contextMenu.item, contextMenu.depth)}>
                  Bulk Download ({contextMenu.multiSelection.length})
                </button>
              ) : null}
              <button type="button" className="item-context-menu-action" onClick={() => handleContextAction("expand-folder", contextMenu.item, contextMenu.depth)}>
                Expand / Collapse
              </button>
              <button type="button" className="item-context-menu-action" onClick={() => handleContextAction("open-folder", contextMenu.item, contextMenu.depth)}>
                Open
              </button>
              <button type="button" className="item-context-menu-action" onClick={() => handleContextAction("rename-folder", contextMenu.item, contextMenu.depth)}>
                Rename
              </button>
              <button
                type="button"
                className="item-context-menu-action"
                onClick={() => handleContextAction("download-folder", contextMenu.item, contextMenu.depth)}
              >
                Download
              </button>
            </>
          ) : (
            <>
              {(contextMenu?.multiSelection?.length || 0) > 1 ? (
                <button type="button" className="item-context-menu-action" onClick={() => handleContextAction("bulk-download", contextMenu.item, contextMenu.depth)}>
                  Bulk Download ({contextMenu.multiSelection.length})
                </button>
              ) : null}
              <button
                type="button"
                className="item-context-menu-action"
                onClick={() => handleContextAction("download-file", contextMenu.item, contextMenu.depth)}
              >
                Download
              </button>
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}
