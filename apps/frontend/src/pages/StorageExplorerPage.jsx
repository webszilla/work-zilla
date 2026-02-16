import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { apiFetch, getCsrfToken } from "../lib/api.js";
import { useConfirm } from "../components/ConfirmDialog.jsx";
import { formatDeviceDateTime } from "../lib/datetime.js";

const PAGE_SIZE = 50;

const emptyListState = {
  loading: true,
  error: "",
  items: [],
  folderId: null,
  rootId: null,
  pagination: {
    limit: PAGE_SIZE,
    offset: 0,
    total_folders: 0,
    total_files: 0
  }
};

const emptyStorage = {
  loading: true,
  error: "",
  total_gb: 0,
  used_gb: 0,
  remaining_gb: 0,
  bandwidth_total_gb: 0,
  bandwidth_used_gb: 0,
  bandwidth_remaining_gb: 0,
  bandwidth_limited: false,
  addon_slots: 0
};

const emptyUsers = {
  loading: true,
  error: "",
  items: []
};

const emptyDevices = {
  loading: true,
  error: "",
  items: []
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

function formatGb(value) {
  const number = Number(value || 0);
  return `${number.toFixed(0)} GB`;
}

function formatDate(value) {
  return formatDeviceDateTime(value);
}

async function fetchFormData(url, formData) {
  if (!getCsrfToken()) {
    await fetch("/api/auth/csrf", { credentials: "include" });
  }
  const response = await fetch(url, {
    method: "POST",
    credentials: "include",
    headers: {
      "X-CSRFToken": getCsrfToken()
    },
    body: formData
  });
  const text = await response.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch (error) {
      data = null;
    }
  }
  if (!response.ok) {
    const message = data?.error || data?.detail || `Request failed (${response.status})`;
    const err = new Error(message);
    err.status = response.status;
    err.data = data;
    throw err;
  }
  return data;
}

function buildPathLabel(path) {
  if (!path || !path.length) {
    return "Root";
  }
  return path.map((entry) => entry.name).join(" / ");
}

function getErrorMessage(error, fallback) {
  const code = error?.data?.error || error?.data?.detail || error?.message;
  const map = {
    permission_denied: "You do not have access to this item.",
    storage_limit_exceeded: "Storage limit exceeded. Please upgrade your storage.",
    bandwidth_limit_exceeded: "Bandwidth limit exceeded. Please upgrade your plan.",
    invalid_folder: "Folder not found.",
    file_not_found: "File not found.",
    uploads_disabled: "Uploads are currently disabled.",
    rate_limited: "Too many requests. Please try again shortly.",
    storage_unavailable: "Storage is temporarily unavailable.",
    read_only: "This organization is currently in read-only mode."
  };
  return map[code] || fallback || "Something went wrong.";
}

export default function StorageExplorerPage() {
  const isReadOnly = typeof window !== "undefined" && window.__WZ_READ_ONLY__ === true;
  const params = useParams();
  const navigate = useNavigate();
  const confirm = useConfirm();
  const [listState, setListState] = useState(emptyListState);
  const [storage, setStorage] = useState(emptyStorage);
  const [users, setUsers] = useState(emptyUsers);
  const [isOrgAdmin, setIsOrgAdmin] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState(params.id ? Number(params.id) : null);
  const [path, setPath] = useState([]);
  const [tree, setTree] = useState({});
  const [expanded, setExpanded] = useState(() => new Set());
  const [searchInput, setSearchInput] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [searchState, setSearchState] = useState({ loading: false, error: "", items: [], limit: 50 });
  const [uploadQueue, setUploadQueue] = useState([]);
  const [notice, setNotice] = useState("");
  const [limitExceeded, setLimitExceeded] = useState(false);
  const [moveModal, setMoveModal] = useState({ open: false, item: null, type: "", targetId: "" });
  const [devices, setDevices] = useState(emptyDevices);
  const [selectedDeviceId, setSelectedDeviceId] = useState(params.device_id || "");
  const [deviceRootId, setDeviceRootId] = useState(null);

  const currentFolderLabel = useMemo(() => buildPathLabel(path), [path]);
  const selectedDeviceLabel = useMemo(() => {
    if (!selectedDeviceId) {
      return "Root";
    }
    const match = devices.items.find((device) => device.device_id === selectedDeviceId);
    return match?.device_name || selectedDeviceId;
  }, [devices.items, selectedDeviceId]);

  useEffect(() => {
    if (params.id) {
      const nextId = Number(params.id);
      if (!Number.isNaN(nextId)) {
        setSelectedUserId(nextId);
      }
    } else {
      setSelectedUserId(null);
    }
  }, [params.id]);

  useEffect(() => {
    let active = true;
    async function loadUsers() {
      try {
        const data = await apiFetch("/api/storage/org/users");
        if (!active) {
          return;
        }
        setUsers({ loading: false, error: "", items: data.items || [] });
        setIsOrgAdmin(true);
      } catch (error) {
        if (!active) {
          return;
        }
        if (error?.status === 403) {
          setUsers({ loading: false, error: "", items: [] });
          setIsOrgAdmin(false);
          return;
        }
        setUsers({ loading: false, error: getErrorMessage(error, "Unable to load users."), items: [] });
        setIsOrgAdmin(false);
      }
    }
    loadUsers();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    async function loadDevices() {
      try {
        const paramsList = new URLSearchParams();
        if (selectedUserId) {
          paramsList.set("user_id", String(selectedUserId));
        }
        const data = await apiFetch(`/api/storage/org/devices?${paramsList.toString()}`);
        if (!active) {
          return;
        }
        setDevices({ loading: false, error: "", items: data.items || [] });
      } catch (error) {
        if (!active) {
          return;
        }
        if (error?.status === 403) {
          setDevices({ loading: false, error: "", items: [] });
          return;
        }
        setDevices({ loading: false, error: getErrorMessage(error, "Unable to load devices."), items: [] });
      }
    }
    loadDevices();
    return () => {
      active = false;
    };
  }, [selectedUserId]);

  useEffect(() => {
    if (selectedDeviceId) {
      return;
    }
    if (devices.items.length) {
      setSelectedDeviceId(devices.items[0].device_id);
    }
  }, [devices.items, selectedDeviceId]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setSearchTerm(searchInput.trim());
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    let active = true;
    async function loadSearch() {
      if (!searchTerm) {
        setSearchState({ loading: false, error: "", items: [], limit: 50 });
        return;
      }
      setSearchState((prev) => ({ ...prev, loading: true, error: "" }));
      try {
        const paramsList = new URLSearchParams();
        paramsList.set("q", searchTerm);
        paramsList.set("limit", "50");
        if (selectedUserId) {
          paramsList.set("user_id", String(selectedUserId));
        }
        const data = await apiFetch(`/api/storage/explorer/search?${paramsList.toString()}`);
        if (!active) {
          return;
        }
        setSearchState({ loading: false, error: "", items: data.items || [], limit: data.limit || 50 });
      } catch (error) {
        if (!active) {
          return;
        }
        setSearchState({
          loading: false,
          error: getErrorMessage(error, "Unable to search files."),
          items: [],
          limit: 50
        });
      }
    }
    loadSearch();
    return () => {
      active = false;
    };
  }, [searchTerm, selectedUserId]);

  useEffect(() => {
    let active = true;
    async function loadStorage() {
      try {
        const data = await apiFetch("/api/storage/explorer/status");
        if (!active) {
          return;
        }
        setStorage({
          loading: false,
          error: "",
          total_gb: data.total_allowed_storage_gb || 0,
          used_gb: data.used_storage_gb || 0,
          remaining_gb: data.remaining_storage_gb || 0,
          bandwidth_total_gb: data.total_allowed_bandwidth_gb || 0,
          bandwidth_used_gb: data.used_bandwidth_gb || 0,
          bandwidth_remaining_gb: data.remaining_bandwidth_gb || 0,
          bandwidth_limited: Boolean(data.is_bandwidth_limited),
          addon_slots: Number(data.addon_slots || 0)
        });
        setLimitExceeded(Boolean(data.total_allowed_storage_gb && data.remaining_storage_gb <= 0));
      } catch (error) {
        if (!active) {
          return;
        }
        setStorage({
          loading: false,
          error: getErrorMessage(error, "Unable to load storage usage."),
          total_gb: 0,
          used_gb: 0,
          remaining_gb: 0,
          bandwidth_total_gb: 0,
          bandwidth_used_gb: 0,
          bandwidth_remaining_gb: 0,
          bandwidth_limited: false,
          addon_slots: 0
        });
      }
    }
    loadStorage();
    return () => {
      active = false;
    };
  }, [selectedUserId]);

  useEffect(() => {
    let active = true;
    async function loadRoot() {
      setListState((prev) => ({ ...prev, loading: true, error: "" }));
      try {
        const paramsList = new URLSearchParams();
        paramsList.set("limit", String(PAGE_SIZE));
        paramsList.set("offset", "0");
        if (selectedUserId) {
          paramsList.set("user_id", String(selectedUserId));
        }
        const data = await apiFetch(`/api/storage/explorer/root?${paramsList.toString()}`);
        if (!active) {
          return;
        }
        const rootId = data.folder_id || null;
        let activeFolderId = rootId;
        if (selectedDeviceId && data.items?.length) {
          const match = data.items.find((item) => item.type === "folder" && item.name === selectedDeviceId);
          if (match?.id) {
            activeFolderId = match.id;
          }
        }
        let items = data.items || [];
        if (activeFolderId && activeFolderId !== rootId) {
          const folderData = await apiFetch(`/api/storage/explorer/folder/${activeFolderId}?${paramsList.toString()}`);
          items = folderData.items || [];
        }
        setDeviceRootId(activeFolderId);
        setListState({
          loading: false,
          error: "",
          items,
          folderId: activeFolderId,
          rootId,
          pagination: data.pagination || { limit: PAGE_SIZE, offset: 0, total_folders: 0, total_files: 0 }
        });
        const deviceLabel = selectedDeviceId
          ? (devices.items.find((device) => device.device_id === selectedDeviceId)?.device_name || selectedDeviceId)
          : "Root";
        setPath(activeFolderId ? [{ id: activeFolderId, name: deviceLabel }] : []);
        if (activeFolderId) {
          setTree((prev) => ({
            ...prev,
            [activeFolderId]: items.filter((item) => item.type === "folder")
          }));
          setExpanded(new Set([activeFolderId]));
        }
      } catch (error) {
        if (!active) {
          return;
        }
        setListState({
          ...emptyListState,
          loading: false,
          error: getErrorMessage(error, "Unable to load folders.")
        });
      }
    }
    loadRoot();
    return () => {
      active = false;
    };
  }, [selectedUserId, selectedDeviceId, devices.items]);

  useEffect(() => {
    if (!path.length) {
      return;
    }
    setExpanded((prev) => {
      const next = new Set(prev);
      path.forEach((entry) => {
        if (entry?.id) {
          next.add(entry.id);
        }
      });
      return next;
    });
  }, [path]);

  const totalItems = (listState.pagination?.total_folders || 0) + (listState.pagination?.total_files || 0);
  const hasMore = listState.items.length < totalItems;

  function withUserId(url) {
    if (!selectedUserId) {
      return url;
    }
    const joiner = url.includes("?") ? "&" : "?";
    return `${url}${joiner}user_id=${selectedUserId}`;
  }

  async function reloadCurrentFolder() {
    if (!listState.folderId) {
      return;
    }
    await loadFolder(listState.folderId, { reset: true, pathOverride: path });
  }

  async function loadFolder(folderId, { reset = false, pathOverride = null, offset = 0, append = false } = {}) {
    if (!folderId) {
      return;
    }
    if (reset) {
      setListState((prev) => ({ ...prev, loading: true, error: "", items: append ? prev.items : [] }));
    }
    try {
      const paramsList = new URLSearchParams();
      paramsList.set("limit", String(PAGE_SIZE));
      paramsList.set("offset", String(offset));
      if (selectedUserId) {
        paramsList.set("user_id", String(selectedUserId));
      }
      const data = await apiFetch(`/api/storage/explorer/folder/${folderId}?${paramsList.toString()}`);
      const nextItems = append ? [...listState.items, ...(data.items || [])] : data.items || [];
      setListState({
        loading: false,
        error: "",
        items: nextItems,
        folderId,
        rootId: listState.rootId,
        pagination: data.pagination || listState.pagination
      });
      setTree((prev) => ({
        ...prev,
        [folderId]: (data.items || []).filter((item) => item.type === "folder")
      }));
      if (pathOverride) {
        setPath(pathOverride);
      }
    } catch (error) {
      const code = error?.data?.error || error?.data?.detail;
      if (code === "invalid_folder") {
        await resetToRoot();
        return;
      }
      setListState((prev) => ({
        ...prev,
        loading: false,
        error: getErrorMessage(error, "Unable to load folder.")
      }));
    }
  }

  async function resetToRoot() {
    setSearchInput("");
    setSearchTerm("");
    setSearchState({ loading: false, error: "", items: [], limit: 50 });
    if (!deviceRootId) {
      return;
    }
    const deviceLabel = selectedDeviceId
      ? (devices.items.find((device) => device.device_id === selectedDeviceId)?.device_name || selectedDeviceId)
      : "Root";
    setPath([{ id: deviceRootId, name: deviceLabel }]);
    await loadFolder(deviceRootId, { reset: true, pathOverride: [{ id: deviceRootId, name: deviceLabel }] });
  }

  function openFolder(folder) {
    if (!folder || !folder.id) {
      return;
    }
    setSearchInput("");
    setSearchTerm("");
    setSearchState({ loading: false, error: "", items: [], limit: 50 });
    const index = path.findIndex((entry) => entry.id === folder.id);
    const nextPath = index >= 0
      ? path.slice(0, index + 1)
      : [...path, { id: folder.id, name: folder.name }];
    setPath(nextPath);
    loadFolder(folder.id, { reset: true, pathOverride: nextPath });
  }

  function openBreadcrumb(entry, index) {
    if (!entry?.id) {
      return;
    }
    const nextPath = path.slice(0, index + 1);
    setPath(nextPath);
    loadFolder(entry.id, { reset: true, pathOverride: nextPath });
  }

  function handleUserChange(event) {
    const value = event.target.value;
    setSelectedDeviceId("");
    if (!value) {
      navigate("/");
      return;
    }
    navigate(`/user/${value}`);
  }
  async function handleCreateFolder() {
    const name = window.prompt("Folder name");
    if (!name) {
      return;
    }
    setNotice("");
    try {
      await apiFetch(withUserId("/api/storage/explorer/folders/create"), {
        method: "POST",
        body: JSON.stringify({
          name: name.trim(),
          parent_id: listState.folderId
        })
      });
      await reloadCurrentFolder();
    } catch (error) {
      setNotice(getErrorMessage(error, "Unable to create folder."));
    }
  }

  async function handleRename(item) {
    const name = window.prompt("Rename", item?.name || "");
    if (!name || !item) {
      return;
    }
    setNotice("");
    try {
      if (item.type === "folder") {
        await apiFetch(withUserId(`/api/storage/explorer/folders/${item.id}/rename`), {
          method: "POST",
          body: JSON.stringify({ name: name.trim() })
        });
      } else {
        await apiFetch(withUserId(`/api/storage/explorer/files/${item.id}/rename`), {
          method: "POST",
          body: JSON.stringify({ name: name.trim() })
        });
      }
      await reloadCurrentFolder();
    } catch (error) {
      const code = error?.data?.error;
      if (code === "file_not_found") {
        await reloadCurrentFolder();
      }
      setNotice(getErrorMessage(error, "Unable to rename item."));
    }
  }

  async function handleDelete(item) {
    if (!item) {
      return;
    }
    const ok = await confirm({
      title: "Confirm Delete",
      message: `Delete ${item.type === "folder" ? "folder" : "file"} "${item.name}"?`,
      confirmVariant: "danger"
    });
    if (!ok) {
      return;
    }
    setNotice("");
    try {
      if (item.type === "folder") {
        await apiFetch(withUserId(`/api/storage/explorer/folders/${item.id}/delete`), {
          method: "DELETE"
        });
      } else {
        await apiFetch(withUserId(`/api/storage/explorer/files/${item.id}/delete`), {
          method: "DELETE"
        });
      }
      await reloadCurrentFolder();
      await refreshStorage();
    } catch (error) {
      setNotice(getErrorMessage(error, "Unable to delete item."));
    }
  }

  async function refreshStorage() {
    try {
      const data = await apiFetch("/api/storage/explorer/status");
      setStorage({
        loading: false,
        error: "",
        total_gb: data.total_allowed_storage_gb || 0,
        used_gb: data.used_storage_gb || 0,
        remaining_gb: data.remaining_storage_gb || 0,
        bandwidth_total_gb: data.total_allowed_bandwidth_gb || 0,
        bandwidth_used_gb: data.used_bandwidth_gb || 0,
        bandwidth_remaining_gb: data.remaining_bandwidth_gb || 0,
        bandwidth_limited: Boolean(data.is_bandwidth_limited),
        addon_slots: Number(data.addon_slots || 0)
      });
      setLimitExceeded(Boolean(data.total_allowed_storage_gb && data.remaining_storage_gb <= 0));
    } catch (error) {
      setStorage((prev) => ({
        ...prev,
        loading: false,
        error: getErrorMessage(error, "Unable to load storage usage.")
      }));
    }
  }

  async function handleUpload(event) {
    const files = Array.from(event.target.files || []);
    event.target.value = "";
    if (!files.length) {
      return;
    }
    const queueItems = files.map((file) => ({
      id: `${file.name}-${file.size}-${Date.now()}`,
      name: file.name,
      status: "uploading",
      error: ""
    }));
    setUploadQueue((prev) => [...queueItems, ...prev]);

    for (let i = 0; i < files.length; i += 1) {
      const file = files[i];
      const queueId = queueItems[i].id;
      const formData = new FormData();
      formData.append("file", file);
      if (listState.folderId) {
        formData.append("folder_id", listState.folderId);
      }
      if (selectedUserId) {
        formData.append("user_id", String(selectedUserId));
      }
      try {
        await fetchFormData("/api/storage/explorer/upload", formData);
        setUploadQueue((prev) =>
          prev.map((item) =>
            item.id === queueId ? { ...item, status: "done" } : item
          )
        );
        await reloadCurrentFolder();
        await refreshStorage();
      } catch (error) {
        const code = error?.data?.error;
        setUploadQueue((prev) =>
          prev.map((item) =>
            item.id === queueId
              ? {
                  ...item,
                  status: "error",
                  error: code === "storage_limit_exceeded"
                    ? "Storage limit exceeded."
                    : getErrorMessage(error, "Upload failed.")
                }
              : item
          )
        );
        if (code === "storage_limit_exceeded") {
          setNotice("Storage limit exceeded. Upgrade storage to continue uploading.");
          setLimitExceeded(true);
        }
      }
    }
  }

  function buildDownloadUrl(params = {}) {
    const search = new URLSearchParams();
    if (params.file_id) {
      search.set("file_id", params.file_id);
    }
    if (params.folder_id) {
      search.set("folder_id", params.folder_id);
    }
    if (params.user_id) {
      search.set("user_id", params.user_id);
    }
    if (params.device_id) {
      search.set("device_id", params.device_id);
    }
    return `/api/storage/download/?${search.toString()}`;
  }

  function handleDownload(item) {
    if (!item) {
      return;
    }
    const params = { file_id: item.id };
    if (selectedUserId) {
      params.user_id = selectedUserId;
    }
    window.location.href = buildDownloadUrl(params);
  }

  function handleDownloadFolder(folderId) {
    const params = { folder_id: folderId };
    if (selectedUserId) {
      params.user_id = selectedUserId;
    }
    window.location.href = buildDownloadUrl(params);
  }

  function handleDownloadUser() {
    if (!selectedUserId) {
      return;
    }
    window.location.href = buildDownloadUrl({ user_id: selectedUserId });
  }

  function handleDownloadDevice() {
    if (!selectedDeviceId) {
      return;
    }
    window.location.href = buildDownloadUrl({ device_id: selectedDeviceId });
  }

  function handleMoveClick(item, type) {
    setMoveModal({ open: true, item, type, targetId: deviceRootId || "" });
  }

  function buildFolderOptions() {
    const options = [];
    if (deviceRootId) {
      options.push({ id: deviceRootId, name: selectedDeviceLabel });
    }
    const seen = new Set(options.map((opt) => opt.id));
    Object.values(tree).forEach((children) => {
      (children || []).forEach((child) => {
        if (child?.id && !seen.has(child.id)) {
          seen.add(child.id);
          options.push({ id: child.id, name: child.name });
        }
      });
    });
    return options;
  }

  async function confirmMove() {
    if (!moveModal.item || !moveModal.targetId) {
      setMoveModal({ open: false, item: null, type: "", targetId: "" });
      return;
    }
    setNotice("");
    try {
      if (moveModal.type === "folder") {
        await apiFetch(withUserId(`/api/storage/explorer/folders/${moveModal.item.id}/move`), {
          method: "POST",
          body: JSON.stringify({ parent_id: moveModal.targetId })
        });
      } else {
        await apiFetch(withUserId(`/api/storage/explorer/files/${moveModal.item.id}/move`), {
          method: "POST",
          body: JSON.stringify({ folder_id: moveModal.targetId })
        });
      }
      setMoveModal({ open: false, item: null, type: "", targetId: "" });
      await reloadCurrentFolder();
    } catch (error) {
      setNotice(getErrorMessage(error, "Unable to move item."));
    }
  }

  async function handleLoadMore() {
    const nextOffset = (listState.pagination?.offset || 0) + (listState.pagination?.limit || PAGE_SIZE);
    await loadFolder(listState.folderId, { offset: nextOffset, append: true, reset: true, pathOverride: path });
  }

  function handleSearchResultOpen(item) {
    if (!item?.folder_path || !item.folder_path.length) {
      return;
    }
    const nextPath = item.folder_path.map((entry) => ({ id: entry.id, name: entry.name }));
    const targetId = nextPath[nextPath.length - 1]?.id;
    if (!targetId) {
      return;
    }
    setPath(nextPath);
    setSearchInput("");
    setSearchTerm("");
    setSearchState({ loading: false, error: "", items: [], limit: 50 });
    loadFolder(targetId, { reset: true, pathOverride: nextPath });
  }

  function toggleExpanded(folderId) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(folderId)) {
        next.delete(folderId);
      } else {
        next.add(folderId);
      }
      return next;
    });
  }

  function FolderTreeNode({ nodeId, label, depth }) {
    const children = tree[nodeId] || [];
    const isOpen = expanded.has(nodeId);
    return (
      <div style={{ marginLeft: depth * 12 }}>
        <div className={`storage-tree-item ${path.some((entry) => entry.id === nodeId) ? "active" : ""}`}>
          <button
            type="button"
            className="btn btn-sm btn-outline-light storage-tree-toggle"
            onClick={() => toggleExpanded(nodeId)}
            aria-label={isOpen ? "Collapse" : "Expand"}
          >
            <i className={`bi ${isOpen ? "bi-caret-down" : "bi-caret-right"}`} aria-hidden="true" />
          </button>
          <button
            type="button"
            className="btn btn-sm btn-link text-start storage-tree-label"
            onClick={() => openFolder({ id: nodeId, name: label })}
          >
            {label}
          </button>
        </div>
        {isOpen && children.length ? (
          <div>
            {children.map((child) => (
              <FolderTreeNode key={child.id} nodeId={child.id} label={child.name} depth={depth + 1} />
            ))}
          </div>
        ) : null}
      </div>
    );
  }

  const storagePercent = storage.total_gb
    ? Math.min(100, Math.round((storage.used_gb / storage.total_gb) * 100))
    : 0;

  const folderOptions = useMemo(() => buildFolderOptions(), [tree, deviceRootId, selectedDeviceLabel]);

  return (
    <div className="container-fluid storage-explorer">
      <div className="d-flex align-items-start justify-content-between flex-wrap gap-3">
        <div>
          <h2 className="page-title">Online Storage</h2>
          <div className="text-secondary">Windows-style explorer for your files and folders.</div>
        </div>
        <div className="storage-usage-card">
          {storage.loading ? (
            <div className="text-secondary">Loading storage...</div>
          ) : (
            <>
              <div className="storage-usage-row">
                <div className="storage-usage-col">
                  <div className="small text-secondary">Storage usage</div>
                  <div className="fw-semibold">
                    {formatGb(storage.used_gb)} used / {formatGb(storage.total_gb)}
                  </div>
                  <div className="progress storage-usage-bar">
                    <div
                      className="progress-bar"
                      role="progressbar"
                      style={{ width: `${storagePercent}%` }}
                      aria-valuenow={storagePercent}
                      aria-valuemin="0"
                      aria-valuemax="100"
                    />
                  </div>
                  <div className="small text-secondary">{formatGb(storage.remaining_gb)} remaining</div>
                </div>
                {storage.bandwidth_total_gb || storage.bandwidth_limited ? (
                  <div className="storage-usage-col">
                    <div className="small text-secondary">Bandwidth usage</div>
                    <div className="fw-semibold">
                      {formatGb(storage.bandwidth_used_gb)} used / {formatGb(storage.bandwidth_total_gb)}
                    </div>
                    <div className="small text-secondary">
                      {formatGb(storage.bandwidth_remaining_gb)} remaining
                    </div>
                  </div>
                ) : null}
              </div>
              <div className="storage-usage-meta small text-secondary">
                Add-on slots: <span className="text-light">{storage.addon_slots || 0}</span>
              </div>
            </>
          )}
        </div>
      </div>

      {notice ? <div className="alert alert-warning mt-3">{notice}</div> : null}
      {isReadOnly ? (
        <div className="alert alert-info mt-3 d-flex align-items-center justify-content-between flex-wrap gap-2">
          <div>Read-only mode enabled. Upgrade your plan to resume uploads and sync.</div>
          <button type="button" className="btn btn-primary btn-sm" onClick={() => navigate("/plans")}>
            Upgrade now
          </button>
        </div>
      ) : null}
      {limitExceeded ? (
        <div className="alert alert-info mt-3 d-flex align-items-center justify-content-between flex-wrap gap-2">
          <div>Storage limit reached. Upgrade storage to continue uploading.</div>
          <button type="button" className="btn btn-primary btn-sm" onClick={() => navigate("/plans")}>
            Upgrade storage
          </button>
        </div>
      ) : null}
      {listState.error ? <div className="alert alert-danger mt-3">{listState.error}</div> : null}
      {users.error ? <div className="alert alert-danger mt-3">{users.error}</div> : null}

      <div className="row g-3 mt-1">
        <div className="col-12 col-lg-3">
          <div className="card p-3 h-100">
            <div className="d-flex align-items-center justify-content-between mb-2">
              <h5 className="mb-0">Folder Tree</h5>
              <button type="button" className="btn btn-outline-light btn-sm" onClick={resetToRoot}>
                Root
              </button>
            </div>
            {isOrgAdmin && users.items.length ? (
              <div className="mb-3">
                <label className="form-label">View user</label>
                <select
                  className="form-select"
                  value={selectedUserId || ""}
                  onChange={handleUserChange}
                >
                  <option value="">My Files</option>
                  {users.items.map((user) => (
                    <option key={user.user_id} value={user.user_id}>
                      {user.name || user.email || user.username}
                    </option>
                  ))}
                </select>
                <div className="d-flex gap-2 flex-wrap mt-2">
                  <button
                    type="button"
                    className="btn btn-outline-light btn-sm"
                    onClick={handleDownloadUser}
                    disabled={!selectedUserId}
                  >
                    Download User Files
                  </button>
                </div>
                <label className="form-label mt-3">Device</label>
                <select
                  className="form-select form-select-sm"
                  value={selectedDeviceId}
                  onChange={(event) => setSelectedDeviceId(event.target.value)}
                >
                  <option value="">Select device</option>
                  {devices.items.map((device) => (
                    <option key={device.device_id} value={device.device_id}>
                      {device.device_name || device.device_id}
                    </option>
                  ))}
                </select>
                <div className="d-flex gap-2 flex-wrap mt-2">
                  <button
                    type="button"
                    className="btn btn-outline-light btn-sm"
                    onClick={handleDownloadDevice}
                    disabled={!selectedDeviceId}
                  >
                    Download Device Files
                  </button>
                </div>
              </div>
            ) : null}
            <div className="storage-tree">
              {deviceRootId ? (
                <FolderTreeNode nodeId={deviceRootId} label={selectedDeviceLabel} depth={0} />
              ) : (
                <div className="text-secondary">Loading tree...</div>
              )}
            </div>
          </div>
        </div>

        <div className="col-12 col-lg-9">
          <div className="card p-3">
            <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-3">
              <div>
                <div className="text-secondary small">Current folder</div>
                <div className="fw-semibold">{currentFolderLabel}</div>
              </div>
              <div className="d-flex flex-wrap align-items-center gap-2">
                <label className="btn btn-outline-light btn-sm mb-0">
                  <input type="file" multiple hidden onChange={handleUpload} />
                  <i className="bi bi-upload" aria-hidden="true" /> Upload
                </label>
                <button
                  type="button"
                  className="btn btn-outline-light btn-sm"
                  onClick={() => handleDownloadFolder(listState.folderId || deviceRootId)}
                  disabled={!listState.folderId && !deviceRootId}
                >
                  <i className="bi bi-download" aria-hidden="true" /> Download Folder
                </button>
                <button type="button" className="btn btn-outline-light btn-sm" onClick={handleCreateFolder}>
                  <i className="bi bi-folder-plus" aria-hidden="true" /> New Folder
                </button>
                <div className="input-group input-group-sm storage-search">
                  <span className="input-group-text"><i className="bi bi-search" aria-hidden="true" /></span>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="Search files"
                    value={searchInput}
                    onChange={(event) => setSearchInput(event.target.value)}
                  />
                  {searchInput ? (
                    <button type="button" className="btn btn-outline-secondary" onClick={() => setSearchInput("")}>Clear</button>
                  ) : null}
                </div>
              </div>
            </div>

            <div className="storage-breadcrumb mb-3">
              {path.map((entry, index) => (
                <button
                  key={entry.id}
                  type="button"
                  className="btn btn-link btn-sm"
                  onClick={() => openBreadcrumb(entry, index)}
                >
                  {entry.name}
                </button>
              ))}
            </div>

            {uploadQueue.length ? (
              <div className="card p-2 mb-3 storage-upload-queue">
                <div className="small text-secondary">Upload queue</div>
                {uploadQueue.map((item) => (
                  <div key={item.id} className="d-flex align-items-center justify-content-between">
                    <div className="text-truncate">{item.name}</div>
                    <div className={`small ${item.status === "error" ? "text-danger" : "text-secondary"}`}>
                      {item.status === "uploading" ? "Uploading..." : item.status === "done" ? "Done" : item.error}
                    </div>
                  </div>
                ))}
              </div>
            ) : null}

            {searchTerm ? (
              <div>
                <div className="text-secondary small mb-2">Search results for "{searchTerm}"</div>
                {searchState.loading ? (
                  <div className="text-secondary">Searching...</div>
                ) : searchState.error ? (
                  <div className="alert alert-danger">{searchState.error}</div>
                ) : searchState.items.length ? (
                  <div className="table-responsive">
                    <table className="table table-dark table-hover align-middle mb-0">
                      <thead>
                        <tr>
                          <th>File</th>
                          <th>Path</th>
                          <th>Size</th>
                          <th>Created</th>
                          <th>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {searchState.items.map((item) => (
                          <tr key={item.file_id}>
                            <td>{item.filename}</td>
                            <td className="text-secondary">{(item.folder_path || []).map((entry) => entry.name).join(" / ")}</td>
                            <td>{formatBytes(item.size)}</td>
                            <td>{formatDate(item.created_at)}</td>
                            <td>
                              <div className="d-flex gap-2 flex-wrap">
                                <button
                                  type="button"
                                  className="btn btn-outline-light btn-sm"
                                  onClick={() => handleSearchResultOpen(item)}
                                >
                                  Open
                                </button>
                                <button
                                  type="button"
                                  className="btn btn-outline-light btn-sm"
                                  onClick={() => handleDownload({ id: item.file_id })}
                                >
                                  Download
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="text-secondary">No matching files.</div>
                )}
              </div>
            ) : (
              <div>
                <div className="text-secondary small mb-2">
                  Showing {listState.items.length} of {totalItems} items
                </div>
                <div className="table-responsive">
                  <table className="table table-dark table-hover align-middle mb-0">
                    <thead>
                      <tr>
                        <th>Name</th>
                        <th>Type</th>
                        <th>Size</th>
                        <th>Created</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {listState.loading ? (
                        <tr>
                          <td colSpan={5}>Loading...</td>
                        </tr>
                      ) : listState.items.length ? (
                        listState.items.map((item) => (
                          <tr key={item.id} className="storage-file-row">
                            <td>
                              {item.type === "folder" ? (
                                <button
                                  type="button"
                                  className="btn btn-link text-start"
                                  onClick={() => openFolder(item)}
                                >
                                  <i className="bi bi-folder me-2" aria-hidden="true" />
                                  {item.name}
                                </button>
                              ) : (
                                <div>
                                  <i className="bi bi-file-earmark me-2" aria-hidden="true" />
                                  {item.name}
                                </div>
                              )}
                            </td>
                            <td>{item.type === "folder" ? "Folder" : "File"}</td>
                            <td>{item.type === "file" ? formatBytes(item.size || item.size_bytes) : "-"}</td>
                            <td>{formatDate(item.created_at)}</td>
                            <td>
                              <div className="d-flex gap-2 flex-wrap">
                                {item.type === "file" ? (
                                  <button
                                    type="button"
                                    className="btn btn-outline-light btn-sm"
                                    onClick={() => handleDownload(item)}
                                  >
                                    Download
                                  </button>
                                ) : (
                                  <button
                                    type="button"
                                    className="btn btn-outline-light btn-sm"
                                    onClick={() => handleDownloadFolder(item.id)}
                                  >
                                    Download
                                  </button>
                                )}
                                <button
                                  type="button"
                                  className="btn btn-outline-light btn-sm"
                                  onClick={() => handleRename(item)}
                                >
                                  Rename
                                </button>
                                <button
                                  type="button"
                                  className="btn btn-outline-light btn-sm"
                                  onClick={() => handleMoveClick(item, item.type)}
                                >
                                  Move
                                </button>
                                <button
                                  type="button"
                                  className="btn btn-outline-danger btn-sm"
                                  onClick={() => handleDelete(item)}
                                >
                                  Delete
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={5}>No files or folders yet.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>

                {hasMore ? (
                  <div className="d-flex justify-content-center mt-3">
                    <button type="button" className="btn btn-outline-light btn-sm" onClick={handleLoadMore}>
                      Load more
                    </button>
                  </div>
                ) : null}
              </div>
            )}
          </div>
        </div>
      </div>

      {moveModal.open ? (
        <div className="modal-overlay" onClick={() => setMoveModal({ open: false, item: null, type: "", targetId: "" })}>
          <div className="modal-panel" onClick={(event) => event.stopPropagation()}>
            <h5>Move {moveModal.type === "folder" ? "Folder" : "File"}</h5>
            <div className="text-secondary small mb-3">Select a destination folder.</div>
            <select
              className="form-select"
              value={moveModal.targetId || ""}
              onChange={(event) => setMoveModal((prev) => ({ ...prev, targetId: event.target.value }))}
            >
              {folderOptions.map((option) => (
                <option key={option.id} value={option.id}>{option.name}</option>
              ))}
            </select>
            <div className="d-flex justify-content-end gap-2 mt-3">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setMoveModal({ open: false, item: null, type: "", targetId: "" })}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={confirmMove}
                disabled={!moveModal.targetId}
              >
                Move
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
