const { contextBridge } = require('electron');

// Future IPC bridges (ipcRenderer.invoke wrappers) go here.
contextBridge.exposeInMainWorld('mindmapAPI', {
  version: '0.1.0',
});
