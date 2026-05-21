// Bridge between the setup window and the main process. contextIsolation stays
// ON; only this small, explicit surface is exposed to the renderer.

const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("mymeals", {
  getConfig: () => ipcRenderer.invoke("setup:get-config"),
  testConnection: (db) => ipcRenderer.invoke("setup:test-connection", db),
  save: (data) => ipcRenderer.invoke("setup:save", data),
  onProgress: (cb) => {
    const handler = (_e, msg) => cb(msg);
    ipcRenderer.on("setup:progress", handler);
    return () => ipcRenderer.removeListener("setup:progress", handler);
  },
  // Log viewer
  readLogs: () => ipcRenderer.invoke("logs:read"),
  openLogFile: () => ipcRenderer.invoke("logs:open-file"),
  openLogFolder: () => ipcRenderer.invoke("logs:open-folder"),
});
