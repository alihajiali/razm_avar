const { app, BrowserWindow, Menu, ipcMain } = require('electron');
const path = require('node:path');
const { installNetworkIPC } = require('./network-ipc.cjs');
const attachNetwork = installNetworkIPC(ipcMain, __dirname);
function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 800,
    minHeight: 600,
    backgroundColor: '#070d11',
    title: 'رزم‌آور · میدان نبرد',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  });
  attachNetwork(win);
  win.loadFile(path.join(__dirname, 'index.html'));
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (event) => event.preventDefault());
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([{ role: 'appMenu' }, { role: 'viewMenu' }, { role: 'windowMenu' }]),
  );
}
app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (!BrowserWindow.getAllWindows().length) createWindow();
  });
});
app.on('before-quit', () => {
  for (const win of BrowserWindow.getAllWindows()) win.close();
});
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
