const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  getDeviceId: () => ipcRenderer.invoke('get-device-id'),
  openModelChat: (data) => ipcRenderer.invoke('open-model-chat', data),
  clearModelSession: (data) => ipcRenderer.invoke('clear-model-session', data),
  getModelCookies: (data) => ipcRenderer.invoke('get-model-cookies', data),
  getModelLocalStorage: (data) => ipcRenderer.invoke('get-model-localstorage', data),
  injectModelSession: (data) => ipcRenderer.invoke('inject-model-session', data),
  onSessionExpired: (callback) => ipcRenderer.on('session-expired', (event, modelId) => callback(modelId)),
  resizeWindow: (width, height) => ipcRenderer.send('resize-window', { width, height }),
});