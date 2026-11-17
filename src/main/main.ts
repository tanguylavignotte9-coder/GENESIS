/** Electron main process: opens the game window. */
import { app, BrowserWindow } from 'electron';
import path from 'node:path';

const WINDOW_WIDTH = 1280;
const WINDOW_HEIGHT = 800;

function createWindow(): void {
  const window = new BrowserWindow({
    width: WINDOW_WIDTH,
    height: WINDOW_HEIGHT,
    title: 'GENESIS',
    backgroundColor: '#0b0d12',
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  void window.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
}

void app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  app.quit();
});
