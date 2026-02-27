const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("bootstrapApi", {
  getProducts: () => ipcRenderer.invoke("bootstrap:get-products"),
  getInstalledProducts: () => ipcRenderer.invoke("bootstrap:get-installed-products"),
  installProduct: (productKey) => ipcRenderer.invoke("bootstrap:install-product", productKey),
  uninstallProduct: (productKey) => ipcRenderer.invoke("bootstrap:uninstall-product", productKey),
  onDownloadProgress: (handler) => {
    const listener = (_event, payload) => handler(payload);
    ipcRenderer.on("bootstrap:download-progress", listener);
    return () => ipcRenderer.removeListener("bootstrap:download-progress", listener);
  },
});
