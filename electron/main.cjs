const { app, BrowserWindow, ipcMain, session, webContents } = require('electron');
const path = require('path');
const isDev = process.env.NODE_ENV !== 'production';

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      webviewTag: true,
      preload: path.join(__dirname, 'preload.cjs'),
    },
    icon: path.join(__dirname, '../client/public/icon.ico')
  });

  if (isDev) {
    // In dev mode, connect to the vite server
    mainWindow.loadURL('http://localhost:3024');
    mainWindow.webContents.openDevTools();
  } else {
    // In production, load the built index.html
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  // Handle permissions for webviews (camera, mic, etc.)
  mainWindow.webContents.session.setPermissionCheckHandler((webContents, permission) => {
    return true;
  });
  mainWindow.webContents.session.setPermissionRequestHandler((webContents, permission, callback) => {
    callback(true);
  });
}

app.whenReady().then(() => {
  // Ensure permissions for all sessions (including partitions)
  session.defaultSession.setPermissionCheckHandler(() => true);
  session.defaultSession.setPermissionRequestHandler((_, __, callback) => callback(true));

  // Handler for partition permissions (created dynamically)
  app.on('session-created', (sess) => {
    sess.setPermissionCheckHandler(() => true);
    sess.setPermissionRequestHandler((_, __, callback) => callback(true));
  });

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// --- IPC Handlers ---

ipcMain.handle('get-app-version', () => app.getVersion());

ipcMain.handle('get-device-id', () => {
    // Placeholder for device ID
    return process.env.COMPUTERNAME || 'unknown-device';
});

ipcMain.handle('open-model-chat', async (event, data) => {
    // Log intent, frontend handles the UI via webview usually
    console.log('Open model chat requested:', data);
    return { status: 'ok' };
});

ipcMain.handle('clear-model-session', async (event, { modelId }) => {
    try {
        const partition = `persist:model_${modelId}`;
        const sess = session.fromPartition(partition);
        await sess.clearStorageData();
        return { status: 'cleared' };
    } catch (error) {
        console.error('Error clearing session:', error);
        return { status: 'error', message: error.message };
    }
});

ipcMain.handle('get-model-cookies', async (event, { modelId }) => {
    try {
        const partition = `persist:model_${modelId}`;
        const sess = session.fromPartition(partition);
        const cookies = await sess.cookies.get({});
        return cookies;
    } catch (error) {
        console.error('Error getting cookies:', error);
        return [];
    }
});

ipcMain.handle('get-model-localstorage', async (event, { modelId }) => {
    try {
        const partition = `persist:model_${modelId}`;
        const targetSession = session.fromPartition(partition);
        
        // Find a webContents that uses this session
        const allContents = webContents.getAllWebContents();
        const targetContent = allContents.find(wc => wc.session === targetSession);

        if (targetContent) {
            const result = await targetContent.executeJavaScript('JSON.stringify(localStorage)');
            return JSON.parse(result);
        }
        return null;
    } catch (error) {
        console.error('Error getting localstorage:', error);
        return null;
    }
});

ipcMain.handle('inject-model-session', async (event, data) => {
    // Implementation placeholder
    return { status: 'not-implemented' };
});

ipcMain.on('resize-window', (event, { width, height }) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.setSize(width, height);
    }
});
