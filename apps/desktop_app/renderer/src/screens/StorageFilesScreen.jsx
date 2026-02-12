import { useEffect, useMemo, useState } from "react";

const emptyState = {
  loading: true,
  error: "",
  items: [],
  folderId: null,
  path: []
};

const emptyDevices = { loading: true, error: "", items: [] };
const emptyUsers = { loading: true, error: "", items: [] };

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

function sortItems(items) {
  const folders = items.filter((item) => item.type === "folder").sort((a, b) => (a.name || "").localeCompare(b.name || ""));
  const files = items.filter((item) => item.type === "file").sort((a, b) => (a.name || "").localeCompare(b.name || ""));
  return [...folders, ...files];
}

function formatDeviceType(value) {
  if (!value) {
    return "Device";
  }
  const key = String(value).toLowerCase();
  if (key === "pc") return "PC";
  if (key === "laptop") return "Laptop";
  if (key === "mobile") return "Mobile";
  return "Device";
}

export default function StorageFilesScreen({ isAdmin, authUser }) {
  const [state, setState] = useState(emptyState);
  const [users, setUsers] = useState(emptyUsers);
  const [devices, setDevices] = useState(emptyDevices);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [selectedDeviceId, setSelectedDeviceId] = useState("");
  const [deviceInfo, setDeviceInfo] = useState(null);
  const [notice, setNotice] = useState("");
  const [tree, setTree] = useState({});
  const [expanded, setExpanded] = useState(() => new Set());
  const [deviceRootId, setDeviceRootId] = useState(null);

  const deviceLabelMap = useMemo(() => {
    const map = new Map();
    devices.items.forEach((device) => {
      map.set(device.device_id, device.device_name || device.device_id);
    });
    if (deviceInfo?.device_id) {
      map.set(deviceInfo.device_id, deviceInfo.device_name || deviceInfo.device_id);
    }
    return map;
  }, [devices.items, deviceInfo]);

  const currentPath = useMemo(() => {
    if (!state.path.length) {
      return "Root";
    }
    return state.path.map((entry) => entry.name).join(" / ");
  }, [state.path]);

  const breadcrumb = useMemo(() => state.path, [state.path]);

  const currentUserLabel = useMemo(() => {
    if (isAdmin) {
      if (!selectedUserId) {
        return "My Files";
      }
      const match = users.items.find((item) => String(item.user_id) === String(selectedUserId));
      return match?.name || match?.email || match?.username || "User";
    }
    return authUser?.first_name || authUser?.username || authUser?.email || "My Files";
  }, [isAdmin, selectedUserId, users.items, authUser]);

  async function loadRoot(nextUserId = selectedUserId, nextDeviceId = selectedDeviceId) {
    const effectiveUserId = nextUserId || (isAdmin ? authUser?.id : null);
    setState((prev) => ({ ...prev, loading: true, error: "" }));
    try {
      const data = await window.storageApi.getStorageRoot({
        userId: effectiveUserId ? Number(effectiveUserId) : undefined
      });
      const rootId = data.folder_id || null;
      let activeFolderId = rootId;
      const deviceKey = nextDeviceId || "";
      if (deviceKey && data.items?.length) {
        const match = data.items.find((item) => item.type === "folder" && item.name === deviceKey);
        if (match?.id) {
          activeFolderId = match.id;
        }
      }

      let items = data.items || [];
      if (activeFolderId && activeFolderId !== rootId) {
        const deviceFolder = await window.storageApi.getStorageFolder({
          folderId: activeFolderId,
          userId: effectiveUserId ? Number(effectiveUserId) : undefined
        });
        items = deviceFolder.items || [];
      }

      const deviceLabel = deviceKey ? (deviceLabelMap.get(deviceKey) || "Device") : "Root";
      const nextPath = activeFolderId ? [{ id: activeFolderId, name: deviceLabel }] : [];

      setState({
        loading: false,
        error: "",
        items,
        folderId: activeFolderId,
        path: nextPath
      });
      setDeviceRootId(activeFolderId);
      if (activeFolderId) {
        setTree((prev) => ({
          ...prev,
          [activeFolderId]: items.filter((item) => item.type === "folder")
        }));
        setExpanded(new Set([activeFolderId]));
      }
    } catch (error) {
      setState({ loading: false, error: error?.message || "Unable to load files.", items: [], folderId: null, path: [] });
    }
  }

  async function loadFolder(folderId, nextPath, nextUserId = selectedUserId) {
    const effectiveUserId = nextUserId || (isAdmin ? authUser?.id : null);
    setState((prev) => ({ ...prev, loading: true, error: "" }));
    try {
      const data = await window.storageApi.getStorageFolder({
        folderId,
        userId: effectiveUserId ? Number(effectiveUserId) : undefined
      });
      setState({
        loading: false,
        error: "",
        items: data.items || [],
        folderId: data.folder_id || folderId,
        path: nextPath
      });
      setTree((prev) => ({
        ...prev,
        [folderId]: (data.items || []).filter((item) => item.type === "folder")
      }));
      setExpanded((prev) => {
        const next = new Set(prev);
        next.add(folderId);
        return next;
      });
    } catch (error) {
      setState((prev) => ({
        ...prev,
        loading: false,
        error: error?.message || "Unable to load files."
      }));
    }
  }

  async function ensureTreeFolder(folderId, nextUserId = selectedUserId) {
    const effectiveUserId = nextUserId || (isAdmin ? authUser?.id : null);
    if (!folderId || tree[folderId]) {
      return;
    }
    try {
      const data = await window.storageApi.getStorageFolder({
        folderId,
        userId: effectiveUserId ? Number(effectiveUserId) : undefined
      });
      setTree((prev) => ({
        ...prev,
        [folderId]: (data.items || []).filter((item) => item.type === "folder")
      }));
    } catch {
      setTree((prev) => ({ ...prev, [folderId]: [] }));
    }
  }

  async function handleFolderClick(item) {
    if (!item?.id) {
      return;
    }
    const nextPath = [...state.path, { id: item.id, name: item.name || "Folder" }];
    await loadFolder(item.id, nextPath);
  }

  async function handleBack() {
    if (state.path.length <= 1) {
      return;
    }
    const nextPath = state.path.slice(0, -1);
    const nextFolderId = nextPath[nextPath.length - 1]?.id;
    if (!nextFolderId) {
      await loadRoot();
      return;
    }
    await loadFolder(nextFolderId, nextPath);
  }

  async function handleRefresh() {
    if (!state.folderId) {
      await loadRoot();
      return;
    }
    await loadFolder(state.folderId, state.path);
  }

  useEffect(() => {
    let active = true;
    async function loadDeviceInfo() {
      try {
        const data = await window.storageApi.getDeviceInfo();
        if (!active) {
          return;
        }
        setDeviceInfo(data || null);
      } catch {
        if (!active) {
          return;
        }
        setDeviceInfo(null);
      }
    }
    loadDeviceInfo();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    async function loadUsers() {
      if (!isAdmin) {
        setUsers({ loading: false, error: "", items: [] });
        return;
      }
      try {
        const data = await window.storageApi.getStorageUsers();
        if (!active) {
          return;
        }
        setUsers({ loading: false, error: "", items: data.items || [] });
      } catch (error) {
        if (!active) {
          return;
        }
        setUsers({ loading: false, error: error?.message || "Unable to load users.", items: [] });
      }
    }
    loadUsers();
    return () => {
      active = false;
    };
  }, [isAdmin]);

  useEffect(() => {
    let active = true;
    async function loadDevices() {
      const allowFallback = !isAdmin || !selectedUserId;
      try {
        const effectiveUserId = selectedUserId || (isAdmin ? authUser?.id : null);
        const data = await window.storageApi.getStorageDevices({
          userId: effectiveUserId ? Number(effectiveUserId) : undefined
        });
        if (!active) {
          return;
        }
        const items = data.items || [];
        if (!items.length && allowFallback && deviceInfo?.device_id) {
          setDevices({
            loading: false,
            error: "",
            items: [
              {
                device_id: deviceInfo.device_id,
                device_name: deviceInfo.device_name || deviceInfo.device_id,
                user_id: authUser?.id || null
              }
            ]
          });
          return;
        }
        setDevices({ loading: false, error: "", items });
      } catch (error) {
        if (!active) {
          return;
        }
        if (allowFallback && deviceInfo?.device_id) {
          setDevices({
            loading: false,
            error: "",
            items: [
              {
                device_id: deviceInfo.device_id,
                device_name: deviceInfo.device_name || deviceInfo.device_id,
                user_id: authUser?.id || null
              }
            ]
          });
          return;
        }
        setDevices({ loading: false, error: error?.message || "Unable to load devices.", items: [] });
      }
    }
    loadDevices();
    return () => {
      active = false;
    };
  }, [selectedUserId, deviceInfo, authUser]);

  useEffect(() => {
    if (selectedDeviceId) {
      return;
    }
    if (devices.items.length) {
      if (deviceInfo?.device_id) {
        const match = devices.items.find((device) => device.device_id === deviceInfo.device_id);
        if (match) {
          setSelectedDeviceId(match.device_id);
          return;
        }
      }
      setSelectedDeviceId(devices.items[0].device_id);
    }
  }, [devices.items, selectedDeviceId, deviceInfo]);

  useEffect(() => {
    loadRoot(selectedUserId, selectedDeviceId);
  }, [selectedUserId, selectedDeviceId]);

  const sortedItems = useMemo(() => sortItems(state.items), [state.items]);
  const folderCount = state.items.filter((item) => item.type === "folder").length;
  const fileCount = state.items.filter((item) => item.type === "file").length;

  async function handleBreadcrumbClick(index) {
    if (index < 0) {
      await loadRoot();
      return;
    }
    const targetPath = breadcrumb.slice(0, index + 1);
    const targetId = targetPath[targetPath.length - 1]?.id;
    if (!targetId) {
      await loadRoot();
      return;
    }
    await loadFolder(targetId, targetPath);
  }

  function TreeNode({ nodeId, label, depth }) {
    const children = tree[nodeId] || [];
    const isOpen = expanded.has(nodeId);
    const hasChildren = children.length > 0;
    return (
      <div className="tree-node" style={{ paddingLeft: `${depth * 14}px` }}>
        <div className="tree-row">
          <button
            type="button"
            className="tree-toggle"
            onClick={async () => {
              if (!isOpen) {
                await ensureTreeFolder(nodeId);
              }
              setExpanded((prev) => {
                const next = new Set(prev);
                if (next.has(nodeId)) {
                  next.delete(nodeId);
                } else {
                  next.add(nodeId);
                }
                return next;
              });
            }}
          >
            {hasChildren ? (isOpen ? "−" : "+") : "•"}
          </button>
          <button
            type="button"
            className={`tree-label ${state.path.some((entry) => entry.id === nodeId) ? "active" : ""}`}
            onClick={() => {
              const index = state.path.findIndex((entry) => entry.id === nodeId);
              const targetPath = index >= 0 ? state.path.slice(0, index + 1) : [...state.path, { id: nodeId, name: label }];
              loadFolder(nodeId, targetPath);
            }}
          >
            {label}
          </button>
        </div>
        {isOpen && children.length ? (
          <div>
            {children.map((child) => (
              <TreeNode key={child.id} nodeId={child.id} label={child.name} depth={depth + 1} />
            ))}
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className="screen">
      <div className="screen-header">
        <h2>File Storage</h2>
        <p className="text-muted">Browse files stored in Work Zilla Online Storage.</p>
      </div>
      {notice ? <div className="alert alert-info">{notice}</div> : null}
      {state.error ? <div className="alert alert-danger">{state.error}</div> : null}

      <div className="explorer-shell">
        <div className="explorer-tree">
          <div className="tree-section">
            <div className="tree-title">{currentUserLabel}</div>
            {isAdmin ? (
              <select
                value={selectedUserId}
                onChange={(event) => {
                  setSelectedUserId(event.target.value);
                  setSelectedDeviceId("");
                }}
                disabled={users.loading}
              >
                <option value="">My Files</option>
                {users.items.map((user) => (
                  <option key={user.user_id} value={user.user_id}>
                    {user.name || user.email || `User ${user.user_id}`}
                  </option>
                ))}
              </select>
            ) : null}
          </div>

          <div className="tree-section">
            <div className="tree-title">Devices</div>
            {devices.loading ? (
              <div className="text-muted">Loading devices...</div>
            ) : devices.items.length ? (
              <div className="tree-device-list">
                {devices.items.map((device) => (
                  <button
                    key={device.device_id}
                    type="button"
                    className={`tree-device ${selectedDeviceId === device.device_id ? "active" : ""}`}
                    onClick={() => setSelectedDeviceId(device.device_id)}
                  >
                    <span className="tree-device-name">{device.device_name || device.device_id}</span>
                    <span className="tree-device-tag">{formatDeviceType(device.device_type)}</span>
                  </button>
                ))}
              </div>
            ) : (
              <div className="text-muted">No devices found.</div>
            )}
          </div>

          <div className="tree-section">
            <div className="tree-title">Folders</div>
            {deviceRootId ? (
              <TreeNode
                nodeId={deviceRootId}
                label={deviceLabelMap.get(selectedDeviceId) || "Root"}
                depth={0}
              />
            ) : (
              <div className="text-muted">Loading tree...</div>
            )}
          </div>
        </div>

        <div className="explorer-main">
          <div className="card">
            <div className="row">
              <div>
                <div className="list-title">File Storage</div>
                <div className="list-subtitle">Browse and manage cloud folders.</div>
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
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={async () => {
                    if (!state.folderId) {
                      return;
                    }
                    try {
                      const result = await window.storageApi.downloadFile({
                        folderId: state.folderId,
                        userId: selectedUserId ? Number(selectedUserId) : undefined
                      });
                      if (result?.path) {
                        setNotice(`Downloaded to ${result.path}`);
                      }
                    } catch (error) {
                      setNotice(error?.message || "Download failed.");
                    }
                  }}
                >
                  Download Folder
                </button>
              </div>
            </div>
          </div>

          <div className="card explorer-list-panel">
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
              <div className="text-muted">Loading files...</div>
            ) : sortedItems.length ? (
              <div className="table-wrap">
                <table className="table-ui">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Type</th>
                      <th>Size</th>
                      <th>Modified</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedItems.map((item) => (
                      <tr key={`${item.type}-${item.id}`}>
                        <td>
                          {item.type === "folder" ? "📁" : "📄"} {item.name || "-"}
                        </td>
                        <td>{item.type === "folder" ? "Folder" : "File"}</td>
                        <td>{item.type === "file" ? formatBytes(item.size) : "-"}</td>
                        <td>{formatDate(item.created_at)}</td>
                        <td>
                          {item.type === "folder" ? (
                            <button type="button" className="btn btn-secondary" onClick={() => handleFolderClick(item)}>
                              Open
                            </button>
                          ) : (
                            <button
                              type="button"
                              className="btn btn-secondary"
                              onClick={async () => {
                                try {
                                  const result = await window.storageApi.downloadFile({
                                    fileId: item.id,
                                    filename: item.name,
                                    userId: selectedUserId ? Number(selectedUserId) : undefined
                                  });
                                  if (result?.path) {
                                    setNotice(`Downloaded to ${result.path}`);
                                  }
                                } catch (error) {
                                  setNotice(error?.message || "Download failed.");
                                }
                              }}
                            >
                              Download
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="text-muted">No files found.</div>
            )}
            <div className="file-status-bar">
              <span>Location: {currentPath}</span>
              <span>{folderCount + fileCount} items</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
